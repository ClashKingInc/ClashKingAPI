package legacy

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	legacymodels "github.com/ClashKingInc/ClashKingAPI/internal/models/legacy"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type legacyTestRow struct {
	values []any
	err    error
}

func (row legacyTestRow) Scan(dest ...any) error {
	if row.err != nil {
		return row.err
	}
	return assignLegacyTestValues(dest, row.values)
}

type legacyTestRows struct {
	pgx.Rows
	values  [][]any
	cursor  int
	err     error
	scanErr error
}

func (rows *legacyTestRows) Close() {}
func (rows *legacyTestRows) Err() error {
	return rows.err
}
func (rows *legacyTestRows) Next() bool {
	if rows.cursor >= len(rows.values) {
		return false
	}
	rows.cursor++
	return true
}
func (rows *legacyTestRows) Scan(dest ...any) error {
	if rows.scanErr != nil {
		return rows.scanErr
	}
	return assignLegacyTestValues(dest, rows.values[rows.cursor-1])
}

func assignLegacyTestValues(dest, values []any) error {
	if len(dest) != len(values) {
		return errors.New("test scan arity mismatch")
	}
	for index := range dest {
		target := reflect.ValueOf(dest[index])
		if target.Kind() != reflect.Pointer || target.IsNil() {
			return errors.New("test scan destination is not a pointer")
		}
		target.Elem().Set(reflect.ValueOf(values[index]))
	}
	return nil
}

type legacyTestDB struct {
	row        pgx.Row
	rows       []pgx.Rows
	queryErr   error
	queryIndex int
	queries    []string
	args       [][]any
}

func (db *legacyTestDB) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.queries = append(db.queries, query)
	db.args = append(db.args, args)
	if db.queryErr != nil {
		return nil, db.queryErr
	}
	if db.queryIndex >= len(db.rows) {
		return &legacyTestRows{}, nil
	}
	rows := db.rows[db.queryIndex]
	db.queryIndex++
	return rows, nil
}

func (db *legacyTestDB) QueryRow(_ context.Context, query string, args ...any) pgx.Row {
	db.queries = append(db.queries, query)
	db.args = append(db.args, args)
	if db.row == nil {
		return legacyTestRow{err: pgx.ErrNoRows}
	}
	return db.row
}

func legacyTestRequest(t *testing.T, route, path string, handler fiber.Handler) (*http.Response, []byte) {
	t.Helper()
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get(route, handler)
	response, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response, body
}

func legacyTestWar() wararchive.War {
	start := time.Date(2026, 8, 2, 0, 0, 0, 0, time.UTC)
	return wararchive.War{
		Type: "random", State: "ended", TeamSize: 1, AttacksPerMember: 2,
		PreparationStartTime: start.Add(-24 * time.Hour), StartTime: &start, EndTime: start.Add(24 * time.Hour),
		Clan:     wararchive.Clan{Tag: "#CLAN", BadgeToken: "clan", Members: []wararchive.Member{{Tag: "#PLAYER", Attacks: []wararchive.Attack{{DefenderTag: "#ENEMY", Stars: 3, Order: 1}}}}},
		Opponent: wararchive.Clan{Tag: "#OTHER", Members: []wararchive.Member{{Tag: "#ENEMY", Attacks: []wararchive.Attack{{DefenderTag: "#PLAYER", Stars: 2, Order: 2}}}}},
	}
}

func TestLegacyWarHandlersValidateAndReturnContracts(t *testing.T) {
	war := legacyTestWar()
	query := func(_ context.Context, tag string, _ time.Time, _ time.Time, limit int) ([]string, error) {
		if tag != "#CLAN" || limit != 50 {
			t.Fatalf("query arguments: tag=%q limit=%d", tag, limit)
		}
		return []string{"1"}, nil
	}
	load := func(context.Context, []string) (map[string]wararchive.War, error) {
		return map[string]wararchive.War{"1": war}, nil
	}
	response, body := legacyTestRequest(t, "/:clan_tag/previous", "/%23clan/previous", previousWarsHandler(query, load))
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"preparationStartTime"`) {
		t.Fatalf("previous wars: status=%d body=%s", response.StatusCode, body)
	}

	for _, path := range []string{"/%23clan/previous?timestamp_start=nope", "/%23clan/previous?timestamp_end=nope", "/%23clan/previous?limit=nope"} {
		response, _ = legacyTestRequest(t, "/:clan_tag/previous", path, previousWarsHandler(query, load))
		if response.StatusCode != http.StatusUnprocessableEntity {
			t.Fatalf("%s status = %d", path, response.StatusCode)
		}
	}
	response, body = legacyTestRequest(t, "/:clan_tag/previous", "/%23clan/previous?limit=0", previousWarsHandler(query, load))
	if response.StatusCode != http.StatusOK || string(body) != `{"items":[]}` {
		t.Fatalf("zero previous limit: status=%d body=%s", response.StatusCode, body)
	}

	wantErr := errors.New("database unavailable")
	response, _ = legacyTestRequest(t, "/:clan_tag/previous", "/%23clan/previous", previousWarsHandler(func(context.Context, string, time.Time, time.Time, int) ([]string, error) {
		return nil, wantErr
	}, load))
	if response.StatusCode != http.StatusInternalServerError {
		t.Fatalf("previous query error status = %d", response.StatusCode)
	}
}

func TestLegacyPreviousWarAtTimeHandler(t *testing.T) {
	war := legacyTestWar()
	find := func(_ context.Context, tag string, target time.Time) (string, error) {
		if tag != "#CLAN" || target.Year() != 2026 {
			t.Fatalf("find arguments: %q %v", tag, target)
		}
		return "1", nil
	}
	load := func(context.Context, []string) (map[string]wararchive.War, error) {
		return map[string]wararchive.War{"1": war}, nil
	}
	response, body := legacyTestRequest(t, "/:clan_tag/:end_time", "/%23clan/20260803T000000.000Z", previousWarAtTimeHandler(find, load))
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"clan"`) {
		t.Fatalf("previous at time: status=%d body=%s", response.StatusCode, body)
	}
	response, _ = legacyTestRequest(t, "/:clan_tag/:end_time", "/%23clan/not-a-time", previousWarAtTimeHandler(find, load))
	if response.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("invalid time status = %d", response.StatusCode)
	}
	response, body = legacyTestRequest(t, "/:clan_tag/:end_time", "/%23clan/20260803T000000.000Z", previousWarAtTimeHandler(func(context.Context, string, time.Time) (string, error) {
		return "", pgx.ErrNoRows
	}, load))
	if response.StatusCode != http.StatusNotFound || !strings.Contains(string(body), "War Not Found") {
		t.Fatalf("missing war: status=%d body=%s", response.StatusCode, body)
	}
	response, _ = legacyTestRequest(t, "/:clan_tag/:end_time", "/%23clan/20260803T000000.000Z", previousWarAtTimeHandler(find, func(context.Context, []string) (map[string]wararchive.War, error) {
		return map[string]wararchive.War{}, nil
	}))
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("missing archive status = %d", response.StatusCode)
	}
}

func TestLegacyPlayerWarHitsHandler(t *testing.T) {
	war := legacyTestWar()
	query := func(_ context.Context, tag string, _ time.Time, _ time.Time, limit int) ([]string, error) {
		if tag != "#PLAYER" || limit != 100 {
			t.Fatalf("warhits arguments: tag=%q limit=%d", tag, limit)
		}
		return []string{"1", "missing"}, nil
	}
	load := func(context.Context, []string) (map[string]wararchive.War, error) {
		return map[string]wararchive.War{"1": war}, nil
	}
	response, body := legacyTestRequest(t, "/:player_tag/warhits", "/%23player/warhits?limit=200", playerWarHitsHandler(query, load))
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"war_data"`) {
		t.Fatalf("warhits: status=%d body=%s", response.StatusCode, body)
	}
	for _, path := range []string{"/%23player/warhits?timestamp_start=x", "/%23player/warhits?timestamp_end=x", "/%23player/warhits?limit=x"} {
		response, _ = legacyTestRequest(t, "/:player_tag/warhits", path, playerWarHitsHandler(query, load))
		if response.StatusCode != http.StatusUnprocessableEntity {
			t.Fatalf("%s status = %d", path, response.StatusCode)
		}
	}
	response, body = legacyTestRequest(t, "/:player_tag/warhits", "/%23player/warhits?limit=0", playerWarHitsHandler(query, load))
	if response.StatusCode != http.StatusOK || string(body) != `{"items":[]}` {
		t.Fatalf("zero warhits limit: status=%d body=%s", response.StatusCode, body)
	}
}

func TestLegacyWarQueries(t *testing.T) {
	rows := &legacyTestRows{values: [][]any{{"2"}, {"1"}}}
	db := &legacyTestDB{rows: []pgx.Rows{rows}, row: legacyTestRow{values: []any{"3"}}}
	start := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	ids, err := queryWarIDs(context.Background(), db, "#CLAN", start, start.Add(time.Hour), 2)
	if err != nil || !reflect.DeepEqual(ids, []string{"2", "1"}) || !strings.Contains(db.queries[0], "ORDER BY end_time DESC") {
		t.Fatalf("queryWarIDs: ids=%v err=%v query=%q", ids, err, db.queries[0])
	}
	id, err := queryWarAtTime(context.Background(), db, "#CLAN", start)
	if err != nil || id != "3" {
		t.Fatalf("queryWarAtTime: id=%q err=%v", id, err)
	}
	query := strings.ToLower(db.queries[1])
	if strings.Contains(query, "$2 -") || strings.Contains(query, "$2 +") || !strings.Contains(query, "end_time >= $2") || !strings.Contains(query, "end_time <= $3") {
		t.Fatalf("queryWarAtTime retained ambiguous timestamp arithmetic: %q", query)
	}
	if len(db.args[1]) != 4 || db.args[1][1] != start.Add(-5*time.Minute) || db.args[1][2] != start.Add(5*time.Minute) {
		t.Fatalf("queryWarAtTime bounds = %#v", db.args[1])
	}

	db = &legacyTestDB{rows: []pgx.Rows{&legacyTestRows{values: [][]any{{"4"}}}}}
	ids, err = queryPlayerWarIDs(context.Background(), db, "#PLAYER", start, start.Add(time.Hour), 1)
	if err != nil || !reflect.DeepEqual(ids, []string{"4"}) || !strings.Contains(db.queries[0], "player_war_history") {
		t.Fatalf("queryPlayerWarIDs: ids=%v err=%v query=%q", ids, err, db.queries[0])
	}
}

func TestLegacyJoinLeaveHandlers(t *testing.T) {
	when := time.Date(2026, 8, 1, 2, 3, 4, 5000000, time.UTC)
	load := func(_ context.Context, tag string, _ time.Time, _ time.Time, limit int) ([]joinLeaveRow, error) {
		if tag != "#CLAN" || limit != 250 {
			t.Fatalf("join-leave arguments: tag=%q limit=%d", tag, limit)
		}
		return []joinLeaveRow{{Time: when, Type: "join", Clan: "#CLAN", Tag: "#P", Name: "Player", Townhall: 17, ClanName: "Clan"}}, nil
	}
	response, body := legacyTestRequest(t, "/:clan_tag/join-leave", "/%23clan/join-leave", clanJoinLeaveHandler(load))
	if response.StatusCode != http.StatusOK || strings.Contains(string(body), "clan_name") || !strings.Contains(string(body), "2026-08-01T02:03:04.005000") {
		t.Fatalf("clan join-leave: status=%d body=%s", response.StatusCode, body)
	}
	response, body = legacyTestRequest(t, "/:player_tag/join-leave", "/%23clan/join-leave", playerJoinLeaveHandler(load))
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"clan_name":"Clan"`) {
		t.Fatalf("player join-leave: status=%d body=%s", response.StatusCode, body)
	}
	for _, path := range []string{"/%23clan/join-leave?timestamp_start=x", "/%23clan/join-leave?time_stamp_end=x", "/%23clan/join-leave?limit=x"} {
		response, _ = legacyTestRequest(t, "/:clan_tag/join-leave", path, clanJoinLeaveHandler(load))
		if response.StatusCode != http.StatusUnprocessableEntity {
			t.Fatalf("%s status = %d", path, response.StatusCode)
		}
	}
	response, body = legacyTestRequest(t, "/:clan_tag/join-leave", "/%23clan/join-leave?limit=0", clanJoinLeaveHandler(load))
	if response.StatusCode != http.StatusOK || string(body) != `{"items":[]}` {
		t.Fatalf("zero join-leave limit: status=%d body=%s", response.StatusCode, body)
	}
}

func TestLegacyJoinLeaveLoaders(t *testing.T) {
	when := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	name := pgtype.Text{String: "Player", Valid: true}
	clanRows := &legacyTestRows{values: [][]any{{when, "join", "#CLAN", "#P", name, 17}}}
	db := &legacyTestDB{rows: []pgx.Rows{clanRows}}
	items, err := loadClanJoinLeave(context.Background(), db, "#CLAN", when, when.Add(time.Hour), 10)
	if err != nil || len(items) != 1 || items[0].Name != "Player" || !strings.Contains(db.queries[0], `ORDER BY "time" DESC`) {
		t.Fatalf("clan loader: items=%#v err=%v", items, err)
	}

	playerRows := &legacyTestRows{values: [][]any{{when, "leave", "#CLAN", "#P", name, 17, "Clan"}}}
	db = &legacyTestDB{rows: []pgx.Rows{playerRows}}
	items, err = loadPlayerJoinLeave(context.Background(), db, "#P", when, when.Add(time.Hour), 10)
	if err != nil || len(items) != 1 || items[0].ClanName != "Clan" || !strings.Contains(db.queries[0], "JOIN basic_clan") {
		t.Fatalf("player loader: items=%#v err=%v", items, err)
	}
}

func TestLegacyCWLHandlers(t *testing.T) {
	group := &legacymodels.CWLGroup{State: "ended", Season: "2026-05", Clans: []legacymodels.CWLClan{}, Rounds: []legacymodels.CWLRound{}}
	load := func(_ context.Context, tag, season string, hydrate bool) (*legacymodels.CWLGroup, error) {
		if tag != "#CLAN" {
			t.Fatalf("CWL tag = %q", tag)
		}
		if season == "2026-05" && !hydrate {
			t.Fatal("season endpoint did not request hydration")
		}
		return group, nil
	}
	response, body := legacyTestRequest(t, "/:clan_tag/:season", "/%23clan/2026-05", cwlSeasonHandler(load))
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"season":"2026-05"`) {
		t.Fatalf("season CWL: status=%d body=%s", response.StatusCode, body)
	}
	response, body = legacyTestRequest(t, "/:clan_tag/group", "/%23clan/group", currentCWLGroupHandler(load))
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), `"data"`) {
		t.Fatalf("current CWL: status=%d body=%s", response.StatusCode, body)
	}
	response, body = legacyTestRequest(t, "/:clan_tag/group", "/%23clan/group", currentCWLGroupHandler(func(context.Context, string, string, bool) (*legacymodels.CWLGroup, error) {
		return nil, pgx.ErrNoRows
	}))
	if response.StatusCode != http.StatusOK || string(body) != "null" {
		t.Fatalf("missing current CWL: status=%d body=%s", response.StatusCode, body)
	}
	response, body = legacyTestRequest(t, "/:clan_tag/:season", "/%23clan/2026-05", cwlSeasonHandler(func(context.Context, string, string, bool) (*legacymodels.CWLGroup, error) {
		return nil, pgx.ErrNoRows
	}))
	if response.StatusCode != http.StatusNotFound || !strings.Contains(string(body), "No CWL Data Found") {
		t.Fatalf("missing season CWL: status=%d body=%s", response.StatusCode, body)
	}
}

func TestLegacyCWLLoaders(t *testing.T) {
	clanRows := &legacyTestRows{values: [][]any{
		{"#A", "Alpha", 20, "badge", pgtype.Text{String: "#P", Valid: true}, pgtype.Text{String: "Player", Valid: true}, pgtype.Int2{Int16: 17, Valid: true}},
		{"#B", "Beta", 19, "", pgtype.Text{}, pgtype.Text{}, pgtype.Int2{}},
	}}
	db := &legacyTestDB{rows: []pgx.Rows{clanRows}}
	clans, err := loadCWLClans(context.Background(), db, "cwl-1")
	if err != nil || len(clans) != 2 || len(clans[0].Members) != 1 || len(clans[1].Members) != 0 {
		t.Fatalf("CWL clans: %#v err=%v", clans, err)
	}

	warRows := &legacyTestRows{values: [][]any{{"1", pgtype.Text{String: "#WAR", Valid: true}}}}
	db = &legacyTestDB{rows: []pgx.Rows{warRows}}
	wars, err := loadCWLWars(context.Background(), db, func(_ context.Context, ids []string) (map[string]wararchive.War, error) {
		if !reflect.DeepEqual(ids, []string{"1"}) {
			t.Fatalf("archive ids = %v", ids)
		}
		war := legacyTestWar()
		war.Type = "cwl"
		war.WarTag = "#WAR"
		return map[string]wararchive.War{"1": war}, nil
	}, [][]string{{"#WAR", "#0", "#WAR"}}, "2026-05")
	if err != nil || wars["#WAR"].Season != "2026-05" || wars["#WAR"].Tag != "#WAR" {
		t.Fatalf("CWL wars: %#v err=%v", wars, err)
	}
	empty, err := loadCWLWars(context.Background(), &legacyTestDB{}, nil, [][]string{{"#0", ""}}, "2026-05")
	if err != nil || len(empty) != 0 {
		t.Fatalf("empty CWL wars: %#v err=%v", empty, err)
	}
}

func TestLoadCWLGroupHydratesRounds(t *testing.T) {
	groupRow := legacyTestRow{values: []any{"cwl-1", "2026-05", "ended", []byte(`[["#WAR","#MISSING"]]`)}}
	clanRows := &legacyTestRows{values: [][]any{{"#CLAN", "Clan", 20, "badge", pgtype.Text{}, pgtype.Text{}, pgtype.Int2{}}}}
	warRows := &legacyTestRows{values: [][]any{{"1", pgtype.Text{String: "#WAR", Valid: true}}}}
	db := &legacyTestDB{row: groupRow, rows: []pgx.Rows{clanRows, warRows}}
	group, err := loadCWLGroup(context.Background(), db, func(context.Context, []string) (map[string]wararchive.War, error) {
		war := legacyTestWar()
		war.Type, war.WarTag = "cwl", "#WAR"
		return map[string]wararchive.War{"1": war}, nil
	}, "#CLAN", "2026-05", true)
	if err != nil || len(group.Rounds) != 1 || len(group.Rounds[0].WarTags) != 2 {
		t.Fatalf("hydrated group: %#v err=%v", group, err)
	}
	payload, err := json.Marshal(group.Rounds[0].WarTags[1])
	if err != nil || string(payload) != `{"tag":"#MISSING"}` {
		t.Fatalf("missing war placeholder = %s err=%v", payload, err)
	}
}

func TestLegacyHelpersAndRegistration(t *testing.T) {
	if got := fixTag(" %23goO-2 "); got != "#G002" {
		t.Fatalf("fixTag = %q", got)
	}
	if got := fixTag("---"); got != "" {
		t.Fatalf("empty fixTag = %q", got)
	}
	if _, err := parseInt("bad", 1); err == nil {
		t.Fatal("parseInt accepted invalid input")
	}
	if got, err := parseInt("", 7); err != nil || got != 7 {
		t.Fatalf("parseInt fallback = %d, %v", got, err)
	}
	if _, err := parseInt64("bad", 1); err == nil {
		t.Fatal("parseInt64 accepted invalid input")
	}
	if got := badgeURLs(""); got != (legacymodels.BadgeURLs{}) {
		t.Fatalf("empty badges = %#v", got)
	}
	for input, expected := range map[string]string{"notinwar": "notInWar", "inwar": "inWar", "preparation": "preparation", "ended": "warEnded", "custom": "custom"} {
		if got := normalizeWarState(input); got != expected {
			t.Fatalf("normalizeWarState(%q) = %q", input, got)
		}
	}
	weak := legacymodels.WarAttack{Stars: 1, DestructionPercentage: 50, Order: 2}
	if !betterAttack(legacymodels.WarAttack{Stars: 2}, &weak) || !betterAttack(legacymodels.WarAttack{Stars: 1, DestructionPercentage: 60}, &weak) || !betterAttack(legacymodels.WarAttack{Stars: 1, DestructionPercentage: 50, Order: 1}, &weak) {
		t.Fatal("betterAttack rejected a better candidate")
	}

	app := fiber.New()
	Register(app, apptypes.Deps{})
	getRoutes := 0
	for _, route := range app.GetRoutes(true) {
		if route.Method == fiber.MethodGet {
			getRoutes++
		}
	}
	if getRoutes != 7 {
		t.Fatalf("legacy GET route count = %d", getRoutes)
	}
}
