package routes

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const playerStatHistoryQuery = `
	SELECT event_time, clan_tag, stat_type, previous_value, current_value, delta
	FROM player_stat_changes
	WHERE player_tag = $1
	  AND event_time >= $2
	  AND event_time < $3
	ORDER BY event_time DESC
	LIMIT $4
`

const playerStatHistoryByTypeQuery = `
	SELECT event_time, clan_tag, stat_type, previous_value, current_value, delta
	FROM player_stat_changes
	WHERE player_tag = $1
	  AND stat_type = $2
	  AND event_time >= $3
	  AND event_time < $4
	ORDER BY event_time DESC
	LIMIT $5
`

var playerStatTypes = map[modelsv2.PlayerStatType]struct{}{
	modelsv2.PlayerStatTypeDonated:            {},
	modelsv2.PlayerStatTypeReceived:           {},
	modelsv2.PlayerStatTypeClanGames:          {},
	modelsv2.PlayerStatTypeCapitalGoldDonated: {},
}

type playerStatHistoryDB interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

// playerStatHistory godoc
// @Summary Get player stat changes
// @Description Returns stored typed positive stat changes for a player over a half-open Unix timestamp range, newest first.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param timestamp_start query int false "Inclusive start Unix timestamp. Defaults to all history."
// @Param timestamp_end query int false "Exclusive end Unix timestamp."
// @Param stat_type query string false "Typed stat filter." Enums(donated,received,clan_games,capital_gold_donated)
// @Param limit query int false "Maximum number of changes. Default and max 500."
// @Success 200 {object} modelsv2.PlayerStatHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/stat-history [get]
func playerStatHistory(a apptypes.Deps) fiber.Handler {
	var db playerStatHistoryDB
	if a.Store != nil {
		db = a.Store.SQL
	}
	return playerStatHistoryHandler(db)
}

func playerStatHistoryHandler(db playerStatHistoryDB) fiber.Handler {
	return func(c *fiber.Ctx) error {
		playerTag := playerNormalizeTag(c.Params("player_tag"))
		if playerTag == "" {
			return apptypes.Error(http.StatusBadRequest, "invalid player_tag")
		}
		startUnix, err := playerStatHistoryTimestamp(c, "timestamp_start", 0)
		if err != nil {
			return err
		}
		endUnix, err := playerStatHistoryTimestamp(c, "timestamp_end", 9999999999)
		if err != nil {
			return err
		}
		if startUnix >= endUnix {
			return apptypes.Error(http.StatusBadRequest, "timestamp_start must be before timestamp_end")
		}
		statType := modelsv2.PlayerStatType(strings.TrimSpace(c.Query("stat_type")))
		if statType != "" {
			if _, ok := playerStatTypes[statType]; !ok {
				return apptypes.Error(http.StatusBadRequest, "invalid stat_type")
			}
		}
		limit, err := playerStatHistoryLimit(c.Query("limit"))
		if err != nil {
			return err
		}
		if db == nil {
			return apptypes.Error(http.StatusServiceUnavailable, "player stat history is unavailable")
		}

		start := time.Unix(startUnix, 0).UTC()
		end := time.Unix(endUnix, 0).UTC()
		query := playerStatHistoryQuery
		args := []any{playerTag, start, end, limit}
		if statType != "" {
			query = playerStatHistoryByTypeQuery
			args = []any{playerTag, string(statType), start, end, limit}
		}
		rows, err := db.Query(c.UserContext(), query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()

		items := make([]modelsv2.PlayerStatChange, 0)
		for rows.Next() {
			var item modelsv2.PlayerStatChange
			if err := rows.Scan(
				&item.EventTime,
				&item.ClanTag,
				&item.StatType,
				&item.PreviousValue,
				&item.CurrentValue,
				&item.Delta,
			); err != nil {
				return err
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.PlayerStatHistoryResponse{Items: items})
	}
}

func playerStatHistoryTimestamp(c *fiber.Ctx, name string, fallback int64) (int64, error) {
	raw := c.Query(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < 0 {
		return 0, apptypes.Error(http.StatusBadRequest, "invalid "+name)
	}
	return value, nil
}

func playerStatHistoryLimit(raw string) (int, error) {
	if raw == "" {
		return 500, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 {
		return 0, apptypes.Error(http.StatusBadRequest, "invalid limit")
	}
	if value > 500 {
		value = 500
	}
	return value, nil
}
