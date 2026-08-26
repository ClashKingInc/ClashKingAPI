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
	*dest[1].(**int16) = row.townhallLevel
	*dest[2].(*int16) = row.typeID
	*dest[3].(**int16) = row.itemID
	*dest[4].(*string) = row.previous
	*dest[5].(*string) = row.current
	return nil
}

func TestPlayerChangesQueriesUseNormalizedSchema(t *testing.T) {
	for _, query := range []string{playerChangesQuery, playerChangesByTypeQuery} {
		for _, required := range []string{
			"event_time, townhall_level, change_type, item_id, previous_value, current_value",
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
	troopID := int16(19)
	superTroopID := int16(33)
	eventTime := time.Date(2026, time.August, 26, 12, 0, 0, 0, time.UTC)
	db := &playerChangesTestDB{rows: &playerChangesTestRows{items: []playerChangesTestRow{
		{eventTime: eventTime, townhallLevel: &townhall, typeID: 1, itemID: &troopID, previous: "11", current: "12"},
		{eventTime: eventTime.Add(-time.Second), townhallLevel: &townhall, typeID: 2, itemID: &superTroopID, previous: "0", current: "1"},
		{eventTime: eventTime.Add(-2 * time.Second), townhallLevel: &townhall, typeID: 11, previous: "0", current: "1"},
		{eventTime: eventTime.Add(-time.Minute), typeID: 12, previous: "Old Name", current: "New Name"},
	}}}
	catalog := map[playerChangeItemKey]modelsv2.PlayerChangeItem{
		{changeType: 1, itemID: troopID}:      {Name: "P.E.K.K.A", ID: 19},
		{changeType: 2, itemID: superTroopID}: {Name: "Super Wall Breaker", ID: 33},
	}

	response, err := queryPlayerChanges(context.Background(), db, "#8GLYGGJQ", []int16{1, 2}, 5, catalog)
	if err != nil {
		t.Fatalf("query player changes: %v", err)
	}
	if db.query != playerChangesByTypeQuery || len(db.args) != 3 {
		t.Fatalf("unexpected filtered query: %q %#v", db.query, db.args)
	}
	if response.Count != 4 || len(response.Items) != 4 {
		t.Fatalf("unexpected response count: %#v", response)
	}
	if response.Items[0].Type != "troop_level" || response.Items[0].Item == nil || response.Items[0].Item.Name != "P.E.K.K.A" || response.Items[0].Previous != int64(11) || response.Items[0].Current != int64(12) {
		t.Fatalf("unexpected troop change: %#v", response.Items[0])
	}
	if response.Items[1].Type != "super_troop_boost" || response.Items[1].Item == nil || response.Items[1].Previous != nil || response.Items[1].Current != nil {
		t.Fatalf("unexpected super troop boost: %#v", response.Items[1])
	}
	if response.Items[2].Previous != "out" || response.Items[2].Current != "in" {
		t.Fatalf("unexpected war preference: %#v", response.Items[2])
	}
	if response.Items[3].Type != "name" || response.Items[3].TownhallLevel != nil || response.Items[3].Item != nil || response.Items[3].Previous != "Old Name" {
		t.Fatalf("unexpected nullable name change: %#v", response.Items[3])
	}

	payload, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	encoded := string(payload)
	for _, absent := range []string{"player_tag", "type_id", "item_id"} {
		if strings.Contains(encoded, absent) {
			t.Fatalf("response contains obsolete field %q: %s", absent, encoded)
		}
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	items := decoded["items"].([]any)
	superTroop := items[1].(map[string]any)
	if _, ok := superTroop["previous"]; ok {
		t.Fatalf("super troop response contains previous: %#v", superTroop)
	}
	if _, ok := superTroop["current"]; ok {
		t.Fatalf("super troop response contains current: %#v", superTroop)
	}
}

func TestPlayerChangeItemCatalogUsesCompactIDsAndSuperTroopType(t *testing.T) {
	sections := map[string][]map[string]any{
		"troops": {
			{"_id": float64(4_000_019), "name": "P.E.K.K.A"},
			{"_id": float64(4_000_033), "name": "Super Wall Breaker", "super_troop": map[string]any{"enabled": true}},
		},
		"pets": {{"_id": float64(73_000_000), "name": "L.A.S.S.I"}},
	}
	catalog := playerChangeItemCatalogFromSections(func(name string) []map[string]any { return sections[name] })

	for key, expected := range map[playerChangeItemKey]modelsv2.PlayerChangeItem{
		{changeType: 1, itemID: 19}: {Name: "P.E.K.K.A", ID: 19},
		{changeType: 2, itemID: 33}: {Name: "Super Wall Breaker", ID: 33},
		{changeType: 5, itemID: 0}:  {Name: "L.A.S.S.I", ID: 0},
	} {
		if actual := catalog[key]; actual != expected {
			t.Fatalf("catalog[%#v] = %#v, want %#v", key, actual, expected)
		}
	}
}

func TestPlayerChangeValuesCastsEveryValueKind(t *testing.T) {
	for _, typeID := range []int16{1, 3, 4, 5, 6, 7, 8, 9, 10} {
		previous, current, err := playerChangeValues(typeID, "41", "42")
		if err != nil || previous != int64(41) || current != int64(42) {
			t.Fatalf("numeric type %d = (%#v, %#v, %v)", typeID, previous, current, err)
		}
	}
	previous, current, err := playerChangeValues(11, "0", "1")
	if err != nil || previous != "out" || current != "in" {
		t.Fatalf("war preference = (%#v, %#v, %v)", previous, current, err)
	}
	previous, current, err = playerChangeValues(12, "Old Name", "New Name")
	if err != nil || previous != "Old Name" || current != "New Name" {
		t.Fatalf("name = (%#v, %#v, %v)", previous, current, err)
	}
	if _, _, err := playerChangeValues(8, "not-a-number", "42"); err == nil {
		t.Fatal("malformed numeric value unexpectedly succeeded")
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
