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
)

// getServerLeaderboards godoc
// @Summary Get server leaderboards
// @Description Returns player and clan ranking leaderboards for a server.
// @Tags Server Leaderboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param limit_players query int false "Maximum number of players"
// @Param limit_clans query int false "Maximum number of clans"
// @Param sort_by query string false "Player sort key"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
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

		clanTags, clanNameMap, playerTags, err := lbGetServerClanAndPlayers(a, ctx, serverID)
		if err != nil {
			return err
		}
		if len(clanTags) == 0 {
			return apptypes.Error(http.StatusNotFound, "No clans found for this server")
		}
		playerInfo, err := lbGetPlayerInfoMap(a, ctx, playerTags)
		if err != nil {
			return err
		}
		playerRanks, err := lbPlayerRankMap(a, ctx, playerTags)
		if err != nil {
			return err
		}

		type playerEntry struct {
			data           map[string]any
			rank           *int64
			trophies       int64
			legendTrophies int64
		}
		playerEntries := make([]playerEntry, 0, len(playerTags))
		for _, tag := range playerTags {
			info := playerInfo[tag]
			ranking := playerRanks[tag]
			clanTag, clanName := lbClanFromPlayer(info, clanNameMap)
			entry := map[string]any{
				"player_tag":      tag,
				"player_name":     asStringOr(info["name"], "Unknown"),
				"townhall_level":  info["townhall"],
				"clan_tag":        clanTag,
				"clan_name":       clanName,
				"trophies":        info["trophies"],
				"global_rank":     ranking["global_rank"],
				"local_rank":      ranking["local_rank"],
				"country_code":    ranking["country_code"],
				"country_name":    ranking["country_name"],
				"legend_trophies": ranking["legend_trophies"],
			}
			var rankPtr *int64
			if gr := ranking[sortBy]; gr != nil {
				v := asInt64(gr)
				if v > 0 {
					rankPtr = &v
				}
			}
			playerEntries = append(playerEntries, playerEntry{
				data:           entry,
				rank:           rankPtr,
				trophies:       asInt64(info["trophies"]),
				legendTrophies: asInt64(ranking["legend_trophies"]),
			})
		}
		sort.SliceStable(playerEntries, func(i, j int) bool {
			switch sortBy {
			case "trophies":
				return playerEntries[i].trophies > playerEntries[j].trophies
			case "legend_trophies":
				return playerEntries[i].legendTrophies > playerEntries[j].legendTrophies
			default:
				ri, rj := playerEntries[i].rank, playerEntries[j].rank
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
		players := make([]map[string]any, 0, len(playerEntries))
		for _, entry := range playerEntries {
			players = append(players, entry.data)
		}

		clanRanks, err := lbClanRankMap(a, ctx, clanTags)
		if err != nil {
			return err
		}
		clans := make([]map[string]any, 0, len(clanTags))
		for _, tag := range clanTags {
			ranking := clanRanks[tag]
			item := map[string]any{
				"clan_tag":       tag,
				"clan_name":      clanNameMap[tag],
				"global_rank":    ranking["global_rank"],
				"local_rank":     ranking["local_rank"],
				"country_code":   ranking["country_code"],
				"country_name":   ranking["country_name"],
				"clan_level":     ranking["clan_level"],
				"clan_points":    ranking["clan_points"],
				"member_count":   ranking["member_count"],
				"capital_points": ranking["capital_points"],
			}
			clans = append(clans, item)
		}
		sort.SliceStable(clans, func(i, j int) bool {
			return asInt64(clans[i]["global_rank"]) < asInt64(clans[j]["global_rank"])
		})
		if len(clans) > limitClans {
			clans = clans[:limitClans]
		}

		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"server_id":     serverID,
			"total_players": len(playerTags),
			"total_clans":   len(clanTags),
			"players":       players,
			"clans":         clans,
		})
	}
}

// getServerWarLeaderboard godoc
// @Summary Get server war performance leaderboard
// @Description Returns players ranked by war attack performance for a server.
// @Tags Server Leaderboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param limit query int false "Maximum number of rows"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/server/{server_id}/leaderboards/war-performance [get]
func getServerWarLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		limit := clamp(queryIntDefault(c, "limit", 100), 1, 500)
		_, clanNameMap, playerTags, err := lbGetServerClanAndPlayers(a, c.UserContext(), serverID)
		if err != nil {
			return err
		}
		info, err := lbGetPlayerInfoMap(a, c.UserContext(), playerTags)
		if err != nil {
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT attacker_tag, count(*)::bigint, COALESCE(sum(stars), 0)::bigint,
			       COALESCE(avg(stars), 0)::float8, COALESCE(avg(destruction_percentage), 0)::float8
			FROM war_attack_events
			WHERE attacker_tag = ANY($1)
			  AND war_type <> 'friendly'
			GROUP BY attacker_tag
			ORDER BY sum(stars) DESC, count(*) DESC
			LIMIT $2
		`, playerTags, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		rank := 1
		for rows.Next() {
			var tag string
			var attacks, stars int64
			var avgStars, avgDest float64
			if err := rows.Scan(&tag, &attacks, &stars, &avgStars, &avgDest); err != nil {
				return err
			}
			clanTag, clanName := lbClanFromPlayer(info[tag], clanNameMap)
			items = append(items, map[string]any{
				"rank":                   rank,
				"player_tag":             tag,
				"player_name":            asStringOr(info[tag]["name"], "Unknown"),
				"townhall_level":         info[tag]["townhall"],
				"clan_tag":               clanTag,
				"clan_name":              clanName,
				"total_attacks":          attacks,
				"total_stars":            stars,
				"average_stars":          lbRound(avgStars, 2),
				"average_destruction":    lbRound(avgDest, 2),
				"three_star_attacks":     nil,
				"three_star_rate":        nil,
				"destruction_percentage": lbRound(avgDest, 2),
			})
			rank++
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"server_id": serverID, "items": items, "total": len(items)})
	}
}

// getServerDonationsLeaderboard godoc
// @Summary Get server donations leaderboard
// @Description Returns players ranked by season donations for a server.
// @Tags Server Leaderboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param season query string false "Season YYYY-MM"
// @Param limit query int false "Maximum number of rows"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/server/{server_id}/leaderboards/donations [get]
func getServerDonationsLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return seasonStatLeaderboard(c, a, "donations", func(row map[string]any) float64 {
			return lbAsFloat(mapMaybe(row["donations"])["donated"])
		})
	}
}

// getServerCapitalRaidsLeaderboard godoc
// @Summary Get server capital raids leaderboard
// @Description Returns players ranked by recent capital raid loot for a server.
// @Tags Server Leaderboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param limit query int false "Maximum number of rows"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/server/{server_id}/leaderboards/capital-raids [get]
func getServerCapitalRaidsLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		limit := clamp(queryIntDefault(c, "limit", 100), 1, 500)
		clanTags, clanNameMap, _, err := lbGetServerClanAndPlayers(a, c.UserContext(), serverID)
		if err != nil {
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT clan_tag, members
			FROM raid_weekends
			WHERE clan_tag = ANY($1)
			ORDER BY start_time DESC
			LIMIT 50
		`, clanTags)
		if err != nil {
			return err
		}
		defer rows.Close()
		scores := map[string]map[string]any{}
		for rows.Next() {
			var clanTag string
			var membersRaw []byte
			if err := rows.Scan(&clanTag, &membersRaw); err != nil {
				return err
			}
			for _, member := range anyMapSlice(decodeJSONAny(membersRaw)) {
				tag := serverAsString(member["tag"])
				if tag == "" {
					continue
				}
				item := scores[tag]
				if item == nil {
					item = map[string]any{"player_tag": tag, "player_name": member["name"], "clan_tag": clanTag, "clan_name": clanNameMap[clanTag]}
					scores[tag] = item
				}
				item["capital_gold"] = lbAsFloat(item["capital_gold"]) + lbAsFloat(member["capitalResourcesLooted"])
				item["attacks"] = lbAsFloat(item["attacks"]) + lbAsFloat(member["attacks"])
			}
		}
		items := mapsByScore(scores, "capital_gold", limit)
		return apptypes.JSON(c, http.StatusOK, map[string]any{"server_id": serverID, "items": items, "total": len(items)})
	}
}

// getServerLegendsLeaderboard godoc
// @Summary Get server legends leaderboard
// @Description Returns tracked legend players ranked by trophies for a server.
// @Tags Server Leaderboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param limit query int false "Maximum number of rows"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/server/{server_id}/leaderboards/legends [get]
func getServerLegendsLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		limit := clamp(queryIntDefault(c, "limit", 100), 1, 500)
		_, clanNameMap, playerTags, err := lbGetServerClanAndPlayers(a, c.UserContext(), serverID)
		if err != nil {
			return err
		}
		info, err := lbGetPlayerInfoMap(a, c.UserContext(), playerTags)
		if err != nil {
			return err
		}
		items := make([]map[string]any, 0, len(info))
		for tag, p := range info {
			legends := mapMaybe(p["legends"])
			if len(legends) == 0 {
				continue
			}
			clanTag, clanName := lbClanFromPlayer(p, clanNameMap)
			items = append(items, map[string]any{
				"player_tag":     tag,
				"player_name":    asStringOr(p["name"], "Unknown"),
				"townhall_level": p["townhall"],
				"clan_tag":       clanTag,
				"clan_name":      clanName,
				"trophies":       p["trophies"],
				"streak":         legends["streak"],
			})
		}
		sort.SliceStable(items, func(i, j int) bool { return asInt64(items[i]["trophies"]) > asInt64(items[j]["trophies"]) })
		if len(items) > limit {
			items = items[:limit]
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"server_id": serverID, "items": items, "total": len(items)})
	}
}

// getServerClanGamesLeaderboard godoc
// @Summary Get server clan games leaderboard
// @Description Returns players ranked by season clan games points for a server.
// @Tags Server Leaderboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param season query string false "Season YYYY-MM"
// @Param limit query int false "Maximum number of rows"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/server/{server_id}/leaderboards/clan-games [get]
func getServerClanGamesLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return seasonStatLeaderboard(c, a, "clan_games", func(row map[string]any) float64 {
			return lbAsFloat(mapMaybe(row["clan_games"])["points"])
		})
	}
}

// getServerActivityLeaderboard godoc
// @Summary Get server activity leaderboard
// @Description Returns players ranked by season activity for a server.
// @Tags Server Leaderboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param season query string false "Season YYYY-MM"
// @Param limit query int false "Maximum number of rows"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/server/{server_id}/leaderboards/activity [get]
func getServerActivityLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return seasonStatLeaderboard(c, a, "activity", func(row map[string]any) float64 {
			return lbAsFloat(row["activity_score"])
		})
	}
}

// getServerLootingLeaderboard godoc
// @Summary Get server looting leaderboard
// @Description Returns players ranked by season loot totals for a server.
// @Tags Server Leaderboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param season query string false "Season YYYY-MM"
// @Param limit query int false "Maximum number of rows"
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/server/{server_id}/leaderboards/looting [get]
func getServerLootingLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return seasonStatLeaderboard(c, a, "looting", func(row map[string]any) float64 {
			return lbAsFloat(mapMaybe(row["data"])["gold"]) + lbAsFloat(mapMaybe(row["data"])["elixir"]) + lbAsFloat(mapMaybe(row["data"])["dark_elixir"])
		})
	}
}

func seasonStatLeaderboard(c *fiber.Ctx, a apptypes.Deps, kind string, score func(map[string]any) float64) error {
	serverID, err := pathInt(c, "server_id")
	if err != nil {
		return err
	}
	season := c.Query("season", lbCurrentSeason())
	limit := clamp(queryIntDefault(c, "limit", 100), 1, 500)
	_, clanNameMap, playerTags, err := lbGetServerClanAndPlayers(a, c.UserContext(), serverID)
	if err != nil {
		return err
	}
	info, err := lbGetPlayerInfoMap(a, c.UserContext(), playerTags)
	if err != nil {
		return err
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT player_tag, clan_tag, name, townhall_level, donated, received, activity_score,
		       donations, clan_games, activity, data
		FROM player_season_stats
		WHERE player_tag = ANY($1) AND season = $2
	`, playerTags, season)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var tag, clanTag, name string
		var townhall *int
		var donated, received, activityScore int
		var donationsRaw, clanGamesRaw, activityRaw, dataRaw []byte
		if err := rows.Scan(&tag, &clanTag, &name, &townhall, &donated, &received, &activityScore, &donationsRaw, &clanGamesRaw, &activityRaw, &dataRaw); err != nil {
			return err
		}
		row := mapMaybe(decodeJSONAny(dataRaw))
		row["player_tag"] = tag
		row["player_name"] = name
		row["townhall_level"] = townhall
		row["clan_tag"] = clanTag
		row["clan_name"] = clanNameMap[clanTag]
		row["donated"] = donated
		row["received"] = received
		row["activity_score"] = activityScore
		row["donations"] = mapMaybe(decodeJSONAny(donationsRaw))
		row["clan_games"] = mapMaybe(decodeJSONAny(clanGamesRaw))
		row["activity"] = decodeJSONAny(activityRaw)
		if row["player_name"] == "" {
			row["player_name"] = info[tag]["name"]
		}
		row["score"] = score(row)
		items = append(items, row)
	}
	sort.SliceStable(items, func(i, j int) bool { return lbAsFloat(items[i]["score"]) > lbAsFloat(items[j]["score"]) })
	if len(items) > limit {
		items = items[:limit]
	}
	for i := range items {
		items[i]["rank"] = i + 1
	}
	return apptypes.JSON(c, http.StatusOK, map[string]any{"server_id": serverID, "season": season, "type": kind, "items": items, "total": len(items)})
}

func lbCurrentSeason() string {
	return time.Now().UTC().Format("2006-01")
}

func lbAsFloat(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case float32:
		return float64(t)
	case int:
		return float64(t)
	case int32:
		return float64(t)
	case int64:
		return float64(t)
	case string:
		f, _ := strconv.ParseFloat(t, 64)
		return f
	default:
		return 0
	}
}

func lbRound(f float64, decimals int) float64 {
	pow := math.Pow(10, float64(decimals))
	return math.Round(f*pow) / pow
}

func lbGetServerClanAndPlayers(a apptypes.Deps, ctx context.Context, serverID int) (clanTags []string, clanNameMap map[string]string, playerTags []string, err error) {
	rows, err := a.Store.SQL.Query(ctx, `SELECT tag, name FROM server_clans WHERE server_id = $1 ORDER BY name, tag`, strconv.Itoa(serverID))
	if err != nil {
		return nil, nil, nil, err
	}
	defer rows.Close()
	clanNameMap = map[string]string{}
	for rows.Next() {
		var tag, name string
		if err := rows.Scan(&tag, &name); err != nil {
			return nil, nil, nil, err
		}
		clanTags = append(clanTags, tag)
		clanNameMap[tag] = name
	}
	if err := rows.Err(); err != nil {
		return nil, nil, nil, err
	}
	if len(clanTags) == 0 {
		return clanTags, clanNameMap, []string{}, nil
	}
	playerRows, err := a.Store.SQL.Query(ctx, `SELECT player_tag FROM player_current_stats WHERE clan_tag = ANY($1)`, clanTags)
	if err != nil {
		return nil, nil, nil, err
	}
	defer playerRows.Close()
	for playerRows.Next() {
		var tag string
		if err := playerRows.Scan(&tag); err != nil {
			return nil, nil, nil, err
		}
		playerTags = append(playerTags, tag)
	}
	return clanTags, clanNameMap, playerTags, playerRows.Err()
}

func lbGetPlayerInfoMap(a apptypes.Deps, ctx context.Context, playerTags []string) (map[string]map[string]any, error) {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT player_tag, clan_tag, name, townhall_level, legends, data
		FROM player_current_stats
		WHERE player_tag = ANY($1)
	`, playerTags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]any{}
	for rows.Next() {
		var tag, name string
		var clanTag *string
		var townhall *int
		var legendsRaw, dataRaw []byte
		if err := rows.Scan(&tag, &clanTag, &name, &townhall, &legendsRaw, &dataRaw); err != nil {
			return nil, err
		}
		item := mapMaybe(decodeJSONAny(dataRaw))
		item["tag"] = tag
		item["name"] = name
		if clanTag != nil {
			item["clan"] = map[string]any{"tag": *clanTag}
			item["clan_tag"] = *clanTag
		}
		if townhall != nil {
			item["townhall"] = *townhall
		}
		item["legends"] = mapMaybe(decodeJSONAny(legendsRaw))
		out[tag] = item
	}
	return out, rows.Err()
}

func lbPlayerRankMap(a apptypes.Deps, ctx context.Context, playerTags []string) (map[string]map[string]any, error) {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT player_tag, country_code, country_name, rank, global_rank, local_rank, data
		FROM player_rankings_current
		WHERE player_tag = ANY($1)
	`, playerTags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]any{}
	for rows.Next() {
		var tag string
		var countryCode, countryName *string
		var rank, globalRank, localRank *int
		var dataRaw []byte
		if err := rows.Scan(&tag, &countryCode, &countryName, &rank, &globalRank, &localRank, &dataRaw); err != nil {
			return nil, err
		}
		item := mapMaybe(decodeJSONAny(dataRaw))
		if countryCode != nil {
			item["country_code"] = *countryCode
		}
		if countryName != nil {
			item["country_name"] = *countryName
		}
		if rank != nil {
			item["rank"] = *rank
		}
		if globalRank != nil {
			item["global_rank"] = *globalRank
		}
		if localRank != nil {
			item["local_rank"] = *localRank
		}
		out[tag] = item
	}
	return out, rows.Err()
}

func lbClanRankMap(a apptypes.Deps, ctx context.Context, clanTags []string) (map[string]map[string]any, error) {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT clan_tag, country_code, country_name, rank, global_rank, local_rank, data
		FROM clan_rankings_current
		WHERE clan_tag = ANY($1)
	`, clanTags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]any{}
	for rows.Next() {
		var tag string
		var countryCode, countryName *string
		var rank, globalRank, localRank *int
		var dataRaw []byte
		if err := rows.Scan(&tag, &countryCode, &countryName, &rank, &globalRank, &localRank, &dataRaw); err != nil {
			return nil, err
		}
		item := mapMaybe(decodeJSONAny(dataRaw))
		if countryCode != nil {
			item["country_code"] = *countryCode
		}
		if countryName != nil {
			item["country_name"] = *countryName
		}
		if rank != nil {
			item["rank"] = *rank
		}
		if globalRank != nil {
			item["global_rank"] = *globalRank
		}
		if localRank != nil {
			item["local_rank"] = *localRank
		}
		out[tag] = item
	}
	return out, rows.Err()
}

func lbClanFromPlayer(pInfo map[string]any, clanNameMap map[string]string) (string, string) {
	clanMap := mapMaybe(pInfo["clan"])
	clanTag := serverAsString(clanMap["tag"])
	if clanTag == "" {
		clanTag = serverAsString(pInfo["clan_tag"])
	}
	clanName := serverAsString(clanMap["name"])
	if clanName == "" {
		clanName = clanNameMap[clanTag]
	}
	return clanTag, clanName
}

func mapsByScore(scores map[string]map[string]any, key string, limit int) []map[string]any {
	items := make([]map[string]any, 0, len(scores))
	for _, item := range scores {
		items = append(items, item)
	}
	sort.SliceStable(items, func(i, j int) bool { return lbAsFloat(items[i][key]) > lbAsFloat(items[j][key]) })
	if len(items) > limit {
		items = items[:limit]
	}
	for i := range items {
		items[i]["rank"] = i + 1
	}
	return items
}

func queryIntDefault(c *fiber.Ctx, key string, def int) int {
	raw := c.Query(key)
	if raw == "" {
		return def
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	return value
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
	if s := serverAsString(v); s != "" {
		return s
	}
	return def
}
