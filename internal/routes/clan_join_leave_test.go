package routes

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
)

func TestJoinLeaveSeasonBoundsUseClashSeasonWindow(t *testing.T) {
	start, end, err := joinLeaveSeasonBounds("2026-05")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedStart := time.Date(2026, time.April, 1, 5, 0, 0, 0, time.UTC)
	expectedEnd := time.Date(2026, time.May, 1, 5, 0, 0, 0, time.UTC)
	if !start.Equal(expectedStart) {
		t.Fatalf("expected season start %s, got %s", expectedStart, start)
	}
	if !end.Equal(expectedEnd) {
		t.Fatalf("expected season end %s, got %s", expectedEnd, end)
	}
}

func TestJoinLeaveWindowFromQueryParsesLHSISO8601Dates(t *testing.T) {
	app := fiber.New()
	var window joinLeaveWindow
	var parseErr error
	app.Get("/", func(c *fiber.Ctx) error {
		window, parseErr = joinLeaveWindowFromQuery(c)
		return nil
	})

	req := httptest.NewRequest("GET", "/?time%5Bafter%5D=2026-05-01T00%3A00%3A00Z&time%5Bbefore%5D=2026-05-02", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("unexpected app test error: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	if parseErr != nil {
		t.Fatalf("unexpected parse error: %v", parseErr)
	}

	expectedStart := time.Date(2026, time.May, 1, 0, 0, 0, 0, time.UTC)
	expectedEnd := time.Date(2026, time.May, 2, 0, 0, 0, 0, time.UTC)
	if !window.start.Equal(expectedStart) {
		t.Fatalf("expected start %s, got %s", expectedStart, window.start)
	}
	if !window.end.Equal(expectedEnd) {
		t.Fatalf("expected end %s, got %s", expectedEnd, window.end)
	}
}

func TestV2PaginationFromQuerySupportsPageOffset(t *testing.T) {
	app := fiber.New()
	var pagination v2Pagination
	var parseErr error
	app.Get("/", func(c *fiber.Ctx) error {
		pagination, parseErr = v2PaginationFromQuery(c, 50, 500)
		return nil
	})

	req := httptest.NewRequest("GET", "/?limit=25&page=3", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("unexpected app test error: %v", err)
	}
	if resp.StatusCode != fiber.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	if parseErr != nil {
		t.Fatalf("unexpected parse error: %v", parseErr)
	}
	if pagination.Limit != 25 {
		t.Fatalf("expected limit 25, got %d", pagination.Limit)
	}
	if pagination.Offset != 50 {
		t.Fatalf("expected offset 50, got %d", pagination.Offset)
	}
}

func TestV2SQLOrderByUsesAllowlistedFields(t *testing.T) {
	sortOptions := []v2SortOption{
		{Field: "th", Desc: true},
		{Field: "name", Desc: false},
		{Field: "ignored", Desc: true},
	}

	got := v2SQLOrderBy(sortOptions, joinLeaveSQLSortFields, "jl.event_time DESC")
	want := "jl.townhall_level DESC NULLS LAST, jl.player_name ASC NULLS LAST, jl.event_time DESC"
	if got != want {
		t.Fatalf("expected order by %q, got %q", want, got)
	}
}

func TestJoinLeaveBuildResponseBuildsClanContract(t *testing.T) {
	rows := []map[string]any{
		{
			"clan": "#AAA",
			"tag":  "#P2",
			"name": "Bob",
			"type": "join",
			"time": time.Date(2026, time.May, 3, 12, 0, 0, 0, time.UTC),
			"th":   15,
		},
		{
			"clan": "#AAA",
			"tag":  "#P1",
			"name": "Alice",
			"type": "leave",
			"time": time.Date(2026, time.May, 2, 9, 0, 0, 0, time.UTC),
			"th":   16,
		},
		{
			"clan": "#AAA",
			"tag":  "#P1",
			"name": "Alice",
			"type": "join",
			"time": time.Date(2026, time.May, 1, 9, 0, 0, 0, time.UTC),
			"th":   16,
		},
	}

	item := joinLeaveBuildResponse(joinLeaveScopeClan, "#AAA", rows, joinLeaveWindow{
		startUnix: 111,
		endUnix:   222,
	}, v2CollectionOptions{}, v2Pagination{Limit: 50, Offset: 0}, 3)

	if got := item["clan_tag"]; got != "#AAA" {
		t.Fatalf("expected first clan tag #AAA, got %v", got)
	}
	if got := item["timestamp_start"]; got != int64(111) {
		t.Fatalf("expected timestamp_start 111, got %v", got)
	}

	if _, ok := item["stats"]; ok {
		t.Fatal("expected stats to be omitted from paginated join_leave response")
	}

	events, ok := item["items"].([]any)
	if !ok {
		t.Fatalf("expected items slice, got %T", item["items"])
	}
	if len(events) != 3 {
		t.Fatalf("expected three items events, got %d", len(events))
	}
	firstEvent := events[0].(map[string]any)
	if got := firstEvent["name"]; got != "Bob" {
		t.Fatalf("expected newest event first, got %v", got)
	}
	if got := firstEvent["time"]; got != "2026-05-03T12:00:00Z" {
		t.Fatalf("expected RFC3339 time, got %v", got)
	}

	pagination := item["pagination"].(map[string]any)
	if got := pagination["total"]; got != 3 {
		t.Fatalf("expected pagination total 3, got %v", got)
	}
	if got := pagination["has_more"]; got != false {
		t.Fatalf("expected pagination has_more false, got %v", got)
	}
}

func TestJoinLeaveBuildResponseAddsPaginationMeta(t *testing.T) {
	rows := []map[string]any{
		{"clan": "#AAA", "tag": "#P1", "name": "Alice", "type": "leave", "time": time.Date(2026, time.May, 3, 9, 0, 0, 0, time.UTC)},
		{"clan": "#AAA", "tag": "#P1", "name": "Alice", "type": "join", "time": time.Date(2026, time.May, 2, 9, 0, 0, 0, time.UTC)},
	}

	item := joinLeaveBuildResponse(joinLeaveScopeClan, "#AAA", rows, joinLeaveWindow{
		startUnix: 111,
		endUnix:   222,
	}, v2CollectionOptions{}, v2Pagination{Limit: 2, Offset: 2}, 5)

	events := item["items"].([]any)
	if len(events) != 2 {
		t.Fatalf("expected items length 2, got %d", len(events))
	}
	pagination := item["pagination"].(map[string]any)
	if got := pagination["limit"]; got != 2 {
		t.Fatalf("expected pagination limit 2, got %v", got)
	}
	if got := pagination["offset"]; got != 2 {
		t.Fatalf("expected pagination offset 2, got %v", got)
	}
	if got := pagination["next_offset"]; got != 4 {
		t.Fatalf("expected next_offset 4, got %v", got)
	}
	if got := pagination["previous_offset"]; got != 0 {
		t.Fatalf("expected previous_offset 0, got %v", got)
	}
}

func TestJoinLeaveBuildResponseAppliesFields(t *testing.T) {
	rows := []map[string]any{
		{"clan": "#AAA", "tag": "#P1", "name": "Alice", "type": "leave", "time": time.Date(2026, time.May, 3, 9, 0, 0, 0, time.UTC), "role": "member"},
	}

	item := joinLeaveBuildResponse(joinLeaveScopePlayer, "#P1", rows, joinLeaveWindow{
		startUnix: 111,
		endUnix:   222,
	}, v2CollectionOptions{
		Fields: []string{"time", "type"},
	}, v2Pagination{Limit: 50, Offset: 0}, 1)

	if got := item["player_tag"]; got != "#P1" {
		t.Fatalf("expected player tag #P1, got %v", got)
	}
	events := item["items"].([]any)
	firstEvent := events[0].(map[string]any)
	if _, ok := firstEvent["name"]; ok {
		t.Fatal("expected name field to be omitted")
	}
	if got := firstEvent["type"]; got != "leave" {
		t.Fatalf("expected type field to remain, got %v", got)
	}
}

func TestJoinLeaveBuildStatsResponseBuildsClanStats(t *testing.T) {
	events := []mobileJoinLeaveEvent{
		{Tag: "#P1", Name: "Alice", Type: "join", Time: time.Date(2026, time.May, 1, 9, 0, 0, 0, time.UTC)},
		{Tag: "#P1", Name: "Alice", Type: "leave", Time: time.Date(2026, time.May, 2, 9, 0, 0, 0, time.UTC)},
		{Tag: "#P2", Name: "Bob", Type: "join", Time: time.Date(2026, time.May, 3, 9, 0, 0, 0, time.UTC)},
	}

	item := joinLeaveBuildStatsResponse("#AAA", joinLeaveWindow{
		startUnix: 111,
		endUnix:   222,
	}, events)

	if got := item["clan_tag"]; got != "#AAA" {
		t.Fatalf("expected clan tag #AAA, got %v", got)
	}
	stats, ok := item["stats"].(map[string]any)
	if !ok {
		t.Fatalf("expected stats map, got %T", item["stats"])
	}
	if got := stats["total_events"]; got != 3 {
		t.Fatalf("expected total_events 3, got %v", got)
	}
	if got := stats["total_joins"]; got != 2 {
		t.Fatalf("expected total_joins 2, got %v", got)
	}
	if got := stats["total_leaves"]; got != 1 {
		t.Fatalf("expected total_leaves 1, got %v", got)
	}
}
