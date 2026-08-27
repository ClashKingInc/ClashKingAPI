package routes

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/ClashKingInc/ClashKingAPI/internal/wararchive"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
)

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

func TestClanChangeValuesUsePrimitivesAndLeagueReferences(t *testing.T) {
	references := referenceCatalog{
		warLeagues: map[int]modelsv2.LeagueReference{
			48000014: {ID: 48000014, Name: "Crystal League I"},
		},
		capitalLeagues: map[int]modelsv2.LeagueReference{
			85000015: {ID: 85000015, Name: "Gold League II"},
		},
	}
	tests := []struct {
		changeType string
		raw        string
		want       any
	}{
		{changeType: "description", raw: `"Old description"`, want: "Old description"},
		{changeType: "clan_level", raw: `19`, want: 19},
		{changeType: "cwl_league_id", raw: `48000014`, want: modelsv2.LeagueReference{ID: 48000014, Name: "Crystal League I"}},
		{changeType: "capital_league_id", raw: `85000015`, want: modelsv2.LeagueReference{ID: 85000015, Name: "Gold League II"}},
	}
	for _, test := range tests {
		got, err := clanChangeValue(test.changeType, []byte(test.raw), references)
		if err != nil {
			t.Fatalf("change value %s: %v", test.changeType, err)
		}
		if got != test.want {
			t.Fatalf("change value %s = %#v, want %#v", test.changeType, got, test.want)
		}
	}
}

func TestClanChangeStorageTypesAreLimitedToDocumentedOptions(t *testing.T) {
	for apiType, storageType := range map[string]string{
		"": "", "description": "description", "clanLevel": "clan_level",
		"warLeague": "cwl_league_id", "capitalLeague": "capital_league_id",
	} {
		got, err := clanChangeStorageType(apiType)
		if err != nil || got != storageType {
			t.Fatalf("storage type %q = %q, %v", apiType, got, err)
		}
	}
	if _, err := clanChangeStorageType("name"); err == nil {
		t.Fatal("unsupported clan change type unexpectedly succeeded")
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
	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/?type=warLeague&time%5Bafter%5D=2026-08-01T00%3A00%3A00Z&time%5Bbefore%5D=2026-08-31T00%3A00%3A00Z&limit=700", nil))
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
	if body.Type != "cwl_league_id" || body.Limit != 500 || body.After.Day() != 1 || body.Before.Day() != 31 {
		t.Fatalf("unexpected clan change options: %#v", body)
	}
	for _, path := range []string{"/?type=name", "/?limit=0", "/?time%5Bafter%5D=bad"} {
		response, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil || response.StatusCode != http.StatusBadRequest {
			t.Fatalf("invalid options %s: status=%d err=%v", path, response.StatusCode, err)
		}
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
