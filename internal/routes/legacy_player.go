package routes

import (
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	modelsv1 "github.com/ClashKingInc/ClashKingAPI/internal/models/v1"
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

// legacyPlayerStats godoc
// @Summary Get player stats
// @Description Returns tracked aggregate stats for a player.
// @Tags Legacy Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Success 200 {object} modelsv1.PlayerStatsResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func legacyPlayerStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		if tag == "" {
			return apptypes.Error(http.StatusBadRequest, "player_tag is required")
		}
		result, err := v1PlayerCurrent(c, a, tag)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "No player found")
		}
		legends := cloneMap(result["legends"])
		delete(legends, "streak")
		out := modelsv1.PlayerStatsResponse{
			Name:       result["name"],
			Tag:        result["tag"],
			Townhall:   result["townhall"],
			Legends:    legends,
			LastOnline: result["last_online"],
			Looted: modelsv1.PlayerLootedData{
				Gold: result["gold"], Elixir: result["elixir"], DarkElixir: result["dark_elixir"],
			},
			Trophies:                 result["trophies"],
			WarStars:                 result["warStars"],
			ClanCapitalContributions: result["aggressive_capitalism"],
			Donations:                result["donations"],
			Capital:                  result["capital_gold"],
			ClanGames:                result["clan_games"],
			SeasonPass:               result["season_pass"],
			AttackWins:               result["attack_wins"],
			Activity:                 result["activity"],
			ClanTag:                  result["clan_tag"],
			League:                   result["league"],
			Location:                 result["country_name"],
		}
		return apptypes.JSON(c, http.StatusOK, out)
	}
}

// playerLegends godoc
// @Summary Get player legends data
// @Description Returns tracked legend league data for a player.
// @Tags Legacy Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param season query string false "Season YYYY-MM"
// @Success 200 {object} modelsv1.PlayerLegendsResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func playerLegends(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		season := c.Query("season")
		result, err := v1PlayerCurrent(c, a, tag)
		if err != nil {
			return apptypes.Error(http.StatusNotFound, "No player found")
		}
		legendData := cloneMap(result["legends"])
		if season != "" && len(legendData) > 0 {
			legendData = filterLegendsBySeason(legendData, season)
		}
		delete(legendData, "global_rank")
		delete(legendData, "local_rank")
		streak := legendData["streak"]
		delete(legendData, "streak")
		rankings := map[string]any{
			"country_code": result["country_code"],
			"country_name": result["country_name"],
			"local_rank":   result["local_rank"],
			"global_rank":  result["global_rank"],
		}
		return apptypes.JSON(c, http.StatusOK, modelsv1.PlayerLegendsResponse{
			Name: result["name"], Tag: result["tag"], Townhall: result["townhall"], Legends: legendData, Rankings: rankings, Streak: streak,
		})
	}
}

func filterLegendsBySeason(legends map[string]any, season string) map[string]any {
	parts := strings.SplitN(season, "-", 2)
	if len(parts) != 2 {
		return legends
	}
	var yearInt, monthInt int
	parseYearMonth(parts[0], parts[1], &yearInt, &monthInt)
	prevMonth := monthInt - 1
	prevYear := yearInt
	if prevMonth == 0 {
		prevMonth = 12
		prevYear--
	}
	start := time.Date(prevYear, time.Month(prevMonth), 1, 5, 0, 0, 0, time.UTC)
	end := time.Date(yearInt, time.Month(monthInt), 1, 5, 0, 0, 0, time.UTC)
	filtered := map[string]any{}
	for d := start; d.Before(end); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		if v, ok := legends[key]; ok {
			filtered[key] = v
		}
	}
	return filtered
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

// playerHistorical godoc
// @Summary Get player historical events
// @Description Returns player history events grouped by event type for a season.
// @Tags Legacy Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param season path string true "Season YYYY-MM"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func playerHistorical(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		start, end, err := seasonBounds(c.Params("season"))
		if err != nil {
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT event_time, event_type, clan_tag, season, value, data
			FROM player_history_events
			WHERE player_tag = $1 AND event_time >= $2 AND event_time <= $3
			ORDER BY event_time
		`, tag, start, end)
		if err != nil {
			return err
		}
		defer rows.Close()
		breakdown := map[string][]map[string]any{}
		for rows.Next() {
			var eventTime time.Time
			var eventType, clanTag, season string
			var value pgtype.Int4
			var raw []byte
			if err := rows.Scan(&eventTime, &eventType, &clanTag, &season, &value, &raw); err != nil {
				return err
			}
			doc := jsonObject(raw)
			doc["time"] = eventTime
			doc["tag"] = tag
			doc["clan"] = clanTag
			doc["season"] = season
			doc["type"] = eventType
			if value.Valid {
				doc["value"] = value.Int32
			}
			breakdown[eventType] = append(breakdown[eventType], doc)
		}
		return apptypes.JSON(c, http.StatusOK, breakdown)
	}
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

// playerRaids godoc
// @Summary Get player raid weekends
// @Description Returns recent raid weekend documents containing a player.
// @Tags Legacy Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param limit query int false "Maximum number of raid weekends"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} modelsv2.ErrorResponse
func playerRaids(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		limit := queryInt(c, "limit", 1)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT rw.data
			FROM capital_raid_members m
			JOIN raid_weekends rw ON rw.clan_tag = m.clan_tag AND rw.start_time = m.start_time
			WHERE m.player_tag = $1
			ORDER BY rw.end_time DESC
			LIMIT $2
		`, tag, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []any{}
		for rows.Next() {
			var raw []byte
			if err := rows.Scan(&raw); err != nil {
				return err
			}
			items = append(items, jsonObject(raw))
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// playerLegendRankings godoc
// @Summary Get player legend ranking history
// @Description Returns stored end-of-season legend ranking snapshots for a player.
// @Tags Legacy Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param limit query int false "Maximum number of snapshots"
// @Success 200 {array} map[string]interface{}
// @Failure 500 {object} modelsv2.ErrorResponse
func playerLegendRankings(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := fixTag(c.Params("player_tag"))
		limit := queryInt(c, "limit", 10)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT season, player_tag, rank, trophies, data
			FROM legend_history_snapshots
			WHERE player_tag = $1
			ORDER BY season DESC
			LIMIT $2
		`, tag, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		return apptypes.JSON(c, http.StatusOK, scanLegendHistory(rows))
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

// playerSearchByName godoc
// @Summary Search players by name
// @Description Returns basic tracked player search results by name.
// @Tags Legacy Player
// @Produce json
// @Param name path string true "Player name search"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} modelsv2.ErrorResponse
func playerSearchByName(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT player_tag, name, townhall_level
			FROM player_current_stats
			WHERE name ILIKE '%' || $1 || '%'
			ORDER BY name
			LIMIT 25
		`, c.Params("name"))
		if err != nil {
			return err
		}
		defer rows.Close()
		results := []map[string]any{}
		for rows.Next() {
			var tag, name string
			var townhall pgtype.Int4
			if err := rows.Scan(&tag, &name, &townhall); err != nil {
				return err
			}
			item := map[string]any{"tag": tag, "name": name}
			if townhall.Valid {
				item["townhall"] = townhall.Int32
			}
			results = append(results, item)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": results})
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

func v1PlayerCurrent(c *fiber.Ctx, a apptypes.Deps, tag string) (map[string]any, error) {
	var name string
	var clanTag pgtype.Text
	var townhall pgtype.Int4
	var lastOnline pgtype.Timestamptz
	var legendsRaw, donationsRaw, activityRaw, dataRaw []byte
	var countryCode, countryName pgtype.Text
	var globalRank, localRank pgtype.Int4
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT p.name, p.clan_tag, p.townhall_level, p.last_online_at, p.legends, p.donations, p.activity, p.data,
			r.country_code, r.country_name, r.global_rank, r.local_rank
		FROM player_current_stats p
		LEFT JOIN player_rankings_current r ON r.player_tag = p.player_tag
		WHERE p.player_tag = $1
	`, tag).Scan(&name, &clanTag, &townhall, &lastOnline, &legendsRaw, &donationsRaw, &activityRaw, &dataRaw, &countryCode, &countryName, &globalRank, &localRank)
	if err != nil {
		return nil, err
	}
	item := jsonObject(dataRaw)
	item["tag"] = tag
	item["name"] = name
	if clanTag.Valid {
		item["clan_tag"] = clanTag.String
	}
	if townhall.Valid {
		item["townhall"] = townhall.Int32
	}
	if lastOnline.Valid {
		item["last_online"] = lastOnline.Time
	}
	item["legends"] = jsonObject(legendsRaw)
	item["donations"] = jsonObject(donationsRaw)
	item["activity"] = jsonObject(activityRaw)
	if countryCode.Valid {
		item["country_code"] = countryCode.String
	}
	if countryName.Valid {
		item["country_name"] = countryName.String
	}
	if globalRank.Valid {
		item["global_rank"] = globalRank.Int32
	}
	if localRank.Valid {
		item["local_rank"] = localRank.Int32
	}
	return item, nil
}

func v1CurrentWarTimer(c *fiber.Ctx, a apptypes.Deps, tag string) (map[string]any, error) {
	var warID, clanTag, opponentTag string
	var endTime time.Time
	var raw []byte
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT war_id, clan_tag, opponent_tag, end_time, data
		FROM current_war_timers
		WHERE player_tag = $1
	`, tag).Scan(&warID, &clanTag, &opponentTag, &endTime, &raw)
	if err != nil {
		return nil, err
	}
	result := jsonObject(raw)
	result["tag"] = tag
	result["war_id"] = warID
	result["clan"] = clanTag
	result["opponent"] = opponentTag
	result["unix_time"] = endTime.Unix()
	result["time"] = endTime.UTC().Format(time.RFC3339)
	return result, nil
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
