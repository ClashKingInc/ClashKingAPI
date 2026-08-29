package routes

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
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
