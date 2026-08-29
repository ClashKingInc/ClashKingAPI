package routes

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type historySummaryTestDB struct {
	queries []string
	args    [][]any
	rows    []pgx.Rows
}

func (db *historySummaryTestDB) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.queries = append(db.queries, query)
	db.args = append(db.args, args)
	rows := db.rows[0]
	db.rows = db.rows[1:]
	return rows, nil
}

type historySummaryTestRows struct {
	pgx.Rows
	items  [][]any
	cursor int
}

func (rows *historySummaryTestRows) Close()     {}
func (rows *historySummaryTestRows) Err() error { return nil }
func (rows *historySummaryTestRows) Next() bool {
	if rows.cursor >= len(rows.items) {
		return false
	}
	rows.cursor++
	return true
}

func (rows *historySummaryTestRows) Scan(dest ...any) error {
	for index, value := range rows.items[rows.cursor-1] {
		switch target := dest[index].(type) {
		case *string:
			*target = value.(string)
		case *int:
			*target = value.(int)
		case *time.Time:
			*target = value.(time.Time)
		case **time.Time:
			if value == nil {
				*target = nil
			} else {
				copy := value.(time.Time)
				*target = &copy
			}
		default:
			panic("unsupported history summary scan target")
		}
	}
	return nil
}

func TestClanLegendHistorySummaryReturnsSeasonsAndRepeatedTopPlayer(t *testing.T) {
	seasonTime := time.Date(2026, time.July, 6, 5, 0, 0, 0, time.UTC)
	db := &historySummaryTestDB{rows: []pgx.Rows{
		&historySummaryTestRows{items: [][]any{{"v2-2026-07-06T05:00:00Z", seasonTime, 18}}},
		&historySummaryTestRows{items: [][]any{
			{"v2-2026-07-06T05:00:00Z", "#PLAYER", "Magic", 300, 6500, 310, 2, 1},
			{"2026-06", "#PLAYER", "Magic", 299, 6400, 300, 3, 2},
		}},
	}}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/clan/:clan_tag/history/legends/summary", clanLegendHistorySummaryHandler(db))

	response, err := app.Test(httptest.NewRequest("GET", "/v2/clan/2PP/history/legends/summary", nil))
	if err != nil || response.StatusCode != fiber.StatusOK {
		t.Fatalf("summary request: status=%d err=%v", response.StatusCode, err)
	}
	var body modelsv2.ClanLegendHistorySummaryResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Seasons) != 1 || body.Seasons[0].PlayerCount != 18 || body.Seasons[0].After != body.Seasons[0].Before {
		t.Fatalf("unexpected seasons: %#v", body.Seasons)
	}
	if len(body.TopFinishes) != 2 || body.TopFinishes[0].Tag != body.TopFinishes[1].Tag {
		t.Fatalf("repeated top player was lost: %#v", body.TopFinishes)
	}
	if len(db.queries) != 2 || !strings.Contains(db.queries[0], "GROUP BY season, season_time") ||
		!strings.Contains(db.queries[1], "ORDER BY rank, trophies DESC, season DESC") ||
		!strings.Contains(db.queries[1], "LIMIT 10") {
		t.Fatalf("unexpected summary queries: %#v", db.queries)
	}
}

func TestClanLeaderboardSummaryUsesAuthoritativeTrophySeasons(t *testing.T) {
	db := &historySummaryTestDB{rows: []pgx.Rows{&historySummaryTestRows{items: [][]any{
		{time.Date(2026, time.March, 31, 0, 0, 0, 0, time.UTC), 20, 51000},
		{time.Date(2026, time.March, 30, 0, 0, 0, 0, time.UTC), 12, 50000},
		{time.Date(2026, time.March, 22, 0, 0, 0, 0, time.UTC), 30, 49000},
	}}}}
	response, err := queryClanLeaderboardHistorySummary(context.Background(), db, modelsv2.LeaderboardHistoryTypeClanHomePoints, "#CLAN")
	if err != nil {
		t.Fatal(err)
	}
	if len(response.Seasons) != 2 {
		t.Fatalf("seasons = %#v", response.Seasons)
	}
	current := response.Seasons[0]
	if current.Season != "2026-04" || current.DaysInTop200 != 2 || current.BestRank != 12 || current.PeakPoints != 51000 {
		t.Fatalf("unexpected 2026-04 summary: %#v", current)
	}
	if !current.After.Equal(time.Date(2026, time.March, 23, 0, 0, 0, 0, time.UTC)) ||
		!current.Before.Equal(time.Date(2026, time.April, 20, 0, 0, 0, 0, time.UTC).Add(-time.Nanosecond)) {
		t.Fatalf("unexpected reusable query bounds: %#v", current)
	}
	if strings.Contains(db.queries[0], "date_trunc('month'") || !strings.Contains(db.queries[0], "GROUP BY date") {
		t.Fatalf("query derives calendar-month seasons: %s", db.queries[0])
	}
}

func TestClanCapitalLeaderboardSummaryReturnsClampedRollingWindows(t *testing.T) {
	earliest := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	latest := time.Date(2026, time.August, 29, 0, 0, 0, 0, time.UTC)
	db := &historySummaryTestDB{rows: []pgx.Rows{&historySummaryTestRows{items: [][]any{{earliest, latest}}}}}
	response, err := queryClanLeaderboardHistorySummary(context.Background(), db, modelsv2.LeaderboardHistoryTypeClanCapitalPoints, "#CLAN")
	if err != nil {
		t.Fatal(err)
	}
	if response.Earliest == nil || response.Latest == nil || response.DefaultWindowDays == nil || *response.DefaultWindowDays != 180 {
		t.Fatalf("unexpected capital availability: %#v", response)
	}
	if len(response.RollingWindows) != 3 || response.RollingWindows[2].Days != 180 || !response.RollingWindows[2].Before.Equal(latest) {
		t.Fatalf("unexpected rolling windows: %#v", response.RollingWindows)
	}
}

func TestClanHistorySummaryRoutesRequireValidScope(t *testing.T) {
	empty := func() pgx.Rows { return &historySummaryTestRows{} }
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/clan/:clan_tag/history/legends/summary", clanLegendHistorySummaryHandler(&historySummaryTestDB{rows: []pgx.Rows{empty(), empty()}}))
	app.Get("/v2/clan/:clan_tag/history/leaderboards/summary", clanLeaderboardHistorySummaryHandler(&historySummaryTestDB{rows: []pgx.Rows{empty()}}))

	for _, path := range []string{
		"/v2/clan/%23/history/legends/summary",
		"/v2/clan/2PP/history/leaderboards/summary",
		"/v2/clan/2PP/history/leaderboards/summary?type=player_home_trophies",
	} {
		response, err := app.Test(httptest.NewRequest("GET", path, nil))
		if err != nil || response.StatusCode != fiber.StatusBadRequest {
			t.Fatalf("%s: status=%d err=%v", path, response.StatusCode, err)
		}
	}
}
