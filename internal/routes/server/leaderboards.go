package server

import (
	"context"
	"math"
	"net/http"
	"sort"
	"strconv"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	clashy "github.com/clashkinginc/clashy.go"
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
// @Success 200 {object} modelsv2.ServerLeaderboardsResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
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
				"location_id":     ranking["location_id"],
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
// @Success 200 {object} modelsv2.ServerWarLeaderboardResponse
// @Failure 500 {object} modelsv2.ErrorResponse
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
			FROM war_attacks
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
// @Success 200 {object} modelsv2.ServerDonationsLeaderboardResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/leaderboards/donations [get]
func getServerDonationsLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return seasonStatLeaderboard(c, a, "donations")
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
// @Success 200 {object} modelsv2.ServerLegendsLeaderboardResponse
// @Failure 500 {object} modelsv2.ErrorResponse
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
			if asInt64(p["league_id"]) != 29000022 {
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
// @Success 200 {object} modelsv2.ServerClanGamesLeaderboardResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/leaderboards/clan-games [get]
func getServerClanGamesLeaderboard(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return seasonStatLeaderboard(c, a, "clan_games")
	}
}

const serverDonationStatChangesQuery = `
	SELECT
		player_tag,
		COALESCE(sum(delta) FILTER (WHERE stat_type = 'donated'), 0)::bigint AS donated,
		COALESCE(sum(delta) FILTER (WHERE stat_type = 'received'), 0)::bigint AS received
	FROM player_stat_changes
	WHERE player_tag = ANY($1)
	  AND stat_type IN ('donated', 'received')
	  AND event_time >= $2
	  AND event_time < $3
	GROUP BY player_tag
	ORDER BY donated DESC, received DESC, player_tag
	LIMIT $4
`

const serverClanGamesStatChangesQuery = `
	SELECT player_tag, sum(delta)::bigint AS clan_games
	FROM player_stat_changes
	WHERE player_tag = ANY($1)
	  AND stat_type = 'clan_games'
	  AND event_time >= $2
	  AND event_time < $3
	GROUP BY player_tag
	ORDER BY clan_games DESC, player_tag
	LIMIT $4
`

func seasonStatLeaderboard(c *fiber.Ctx, a apptypes.Deps, kind string) error {
	serverID, err := pathInt(c, "server_id")
	if err != nil {
		return err
	}
	seasonID := c.Query("season")
	if seasonID == "" {
		seasonID = clashy.GetSeasonID()
	}
	season, err := clashy.GetSeasonByID(seasonID)
	if err != nil {
		return apptypes.Error(http.StatusBadRequest, "invalid season")
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

	query := serverDonationStatChangesQuery
	if kind == "clan_games" {
		query = serverClanGamesStatChangesQuery
	}
	rows, err := a.Store.SQL.Query(
		c.UserContext(),
		query,
		playerTags,
		season.StartTime,
		season.EndTime,
		limit,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	donationItems := make([]modelsv2.ServerDonationsLeaderboardItem, 0)
	clanGamesItems := make([]modelsv2.ServerClanGamesLeaderboardItem, 0)
	for rows.Next() {
		var tag string
		var donated, received, clanGames int64
		if kind == "donations" {
			if err := rows.Scan(&tag, &donated, &received); err != nil {
				return err
			}
		} else {
			if err := rows.Scan(&tag, &clanGames); err != nil {
				return err
			}
		}
		player := info[tag]
		clanTag, clanName := lbClanFromPlayer(player, clanNameMap)
		if kind == "donations" {
			donationItems = append(donationItems, modelsv2.ServerDonationsLeaderboardItem{
				Rank:          len(donationItems) + 1,
				PlayerTag:     tag,
				PlayerName:    asStringOr(player["name"], "Unknown"),
				TownhallLevel: intPtrMaybe(player["townhall"]),
				ClanTag:       clanTag,
				ClanName:      clanName,
				Donated:       donated,
				Received:      received,
				Score:         donated,
			})
			continue
		}
		clanGamesItems = append(clanGamesItems, modelsv2.ServerClanGamesLeaderboardItem{
			Rank:          len(clanGamesItems) + 1,
			PlayerTag:     tag,
			PlayerName:    asStringOr(player["name"], "Unknown"),
			TownhallLevel: intPtrMaybe(player["townhall"]),
			ClanTag:       clanTag,
			ClanName:      clanName,
			ClanGames:     clanGames,
			Score:         clanGames,
		})
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if kind == "donations" {
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerDonationsLeaderboardResponse{
			ServerID: serverID,
			Season:   seasonID,
			Type:     kind,
			Items:    donationItems,
			Total:    len(donationItems),
		})
	}
	return apptypes.JSON(c, http.StatusOK, modelsv2.ServerClanGamesLeaderboardResponse{
		ServerID: serverID,
		Season:   seasonID,
		Type:     kind,
		Items:    clanGamesItems,
		Total:    len(clanGamesItems),
	})
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
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT sc.tag, clan.name
		FROM server_clans sc
		JOIN basic_clan clan ON clan.tag = sc.tag
		WHERE sc.server_id = $1
		ORDER BY clan.name, sc.tag
	`, strconv.Itoa(serverID))
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
	playerRows, err := a.Store.SQL.Query(ctx, `SELECT tag FROM basic_player WHERE clan_tag = ANY($1)`, clanTags)
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
		SELECT tag, clan_tag, name, townhall_level, trophies, league_id
		FROM basic_player
		WHERE tag = ANY($1)
	`, playerTags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]any{}
	for rows.Next() {
		var tag, name string
		var clanTag *string
		var townhall, trophies int
		var leagueID *int
		if err := rows.Scan(&tag, &clanTag, &name, &townhall, &trophies, &leagueID); err != nil {
			return nil, err
		}
		item := map[string]any{
			"tag":      tag,
			"name":     name,
			"townhall": townhall,
			"trophies": trophies,
		}
		if leagueID != nil {
			item["league_id"] = *leagueID
		}
		if clanTag != nil {
			item["clan"] = map[string]any{"tag": *clanTag}
			item["clan_tag"] = *clanTag
		}
		out[tag] = item
	}
	return out, rows.Err()
}

func lbPlayerRankMap(a apptypes.Deps, ctx context.Context, playerTags []string) (map[string]map[string]any, error) {
	rows, err := a.Store.SQL.Query(ctx, `
		SELECT player_tag, location_id, rank, points
		FROM player_rankings_current
		WHERE player_tag = ANY($1)
		  AND ranking_type = 'home'
		ORDER BY player_tag,
			CASE WHEN location_id = 'global' THEN 0 ELSE 1 END,
			location_id
	`, playerTags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]any{}
	for rows.Next() {
		var tag, locationID string
		var rank, points *int
		if err := rows.Scan(&tag, &locationID, &rank, &points); err != nil {
			return nil, err
		}
		item := out[tag]
		if item == nil {
			item = map[string]any{}
			out[tag] = item
		}
		if locationID == "global" {
			if rank != nil {
				item["global_rank"] = *rank
			}
			if points != nil {
				item["legend_trophies"] = *points
			}
			continue
		}
		item["location_id"] = locationID
		if rank != nil {
			item["local_rank"] = *rank
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if a.Clash == nil {
		return out, nil
	}
	locations, err := a.Clash.SearchLocations(ctx)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]map[string]any, len(locations))
	for _, location := range locations {
		byID[strconv.Itoa(location.ID)] = map[string]any{
			"country_name": location.Name,
			"country_code": location.CountryCode,
		}
	}
	for _, item := range out {
		locationID := asStringOr(item["location_id"], "")
		if metadata := byID[locationID]; metadata != nil {
			item["country_name"] = metadata["country_name"]
			if asStringOr(metadata["country_code"], "") != "" {
				item["country_code"] = metadata["country_code"]
			}
		}
	}
	return out, nil
}

const lbClanRankQuery = `
	SELECT
		clan.tag,
		clan.clan_level,
		clan.clan_points,
		clan.member_count,
		clan.capital_points,
		max(ranking.rank) FILTER (
			WHERE ranking.ranking_type = 'home'
			  AND ranking.location_id = 'global'
		) AS global_rank,
		max(ranking.rank) FILTER (
			WHERE ranking.ranking_type = 'home'
			  AND clan.location_id IS NOT NULL
			  AND ranking.location_id = clan.location_id::text
		) AS local_rank
	FROM basic_clan clan
	LEFT JOIN clan_rankings_current ranking
	       ON ranking.clan_tag = clan.tag
	      AND ranking.ranking_type = 'home'
	WHERE clan.tag = ANY($1)
	GROUP BY
		clan.tag,
		clan.clan_level,
		clan.clan_points,
		clan.member_count,
		clan.capital_points,
		clan.location_id
`

func lbClanRankMap(a apptypes.Deps, ctx context.Context, clanTags []string) (map[string]map[string]any, error) {
	rows, err := a.Store.SQL.Query(ctx, lbClanRankQuery, clanTags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]map[string]any{}
	for rows.Next() {
		var tag string
		var clanLevel, clanPoints, memberCount, capitalPoints int
		var globalRank, localRank *int
		if err := rows.Scan(
			&tag,
			&clanLevel,
			&clanPoints,
			&memberCount,
			&capitalPoints,
			&globalRank,
			&localRank,
		); err != nil {
			return nil, err
		}
		item := map[string]any{
			"clan_level":     clanLevel,
			"clan_points":    clanPoints,
			"member_count":   memberCount,
			"capital_points": capitalPoints,
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
