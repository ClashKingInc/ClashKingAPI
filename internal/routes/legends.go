package routes

import (
	"strconv"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// legendStatsDay is a hidden route for legends day stats.
func legendStatsDay(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		players := apptypes.QueryValues(c, "players")
		filter := bson.M{"tag": bson.M{"$in": players}}
		cur, err := a.Store.DB.NewLooper.Collection("player_stats").Find(c.UserContext(), filter)
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, legendsStripIDs(rows))
	}
}

// legendStatsSeason is a hidden route for legends season stats.
func legendStatsSeason(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		players := apptypes.QueryValues(c, "players")
		filter := bson.M{"tag": bson.M{"$in": players}}
		cur, err := a.Store.DB.NewLooper.Collection("player_stats").Find(c.UserContext(), filter)
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, legendsStripIDs(rows))
	}
}

// guildStats godoc
// @Summary Get guild legends statistics
// @Description Returns legends leaderboard and player stats for a guild.
// @Tags Bot Legends Endpoints
// @Produce json
// @Security ApiKeyAuth
// @Param guild_id query int true "Discord guild ID"
// @Param season query string false "Season"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/legends/guild-stats [get]
func guildStats(a apptypes.Deps) fiber.Handler {
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
		topPlayers := make([]map[string]any, 0)
		totalTrophies := 0
		totalPlayers := 0
		clanRows := make([]map[string]any, 0, len(clans))
		for _, clan := range clans {
			tag := legendsAsString(clan["tag"])
			currentClan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil || currentClan == nil {
				continue
			}
			legendPlayers := 0
			for _, member := range currentClan.Members {
				if member.League != nil && member.League.Name == "Legend League" {
					totalPlayers++
					totalTrophies += member.Trophies
					legendPlayers++
					topPlayers = append(topPlayers, map[string]any{
						"tag":       member.Tag,
						"name":      member.Name,
						"trophies":  member.Trophies,
						"clan_tag":  tag,
						"clan_name": clan["name"],
					})
				}
			}
			clanRows = append(clanRows, map[string]any{"clan_tag": tag, "clan_name": clan["name"], "players_in_legends": legendPlayers})
		}
		average := 0.0
		if totalPlayers > 0 {
			average = float64(totalTrophies) / float64(totalPlayers)
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"guild_id":                 guildID,
			"season":                   season,
			"total_players_in_legends": totalPlayers,
			"total_clans":              len(clanRows),
			"average_trophies":         average,
			"total_trophies":           totalTrophies,
			"top_players":              topPlayers,
			"clans":                    clanRows,
		})
	}
}

// dailyTracking godoc
// @Summary Get legends daily tracking
// @Description Returns daily tracking rows for a guild and optional day.
// @Tags Bot Legends Endpoints
// @Produce json
// @Security ApiKeyAuth
// @Param guild_id query int true "Discord guild ID"
// @Param day query string false "Day in YYYY-MM-DD format"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/legends/daily-tracking [get]
func dailyTracking(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}
		day := c.Query("day")
		if day == "" {
			day = time.Now().UTC().Format("2006-01-02")
		}
		cur, err := a.Store.DB.NewLooper.Collection("player_stats").Find(c.UserContext(), bson.M{})
		if err != nil {
			return err
		}
		var rows []bson.M
		if err := cur.All(c.UserContext(), &rows); err != nil {
			return err
		}
		items := make([]map[string]any, 0, len(rows))
		for _, row := range rows {
			items = append(items, map[string]any{"tag": row["tag"], "name": row["name"], "day": day})
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"guild_id":    guildID,
			"day":         day,
			"players":     items,
			"total_count": len(items),
		})
	}
}

func legendsStripIDs(rows []bson.M) []bson.M {
	out := make([]bson.M, 0, len(rows))
	for _, row := range rows {
		clean := bson.M{}
		for key, value := range row {
			if key == "_id" {
				continue
			}
			clean[key] = value
		}
		out = append(out, clean)
	}
	return out
}

func legendsAsString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
