package routes

import (
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
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param limit_players query int false "Max players to return (default 100, max 500)"
// @Param limit_clans query int false "Max clans to return (default 50, max 200)"
// @Param sort_by query string false "Sort by: global_rank, local_rank, trophies, legend_trophies"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/leaderboards [get]
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
		clanCur, err := a.Store.C.ClanDB.Find(ctx, bson.M{"server": serverID})
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
		rankCur, err := a.Store.C.LeaderboardDB.Find(ctx, bson.M{"tag": bson.M{"$in": playerTags}})
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
			data map[string]any
			rank *int64
			trophies int64
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
				"clan_tag":      tag,
				"clan_name":     clanNameMap[tag],
				"clan_level":    stats["level"],
				"clan_points":   stats["points"],
				"member_count":  stats["memberCount"],
				"global_rank":   ranking["global_rank"],
				"local_rank":    ranking["local_rank"],
				"country_code":  ranking["country_code"],
				"country_name":  ranking["country_name"],
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
// @Router /v2/server/{server_id}/leaderboards/war-performance [get]
// @Tags Server Leaderboards
// @Security ApiKeyAuth
func getServerWarLeaderboard(_ apptypes.Deps) fiber.Handler { return notImplemented() }

// getServerDonationsLeaderboard godoc
// @Summary Get donations leaderboard
// @Router /v2/server/{server_id}/leaderboards/donations [get]
// @Tags Server Leaderboards
// @Security ApiKeyAuth
func getServerDonationsLeaderboard(_ apptypes.Deps) fiber.Handler { return notImplemented() }

// getServerCapitalRaidsLeaderboard godoc
// @Summary Get capital raids leaderboard
// @Router /v2/server/{server_id}/leaderboards/capital-raids [get]
// @Tags Server Leaderboards
// @Security ApiKeyAuth
func getServerCapitalRaidsLeaderboard(_ apptypes.Deps) fiber.Handler { return notImplemented() }

// getServerLegendsLeaderboard godoc
// @Summary Get legend league leaderboard
// @Router /v2/server/{server_id}/leaderboards/legends [get]
// @Tags Server Leaderboards
// @Security ApiKeyAuth
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
				"player_tag":     p["tag"],
				"player_name":    asStringOr(p["name"], "Unknown"),
				"townhall_level": p["townhall"],
				"clan_tag":       clanTag,
				"clan_name":      clanName,
				"trophy_change":  trophyChange,
				"current_trophies": currentTrophies,
				"attack_wins":    attackWins,
				"defense_wins":   defWins,
				"total_attacks":  totalAttacks,
				"total_defenses": totalDef,
				"streak":         legends["streak"],
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
// @Router /v2/server/{server_id}/leaderboards/clan-games [get]
// @Tags Server Leaderboards
// @Security ApiKeyAuth
func getServerClanGamesLeaderboard(_ apptypes.Deps) fiber.Handler { return notImplemented() }

// getServerActivityLeaderboard godoc
// @Summary Get activity leaderboard
// @Router /v2/server/{server_id}/leaderboards/activity [get]
// @Tags Server Leaderboards
// @Security ApiKeyAuth
func getServerActivityLeaderboard(_ apptypes.Deps) fiber.Handler { return notImplemented() }

// getServerLootingLeaderboard godoc
// @Summary Get looting leaderboard
// @Router /v2/server/{server_id}/leaderboards/looting [get]
// @Tags Server Leaderboards
// @Security ApiKeyAuth
func getServerLootingLeaderboard(_ apptypes.Deps) fiber.Handler { return notImplemented() }

func notImplemented() fiber.Handler {
	return func(_ *fiber.Ctx) error {
		return apptypes.Error(fiber.StatusNotImplemented, "Not implemented yet")
	}
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
