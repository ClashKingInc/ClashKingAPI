package routes

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

// clanJoinLeave godoc
// @Summary Review a clan's membership changes
// @Description Returns stored joins and leaves for one clan. Time filters affect returned events, while available and uniquePlayers remain all-time totals.
// @Tags Clan
// @Produce json
// @Param clan_tag path string true "Clan tag"
// @Param time[after] query string false "Only include events at or after this ISO-8601 time"
// @Param time[before] query string false "Only include events at or before this ISO-8601 time"
// @Param limit query int false "Maximum events to return" default(50) minimum(1) maximum(500)
// @Success 200 {object} modelsv2.JoinLeaveResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
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

// playerJoinLeave godoc
// @Summary Review a player's clan movements
// @Description Returns stored clan joins and leaves for one player. Time filters affect returned events, while available remains the all-time total.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param time[after] query string false "Only include events at or after this ISO-8601 time"
// @Param time[before] query string false "Only include events at or before this ISO-8601 time"
// @Param limit query int false "Maximum events to return" default(50) minimum(1) maximum(500)
// @Success 200 {object} modelsv2.JoinLeaveResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
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

// playerJoinLeaveTotals godoc
// @Summary Measure a player's time in each clan
// @Description Totals the player's stored time and visits for every clan, making long-term clan membership easy to compare.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Success 200 {object} modelsv2.JoinLeaveTotalsResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/join-leave/totals [get]
func playerJoinLeaveTotals(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		tag := playerNormalizeTag(c.Params("player_tag"))
		if tag == "" {
			return apptypes.Error(http.StatusBadRequest, "tag cannot be empty")
		}
		window := joinLeaveFullWindow()
		events, err := joinLeaveEvents(c, a, joinLeaveScopePlayer, tag, window, 0)
		if err != nil {
			return err
		}
		events = processJoinLeaveEvents(events)
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"items": joinLeaveClanTotals(events, window),
		})
	}
}

// playerJoinLeaveShared godoc
// @Summary Find clans shared by two players
// @Description Returns every clan the two players shared, including their total overlap and the exact stored time ranges together.
// @Tags Player
// @Produce json
// @Param player_tag path string true "Player tag"
// @Param tag query string true "Other player tag"
// @Success 200 {object} modelsv2.JoinLeaveSharedResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/player/{player_tag}/join-leave/shared [get]
func playerJoinLeaveShared(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		playerTag := playerNormalizeTag(c.Params("player_tag"))
		otherTag := playerNormalizeTag(c.Query("tag"))
		if playerTag == "" {
			return apptypes.Error(http.StatusBadRequest, "tag cannot be empty")
		}
		if otherTag == "" {
			return apptypes.Error(http.StatusBadRequest, "tag query parameter is required")
		}
		window := joinLeaveFullWindow()
		playerEvents, err := joinLeaveEvents(c, a, joinLeaveScopePlayer, playerTag, window, 0)
		if err != nil {
			return err
		}
		otherEvents, err := joinLeaveEvents(c, a, joinLeaveScopePlayer, otherTag, window, 0)
		if err != nil {
			return err
		}
		playerEvents = processJoinLeaveEvents(playerEvents)
		otherEvents = processJoinLeaveEvents(otherEvents)
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"items": joinLeaveSharedClanTotals(playerEvents, otherEvents, window),
		})
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

type joinLeaveEventRow struct {
	Time       time.Time
	Type       string
	ClanTag    string
	ClanName   string
	PlayerTag  string
	PlayerName string
	Townhall   int16
}

type joinLeaveClanTotal struct {
	tag     string
	name    string
	visits  int
	minutes int64
}

type joinLeaveClanInterval struct {
	tag   string
	name  string
	start time.Time
	end   time.Time
}

type joinLeaveSharedTotal struct {
	tag     string
	name    string
	minutes int64
}

func joinLeaveResponse(c *fiber.Ctx, a apptypes.Deps, scope joinLeaveScope, tag string) (map[string]any, error) {
	if tag == "" {
		return nil, apptypes.Error(http.StatusBadRequest, "tag cannot be empty")
	}
	window, err := joinLeaveWindowFromQuery(c)
	if err != nil {
		return nil, err
	}
	limit, err := joinLeaveLimitFromQuery(c)
	if err != nil {
		return nil, err
	}

	events, err := joinLeaveEvents(c, a, scope, tag, window, limit)
	if err != nil {
		return nil, err
	}
	// Summary counts describe all stored history. Time filters only page the
	// returned items, so these values stay stable while scrolling.
	countWindow := joinLeaveFullWindow()
	available, uniquePlayers, err := joinLeaveCounts(c, a, scope, tag, countWindow)
	if err != nil {
		return nil, err
	}
	return joinLeaveBuildResponse(events, available, uniquePlayers, limit, scope), nil
}

func joinLeaveFullWindow() joinLeaveWindow {
	return joinLeaveWindow{
		start:     time.Unix(0, 0).UTC(),
		end:       time.Unix(9999999999, 0).UTC(),
		startUnix: 0,
		endUnix:   9999999999,
	}
}

func joinLeaveLimitFromQuery(c *fiber.Ctx) (int, error) {
	limit, err := v2QueryInt(c, "limit", 50)
	if err != nil {
		return 0, err
	}
	if limit <= 0 {
		return 0, apptypes.Error(http.StatusBadRequest, "invalid limit")
	}
	return clamp(limit, 1, 500), nil
}

func joinLeaveEvents(c *fiber.Ctx, a apptypes.Deps, scope joinLeaveScope, tag string, window joinLeaveWindow, limit int) ([]joinLeaveEventRow, error) {
	tagColumn := "jl.clan_tag"
	if scope == joinLeaveScopePlayer {
		tagColumn = "jl.player_tag"
	}
	args := []any{tag, window.start, window.end}
	whereClause := `
			WHERE ` + tagColumn + ` = $1
			  AND jl."time" >= $2
			  AND jl."time" <= $3
			  `
	queryArgs := append([]any(nil), args...)
	limitSQL := ""
	if limit > 0 {
		limitPlaceholder := len(queryArgs) + 1
		queryArgs = append(queryArgs, limit)
		limitSQL = `
			LIMIT $` + strconv.Itoa(limitPlaceholder)
	}

	rows, err := a.Store.SQL.Query(
		c.UserContext(),
		`
			SELECT jl."time", jl."type", jl.clan_tag, jl.player_tag, jl.player_name, jl.townhall_level,
			       bc.name AS clan_name
			FROM join_leave_history jl
			LEFT JOIN basic_clan bc ON bc.tag = jl.clan_tag
			`+whereClause+`
			ORDER BY jl."time" DESC, jl.player_tag ASC, jl.clan_tag ASC, jl."type" ASC
			`+limitSQL+`
		`,
		queryArgs...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []joinLeaveEventRow{}
	for rows.Next() {
		var eventTime time.Time
		var eventType, clanTag, playerTag string
		var playerName, clanName pgtype.Text
		var townhall int16
		if err := rows.Scan(&eventTime, &eventType, &clanTag, &playerTag, &playerName, &townhall, &clanName); err != nil {
			return nil, err
		}
		item := joinLeaveEventRow{
			Time:      eventTime,
			Type:      eventType,
			ClanTag:   clanTag,
			PlayerTag: playerTag,
			Townhall:  townhall,
		}
		if playerName.Valid {
			item.PlayerName = playerName.String
		}
		if clanName.Valid {
			item.ClanName = clanName.String
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func joinLeaveCounts(c *fiber.Ctx, a apptypes.Deps, scope joinLeaveScope, tag string, window joinLeaveWindow) (int, int, error) {
	tagColumn := "clan_tag"
	if scope == joinLeaveScopePlayer {
		tagColumn = "player_tag"
	}
	var count, uniquePlayers int
	err := a.Store.SQL.QueryRow(
		c.UserContext(),
		`
			SELECT count(*), count(DISTINCT player_tag)
			FROM join_leave_history
			WHERE `+tagColumn+` = $1
			  AND "time" >= $2
			  AND "time" <= $3
		`,
		tag,
		window.start,
		window.end,
	).Scan(&count, &uniquePlayers)
	return count, uniquePlayers, err
}

func joinLeaveWindowFromQuery(c *fiber.Ctx) (joinLeaveWindow, error) {
	start, end, err := v2TimeWindowFromQuery(c, time.Unix(0, 0).UTC(), time.Unix(9999999999, 0).UTC())
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

func v2TimeWindowFromQuery(c *fiber.Ctx, defaultAfter, defaultBefore time.Time) (time.Time, time.Time, error) {
	after, err := v2ParseISO8601QueryTime(c, "time", "after", defaultAfter)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	before, err := v2ParseISO8601QueryTime(c, "time", "before", defaultBefore)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	if before.Before(after) {
		return time.Time{}, time.Time{}, apptypes.Error(http.StatusBadRequest, "time[before] must be after time[after]")
	}
	return after, before, nil
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

func joinLeaveBuildResponse(rows []joinLeaveEventRow, available int, uniquePlayers int, limit int, scope joinLeaveScope) map[string]any {
	if limit <= 0 || limit > len(rows) {
		limit = len(rows)
	}
	items := make([]modelsv2.JoinLeaveEvent, 0, limit)
	for _, row := range rows[:limit] {
		items = append(items, joinLeaveHistoryItem(row, scope == joinLeaveScopePlayer))
	}
	response := map[string]any{
		"items":     items,
		"available": available,
	}
	if scope == joinLeaveScopeClan {
		response["uniquePlayers"] = uniquePlayers
	}
	return response
}

func joinLeaveHistoryItem(row joinLeaveEventRow, includeClan bool) modelsv2.JoinLeaveEvent {
	item := modelsv2.JoinLeaveEvent{
		Time:          row.Time.UTC().Format(time.RFC3339),
		Type:          row.Type,
		Tag:           row.PlayerTag,
		Name:          row.PlayerName,
		TownHallLevel: row.Townhall,
	}
	if includeClan {
		item.Clan = &modelsv2.JoinLeaveClan{
			Name: row.ClanName,
			Tag:  row.ClanTag,
		}
	}
	return item
}

func joinLeaveClanObject(tag string, name string) map[string]any {
	return map[string]any{
		"name": name,
		"tag":  tag,
	}
}

func processJoinLeaveEvents(events []joinLeaveEventRow) []joinLeaveEventRow {
	corrected := make([]joinLeaveEventRow, 0, len(events))
	remaining := append([]joinLeaveEventRow(nil), events...)
	sortJoinLeaveAscending(remaining)
	for len(remaining) > 0 {
		event := remaining[0]
		remaining = remaining[1:]
		corrected = append(corrected, event)
		if event.Type != "join" {
			continue
		}
		leaveIndex := -1
		for i, candidate := range remaining {
			if candidate.Type == "leave" && candidate.PlayerTag == event.PlayerTag && candidate.ClanTag == event.ClanTag {
				leaveIndex = i
				break
			}
		}
		if leaveIndex == -1 {
			continue
		}
		leave := remaining[leaveIndex]
		remaining = append(remaining[:leaveIndex], remaining[leaveIndex+1:]...)
		if nextJoin, ok := nextJoinEvent(remaining); ok {
			leave.Time = nextJoin.Time
		}
		corrected = append(corrected, leave)
	}
	sortJoinLeaveAscending(corrected)

	activeClanByPlayer := map[string]string{}
	final := make([]joinLeaveEventRow, 0, len(corrected))
	for _, event := range corrected {
		if event.Type == "join" {
			activeClanByPlayer[event.PlayerTag] = event.ClanTag
			final = append(final, event)
			continue
		}
		if activeClanByPlayer[event.PlayerTag] == event.ClanTag {
			delete(activeClanByPlayer, event.PlayerTag)
			final = append(final, event)
			continue
		}
		final = append(final, event)
	}
	sort.SliceStable(final, func(i, j int) bool {
		if final[i].Time.Equal(final[j].Time) {
			if final[i].Type == final[j].Type {
				return final[i].ClanTag < final[j].ClanTag
			}
			return final[i].Type == "join"
		}
		return final[i].Time.After(final[j].Time)
	})
	return final
}

func sortJoinLeaveAscending(events []joinLeaveEventRow) {
	sort.SliceStable(events, func(i, j int) bool {
		if events[i].Time.Equal(events[j].Time) {
			if events[i].Type == events[j].Type {
				return events[i].ClanTag < events[j].ClanTag
			}
			return events[i].Type == "leave"
		}
		return events[i].Time.Before(events[j].Time)
	})
}

func nextJoinEvent(events []joinLeaveEventRow) (joinLeaveEventRow, bool) {
	for _, event := range events {
		if event.Type == "join" {
			return event, true
		}
	}
	return joinLeaveEventRow{}, false
}

func joinLeaveClanTotals(events []joinLeaveEventRow, window joinLeaveWindow) []map[string]any {
	totals := map[string]*joinLeaveClanTotal{}
	for _, event := range events {
		if event.Type == "join" {
			addJoinLeaveClanVisit(totals, event.ClanTag, event.ClanName)
		}
	}
	for _, interval := range joinLeaveClanIntervals(events, window) {
		addJoinLeaveClanMinutes(totals, interval.tag, interval.name, interval.start, interval.end)
	}
	out := make([]map[string]any, 0, len(totals))
	for _, item := range totals {
		out = append(out, map[string]any{
			"clan":    joinLeaveClanObject(item.tag, item.name),
			"visits":  item.visits,
			"minutes": item.minutes,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		left := out[i]["minutes"].(int64)
		right := out[j]["minutes"].(int64)
		if left == right {
			return mobileString(out[i]["clan"].(map[string]any)["tag"]) < mobileString(out[j]["clan"].(map[string]any)["tag"])
		}
		return left > right
	})
	return out
}

func addJoinLeaveClanVisit(totals map[string]*joinLeaveClanTotal, tag string, name string) {
	if tag == "" {
		return
	}
	item := totals[tag]
	if item == nil {
		item = &joinLeaveClanTotal{tag: tag, name: name}
		totals[tag] = item
	}
	if item.name == "" {
		item.name = name
	}
	item.visits++
}

func addJoinLeaveClanMinutes(totals map[string]*joinLeaveClanTotal, tag string, name string, start time.Time, end time.Time) {
	if tag == "" || !end.After(start) {
		return
	}
	item := totals[tag]
	if item == nil {
		item = &joinLeaveClanTotal{tag: tag, name: name}
		totals[tag] = item
	}
	if item.name == "" {
		item.name = name
	}
	item.minutes += int64(end.Sub(start).Minutes())
}

func joinLeaveClanIntervals(events []joinLeaveEventRow, window joinLeaveWindow) []joinLeaveClanInterval {
	ascending := append([]joinLeaveEventRow(nil), events...)
	sortJoinLeaveAscending(ascending)
	intervals := []joinLeaveClanInterval{}
	var active *joinLeaveEventRow
	for _, event := range ascending {
		switch event.Type {
		case "join":
			if active != nil {
				intervals = append(intervals, joinLeaveIntervalFromEvent(*active, active.Time, event.Time))
			}
			copy := event
			active = &copy
		case "leave":
			if active != nil && active.ClanTag == event.ClanTag {
				intervals = append(intervals, joinLeaveIntervalFromEvent(*active, active.Time, event.Time))
				active = nil
			}
		}
	}
	if active != nil {
		end := window.end
		now := time.Now().UTC()
		if end.After(now) {
			end = now
		}
		intervals = append(intervals, joinLeaveIntervalFromEvent(*active, active.Time, end))
	}
	out := intervals[:0]
	for _, interval := range intervals {
		if interval.tag != "" && interval.end.After(interval.start) {
			out = append(out, interval)
		}
	}
	return out
}

func joinLeaveIntervalFromEvent(event joinLeaveEventRow, start time.Time, end time.Time) joinLeaveClanInterval {
	return joinLeaveClanInterval{
		tag:   event.ClanTag,
		name:  event.ClanName,
		start: start,
		end:   end,
	}
}

func joinLeaveSharedClanTotals(leftEvents []joinLeaveEventRow, rightEvents []joinLeaveEventRow, window joinLeaveWindow) []modelsv2.JoinLeaveSharedClanTotal {
	leftIntervals := joinLeaveClanIntervals(leftEvents, window)
	rightIntervals := joinLeaveClanIntervals(rightEvents, window)
	totals := map[string]*joinLeaveSharedTotal{}
	for _, left := range leftIntervals {
		for _, right := range rightIntervals {
			if left.tag == "" || left.tag != right.tag {
				continue
			}
			start := maxTime(left.start, right.start)
			end := minTime(left.end, right.end)
			if !end.After(start) {
				continue
			}
			item := totals[left.tag]
			if item == nil {
				item = &joinLeaveSharedTotal{tag: left.tag, name: firstNonEmpty(left.name, right.name)}
				totals[left.tag] = item
			}
			if item.name == "" {
				item.name = firstNonEmpty(left.name, right.name)
			}
			item.minutes += int64(end.Sub(start).Minutes())
		}
	}
	out := make([]modelsv2.JoinLeaveSharedClanTotal, 0, len(totals))
	for _, item := range totals {
		out = append(out, modelsv2.JoinLeaveSharedClanTotal{
			Clan: modelsv2.JoinLeaveClan{
				Name: item.name,
				Tag:  item.tag,
			},
			Minutes: item.minutes,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Minutes == out[j].Minutes {
			return out[i].Clan.Tag < out[j].Clan.Tag
		}
		return out[i].Minutes > out[j].Minutes
	})
	return out
}

func maxTime(a time.Time, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

func minTime(a time.Time, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

var (
	_ modelsv2.JoinLeaveResponse
)
