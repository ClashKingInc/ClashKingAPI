package routes

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestClanCachedHandlerReturnsCachedDataAndHandlesMissingRows(t *testing.T) {
	want := modelsv2.ClanCachedResponse{Name: "Clan", Tag: "#CLAN", ClanLevel: 20}
	loader := func(_ *fiber.Ctx, _ apptypes.Deps, tag string) (modelsv2.ClanCachedResponse, error) {
		if tag != "#CLAN" {
			t.Fatalf("normalized clan tag = %q", tag)
		}
		return want, nil
	}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/clan/:clan_tag/cached", clanCachedHandler(apptypes.Deps{}, loader))
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/v2/clan/%23clan/cached", nil))
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("cached clan request: status=%d err=%v", response.StatusCode, err)
	}
	var got modelsv2.ClanCachedResponse
	if err := json.NewDecoder(response.Body).Decode(&got); err != nil {
		t.Fatal(err)
	}
	if got.Name != want.Name || got.Tag != want.Tag || got.ClanLevel != want.ClanLevel {
		t.Fatalf("cached clan response = %#v", got)
	}

	app = fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/clan/:clan_tag/cached", clanCachedHandler(apptypes.Deps{}, func(*fiber.Ctx, apptypes.Deps, string) (modelsv2.ClanCachedResponse, error) {
		return modelsv2.ClanCachedResponse{}, pgx.ErrNoRows
	}))
	response, err = app.Test(httptest.NewRequest(http.MethodGet, "/v2/clan/%23CLAN/cached", nil))
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("missing cached clan request: status=%d err=%v", response.StatusCode, err)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "null" {
		t.Fatalf("missing cached clan body = %s", body)
	}
}

func TestClanCachedAndRecordsHandlersPropagateFailures(t *testing.T) {
	wantErr := errors.New("database unavailable")
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/cached", clanCachedHandler(apptypes.Deps{}, func(*fiber.Ctx, apptypes.Deps, string) (modelsv2.ClanCachedResponse, error) {
		return modelsv2.ClanCachedResponse{}, wantErr
	}))
	app.Get("/records", clanRecordsHandler(apptypes.Deps{}, func(*fiber.Ctx, apptypes.Deps, string) (*modelsv2.ClanBasicRecords, error) {
		return nil, wantErr
	}))
	for _, path := range []string{"/cached", "/records"} {
		response, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil || response.StatusCode != http.StatusInternalServerError {
			t.Fatalf("%s failure: status=%d err=%v", path, response.StatusCode, err)
		}
	}
}

func TestClanRecordsHandlerReturnsEmptyAndStoredRecords(t *testing.T) {
	recordTime := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	records := &modelsv2.ClanBasicRecords{ClanPoints: &modelsv2.ClanRecordEntry{Value: 54321, Time: recordTime}}
	for name, result := range map[string]*modelsv2.ClanBasicRecords{"empty": nil, "stored": records} {
		t.Run(name, func(t *testing.T) {
			app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
			app.Get("/v2/clan/:clan_tag/records", clanRecordsHandler(apptypes.Deps{}, func(_ *fiber.Ctx, _ apptypes.Deps, tag string) (*modelsv2.ClanBasicRecords, error) {
				if tag != "#CLAN" {
					t.Fatalf("normalized clan tag = %q", tag)
				}
				return result, nil
			}))
			response, err := app.Test(httptest.NewRequest(http.MethodGet, "/v2/clan/%23clan/records", nil))
			if err != nil || response.StatusCode != http.StatusOK {
				t.Fatalf("records request: status=%d err=%v", response.StatusCode, err)
			}
			var got modelsv2.ClanBasicRecords
			if err := json.NewDecoder(response.Body).Decode(&got); err != nil {
				t.Fatal(err)
			}
			if result == nil && (got.ClanPoints != nil || got.WarWinStreak != nil) {
				t.Fatalf("empty records response = %#v", got)
			}
			if result != nil && (got.ClanPoints == nil || got.ClanPoints.Value != 54321) {
				t.Fatalf("stored records response = %#v", got)
			}
		})
	}
}

type clanChangesTestDB struct {
	query string
	args  []any
	rows  pgx.Rows
}

func (db *clanChangesTestDB) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.query, db.args = query, args
	return db.rows, nil
}

type clanChangesTestRow struct {
	time       time.Time
	changeType string
	previous   []byte
	current    []byte
}

type clanChangesTestRows struct {
	pgx.Rows
	items  []clanChangesTestRow
	cursor int
}

func (rows *clanChangesTestRows) Close()     {}
func (rows *clanChangesTestRows) Err() error { return nil }
func (rows *clanChangesTestRows) Next() bool {
	if rows.cursor >= len(rows.items) {
		return false
	}
	rows.cursor++
	return true
}
func (rows *clanChangesTestRows) Scan(dest ...any) error {
	row := rows.items[rows.cursor-1]
	*dest[0].(*time.Time) = row.time
	*dest[1].(*string) = row.changeType
	*dest[2].(*[]byte) = row.previous
	*dest[3].(*[]byte) = row.current
	return nil
}

func TestCachedClanMembersUsesOfficialTownHallField(t *testing.T) {
	members := cachedClanMembers([]any{map[string]any{
		"tag": "#P1", "name": "Player", "town_hall": float64(17),
	}})
	if len(members) != 1 || members[0].TownHallLevel != 17 {
		t.Fatalf("unexpected cached members: %#v", members)
	}
	payload, err := json.Marshal(members)
	if err != nil {
		t.Fatal(err)
	}
	encoded := string(payload)
	if encoded != `[{"tag":"#P1","name":"Player","townHallLevel":17}]` {
		t.Fatalf("unexpected cached member JSON: %s", encoded)
	}
}

func TestCachedClanResponseEnrichesStoredReferencesAndNormalizesMembers(t *testing.T) {
	lastActive := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	response := cachedClanResponse(basicClanData{
		tag: "#CLAN", name: "Clan", cwlLeague: cwlUnrankedLeagueID,
		locationID:    pgtype.Int4{Int32: 32000087, Valid: true},
		capitalLeague: pgtype.Int4{Int32: 85000015, Valid: true},
		lastActive:    pgtype.Timestamptz{Time: lastActive, Valid: true},
		members:       []any{map[string]any{"tag": "#P1", "name": "Player", "town_hall": float64(17)}},
	}, apptypes.Deps{})
	if response.Location == nil || response.Location.ID != 32000087 || response.Location.Name == "" || response.Location.CountryCode == "" {
		t.Fatalf("cached location was not enriched: %#v", response.Location)
	}
	if response.WarLeague.ID != cwlUnrankedLeagueID || response.WarLeague.Name != "Unranked" {
		t.Fatalf("cached war league was not enriched: %#v", response.WarLeague)
	}
	if response.CapitalLeague == nil || response.CapitalLeague.ID != 85000015 {
		t.Fatalf("cached capital league missing: %#v", response.CapitalLeague)
	}
	if response.LastActive == nil || !response.LastActive.Equal(lastActive) || len(response.Members) != 1 || response.Members[0].TownHallLevel != 17 {
		t.Fatalf("cached scalar/member fields were not preserved: %#v", response)
	}
}

func TestClanChangeValuesUsePrimitives(t *testing.T) {
	tests := []struct {
		raw  string
		want any
	}{
		{raw: `"Old description"`, want: "Old description"},
		{raw: `19`, want: 19},
	}
	for _, test := range tests {
		got, err := clanChangeValue([]byte(test.raw))
		if err != nil {
			t.Fatalf("change value %s: %v", test.raw, err)
		}
		if got != test.want {
			t.Fatalf("change value %s = %#v, want %#v", test.raw, got, test.want)
		}
	}
}

func TestClanChangeStorageTypesAreLimitedToDocumentedOptions(t *testing.T) {
	for apiType, storageType := range map[string]string{
		"": "", "description": "description", "clanLevel": "clan_level",
	} {
		got, err := clanChangeStorageType(apiType)
		if err != nil || got != storageType {
			t.Fatalf("storage type %q = %q, %v", apiType, got, err)
		}
	}
	for _, unsupported := range []string{"name", "warLeague", "capitalLeague"} {
		if _, err := clanChangeStorageType(unsupported); err == nil {
			t.Fatalf("unsupported clan change type %q unexpectedly succeeded", unsupported)
		}
	}
}

func TestClanChangeQueryOptionsUsesSharedTimeAndLimits(t *testing.T) {
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/", func(c *fiber.Ctx) error {
		storageType, after, before, limit, err := clanChangeQueryOptions(c)
		if err != nil {
			return err
		}
		return c.JSON(fiber.Map{"type": storageType, "after": after, "before": before, "limit": limit})
	})
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/?type=clanLevel&time%5Bafter%5D=2026-08-01T00%3A00%3A00Z&time%5Bbefore%5D=2026-08-31T00%3A00%3A00Z&limit=700", nil))
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("valid clan change options failed: status=%d err=%v", response.StatusCode, err)
	}
	var body struct {
		Type   string    `json:"type"`
		After  time.Time `json:"after"`
		Before time.Time `json:"before"`
		Limit  int       `json:"limit"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Type != "clan_level" || body.Limit != 500 || body.After.Day() != 1 || body.Before.Day() != 31 {
		t.Fatalf("unexpected clan change options: %#v", body)
	}
	for _, path := range []string{"/?type=name", "/?limit=0", "/?time%5Bafter%5D=bad"} {
		response, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil || response.StatusCode != http.StatusBadRequest {
			t.Fatalf("invalid options %s: status=%d err=%v", path, response.StatusCode, err)
		}
	}
}

func TestClanChangesHandlerQueriesAndSerializesTypedValues(t *testing.T) {
	eventTime := time.Date(2026, 8, 20, 12, 0, 0, 0, time.UTC)
	db := &clanChangesTestDB{rows: &clanChangesTestRows{items: []clanChangesTestRow{{
		time: eventTime, changeType: "clan_level", previous: []byte(`19`), current: []byte(`20`),
	}}}}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/clan/:clan_tag/history/changes", clanChangesHandler(db))
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/v2/clan/%23CLAN/history/changes?type=clanLevel&time%5Bafter%5D=2026-08-01T00%3A00%3A00Z&time%5Bbefore%5D=2026-08-31T00%3A00%3A00Z&limit=25", nil))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("clan changes status = %d", response.StatusCode)
	}
	if len(db.args) != 5 || db.args[0] != "#CLAN" || db.args[1] != "clan_level" || db.args[4] != 25 {
		t.Fatalf("unexpected clan changes query args: %#v", db.args)
	}
	if !strings.Contains(db.query, "change_type IN ('description', 'clan_level')") {
		t.Fatalf("clan changes query does not exclude league changes: %s", db.query)
	}
	var body modelsv2.ClanChangesResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 1 || body.Items[0].Type != "clanLevel" {
		t.Fatalf("unexpected clan changes response: %#v", body)
	}
	if body.Items[0].Previous != float64(19) || body.Items[0].Current != float64(20) {
		t.Fatalf("unexpected clan-level values: %#v", body.Items[0])
	}
}

func TestMergeClanWarLogItemsPrefersOfficialAndAppliesWarLimit(t *testing.T) {
	official := clanWarLogItem{EndTime: "20260803T120000.000Z", Type: "random", Opponent: clanWarLogClanSide{Tag: "#A"}, Clan: clanWarLogClanSide{Name: "Official"}}
	duplicate := official
	duplicate.Clan.Name = "Stored"
	older := clanWarLogItem{EndTime: "20260703T120000.000Z", Type: "cwl", Opponent: clanWarLogClanSide{Tag: "#B"}}
	items := mergeClanWarLogItems([]clanWarLogItem{official}, []clanWarLogItem{duplicate, older}, 1)
	if len(items) != 1 || items[0].Clan.Name != "Official" {
		t.Fatalf("unexpected merged war log: %#v", items)
	}
}

func TestClanWarLogHandlerUsesStoredWarsWithoutAuthentication(t *testing.T) {
	attacks := 2
	var gotTag string
	var gotTypes []string
	var gotLimit int
	loader := func(_ *fiber.Ctx, _ apptypes.Deps, tag string, _, _ time.Time, types []string, limit int) ([]officialWarResponse, error) {
		gotTag, gotTypes, gotLimit = tag, types, limit
		return []officialWarResponse{{
			WarType: "friendly", State: "warEnded", EndTime: "20260820T120000.000Z", TeamSize: 15, AttacksPerMember: &attacks,
			Clan: officialWarClan{Tag: "#CLAN", Stars: 40}, Opponent: officialWarClan{Tag: "#OTHER", Stars: 38},
		}}, nil
	}
	app := fiber.New(fiber.Config{ErrorHandler: apptypes.ErrorHandler})
	app.Get("/v2/clan/:clan_tag/warlog", clanWarLogHandler(apptypes.Deps{}, loader))
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/v2/clan/%23CLAN/warlog?type=friendly&time%5Bafter%5D=2026-08-01T00%3A00%3A00Z&limit=20", nil))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || gotTag != "#CLAN" || len(gotTypes) != 1 || gotTypes[0] != "friendly" || gotLimit != 20 {
		t.Fatalf("stored warlog request: status=%d tag=%q types=%v limit=%d", response.StatusCode, gotTag, gotTypes, gotLimit)
	}
	var body clanWarLogResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if !body.IsPrivate || !body.Reconstructed || len(body.Items) != 1 || body.Items[0].Type != "friendly" || body.Items[0].Result != "win" {
		t.Fatalf("unexpected stored warlog response: %#v", body)
	}
	response, err = app.Test(httptest.NewRequest(http.MethodGet, "/v2/clan/%23CLAN/warlog", nil))
	if err != nil || response.StatusCode != http.StatusOK || len(gotTypes) != 3 || gotLimit != 50 {
		t.Fatalf("default stored warlog request: status=%d types=%v limit=%d err=%v", response.StatusCode, gotTypes, gotLimit, err)
	}
	for _, path := range []string{
		"/v2/clan/%23CLAN/warlog?type=league",
		"/v2/clan/%23CLAN/warlog?limit=0",
		"/v2/clan/%23CLAN/warlog?time%5Bafter%5D=bad",
		"/v2/clan/%23/warlog",
	} {
		response, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil || response.StatusCode != http.StatusBadRequest {
			t.Fatalf("invalid stored warlog request %s: status=%d err=%v", path, response.StatusCode, err)
		}
	}
}

func TestFetchOfficialClanWarLogFiltersTimeAndLabelsRandomWars(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.URL.EscapedPath() != "/v1/clans/%23CLAN/warlog" || request.URL.Query().Get("limit") != "50" {
			t.Errorf("unexpected official warlog request: %s", request.URL.String())
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"items":[{"result":"win","endTime":"20260820T120000.000Z","teamSize":15,"clan":{"tag":"#CLAN"},"opponent":{"tag":"#A"}},{"result":"lose","endTime":"20260720T120000.000Z","teamSize":15,"clan":{"tag":"#CLAN"},"opponent":{"tag":"#B"}}]}`)
	}))
	defer upstream.Close()

	app := fiber.New()
	app.Get("/", func(c *fiber.Ctx) error {
		items, ok := fetchOfficialClanWarLog(c, apptypes.Deps{Config: apptypes.Config{ProxyOrigin: upstream.URL}}, "#CLAN", time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC), 50)
		return c.JSON(fiber.Map{"items": items, "ok": ok})
	})
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/", nil))
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("official warlog request failed: status=%d err=%v", response.StatusCode, err)
	}
	var body struct {
		Items []clanWarLogItem `json:"items"`
		OK    bool             `json:"ok"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if !body.OK || len(body.Items) != 1 || body.Items[0].Type != "random" || body.Items[0].Opponent.Tag != "#A" {
		t.Fatalf("unexpected official warlog: %#v", body)
	}
}

func TestOfficialArchiveWarCarriesInternalWarType(t *testing.T) {
	war := wararchive.War{Type: "friendly", State: "warEnded", Clan: wararchive.Clan{Tag: "#CLAN"}, Opponent: wararchive.Clan{Tag: "#OTHER"}}
	if item := buildOfficialArchiveWar(war, "#CLAN"); item.WarType != "friendly" {
		t.Fatalf("archive war type = %q", item.WarType)
	}
}
