package routes

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type legendHistoryTestDB struct {
	query string
	args  []any
	rows  pgx.Rows
}

func (db *legendHistoryTestDB) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.query = query
	db.args = args
	return db.rows, nil
}

type legendHistoryTestRow struct {
	season    string
	playerTag string
	rank      int
	trophies  int
	data      []byte
}

type legendHistoryTestRows struct {
	pgx.Rows
	items  []legendHistoryTestRow
	cursor int
}

func (rows *legendHistoryTestRows) Close() {}

func (rows *legendHistoryTestRows) Err() error { return nil }

func (rows *legendHistoryTestRows) Next() bool {
	if rows.cursor >= len(rows.items) {
		return false
	}
	rows.cursor++
	return true
}

func (rows *legendHistoryTestRows) Scan(dest ...any) error {
	row := rows.items[rows.cursor-1]
	*dest[0].(*string) = row.season
	*dest[1].(*string) = row.playerTag
	*dest[2].(*int) = row.rank
	*dest[3].(*int) = row.trophies
	*dest[4].(*[]byte) = append((*dest[4].(*[]byte))[:0], row.data...)
	return nil
}

func TestLegendHistorySeasonAndLimitValidation(t *testing.T) {
	if season, ok := parseLegendHistorySeason("2026-07"); !ok || season != "2026-07" {
		t.Fatalf("valid season rejected: %q %v", season, ok)
	}
	for _, invalid := range []string{"", "2026-7", "26-07", "2026-13", "2026-07-01"} {
		if _, ok := parseLegendHistorySeason(invalid); ok {
			t.Fatalf("invalid season %q accepted", invalid)
		}
	}

	if limit, ok := legendHistoryLimit(""); !ok || limit != 25 {
		t.Fatalf("default limit = %d, %v", limit, ok)
	}
	if limit, ok := legendHistoryLimit("200"); !ok || limit != 200 {
		t.Fatalf("maximum limit = %d, %v", limit, ok)
	}
	for _, invalid := range []string{"0", "201", "-1", "abc"} {
		if _, ok := legendHistoryLimit(invalid); ok {
			t.Fatalf("invalid limit %q accepted", invalid)
		}
	}
}

func TestQueryLegendSeasonHistoryUsesSeasonRankIndexAndAuthoritativeColumns(t *testing.T) {
	db := &legendHistoryTestDB{
		rows: &legendHistoryTestRows{
			items: []legendHistoryTestRow{
				{
					season:    "2026-06",
					playerTag: "#P0Y",
					rank:      3,
					trophies:  6123,
					data:      []byte(`{"tag":"#WRONG","name":"Magic Jr.","rank":99,"trophies":1,"unknownOfficialField":{"kept":true}}`),
				},
			},
		},
	}
	items, err := queryLegendHistory(context.Background(), db, legendSeasonHistoryQuery, "2026-06", 25)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{
		"FROM legend_history",
		"season = $1",
		"ORDER BY rank",
		"LIMIT $2",
	} {
		if !strings.Contains(db.query, required) {
			t.Fatalf("season query missing %q: %s", required, db.query)
		}
	}
	if len(db.args) != 2 || db.args[0] != "2026-06" || db.args[1] != 25 {
		t.Fatalf("unexpected season args: %#v", db.args)
	}
	if len(items) != 1 ||
		items[0].Season != "2026-06" ||
		items[0].Tag != "#P0Y" ||
		items[0].Rank != 3 ||
		items[0].Trophies != 6123 {
		t.Fatalf("typed columns did not override stored duplicates: %#v", items)
	}
	encoded, err := json.Marshal(items[0])
	if err != nil {
		t.Fatal(err)
	}
	var output map[string]any
	if err := json.Unmarshal(encoded, &output); err != nil {
		t.Fatal(err)
	}
	if _, ok := output["unknownOfficialField"].(map[string]any); !ok {
		t.Fatalf("full official item was not preserved: %s", encoded)
	}
}

func TestQueryPlayerLegendHistoryUsesPlayerSeasonIndex(t *testing.T) {
	db := &legendHistoryTestDB{rows: &legendHistoryTestRows{}}
	items, err := queryLegendHistory(context.Background(), db, legendPlayerHistoryQuery, "#P0Y")
	if err != nil {
		t.Fatal(err)
	}
	if items == nil || len(items) != 0 {
		t.Fatalf("empty player history = %#v, want non-nil empty items", items)
	}
	for _, required := range []string{
		"FROM legend_history",
		"player_tag = $1",
		"ORDER BY season DESC",
	} {
		if !strings.Contains(db.query, required) {
			t.Fatalf("player query missing %q: %s", required, db.query)
		}
	}
	if len(db.args) != 1 || db.args[0] != "#P0Y" {
		t.Fatalf("unexpected player args: %#v", db.args)
	}
}

func TestLegendHistoryRoutesReturnEmptyItemsAndValidateInputs(t *testing.T) {
	emptyDB := &legendHistoryTestDB{rows: &legendHistoryTestRows{}}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/legends/history/:season", legendSeasonHistoryHandler(emptyDB))
	app.Get("/v2/player/:player_tag/legend-history", playerLegendHistoryHandler(emptyDB))

	for _, path := range []string{
		"/v2/legends/history/2026-07",
		"/v2/legends/history/2026-07?limit=200",
		"/v2/player/P0Y/legend-history",
	} {
		response, err := app.Test(httptest.NewRequest("GET", path, nil))
		if err != nil {
			t.Fatalf("%s failed: %v", path, err)
		}
		if response.StatusCode != fiber.StatusOK {
			t.Fatalf("%s status = %d, want 200", path, response.StatusCode)
		}
		var body struct {
			Items []modelsv2.LegendHistoryItem `json:"items"`
		}
		if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
			t.Fatalf("decode %s: %v", path, err)
		}
		if body.Items == nil || len(body.Items) != 0 {
			t.Fatalf("%s items = %#v, want []", path, body.Items)
		}
	}

	for _, path := range []string{
		"/v2/legends/history/2026-7",
		"/v2/legends/history/2026-07?limit=0",
		"/v2/legends/history/2026-07?limit=201",
		"/v2/player/%23/legend-history",
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

func TestLegendHistorySourceHasNoSnapshotTableOrUnregisteredHandlers(t *testing.T) {
	for _, path := range []string{"player.go", "legacy_player.go", "legacy_static.go", "mobile.go", "legend_history.go"} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		source := string(raw)
		if strings.Contains(source, "legend_history_snapshots") {
			t.Fatalf("%s retains legend_history_snapshots", path)
		}
	}
	for path, staleHandlers := range map[string][]string{
		"player.go":        {"func playersLegendRankings("},
		"legacy_player.go": {"func playerLegendRankings("},
		"legacy_static.go": {"func legendEOSWinners(", "func scanLegendHistory("},
	} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		for _, stale := range staleHandlers {
			if strings.Contains(string(raw), stale) {
				t.Fatalf("%s retains unregistered handler %q", path, stale)
			}
		}
	}
}
