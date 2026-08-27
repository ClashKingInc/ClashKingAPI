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
	  AND event_time <= $3
	ORDER BY event_time DESC
	LIMIT $4
`

const playerStatHistoryByTypeQuery = `
	SELECT event_time, clan_tag, stat_type, previous_value, current_value, delta
	FROM player_stat_changes
	WHERE player_tag = $1
	  AND stat_type = $2
	  AND event_time >= $3
	  AND event_time <= $4
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
// @Summary Track a player's activity gains
// @Description Returns positive changes for one required activity type over an inclusive time range, newest first and limited to stored observations.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param type query string true "Stat type" Enums(donated,received,clan_games,capital_gold_donated)
// @Param time[after] query string false "Only include changes at or after this ISO-8601 time; defaults to 30 days ago when no time range is provided"
// @Param time[before] query string false "Only include changes at or before this ISO-8601 time"
// @Param limit query int false "Maximum changes to return" default(50) minimum(1) maximum(500)
// @Success 200 {object} modelsv2.PlayerStatHistoryResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Failure 503 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/history/stats [get]
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
		statType := modelsv2.PlayerStatType(strings.TrimSpace(c.Query("type")))
		if statType == "" {
			return apptypes.Error(http.StatusBadRequest, "type is required")
		}
		if _, ok := playerStatTypes[statType]; !ok {
			return apptypes.Error(http.StatusBadRequest, "invalid type")
		}
		now := time.Now().UTC()
		defaultAfter, defaultBefore := time.Unix(0, 0).UTC(), time.Unix(9999999999, 0).UTC()
		if strings.TrimSpace(c.Query("time[after]")) == "" && strings.TrimSpace(c.Query("time[before]")) == "" {
			defaultAfter, defaultBefore = now.Add(-30*24*time.Hour), now
		}
		start, end, err := v2TimeWindowFromQuery(c, defaultAfter, defaultBefore)
		if err != nil {
			return err
		}
		limit, err := playerStatHistoryLimit(c.Query("limit"))
		if err != nil {
			return err
		}
		if db == nil {
			return apptypes.Error(http.StatusServiceUnavailable, "player stat history is unavailable")
		}

		query := playerStatHistoryByTypeQuery
		args := []any{playerTag, string(statType), start, end, limit}
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

func playerStatHistoryLimit(raw string) (int, error) {
	if raw == "" {
		return 50, nil
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
