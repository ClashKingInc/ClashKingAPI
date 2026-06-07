package v2

import (
	"encoding/json"
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// playerStats godoc
// @Summary Get capital player statistics
// @Description Returns raid weekend player rows for the requested guild and clan tags.
// @Tags Capital Raids
// @Produce json
// @Param guild_id query int true "Discord guild ID"
// @Param clan_tags query []string false "Clan tags (defaults to all guild clans)"
// @Param season query string false "Season filter (YYYY-MM)"
// @Param limit query int false "Maximum number of rows"
// @Param offset query int false "Number of rows to skip"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/capital/player-stats [get]
func playerStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		clanTags := capitalFixTags(apptypes.QueryValues(c, "clan_tags"))
		season := c.Query("season")
		limit := capitalParseIntDefault(c.Query("limit"), 100)
		offset := capitalParseIntDefault(c.Query("offset"), 0)
		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}

		if err := capitalEnsureServer(c, a, guildID); err != nil {
			return apptypes.Error(fiber.StatusNotFound, "Server not found")
		}

		clanNameMap, clanTags, err := capitalGuildClanNames(c, a, guildID, clanTags)
		if err != nil {
			return err
		}

		if len(clanTags) == 0 {
			return apptypes.JSON(c, fiber.StatusOK, modelsv2.CapitalPlayerStatsResponse{
				Season: season, Players: []modelsv2.CapitalPlayerItem{}, Limit: limit, Offset: offset,
			})
		}

		totalCount, err := capitalPlayerCount(c, a, clanTags, season)
		if err != nil {
			return err
		}

		aggResults, err := capitalPlayerRows(c, a, clanTags, season, limit, offset)
		if err != nil {
			return err
		}

		rows := make([]modelsv2.CapitalPlayerItem, 0, len(aggResults))
		for _, result := range aggResults {
			pTag := capitalAsString(result["_id"])
			pName := capitalAsString(result["player_name"])
			ct := capitalAsString(result["clan_tag"])
			totalAttacks := capitalAsInt(result["total_attacks"])
			totalGold := capitalAsInt64(result["total_capital_gold_looted"])

			attacks := make([]modelsv2.RaidAttack, 0)
			totalDestruction := 0.0
			for _, atk := range capitalAttackRows(result["attack_logs"]) {
				d := capitalAsFloat64(atk["destructionPercent"])
				totalDestruction += d
				attacks = append(attacks, modelsv2.RaidAttack{
					AttackerTag:  pTag,
					AttackerName: pName,
					DefenderTag:  capitalAsString(atk["defenderTag"]),
					DefenderName: capitalAsString(atk["defenderName"]),
					Destruction:  d,
					Stars:        capitalAsInt(atk["stars"]),
				})
			}
			avgDestruction := 0.0
			if len(attacks) > 0 {
				avgDestruction = totalDestruction / float64(len(attacks))
			}
			rows = append(rows, modelsv2.CapitalPlayerItem{
				PlayerTag:              pTag,
				PlayerName:             pName,
				ClanTag:                ct,
				ClanName:               clanNameMap[ct],
				TotalAttacks:           totalAttacks,
				TotalCapitalGoldLooted: totalGold,
				TotalDestruction:       totalDestruction,
				AverageDestruction:     avgDestruction,
				Attacks:                attacks,
			})
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.CapitalPlayerStatsResponse{
			Season:     season,
			Players:    rows,
			TotalCount: totalCount,
			Limit:      limit,
			Offset:     offset,
		})
	}
}

// guildLeaderboard godoc
// @Summary Get capital guild leaderboard
// @Description Returns a capital leaderboard for all clans attached to the requested guild.
// @Tags Capital Raids
// @Produce json
// @Param guild_id query int true "Discord guild ID"
// @Param season query string false "Season filter (YYYY-MM)"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/capital/guild-leaderboard [get]
func guildLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		season := c.Query("season")
		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}

		if err := capitalEnsureServer(c, a, guildID); err != nil {
			return apptypes.Error(fiber.StatusNotFound, "Server not found")
		}

		clanNameMap, clanTags, err := capitalGuildClanNames(c, a, guildID, nil)
		if err != nil {
			return err
		}
		if len(clanTags) == 0 {
			return apptypes.JSON(c, fiber.StatusOK, modelsv2.CapitalLeaderboardResponse{
				GuildID: guildID, Season: season, Clans: []modelsv2.CapitalClanLeaderboardItem{}, TotalCount: 0,
			})
		}

		aggResults, err := capitalClanRows(c, a, clanTags, season)
		if err != nil {
			return err
		}

		clanItems := make([]modelsv2.CapitalClanLeaderboardItem, 0, len(aggResults))
		for _, result := range aggResults {
			clanTag := capitalAsString(result["_id"])
			totalRaids := capitalAsInt(result["total_raids"])
			totalGold := capitalAsInt64(result["total_capital_gold_looted"])
			totalMedals := capitalAsInt64(result["total_raid_medals"])
			totalAttacks := capitalAsInt(result["total_attacks"])
			totalDestruction := capitalAsFloat64(result["total_destruction"])

			avgGold, avgMedals, avgDestruction := 0.0, 0.0, 0.0
			if totalRaids > 0 {
				avgGold = float64(totalGold) / float64(totalRaids)
				avgMedals = float64(totalMedals) / float64(totalRaids)
			}
			if totalAttacks > 0 {
				avgDestruction = totalDestruction / float64(totalAttacks)
			}
			clanItems = append(clanItems, modelsv2.CapitalClanLeaderboardItem{
				ClanTag:                   clanTag,
				ClanName:                  clanNameMap[clanTag],
				TotalRaids:                totalRaids,
				TotalCapitalGoldLooted:    totalGold,
				TotalRaidMedals:           totalMedals,
				AverageCapitalGoldPerRaid: avgGold,
				AverageRaidMedalsPerRaid:  avgMedals,
				TotalAttacks:              totalAttacks,
				AverageDestruction:        avgDestruction,
			})
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.CapitalLeaderboardResponse{
			GuildID:    guildID,
			Season:     season,
			Clans:      clanItems,
			TotalCount: len(clanItems),
		})
	}
}

func capitalParseIntDefault(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func capitalFixTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		tag = strings.TrimSpace(strings.ToUpper(tag))
		tag = strings.TrimPrefix(tag, "#")
		if tag != "" {
			out = append(out, "#"+tag)
		}
	}
	return out
}

func capitalAsString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func capitalAsInt(v any) int {
	switch x := v.(type) {
	case int32:
		return int(x)
	case int64:
		return int(x)
	case int:
		return x
	case float64:
		return int(x)
	}
	return 0
}

func capitalAsInt64(v any) int64 {
	switch x := v.(type) {
	case int32:
		return int64(x)
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	}
	return 0
}

func capitalAsFloat64(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int32:
		return float64(x)
	case int64:
		return float64(x)
	case int:
		return float64(x)
	}
	return 0
}

func capitalEnsureServer(c *fiber.Ctx, a apptypes.Deps, guildID int64) error {
	var found int
	return a.Store.SQL.QueryRow(c.UserContext(), `SELECT 1 FROM servers WHERE id = $1 LIMIT 1`, strconv.FormatInt(guildID, 10)).Scan(&found)
}

func capitalGuildClanNames(c *fiber.Ctx, a apptypes.Deps, guildID int64, requested []string) (map[string]string, []string, error) {
	fillAll := len(requested) == 0
	query := `SELECT tag, name FROM server_clans WHERE server_id = $1`
	args := []any{strconv.FormatInt(guildID, 10)}
	if !fillAll {
		query += ` AND tag = ANY($2)`
		args = append(args, requested)
	}
	query += ` ORDER BY name ASC`
	rows, err := a.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	clanNameMap := map[string]string{}
	clanTags := []string{}
	for rows.Next() {
		var tag, name string
		if err := rows.Scan(&tag, &name); err != nil {
			return nil, nil, err
		}
		clanNameMap[tag] = name
		clanTags = append(clanTags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	return clanNameMap, clanTags, nil
}

func capitalPlayerCount(c *fiber.Ctx, a apptypes.Deps, clanTags []string, season string) (int, error) {
	query := `SELECT count(DISTINCT player_tag) FROM capital_raid_members WHERE clan_tag = ANY($1)`
	args := []any{clanTags}
	if season != "" {
		query += ` AND to_char(start_time, 'YYYY-MM') = $2`
		args = append(args, season)
	}
	var total int
	err := a.Store.SQL.QueryRow(c.UserContext(), query, args...).Scan(&total)
	return total, err
}

func capitalPlayerRows(c *fiber.Ctx, a apptypes.Deps, clanTags []string, season string, limit int, offset int) ([]map[string]any, error) {
	query := `
		SELECT player_tag,
			COALESCE((array_agg(player_name ORDER BY start_time DESC))[1], '') AS player_name,
			COALESCE((array_agg(clan_tag ORDER BY start_time DESC))[1], '') AS clan_tag,
			sum(attack_count) AS total_attacks,
			sum(capital_resources_looted) AS total_capital_gold_looted,
			jsonb_agg(COALESCE(data->'attackLog', '[]'::jsonb)) AS attack_logs
		FROM capital_raid_members
		WHERE clan_tag = ANY($1)
	`
	args := []any{clanTags}
	if season != "" {
		query += ` AND to_char(start_time, 'YYYY-MM') = $2`
		args = append(args, season)
	}
	query += `
		GROUP BY player_tag
		ORDER BY total_capital_gold_looted DESC
		LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)
	args = append(args, limit, offset)
	rows, err := a.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var tag, name, clanTag string
		var attacks int
		var gold int64
		var raw []byte
		if err := rows.Scan(&tag, &name, &clanTag, &attacks, &gold, &raw); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"_id":                       tag,
			"player_name":               name,
			"clan_tag":                  clanTag,
			"total_attacks":             attacks,
			"total_capital_gold_looted": gold,
			"attack_logs":               raw,
		})
	}
	return out, rows.Err()
}

func capitalClanRows(c *fiber.Ctx, a apptypes.Deps, clanTags []string, season string) ([]map[string]any, error) {
	query := `
		SELECT clan_tag,
			count(*) AS total_raids,
			sum(capital_total_loot) AS total_capital_gold_looted,
			sum(offensive_reward + defensive_reward) AS total_raid_medals,
			sum(total_attacks) AS total_attacks,
			sum(COALESCE(NULLIF(data->>'destructionPercent', '')::double precision, 0)) AS total_destruction
		FROM raid_weekends
		WHERE clan_tag = ANY($1)
	`
	args := []any{clanTags}
	if season != "" {
		query += ` AND to_char(start_time, 'YYYY-MM') = $2`
		args = append(args, season)
	}
	query += ` GROUP BY clan_tag ORDER BY total_capital_gold_looted DESC`
	rows, err := a.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var clanTag string
		var totalRaids, totalAttacks int
		var totalGold, totalMedals int64
		var totalDestruction float64
		if err := rows.Scan(&clanTag, &totalRaids, &totalGold, &totalMedals, &totalAttacks, &totalDestruction); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"_id":                       clanTag,
			"total_raids":               totalRaids,
			"total_capital_gold_looted": totalGold,
			"total_raid_medals":         totalMedals,
			"total_attacks":             totalAttacks,
			"total_destruction":         totalDestruction,
		})
	}
	return out, rows.Err()
}

func capitalAttackRows(value any) []map[string]any {
	raw, ok := value.([]byte)
	if !ok || len(raw) == 0 {
		return nil
	}
	var groups []any
	if err := json.Unmarshal(raw, &groups); err != nil {
		return nil
	}
	out := []map[string]any{}
	for _, group := range groups {
		items, ok := group.([]any)
		if !ok {
			continue
		}
		for _, item := range items {
			if doc, ok := item.(map[string]any); ok {
				out = append(out, doc)
			}
		}
	}
	return out
}
