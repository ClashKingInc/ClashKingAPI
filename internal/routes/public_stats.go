package routes

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// playerRankings godoc
// @Summary Get current player rankings
// @Description Returns current Home Village and Builder Base points plus global and official-location placements. A retained location can have a null local rank when the player is no longer ranked there.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Success 200 {object} modelsv2.PlayerRankingsResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/rankings [get]
func playerRankings(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Params("player_tag"))
		if tag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "player_tag is required")
		}
		response, err := queryPlayerRankings(c.UserContext(), a.Store.SQL, tag)
		if err != nil {
			return err
		}
		if err := resolvePlayerRankingLocations(c.UserContext(), a, &response); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

const playerRankingsQuery = `
	SELECT ranking_type, location_id, rank, points
	FROM player_rankings_current
	WHERE player_tag = $1
	ORDER BY
		CASE ranking_type
			WHEN 'home' THEN 1
			WHEN 'builder_base' THEN 2
		END,
		CASE WHEN location_id = 'global' THEN 0 ELSE 1 END,
		location_id
`

type playerRankingsDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func queryPlayerRankings(ctx context.Context, db playerRankingsDB, tag string) (modelsv2.PlayerRankingsResponse, error) {
	response := modelsv2.PlayerRankingsResponse{Tag: tag}
	rows, err := db.Query(ctx, playerRankingsQuery, tag)
	if err != nil {
		return modelsv2.PlayerRankingsResponse{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var rankingType, locationID string
		var rank, points *int
		if err := rows.Scan(&rankingType, &locationID, &rank, &points); err != nil {
			return modelsv2.PlayerRankingsResponse{}, err
		}
		category := &response.HomeVillage
		if rankingType == "builder_base" {
			category = &response.BuilderBase
		}
		if locationID == "global" {
			category.GlobalRank = rank
			category.Points = points
			continue
		}
		category.LocationID = &locationID
		category.LocalRank = rank
		if category.Points == nil {
			category.Points = points
		}
	}
	return response, rows.Err()
}

func resolvePlayerRankingLocations(
	ctx context.Context,
	a apptypes.Deps,
	response *modelsv2.PlayerRankingsResponse,
) error {
	if response.HomeVillage.LocationID == nil && response.BuilderBase.LocationID == nil {
		return nil
	}
	locations, err := a.Clash.SearchLocations(ctx)
	if err != nil {
		return err
	}
	byID := make(map[string]struct {
		name        string
		countryCode string
	}, len(locations))
	for _, location := range locations {
		byID[strconv.Itoa(location.ID)] = struct {
			name        string
			countryCode string
		}{name: location.Name, countryCode: location.CountryCode}
	}
	for _, category := range []*modelsv2.PlayerRankingCategory{
		&response.HomeVillage,
		&response.BuilderBase,
	} {
		if category.LocationID == nil {
			continue
		}
		location, ok := byID[*category.LocationID]
		if !ok {
			continue
		}
		category.LocationName = &location.name
		if location.countryCode != "" {
			category.CountryCode = &location.countryCode
		}
	}
	return nil
}

// playerBattlelogHistory godoc
// @Summary Get player battlelog history
// @Description Returns historical returned battlelogs for a player, including farming hits when present.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param limit query int false "Result limit, max 500"
// @Param days query int false "Days of history, max 365"
// @Param type query string false "Battle type"
// @Param attack query bool false "Filter attacks or defenses"
// @Success 200 {object} modelsv2.PlayerBattlelogHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/battlelog/history [get]
func playerBattlelogHistory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Params("player_tag"))
		if tag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "player_tag is required")
		}
		window, err := publicStatsWindow(c, 30, 365)
		if err != nil {
			return err
		}
		attack, err := publicStatsOptionalBool(c.Query("attack"))
		if err != nil {
			return err
		}
		limit := clamp(queryInt(c, "limit", 100), 1, 500)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT battle_id::text, player_tag, player_name, player_th, opponent_tag, opponent_name, opponent_th,
				battle_type, attack, stars, destruction_percentage, gold, elixir, dark_elixir, "timestamp",
				army_items, army_counts, duration, army_share_code
			FROM battlelogs
			WHERE player_tag = $1
			  AND "timestamp" >= $2
			  AND "timestamp" <= $3
			  AND ($4 = '' OR battle_type = $4)
			  AND ($5::boolean IS NULL OR attack = $5::boolean)
			ORDER BY "timestamp" DESC
			LIMIT $6
		`, tag, window.start, window.end, c.Query("type"), attack, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		items, err := scanBattlelogRows(rows)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"player_tag": tag,
			"items":      items,
			"count":      len(items),
			"limit":      limit,
			"time":       map[string]any{"start": window.start, "end": window.end},
		})
	}
}

// playerRankedBattlelog godoc
// @Summary Get player ranked battlelog
// @Description Returns player ranked season placement plus recent ranked battlelog rows.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param season path int true "Ranked season ID"
// @Param limit query int false "Battlelog row limit, max 200"
// @Success 200 {object} modelsv2.PlayerRankedBattlelogResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/ranked/{season}/battlelog [get]
func playerRankedBattlelog(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Params("player_tag"))
		seasonID, err := strconv.ParseInt(c.Params("season"), 10, 64)
		if tag == "" || err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "invalid player_tag or season")
		}
		member, err := rankedMember(c, a, tag, seasonID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.JSON(c, fiber.StatusOK, map[string]any{"tag": tag, "season": seasonID, "member": nil, "battlelogs": []any{}})
			}
			return err
		}
		limit := clamp(queryInt(c, "limit", 100), 1, 200)
		seasonStart := time.Unix(seasonID, 0).UTC()
		seasonEnd := seasonStart.Add(7 * 24 * time.Hour)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT battle_id::text, player_tag, player_name, player_th, opponent_tag, opponent_name, opponent_th,
				battle_type, attack, stars, destruction_percentage, gold, elixir, dark_elixir, "timestamp",
				army_items, army_counts, duration, army_share_code
			FROM battlelogs
			WHERE player_tag = $1
				AND battle_type = 'ranked'
				AND "timestamp" >= $2
				AND "timestamp" < $3
			ORDER BY "timestamp" DESC
			LIMIT $4
		`, tag, seasonStart, seasonEnd, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		battlelogs, err := scanBattlelogRows(rows)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"tag": tag, "season": seasonID, "member": member, "battlelogs": battlelogs})
	}
}

// playerRankedGroup godoc
// @Summary Get player ranked group
// @Description Returns ranked group data for the group containing the requested player.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param season path int true "Ranked season ID"
// @Success 200 {object} modelsv2.PlayerRankedGroupResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/ranked/{season}/group [get]
func playerRankedGroup(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Params("player_tag"))
		seasonID, err := strconv.ParseInt(c.Params("season"), 10, 64)
		if tag == "" || err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "invalid player_tag or season")
		}
		member, err := rankedMember(c, a, tag, seasonID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apptypes.JSON(c, fiber.StatusOK, map[string]any{"tag": tag, "season": seasonID, "group": nil, "members": []any{}})
			}
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT player_tag, player_name, clan_tag, clan_name, placement, league_trophies,
				attack_win_count, attack_lose_count, defense_win_count, defense_lose_count
			FROM ranked_league_group_members
			WHERE season_id = $1 AND group_tag = $2
			ORDER BY placement
		`, seasonID, member["group_tag"])
		if err != nil {
			return err
		}
		defer rows.Close()
		members := []map[string]any{}
		for rows.Next() {
			item, err := scanRankedMember(rows)
			if err != nil {
				return err
			}
			members = append(members, item)
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"season":         seasonID,
			"group_tag":      member["group_tag"],
			"league_tier_id": member["league_tier_id"],
			"player":         member,
			"members":        members,
			"count":          len(members),
		})
	}
}

// playerChanges godoc
// @Summary Get player changes
// @Description Returns stored player profile changes such as upgrades.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param limit query int false "Result limit, max 500"
// @Param type query string false "Change type name or ID (1-12)"
// @Success 200 {object} modelsv2.PlayerChangesResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/changes [get]
func playerChanges(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Params("player_tag"))
		if tag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "player_tag is required")
		}
		changeTypes, err := parsePlayerChangeTypeFilter(c.Query("type"))
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, err.Error())
		}
		response, err := queryPlayerChanges(c.UserContext(), a.Store.SQL, tag, changeTypes, clamp(queryInt(c, "limit", 100), 1, 500))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

type playerChangesDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

const playerChangesQuery = `
	SELECT event_time, player_tag, townhall_level, change_type, item_id, previous_value, current_value
	FROM player_change_history
	WHERE player_tag = $1
	ORDER BY event_time DESC
	LIMIT $2
`

const playerChangesByTypeQuery = `
	SELECT event_time, player_tag, townhall_level, change_type, item_id, previous_value, current_value
	FROM player_change_history
	WHERE player_tag = $1 AND change_type = ANY($2::smallint[])
	ORDER BY event_time DESC
	LIMIT $3
`

var playerChangeTypeNames = map[int16]string{
	1: "troop_level", 2: "super_troop_boost", 3: "hero_level", 4: "spell_level",
	5: "pet_level", 6: "equipment_level", 7: "town_hall_level", 8: "best_trophies",
	9: "best_builder_base_trophies", 10: "exp_level", 11: "war_preference", 12: "name",
}

var playerChangeTypeFilters = map[string][]int16{
	"troop_level": {1}, "trooplevel": {1}, "troops": {1, 2},
	"super_troop_boost": {2}, "supertroopboost": {2},
	"hero_level": {3}, "herolevel": {3}, "heroes": {3},
	"spell_level": {4}, "spelllevel": {4}, "spells": {4},
	"pet_level": {5}, "petlevel": {5}, "pets": {5},
	"equipment_level": {6}, "equipmentlevel": {6}, "heroequipment": {6},
	"town_hall_level": {7}, "townhalllevel": {7},
	"best_trophies": {8}, "besttrophies": {8},
	"best_builder_base_trophies": {9}, "bestbuilderbasetrophies": {9}, "bestversustrophies": {9},
	"exp_level": {10}, "explevel": {10},
	"war_preference": {11}, "warpreference": {11},
	"name": {12},
}

func parsePlayerChangeTypeFilter(value string) ([]int16, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	if id, err := strconv.ParseInt(value, 10, 16); err == nil {
		if _, ok := playerChangeTypeNames[int16(id)]; ok {
			return []int16{int16(id)}, nil
		}
		return nil, errors.New("type must be a change type name or ID from 1 to 12")
	}
	normalized := strings.ToLower(strings.ReplaceAll(value, "-", "_"))
	if ids, ok := playerChangeTypeFilters[normalized]; ok {
		return ids, nil
	}
	return nil, errors.New("type must be a change type name or ID from 1 to 12")
}

func queryPlayerChanges(ctx context.Context, db playerChangesDB, tag string, changeTypes []int16, limit int) (modelsv2.PlayerChangesResponse, error) {
	query := playerChangesQuery
	args := []any{tag, limit}
	if len(changeTypes) != 0 {
		query = playerChangesByTypeQuery
		args = []any{tag, changeTypes, limit}
	}
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return modelsv2.PlayerChangesResponse{}, err
	}
	defer rows.Close()

	response := modelsv2.PlayerChangesResponse{Tag: tag, Items: []modelsv2.PlayerChangeRecord{}}
	for rows.Next() {
		var item modelsv2.PlayerChangeRecord
		if err := rows.Scan(&item.Time, &item.PlayerTag, &item.TownhallLevel, &item.TypeID, &item.ItemID, &item.Previous, &item.Current); err != nil {
			return modelsv2.PlayerChangesResponse{}, err
		}
		item.Type = playerChangeTypeNames[item.TypeID]
		response.Items = append(response.Items, item)
	}
	if err := rows.Err(); err != nil {
		return modelsv2.PlayerChangesResponse{}, err
	}
	response.Count = len(response.Items)
	return response, nil
}

// leaderboardLeague godoc
// @Summary Get league leaderboard
// @Description Returns the current top tracked players for a ranked league tier from the Valkey leaderboard snapshot.
// @Tags Leaderboard
// @Produce json
// @Param league_tier_id path int true "League tier ID"
// @Param limit query int false "Result limit, max 500"
// @Success 200 {object} modelsv2.PlayerLeaderboardResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/leaderboard/league/{league_tier_id} [get]
func leaderboardLeague(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		leagueID, err := strconv.Atoi(c.Params("league_tier_id"))
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "invalid league_tier_id")
		}
		if leagueID < 1 {
			return apptypes.Error(fiber.StatusBadRequest, "invalid league_tier_id")
		}
		limit := clamp(queryInt(c, "limit", 500), 1, 500)
		if a.Cache == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "ranked league leaderboard is unavailable")
		}
		raw, ok := a.Cache.GetLeagueLeaderboard(c.UserContext(), leagueID)
		if !ok {
			return apptypes.Error(fiber.StatusServiceUnavailable, "ranked league leaderboard is unavailable")
		}
		response, err := decodeLeagueLeaderboard(raw, leagueID, limit)
		if err != nil {
			return apptypes.Error(fiber.StatusInternalServerError, "invalid ranked league leaderboard payload")
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

// leaderboardTownhalls godoc
// @Summary Get townhall leaderboard
// @Description Returns the current top tracked players for a townhall level from the Valkey leaderboard snapshot.
// @Tags Leaderboard
// @Produce json
// @Param townhall_level path int true "Townhall level"
// @Param limit query int false "Result limit, max 500"
// @Success 200 {object} modelsv2.PlayerLeaderboardResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/leaderboard/townhalls/{townhall_level} [get]
func leaderboardTownhalls(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		townhall, err := strconv.Atoi(c.Params("townhall_level"))
		if err != nil || townhall < 1 {
			return apptypes.Error(fiber.StatusBadRequest, "invalid townhall_level")
		}
		limit := clamp(queryInt(c, "limit", 500), 1, 500)
		if a.Cache == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "townhall leaderboard is unavailable")
		}
		raw, ok := a.Cache.GetTownhallLeaderboard(c.UserContext(), townhall)
		if !ok {
			return apptypes.Error(fiber.StatusServiceUnavailable, "townhall leaderboard is unavailable")
		}
		response, err := decodeTownhallLeaderboard(raw, townhall, limit)
		if err != nil {
			return apptypes.Error(fiber.StatusInternalServerError, "invalid townhall leaderboard payload")
		}
		return apptypes.JSON(c, fiber.StatusOK, response)
	}
}

func decodeTownhallLeaderboard(raw []byte, townhall, limit int) (modelsv2.PlayerLeaderboardResponse, error) {
	response, err := decodeCachedPlayerLeaderboard(raw, limit)
	if err != nil {
		return modelsv2.PlayerLeaderboardResponse{}, err
	}
	response.Townhall = &townhall
	return response, nil
}

func decodeLeagueLeaderboard(raw []byte, leagueID, limit int) (modelsv2.PlayerLeaderboardResponse, error) {
	response, err := decodeCachedPlayerLeaderboard(raw, limit)
	if err != nil {
		return modelsv2.PlayerLeaderboardResponse{}, err
	}
	response.LeagueTierID = &leagueID
	return response, nil
}

func decodeCachedPlayerLeaderboard(raw []byte, limit int) (modelsv2.PlayerLeaderboardResponse, error) {
	var cached struct {
		Items       []modelsv2.PlayerLeaderboardItem `json:"items"`
		GeneratedAt *time.Time                       `json:"generated_at,omitempty"`
	}
	if err := json.Unmarshal(raw, &cached); err != nil {
		return modelsv2.PlayerLeaderboardResponse{}, err
	}
	if len(cached.Items) > limit {
		cached.Items = cached.Items[:limit]
	}
	return modelsv2.PlayerLeaderboardResponse{
		Items:       cached.Items,
		Count:       len(cached.Items),
		GeneratedAt: cached.GeneratedAt,
	}, nil
}

// leaderboardClanDonations godoc
// @Summary Get clan donation leaderboard
// @Description Returns top donation clans for a location.
// @Tags Leaderboard
// @Produce json
// @Param location_id path int true "Location ID"
// @Param limit query int false "Result limit, max 500"
// @Success 200 {object} modelsv2.PublicClanLeaderboardResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/leaderboard/{location_id}/clan/donations [get]
func leaderboardClanDonations(a apptypes.Deps) fiber.Handler {
	return clanLeaderboard(a, "donations")
}

// leaderboardClanWarWins godoc
// @Summary Get clan war wins leaderboard
// @Description Returns top war wins clans for a location.
// @Tags Leaderboard
// @Produce json
// @Param location_id path int true "Location ID"
// @Param limit query int false "Result limit, max 500"
// @Success 200 {object} modelsv2.PublicClanLeaderboardResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/leaderboard/{location_id}/clan/war-wins [get]
func leaderboardClanWarWins(a apptypes.Deps) fiber.Handler {
	return clanLeaderboard(a, "war_wins")
}

// leaderboardClanWinStreak godoc
// @Summary Get clan win streak leaderboard
// @Description Returns top clan win streaks.
// @Tags Leaderboard
// @Produce json
// @Param limit query int false "Result limit, max 500"
// @Success 200 {object} modelsv2.PublicClanLeaderboardResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/leaderboard/clan/win-streak [get]
func leaderboardClanWinStreak(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		limit := clamp(queryInt(c, "limit", 500), 1, 500)
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT c.tag, c.name, c.location_id, c.badge_token, c.war_wins, c.war_win_streak, l.war_win_streak_rank
			FROM clan_leaderboards l
			JOIN basic_clan c ON c.tag = l.tag
			WHERE l.war_win_streak_rank IS NOT NULL
			ORDER BY l.war_win_streak_rank
			LIMIT $1
		`, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		items, err := scanClanLeaderboard(rows, "war_win_streak")
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"items": items, "count": len(items)})
	}
}

// leaderboardTrophyBuckets godoc
// @Summary Get current trophy buckets
// @Description Returns current trophy and player totals grouped into trophy buckets for one league tier.
// @Tags Leaderboard
// @Produce json
// @Param league_tier_id path int true "League tier ID"
// @Success 200 {object} modelsv2.TrophyBucketsResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/leaderboard/{league_tier_id}/trophy-buckets [get]
func leaderboardTrophyBuckets(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		leagueID, err := strconv.Atoi(c.Params("league_tier_id"))
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "invalid league_tier_id")
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT width_bucket(trophies, 0, 7000, 14) AS bucket, count(*)::int, COALESCE(sum(trophies), 0)::bigint
			FROM basic_player
			WHERE league_id = $1
			GROUP BY bucket
			ORDER BY bucket
		`, leagueID)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []modelsv2.TrophyBucket{}
		for rows.Next() {
			var bucket, players int
			var trophies int64
			if err := rows.Scan(&bucket, &players, &trophies); err != nil {
				return err
			}
			items = append(items, modelsv2.TrophyBucket{Bucket: bucket, Players: players, Trophies: trophies})
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.TrophyBucketsResponse{
			LeagueTierID: leagueID,
			Items:        items,
			Count:        len(items),
		})
	}
}

// globalCWLLeagues godoc
// @Summary Get global CWL league counts
// @Description Returns counts of clans at different CWL leagues.
// @Tags Global
// @Produce json
// @Success 200 {object} modelsv2.GroupedCountsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func globalCWLLeagues(a apptypes.Deps) fiber.Handler {
	return groupedCounts(a, "cwl_league_id", `SELECT cwl_league_id, clan_count FROM war_league_counts ORDER BY cwl_league_id`)
}

// globalClanLocations godoc
// @Summary Get global clan location counts
// @Description Returns counts of clans in different locations.
// @Tags Global
// @Produce json
// @Success 200 {object} modelsv2.GroupedCountsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func globalClanLocations(a apptypes.Deps) fiber.Handler {
	return groupedCounts(a, "location_id", `SELECT location_id, count(*) FROM basic_clan GROUP BY location_id ORDER BY location_id NULLS LAST`)
}

// globalCapitalLeagues godoc
// @Summary Get global capital league counts
// @Description Returns counts of clans at different capital leagues.
// @Tags Global
// @Produce json
// @Success 200 {object} modelsv2.GroupedCountsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func globalCapitalLeagues(a apptypes.Deps) fiber.Handler {
	return groupedCounts(a, "capital_league_id", `SELECT capital_league_id, count(*) FROM basic_clan GROUP BY capital_league_id ORDER BY capital_league_id NULLS LAST`)
}

// globalLeagueTiers godoc
// @Summary Get global league tier counts
// @Description Returns counts of players at different league tiers.
// @Tags Global
// @Produce json
// @Success 200 {object} modelsv2.GroupedCountsResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func globalLeagueTiers(a apptypes.Deps) fiber.Handler {
	return groupedCounts(a, "league_tier_id", `SELECT league_tier_id, player_count FROM api_league_tier_counts ORDER BY league_tier_id`)
}

// clanChanges godoc
// @Summary Get clan changes
// @Description Returns stored clan changes such as description changes, clan level upgrades, and war league history.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param limit query int false "Result limit, max 500"
// @Param type query string false "Change type"
// @Success 200 {object} modelsv2.ClanChangesResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/clan/{clan_tag}/changes [get]
func clanChanges(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := clanFixTag(c.Params("clan_tag"))
		limit := clamp(queryInt(c, "limit", 100), 1, 500)
		name, badgeToken, err := clanChangeIdentity(c, a, tag)
		if err != nil {
			return err
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), `
			SELECT event_time, change_type, previous_value, current_value
			FROM clan_change_history
			WHERE clan_tag = $1 AND ($2 = '' OR change_type = $2)
			ORDER BY event_time DESC
			LIMIT $3
		`, tag, clanChangeStorageType(c.Query("type")), limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []modelsv2.ClanChangeRecord{}
		for rows.Next() {
			var eventTime time.Time
			var changeType string
			var previousRaw, currentRaw []byte
			if err := rows.Scan(&eventTime, &changeType, &previousRaw, &currentRaw); err != nil {
				return err
			}
			items = append(items, modelsv2.ClanChangeRecord{
				Time:     eventTime,
				Type:     clanChangeAPIType(changeType),
				Previous: clanChangeValue(previousRaw),
				Current:  clanChangeValue(currentRaw),
			})
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, clanChangesResponse(name, tag, badgeToken, items))
	}
}

func clanChangeValue(raw []byte) modelsv2.ClanChangeValue {
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return modelsv2.ClanChangeValue{Kind: "text", Text: &text}
	}
	var integer int
	if json.Unmarshal(raw, &integer) == nil {
		return modelsv2.ClanChangeValue{Kind: "integer", Integer: &integer}
	}
	return modelsv2.ClanChangeValue{Kind: "text"}
}

func clanChangeIdentity(c *fiber.Ctx, a apptypes.Deps, tag string) (string, string, error) {
	var name, badgeToken string
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT name, badge_token
		FROM basic_clan
		WHERE tag = $1
	`, tag).Scan(&name, &badgeToken)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil
	}
	return name, badgeToken, err
}

func clanChangesResponse(name string, tag string, badgeToken string, items []modelsv2.ClanChangeRecord) modelsv2.ClanChangesResponse {
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].Time.After(items[j].Time)
	})
	return modelsv2.ClanChangesResponse{
		Name: name,
		Tag:  tag,
		BadgeURLs: modelsv2.PublicBadgeURLs{
			Small:  badgeURL(badgeToken, 70),
			Medium: badgeURL(badgeToken, 200),
			Large:  badgeURL(badgeToken, 512),
		},
		Count: len(items),
		Items: items,
	}
}

func clanChangeAPIType(changeType string) string {
	switch changeType {
	case "clan_level":
		return "clanLevel"
	case "cwl_league_id":
		return "warLeague"
	case "capital_league_id":
		return "capitalLeague"
	default:
		return snakeToLowerCamel(changeType)
	}
}

func clanChangeStorageType(changeType string) string {
	switch changeType {
	case "clanLevel":
		return "clan_level"
	case "warLeague":
		return "cwl_league_id"
	case "capitalLeague":
		return "capital_league_id"
	default:
		return changeType
	}
}

func snakeToLowerCamel(value string) string {
	parts := strings.Split(value, "_")
	if len(parts) == 0 {
		return value
	}
	out := parts[0]
	for _, part := range parts[1:] {
		if part == "" {
			continue
		}
		out += strings.ToUpper(part[:1]) + part[1:]
	}
	return out
}

// battlelogsRankedArmies godoc
// @Summary Get ranked battlelog armies
// @Description Returns top ranked armies by hitrate or usage rate. Supports townhall, item includes/excludes, minimum usage count, timeframe, and max 100 result filters.
// @Tags Battlelogs
// @Produce json
// @Param league_id query int false "League ID, matched against the attacker's current league"
// @Param townhall_level query int false "Townhall level"
// @Param contains query []string false "Required troop, spell, pet, or equipment IDs/names"
// @Param excludes query []string false "Excluded troop, spell, pet, or equipment IDs/names"
// @Param min_usage_count query int false "Minimum usage count"
// @Param timeframe query string false "Timeframe such as 7d or 24h"
// @Param sort_by query string false "hitrate or usage_rate"
// @Param limit query int false "Result limit, max 100"
// @Success 200 {object} modelsv2.BattlelogArmiesResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func battlelogsRankedArmies(a apptypes.Deps) fiber.Handler {
	return battlelogArmies(a, "ranked")
}

// battlelogsFarmingArmies godoc
// @Summary Get farming battlelog armies
// @Description Returns top farming armies by usage rate. Supports townhall, item includes/excludes, and max 100 result filters.
// @Tags Battlelogs
// @Produce json
// @Param townhall_level query int false "Townhall level"
// @Param contains query []string false "Required troop, spell, pet, or equipment IDs/names"
// @Param excludes query []string false "Excluded troop, spell, pet, or equipment IDs/names"
// @Param timeframe query string false "Timeframe such as 7d or 24h"
// @Param limit query int false "Result limit, max 100"
// @Success 200 {object} modelsv2.BattlelogArmiesResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func battlelogsFarmingArmies(a apptypes.Deps) fiber.Handler {
	return battlelogArmies(a, "farming")
}

// battlelogItemTownhallUsage godoc
// @Summary Get item usage by townhall
// @Description Returns 90 daily usage points for an item in ranked and legend battlelogs for a townhall level.
// @Tags Battlelogs
// @Produce json
// @Param townhall_level path int true "Townhall level"
// @Param item query string true "Troop, spell, hero, pet, or equipment item ID/name"
// @Success 200 {object} modelsv2.BattlelogItemUsageResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func battlelogItemTownhallUsage(a apptypes.Deps) fiber.Handler {
	return battlelogItemStats(a, battlelogItemDimensionTownhall, battlelogItemMetricUsage)
}

// battlelogItemTownhallHitrate godoc
// @Summary Get item hitrate by townhall
// @Description Returns 90 daily hitrate points for same-townhall ranked and legend attacks containing an item for a townhall level.
// @Tags Battlelogs
// @Produce json
// @Param townhall_level path int true "Townhall level"
// @Param item query string true "Troop, spell, hero, pet, or equipment item ID/name"
// @Success 200 {object} modelsv2.BattlelogItemHitrateResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func battlelogItemTownhallHitrate(a apptypes.Deps) fiber.Handler {
	return battlelogItemStats(a, battlelogItemDimensionTownhall, battlelogItemMetricHitrate)
}

// battlelogItemLeagueUsage godoc
// @Summary Get item usage by ranked league
// @Description Returns 90 daily usage points for an item in ranked and legend battlelogs for players stored in ranked league groups.
// @Tags Battlelogs
// @Produce json
// @Param league_id path int true "Ranked league tier ID"
// @Param item query string true "Troop, spell, hero, pet, or equipment item ID/name"
// @Success 200 {object} modelsv2.BattlelogItemUsageResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func battlelogItemLeagueUsage(a apptypes.Deps) fiber.Handler {
	return battlelogItemStats(a, battlelogItemDimensionLeague, battlelogItemMetricUsage)
}

// battlelogItemLeagueHitrate godoc
// @Summary Get item hitrate by ranked league
// @Description Returns 90 daily hitrate points for same-townhall ranked and legend attacks containing an item for players stored in ranked league groups.
// @Tags Battlelogs
// @Produce json
// @Param league_id path int true "Ranked league tier ID"
// @Param item query string true "Troop, spell, hero, pet, or equipment item ID/name"
// @Success 200 {object} modelsv2.BattlelogItemHitrateResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
func battlelogItemLeagueHitrate(a apptypes.Deps) fiber.Handler {
	return battlelogItemStats(a, battlelogItemDimensionLeague, battlelogItemMetricHitrate)
}

type battlelogItemDimension string

const (
	battlelogItemDimensionTownhall battlelogItemDimension = "townhall"
	battlelogItemDimensionLeague   battlelogItemDimension = "league"
	battlelogItemMetricUsage                              = "usage"
	battlelogItemMetricHitrate                            = "hitrate"
)

func battlelogItemStats(a apptypes.Deps, dimension battlelogItemDimension, metric string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		item := strings.TrimSpace(c.Query("item"))
		if item == "" {
			return apptypes.Error(fiber.StatusBadRequest, "item is required")
		}
		filter, filters, err := battlelogItemFilter(c, dimension)
		if err != nil {
			return err
		}
		if metric == battlelogItemMetricUsage {
			items, err := battlelogItemUsageRows(c, a, item, dimension, filter)
			if err != nil {
				return err
			}
			return apptypes.JSON(c, fiber.StatusOK, modelsv2.BattlelogItemUsageResponse{
				Item:      item,
				Metric:    metric,
				Dimension: string(dimension),
				Filters:   filters,
				Items:     items,
			})
		}
		items, err := battlelogItemHitrateRows(c, a, item, dimension, filter)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.BattlelogItemHitrateResponse{
			Item:      item,
			Metric:    metric,
			Dimension: string(dimension),
			Filters:   filters,
			Items:     items,
		})
	}
}

type battlelogItemFilterValue struct {
	value int
}

func battlelogItemFilter(c *fiber.Ctx, dimension battlelogItemDimension) (battlelogItemFilterValue, modelsv2.BattlelogItemFilters, error) {
	switch dimension {
	case battlelogItemDimensionTownhall:
		townhall, err := strconv.Atoi(c.Params("townhall_level"))
		if err != nil || townhall < 1 {
			return battlelogItemFilterValue{}, modelsv2.BattlelogItemFilters{}, apptypes.Error(fiber.StatusBadRequest, "invalid townhall_level")
		}
		return battlelogItemFilterValue{value: townhall}, modelsv2.BattlelogItemFilters{TownHallLevel: &townhall}, nil
	case battlelogItemDimensionLeague:
		leagueID, err := strconv.Atoi(c.Params("league_id"))
		if err != nil || leagueID < 1 {
			return battlelogItemFilterValue{}, modelsv2.BattlelogItemFilters{}, apptypes.Error(fiber.StatusBadRequest, "invalid league_id")
		}
		return battlelogItemFilterValue{value: leagueID}, modelsv2.BattlelogItemFilters{LeagueID: &leagueID}, nil
	default:
		return battlelogItemFilterValue{}, modelsv2.BattlelogItemFilters{}, apptypes.Error(fiber.StatusBadRequest, "invalid battlelog item dimension")
	}
}

func battlelogItemUsageRows(c *fiber.Ctx, a apptypes.Deps, item string, dimension battlelogItemDimension, filter battlelogItemFilterValue) ([]modelsv2.BattlelogItemUsagePoint, error) {
	query, args := battlelogItemStatsQuery(item, dimension, filter, battlelogItemMetricUsage)
	rows, err := a.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []modelsv2.BattlelogItemUsagePoint{}
	for rows.Next() {
		var day time.Time
		var used, total int
		var rate float64
		if err := rows.Scan(&day, &used, &total, &rate); err != nil {
			return nil, err
		}
		items = append(items, modelsv2.BattlelogItemUsagePoint{
			Date:      day.Format("2006-01-02"),
			Used:      used,
			Total:     total,
			UsageRate: rate,
		})
	}
	return items, rows.Err()
}

func battlelogItemHitrateRows(c *fiber.Ctx, a apptypes.Deps, item string, dimension battlelogItemDimension, filter battlelogItemFilterValue) ([]modelsv2.BattlelogItemHitratePoint, error) {
	query, args := battlelogItemStatsQuery(item, dimension, filter, battlelogItemMetricHitrate)
	rows, err := a.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []modelsv2.BattlelogItemHitratePoint{}
	for rows.Next() {
		var day time.Time
		var triples, total int
		var rate float64
		if err := rows.Scan(&day, &triples, &total, &rate); err != nil {
			return nil, err
		}
		items = append(items, modelsv2.BattlelogItemHitratePoint{
			Date:       day.Format("2006-01-02"),
			ThreeStars: triples,
			Total:      total,
			HitRate:    rate,
		})
	}
	return items, rows.Err()
}

func battlelogItemStatsQuery(item string, dimension battlelogItemDimension, filter battlelogItemFilterValue, metric string) (string, []any) {
	end := time.Now().UTC().Truncate(24 * time.Hour)
	start := end.AddDate(0, 0, -89)
	args := []any{item, start, end}
	filterSQL := ""
	switch dimension {
	case battlelogItemDimensionTownhall:
		args = append(args, filter.value)
		filterSQL = "AND b.player_th = $4"
	case battlelogItemDimensionLeague:
		args = append(args, filter.value)
		filterSQL = `AND EXISTS (
				SELECT 1
				FROM ranked_league_group_members m
				WHERE m.player_tag = b.player_tag
				  AND m.season_id = to_char(b."timestamp" AT TIME ZONE 'UTC', 'YYYYMM')::bigint
				  AND m.league_tier_id = $4
			)`
	}
	if metric == battlelogItemMetricHitrate {
		return `
			WITH days AS (
				SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
			), filtered AS (
				SELECT date_trunc('day', b."timestamp")::date AS day, b.stars
				FROM battlelogs b
				WHERE b."timestamp" >= $2::date
				  AND b."timestamp" < ($3::date + interval '1 day')
				  AND lower(b.battle_type) IN ('ranked', 'legend')
				  AND b.player_th = b.opponent_th
				  AND b.army_items @> ARRAY[$1]::text[]
				  ` + filterSQL + `
			), agg AS (
				SELECT day,
					count(*) FILTER (WHERE stars = 3)::int AS three_stars,
					count(*)::int AS total,
					round((count(*) FILTER (WHERE stars = 3)::numeric / NULLIF(count(*), 0)::numeric), 4)::float AS hit_rate
				FROM filtered
				GROUP BY day
			)
			SELECT d.day,
				COALESCE(a.three_stars, 0)::int AS three_stars,
				COALESCE(a.total, 0)::int AS total,
				COALESCE(a.hit_rate, 0)::float AS hit_rate
			FROM days d
			LEFT JOIN agg a ON a.day = d.day
			ORDER BY d.day
		`, args
	}
	return `
		WITH days AS (
			SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
		), filtered AS (
			SELECT date_trunc('day', b."timestamp")::date AS day, b.army_items
			FROM battlelogs b
			WHERE b."timestamp" >= $2::date
			  AND b."timestamp" < ($3::date + interval '1 day')
			  AND lower(b.battle_type) IN ('ranked', 'legend')
			  ` + filterSQL + `
		), agg AS (
			SELECT day,
				count(*) FILTER (WHERE army_items @> ARRAY[$1]::text[])::int AS used,
				count(*)::int AS total,
				round((count(*) FILTER (WHERE army_items @> ARRAY[$1]::text[])::numeric / NULLIF(count(*), 0)::numeric), 4)::float AS usage_rate
			FROM filtered
			GROUP BY day
		)
		SELECT d.day,
			COALESCE(a.used, 0)::int AS used,
			COALESCE(a.total, 0)::int AS total,
			COALESCE(a.usage_rate, 0)::float AS usage_rate
		FROM days d
		LEFT JOIN agg a ON a.day = d.day
		ORDER BY d.day
	`, args
}

type publicStatsTimeWindow struct {
	start time.Time
	end   time.Time
}

func publicStatsWindow(c *fiber.Ctx, defaultDays int, maxDays int) (publicStatsTimeWindow, error) {
	end := time.Now().UTC()
	start := end.AddDate(0, 0, -defaultDays)
	if raw := c.Query("days"); raw != "" {
		days, err := strconv.Atoi(raw)
		if err != nil || days < 1 {
			return publicStatsTimeWindow{}, apptypes.Error(fiber.StatusBadRequest, "invalid days")
		}
		days = clamp(days, 1, maxDays)
		start = end.AddDate(0, 0, -days)
	}
	if raw := c.Query("start"); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			parsed, err = time.Parse("2006-01-02", raw)
		}
		if err != nil {
			return publicStatsTimeWindow{}, apptypes.Error(fiber.StatusBadRequest, "invalid start")
		}
		start = parsed.UTC()
	}
	if raw := c.Query("end"); raw != "" {
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			parsed, err = time.Parse("2006-01-02", raw)
		}
		if err != nil {
			return publicStatsTimeWindow{}, apptypes.Error(fiber.StatusBadRequest, "invalid end")
		}
		end = parsed.UTC()
	}
	if start.After(end) {
		return publicStatsTimeWindow{}, apptypes.Error(fiber.StatusBadRequest, "start must be before end")
	}
	if start.Before(end.AddDate(0, 0, -maxDays)) {
		start = end.AddDate(0, 0, -maxDays)
	}
	return publicStatsTimeWindow{start: start, end: end}, nil
}

func publicStatsOptionalBool(raw string) (*bool, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return nil, apptypes.Error(fiber.StatusBadRequest, "invalid boolean query parameter: attack")
	}
	return &value, nil
}

func publicStatsCSV(c *fiber.Ctx, key string) []string {
	out := []string{}
	for _, item := range collectQueryValues(c, key) {
		for _, part := range strings.Split(item, ",") {
			part = strings.TrimSpace(part)
			if part != "" {
				out = append(out, part)
			}
		}
	}
	return out
}

func rankedMember(c *fiber.Ctx, a apptypes.Deps, tag string, seasonID int64) (map[string]any, error) {
	row := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT player_tag, player_name, clan_tag, clan_name, placement, league_trophies,
			attack_win_count, attack_lose_count, defense_win_count, defense_lose_count,
			group_tag, league_tier_id
		FROM ranked_league_group_members
		WHERE season_id = $1 AND player_tag = $2
	`, seasonID, tag)
	var playerTag, playerName, groupTag string
	var clanTag, clanName *string
	var placement, trophies, attackWins, attackLosses, defenseWins, defenseLosses, leagueTierID int
	if err := row.Scan(&playerTag, &playerName, &clanTag, &clanName, &placement, &trophies, &attackWins, &attackLosses, &defenseWins, &defenseLosses, &groupTag, &leagueTierID); err != nil {
		return nil, err
	}
	item := map[string]any{
		"tag":                playerTag,
		"name":               playerName,
		"placement":          placement,
		"league_trophies":    trophies,
		"attack_win_count":   attackWins,
		"attack_lose_count":  attackLosses,
		"defense_win_count":  defenseWins,
		"defense_lose_count": defenseLosses,
		"group_tag":          groupTag,
		"league_tier_id":     leagueTierID,
	}
	if clanTag != nil {
		item["clan_tag"] = *clanTag
	}
	if clanName != nil {
		item["clan_name"] = *clanName
	}
	return item, nil
}

func scanRankedMember(rows pgx.Rows) (map[string]any, error) {
	var tag, name string
	var clanTag, clanName *string
	var placement, trophies, attackWins, attackLosses, defenseWins, defenseLosses int
	if err := rows.Scan(&tag, &name, &clanTag, &clanName, &placement, &trophies, &attackWins, &attackLosses, &defenseWins, &defenseLosses); err != nil {
		return nil, err
	}
	item := map[string]any{
		"tag":                tag,
		"name":               name,
		"placement":          placement,
		"league_trophies":    trophies,
		"attack_win_count":   attackWins,
		"attack_lose_count":  attackLosses,
		"defense_win_count":  defenseWins,
		"defense_lose_count": defenseLosses,
	}
	if clanTag != nil {
		item["clan_tag"] = *clanTag
	}
	if clanName != nil {
		item["clan_name"] = *clanName
	}
	return item, nil
}

func scanBattlelogRows(rows pgx.Rows) ([]map[string]any, error) {
	items := []map[string]any{}
	for rows.Next() {
		var battleID, playerTag, playerName, opponentTag, opponentName, battleType, armyShareCode string
		var playerTH, opponentTH, stars, destruction int16
		var gold, elixir, darkElixir, duration int
		var attack bool
		var ts time.Time
		var armyItems []string
		var armyCountsRaw []byte
		if err := rows.Scan(&battleID, &playerTag, &playerName, &playerTH, &opponentTag, &opponentName, &opponentTH, &battleType, &attack, &stars, &destruction, &gold, &elixir, &darkElixir, &ts, &armyItems, &armyCountsRaw, &duration, &armyShareCode); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{
			"battle_id":              battleID,
			"player_tag":             playerTag,
			"player_name":            playerName,
			"player_townhall":        playerTH,
			"opponent_tag":           opponentTag,
			"opponent_name":          opponentName,
			"opponent_townhall":      opponentTH,
			"battle_type":            battleType,
			"attack":                 attack,
			"stars":                  stars,
			"destruction_percentage": destruction,
			"gold":                   gold,
			"elixir":                 elixir,
			"dark_elixir":            darkElixir,
			"timestamp":              ts,
			"army_items":             armyItems,
			"army_counts":            jsonObject(armyCountsRaw),
			"duration":               duration,
			"army_share_code":        armyShareCode,
		})
	}
	return items, rows.Err()
}

func scanBasicPlayerLeaderboard(rows pgx.Rows) ([]map[string]any, error) {
	items := []map[string]any{}
	rank := 1
	for rows.Next() {
		var tag, name string
		var leagueID pgtype.Int4
		var townhall, trophies int
		var clanTag *string
		if err := rows.Scan(&tag, &name, &leagueID, &clanTag, &townhall, &trophies); err != nil {
			return nil, err
		}
		item := map[string]any{"rank": rank, "tag": tag, "name": name, "townhall_level": townhall, "trophies": trophies}
		if leagueID.Valid {
			item["league_id"] = leagueID.Int32
		}
		if clanTag != nil {
			item["clan_tag"] = *clanTag
		}
		items = append(items, item)
		rank++
	}
	return items, rows.Err()
}

func clanLeaderboard(a apptypes.Deps, kind string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		locationID, err := strconv.Atoi(c.Params("location_id"))
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "invalid location_id")
		}
		limit := clamp(queryInt(c, "limit", 500), 1, 500)
		orderColumn := "l.location_donated_rank"
		valueColumn := "c.troops_donated"
		if kind == "war_wins" {
			orderColumn = "l.location_war_wins_rank"
			valueColumn = "c.war_wins"
		}
		query := `
			SELECT c.tag, c.name, c.location_id, c.badge_token, ` + valueColumn + `, c.war_win_streak, ` + orderColumn + `
			FROM clan_leaderboards l
			JOIN basic_clan c ON c.tag = l.tag
			WHERE c.location_id = $1
			ORDER BY ` + orderColumn + `
			LIMIT $2
		`
		rows, err := a.Store.SQL.Query(c.UserContext(), query, locationID, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		items, err := scanClanLeaderboard(rows, kind)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{"location_id": locationID, "kind": kind, "items": items, "count": len(items)})
	}
}

func scanClanLeaderboard(rows pgx.Rows, valueKey string) ([]map[string]any, error) {
	items := []map[string]any{}
	for rows.Next() {
		var tag, name, badgeToken string
		var locationID pgtype.Int4
		var value, streak int
		var rank pgtype.Int8
		if err := rows.Scan(&tag, &name, &locationID, &badgeToken, &value, &streak, &rank); err != nil {
			return nil, err
		}
		item := map[string]any{"tag": tag, "name": name, valueKey: value, "war_win_streak": streak, "badge_url": badgeURL(badgeToken, 512), "badgeUrls": badgeURLs(badgeToken)}
		if locationID.Valid {
			item["location_id"] = locationID.Int32
		}
		if rank.Valid {
			item["rank"] = rank.Int64
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func groupedCounts(a apptypes.Deps, key string, query string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := a.Store.SQL.Query(c.UserContext(), query)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var id pgtype.Int4
			var count int64
			if err := rows.Scan(&id, &count); err != nil {
				return err
			}
			item := map[string]any{"count": count}
			if id.Valid {
				item[key] = id.Int32
			} else {
				item[key] = nil
			}
			items = append(items, item)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items, "count": len(items)})
	}
}

func battlelogArmies(a apptypes.Deps, battleType string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		window, err := publicStatsWindow(c, 14, 90)
		if err != nil {
			return err
		}
		if raw := c.Query("timeframe"); raw != "" {
			start, err := publicStatsTimeframe(raw, window.end)
			if err != nil {
				return err
			}
			window.start = start
		}
		limit := clamp(queryInt(c, "limit", 50), 1, 100)
		minUsage := clamp(queryInt(c, "min_usage_count", 1), 1, 1000000)
		townhall := queryInt(c, "townhall_level", 0)
		leagueID := queryInt(c, "league_id", 0)
		contains := publicStatsCSV(c, "contains")
		excludes := publicStatsCSV(c, "excludes")
		sortBy := c.Query("sort_by", "usage_rate")
		orderBy := "usage_count DESC, three_star_rate DESC"
		if sortBy == "hitrate" {
			orderBy = "three_star_rate DESC, usage_count DESC"
		}
		query := `
			WITH filtered AS (
				SELECT b.army_share_code, b.army_items, b.army_counts, b.stars, b.destruction_percentage
				FROM battlelogs b
				WHERE b.attack = true
				  AND b.player_th = b.opponent_th
				  AND lower(b.battle_type) = lower($1)
				  AND b."timestamp" >= $2
				  AND b."timestamp" <= $3
				  AND ($4::int = 0 OR b.player_th = $4)
				  AND ($5::int = 0 OR EXISTS (
					SELECT 1
					FROM ranked_league_group_members membership
					WHERE membership.player_tag = b.player_tag
					  AND membership.season_id = to_char(b."timestamp" AT TIME ZONE 'UTC', 'YYYYMM')::bigint
					  AND membership.league_tier_id = $5
				  ))
				  AND ($6::text[] IS NULL OR b.army_items @> $6::text[])
				  AND ($7::text[] IS NULL OR NOT (b.army_items && $7::text[]))
			), total AS (
				SELECT count(*)::float AS total_count FROM filtered
			)
			SELECT f.army_share_code, f.army_items, f.army_counts,
				count(*)::int AS usage_count,
				count(*) FILTER (WHERE f.stars = 3)::int AS three_stars,
				round((count(*)::numeric / NULLIF(t.total_count, 0)::numeric), 4)::float AS usage_rate,
				round((count(*) FILTER (WHERE f.stars = 3)::numeric / NULLIF(count(*), 0)::numeric), 4)::float AS three_star_rate,
				round(avg(f.stars)::numeric, 2)::float AS average_stars,
				round(avg(f.destruction_percentage)::numeric, 2)::float AS average_destruction
			FROM filtered f
			CROSS JOIN total t
			GROUP BY f.army_share_code, f.army_items, f.army_counts, t.total_count
			HAVING count(*) >= $8
			ORDER BY ` + orderBy + `
			LIMIT $9
		`
		var containsArg any
		if len(contains) > 0 {
			containsArg = contains
		}
		var excludesArg any
		if len(excludes) > 0 {
			excludesArg = excludes
		}
		rows, err := a.Store.SQL.Query(c.UserContext(), query, battleType, window.start, window.end, townhall, leagueID, containsArg, excludesArg, minUsage, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var shareCode string
			var armyItems []string
			var armyCountsRaw []byte
			var usageCount, triples int
			var usageRate, tripleRate, avgStars, avgDestruction float64
			if err := rows.Scan(&shareCode, &armyItems, &armyCountsRaw, &usageCount, &triples, &usageRate, &tripleRate, &avgStars, &avgDestruction); err != nil {
				return err
			}
			items = append(items, map[string]any{
				"army_share_code":        shareCode,
				"army_items":             armyItems,
				"army_counts":            jsonObject(armyCountsRaw),
				"usage_count":            usageCount,
				"three_stars":            triples,
				"usage_rate":             usageRate,
				"three_star_rate":        tripleRate,
				"average_stars":          avgStars,
				"average_destruction":    avgDestruction,
				"contains_match_percent": usageRate,
			})
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"battle_type": battleType,
			"filters": map[string]any{
				"townhall_level":  townhall,
				"league_id":       leagueID,
				"contains":        contains,
				"excludes":        excludes,
				"min_usage_count": minUsage,
				"sort_by":         sortBy,
				"time":            map[string]any{"start": window.start, "end": window.end},
			},
			"items": items,
			"count": len(items),
			"limit": limit,
		})
	}
}

func publicStatsTimeframe(raw string, end time.Time) (time.Time, error) {
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return end.AddDate(0, 0, -14), nil
	}
	unit := raw[len(raw)-1]
	value, err := strconv.Atoi(raw[:len(raw)-1])
	if err != nil || value < 1 {
		return time.Time{}, apptypes.Error(fiber.StatusBadRequest, "invalid timeframe")
	}
	switch unit {
	case 'h':
		return end.Add(-time.Duration(value) * time.Hour), nil
	case 'd':
		return end.AddDate(0, 0, -clamp(value, 1, 90)), nil
	default:
		return time.Time{}, apptypes.Error(fiber.StatusBadRequest, "invalid timeframe")
	}
}
