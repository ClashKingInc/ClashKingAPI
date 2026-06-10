package routes

import (
	"errors"
	"sort"
	"strconv"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
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
// @Router /v2/activity/guild-summary [get]
func guildSummary(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		guildID, _ := strconv.ParseInt(c.Query("guild_id"), 10, 64)
		inactiveDays := activityParseIntDefault(c.Query("inactive_threshold_days"), 7)
		if guildID == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "guild_id is required")
		}

		if err := activityRequireServer(c, a, guildID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
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

		lastOnlineMap := make(map[string]int64)
		if len(allTags) > 0 {
			lastOnlineRows, err := activityPlayerStats(c, a, allTags)
			if err != nil {
				return err
			}
			for tag, row := range lastOnlineRows {
				lastOnlineMap[tag] = row.lastOnline
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
// @Router /v2/activity/inactive-players [get]
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

		if err := activityRequireServer(c, a, guildID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
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

		playerDataMap := make(map[string]activityPlayerStatsData)
		if len(allMembers) > 0 {
			allTags := make([]string, len(allMembers))
			for i, m := range allMembers {
				allTags[i] = m.tag
			}
			playerDataMap, err = activityPlayerStats(c, a, allTags)
			if err != nil {
				return err
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

func activityRequireServer(c *fiber.Ctx, a apptypes.Deps, guildID int64) error {
	var exists int
	return a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT 1
		FROM servers
		WHERE id = $1
	`, strconv.FormatInt(guildID, 10)).Scan(&exists)
}

func serverClans(c *fiber.Ctx, a apptypes.Deps, guildID int64) ([]map[string]any, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT tag, name, data
		FROM server_clans
		WHERE server_id = $1
		ORDER BY tag
	`, strconv.FormatInt(guildID, 10))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	clans := []map[string]any{}
	for rows.Next() {
		var tag, name string
		var dataRaw []byte
		if err := rows.Scan(&tag, &name, &dataRaw); err != nil {
			return nil, err
		}
		item := playerDecodeJSONObject(dataRaw)
		item["tag"] = tag
		item["name"] = name
		clans = append(clans, item)
	}
	return clans, rows.Err()
}

type activityPlayerStatsData struct {
	lastOnline int64
	townhall   int
}

func activityPlayerStats(c *fiber.Ctx, a apptypes.Deps, tags []string) (map[string]activityPlayerStatsData, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT player_tag, townhall_level, last_online_at
		FROM player_current_stats
		WHERE player_tag = ANY($1)
	`, tags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]activityPlayerStatsData{}
	for rows.Next() {
		var tag string
		var townhall pgtype.Int4
		var lastOnline pgtype.Timestamptz
		if err := rows.Scan(&tag, &townhall, &lastOnline); err != nil {
			return nil, err
		}
		item := activityPlayerStatsData{}
		if townhall.Valid {
			item.townhall = int(townhall.Int32)
		}
		if lastOnline.Valid {
			item.lastOnline = lastOnline.Time.Unix()
		}
		out[tag] = item
	}
	return out, rows.Err()
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
