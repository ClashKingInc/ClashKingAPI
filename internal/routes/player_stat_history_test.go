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

type playerStatHistoryTestDB struct {
	query string
	args  []any
	rows  pgx.Rows
}

func (db *playerStatHistoryTestDB) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.query = query
	db.args = args
	return db.rows, nil
}

type playerStatHistoryTestRow struct {
	eventTime     time.Time
	clanTag       *string
	statType      modelsv2.PlayerStatType
	previousValue int64
	currentValue  int64
	delta         int64
}

type playerStatHistoryTestRows struct {
	pgx.Rows
	items  []playerStatHistoryTestRow
	cursor int
}

func (rows *playerStatHistoryTestRows) Close() {}

func (rows *playerStatHistoryTestRows) Err() error { return nil }

func (rows *playerStatHistoryTestRows) Next() bool {
	if rows.cursor >= len(rows.items) {
		return false
	}
	rows.cursor++
	return true
}

func (rows *playerStatHistoryTestRows) Scan(dest ...any) error {
	row := rows.items[rows.cursor-1]
	*dest[0].(*time.Time) = row.eventTime
	*dest[1].(**string) = row.clanTag
	*dest[2].(*modelsv2.PlayerStatType) = row.statType
	*dest[3].(*int64) = row.previousValue
	*dest[4].(*int64) = row.currentValue
	*dest[5].(*int64) = row.delta
	return nil
}

func TestPlayerStatHistoryQueryUsesTypedPositiveDeltaSchema(t *testing.T) {
	for _, required := range []string{
		"SELECT event_time, clan_tag, stat_type, previous_value, current_value, delta",
		"FROM player_stat_changes",
		"WHERE player_tag = $1",
		"event_time >= $2",
		"event_time < $3",
		"ORDER BY event_time DESC",
		"LIMIT $4",
	} {
		if !strings.Contains(playerStatHistoryQuery, required) {
			t.Fatalf("player stat history query missing %q", required)
		}
	}
	for _, required := range []string{
		"FROM player_stat_changes",
		"WHERE player_tag = $1",
		"stat_type = $2",
		"event_time >= $3",
		"event_time < $4",
		"ORDER BY event_time DESC",
		"LIMIT $5",
	} {
		if !strings.Contains(playerStatHistoryByTypeQuery, required) {
			t.Fatalf("filtered player stat history query missing %q", required)
		}
	}
	for _, obsolete := range []string{
		"player_season_stats",
		"data",
		"season",
		"trophies",
		"loot",
		"activity",
		"attack_wins",
		"townhall",
		"last_online",
	} {
		if strings.Contains(playerStatHistoryQuery, obsolete) ||
			strings.Contains(playerStatHistoryByTypeQuery, obsolete) {
			t.Fatalf("player stat history query contains unsupported source %q", obsolete)
		}
	}
}

func TestPlayerStatHistoryRejectsInvalidQueryBeforeDatabaseAccess(t *testing.T) {
	handler := playerStatHistoryHandler(nil)
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/player/:player_tag/stat-history", handler)

	for _, path := range []string{
		"/v2/player/%23ABC/stat-history?timestamp_start=bad",
		"/v2/player/%23ABC/stat-history?timestamp_start=20&timestamp_end=10",
		"/v2/player/%23ABC/stat-history?stat_type=gold",
		"/v2/player/%23ABC/stat-history?limit=0",
	} {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		response, err := app.Test(request)
		if err != nil {
			t.Fatalf("request %s: %v", path, err)
		}
		if response.StatusCode != http.StatusBadRequest {
			t.Fatalf("request %s status = %d, want 400", path, response.StatusCode)
		}
	}
}

func TestPlayerStatHistoryAcceptsEveryTypedFilter(t *testing.T) {
	handler := playerStatHistoryHandler(nil)
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/player/:player_tag/stat-history", handler)

	for _, statType := range []string{"donated", "received", "clan_games", "capital_gold_donated"} {
		request := httptest.NewRequest(
			http.MethodGet,
			"/v2/player/%23ABC/stat-history?stat_type="+statType,
			nil,
		)
		response, err := app.Test(request)
		if err != nil {
			t.Fatalf("request stat type %s: %v", statType, err)
		}
		if response.StatusCode != http.StatusServiceUnavailable {
			t.Fatalf("stat type %s status = %d, want 503 after validation", statType, response.StatusCode)
		}
	}
}

func TestPlayerStatHistoryReturnsTypedChangesAndUsesIndexedFilterQuery(t *testing.T) {
	clanTag := "#CLAN"
	eventTime := time.Date(2026, time.July, 28, 15, 0, 0, 0, time.UTC)
	db := &playerStatHistoryTestDB{
		rows: &playerStatHistoryTestRows{
			items: []playerStatHistoryTestRow{{
				eventTime:     eventTime,
				clanTag:       &clanTag,
				statType:      modelsv2.PlayerStatTypeDonated,
				previousValue: 100,
				currentValue:  250,
				delta:         150,
			}},
		},
	}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/player/:player_tag/stat-history", playerStatHistoryHandler(db))

	response, err := app.Test(httptest.NewRequest(
		http.MethodGet,
		"/v2/player/P0Y/stat-history?timestamp_start=100&timestamp_end=200&stat_type=donated&limit=25",
		nil,
	))
	if err != nil {
		t.Fatalf("player stat history request: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("player stat history status = %d, want 200", response.StatusCode)
	}
	var body modelsv2.PlayerStatHistoryResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode player stat history response: %v", err)
	}
	if len(body.Items) != 1 ||
		body.Items[0].EventTime != eventTime ||
		body.Items[0].ClanTag == nil ||
		*body.Items[0].ClanTag != clanTag ||
		body.Items[0].StatType != modelsv2.PlayerStatTypeDonated ||
		body.Items[0].PreviousValue != 100 ||
		body.Items[0].CurrentValue != 250 ||
		body.Items[0].Delta != 150 {
		t.Fatalf("unexpected player stat history response: %#v", body)
	}
	if db.query != playerStatHistoryByTypeQuery {
		t.Fatalf("filtered request used unexpected query: %s", db.query)
	}
	if len(db.args) != 5 ||
		db.args[0] != "#P0Y" ||
		db.args[1] != "donated" ||
		!db.args[2].(time.Time).Equal(time.Unix(100, 0).UTC()) ||
		!db.args[3].(time.Time).Equal(time.Unix(200, 0).UTC()) ||
		db.args[4] != 25 {
		t.Fatalf("unexpected player stat history query args: %#v", db.args)
	}
}
