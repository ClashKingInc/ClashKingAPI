package routes

import (
	"context"
	"encoding/json"
	"regexp"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const leaderboardSnapshotHistoryQuery = `
	SELECT data
	FROM leaderboard_history
	WHERE kind = $1 AND location_id = $2 AND date = $3
	ORDER BY rank
`

const leaderboardEntityHistoryQuery = `
	SELECT date, location_id, name, rank, data
	FROM leaderboard_history
	WHERE kind = $1 AND tag = $2
	ORDER BY date DESC, location_id, rank
`

var leaderboardHistoryLocationPattern = regexp.MustCompile(`^(global|[0-9]+)$`)

var playerLeaderboardHistoryTypes = map[modelsv2.LeaderboardHistoryType]struct{}{
	modelsv2.LeaderboardHistoryTypePlayerHomeTrophies:        {},
	modelsv2.LeaderboardHistoryTypePlayerBuilderBaseTrophies: {},
}

var clanLeaderboardHistoryTypes = map[modelsv2.LeaderboardHistoryType]struct{}{
	modelsv2.LeaderboardHistoryTypeClanHomePoints:        {},
	modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints: {},
	modelsv2.LeaderboardHistoryTypeClanCapitalPoints:     {},
}

type leaderboardHistoryDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func parseLeaderboardHistoryType(raw string) (modelsv2.LeaderboardHistoryType, bool) {
	leaderboardType := modelsv2.LeaderboardHistoryType(raw)
	if _, ok := playerLeaderboardHistoryTypes[leaderboardType]; ok {
		return leaderboardType, true
	}
	if _, ok := clanLeaderboardHistoryTypes[leaderboardType]; ok {
		return leaderboardType, true
	}
	return "", false
}

func playerLeaderboardHistoryType(raw string) (modelsv2.LeaderboardHistoryType, bool) {
	leaderboardType, ok := parseLeaderboardHistoryType(raw)
	if !ok {
		return "", false
	}
	_, ok = playerLeaderboardHistoryTypes[leaderboardType]
	return leaderboardType, ok
}

func clanLeaderboardHistoryType(raw string) (modelsv2.LeaderboardHistoryType, bool) {
	leaderboardType, ok := parseLeaderboardHistoryType(raw)
	if !ok {
		return "", false
	}
	_, ok = clanLeaderboardHistoryTypes[leaderboardType]
	return leaderboardType, ok
}

func configuredLeaderboardHistoryDB(a apptypes.Deps) leaderboardHistoryDB {
	if a.Store == nil {
		return nil
	}
	return a.Store.SQL
}

// leaderboardSnapshotHistory godoc
// @Summary Get a historical leaderboard snapshot
// @Description Reconstructs one complete official leaderboard response from stored full response items, ordered by rank.
// @Tags Leaderboard
// @Produce json
// @Param leaderboard_type path string true "Canonical leaderboard type" Enums(player_home_trophies,player_builder_base_trophies,clan_home_points,clan_builder_base_points,clan_capital_points)
// @Param location_id path string true "Global or official numeric location ID"
// @Param date path string true "Snapshot date YYYY-MM-DD"
// @Success 200 {object} modelsv2.LeaderboardSnapshotHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/leaderboard/history/{leaderboard_type}/{location_id}/{date} [get]
func leaderboardSnapshotHistory(a apptypes.Deps) fiber.Handler {
	return leaderboardSnapshotHistoryHandler(configuredLeaderboardHistoryDB(a))
}

func leaderboardSnapshotHistoryHandler(db leaderboardHistoryDB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		leaderboardType, ok := parseLeaderboardHistoryType(c.Params("leaderboard_type"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "invalid leaderboard_type")
		}
		locationID := c.Params("location_id")
		if !leaderboardHistoryLocationPattern.MatchString(locationID) {
			return apptypes.Error(fiber.StatusBadRequest, "invalid location_id")
		}
		date, err := time.Parse("2006-01-02", c.Params("date"))
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "invalid date")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "leaderboard history is unavailable")
		}
		items, err := queryLeaderboardSnapshotHistory(c.UserContext(), db, leaderboardType, locationID, date)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.LeaderboardSnapshotHistoryResponse{
			Type:       leaderboardType,
			LocationID: locationID,
			Date:       date.Format("2006-01-02"),
			Items:      items,
		})
	}
}

// playerLeaderboardHistory godoc
// @Summary Get a player's leaderboard history
// @Description Returns dated placements and full stored official details for player Home Village or Builder Base leaderboards.
// @Tags Leaderboard
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param leaderboard_type path string true "Canonical player leaderboard type" Enums(player_home_trophies,player_builder_base_trophies)
// @Success 200 {object} modelsv2.PlayerLeaderboardHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/leaderboard-history/{leaderboard_type} [get]
func playerLeaderboardHistory(a apptypes.Deps) fiber.Handler {
	return playerLeaderboardHistoryHandler(configuredLeaderboardHistoryDB(a))
}

func playerLeaderboardHistoryHandler(db leaderboardHistoryDB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Params("player_tag"))
		if tag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "invalid player_tag")
		}
		leaderboardType, ok := playerLeaderboardHistoryType(c.Params("leaderboard_type"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "invalid player leaderboard_type")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "leaderboard history is unavailable")
		}
		items, err := queryLeaderboardEntityHistory(c.UserContext(), db, leaderboardType, tag)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.PlayerLeaderboardHistoryResponse{
			Type:      leaderboardType,
			PlayerTag: tag,
			Items:     items,
		})
	}
}

// clanLeaderboardHistory godoc
// @Summary Get a clan's leaderboard history
// @Description Returns dated placements and full stored official details for clan Home Village, Builder Base, or Capital leaderboards.
// @Tags Leaderboard
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param leaderboard_type path string true "Canonical clan leaderboard type" Enums(clan_home_points,clan_builder_base_points,clan_capital_points)
// @Success 200 {object} modelsv2.ClanLeaderboardHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/clan/{clan_tag}/leaderboard-history/{leaderboard_type} [get]
func clanLeaderboardHistory(a apptypes.Deps) fiber.Handler {
	return clanLeaderboardHistoryHandler(configuredLeaderboardHistoryDB(a))
}

func clanLeaderboardHistoryHandler(db leaderboardHistoryDB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := clanFixTag(c.Params("clan_tag"))
		if tag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "invalid clan_tag")
		}
		leaderboardType, ok := clanLeaderboardHistoryType(c.Params("leaderboard_type"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "invalid clan leaderboard_type")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "leaderboard history is unavailable")
		}
		items, err := queryLeaderboardEntityHistory(c.UserContext(), db, leaderboardType, tag)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.ClanLeaderboardHistoryResponse{
			Type:    leaderboardType,
			ClanTag: tag,
			Items:   items,
		})
	}
}

func queryLeaderboardSnapshotHistory(
	ctx context.Context,
	db leaderboardHistoryDB,
	leaderboardType modelsv2.LeaderboardHistoryType,
	locationID string,
	date time.Time,
) ([]map[string]any, error) {
	rows, err := db.Query(ctx, leaderboardSnapshotHistoryQuery, leaderboardType, locationID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var item map[string]any
		if err := json.Unmarshal(raw, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func queryLeaderboardEntityHistory(
	ctx context.Context,
	db leaderboardHistoryDB,
	leaderboardType modelsv2.LeaderboardHistoryType,
	tag string,
) ([]modelsv2.LeaderboardEntityHistoryItem, error) {
	rows, err := db.Query(ctx, leaderboardEntityHistoryQuery, leaderboardType, tag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []modelsv2.LeaderboardEntityHistoryItem{}
	for rows.Next() {
		var date time.Time
		var item modelsv2.LeaderboardEntityHistoryItem
		var raw []byte
		if err := rows.Scan(&date, &item.LocationID, &item.Name, &item.Rank, &raw); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &item.Details); err != nil {
			return nil, err
		}
		item.Date = date.Format("2006-01-02")
		items = append(items, item)
	}
	return items, rows.Err()
}
