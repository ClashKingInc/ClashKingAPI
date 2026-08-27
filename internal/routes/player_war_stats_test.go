package routes

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type playerWarStatsTestDB struct {
	query string
	args  []any
	rows  pgx.Rows
}

func (db *playerWarStatsTestDB) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.query, db.args = query, args
	return db.rows, nil
}

type playerWarStatsTestRows struct {
	pgx.Rows
	ids    []string
	cursor int
}

func (rows *playerWarStatsTestRows) Close()     {}
func (rows *playerWarStatsTestRows) Err() error { return nil }
func (rows *playerWarStatsTestRows) Next() bool {
	if rows.cursor >= len(rows.ids) {
		return false
	}
	rows.cursor++
	return true
}
func (rows *playerWarStatsTestRows) Scan(dest ...any) error {
	*dest[0].(*string) = rows.ids[rows.cursor-1]
	return nil
}

func TestQueryPlayerWarStatsIDsUsesRecentArraySliceWithoutFilters(t *testing.T) {
	db := &playerWarStatsTestDB{rows: &playerWarStatsTestRows{ids: []string{"102", "101"}}}
	ids, err := queryPlayerWarStatsIDs(context.Background(), db, "#PLAYER", "", time.Time{}, time.Time{}, 15, false)
	if err != nil {
		t.Fatalf("query recent war IDs: %v", err)
	}
	if db.query != playerWarStatsRecentIDsQuery || len(db.args) != 2 || db.args[0] != "#PLAYER" || db.args[1] != 15 {
		t.Fatalf("unexpected recent query: %q %#v", db.query, db.args)
	}
	if len(ids) != 2 || ids[0] != "102" || ids[1] != "101" {
		t.Fatalf("unexpected recent IDs: %#v", ids)
	}
}

func TestQueryPlayerWarStatsIDsUsesWarTableForFilters(t *testing.T) {
	after := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	before := after.Add(31 * 24 * time.Hour)
	db := &playerWarStatsTestDB{rows: &playerWarStatsTestRows{}}
	_, err := queryPlayerWarStatsIDs(context.Background(), db, "#PLAYER", "cwl", after, before, 25, true)
	if err != nil {
		t.Fatalf("query filtered war IDs: %v", err)
	}
	if db.query != playerWarStatsFilteredIDsQuery || len(db.args) != 5 || db.args[0] != "#PLAYER" || db.args[1] != after || db.args[2] != before || db.args[3] != "cwl" || db.args[4] != 25 {
		t.Fatalf("unexpected filtered query: %q %#v", db.query, db.args)
	}
}

func TestBuildPlayerWarStatsResponseFlattensWarAndRetainsEmptyArrays(t *testing.T) {
	preparation := time.Date(2026, 7, 1, 1, 2, 3, 0, time.UTC)
	start := preparation.Add(23 * time.Hour)
	end := start.Add(24 * time.Hour)
	war := wararchive.War{
		Type: "random", TeamSize: 2, AttacksPerMember: 2,
		PreparationStartTime: preparation, StartTime: &start, EndTime: end,
		Clan: wararchive.Clan{
			Tag: "#OURS", Name: "Ours", BadgeToken: "ours", ClanLevel: 20, Attacks: 2, Stars: 5, DestructionPercentage: 90.5,
			Members: []wararchive.Member{
				{Tag: "#PLAYER", Name: "Player", TownhallLevel: 16, MapPosition: 1},
				{Tag: "#ALLY", Name: "Ally", TownhallLevel: 16, MapPosition: 2, Attacks: []wararchive.Attack{{DefenderTag: "#ENEMY", Stars: 2, DestructionPercentage: 80, Duration: 150, Order: 8}}},
			},
		},
		Opponent: wararchive.Clan{
			Tag: "#THEM", Name: "Them", BadgeToken: "them", ClanLevel: 18, Attacks: 2, Stars: 4, DestructionPercentage: 85,
			Members: []wararchive.Member{
				{Tag: "#ENEMY", Name: "Enemy", TownhallLevel: 16, MapPosition: 1, Attacks: []wararchive.Attack{{DefenderTag: "#PLAYER", Stars: 3, DestructionPercentage: 100, Duration: 137, Order: 4}}},
				{Tag: "#ENEMY2", Name: "Enemy 2", TownhallLevel: 15, MapPosition: 2},
			},
		},
	}

	response := buildPlayerWarStatsResponse("#PLAYER", []string{"42"}, map[string]wararchive.War{"42": war})
	if len(response.Items) != 1 {
		t.Fatalf("unexpected response: %#v", response)
	}
	item := response.Items[0]
	if item.Clan.Tag != "#OURS" || item.Opponent.Tag != "#THEM" || item.Player.Tag != "#PLAYER" || item.Type != "random" {
		t.Fatalf("war was not oriented to the player: %#v", item)
	}
	if item.Attacks == nil || len(item.Attacks) != 0 {
		t.Fatalf("missed attacks must be represented by an empty array: %#v", item.Attacks)
	}
	if len(item.Defenses) != 1 || item.Defenses[0].Player.Tag != "#ENEMY" || !item.Defenses[0].Fresh {
		t.Fatalf("unexpected defenses: %#v", item.Defenses)
	}
	payload, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	warJSON := decoded["items"].([]any)[0].(map[string]any)
	if _, exists := warJSON["war"]; exists {
		t.Fatalf("response unexpectedly nests war: %s", payload)
	}
	if _, exists := warJSON["missed"]; exists {
		t.Fatalf("response unexpectedly exposes missed: %s", payload)
	}
}

func TestPlayerWarStatsRejectsInvalidFiltersBeforeDatabaseAccess(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/player/:player_tag/war/stats", playerWarStats(apptypes.Deps{}))
	for _, path := range []string{
		"/v2/player/%23PLAYER/war/stats?type=league",
		"/v2/player/%23PLAYER/war/stats?limit=0",
		"/v2/player/%23PLAYER/war/stats?time%5Bafter%5D=bad",
	} {
		response, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil {
			t.Fatalf("request %s: %v", path, err)
		}
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("request %s status = %d, want 400", path, response.StatusCode)
		}
	}
}

func TestPlayerWarAttacksRejectsInvalidFiltersBeforeDatabaseAccess(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/player/:player_tag/war/attacks", playerWarAttacks(apptypes.Deps{}))
	for _, path := range []string{
		"/v2/player/%23PLAYER/war/attacks?type=league",
		"/v2/player/%23PLAYER/war/attacks?limit=0",
		"/v2/player/%23PLAYER/war/attacks?time%5Bafter%5D=bad",
	} {
		response, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil {
			t.Fatalf("request %s: %v", path, err)
		}
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("request %s status = %d, want 400", path, response.StatusCode)
		}
	}
}

var _ modelsv2.PlayerWarStatsResponse
