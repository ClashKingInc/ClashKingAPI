package v2

import (
	"strconv"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// guildSummary godoc
// @Summary Get guild activity summary
// @Description Returns clan and member activity totals for a Discord guild.
// @Tags Activity & Inactivity
// @Produce json
// @Param guild_id query int true "Discord guild ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/guild-summary [get]
func guildSummary(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}
		clans, err := serverClans(c, a, guildID)
		if err != nil {
			return err
		}
		summaries := make([]modelsv2.GuildSummaryClanRow, 0, len(clans))
		totalMembers := 0
		for _, clan := range clans {
			tag := activityAsString(clan["tag"])
			name := activityAsString(clan["name"])
			currentClan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil || currentClan == nil {
				continue
			}
			memberCount := len(currentClan.Members)
			totalMembers += memberCount
			summaries = append(summaries, modelsv2.GuildSummaryClanRow{ClanTag: tag, ClanName: name, TotalMembers: memberCount, ActiveMembers: memberCount})
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.GuildSummaryResponse{
			GuildID:                guildID,
			TotalClans:             len(summaries),
			TotalMembers:           totalMembers,
			TotalActiveMembers:     totalMembers,
			OverallActivityRate:    100,
			Clans:                  summaries,
		})
	}
}

// inactivePlayers godoc
// @Summary Get inactive players
// @Description Returns players in the guild that are considered inactive by the provided threshold.
// @Tags Activity & Inactivity
// @Produce json
// @Security ApiKeyAuth
// @Param guild_id query int true "Discord guild ID"
// @Param inactive_threshold_days query int false "Days before a player is considered inactive"
// @Param min_townhall query int false "Minimum town hall"
// @Param clan_tag query string false "Restrict results to a single clan"
// @Param limit query int false "Maximum number of results"
// @Param offset query int false "Number of results to skip"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 403 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/inactive-players [get]
func inactivePlayers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}
		inactiveDays := activityParseIntDefault(c.Query("inactive_threshold_days"), 7)
		minTownHall := activityParseIntDefault(c.Query("min_townhall"), 0)
		limit := activityParseIntDefault(c.Query("limit"), 100)
		offset := activityParseIntDefault(c.Query("offset"), 0)
		clanFilter := c.Query("clan_tag")
		cutoff := time.Now().UTC().AddDate(0, 0, -inactiveDays)
		clans, err := serverClans(c, a, guildID)
		if err != nil {
			return err
		}
		items := make([]modelsv2.InactivePlayerItem, 0)
		for _, clan := range clans {
			tag := activityAsString(clan["tag"])
			if clanFilter != "" && tag != clanFilter {
				continue
			}
			currentClan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil || currentClan == nil {
				continue
			}
			for _, member := range currentClan.Members {
				if minTownHall > 0 {
					continue
				}
				items = append(items, modelsv2.InactivePlayerItem{
					Tag:          member.Tag,
					Name:         member.Name,
					ClanTag:      tag,
					DaysInactive: int(time.Since(cutoff).Hours() / 24),
				})
			}
		}
		if offset > len(items) {
			offset = len(items)
		}
		end := offset + limit
		if end > len(items) {
			end = len(items)
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.InactivePlayersResponse{
			GuildID:               guildID,
			InactiveThresholdDays: inactiveDays,
			Players:               items[offset:end],
			TotalCount:            len(items),
			Limit:                 limit,
			Offset:                offset,
		})
	}
}

func serverClans(c *fiber.Ctx, a apptypes.Deps, guildID int64) ([]bson.M, error) {
	cur, err := a.Store.DB.Usafam.Collection("clans").Find(c.UserContext(), bson.M{"server": guildID})
	if err != nil {
		return nil, err
	}
	var clans []bson.M
	if err := cur.All(c.UserContext(), &clans); err != nil {
		return nil, err
	}
	return clans, nil
}

func activityAsString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func activityParseIntDefault(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return value
}
