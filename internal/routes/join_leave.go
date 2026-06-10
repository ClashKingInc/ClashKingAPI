package routes

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

var joinLeaveEventFields = []string{
	"time",
	"type",
	"clan",
	"clan_name",
	"tag",
	"name",
	"th",
	"role",
}

var joinLeaveSQLSortFields = map[string]string{
	"time":      "jl.event_time",
	"type":      "jl.event_type",
	"clan":      "jl.clan_tag",
	"clan_name": "bc.name",
	"tag":       "jl.player_tag",
	"name":      "jl.player_name",
	"th":        "jl.townhall_level",
	"role":      "jl.clan_role",
}

// clanJoinLeave godoc
// @Summary Get clan join-leave history
// @Description Returns join and leave history for a single clan tag. Date filters use ISO-8601 values such as 2026-05-01T00:00:00Z.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param limit query int false "Maximum events per page" default(50)
// @Param offset query int false "Number of events to skip" default(0)
// @Param page query int false "1-based page number; ignored when offset is provided"
// @Param time[after] query string false "Only include events at or after this ISO-8601 time"
// @Param time[before] query string false "Only include events at or before this ISO-8601 time"
// @Param sort query string false "Comma-separated event sort fields; prefix with - for descending" default(-time)
// @Param fields query string false "Comma-separated event fields to include"
// @Param type query string false "Event type filter"
// @Success 200 {object} modelsv2.JoinLeaveResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/join-leave [get]
func clanJoinLeave(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		item, err := joinLeaveResponse(c, a, joinLeaveScopeClan, clanFixTag(c.Params("clan_tag")))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, item)
	}
}

// clanJoinLeaveStats godoc
// @Summary Get clan join-leave stats
// @Description Returns join and leave summary stats for a single clan tag. Date filters use ISO-8601 values such as 2026-05-01T00:00:00Z.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param time[after] query string false "Only include events at or after this ISO-8601 time"
// @Param time[before] query string false "Only include events at or before this ISO-8601 time"
// @Param type query string false "Event type filter"
// @Success 200 {object} modelsv2.JoinLeaveStatsResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/clan/{clan_tag}/join-leave/stats [get]
func clanJoinLeaveStats(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		item, err := joinLeaveStatsResponse(c, a, clanFixTag(c.Params("clan_tag")))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, item)
	}
}

// playerJoinLeave godoc
// @Summary Get player join-leave history
// @Description Returns join and leave history for a single player tag. Date filters use ISO-8601 values such as 2026-05-01T00:00:00Z.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param limit query int false "Maximum events per page" default(50)
// @Param offset query int false "Number of events to skip" default(0)
// @Param page query int false "1-based page number; ignored when offset is provided"
// @Param time[after] query string false "Only include events at or after this ISO-8601 time"
// @Param time[before] query string false "Only include events at or before this ISO-8601 time"
// @Param sort query string false "Comma-separated event sort fields; prefix with - for descending" default(-time)
// @Param fields query string false "Comma-separated event fields to include"
// @Param type query string false "Event type filter"
// @Success 200 {object} modelsv2.JoinLeaveResponse
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Router /v2/player/{player_tag}/join-leave [get]
func playerJoinLeave(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		item, err := joinLeaveResponse(c, a, joinLeaveScopePlayer, playerNormalizeTag(c.Params("player_tag")))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, fiber.StatusOK, item)
	}
}

type joinLeaveScope string

const (
	joinLeaveScopeClan   joinLeaveScope = "clan"
	joinLeaveScopePlayer joinLeaveScope = "player"
)

type joinLeaveWindow struct {
	start     time.Time
	end       time.Time
	startUnix int64
	endUnix   int64
}

func joinLeaveResponse(c *fiber.Ctx, a apptypes.Deps, scope joinLeaveScope, tag string) (map[string]any, error) {
	if tag == "" {
		return nil, apptypes.Error(http.StatusBadRequest, "tag cannot be empty")
	}
	window, err := joinLeaveWindowFromQuery(c)
	if err != nil {
		return nil, err
	}
	pagination, err := v2PaginationFromQuery(c, 50, 500)
	if err != nil {
		return nil, err
	}
	opts := v2CollectionOptionsFromQuery(c, joinLeaveEventFields, "-time")
	events, total, err := joinLeaveEvents(c, a, scope, tag, window, opts, pagination)
	if err != nil {
		return nil, err
	}
	return joinLeaveBuildResponse(scope, tag, events, window, opts, pagination, total), nil
}

func joinLeaveStatsResponse(c *fiber.Ctx, a apptypes.Deps, clanTag string) (map[string]any, error) {
	if clanTag == "" {
		return nil, apptypes.Error(http.StatusBadRequest, "clan_tag cannot be empty")
	}
	window, err := joinLeaveWindowFromQuery(c)
	if err != nil {
		return nil, err
	}
	events, err := joinLeaveStatsEvents(c, a, clanTag, window)
	if err != nil {
		return nil, err
	}
	return joinLeaveBuildStatsResponse(clanTag, window, events), nil
}

func joinLeaveEvents(c *fiber.Ctx, a apptypes.Deps, scope joinLeaveScope, tag string, window joinLeaveWindow, opts v2CollectionOptions, pagination v2Pagination) ([]map[string]any, int, error) {
	tagColumn := "jl.clan_tag"
	if scope == joinLeaveScopePlayer {
		tagColumn = "jl.player_tag"
	}
	args := []any{tag, window.start, window.end}
	typeFilter := ""
	if joinLeaveType := strings.TrimSpace(c.Query("type")); joinLeaveType != "" {
		args = append(args, joinLeaveType)
		typeFilter = "AND jl.event_type = $4"
	}
	whereClause := `
			WHERE ` + tagColumn + ` = $1
			  AND jl.event_time >= $2
			  AND jl.event_time <= $3
			  ` + typeFilter
	total := 0
	if err := a.Store.SQL.QueryRow(
		c.UserContext(),
		`
			SELECT COUNT(*)
			FROM join_leave_history jl
			`+whereClause+`
		`,
		args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return []map[string]any{}, 0, nil
	}

	queryArgs := append([]any(nil), args...)
	limitPlaceholder := len(queryArgs) + 1
	queryArgs = append(queryArgs, pagination.Limit)
	offsetPlaceholder := len(queryArgs) + 1
	queryArgs = append(queryArgs, pagination.Offset)
	orderBy := v2SQLOrderBy(opts.Sort, joinLeaveSQLSortFields, "jl.event_time DESC, jl.player_tag ASC, jl.clan_tag ASC, jl.event_type ASC")

	rows, err := a.Store.SQL.Query(
		c.UserContext(),
		`
			SELECT jl.event_time, jl.event_type, jl.clan_tag, jl.player_tag, jl.player_name, jl.townhall_level, jl.clan_role, jl.data,
			       bc.name AS clan_name
			FROM join_leave_history jl
			LEFT JOIN basic_clan bc ON bc.tag = jl.clan_tag
			`+whereClause+`
			ORDER BY `+orderBy+`
			LIMIT $`+strconv.Itoa(limitPlaceholder)+` OFFSET $`+strconv.Itoa(offsetPlaceholder)+`
		`,
		queryArgs...,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := []map[string]any{}
	for rows.Next() {
		var eventTime time.Time
		var eventType, clanTag, playerTag string
		var playerName, clanRole, clanName pgtype.Text
		var townhall int16
		var dataRaw []byte
		if err := rows.Scan(&eventTime, &eventType, &clanTag, &playerTag, &playerName, &townhall, &clanRole, &dataRaw, &clanName); err != nil {
			return nil, 0, err
		}
		item := clanDecodeJSONObject(dataRaw)
		item["time"] = eventTime
		item["type"] = eventType
		item["clan"] = clanTag
		item["tag"] = playerTag
		item["th"] = townhall
		if playerName.Valid {
			item["name"] = playerName.String
		}
		if clanRole.Valid {
			item["role"] = clanRole.String
		}
		if clanName.Valid {
			item["clan_name"] = clanName.String
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func joinLeaveStatsEvents(c *fiber.Ctx, a apptypes.Deps, clanTag string, window joinLeaveWindow) ([]mobileJoinLeaveEvent, error) {
	args := []any{clanTag, window.start, window.end}
	typeFilter := ""
	if joinLeaveType := strings.TrimSpace(c.Query("type")); joinLeaveType != "" {
		args = append(args, joinLeaveType)
		typeFilter = "AND event_type = $4"
	}

	rows, err := a.Store.SQL.Query(
		c.UserContext(),
		`
			SELECT event_time, event_type, player_tag, player_name
			FROM join_leave_history
			WHERE clan_tag = $1
			  AND event_time >= $2
			  AND event_time <= $3
			  `+typeFilter+`
			ORDER BY event_time ASC, player_tag ASC, event_type ASC
		`,
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []mobileJoinLeaveEvent{}
	for rows.Next() {
		var eventTime time.Time
		var eventType, playerTag string
		var playerName pgtype.Text
		if err := rows.Scan(&eventTime, &eventType, &playerTag, &playerName); err != nil {
			return nil, err
		}
		events = append(events, mobileJoinLeaveEvent{
			Tag:  playerTag,
			Name: mobileString(playerName.String),
			Type: eventType,
			Time: eventTime,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return events, nil
}

func joinLeaveWindowFromQuery(c *fiber.Ctx) (joinLeaveWindow, error) {
	season := strings.TrimSpace(c.Query("season"))
	currentSeason := strings.EqualFold(strings.TrimSpace(c.Query("current_season")), "true")
	if season == "" && currentSeason {
		season = genSeasonDate(0, false).(string)
	}
	if season != "" {
		start, end, err := joinLeaveSeasonBounds(season)
		if err != nil {
			return joinLeaveWindow{}, err
		}
		return joinLeaveWindow{
			start:     start,
			end:       end,
			startUnix: start.Unix(),
			endUnix:   end.Unix(),
		}, nil
	}

	start, err := v2ParseISO8601QueryTime(c, "time", "after", time.Unix(0, 0).UTC())
	if err != nil {
		return joinLeaveWindow{}, err
	}
	end, err := v2ParseISO8601QueryTime(c, "time", "before", time.Unix(9999999999, 0).UTC())
	if err != nil {
		return joinLeaveWindow{}, err
	}
	if end.Before(start) {
		return joinLeaveWindow{}, apptypes.Error(http.StatusBadRequest, "time[before] must be after time[after]")
	}
	return joinLeaveWindow{
		start:     start,
		end:       end,
		startUnix: start.Unix(),
		endUnix:   end.Unix(),
	}, nil
}

func joinLeaveSeasonBounds(season string) (time.Time, time.Time, error) {
	startRaw, endRaw, err := resolveSeasonBounds(season, false)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	start, err := time.Parse(time.RFC3339, startRaw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	end, err := time.Parse(time.RFC3339, endRaw)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	return start.UTC(), end.UTC(), nil
}

func v2ParseISO8601QueryTime(c *fiber.Ctx, base string, op string, fallback time.Time) (time.Time, error) {
	raw := strings.TrimSpace(c.Query(base + "[" + op + "]"))
	if raw == "" {
		return fallback, nil
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02"} {
		parsed, err := time.Parse(layout, raw)
		if err == nil {
			return parsed.UTC(), nil
		}
	}
	return time.Time{}, apptypes.Error(http.StatusBadRequest, base+"["+op+"] must be an ISO-8601 date or timestamp")
}

func joinLeaveBuildResponse(scope joinLeaveScope, tag string, rows []map[string]any, window joinLeaveWindow, opts v2CollectionOptions, pagination v2Pagination, total int) map[string]any {
	docs := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		clean, ok := sanitize(row).(map[string]any)
		if !ok {
			continue
		}
		eventTime, ok := mobileTime(clean["time"])
		if !ok {
			continue
		}
		clean["time"] = eventTime.UTC().Format(time.RFC3339)
		docs = append(docs, clean)
	}

	for i, doc := range docs {
		docs[i] = v2ApplyMapFields(doc, opts.Fields)
	}

	response := map[string]any{
		"timestamp_start": window.startUnix,
		"timestamp_end":   window.endUnix,
		"items":           mobileMapsToAny(docs),
		"pagination":      v2PaginationMeta(pagination, total),
	}
	if scope == joinLeaveScopePlayer {
		response["player_tag"] = tag
	} else {
		response["clan_tag"] = tag
	}
	return response
}

func joinLeaveBuildStatsResponse(clanTag string, window joinLeaveWindow, events []mobileJoinLeaveEvent) map[string]any {
	return map[string]any{
		"clan_tag":        clanTag,
		"timestamp_start": window.startUnix,
		"timestamp_end":   window.endUnix,
		"stats":           mobileBuildJoinLeaveStats(events),
	}
}

var (
	_ modelsv2.JoinLeaveResponse
	_ modelsv2.JoinLeaveStatsResponse
)
