package v2

import (
	"sort"
	"strconv"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// guildSummary godoc
// @Summary Get guild activity summary
// @Description Returns clan and member activity totals for a Discord guild.
// @Tags Activity & Inactivity
// @Produce json
// @Param guild_id query int true "Discord guild ID"
// @Param inactive_threshold_days query int false "Days without login to be considered inactive (default 7)"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/guild-summary [get]
func guildSummary(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		inactiveDays := activityParseIntDefault(c.Query("inactive_threshold_days"), 7)
		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}

		var serverDoc bson.M
		if err := a.Store.C.ServerDB.FindOne(c.UserContext(), bson.M{"server": guildID}).Decode(&serverDoc); err != nil {
			if err == mongo.ErrNoDocuments {
				return apptypes.Error(fiber.StatusNotFound, "Server not found")
			}
			return err
		}

		clans, err := serverClans(c, a, guildID)
		if err != nil {
			return err
		}
		if len(clans) == 0 {
			return apptypes.JSON(c, fiber.StatusOK, modelsv2.GuildSummaryResponse{
				GuildID: guildID, Clans: []modelsv2.GuildSummaryClanRow{},
			})
		}

		cutoffUnix := time.Now().Unix() - int64(inactiveDays)*86400

		type memberEntry struct {
			tag       string
			trophies  int
			donations int
			received  int
		}
		type clanEntry struct {
			tag     string
			name    string
			members []memberEntry
		}

		clanEntries := make([]clanEntry, 0, len(clans))
		allTags := make([]string, 0)
		for _, clan := range clans {
			tag := activityAsString(clan["tag"])
			name := activityAsString(clan["name"])
			cocClan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil || cocClan == nil {
				continue
			}
			members := make([]memberEntry, 0, len(cocClan.Members))
			for _, m := range cocClan.Members {
				members = append(members, memberEntry{
					tag: m.Tag, trophies: m.Trophies,
					donations: m.Donations, received: m.Received,
				})
				allTags = append(allTags, m.Tag)
			}
			clanEntries = append(clanEntries, clanEntry{tag: tag, name: name, members: members})
		}

		// Batch-query last_online from player_stats.
		lastOnlineMap := make(map[string]int64)
		if len(allTags) > 0 {
			loCur, err := a.Store.C.PlayerStats.Find(
				c.UserContext(),
				bson.M{"tag": bson.M{"$in": allTags}},
				options.Find().SetProjection(bson.M{"tag": 1, "last_online": 1, "_id": 0}),
			)
			if err == nil {
				var loDocs []bson.M
				if err := loCur.All(c.UserContext(), &loDocs); err == nil {
					for _, doc := range loDocs {
						t, _ := doc["tag"].(string)
						lastOnlineMap[t] = activityAsInt64(doc["last_online"])
					}
				}
			}
		}

		summaries := make([]modelsv2.GuildSummaryClanRow, 0, len(clanEntries))
		totalMembers, totalActive, totalInactive := 0, 0, 0
		totalDonSent, totalDonRcvd := 0, 0

		for _, ce := range clanEntries {
			active, inactive := 0, 0
			donSent, donRcvd, trophySum := 0, 0, 0
			for _, m := range ce.members {
				if lastOnlineMap[m.tag] > cutoffUnix {
					active++
				} else {
					inactive++
				}
				donSent += m.donations
				donRcvd += m.received
				trophySum += m.trophies
			}
			n := len(ce.members)
			rate, avgDonSent, avgDonRcvd, avgTrophies := 0.0, 0.0, 0.0, 0.0
			if n > 0 {
				rate = float64(active) / float64(n) * 100
				avgDonSent = float64(donSent) / float64(n)
				avgDonRcvd = float64(donRcvd) / float64(n)
				avgTrophies = float64(trophySum) / float64(n)
			}
			summaries = append(summaries, modelsv2.GuildSummaryClanRow{
				ClanTag:                  ce.tag,
				ClanName:                 ce.name,
				TotalMembers:             n,
				ActiveMembers:            active,
				InactiveMembers:          inactive,
				ActivityRate:             rate,
				AverageDonationsSent:     avgDonSent,
				AverageDonationsReceived: avgDonRcvd,
				TotalDonationsSent:       donSent,
				TotalDonationsReceived:   donRcvd,
				AverageTrophies:          avgTrophies,
			})
			totalMembers += n
			totalActive += active
			totalInactive += inactive
			totalDonSent += donSent
			totalDonRcvd += donRcvd
		}

		overallRate := 0.0
		if totalMembers > 0 {
			overallRate = float64(totalActive) / float64(totalMembers) * 100
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.GuildSummaryResponse{
			GuildID:                guildID,
			TotalClans:             len(summaries),
			TotalMembers:           totalMembers,
			TotalActiveMembers:     totalActive,
			TotalInactiveMembers:   totalInactive,
			OverallActivityRate:    overallRate,
			TotalDonationsSent:     totalDonSent,
			TotalDonationsReceived: totalDonRcvd,
			Clans:                  summaries,
		})
	}
}

// inactivePlayers godoc
// @Summary Get inactive players
// @Description Returns players in the guild that are considered inactive by the provided threshold.
// @Tags Activity & Inactivity
// @Produce json
// @Param guild_id query int true "Discord guild ID"
// @Param inactive_threshold_days query int false "Days before a player is considered inactive"
// @Param min_townhall query int false "Minimum town hall level"
// @Param clan_tag query string false "Restrict results to a single clan"
// @Param limit query int false "Maximum number of results"
// @Param offset query int false "Number of results to skip"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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

		var serverDoc bson.M
		if err := a.Store.C.ServerDB.FindOne(c.UserContext(), bson.M{"server": guildID}).Decode(&serverDoc); err != nil {
			if err == mongo.ErrNoDocuments {
				return apptypes.Error(fiber.StatusNotFound, "Server not found")
			}
			return err
		}

		clans, err := serverClans(c, a, guildID)
		if err != nil {
			return err
		}

		cutoffUnix := time.Now().Unix() - int64(inactiveDays)*86400
		nowUnix := time.Now().Unix()

		type memberInfo struct {
			tag      string
			name     string
			clanTag  string
			clanName string
			role     string
			trophies int
			donSent  int
			donRcvd  int
		}

		allMembers := make([]memberInfo, 0)
		for _, clan := range clans {
			tag := activityAsString(clan["tag"])
			if clanFilter != "" && tag != clanFilter {
				continue
			}
			name := activityAsString(clan["name"])
			cocClan, err := a.Clash.GetClan(c.UserContext(), tag)
			if err != nil || cocClan == nil {
				continue
			}
			for _, m := range cocClan.Members {
				allMembers = append(allMembers, memberInfo{
					tag:      m.Tag,
					name:     m.Name,
					clanTag:  tag,
					clanName: name,
					role:     string(m.Role),
					trophies: m.Trophies,
					donSent:  m.Donations,
					donRcvd:  m.Received,
				})
			}
		}

		// Batch-query player_stats for last_online and townhall.
		type playerStatsData struct {
			lastOnline int64
			townhall   int
		}
		playerDataMap := make(map[string]playerStatsData)
		if len(allMembers) > 0 {
			allTags := make([]string, len(allMembers))
			for i, m := range allMembers {
				allTags[i] = m.tag
			}
			loCur, err := a.Store.C.PlayerStats.Find(
				c.UserContext(),
				bson.M{"tag": bson.M{"$in": allTags}},
				options.Find().SetProjection(bson.M{"tag": 1, "last_online": 1, "townhall": 1, "_id": 0}),
			)
			if err == nil {
				var loDocs []bson.M
				if err := loCur.All(c.UserContext(), &loDocs); err == nil {
					for _, doc := range loDocs {
						t, _ := doc["tag"].(string)
						playerDataMap[t] = playerStatsData{
							lastOnline: activityAsInt64(doc["last_online"]),
							townhall:   activityAsInt(doc["townhall"]),
						}
					}
				}
			}
		}

		items := make([]modelsv2.InactivePlayerItem, 0)
		for _, m := range allMembers {
			pd := playerDataMap[m.tag]

			// Apply min_townhall filter using player_stats townhall (skip if townhall unknown).
			if minTownHall > 0 && pd.townhall > 0 && pd.townhall < minTownHall {
				continue
			}
			// Only include players who have not been online since the cutoff.
			if pd.lastOnline > cutoffUnix {
				continue
			}

			var daysInactivePtr *int
			if pd.lastOnline > 0 {
				days := int((nowUnix - pd.lastOnline) / 86400)
				daysInactivePtr = &days
			}
			var thPtr *int
			if pd.townhall > 0 {
				th := pd.townhall
				thPtr = &th
			}
			items = append(items, modelsv2.InactivePlayerItem{
				Tag:               m.tag,
				Name:              m.name,
				ClanTag:           m.clanTag,
				ClanName:          m.clanName,
				Role:              m.role,
				Trophies:          m.trophies,
				Townhall:          thPtr,
				DaysInactive:      daysInactivePtr,
				DonationsSent:     m.donSent,
				DonationsReceived: m.donRcvd,
			})
		}

		// Sort most-inactive first; players with no last_online data go last.
		sort.Slice(items, func(i, j int) bool {
			di, dj := -1, -1
			if items[i].DaysInactive != nil {
				di = *items[i].DaysInactive
			}
			if items[j].DaysInactive != nil {
				dj = *items[j].DaysInactive
			}
			return di > dj
		})

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
	cur, err := a.Store.C.ClanDB.Find(c.UserContext(), bson.M{"server": guildID})
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

func activityAsInt(v any) int {
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

func activityAsInt64(v any) int64 {
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


