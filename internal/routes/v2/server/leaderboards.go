package server

import (
	"context"
	"math"
	"net/http"
	"sort"
	"strconv"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// getServerLeaderboards godoc
// @Summary Get server leaderboards
// @Description Returns top players and clans for a Discord server based on ranking data.
// @Tags Server Leaderboards
// @Produce json
// @Param server_id path int true "Server ID"
// @Param limit_players query int false "Max players to return (default 100, max 500)"
// @Param limit_clans query int false "Max clans to return (default 50, max 200)"
// @Param sort_by query string false "Sort by: global_rank, local_rank, trophies, legend_trophies"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/{server_id}/leaderboards [get]
func getServerLeaderboards(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		limitPlayers := clamp(queryIntDefault(c, "limit_players", 100), 1, 500)
		limitClans := clamp(queryIntDefault(c, "limit_clans", 50), 1, 200)
		sortBy := c.Query("sort_by", "global_rank")

		ctx := c.UserContext()

		// Get clans for this server
		clanCur, err := a.Store.C.ClanDB.Find(ctx, bson.M{"server": serverID},
			options.Find().SetProjection(bson.M{"_id": 0, "tag": 1, "name": 1}))
		if err != nil {
			return err
		}
		var clans []bson.M
		if err := clanCur.All(ctx, &clans); err != nil {
			return err
		}
		if len(clans) == 0 {
			return apptypes.Error(http.StatusNotFound, "No clans found for this server")
		}

		clanTags := make([]string, 0, len(clans))
		clanNameMap := make(map[string]string, len(clans))
		for _, clan := range clans {
			tag, _ := clan["tag"].(string)
			name, _ := clan["name"].(string)
			if tag != "" {
				clanTags = append(clanTags, tag)
				clanNameMap[tag] = name
			}
		}

		// Get player tags from player_stats where clan is in clanTags
		playerStatsCur, err := a.Store.C.PlayerStats.Find(ctx,
			bson.M{"clan.tag": bson.M{"$in": clanTags}},
			options.Find().SetProjection(bson.M{"tag": 1, "name": 1, "townhall": 1, "trophies": 1, "clan": 1, "_id": 0}),
		)
		if err != nil {
			return err
		}
		var playerStats []bson.M
		if err := playerStatsCur.All(ctx, &playerStats); err != nil {
			return err
		}

		playerTags := make([]string, 0, len(playerStats))
		for _, p := range playerStats {
			if tag, ok := p["tag"].(string); ok {
				playerTags = append(playerTags, tag)
			}
		}

		// Fetch player rankings
		rankCur, err := a.Store.C.LeaderboardDB.Find(ctx, bson.M{"tag": bson.M{"$in": playerTags}},
			options.Find().SetProjection(bson.M{"_id": 0, "tag": 1, "global_rank": 1, "local_rank": 1, "trophies": 1, "legend_trophies": 1, "country_code": 1}))
		if err != nil {
			return err
		}
		var rankings []bson.M
		if err := rankCur.All(ctx, &rankings); err != nil {
			return err
		}
		rankMap := make(map[string]bson.M, len(rankings))
		for _, r := range rankings {
			if tag, ok := r["tag"].(string); ok {
				rankMap[tag] = r
			}
		}

		// Build player entries
		type playerEntry struct {
			data           map[string]any
			rank           *int64
			trophies       int64
			legendTrophies int64
		}
		playerEntries := make([]playerEntry, 0, len(playerStats))
		for _, p := range playerStats {
			tag, _ := p["tag"].(string)
			ranking := rankMap[tag]
			clanMap, _ := p["clan"].(bson.M)
			clanTag := ""
			clanName := ""
			if clanMap != nil {
				clanTag, _ = clanMap["tag"].(string)
				clanName, _ = clanMap["name"].(string)
			}
			entry := map[string]any{
				"player_tag":      tag,
				"player_name":     asStringOr(p["name"], "Unknown"),
				"townhall_level":  p["townhall"],
				"clan_tag":        clanTag,
				"clan_name":       clanName,
				"trophies":        p["trophies"],
				"global_rank":     ranking["global_rank"],
				"local_rank":      ranking["local_rank"],
				"country_code":    ranking["country_code"],
				"country_name":    ranking["country_name"],
				"legend_trophies": ranking["legend_trophies"],
			}
			var rankPtr *int64
			if gr, ok := ranking["global_rank"]; ok && gr != nil {
				v := asInt64(gr)
				rankPtr = &v
			}
			playerEntries = append(playerEntries, playerEntry{
				data:           entry,
				rank:           rankPtr,
				trophies:       asInt64(p["trophies"]),
				legendTrophies: asInt64(ranking["legend_trophies"]),
			})
		}

		// Sort players
		sort.SliceStable(playerEntries, func(i, j int) bool {
			switch sortBy {
			case "local_rank":
				ri, rj := playerEntries[i].rank, playerEntries[j].rank
				if ri == nil && rj == nil {
					return false
				}
				if ri == nil {
					return false
				}
				if rj == nil {
					return true
				}
				return *ri < *rj
			case "trophies":
				return playerEntries[i].trophies > playerEntries[j].trophies
			case "legend_trophies":
				return playerEntries[i].legendTrophies > playerEntries[j].legendTrophies
			default: // global_rank
				ri, rj := playerEntries[i].rank, playerEntries[j].rank
				if ri == nil && rj == nil {
					return false
				}
				if ri == nil {
					return false
				}
				if rj == nil {
					return true
				}
				return *ri < *rj
			}
		})
		if len(playerEntries) > limitPlayers {
			playerEntries = playerEntries[:limitPlayers]
		}
		players := make([]map[string]any, len(playerEntries))
		for i, e := range playerEntries {
			players[i] = e.data
		}

		// Fetch clan rankings
		clanRankCur, err := a.Store.C.ClanLeaderboardDB.Find(ctx, bson.M{"tag": bson.M{"$in": clanTags}})
		if err != nil {
			return err
		}
		var clanRankings []bson.M
		if err := clanRankCur.All(ctx, &clanRankings); err != nil {
			return err
		}
		clanRankMap := make(map[string]bson.M, len(clanRankings))
		for _, r := range clanRankings {
			if tag, ok := r["tag"].(string); ok {
				clanRankMap[tag] = r
			}
		}

		// Fetch clan stats
		clanStatsCur, err := a.Store.C.ClanStats.Find(ctx, bson.M{"tag": bson.M{"$in": clanTags}})
		if err != nil {
			return err
		}
		var clanStatsList []bson.M
		if err := clanStatsCur.All(ctx, &clanStatsList); err != nil {
			return err
		}
		clanStatsMap := make(map[string]bson.M, len(clanStatsList))
		for _, s := range clanStatsList {
			if tag, ok := s["tag"].(string); ok {
				clanStatsMap[tag] = s
			}
		}

		// Build clan entries
		type clanEntry struct {
			data map[string]any
			rank *int64
		}
		clanEntries := make([]clanEntry, 0, len(clans))
		for _, clan := range clans {
			tag, _ := clan["tag"].(string)
			ranking := clanRankMap[tag]
			stats := clanStatsMap[tag]
			entry := map[string]any{
				"clan_tag":       tag,
				"clan_name":      clanNameMap[tag],
				"clan_level":     stats["level"],
				"clan_points":    stats["points"],
				"member_count":   stats["memberCount"],
				"global_rank":    ranking["global_rank"],
				"local_rank":     ranking["local_rank"],
				"country_code":   ranking["country_code"],
				"country_name":   ranking["country_name"],
				"capital_points": stats["capitalPoints"],
			}
			var rankPtr *int64
			if gr, ok := ranking["global_rank"]; ok && gr != nil {
				v := asInt64(gr)
				rankPtr = &v
			}
			clanEntries = append(clanEntries, clanEntry{data: entry, rank: rankPtr})
		}

		sort.SliceStable(clanEntries, func(i, j int) bool {
			ri, rj := clanEntries[i].rank, clanEntries[j].rank
			if ri == nil && rj == nil {
				return false
			}
			if ri == nil {
				return false
			}
			if rj == nil {
				return true
			}
			return *ri < *rj
		})
		if len(clanEntries) > limitClans {
			clanEntries = clanEntries[:limitClans]
		}
		clanResult := make([]map[string]any, len(clanEntries))
		for i, e := range clanEntries {
			clanResult[i] = e.data
		}

		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"server_id":     serverID,
			"total_players": len(playerStats),
			"total_clans":   len(clans),
			"players":       players,
			"clans":         clanResult,
		})
	}
}

// getServerWarLeaderboard godoc
// @Summary Get war performance leaderboard
// @Router /v2/{server_id}/leaderboards/war-performance [get]
// @Tags Server Leaderboards

// @Param server_id path int true "Server ID"
// @Param limit query int false "Max results (default 100, max 500)"
// @Success 200 {object} map[string]interface{}
func getServerWarLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		limit := clamp(queryIntDefault(c, "limit", 100), 1, 500)
		ctx := c.UserContext()

		clanTags, clanNameMap, playerTags, err := lbGetServerClanAndPlayers(a, ctx, serverID)
		if err != nil {
			return err
		}
		_ = clanTags

		// Aggregate war stats from clan_war collection
		pipeline := bson.A{
			bson.M{"$match": bson.M{"$or": bson.A{
				bson.M{"data.clan.members.tag": bson.M{"$in": playerTags}},
				bson.M{"data.opponent.members.tag": bson.M{"$in": playerTags}},
			}}},
			bson.M{"$project": bson.M{
				"clan_members":     "$data.clan.members",
				"opponent_members": "$data.opponent.members",
			}},
		}
		cur, err := a.Store.C.ClanWars.Aggregate(ctx, pipeline)
		if err != nil {
			return err
		}
		var wars []bson.M
		if err := cur.All(ctx, &wars); err != nil {
			return err
		}

		type warStats struct {
			name       string
			totalStars int64
			totalDestr float64
			attacks    int64
			defenses   int64
			triples    int64
			warCount   int64
		}
		statsMap := map[string]*warStats{}
		tagSet := map[string]bool{}
		for _, t := range playerTags {
			tagSet[t] = true
		}

		for _, war := range wars {
			for _, side := range []string{"clan_members", "opponent_members"} {
				members, _ := war[side].(bson.A)
				for _, m := range members {
					mem, ok := m.(bson.M)
					if !ok {
						continue
					}
					tag, _ := mem["tag"].(string)
					if !tagSet[tag] {
						continue
					}
					if _, exists := statsMap[tag]; !exists {
						name, _ := mem["name"].(string)
						statsMap[tag] = &warStats{name: name}
					}
					s := statsMap[tag]
					attacks, _ := mem["attacks"].(bson.A)
					for _, atk := range attacks {
						a2, ok := atk.(bson.M)
						if !ok {
							continue
						}
						stars := asInt64(a2["stars"])
						destr := lbAsFloat(a2["destructionPercentage"])
						s.totalStars += stars
						s.totalDestr += destr
						s.attacks++
						if stars == 3 {
							s.triples++
						}
					}
					s.defenses++
					s.warCount++
				}
			}
		}

		playerInfoMap, _ := lbGetPlayerInfoMap(a, ctx, playerTags)

		type entry struct {
			data   map[string]any
			stars  int64
			avgStr float64
		}
		entries := make([]entry, 0, len(statsMap))
		for tag, s := range statsMap {
			avgStars := 0.0
			avgDestr := 0.0
			if s.attacks > 0 {
				avgStars = float64(s.totalStars) / float64(s.attacks)
				avgDestr = s.totalDestr / float64(s.attacks)
			}
			pInfo := playerInfoMap[tag]
			clanTag, clanName := lbClanFromPlayer(pInfo, clanNameMap)
			entries = append(entries, entry{
				data: map[string]any{
					"player_tag":          tag,
					"player_name":         asStringOr(pInfo["name"], s.name),
					"townhall_level":      pInfo["townhall"],
					"clan_tag":            clanTag,
					"clan_name":           clanName,
					"total_stars":         s.totalStars,
					"total_destruction":   lbRound(s.totalDestr, 2),
					"attack_count":        s.attacks,
					"defense_count":       s.defenses,
					"triple_stars":        s.triples,
					"average_stars":       lbRound(avgStars, 2),
					"average_destruction": lbRound(avgDestr, 2),
					"war_count":           s.warCount,
				},
				stars:  s.totalStars,
				avgStr: avgStars,
			})
		}
		sort.SliceStable(entries, func(i, j int) bool {
			if entries[i].stars != entries[j].stars {
				return entries[i].stars > entries[j].stars
			}
			return entries[i].avgStr > entries[j].avgStr
		})
		if len(entries) > limit {
			entries = entries[:limit]
		}
		result := make([]map[string]any, len(entries))
		for i, e := range entries {
			result[i] = e.data
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"server_id":   serverID,
			"total_count": len(statsMap),
			"players":     result,
		})
	}
}

// getServerDonationsLeaderboard godoc
// @Summary Get donations leaderboard
// @Router /v2/{server_id}/leaderboards/donations [get]
// @Tags Server Leaderboards

// @Param server_id path int true "Server ID"
// @Param limit query int false "Max results (default 100, max 500)"
// @Param sort_by query string false "sent | received | ratio (default: sent)"
// @Success 200 {object} map[string]interface{}
func getServerDonationsLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		limit := clamp(queryIntDefault(c, "limit", 100), 1, 500)
		sortBy := c.Query("sort_by", "sent")
		ctx := c.UserContext()

		clanTags, clanNameMap, _, err := lbGetServerClanAndPlayers(a, ctx, serverID)
		if err != nil {
			return err
		}

		type donEntry struct {
			data     map[string]any
			sent     int
			received int
			ratio    float64
		}
		entries := make([]donEntry, 0)

		for _, clanTag := range clanTags {
			clan, err := a.Clash.GetClan(ctx, clanTag)
			if err != nil || clan == nil {
				continue
			}
			for _, m := range clan.Members {
				var ratio *float64
				if m.Received > 0 {
					r := lbRound(float64(m.Donations)/float64(m.Received), 2)
					ratio = &r
				}
				ratioVal := 0.0
				if ratio != nil {
					ratioVal = *ratio
				}
				entries = append(entries, donEntry{
					data: map[string]any{
						"player_tag":         m.Tag,
						"player_name":        m.Name,
						"clan_tag":           clanTag,
						"clan_name":          clanNameMap[clanTag],
						"donations_sent":     m.Donations,
						"donations_received": m.Received,
						"donation_ratio":     ratio,
					},
					sent:     m.Donations,
					received: m.Received,
					ratio:    ratioVal,
				})
			}
		}

		switch sortBy {
		case "received":
			sort.SliceStable(entries, func(i, j int) bool { return entries[i].received > entries[j].received })
		case "ratio":
			sort.SliceStable(entries, func(i, j int) bool { return entries[i].ratio > entries[j].ratio })
		default:
			sort.SliceStable(entries, func(i, j int) bool { return entries[i].sent > entries[j].sent })
		}
		if len(entries) > limit {
			entries = entries[:limit]
		}
		result := make([]map[string]any, len(entries))
		for i, e := range entries {
			result[i] = e.data
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"server_id":   serverID,
			"total_count": len(result),
			"players":     result,
		})
	}
}

// getServerCapitalRaidsLeaderboard godoc
// @Summary Get capital raids leaderboard
// @Router /v2/{server_id}/leaderboards/capital-raids [get]
// @Tags Server Leaderboards

// @Param server_id path int true "Server ID"
// @Param limit query int false "Max results (default 100, max 500)"
// @Param weekend query string false "Weekend date YYYY-MM-DD (defaults to latest)"
// @Success 200 {object} map[string]interface{}
func getServerCapitalRaidsLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		limit := clamp(queryIntDefault(c, "limit", 100), 1, 500)
		weekend := c.Query("weekend")
		ctx := c.UserContext()

		_, clanNameMap, playerTags, err := lbGetServerClanAndPlayers(a, ctx, serverID)
		if err != nil {
			return err
		}

		raidFilter := bson.M{"data.members.tag": bson.M{"$in": playerTags}}
		if weekend != "" {
			raidFilter["data.startTime"] = bson.M{"$regex": "^" + weekend}
		}
		findOpts := options.Find().SetSort(bson.M{"data.startTime": -1}).SetLimit(10)
		raidCur, err := a.Store.C.RaidWeekendDB.Find(ctx, raidFilter, findOpts)
		if err != nil {
			return err
		}
		var raids []bson.M
		if err := raidCur.All(ctx, &raids); err != nil {
			return err
		}

		type raidStats struct {
			name       string
			totalGold  int64
			totalRaids int64
			totalAtk   int64
		}
		statsMap := map[string]*raidStats{}
		tagSet := map[string]bool{}
		for _, t := range playerTags {
			tagSet[t] = true
		}

		for _, raid := range raids {
			data, _ := raid["data"].(bson.M)
			if data == nil {
				continue
			}
			members, _ := data["members"].(bson.A)
			for _, m := range members {
				mem, ok := m.(bson.M)
				if !ok {
					continue
				}
				tag, _ := mem["tag"].(string)
				if !tagSet[tag] {
					continue
				}
				if _, exists := statsMap[tag]; !exists {
					name, _ := mem["name"].(string)
					statsMap[tag] = &raidStats{name: name}
				}
				s := statsMap[tag]
				s.totalGold += asInt64(mem["capitalResourcesLooted"])
				s.totalAtk += asInt64(mem["attacks"])
				s.totalRaids++
			}
		}

		playerInfoMap, _ := lbGetPlayerInfoMap(a, ctx, playerTags)

		type entry struct {
			data map[string]any
			gold int64
		}
		entries := make([]entry, 0, len(statsMap))
		for tag, s := range statsMap {
			avg := 0.0
			if s.totalRaids > 0 {
				avg = float64(s.totalGold) / float64(s.totalRaids)
			}
			pInfo := playerInfoMap[tag]
			clanTag, clanName := lbClanFromPlayer(pInfo, clanNameMap)
			entries = append(entries, entry{
				data: map[string]any{
					"player_tag":           tag,
					"player_name":          asStringOr(pInfo["name"], s.name),
					"townhall_level":       pInfo["townhall"],
					"clan_tag":             clanTag,
					"clan_name":            clanName,
					"total_capital_gold":   s.totalGold,
					"total_raids":          s.totalRaids,
					"average_capital_gold": lbRound(avg, 2),
					"total_attacks":        s.totalAtk,
				},
				gold: s.totalGold,
			})
		}
		sort.SliceStable(entries, func(i, j int) bool { return entries[i].gold > entries[j].gold })
		if len(entries) > limit {
			entries = entries[:limit]
		}
		result := make([]map[string]any, len(entries))
		for i, e := range entries {
			result[i] = e.data
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"server_id":   serverID,
			"total_count": len(statsMap),
			"players":     result,
		})
	}
}

// getServerLegendsLeaderboard godoc
// @Summary Get legend league leaderboard
// @Router /v2/{server_id}/leaderboards/legends [get]
// @Tags Server Leaderboards

func getServerLegendsLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		limit := clamp(queryIntDefault(c, "limit", 100), 1, 500)
		days := clamp(queryIntDefault(c, "days", 7), 1, 30)

		ctx := c.UserContext()

		// Get clans for this server
		clanCur, err := a.Store.C.ClanDB.Find(ctx, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		var serverClans []bson.M
		if err := clanCur.All(ctx, &serverClans); err != nil {
			return err
		}
		clanTags := make([]string, 0, len(serverClans))
		clanNameMap := make(map[string]string, len(serverClans))
		for _, clan := range serverClans {
			if tag, ok := clan["tag"].(string); ok {
				clanTags = append(clanTags, tag)
				clanNameMap[tag], _ = clan["name"].(string)
			}
		}

		// Build date list
		dateList := make([]string, days)
		for i := 0; i < days; i++ {
			dateList[i] = time.Now().UTC().AddDate(0, 0, -i).Format("2006-01-02")
		}

		// Build projection
		proj := bson.M{"tag": 1, "name": 1, "townhall": 1, "clan": 1, "legends.streak": 1, "_id": 0}
		for _, d := range dateList {
			proj["legends."+d] = 1
		}

		playerCur, err := a.Store.C.PlayerStats.Find(ctx,
			bson.M{"clan.tag": bson.M{"$in": clanTags}},
			options.Find().SetProjection(proj),
		)
		if err != nil {
			return err
		}
		var playerStats []bson.M
		if err := playerCur.All(ctx, &playerStats); err != nil {
			return err
		}

		type legendEntry struct {
			data         map[string]any
			trophyChange int64
			trophies     int64
		}
		entries := make([]legendEntry, 0, len(playerStats))

		for _, p := range playerStats {
			legends, _ := p["legends"].(bson.M)
			if legends == nil {
				continue
			}
			var totalAttacks, totalDef, attackWins, defWins int64
			var trophyChange int64
			var currentTrophies int64
			for _, d := range dateList {
				dayData, _ := legends[d].(bson.M)
				if dayData == nil {
					continue
				}
				atk := asInt64(dayData["attack_sum"])
				def := asInt64(dayData["defense_sum"])
				trophyChange += atk - def
				currentTrophies += atk
				totalAttacks += asInt64(dayData["num_attacks"])
				totalDef += asInt64(dayData["num_defenses"])
				if atk > 0 {
					attackWins++
				}
				if def > 0 {
					defWins++
				}
			}
			clanMap, _ := p["clan"].(bson.M)
			clanTag := ""
			clanName := ""
			if clanMap != nil {
				clanTag, _ = clanMap["tag"].(string)
				clanName = clanNameMap[clanTag]
			}
			entry := map[string]any{
				"player_tag":       p["tag"],
				"player_name":      asStringOr(p["name"], "Unknown"),
				"townhall_level":   p["townhall"],
				"clan_tag":         clanTag,
				"clan_name":        clanName,
				"trophy_change":    trophyChange,
				"current_trophies": currentTrophies,
				"attack_wins":      attackWins,
				"defense_wins":     defWins,
				"total_attacks":    totalAttacks,
				"total_defenses":   totalDef,
				"streak":           legends["streak"],
			}
			entries = append(entries, legendEntry{data: entry, trophyChange: trophyChange, trophies: currentTrophies})
		}

		sort.SliceStable(entries, func(i, j int) bool {
			if entries[i].trophyChange != entries[j].trophyChange {
				return entries[i].trophyChange > entries[j].trophyChange
			}
			return entries[i].trophies > entries[j].trophies
		})
		if len(entries) > limit {
			entries = entries[:limit]
		}
		result := make([]map[string]any, len(entries))
		for i, e := range entries {
			result[i] = e.data
		}

		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"server_id":   serverID,
			"total_count": len(entries),
			"players":     result,
		})
	}
}

// getServerClanGamesLeaderboard godoc
// @Summary Get clan games leaderboard
// @Router /v2/{server_id}/leaderboards/clan-games [get]
// @Tags Server Leaderboards

// @Param server_id path int true "Server ID"
// @Param limit query int false "Max results (default 100, max 500)"
// @Param season query string false "Season YYYY-MM (defaults to current)"
// @Success 200 {object} map[string]interface{}
func getServerClanGamesLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		limit := clamp(queryIntDefault(c, "limit", 100), 1, 500)
		season := c.Query("season", lbCurrentSeason())
		ctx := c.UserContext()

		_, clanNameMap, playerTags, err := lbGetServerClanAndPlayers(a, ctx, serverID)
		if err != nil {
			return err
		}

		pointsField := "clan_games." + season + ".points"
		cur, err := a.Store.C.PlayerStats.Find(ctx,
			bson.M{"tag": bson.M{"$in": playerTags}, pointsField: bson.M{"$exists": true}},
			options.Find().SetProjection(bson.M{
				"tag": 1, "name": 1, "townhall": 1, "clan": 1,
				"clan_games": 1, "_id": 0,
			}),
		)
		if err != nil {
			return err
		}
		var docs []bson.M
		if err := cur.All(ctx, &docs); err != nil {
			return err
		}

		type entry struct {
			data   map[string]any
			points int64
		}
		entries := make([]entry, 0, len(docs))
		for _, p := range docs {
			clanGames, _ := p["clan_games"].(bson.M)
			if clanGames == nil {
				continue
			}
			seasonData, _ := clanGames[season].(bson.M)
			if seasonData == nil {
				continue
			}
			points := asInt64(seasonData["points"])
			if points == 0 {
				continue
			}
			clanTag, clanName := lbClanFromPlayer(p, clanNameMap)
			entries = append(entries, entry{
				data: map[string]any{
					"player_tag":     p["tag"],
					"player_name":    asStringOr(p["name"], "Unknown"),
					"townhall_level": p["townhall"],
					"clan_tag":       clanTag,
					"clan_name":      clanName,
					"points":         points,
					"season":         season,
				},
				points: points,
			})
		}
		sort.SliceStable(entries, func(i, j int) bool { return entries[i].points > entries[j].points })
		if len(entries) > limit {
			entries = entries[:limit]
		}
		result := make([]map[string]any, len(entries))
		for i, e := range entries {
			result[i] = e.data
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"server_id":   serverID,
			"season":      season,
			"total_count": len(result),
			"players":     result,
		})
	}
}

// getServerActivityLeaderboard godoc
// @Summary Get activity leaderboard
// @Router /v2/{server_id}/leaderboards/activity [get]
// @Tags Server Leaderboards

// @Param server_id path int true "Server ID"
// @Param limit query int false "Max results (default 100, max 500)"
// @Param season query string false "Season YYYY-MM (defaults to current)"
// @Success 200 {object} map[string]interface{}
func getServerActivityLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		limit := clamp(queryIntDefault(c, "limit", 100), 1, 500)
		season := c.Query("season", lbCurrentSeason())
		ctx := c.UserContext()

		_, clanNameMap, playerTags, err := lbGetServerClanAndPlayers(a, ctx, serverID)
		if err != nil {
			return err
		}

		activityField := "activity." + season
		cur, err := a.Store.C.PlayerStats.Find(ctx,
			bson.M{"tag": bson.M{"$in": playerTags}},
			options.Find().SetProjection(bson.M{
				"tag": 1, "name": 1, "townhall": 1, "clan": 1,
				"activity": 1, "last_online": 1, "_id": 0,
			}),
		)
		if err != nil {
			return err
		}
		var docs []bson.M
		if err := cur.All(ctx, &docs); err != nil {
			return err
		}
		_ = activityField

		type entry struct {
			data     map[string]any
			activity int64
		}
		entries := make([]entry, 0, len(docs))
		for _, p := range docs {
			activity, _ := p["activity"].(bson.M)
			var count int64
			if activity != nil {
				if seasonData, ok := activity[season]; ok {
					count = asInt64(seasonData)
				}
			}
			clanTag, clanName := lbClanFromPlayer(p, clanNameMap)
			entries = append(entries, entry{
				data: map[string]any{
					"player_tag":     p["tag"],
					"player_name":    asStringOr(p["name"], "Unknown"),
					"townhall_level": p["townhall"],
					"clan_tag":       clanTag,
					"clan_name":      clanName,
					"activity_count": count,
					"last_online":    p["last_online"],
					"season":         season,
				},
				activity: count,
			})
		}
		sort.SliceStable(entries, func(i, j int) bool { return entries[i].activity > entries[j].activity })
		if len(entries) > limit {
			entries = entries[:limit]
		}
		result := make([]map[string]any, len(entries))
		for i, e := range entries {
			result[i] = e.data
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"server_id":   serverID,
			"season":      season,
			"total_count": len(result),
			"players":     result,
		})
	}
}

// getServerLootingLeaderboard godoc
// @Summary Get looting leaderboard
// @Router /v2/{server_id}/leaderboards/looting [get]
// @Tags Server Leaderboards

// @Param server_id path int true "Server ID"
// @Param limit query int false "Max results (default 100, max 500)"
// @Param season query string false "Season YYYY-MM (defaults to current)"
// @Param sort_by query string false "gold | elixir | dark_elixir | total (default: total)"
// @Success 200 {object} map[string]interface{}
func getServerLootingLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		limit := clamp(queryIntDefault(c, "limit", 100), 1, 500)
		season := c.Query("season", lbCurrentSeason())
		sortBy := c.Query("sort_by", "total")
		ctx := c.UserContext()

		_, clanNameMap, playerTags, err := lbGetServerClanAndPlayers(a, ctx, serverID)
		if err != nil {
			return err
		}

		cur, err := a.Store.C.PlayerStats.Find(ctx,
			bson.M{"tag": bson.M{"$in": playerTags}},
			options.Find().SetProjection(bson.M{
				"tag": 1, "name": 1, "townhall": 1, "clan": 1,
				"gold": 1, "elixir": 1, "dark_elixir": 1, "_id": 0,
			}),
		)
		if err != nil {
			return err
		}
		var docs []bson.M
		if err := cur.All(ctx, &docs); err != nil {
			return err
		}

		type entry struct {
			data       map[string]any
			gold       int64
			elixir     int64
			darkElixir int64
			total      int64
		}
		entries := make([]entry, 0, len(docs))
		for _, p := range docs {
			lootField := func(key string) int64 {
				m, _ := p[key].(bson.M)
				if m == nil {
					return 0
				}
				return asInt64(m[season])
			}
			gold := lootField("gold")
			elixir := lootField("elixir")
			darkElixir := lootField("dark_elixir")
			total := gold + elixir + darkElixir
			clanTag, clanName := lbClanFromPlayer(p, clanNameMap)
			entries = append(entries, entry{
				data: map[string]any{
					"player_tag":     p["tag"],
					"player_name":    asStringOr(p["name"], "Unknown"),
					"townhall_level": p["townhall"],
					"clan_tag":       clanTag,
					"clan_name":      clanName,
					"gold":           gold,
					"elixir":         elixir,
					"dark_elixir":    darkElixir,
					"total":          total,
					"season":         season,
				},
				gold:       gold,
				elixir:     elixir,
				darkElixir: darkElixir,
				total:      total,
			})
		}
		switch sortBy {
		case "gold":
			sort.SliceStable(entries, func(i, j int) bool { return entries[i].gold > entries[j].gold })
		case "elixir":
			sort.SliceStable(entries, func(i, j int) bool { return entries[i].elixir > entries[j].elixir })
		case "dark_elixir":
			sort.SliceStable(entries, func(i, j int) bool { return entries[i].darkElixir > entries[j].darkElixir })
		default:
			sort.SliceStable(entries, func(i, j int) bool { return entries[i].total > entries[j].total })
		}
		if len(entries) > limit {
			entries = entries[:limit]
		}
		result := make([]map[string]any, len(entries))
		for i, e := range entries {
			result[i] = e.data
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"server_id":   serverID,
			"season":      season,
			"sort_by":     sortBy,
			"total_count": len(result),
			"players":     result,
		})
	}
}

// --- lb helpers ---

func lbCurrentSeason() string {
	return time.Now().UTC().Format("2006-01")
}

func lbAsFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int:
		return float64(x)
	case int32:
		return float64(x)
	case int64:
		return float64(x)
	}
	return 0
}

func lbRound(f float64, decimals int) float64 {
	pow := math.Pow(10, float64(decimals))
	return math.Round(f*pow) / pow
}

func lbGetServerClanAndPlayers(a apptypes.Deps, ctx context.Context, serverID int) (clanTags []string, clanNameMap map[string]string, playerTags []string, err error) {
	clanCur, err := a.Store.C.ClanDB.Find(ctx, bson.M{"server": serverID})
	if err != nil {
		return
	}
	var clans []bson.M
	if err = clanCur.All(ctx, &clans); err != nil {
		return
	}
	if len(clans) == 0 {
		err = apptypes.Error(http.StatusNotFound, "No clans found for this server")
		return
	}
	clanTags = make([]string, 0, len(clans))
	clanNameMap = make(map[string]string, len(clans))
	for _, clan := range clans {
		tag, _ := clan["tag"].(string)
		name, _ := clan["name"].(string)
		if tag != "" {
			clanTags = append(clanTags, tag)
			clanNameMap[tag] = name
		}
	}
	playerCur, err := a.Store.C.PlayerStats.Find(ctx,
		bson.M{"clan.tag": bson.M{"$in": clanTags}},
		options.Find().SetProjection(bson.M{"tag": 1, "_id": 0}),
	)
	if err != nil {
		return
	}
	var playerDocs []bson.M
	if err = playerCur.All(ctx, &playerDocs); err != nil {
		return
	}
	playerTags = make([]string, 0, len(playerDocs))
	for _, p := range playerDocs {
		if tag, ok := p["tag"].(string); ok {
			playerTags = append(playerTags, tag)
		}
	}
	return
}

func lbGetPlayerInfoMap(a apptypes.Deps, ctx context.Context, playerTags []string) (map[string]bson.M, error) {
	cur, err := a.Store.C.PlayerStats.Find(ctx,
		bson.M{"tag": bson.M{"$in": playerTags}},
		options.Find().SetProjection(bson.M{"tag": 1, "name": 1, "townhall": 1, "clan": 1, "_id": 0}),
	)
	if err != nil {
		return nil, err
	}
	var docs []bson.M
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	m := make(map[string]bson.M, len(docs))
	for _, d := range docs {
		if tag, ok := d["tag"].(string); ok {
			m[tag] = d
		}
	}
	return m, nil
}

func lbClanFromPlayer(pInfo bson.M, clanNameMap map[string]string) (string, string) {
	if pInfo == nil {
		return "", ""
	}
	clanMap, _ := pInfo["clan"].(bson.M)
	if clanMap == nil {
		return "", ""
	}
	clanTag, _ := clanMap["tag"].(string)
	clanName := clanNameMap[clanTag]
	if clanName == "" {
		clanName, _ = clanMap["name"].(string)
	}
	return clanTag, clanName
}

// --- helpers ---

func queryIntDefault(c *fiber.Ctx, key string, def int) int {
	raw := c.Query(key)
	if raw == "" {
		return def
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	return v
}

func clamp(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func asStringOr(v any, def string) string {
	if s, ok := v.(string); ok && s != "" {
		return s
	}
	return def
}
