package routes

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

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
	season         string
	playerTag      string
	playerName     string
	expLevel       int
	trophies       int
	attackWins     int
	defenseWins    int
	rank           int
	clanTag        *string
	clanName       *string
	clanBadgeToken *string
	leagueTierID   *int
}

type legendHistoryTestRows struct {
	pgx.Rows
	items  []legendHistoryTestRow
	cursor int
}

func (rows *legendHistoryTestRows) Close()     {}
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
	*dest[2].(*string) = row.playerName
	*dest[3].(*int) = row.expLevel
	*dest[4].(*int) = row.trophies
	*dest[5].(*int) = row.attackWins
	*dest[6].(*int) = row.defenseWins
	*dest[7].(*int) = row.rank
	if len(dest) == 8 {
		return nil
	}
	*dest[8].(**string) = row.clanTag
	*dest[9].(**string) = row.clanName
	*dest[10].(**string) = row.clanBadgeToken
	*dest[11].(**int) = row.leagueTierID
	return nil
}

func TestLegendHistorySeasonAndLimitValidation(t *testing.T) {
	for _, valid := range []string{"2026-07", "v2-2026-07-06T05:00:00Z"} {
		if season, ok := parseLegendHistorySeason(valid); !ok || season != valid {
			t.Fatalf("valid season rejected: %q %v", season, ok)
		}
	}
	if season, ok := parseLegendHistorySeason(" v2-opaque "); !ok || season != " v2-opaque " {
		t.Fatalf("opaque season was rewritten: %q %v", season, ok)
	}
	for _, invalid := range []string{"", "   ", strings.Repeat("x", 129)} {
		if _, ok := parseLegendHistorySeason(invalid); ok {
			t.Fatalf("invalid season %q accepted", invalid)
		}
	}

	if limit, ok := legendHistoryLimit(""); !ok || limit != 25 {
		t.Fatalf("season default limit = %d, %v", limit, ok)
	}
	if limit, ok := legendHistoryLimit("200"); !ok || limit != 200 {
		t.Fatalf("season maximum limit = %d, %v", limit, ok)
	}
	if limit, ok := clanLegendHistoryLimit(""); !ok || limit != 50 {
		t.Fatalf("clan default limit = %d, %v", limit, ok)
	}
	if limit, ok := clanLegendHistoryLimit("250"); !ok || limit != 250 {
		t.Fatalf("clan maximum limit = %d, %v", limit, ok)
	}
	for _, invalid := range []string{"0", "251", "-1", "abc"} {
		if _, ok := clanLegendHistoryLimit(invalid); ok {
			t.Fatalf("invalid clan limit %q accepted", invalid)
		}
	}
}

func TestQueryLegendHistoryUsesNormalizedColumnsAndRebuildsReferences(t *testing.T) {
	clanTag, clanName, badgeToken := "#CLAN", "Example Clan", "legend-clan-token"
	leagueTierID := 105000036
	db := &legendHistoryTestDB{rows: &legendHistoryTestRows{items: []legendHistoryTestRow{{
		season: "v2-2026-07-06T05:00:00Z", playerTag: "#PLAYER", playerName: "Magic Jr.",
		expLevel: 186, trophies: 6123, attackWins: 300, defenseWins: 4, rank: 12,
		clanTag: &clanTag, clanName: &clanName, clanBadgeToken: &badgeToken, leagueTierID: &leagueTierID,
	}}}}
	icon := "https://assets.example/legend.png"
	leagues := legendLeagueTierLookup{
		leagueTierID: {
			ID: leagueTierID, Name: "Legend I",
			IconURLs: &modelsv2.PublicIconURLs{Tiny: icon, Small: icon, Medium: icon, Large: icon},
		},
	}

	items, err := queryLegendHistory(context.Background(), db, leagues, legendSeasonHistoryQuery, "v2-2026-07-06T05:00:00Z", 25)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{
		"player_name", "exp_level", "attack_wins", "defense_wins",
		"clan_badge_token", "league_tier_id", "FROM legend_history", "ORDER BY rank", "LIMIT $2",
	} {
		if !strings.Contains(db.query, required) {
			t.Fatalf("season query missing %q: %s", required, db.query)
		}
	}
	for _, stale := range []string{" data", "created_at"} {
		if strings.Contains(db.query, stale) {
			t.Fatalf("season query retains %q: %s", stale, db.query)
		}
	}
	if len(items) != 1 {
		t.Fatalf("items = %#v", items)
	}
	item := items[0]
	if item.Season != "v2-2026-07-06T05:00:00Z" || item.Tag != "#PLAYER" ||
		item.Name != "Magic Jr." || item.ExpLevel != 186 || item.Rank != 12 ||
		item.Trophies != 6123 || item.AttackWins != 300 || item.DefenseWins != 4 {
		t.Fatalf("unexpected typed item: %#v", item)
	}
	if item.Clan == nil || item.Clan.BadgeURLs == nil || item.Clan.BadgeURLs.Small != badgeURL(badgeToken, 70) ||
		item.Clan.BadgeURLs.Medium != badgeURL(badgeToken, 200) ||
		item.Clan.BadgeURLs.Large != badgeURL(badgeToken, 512) {
		t.Fatalf("unexpected clan: %#v", item.Clan)
	}
	if item.LeagueTier == nil || item.LeagueTier.ID != leagueTierID || item.LeagueTier.Name != "Legend I" {
		t.Fatalf("unexpected league tier: %#v", item.LeagueTier)
	}
	encoded, err := json.Marshal(item)
	if err != nil {
		t.Fatal(err)
	}
	for _, unavailable := range []string{"badgeToken", "previousRank", "townHallLevel", `"data"`} {
		if strings.Contains(string(encoded), unavailable) {
			t.Fatalf("response exposes unavailable/internal field %q: %s", unavailable, encoded)
		}
	}
}

func TestClanLegendHistoryUsesClanRankSeasonIndexPattern(t *testing.T) {
	db := &legendHistoryTestDB{rows: &legendHistoryTestRows{}}
	after := time.Date(2023, time.January, 1, 0, 0, 0, 0, time.UTC)
	before := time.Date(2026, time.December, 31, 0, 0, 0, 0, time.UTC)
	items, err := queryClanLegendHistory(context.Background(), db, "#CLAN", after, before, 250)
	if err != nil {
		t.Fatal(err)
	}
	if items == nil || len(items) != 0 {
		t.Fatalf("empty clan history = %#v, want []", items)
	}
	for _, required := range []string{
		"WHERE clan_tag = $1",
		"season_time >= $2 AND season_time <= $3",
		"ORDER BY season_time DESC, rank",
		"LIMIT $4",
	} {
		if !strings.Contains(db.query, required) {
			t.Fatalf("clan query missing %q: %s", required, db.query)
		}
	}
	if len(db.args) != 4 || db.args[0] != "#CLAN" || db.args[1] != after || db.args[2] != before || db.args[3] != 250 {
		t.Fatalf("unexpected clan args: %#v", db.args)
	}
}

func TestLegendLeagueTierLookupUsesCanonicalStaticData(t *testing.T) {
	lookup := buildLegendLeagueTierLookup([]map[string]any{{
		"_id": int32(105000036), "name": "Legend I", "icon": "league/legend.png",
	}})
	tier := lookup[105000036]
	if tier.ID != 105000036 || tier.Name != "Legend I" || tier.IconURLs == nil {
		t.Fatalf("unexpected league tier: %#v", tier)
	}
	if tier.IconURLs.Large != "https://coc-assets.clashk.ing/league/legend.png" {
		t.Fatalf("unexpected icon URL: %#v", tier.IconURLs)
	}
}

func TestLegendHistoryRoutesReturnEmptyItemsAndValidateInputs(t *testing.T) {
	emptyDB := &legendHistoryTestDB{rows: &legendHistoryTestRows{}}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/legends/history/:season", legendSeasonHistoryHandler(emptyDB, nil))
	app.Get("/v2/player/:player_tag/legend-history", playerLegendHistoryHandler(emptyDB, nil))
	app.Get("/v2/clan/:clan_tag/legend-history", clanLegendHistoryHandler(emptyDB))

	for _, path := range []string{
		"/v2/legends/history/2026-07",
		"/v2/legends/history/v2-2026-07-06T05:00:00Z?limit=200",
		"/v2/player/P0Y/legend-history",
		"/v2/clan/2PP/legend-history?limit=250&time%5Bafter%5D=2023-01-01T00%3A00%3A00Z",
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
		"/v2/legends/history/2026-07?limit=201",
		"/v2/player/%23/legend-history",
		"/v2/clan/%23/legend-history",
		"/v2/clan/2PP/legend-history?limit=251",
		"/v2/clan/2PP/legend-history?time%5Bbefore%5D=bad",
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

func TestLegendHistoryReadersHaveNoJSONOrRecursiveBadgeDependency(t *testing.T) {
	for _, path := range []string{"legend_history.go", "mobile.go"} {
		source, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		text := string(source)
		for _, stale := range []string{
			"legend_history_snapshots",
			"reconstructHistoryBadgeURLs(mobileDecodeJSONAny(dataRaw))",
			"SELECT player_tag, season, rank, trophies, data",
		} {
			if strings.Contains(text, stale) {
				t.Fatalf("%s retains stale Legend reader %q", path, stale)
			}
		}
	}
}
