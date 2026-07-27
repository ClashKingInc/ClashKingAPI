package routes

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type leaderboardHistoryTestDB struct {
	query string
	args  []any
	rows  pgx.Rows
}

func (db *leaderboardHistoryTestDB) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.query = query
	db.args = args
	return db.rows, nil
}

type leaderboardHistoryTestRow struct {
	values []any
}

type leaderboardHistoryTestRows struct {
	pgx.Rows
	items  []leaderboardHistoryTestRow
	cursor int
}

func (rows *leaderboardHistoryTestRows) Close() {}

func (rows *leaderboardHistoryTestRows) Err() error { return nil }

func (rows *leaderboardHistoryTestRows) Next() bool {
	if rows.cursor >= len(rows.items) {
		return false
	}
	rows.cursor++
	return true
}

func (rows *leaderboardHistoryTestRows) Scan(dest ...any) error {
	for index, value := range rows.items[rows.cursor-1].values {
		switch target := dest[index].(type) {
		case *[]byte:
			*target = append((*target)[:0], value.([]byte)...)
		case *string:
			*target = value.(string)
		case *int:
			*target = value.(int)
		case *time.Time:
			*target = value.(time.Time)
		default:
			panic("unsupported leaderboard history test scan target")
		}
	}
	return nil
}

func TestLeaderboardHistoryTypeValidationMatchesCanonicalWriterKinds(t *testing.T) {
	playerKinds := []modelsv2.LeaderboardHistoryType{
		modelsv2.LeaderboardHistoryTypePlayerHomeTrophies,
		modelsv2.LeaderboardHistoryTypePlayerBuilderBaseTrophies,
	}
	clanKinds := []modelsv2.LeaderboardHistoryType{
		modelsv2.LeaderboardHistoryTypeClanHomePoints,
		modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints,
		modelsv2.LeaderboardHistoryTypeClanCapitalPoints,
	}
	for _, kind := range append(slices.Clone(playerKinds), clanKinds...) {
		if parsed, ok := parseLeaderboardHistoryType(string(kind)); !ok || parsed != kind {
			t.Fatalf("canonical kind %q was rejected", kind)
		}
	}
	for _, kind := range playerKinds {
		if _, ok := playerLeaderboardHistoryType(string(kind)); !ok {
			t.Fatalf("player kind %q was rejected for player history", kind)
		}
		if _, ok := clanLeaderboardHistoryType(string(kind)); ok {
			t.Fatalf("player kind %q was accepted for clan history", kind)
		}
	}
	for _, kind := range clanKinds {
		if _, ok := clanLeaderboardHistoryType(string(kind)); !ok {
			t.Fatalf("clan kind %q was rejected for clan history", kind)
		}
		if _, ok := playerLeaderboardHistoryType(string(kind)); ok {
			t.Fatalf("clan kind %q was accepted for player history", kind)
		}
	}
	for _, stale := range []string{"league", "townhall", "trophy_buckets", "player_trophies", "clan_trophies"} {
		if _, ok := parseLeaderboardHistoryType(stale); ok {
			t.Fatalf("stale kind %q was accepted", stale)
		}
	}
}

func TestQueryLeaderboardSnapshotHistoryUsesLocationRankIndexPattern(t *testing.T) {
	date := time.Date(2026, time.July, 26, 0, 0, 0, 0, time.UTC)
	db := &leaderboardHistoryTestDB{
		rows: &leaderboardHistoryTestRows{items: []leaderboardHistoryTestRow{
			{values: []any{[]byte(`{"tag":"#P0Y","name":"Magic Jr.","rank":1,"trophies":6123,"clan":{"tag":"#2PP"}}`)}},
		}},
	}
	items, err := queryLeaderboardSnapshotHistory(
		context.Background(),
		db,
		modelsv2.LeaderboardHistoryTypePlayerHomeTrophies,
		"global",
		date,
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{
		"FROM leaderboard_history",
		"kind = $1",
		"location_id = $2",
		"date = $3",
		"ORDER BY rank",
	} {
		if !strings.Contains(db.query, required) {
			t.Fatalf("snapshot query missing %q: %s", required, db.query)
		}
	}
	if len(db.args) != 3 || db.args[0] != modelsv2.LeaderboardHistoryTypePlayerHomeTrophies || db.args[1] != "global" || db.args[2] != date {
		t.Fatalf("unexpected snapshot args: %#v", db.args)
	}
	if len(items) != 1 || items[0]["tag"] != "#P0Y" || items[0]["trophies"] != float64(6123) {
		t.Fatalf("full stored item was not preserved: %#v", items)
	}
}

func TestQueryLeaderboardEntityHistoryUsesTagDateIndexPattern(t *testing.T) {
	date := time.Date(2026, time.July, 25, 0, 0, 0, 0, time.UTC)
	db := &leaderboardHistoryTestDB{
		rows: &leaderboardHistoryTestRows{items: []leaderboardHistoryTestRow{
			{values: []any{
				date,
				"32000006",
				"Example Clan",
				7,
				[]byte(`{"tag":"#2PP","name":"Example Clan","rank":7,"clanPoints":54321}`),
			}},
		}},
	}
	items, err := queryLeaderboardEntityHistory(
		context.Background(),
		db,
		modelsv2.LeaderboardHistoryTypeClanHomePoints,
		"#2PP",
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{
		"FROM leaderboard_history",
		"kind = $1",
		"tag = $2",
		"ORDER BY date DESC",
	} {
		if !strings.Contains(db.query, required) {
			t.Fatalf("entity query missing %q: %s", required, db.query)
		}
	}
	if len(db.args) != 2 || db.args[0] != modelsv2.LeaderboardHistoryTypeClanHomePoints || db.args[1] != "#2PP" {
		t.Fatalf("unexpected entity args: %#v", db.args)
	}
	if len(items) != 1 ||
		items[0].Date != "2026-07-25" ||
		items[0].LocationID != "32000006" ||
		items[0].Rank != 7 ||
		items[0].Details["clanPoints"] != float64(54321) {
		t.Fatalf("unexpected entity history item: %#v", items)
	}
}

func TestLeaderboardHistoryRoutesReturnEmptyItemsAndRejectInvalidScopes(t *testing.T) {
	emptyDB := &leaderboardHistoryTestDB{rows: &leaderboardHistoryTestRows{}}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/leaderboard/history/:leaderboard_type/:location_id/:date", leaderboardSnapshotHistoryHandler(emptyDB))
	app.Get("/v2/player/:player_tag/leaderboard-history/:leaderboard_type", playerLeaderboardHistoryHandler(emptyDB))
	app.Get("/v2/clan/:clan_tag/leaderboard-history/:leaderboard_type", clanLeaderboardHistoryHandler(emptyDB))

	for _, path := range []string{
		"/v2/leaderboard/history/player_home_trophies/global/2026-07-26",
		"/v2/player/P0Y/leaderboard-history/player_builder_base_trophies",
		"/v2/clan/2PP/leaderboard-history/clan_capital_points",
	} {
		response, err := app.Test(httptest.NewRequest("GET", path, nil))
		if err != nil {
			t.Fatalf("%s failed: %v", path, err)
		}
		if response.StatusCode != fiber.StatusOK {
			t.Fatalf("%s status = %d, want 200", path, response.StatusCode)
		}
		var body map[string]any
		if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
			t.Fatalf("decode %s: %v", path, err)
		}
		items, ok := body["items"].([]any)
		if !ok || len(items) != 0 {
			t.Fatalf("%s items = %#v, want []", path, body["items"])
		}
		for _, stale := range []string{"location_id", "player_tag", "clan_tag"} {
			if _, exists := body[stale]; exists {
				t.Fatalf("%s exposed snake_case field %q: %#v", path, stale, body)
			}
		}
	}

	for _, path := range []string{
		"/v2/leaderboard/history/league/global/2026-07-26",
		"/v2/leaderboard/history/player_home_trophies/not-global/2026-07-26",
		"/v2/leaderboard/history/player_home_trophies/global/20260726",
		"/v2/player/P0Y/leaderboard-history/clan_home_points",
		"/v2/clan/2PP/leaderboard-history/player_home_trophies",
	} {
		response, err := app.Test(httptest.NewRequest("GET", path, nil))
		if err != nil {
			t.Fatalf("%s failed: %v", path, err)
		}
		if response.StatusCode != fiber.StatusBadRequest {
			t.Fatalf("%s status = %d, want 400", path, response.StatusCode)
		}
	}
}

func TestLeaderboardHistorySourceHasNoLegacySnapshotReaders(t *testing.T) {
	for _, path := range []string{"public_stats.go", "leaderboard_history.go"} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		source := string(raw)
		for _, stale := range []string{
			"leaderboard_snapshot_items",
			"kind = 'league'",
			"kind = 'townhall'",
			"kind = 'trophy_buckets'",
			"battlelogItemDimensionTop200",
		} {
			if strings.Contains(source, stale) {
				t.Fatalf("%s retains stale leaderboard history reader %q", path, stale)
			}
		}
	}
}
