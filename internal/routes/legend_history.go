package routes

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const (
	legendHistoryDefaultLimit = 25
	legendHistoryMaximumLimit = 200
)

const legendSeasonHistoryQuery = `
	SELECT season, player_tag, rank, trophies, data
	FROM legend_history
	WHERE season = $1
	ORDER BY rank
	LIMIT $2
`

const legendPlayerHistoryQuery = `
	SELECT season, player_tag, rank, trophies, data
	FROM legend_history
	WHERE player_tag = $1
	ORDER BY season DESC
`

type legendHistoryDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func configuredLegendHistoryDB(a apptypes.Deps) legendHistoryDB {
	if a.Store == nil {
		return nil
	}
	return a.Store.SQL
}

func parseLegendHistorySeason(raw string) (string, bool) {
	season, err := time.Parse("2006-01", raw)
	if err != nil || season.Format("2006-01") != raw {
		return "", false
	}
	return raw, true
}

func legendHistoryLimit(raw string) (int, bool) {
	if raw == "" {
		return legendHistoryDefaultLimit, true
	}
	limit, err := strconv.Atoi(raw)
	if err != nil || limit < 1 || limit > legendHistoryMaximumLimit {
		return 0, false
	}
	return limit, true
}

// legendSeasonHistory godoc
// @Summary Get a final Legend season leaderboard
// @Description Returns the stored final official Legend leaderboard for one completed season, ordered by rank.
// @Tags Leaderboard
// @Produce json
// @Param season path string true "Official Legend season ID in YYYY-MM format"
// @Param limit query int false "Result limit" default(25) minimum(1) maximum(200)
// @Success 200 {object} modelsv2.LegendSeasonHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/legends/history/{season} [get]
func legendSeasonHistory(a apptypes.Deps) fiber.Handler {
	return legendSeasonHistoryHandler(configuredLegendHistoryDB(a))
}

func legendSeasonHistoryHandler(db legendHistoryDB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		season, ok := parseLegendHistorySeason(c.Params("season"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "invalid season")
		}
		limit, ok := legendHistoryLimit(c.Query("limit"))
		if !ok {
			return apptypes.Error(fiber.StatusBadRequest, "limit must be between 1 and 200")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Legend history is unavailable")
		}
		items, err := queryLegendHistory(c.UserContext(), db, legendSeasonHistoryQuery, season, limit)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.LegendSeasonHistoryResponse{Items: items})
	}
}

// playerLegendHistory godoc
// @Summary Get a player's final Legend history
// @Description Returns every stored final Legend season placement for one player in descending season order.
// @Tags Leaderboard
// @Produce json
// @Param player_tag path string true "Player tag"
// @Success 200 {object} modelsv2.PlayerLegendHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/legend-history [get]
func playerLegendHistory(a apptypes.Deps) fiber.Handler {
	return playerLegendHistoryHandler(configuredLegendHistoryDB(a))
}

func playerLegendHistoryHandler(db legendHistoryDB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Params("player_tag"))
		if tag == "" {
			return apptypes.Error(fiber.StatusBadRequest, "invalid player_tag")
		}
		if db == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "Legend history is unavailable")
		}
		items, err := queryLegendHistory(c.UserContext(), db, legendPlayerHistoryQuery, tag)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.PlayerLegendHistoryResponse{Items: items})
	}
}

func queryLegendHistory(ctx context.Context, db legendHistoryDB, query string, args ...any) ([]modelsv2.LegendHistoryItem, error) {
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []modelsv2.LegendHistoryItem{}
	for rows.Next() {
		var season, playerTag string
		var rank, trophies int
		var raw []byte
		if err := rows.Scan(&season, &playerTag, &rank, &trophies, &raw); err != nil {
			return nil, err
		}
		var item modelsv2.LegendHistoryItem
		if err := json.Unmarshal(raw, &item); err != nil {
			return nil, err
		}
		item.Season = season
		item.Tag = playerTag
		item.Rank = rank
		item.Trophies = trophies
		items = append(items, item)
	}
	return items, rows.Err()
}
