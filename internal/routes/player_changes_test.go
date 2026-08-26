package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type playerChangesTestDB struct {
	query string
	args  []any
	rows  pgx.Rows
}

func (db *playerChangesTestDB) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.query = query
	db.args = args
	return db.rows, nil
}

type playerChangesTestRow struct {
	eventTime     time.Time
	playerTag     string
	townhallLevel *int16
	typeID        int16
	itemID        *int16
	previous      string
	current       string
}

type playerChangesTestRows struct {
	pgx.Rows
	items  []playerChangesTestRow
	cursor int
}

func (rows *playerChangesTestRows) Close()     {}
func (rows *playerChangesTestRows) Err() error { return nil }
func (rows *playerChangesTestRows) Next() bool {
	if rows.cursor >= len(rows.items) {
		return false
	}
	rows.cursor++
	return true
}

func (rows *playerChangesTestRows) Scan(dest ...any) error {
	row := rows.items[rows.cursor-1]
	*dest[0].(*time.Time) = row.eventTime
	*dest[1].(*string) = row.playerTag
	*dest[2].(**int16) = row.townhallLevel
	*dest[3].(*int16) = row.typeID
	*dest[4].(**int16) = row.itemID
	*dest[5].(*string) = row.previous
	*dest[6].(*string) = row.current
	return nil
}

func TestPlayerChangesQueriesUseNormalizedSchema(t *testing.T) {
	for _, query := range []string{playerChangesQuery, playerChangesByTypeQuery} {
		for _, required := range []string{
			"event_time, player_tag, townhall_level, change_type, item_id, previous_value, current_value",
			"FROM player_change_history",
			"WHERE player_tag = $1",
			"ORDER BY event_time DESC",
		} {
			if !strings.Contains(query, required) {
				t.Fatalf("player changes query missing %q", required)
			}
		}
		for _, obsolete := range []string{"clan_tag", "jsonb"} {
			if strings.Contains(query, obsolete) {
				t.Fatalf("player changes query contains obsolete field %q", obsolete)
			}
		}
	}
	if !strings.Contains(playerChangesByTypeQuery, "change_type = ANY($2::smallint[])") {
		t.Fatal("filtered player changes query does not use numeric change types")
	}
}

func TestParsePlayerChangeTypeFilter(t *testing.T) {
	tests := map[string][]int16{
		"":                           nil,
		"1":                          {1},
		"troop_level":                {1},
		"troops":                     {1, 2},
		"heroEquipment":              {6},
		"bestVersusTrophies":         {9},
		"best_builder_base_trophies": {9},
		"warPreference":              {11},
	}
	for input, expected := range tests {
		actual, err := parsePlayerChangeTypeFilter(input)
		if err != nil {
			t.Fatalf("parse %q: %v", input, err)
		}
		if len(actual) != len(expected) {
			t.Fatalf("parse %q = %v, want %v", input, actual, expected)
		}
		for index := range expected {
			if actual[index] != expected[index] {
				t.Fatalf("parse %q = %v, want %v", input, actual, expected)
			}
		}
	}
	for _, input := range []string{"0", "13", "unknown"} {
		if _, err := parsePlayerChangeTypeFilter(input); err == nil {
			t.Fatalf("parse %q unexpectedly succeeded", input)
		}
	}
}

func TestPlayerChangesReturnsNormalizedValuesAndUsesTypeFilter(t *testing.T) {
	townhall := int16(17)
	itemID := int16(19)
	eventTime := time.Date(2026, time.August, 26, 12, 0, 0, 0, time.UTC)
	db := &playerChangesTestDB{rows: &playerChangesTestRows{items: []playerChangesTestRow{
		{eventTime: eventTime, playerTag: "#8GLYGGJQ", townhallLevel: &townhall, typeID: 1, itemID: &itemID, previous: "11", current: "12"},
		{eventTime: eventTime.Add(-time.Minute), playerTag: "#8GLYGGJQ", typeID: 12, previous: "Old Name", current: "New Name"},
	}}}

	response, err := queryPlayerChanges(context.Background(), db, "#8GLYGGJQ", []int16{1, 2}, 5)
	if err != nil {
		t.Fatalf("query player changes: %v", err)
	}
	if db.query != playerChangesByTypeQuery || len(db.args) != 3 {
		t.Fatalf("unexpected filtered query: %q %#v", db.query, db.args)
	}
	if response.Count != 2 || len(response.Items) != 2 {
		t.Fatalf("unexpected response count: %#v", response)
	}
	if response.Items[0].Type != "troop_level" || response.Items[0].TypeID != 1 || response.Items[0].Previous != "11" || response.Items[0].Current != "12" {
		t.Fatalf("unexpected troop change: %#v", response.Items[0])
	}
	if response.Items[1].Type != "name" || response.Items[1].TownhallLevel != nil || response.Items[1].ItemID != nil {
		t.Fatalf("unexpected nullable name change: %#v", response.Items[1])
	}
}

func TestPlayerChangesRejectsInvalidTypeBeforeDatabaseAccess(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/player/:player_tag/changes", playerChanges(apptypes.Deps{}))
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/v2/player/%23ABC/changes?type=unknown", nil))
	if err != nil {
		t.Fatalf("player changes request: %v", err)
	}
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", response.StatusCode)
	}
	var body modelsv2.ErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
}
