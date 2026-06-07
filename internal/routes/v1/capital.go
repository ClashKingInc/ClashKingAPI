package v1

import (
	"strconv"
	"strings"
	"time"

	modelsv1 "github.com/ClashKingInc/ClashKingAPI/internal/models/v1"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// districtStats godoc
// @Summary Get capital district stats
// @Description Returns raid weekend capital district stats.
// @Tags Legacy Capital
// @Produce json
// @Param weekend query string false "Weekend filter"
// @Success 200 {array} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /capital/stats/district [get]
func districtStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := capitalRows(c, a, "", c.Query("weekend"), 0)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, rows)
	}
}

// leagueStats godoc
// @Summary Get capital league stats
// @Description Returns raid weekend capital league stats.
// @Tags Legacy Capital
// @Produce json
// @Param weekend query string false "Weekend filter"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /capital/stats/leagues [get]
func leagueStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := capitalRows(c, a, "", c.Query("weekend"), 0)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": rows})
	}
}

// capitalLog godoc
// @Summary Get clan capital raid log
// @Description Returns stored raid weekends for a clan.
// @Tags Legacy Capital
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {array} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /capital/{clan_tag} [get]
func capitalLog(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := capitalRows(c, a, capitalFixTag(c.Params("clan_tag")), "", 0)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, rows)
	}
}

// capitalBulk godoc
// @Summary Get capital raid logs in bulk
// @Description Returns stored raid weekends grouped by clan tag.
// @Tags Legacy Capital
// @Accept json
// @Produce json
// @Param body body modelsv1.V1CapitalClanTagsBody true "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /capital/bulk [post]
func capitalBulk(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv1.V1CapitalClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tags := capitalFixTags(body.ClanTags[:capitalMin(len(body.ClanTags), 100)])
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT clan_tag, data
			FROM raid_weekends
			WHERE clan_tag = ANY($1)
			ORDER BY end_time DESC
		`, tags)
		if err != nil {
			return err
		}
		defer rows.Close()
		grouped := map[string][]any{}
		for rows.Next() {
			var tag string
			var raw []byte
			if err := rows.Scan(&tag, &raw); err != nil {
				return err
			}
			grouped[tag] = append(grouped[tag], jsonObject(raw))
		}
		return apptypes.JSON(c, fiber.StatusOK, grouped)
	}
}

func capitalRows(c *fiber.Ctx, a apptypes.Deps, clanTag string, weekend string, limit int) ([]map[string]any, error) {
	query := `
		SELECT clan_tag, start_time, end_time, state, total_attacks, capital_total_loot, raids_completed,
			offensive_reward, defensive_reward, members, attack_log, defense_log, data
		FROM raid_weekends
		WHERE true
	`
	args := []any{}
	if clanTag != "" {
		args = append(args, clanTag)
		query += ` AND clan_tag = $` + strconv.Itoa(len(args))
	}
	if weekend != "" {
		args = append(args, "%"+strings.ReplaceAll(weekend, "-", "")+"%")
		query += ` AND to_char(start_time, 'YYYYMMDD') LIKE $` + strconv.Itoa(len(args))
	}
	query += ` ORDER BY end_time DESC`
	if limit > 0 {
		args = append(args, limit)
		query += ` LIMIT $` + strconv.Itoa(len(args))
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var tag, state string
		var start, end time.Time
		var attacks, loot, completed, offensive, defensive int
		var membersRaw, attackRaw, defenseRaw, dataRaw []byte
		if err := rows.Scan(&tag, &start, &end, &state, &attacks, &loot, &completed, &offensive, &defensive, &membersRaw, &attackRaw, &defenseRaw, &dataRaw); err != nil {
			return nil, err
		}
		item := jsonObject(dataRaw)
		item["clan_tag"] = tag
		item["data"] = map[string]any{
			"startTime":        start,
			"endTime":          end,
			"state":            state,
			"totalAttacks":     attacks,
			"capitalTotalLoot": loot,
			"raidsCompleted":   completed,
			"offensiveReward":  offensive,
			"defensiveReward":  defensive,
			"members":          jsonValue(membersRaw, []any{}),
			"attackLog":        jsonValue(attackRaw, []any{}),
			"defenseLog":       jsonValue(defenseRaw, []any{}),
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func capitalMin(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func capitalFixTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		out = append(out, capitalFixTag(tag))
	}
	return out
}

func capitalFixTag(tag string) string {
	tag = strings.TrimSpace(strings.ToUpper(tag))
	tag = strings.TrimPrefix(tag, "#")
	if tag == "" {
		return ""
	}
	return "#" + tag
}

func capitalAsString(v any) string {
	return stringValue(v)
}
