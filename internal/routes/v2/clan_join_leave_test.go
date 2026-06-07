package v2

import (
	"testing"
	"time"
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

func TestJoinLeaveItemsFromRowsBuildPerClanContract(t *testing.T) {
	rows := []map[string]any{
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
		{
			"clan": "#BBB",
			"tag":  "#P2",
			"name": "Bob",
			"type": "join",
			"time": time.Date(2026, time.May, 3, 12, 0, 0, 0, time.UTC),
			"th":   15,
		},
	}

	items := joinLeaveItemsFromRows(rows, []string{"#AAA", "#BBB"}, joinLeaveWindow{
		startUnix: 111,
		endUnix:   222,
	}, 50)

	if len(items) != 2 {
		t.Fatalf("expected two clan items, got %d", len(items))
	}

	first := items[0]
	if got := first["clan_tag"]; got != "#AAA" {
		t.Fatalf("expected first clan tag #AAA, got %v", got)
	}
	if got := first["timestamp_start"]; got != int64(111) {
		t.Fatalf("expected timestamp_start 111, got %v", got)
	}

	stats, ok := first["stats"].(map[string]any)
	if !ok {
		t.Fatalf("expected stats map, got %T", first["stats"])
	}
	if got := stats["total_events"]; got != 2 {
		t.Fatalf("expected total_events 2, got %v", got)
	}
	if got := stats["total_joins"]; got != 1 {
		t.Fatalf("expected total_joins 1, got %v", got)
	}
	if got := stats["total_leaves"]; got != 1 {
		t.Fatalf("expected total_leaves 1, got %v", got)
	}

	events, ok := first["join_leave_list"].([]any)
	if !ok {
		t.Fatalf("expected join_leave_list slice, got %T", first["join_leave_list"])
	}
	if len(events) != 2 {
		t.Fatalf("expected two join_leave_list events, got %d", len(events))
	}
	firstEvent := events[0].(map[string]any)
	if got := firstEvent["type"]; got != "leave" {
		t.Fatalf("expected newest event first, got %v", got)
	}
	if got := firstEvent["time"]; got != "2026-05-02T09:00:00Z" {
		t.Fatalf("expected RFC3339 time, got %v", got)
	}
}

func TestJoinLeaveItemsFromRowsApplyPerClanLimit(t *testing.T) {
	rows := []map[string]any{
		{"clan": "#AAA", "tag": "#P1", "name": "Alice", "type": "leave", "time": time.Date(2026, time.May, 3, 9, 0, 0, 0, time.UTC)},
		{"clan": "#AAA", "tag": "#P1", "name": "Alice", "type": "join", "time": time.Date(2026, time.May, 2, 9, 0, 0, 0, time.UTC)},
		{"clan": "#AAA", "tag": "#P2", "name": "Bob", "type": "join", "time": time.Date(2026, time.May, 1, 9, 0, 0, 0, time.UTC)},
	}

	items := joinLeaveItemsFromRows(rows, []string{"#AAA"}, joinLeaveWindow{
		startUnix:   111,
		endUnix:     222,
		limitEvents: true,
	}, 2)

	stats := items[0]["stats"].(map[string]any)
	if got := stats["total_events"]; got != 2 {
		t.Fatalf("expected limited stats total_events 2, got %v", got)
	}
	events := items[0]["join_leave_list"].([]any)
	if len(events) != 2 {
		t.Fatalf("expected limited join_leave_list length 2, got %d", len(events))
	}
}
