package v2

import (
	"context"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// previousWars godoc
// @Summary Previous wars for a clan
// @Description Returns previous wars for a clan tag, optionally filtered to CWL.
// @Tags War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param timestamp_start query int false "Start timestamp"
// @Param timestamp_end query int false "End timestamp"
// @Param include_cwl query bool false "Include CWL wars"
// @Param limit query int false "Maximum number of results"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/{clan_tag}/previous [get]
func previousWars(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := warFixTag(c.Params("clan_tag"))
		start := timestampString(c.Query("timestamp_start"), 0)
		end := timestampString(c.Query("timestamp_end"), 9999999999)
		includeCWL, err := apptypes.QueryBool(c, "include_cwl", false)
		if err != nil {
			return err
		}
		limit := warParseIntDefault(c.Query("limit"), 50)
		filter := bson.M{
			"$and": bson.A{
				bson.M{"$or": bson.A{bson.M{"data.clan.tag": clanTag}, bson.M{"data.opponent.tag": clanTag}}},
				bson.M{"data.preparationStartTime": bson.M{"$gte": start}},
				bson.M{"data.preparationStartTime": bson.M{"$lte": end}},
			},
		}
		if !includeCWL {
			filter["$and"] = append(filter["$and"].(bson.A), bson.M{"data.season": bson.M{"$eq": nil}})
		}
		cur, err := a.Store.DB.Looper.Collection("clan_war").Find(c.UserContext(), filter)
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		seen := map[string]struct{}{}
		items := make([]any, 0, warMin(limit, len(rows)))
		for _, row := range rows {
			data, _ := sanitize(row["data"]).(map[string]any)
			prep := warAsString(data["preparationStartTime"])
			if prep == "" {
				prep = warAsString(row["preparationStartTime"])
			}
			if _, ok := seen[prep]; ok {
				continue
			}
			seen[prep] = struct{}{}
			items = append(items, warWithoutID(bson.M(data)))
			if len(items) == limit {
				break
			}
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
	}
}

// cwlRankingHistory godoc
// @Summary CWL ranking history for a clan
// @Description Returns CWL ranking history rows for a clan tag.
// @Tags War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/cwl/{clan_tag}/ranking-history [get]
func cwlRankingHistory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTag := warFixTag(c.Params("clan_tag"))
		cur, err := a.Store.DB.Looper.Collection("cwl_group").Find(c.UserContext(), bson.M{"data.clans.tag": clanTag})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		if len(rows) == 0 {
			return apptypes.Error(fiber.StatusNotFound, "No CWL Data Found")
		}
		items := make([]modelsv2.CWLRankingHistoryItem, 0, len(rows))
		for _, row := range rows {
			data, _ := row["data"].(bson.M)
			season, _ := data["season"].(string)
			items = append(items, modelsv2.CWLRankingHistoryItem{
				Season: season,
				League: nestedString(data, "clans", "0", "warLeague", "name"),
				Rounds: len(asArray(data["rounds"])),
			})
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
	}
}

// cwlThresholds godoc
// @Summary Promo and demotion thresholds for CWL leagues
// @Description Returns the static CWL promotion and demotion thresholds list.
// @Tags War
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /v2/cwl/league-thresholds [get]
func cwlThresholds(c *fiber.Ctx) error {
	return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": []modelsv2.CWLThresholdItem{
		{ID: 48000001, Name: "Bronze League III", Promo: 3, Demote: 9},
		{ID: 48000004, Name: "Silver League III", Promo: 2, Demote: 8},
		{ID: 48000007, Name: "Gold League III", Promo: 2, Demote: 7},
		{ID: 48000010, Name: "Crystal League III", Promo: 2, Demote: 7},
		{ID: 48000013, Name: "Master League III", Promo: 2, Demote: 6},
		{ID: 48000016, Name: "Champion League III", Promo: 2, Demote: 6},
		{ID: 48000019, Name: "Titan League III", Promo: 2, Demote: 5},
		{ID: 48000022, Name: "Legend League", Promo: 0, Demote: 5},
	}})
}

// clanStats godoc
// @Summary Clan war stats
// @Description Returns the number of wars for the requested clan tags.
// @Tags War
// @Produce json
// @Param clan_tags query []string false "Clan tags"
// @Param clan_tag query string false "Single clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/clan/stats [get]
func clanStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		clanTags := splitCSV(apptypes.QueryValues(c, "clan_tags"), c.Query("clan_tag"))
		filter := bson.M{}
		if len(clanTags) > 0 {
			filter = bson.M{"$or": bson.A{bson.M{"data.clan.tag": bson.M{"$in": clanTags}}, bson.M{"data.opponent.tag": bson.M{"$in": clanTags}}}}
		}
		total, err := a.Store.DB.Looper.Collection("clan_war").CountDocuments(c.UserContext(), filter)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": []modelsv2.WarStatsItem{{WarCount: int(total), ClanTags: clanTags}}})
	}
}

// warSummaryBulk godoc
// @Summary Get full war summary for multiple clans
// @Description Returns current war summary data for multiple clan tags.
// @Tags War
// @Produce json
// @Param body body modelsv2.WarClanTagsBody true "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/war-summary [post]
func warSummaryBulk(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.WarClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		items := make([]modelsv2.WarSummaryResponse, 0, len(body.ClanTags))
		for _, tag := range body.ClanTags {
			items = append(items, currentWarSummary(c.UserContext(), a, tag))
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items})
	}
}

// warSummarySingle godoc
// @Summary Get war summary for a clan
// @Description Returns current war summary data for a single clan tag.
// @Tags War
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/{clan_tag}/war-summary [get]
func warSummarySingle(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, fiber.StatusOK, currentWarSummary(c.UserContext(), a, c.Params("clan_tag")))
	}
}

// playerWarhits godoc
// @Summary Player warhits stats
// @Description Returns war hit rows for the requested player tags.
// @Tags War
// @Produce json
// @Param body body modelsv2.WarPlayersBody true "Player tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/players/warhits [post]
func playerWarhits(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.WarPlayersBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		cur, err := a.Store.DB.Looper.Collection("warhits").Find(c.UserContext(), bson.M{"tag": bson.M{"$in": body.Players}})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": warStripIDs(rows)})
	}
}

// clanWarhits godoc
// @Summary Clan warhits stats
// @Description Returns war hit rows for the requested clan tags.
// @Tags War
// @Produce json
// @Param body body modelsv2.WarClanTagsBody true "Clan tags"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/war/clans/warhits [post]
func clanWarhits(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.WarClanTagsBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		cur, err := a.Store.DB.Looper.Collection("warhits").Find(c.UserContext(), bson.M{"clan_tag": bson.M{"$in": warFixTags(body.ClanTags)}})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": warStripIDs(rows)})
	}
}

func currentWarSummary(ctx context.Context, a apptypes.Deps, tag string) modelsv2.WarSummaryResponse {
	war, err := a.Clash.Client().GetCurrentWar(ctx, warFixTag(tag))
	if err != nil || war == nil {
		return modelsv2.WarSummaryResponse{Tag: warFixTag(tag), State: "notFound"}
	}
	attacksPerMember := 0
	if war.TeamSize > 0 {
		totalAttacks := len(war.Attacks())
		if totalAttacks > 0 {
			attacksPerMember = totalAttacks / (war.TeamSize * 2)
			if attacksPerMember == 0 {
				attacksPerMember = 1
			}
		}
	}
	return modelsv2.WarSummaryResponse{
		Tag:              warFixTag(tag),
		State:            string(war.State),
		TeamSize:         war.TeamSize,
		AttacksPerMember: attacksPerMember,
	}
}

func timestampString(raw string, fallback int64) string {
	value := fallback
	if raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			value = parsed
		}
	}
	return time.Unix(value, 0).UTC().Format("20060102T150405.000Z")
}

func warParseIntDefault(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}

func warMin(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func splitCSV(list []string, single string) []string {
	out := make([]string, 0, len(list)+1)
	for _, raw := range list {
		for _, part := range strings.Split(raw, ",") {
			if trimmed := strings.TrimSpace(part); trimmed != "" {
				out = append(out, warFixTag(trimmed))
			}
		}
	}
	if single != "" {
		out = append(out, warFixTag(single))
	}
	return out
}

func warStripIDs(rows []bson.M) []bson.M {
	out := make([]bson.M, 0, len(rows))
	for _, row := range rows {
		out = append(out, warWithoutID(row))
	}
	return out
}

func warWithoutID(doc bson.M) bson.M {
	clean := bson.M{}
	for key, value := range doc {
		if key == "_id" {
			continue
		}
		clean[key] = value
	}
	return clean
}

func warAsString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func asArray(v any) []any {
	if arr, ok := v.(bson.A); ok {
		return arr
	}
	if arr, ok := v.([]any); ok {
		return arr
	}
	return nil
}

func nestedString(_ bson.M, _ ...string) string { return "" }

func warFixTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		out = append(out, warFixTag(tag))
	}
	return out
}

func warFixTag(tag string) string {
	tag = strings.TrimSpace(strings.ToUpper(tag))
	tag = strings.TrimPrefix(tag, "#")
	if tag == "" {
		return ""
	}
	return "#" + tag
}
