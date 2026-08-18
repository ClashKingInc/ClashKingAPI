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
	clashy "github.com/clashkinginc/clashy.go"
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
		case *string:
			*target = value.(string)
		case *int:
			*target = value.(int)
		case **string:
			if value == nil {
				*target = nil
			} else {
				copy := value.(string)
				*target = &copy
			}
		case **int:
			if value == nil {
				*target = nil
			} else {
				copy := value.(int)
				*target = &copy
			}
		case *time.Time:
			*target = value.(time.Time)
		default:
			panic("unsupported leaderboard history test scan target")
		}
	}
	return nil
}

func TestLeaderboardHistoryTypeValidationMatchesCanonicalURLTypes(t *testing.T) {
	playerTypes := []modelsv2.LeaderboardHistoryType{
		modelsv2.LeaderboardHistoryTypePlayerHomeTrophies,
		modelsv2.LeaderboardHistoryTypePlayerBuilderBaseTrophies,
	}
	clanTypes := []modelsv2.LeaderboardHistoryType{
		modelsv2.LeaderboardHistoryTypeClanHomePoints,
		modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints,
		modelsv2.LeaderboardHistoryTypeClanCapitalPoints,
	}
	for _, kind := range append(slices.Clone(playerTypes), clanTypes...) {
		if parsed, ok := parseLeaderboardHistoryType(string(kind)); !ok || parsed != kind {
			t.Fatalf("canonical type %q was rejected", kind)
		}
	}
	for _, kind := range playerTypes {
		if _, ok := playerLeaderboardHistoryType(string(kind)); !ok {
			t.Fatalf("player type %q was rejected for player history", kind)
		}
		if _, ok := clanLeaderboardHistoryType(string(kind)); ok {
			t.Fatalf("player type %q was accepted for clan history", kind)
		}
	}
	for _, kind := range clanTypes {
		if _, ok := clanLeaderboardHistoryType(string(kind)); !ok {
			t.Fatalf("clan type %q was rejected for clan history", kind)
		}
		if _, ok := playerLeaderboardHistoryType(string(kind)); ok {
			t.Fatalf("clan type %q was accepted for player history", kind)
		}
	}
	for _, stale := range []string{"league", "townhall", "trophy_buckets", "player_trophies", "clan_trophies"} {
		if _, ok := parseLeaderboardHistoryType(stale); ok {
			t.Fatalf("stale type %q was accepted", stale)
		}
	}
}

func TestPlayerHomeSnapshotUsesTypedTableAndLeagueIDFamily(t *testing.T) {
	date := time.Date(2026, time.July, 26, 0, 0, 0, 0, time.UTC)
	db := &leaderboardHistoryTestDB{rows: &leaderboardHistoryTestRows{items: []leaderboardHistoryTestRow{
		{values: []any{
			"#TIER", "Ranked", 300, 6123, 10, 3, 1, nil,
			"#CLAN", "Clan", "clan-badge", 105000036,
		}},
		{values: []any{
			"#LEGACY", "Legacy", 250, 5999, 8, 4, 2, 5,
			nil, nil, nil, 29000022,
		}},
	}}}
	metadata := leaderboardHistoryMetadata{
		leagueTiers: map[int]modelsv2.LeaderboardHistoryLeagueReference{
			105000036: {ID: 105000036, Name: "Legend I"},
		},
		homeLeagues: map[int]modelsv2.LeaderboardHistoryLeagueReference{
			29000022: {ID: 29000022, Name: "Legend League"},
		},
	}
	items, err := queryLeaderboardSnapshotHistory(
		context.Background(), db, metadata,
		modelsv2.LeaderboardHistoryTypePlayerHomeTrophies, "global", date,
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{
		"FROM leaderboard_history_player_home",
		"location_id = $1",
		"date = $2",
		"ORDER BY rank",
		"attack_wins",
		"defense_wins",
	} {
		if !strings.Contains(db.query, required) {
			t.Fatalf("snapshot query missing %q: %s", required, db.query)
		}
	}
	for _, forbidden := range []string{"FROM leaderboard_history\n", " kind ", " data"} {
		if strings.Contains(db.query, forbidden) {
			t.Fatalf("snapshot query retains %q: %s", forbidden, db.query)
		}
	}
	if len(db.args) != 2 || db.args[0] != "global" || db.args[1] != date {
		t.Fatalf("unexpected snapshot args: %#v", db.args)
	}
	if len(items) != 2 {
		t.Fatalf("items = %d, want 2", len(items))
	}
	if items[0].LeagueTier == nil || items[0].LeagueTier.ID != 105000036 || items[0].League != nil {
		t.Fatalf("ranked tier was represented ambiguously: %#v", items[0])
	}
	if items[1].League == nil || items[1].League.ID != 29000022 || items[1].LeagueTier != nil {
		t.Fatalf("legacy league was represented ambiguously: %#v", items[1])
	}
	if items[0].Clan == nil || items[0].Clan.BadgeURLs.Small != badgeURL("clan-badge", 70) {
		t.Fatalf("clan badge was not reconstructed: %#v", items[0].Clan)
	}
}

func TestPlayerHomeUnknownLeagueIDDoesNotInventMetadataFamily(t *testing.T) {
	row := &leaderboardHistoryTestRows{items: []leaderboardHistoryTestRow{{
		values: []any{
			"#UNKNOWN", "Unknown", 100, 5000, 1, 1, 1, nil,
			nil, nil, nil, 12345,
		},
	}}}
	row.Next()
	item, err := scanLeaderboardHistoryItem(
		row,
		leaderboardHistoryMetadata{},
		modelsv2.LeaderboardHistoryTypePlayerHomeTrophies,
	)
	if err != nil {
		t.Fatal(err)
	}
	if item.League != nil || item.LeagueTier != nil {
		t.Fatalf("unknown league ID was assigned an ambiguous family: %#v", item)
	}
}

func TestPlayerBuilderBaseSnapshotUsesTypedTableAndLeague(t *testing.T) {
	date := time.Date(2026, time.July, 26, 0, 0, 0, 0, time.UTC)
	db := &leaderboardHistoryTestDB{rows: &leaderboardHistoryTestRows{items: []leaderboardHistoryTestRow{
		{values: []any{
			"#P0Y", "Builder", 250, 7000, 90, 3, 4,
			nil, nil, nil, 44000041,
		}},
	}}}
	metadata := leaderboardHistoryMetadata{
		builderLeagues: map[int]modelsv2.LeaderboardHistoryLeagueReference{
			44000041: {ID: 44000041, Name: "Diamond League"},
		},
	}
	items, err := queryLeaderboardSnapshotHistory(
		context.Background(), db, metadata,
		modelsv2.LeaderboardHistoryTypePlayerBuilderBaseTrophies, "global", date,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(db.query, "FROM leaderboard_history_player_builder_base") ||
		!strings.Contains(db.query, "builder_base_battle_wins") {
		t.Fatalf("unexpected builder query: %s", db.query)
	}
	item := items[0]
	if item.BuilderBaseTrophies == nil || *item.BuilderBaseTrophies != 7000 ||
		item.BuilderBaseBattleWins == nil || *item.BuilderBaseBattleWins != 90 ||
		item.BuilderBaseLeague == nil || item.BuilderBaseLeague.ID != 44000041 {
		t.Fatalf("unexpected builder item: %#v", item)
	}
	if item.League != nil || item.LeagueTier != nil || item.Trophies != nil {
		t.Fatalf("builder item exposed home fields: %#v", item)
	}
}

func TestClanSnapshotsUseTypedMetricTablesAndCanonicalLocation(t *testing.T) {
	date := time.Date(2026, time.July, 26, 0, 0, 0, 0, time.UTC)
	location := modelsv2.LeaderboardHistoryLocationReference{
		ID: 32000006, Name: "United States", IsCountry: true, CountryCode: "US", LocalizedName: "United States",
	}
	tests := []struct {
		leaderboardType modelsv2.LeaderboardHistoryType
		table           string
		pointsColumn    string
		assertPoints    func(modelsv2.LeaderboardHistoryItem) *int
	}{
		{modelsv2.LeaderboardHistoryTypeClanHomePoints, "leaderboard_history_clan_home", "clan_points", func(item modelsv2.LeaderboardHistoryItem) *int { return item.ClanPoints }},
		{modelsv2.LeaderboardHistoryTypeClanBuilderBasePoints, "leaderboard_history_clan_builder_base", "builder_base_points", func(item modelsv2.LeaderboardHistoryItem) *int { return item.BuilderBasePoints }},
		{modelsv2.LeaderboardHistoryTypeClanCapitalPoints, "leaderboard_history_clan_capital", "capital_points", func(item modelsv2.LeaderboardHistoryItem) *int { return item.CapitalPoints }},
	}
	for _, test := range tests {
		t.Run(string(test.leaderboardType), func(t *testing.T) {
			db := &leaderboardHistoryTestDB{rows: &leaderboardHistoryTestRows{items: []leaderboardHistoryTestRow{
				{values: []any{"#CLAN", "Clan", "badge", 20, 54321, 49, 32000006, 7, nil}},
			}}}
			items, err := queryLeaderboardSnapshotHistory(
				context.Background(), db,
				leaderboardHistoryMetadata{locations: map[int]modelsv2.LeaderboardHistoryLocationReference{32000006: location}},
				test.leaderboardType, "global", date,
			)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(db.query, "FROM "+test.table) || !strings.Contains(db.query, test.pointsColumn) {
				t.Fatalf("unexpected clan query: %s", db.query)
			}
			item := items[0]
			points := test.assertPoints(item)
			if points == nil || *points != 54321 || item.Location == nil || item.Location.CountryCode != "US" {
				t.Fatalf("unexpected clan item: %#v", item)
			}
			if item.BadgeURLs == nil || item.BadgeURLs.Large != badgeURL("badge", 512) {
				t.Fatalf("clan badge missing: %#v", item.BadgeURLs)
			}
		})
	}
}

func TestLeaderboardEntityHistoryUsesEntityDateIndexPattern(t *testing.T) {
	date := time.Date(2026, time.July, 25, 0, 0, 0, 0, time.UTC)
	db := &leaderboardHistoryTestDB{rows: &leaderboardHistoryTestRows{items: []leaderboardHistoryTestRow{
		{values: []any{
			date, "32000006",
			"#2PP", "Example Clan", "badge", 20, 54321, 50, 32000006, 7, 8,
		}},
	}}}
	items, err := queryLeaderboardEntityHistory(
		context.Background(), db, leaderboardHistoryMetadata{},
		modelsv2.LeaderboardHistoryTypeClanHomePoints, "#2PP",
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{
		"FROM leaderboard_history_clan_home",
		"WHERE clan_tag = $1",
		"ORDER BY date DESC",
	} {
		if !strings.Contains(db.query, required) {
			t.Fatalf("entity query missing %q: %s", required, db.query)
		}
	}
	if len(db.args) != 1 || db.args[0] != "#2PP" {
		t.Fatalf("unexpected entity args: %#v", db.args)
	}
	if len(items) != 1 ||
		items[0].Date != "2026-07-25" ||
		items[0].LocationID != "32000006" ||
		items[0].Name != "Example Clan" ||
		items[0].Rank != 7 ||
		items[0].Details.Rank != 7 ||
		items[0].Details.ClanPoints == nil ||
		*items[0].Details.ClanPoints != 54321 {
		t.Fatalf("unexpected entity history item: %#v", items)
	}
}

func TestLeaderboardHistoryMetadataUsesCorrectStaticFamilies(t *testing.T) {
	tiers := leaderboardHistoryStaticLeagues([]map[string]any{{
		"_id": int32(105000036), "name": "Legend I", "icon": "league/legend.png",
	}})
	builders := leaderboardHistoryStaticLeagues([]map[string]any{{
		"_id": int32(44000041), "name": "Diamond League", "icon": "league/diamond.png",
	}})
	legacy := leaderboardHistoryOfficialLeagues([]clashy.League{{
		ID: 29000022, Name: "Legend League", Icon: &clashy.Icon{Small: "small", Medium: "medium", Tiny: "tiny"},
	}})
	if tiers[105000036].Name != "Legend I" || builders[44000041].Name != "Diamond League" {
		t.Fatalf("static league families were not retained: tiers=%#v builders=%#v", tiers, builders)
	}
	if legacy[29000022].Name != "Legend League" || legacy[29000022].IconURLs == nil {
		t.Fatalf("legacy official league missing: %#v", legacy)
	}
}

func TestLeaderboardHistoryJSONIsTypedCamelCase(t *testing.T) {
	value := 12
	body, err := json.Marshal(modelsv2.LeaderboardHistoryItem{
		Tag: "#P0Y", Name: "Player", ExpLevel: &value, Rank: 1,
		BuilderBaseBattleWins: &value,
		BuilderBaseLeague:     &modelsv2.LeaderboardHistoryLeagueReference{ID: 44000041},
	})
	if err != nil {
		t.Fatal(err)
	}
	jsonBody := string(body)
	for _, required := range []string{`"expLevel":12`, `"builderBaseBattleWins":12`, `"builderBaseLeague":{"id":44000041}`} {
		if !strings.Contains(jsonBody, required) {
			t.Fatalf("typed JSON missing %s: %s", required, jsonBody)
		}
	}
	for _, forbidden := range []string{"exp_level", "builder_base_battle_wins", "badgeToken", `"data"`, `"kind"`} {
		if strings.Contains(jsonBody, forbidden) {
			t.Fatalf("typed JSON contains %q: %s", forbidden, jsonBody)
		}
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

func TestLeaderboardHistorySourceHasOnlyTypedTableReaders(t *testing.T) {
	for _, path := range []string{"public_stats.go", "leaderboard_history.go"} {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		source := string(raw)
		for _, stale := range []string{
			"leaderboard_snapshot_items",
			"FROM leaderboard_history\n",
			"decodeHistoryJSON",
			"battlelogItemDimensionTop200",
			"FROM player_trophy_history",
			"FROM player_builder_base_trophy_history",
			"FROM clan_trophy_history",
			"FROM clan_builder_base_trophy_history",
			"FROM clan_capital_history",
		} {
			if strings.Contains(source, stale) {
				t.Fatalf("%s retains stale leaderboard history reader %q", path, stale)
			}
		}
	}
	source, err := os.ReadFile("leaderboard_history.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{
		"leaderboard_history_player_home",
		"leaderboard_history_player_builder_base",
		"leaderboard_history_clan_home",
		"leaderboard_history_clan_builder_base",
		"leaderboard_history_clan_capital",
	} {
		if !strings.Contains(string(source), "FROM "+table) {
			t.Fatalf("typed table %q is not queried", table)
		}
	}
}
