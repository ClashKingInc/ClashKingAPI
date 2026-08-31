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
	"github.com/jackc/pgx/v5/pgtype"
)

const capitalGoldTotalTestValue int64 = 9_876_543_210

type capitalGoldTestQueryer struct {
	row       pgx.Row
	rows      pgx.Rows
	lastQuery string
	lastArgs  []any
}

func (db *capitalGoldTestQueryer) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.lastQuery, db.lastArgs = query, args
	return db.rows, nil
}

func (db *capitalGoldTestQueryer) QueryRow(_ context.Context, query string, args ...any) pgx.Row {
	db.lastQuery, db.lastArgs = query, args
	return db.row
}

type capitalGoldBasicClanRow struct{}

func (capitalGoldBasicClanRow) Scan(dest ...any) error {
	*dest[0].(*string) = "#CLAN"
	*dest[1].(*string) = "Capital Clan"
	*dest[2].(*string) = "Description"
	*dest[3].(*int) = 25
	*dest[4].(*pgtype.Int4) = pgtype.Int4{Int32: 32000006, Valid: true}
	*dest[5].(*int) = 48000015
	*dest[6].(*pgtype.Int4) = pgtype.Int4{Int32: 85000003, Valid: true}
	*dest[7].(*bool) = true
	*dest[8].(*int) = 500
	*dest[9].(*int) = 12
	*dest[10].(*int) = 55_000
	*dest[11].(*int64) = capitalGoldTotalTestValue
	*dest[12].(*int) = 50
	*dest[13].(*string) = "badge-token"
	*dest[14].(*int) = 10_000
	*dest[15].(*int) = 9_000
	*dest[16].(*[]byte) = []byte(`[]`)
	*dest[17].(*pgtype.Timestamptz) = pgtype.Timestamptz{Time: time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC), Valid: true}
	return nil
}

type capitalGoldTestRows struct {
	pgx.Rows
	row     pgx.Row
	visited bool
}

func (rows *capitalGoldTestRows) Close()     {}
func (rows *capitalGoldTestRows) Err() error { return nil }
func (rows *capitalGoldTestRows) Next() bool {
	if rows.visited {
		return false
	}
	rows.visited = true
	return true
}
func (rows *capitalGoldTestRows) Scan(dest ...any) error { return rows.row.Scan(dest...) }

type capitalGoldLeaderboardRow struct{}

func (capitalGoldLeaderboardRow) Scan(dest ...any) error {
	*dest[0].(*string) = "#CLAN"
	*dest[1].(*string) = "Capital Clan"
	*dest[2].(*pgtype.Int4) = pgtype.Int4{Int32: 32000006, Valid: true}
	*dest[3].(*string) = "badge-token"
	*dest[4].(*int64) = capitalGoldTotalTestValue
	*dest[5].(*int) = 12
	*dest[6].(*pgtype.Int8) = pgtype.Int8{Int64: 1, Valid: true}
	return nil
}

func capitalGoldTestDeps(queryer apptypes.SQLQueryer) apptypes.Deps {
	return apptypes.Deps{Store: &apptypes.Store{Queryer: queryer}}
}

func TestBasicClanResponsesExposeCapitalGoldTotal(t *testing.T) {
	for _, test := range []struct {
		name string
		path string
		set  func(*fiber.App, apptypes.Deps)
	}{
		{
			name: "legacy basic clan",
			path: "/basic",
			set: func(app *fiber.App, deps apptypes.Deps) {
				app.Get("/basic", func(c *fiber.Ctx) error {
					item, err := v1BasicClan(c, deps, "#CLAN")
					if err != nil {
						return err
					}
					return c.JSON(item)
				})
			},
		},
		{
			name: "cached clan",
			path: "/v2/clan/%23CLAN/cached",
			set: func(app *fiber.App, deps apptypes.Deps) {
				app.Get("/v2/clan/:clan_tag/cached", clanCached(deps))
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			db := &capitalGoldTestQueryer{row: capitalGoldBasicClanRow{}}
			app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
			test.set(app, capitalGoldTestDeps(db))
			response, err := app.Test(httptest.NewRequest(http.MethodGet, test.path, nil))
			if err != nil || response.StatusCode != http.StatusOK {
				t.Fatalf("request: status=%d err=%v", response.StatusCode, err)
			}
			var body map[string]any
			if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			key := "capital_gold_total"
			if test.name == "cached clan" {
				key = "capitalGoldTotal"
			}
			if got := int64(body[key].(float64)); got != capitalGoldTotalTestValue {
				t.Fatalf("%s = %d, want %d", key, got, capitalGoldTotalTestValue)
			}
			if !strings.Contains(db.lastQuery, "capital_gold_total") {
				t.Fatalf("basic clan query does not select capital_gold_total: %s", db.lastQuery)
			}
		})
	}
}

func TestClanSearchExposesCapitalGoldAliases(t *testing.T) {
	db := &capitalGoldTestQueryer{rows: &capitalGoldTestRows{row: capitalGoldBasicClanRow{}}}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/search", clanSearch(capitalGoldTestDeps(db)))
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/search?location_id=32000006&limit=1", nil))
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("request: status=%d err=%v", response.StatusCode, err)
	}
	var body struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 1 || int64(body.Items[0]["capitalGoldTotal"].(float64)) != capitalGoldTotalTestValue || int64(body.Items[0]["capital_gold_total"].(float64)) != capitalGoldTotalTestValue {
		t.Fatalf("capital gold aliases missing from clan search: %#v", body.Items)
	}
	if !strings.Contains(db.lastQuery, "capital_gold_total") {
		t.Fatalf("clan search query does not select capital_gold_total: %s", db.lastQuery)
	}
}

func TestClanCapitalGoldLeaderboardResponseAndQuery(t *testing.T) {
	db := &capitalGoldTestQueryer{rows: &capitalGoldTestRows{row: capitalGoldLeaderboardRow{}}}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/leaderboard/:location_id/clan/capital-gold", leaderboardClanCapitalGold(capitalGoldTestDeps(db)))
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/v2/leaderboard/32000006/clan/capital-gold?limit=1", nil))
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("request: status=%d err=%v", response.StatusCode, err)
	}
	var body modelsv2.PublicClanLeaderboardResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Kind != "capital_gold_total" || len(body.Items) != 1 || body.Items[0].CapitalGoldTotal != capitalGoldTotalTestValue || body.Items[0].Rank == nil || *body.Items[0].Rank != 1 {
		t.Fatalf("capital gold leaderboard response = %#v", body)
	}
	if !strings.Contains(db.lastQuery, "c.capital_gold_total") || !strings.Contains(db.lastQuery, "ORDER BY l.location_capital_gold_rank") {
		t.Fatalf("capital gold leaderboard query uses wrong columns: %s", db.lastQuery)
	}
}

func TestClanLeaderboardColumns(t *testing.T) {
	tests := map[string][2]string{
		"donations":          {"l.location_donated_rank", "c.troops_donated"},
		"war_wins":           {"l.location_war_wins_rank", "c.war_wins"},
		"capital_gold_total": {"l.location_capital_gold_rank", "c.capital_gold_total"},
	}
	for kind, want := range tests {
		orderColumn, valueColumn := clanLeaderboardColumns(kind)
		if orderColumn != want[0] || valueColumn != want[1] {
			t.Fatalf("%s columns = %q, %q, want %q, %q", kind, orderColumn, valueColumn, want[0], want[1])
		}
	}
}
