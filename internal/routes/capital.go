package routes

import (
	"strconv"
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// playerStats godoc
// @Summary Get capital player statistics
// @Description Returns raid weekend player rows for the requested guild and clan tags.
// @Tags Capital Raids
// @Produce json
// @Security ApiKeyAuth
// @Param guild_id query int true "Discord guild ID"
// @Param clan_tags query []string true "Clan tags"
// @Param season query string false "Season filter"
// @Param limit query int false "Maximum number of rows"
// @Param offset query int false "Number of rows to skip"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
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
		filter := bson.M{"clan_tag": bson.M{"$in": clanTags}}
		if season != "" {
			filter["data.startTime"] = bson.M{"$regex": strings.ReplaceAll(season, "-", "")}
		}
		cur, err := a.Store.DB.Looper.Collection("raid_weekends").Find(c.UserContext(), filter)
		if err != nil {
			return err
		}
		var docs []bson.M
		if err := cur.All(c.UserContext(), &docs); err != nil {
			return err
		}
		rows := make([]map[string]any, 0)
		for _, doc := range docs {
			data, _ := doc["data"].(bson.M)
			members := asDocs(data["members"])
			for _, member := range members {
				rows = append(rows, map[string]any{
					"tag":                      member["tag"],
					"name":                     member["name"],
					"clan_tag":                 doc["clan_tag"],
					"attacks":                  member["attacks"],
					"capital_resources_looted": member["capitalResourcesLooted"],
				})
			}
		}
		if offset > len(rows) {
			offset = len(rows)
		}
		end := offset + limit
		if end > len(rows) {
			end = len(rows)
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"season":      season,
			"players":     rows[offset:end],
			"total_count": len(rows),
			"limit":       limit,
			"offset":      offset,
		})
	}
}

// guildLeaderboard godoc
// @Summary Get capital guild leaderboard
// @Description Returns a capital leaderboard for all clans attached to the requested guild.
// @Tags Capital Raids
// @Produce json
// @Security ApiKeyAuth
// @Param guild_id query int true "Discord guild ID"
// @Param season query string false "Season filter"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/capital/guild-leaderboard [get]
func guildLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		season := c.Query("season")
		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}
		cur, err := a.Store.DB.Usafam.Collection("clans").Find(c.UserContext(), bson.M{"server": guildID})
		if err != nil {
			return err
		}
		var clans []bson.M
		if err := cur.All(c.UserContext(), &clans); err != nil {
			return err
		}
		out := make([]map[string]any, 0, len(clans))
		for _, clan := range clans {
			out = append(out, map[string]any{
				"clan_tag":                      clan["tag"],
				"clan_name":                     clan["name"],
				"total_raids":                   0,
				"total_capital_gold_looted":     0,
				"total_raid_medals":             0,
				"average_capital_gold_per_raid": 0,
				"average_raid_medals_per_raid":  0,
				"total_attacks":                 0,
				"average_destruction":           0,
			})
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"guild_id":    guildID,
			"season":      season,
			"clans":       out,
			"total_count": len(out),
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

func asDocs(value any) []bson.M {
	switch rows := value.(type) {
	case []bson.M:
		return rows
	case bson.A:
		out := make([]bson.M, 0, len(rows))
		for _, row := range rows {
			if doc, ok := row.(bson.M); ok {
				out = append(out, doc)
			}
		}
		return out
	default:
		return nil
	}
}
