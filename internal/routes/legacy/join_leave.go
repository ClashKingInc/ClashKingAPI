package legacy

import (
	"net/http"
	"sort"
	"time"

	legacymodels "github.com/ClashKingInc/ClashKingAPI/internal/models/legacy"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

type joinLeaveRow struct {
	Time     time.Time
	Type     string
	Clan     string
	Tag      string
	Name     string
	Townhall int
	ClanName string
}

// clanJoinLeave godoc
// @Summary Clan join and leave history
// @Description Legacy v1-compatible tracked clan membership events.
// @Tags Legacy
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param timestamp_start query int false "Inclusive Unix timestamp" default(0)
// @Param time_stamp_end query int false "Inclusive Unix timestamp" default(9999999999)
// @Param limit query int false "Maximum events" default(250)
// @Success 200 {object} legacy.JoinLeaveResponse
// @Router /clan/{clan_tag}/join-leave [get]
func clanJoinLeave(deps apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start, end, limit, err := joinLeaveOptions(c)
		if err != nil {
			return err
		}
		if limit <= 0 {
			return apptypes.JSON(c, http.StatusOK, legacymodels.JoinLeaveResponse{Items: []legacymodels.JoinLeaveEvent{}})
		}
		rows, err := deps.Store.SQL.Query(c.UserContext(), `
			SELECT "time", "type", clan_tag, player_tag, player_name, townhall_level
			FROM join_leave_history
			WHERE clan_tag = $1 AND "time" >= $2 AND "time" <= $3
			ORDER BY "time" DESC
			LIMIT $4
		`, fixTag(c.Params("clan_tag")), start, end, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		items := make([]legacymodels.JoinLeaveEvent, 0, limit)
		for rows.Next() {
			var row joinLeaveRow
			var name pgtype.Text
			if err := rows.Scan(&row.Time, &row.Type, &row.Clan, &row.Tag, &name, &row.Townhall); err != nil {
				return err
			}
			if name.Valid {
				row.Name = name.String
			}
			items = append(items, legacyJoinLeaveEvent(row, false))
		}
		if err := rows.Err(); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, legacymodels.JoinLeaveResponse{Items: items})
	}
}

// playerJoinLeave godoc
// @Summary Player join and leave history
// @Description Legacy v1-compatible tracked player membership events.
// @Tags Legacy
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param timestamp_start query int false "Inclusive Unix timestamp" default(0)
// @Param time_stamp_end query int false "Inclusive Unix timestamp" default(9999999999)
// @Param limit query int false "Maximum source events" default(250)
// @Success 200 {object} legacy.JoinLeaveResponse
// @Router /player/{player_tag}/join-leave [get]
func playerJoinLeave(deps apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start, end, limit, err := joinLeaveOptions(c)
		if err != nil {
			return err
		}
		if limit <= 0 {
			return apptypes.JSON(c, http.StatusOK, legacymodels.JoinLeaveResponse{Items: []legacymodels.JoinLeaveEvent{}})
		}
		rows, err := deps.Store.SQL.Query(c.UserContext(), `
			SELECT jl."time", jl."type", jl.clan_tag, jl.player_tag, jl.player_name,
			       jl.townhall_level, clan.name
			FROM join_leave_history AS jl
			JOIN basic_clan AS clan ON clan.tag = jl.clan_tag
			WHERE jl.player_tag = $1 AND jl."time" >= $2 AND jl."time" <= $3
			ORDER BY jl."time" ASC
			LIMIT $4
		`, fixTag(c.Params("player_tag")), start, end, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		events := make([]joinLeaveRow, 0, limit)
		for rows.Next() {
			var row joinLeaveRow
			var name pgtype.Text
			if err := rows.Scan(&row.Time, &row.Type, &row.Clan, &row.Tag, &name, &row.Townhall, &row.ClanName); err != nil {
				return err
			}
			if name.Valid {
				row.Name = name.String
			}
			events = append(events, row)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		events = processPlayerJoinLeave(events)
		items := make([]legacymodels.JoinLeaveEvent, 0, len(events))
		for index := len(events) - 1; index >= 0; index-- {
			items = append(items, legacyJoinLeaveEvent(events[index], true))
		}
		return apptypes.JSON(c, http.StatusOK, legacymodels.JoinLeaveResponse{Items: items})
	}
}

func joinLeaveOptions(c *fiber.Ctx) (time.Time, time.Time, int, error) {
	startUnix, err := parseInt64(c.Query("timestamp_start"), 0)
	if err != nil {
		return time.Time{}, time.Time{}, 0, fiber.NewError(http.StatusUnprocessableEntity, "timestamp_start must be an integer")
	}
	endUnix, err := parseInt64(c.Query("time_stamp_end"), 9999999999)
	if err != nil {
		return time.Time{}, time.Time{}, 0, fiber.NewError(http.StatusUnprocessableEntity, "time_stamp_end must be an integer")
	}
	limit, err := parseInt(c.Query("limit"), 250)
	if err != nil {
		return time.Time{}, time.Time{}, 0, fiber.NewError(http.StatusUnprocessableEntity, "limit must be an integer")
	}
	return time.Unix(startUnix, 0).UTC(), time.Unix(endUnix, 0).UTC(), limit, nil
}

func legacyJoinLeaveEvent(row joinLeaveRow, includeClanName bool) legacymodels.JoinLeaveEvent {
	item := legacymodels.JoinLeaveEvent{
		Name: row.Name, Tag: row.Tag, Townhall: row.Townhall, Time: legacyDateTime(row.Time),
		Clan: row.Clan, Type: row.Type,
	}
	if includeClanName {
		item.ClanName = row.ClanName
	}
	return item
}

// processPlayerJoinLeave mirrors the ordering and timestamp correction in the
// original Python endpoint before that endpoint reversed the result.
func processPlayerJoinLeave(source []joinLeaveRow) []joinLeaveRow {
	events := append([]joinLeaveRow(nil), source...)
	corrected := make([]joinLeaveRow, 0, len(events))
	for len(events) > 0 {
		event := events[0]
		events = events[1:]
		corrected = append(corrected, event)
		if event.Type != "join" {
			continue
		}
		leaveIndex := -1
		for index, candidate := range events {
			if candidate.Type == "leave" && candidate.Tag == event.Tag && candidate.Clan == event.Clan {
				leaveIndex = index
				break
			}
		}
		if leaveIndex < 0 {
			continue
		}
		leave := events[leaveIndex]
		events = append(events[:leaveIndex], events[leaveIndex+1:]...)
		for _, candidate := range events {
			if candidate.Type == "join" {
				leave.Time = candidate.Time
				break
			}
		}
		corrected = append(corrected, leave)
	}
	sort.SliceStable(corrected, func(i, j int) bool {
		if corrected[i].Time.Equal(corrected[j].Time) {
			return corrected[i].Type == "leave" && corrected[j].Type != "leave"
		}
		return corrected[i].Time.Before(corrected[j].Time)
	})
	return corrected
}
