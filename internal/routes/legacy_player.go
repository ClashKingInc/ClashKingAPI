package routes

import (
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

var v1PlayerTagRe = regexp.MustCompile(`[^A-Z0-9]+`)

func fixTag(tag string) string {
	tag = decodeRouteTag(tag)
	tag = strings.ToUpper(strings.TrimSpace(tag))
	tag = strings.TrimPrefix(tag, "#")
	tag = v1PlayerTagRe.ReplaceAllString(tag, "")
	tag = strings.ReplaceAll(tag, "O", "0")
	if tag == "" {
		return ""
	}
	return "#" + tag
}

func parseYearMonth(yearStr, monthStr string, year, month *int) (bool, error) {
	*year = 0
	for _, ch := range yearStr {
		if ch < '0' || ch > '9' {
			return false, nil
		}
		*year = *year*10 + int(ch-'0')
	}
	*month = 0
	for _, ch := range monthStr {
		if ch < '0' || ch > '9' {
			return false, nil
		}
		*month = *month*10 + int(ch-'0')
	}
	return true, nil
}

// legacyPlayerWarhits godoc
// @Summary Get player war hits
// @Description Returns recent war attacks and defenses for a player.
// @Tags Legacy Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param timestamp_start query int false "Start Unix timestamp"
// @Param timestamp_end query int false "End Unix timestamp"
// @Param limit query int false "Maximum number of rows"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} modelsv2.ErrorResponse
func legacyPlayerWarhits(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return playerWarAttacks(a)(c)
	}
}

// playerWartimer godoc
// @Summary Get player war timer
// @Description Returns current war timer data for a player when available.
// @Tags Legacy Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Success 200 {object} map[string]interface{}
func playerWartimer(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		result, err := v1CurrentWarTimer(c, a, fixTag(c.Params("player_tag")))
		if err != nil {
			return apptypes.JSON(c, http.StatusOK, nil)
		}
		return apptypes.JSON(c, http.StatusOK, result)
	}
}

// legacyPlayerJoinLeave godoc
// @Summary Get player join-leave history
// @Description Returns tracked join and leave events for a player.
// @Tags Legacy Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param timestamp_start query int false "Start Unix timestamp"
// @Param time_stamp_end query int false "End Unix timestamp"
// @Param limit query int false "Maximum number of rows"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} modelsv2.ErrorResponse
func legacyPlayerJoinLeave(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		start := time.Unix(queryInt64(c, "timestamp_start", 0), 0).UTC()
		end := time.Unix(queryInt64(c, "time_stamp_end", 9999999999), 0).UTC()
		limit := queryInt(c, "limit", 250)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT jl."time", jl."type", jl.clan_tag, jl.player_tag, jl.player_name, jl.townhall_level,
				bc.name AS clan_name
			FROM join_leave_history jl
			LEFT JOIN basic_clan bc ON bc.tag = jl.clan_tag
			WHERE jl.player_tag = $1 AND jl."time" >= $2 AND jl."time" <= $3
			ORDER BY jl."time" DESC
			LIMIT $4
		`, tag, start, end, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var eventTime time.Time
			var eventType, clanTag, playerTag string
			var playerName, clanName pgtype.Text
			var townhall int16
			if err := rows.Scan(&eventTime, &eventType, &clanTag, &playerTag, &playerName, &townhall, &clanName); err != nil {
				return err
			}
			item := map[string]any{}
			item["time"] = eventTime
			item["type"] = eventType
			item["clan"] = clanTag
			item["tag"] = playerTag
			item["th"] = townhall
			if playerName.Valid {
				item["name"] = playerName.String
			}
			if clanName.Valid {
				item["clan_name"] = clanName.String
			}
			items = append(items, item)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

func queryInt(c *fiber.Ctx, key string, def int) int {
	raw := c.Query(key)
	if raw == "" {
		return def
	}
	v := 0
	for _, ch := range raw {
		if ch < '0' || ch > '9' {
			return def
		}
		v = v*10 + int(ch-'0')
	}
	return v
}

func queryInt64(c *fiber.Ctx, key string, def int64) int64 {
	raw := c.Query(key)
	if raw == "" {
		return def
	}
	v := int64(0)
	for _, ch := range raw {
		if ch < '0' || ch > '9' {
			return def
		}
		v = v*10 + int64(ch-'0')
	}
	return v
}

func sortedJoin(a, b string) string {
	if a < b {
		return a + "-" + b
	}
	return b + "-" + a
}

func sortWarsByEndTime(wars []map[string]any) {
	sort.SliceStable(wars, func(i, j int) bool {
		return stringValue(wars[i]["endTime"]) > stringValue(wars[j]["endTime"])
	})
}

const currentWarTimerQuery = `
	SELECT schedule.war_id, schedule.source_clan_tag, schedule.opponent_tag, timer.expires_at
	FROM player_timers timer
	JOIN war_schedule schedule ON schedule.schedule_key = timer.event_key
	WHERE timer.player_tag = $1
	  AND timer.event_type = 'war'
	  AND timer.expires_at > now()
	ORDER BY timer.expires_at
	LIMIT 1
`

type currentWarTimerScanner interface {
	Scan(dest ...any) error
}

func v1CurrentWarTimer(c *fiber.Ctx, a apptypes.Deps, tag string) (map[string]any, error) {
	return currentWarTimerResponse(a.Store.SQL.QueryRow(
		c.UserContext(),
		currentWarTimerQuery,
		tag,
	), tag)
}

func currentWarTimerResponse(row currentWarTimerScanner, tag string) (map[string]any, error) {
	var warID, clanTag, opponentTag string
	var endTime time.Time
	if err := row.Scan(&warID, &clanTag, &opponentTag, &endTime); err != nil {
		return nil, err
	}
	return map[string]any{
		"tag":       tag,
		"war_id":    warID,
		"clan":      clanTag,
		"opponent":  opponentTag,
		"unix_time": endTime.Unix(),
		"time":      endTime.UTC().Format(time.RFC3339),
	}, nil
}

func scanWarAttackRow(row interface{ Scan(dest ...any) error }, playerTag string) (map[string]any, error) {
	var warID, warType, attackingClan, defendingClan, attacker, defender string
	var warEnd time.Time
	var warSize int
	var attackerTH, defenderTH int16
	var stars, destruction int16
	var duration, order int
	if err := row.Scan(&warID, &warEnd, &warType, &warSize, &attackingClan, &defendingClan, &attacker, &defender, &attackerTH, &defenderTH, &stars, &destruction, &duration, &order); err != nil {
		return nil, err
	}
	attack := map[string]any{
		"war_id": warID, "war_end_time": warEnd, "war_type": warType, "war_size": warSize,
		"attackerTag": attacker, "defenderTag": defender, "stars": stars,
		"destructionPercentage": destruction, "duration": duration, "order": order,
	}
	item := map[string]any{
		"war_data": map[string]any{
			"war_id": warID, "endTime": warEnd, "type": warType, "teamSize": warSize,
			"clan": map[string]any{"tag": attackingClan}, "opponent": map[string]any{"tag": defendingClan},
		},
		"member_data": map[string]any{"tag": playerTag},
		"attacks":     []map[string]any{},
		"defenses":    []map[string]any{},
	}
	if attacker == playerTag {
		item["attacks"] = []map[string]any{attack}
	}
	if defender == playerTag {
		item["defenses"] = []map[string]any{attack}
	}
	return item, nil
}

func seasonBounds(season string) (time.Time, time.Time, error) {
	parts := strings.SplitN(season, "-", 2)
	if len(parts) != 2 {
		return time.Time{}, time.Time{}, apptypes.Error(http.StatusBadRequest, "invalid season format")
	}
	var yearInt, monthInt int
	parseYearMonth(parts[0], parts[1], &yearInt, &monthInt)
	prevMonth := monthInt - 1
	prevYear := yearInt
	if prevMonth == 0 {
		prevMonth = 12
		prevYear--
	}
	return time.Date(prevYear, time.Month(prevMonth), 1, 5, 0, 0, 0, time.UTC), time.Date(yearInt, time.Month(monthInt), 1, 5, 0, 0, 0, time.UTC), nil
}
