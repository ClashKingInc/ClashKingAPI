package routes

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

const searchTestEncryptionKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="

func TestNormalizePlayerSearchQueryUsesDiscreteTownhallsAndCapsLists(t *testing.T) {
	request := modelsv2.SearchPlayerQuery{
		Query: "  Magic  ",
		Filters: modelsv2.SearchPlayerFilters{
			ClanTags:       []string{"vy2j0ll", "#VY2J0LL"},
			LeagueIDs:      []int{105000035, 105000034, 105000035},
			TownhallLevels: []int{17, 1, 17, 100},
		},
	}
	limit, err := normalizePlayerSearchQuery(&request)
	if err != nil {
		t.Fatalf("normalize player query: %v", err)
	}
	if limit != searchDefaultLimit || request.Query != "Magic" {
		t.Fatalf("unexpected normalized request: %#v", request)
	}
	if got := strings.Join(request.Filters.ClanTags, ","); got != "#VY2J0LL" {
		t.Fatalf("unexpected clan tags %q", got)
	}
	if got := request.Filters.LeagueIDs; len(got) != 2 || got[0] != 105000034 || got[1] != 105000035 {
		t.Fatalf("unexpected league ids %#v", got)
	}
	if got := request.Filters.TownhallLevels; len(got) != 3 || got[0] != 1 || got[1] != 17 || got[2] != 100 {
		t.Fatalf("unexpected townhall levels %#v", got)
	}

	for _, unsupported := range []int{0, 101} {
		request.Filters.TownhallLevels = []int{unsupported}
		if _, err := normalizePlayerSearchQuery(&request); err == nil {
			t.Fatalf("expected townhall level %d to be rejected", unsupported)
		}
	}
}

func TestNormalizeSearchQueryEnforcesFilterCaps(t *testing.T) {
	for name, filters := range map[string]modelsv2.SearchClanFilters{
		"location ids":   {LocationIDs: []int{1, 2, 3, 4, 5, 6}},
		"CWL league ids": {CWLLeagueIDs: []int{1, 2, 3, 4, 5, 6}},
	} {
		clan := modelsv2.SearchClanQuery{Query: "Clan", Filters: filters}
		if _, err := normalizeClanSearchQuery(&clan); err == nil {
			t.Fatalf("expected too many %s to be rejected", name)
		}
	}

	for name, filters := range map[string]modelsv2.SearchPlayerFilters{
		"clan tags":  {ClanTags: make([]string, 101)},
		"league ids": {LeagueIDs: []int{1, 2, 3, 4, 5, 6}},
	} {
		player := modelsv2.SearchPlayerQuery{Query: "Player", Filters: filters}
		if _, err := normalizePlayerSearchQuery(&player); err == nil {
			t.Fatalf("expected too many %s to be rejected", name)
		}
	}
}

func TestSearchResultJSONUsesCompactBadgeAndRequestedFieldOrder(t *testing.T) {
	clanRaw, err := json.Marshal(modelsv2.SearchClanResult{
		Name: "Clan", Tag: "#VY2J0LL", Badge: "badge.png", ClanLevel: 25, Members: 50,
	})
	if err != nil {
		t.Fatalf("marshal clan: %v", err)
	}
	assertJSONFieldOrder(t, string(clanRaw), []string{`"name"`, `"tag"`, `"badge"`, `"clanLevel"`, `"members"`})
	if strings.Contains(string(clanRaw), "badgeUrls") {
		t.Fatalf("unexpected expanded badge object: %s", clanRaw)
	}

	playerRaw, err := json.Marshal(modelsv2.SearchPlayerResult{
		Name: "Player", Tag: "#2PP", Clan: &modelsv2.SearchPlayerClan{Name: "Clan", Tag: "#VY2J0LL", Badge: "badge.png"},
		LeagueTier: &modelsv2.SearchLeagueReference{ID: 105000034, Name: "Legend League"},
	})
	if err != nil {
		t.Fatalf("marshal player: %v", err)
	}
	assertJSONFieldOrder(t, string(playerRaw), []string{`"name"`, `"tag"`, `"leagueTier"`, `"clan"`})
	clanStart := strings.Index(string(playerRaw), `"clan"`)
	assertJSONFieldOrder(t, string(playerRaw)[clanStart:], []string{`"name"`, `"tag"`, `"badge"`})
	if strings.Contains(string(playerRaw), `"leagueTier":{"id":105000034,"name":"Legend League","badge"`) {
		t.Fatalf("league tier must not contain a badge: %s", playerRaw)
	}
}

func TestPlayerSearchPaginatesWithEncryptedPITCursorAndEnrichesClan(t *testing.T) {
	if err := apptypes.InitEncryption(searchTestEncryptionKey); err != nil {
		t.Fatalf("initialize encryption: %v", err)
	}
	var mu sync.Mutex
	searchCalls := 0
	closedPIT := ""
	elasticsearch := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/players/_pit":
			_, _ = io.WriteString(w, `{"id":"pit-1"}`)
		case r.Method == http.MethodPost && r.URL.Path == "/_search":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode search body: %v", err)
			}
			mu.Lock()
			searchCalls++
			call := searchCalls
			mu.Unlock()
			pit := body["pit"].(map[string]any)["id"]
			if call == 1 {
				if pit != "pit-1" || body["size"] != float64(2) {
					t.Errorf("unexpected first page body: %#v", body)
				}
				_, _ = io.WriteString(w, `{"pit_id":"pit-2","hits":{"hits":[`+
					`{"_source":{"tag":"#8GLYGGJQ","name":"Magic","league_id":105000034,"clan_tag":"#VY2J0LL","townhall_level":17},"sort":[9.5,"#8glyggjq"]},`+
					`{"_source":{"tag":"#2PP","name":"Magic Two","townhall_level":16},"sort":[8.2,"#2pp"]}`+
					`]}}`)
				return
			}
			if pit != "pit-2" || body["search_after"] == nil {
				t.Errorf("unexpected continuation body: %#v", body)
			}
			_, _ = io.WriteString(w, `{"pit_id":"pit-3","hits":{"hits":[`+
				`{"_source":{"tag":"#2PP","name":"Magic Two","league_id":105000035,"townhall_level":16},"sort":[8.2,"#2pp"]}`+
				`]}}`)
		case r.Method == http.MethodPost && r.URL.Path == "/clans/_mget":
			if got := r.URL.Query().Get("_source_includes"); got != "tag,name,clan_level,badge_token" {
				t.Errorf("unexpected mget source filter %q", got)
			}
			_, _ = io.WriteString(w, `{"docs":[{"_id":"#VY2J0LL","found":true,"_source":{"tag":"#VY2J0LL","name":"Clash King","clan_level":27,"badge_token":"badge-token"}}]}`)
		case r.Method == http.MethodDelete && r.URL.Path == "/_pit":
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			closedPIT = body["id"]
			_, _ = io.WriteString(w, `{"succeeded":true}`)
		default:
			t.Errorf("unexpected Elasticsearch request %s %s", r.Method, r.URL.String())
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer elasticsearch.Close()

	search, err := apptypes.NewElasticsearchAdapter(apptypes.Config{
		ElasticsearchURL: elasticsearch.URL, ElasticsearchPlayersAlias: "players", ElasticsearchClansAlias: "clans",
	})
	if err != nil {
		t.Fatalf("create search adapter: %v", err)
	}
	clash, err := apptypes.NewClashAdapter(context.Background(), elasticsearch.URL)
	if err != nil {
		t.Fatalf("create Clash adapter: %v", err)
	}
	defer clash.Close()

	app := fiber.New(fiber.Config{RequestMethods: apptypes.APIRequestMethods(), ErrorHandler: apptypes.ErrorHandler})
	app.Add(apptypes.MethodQuery, "/v2/search/player", searchPlayers(apptypes.Deps{Search: search, Clash: clash}))
	first := searchTestRequest(t, app, "/v2/search/player", `{"query":"Magic","filters":{"clan_tags":["#VY2J0LL"],"league_ids":[105000034],"townhall_levels":[17]},"limit":1}`)
	if first.StatusCode != http.StatusOK {
		t.Fatalf("first page status = %d, body = %s", first.StatusCode, first.Body)
	}
	if len(first.Response.Items) != 1 || first.Response.Items[0].Clan == nil || first.Response.Items[0].Clan.Name != "Clash King" {
		t.Fatalf("unexpected first page: %#v", first.Response)
	}
	if first.Response.Items[0].LeagueTier == nil || first.Response.Items[0].LeagueTier.ID != 105000034 || first.Response.Items[0].LeagueTier.Name == "" {
		t.Fatalf("expected fleshed league tier: %#v", first.Response.Items[0].LeagueTier)
	}
	if first.Response.Pagination.NextCursor == nil || !first.Response.Pagination.HasMore {
		t.Fatalf("expected continuation cursor: %#v", first.Response.Pagination)
	}

	secondBody := `{"query":"Magic","filters":{"clan_tags":["#VY2J0LL"],"league_ids":[105000034],"townhall_levels":[17]},"limit":1,"cursor":` + mustJSON(t, *first.Response.Pagination.NextCursor) + `}`
	second := searchTestRequest(t, app, "/v2/search/player", secondBody)
	if second.StatusCode != http.StatusOK || second.Response.Pagination.HasMore || second.Response.Pagination.NextCursor != nil {
		t.Fatalf("unexpected second page: status=%d body=%s", second.StatusCode, second.Body)
	}
	if closedPIT != "pit-3" {
		t.Fatalf("closed PIT = %q, want pit-3", closedPIT)
	}
}

func TestClanSearchUsesAliasFiltersAndOfficialReferenceShapes(t *testing.T) {
	var searchBody map[string]any
	closedPIT := ""
	elasticsearch := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/clans/_pit":
			if got := r.URL.Query().Get("keep_alive"); got != searchPITKeepAlive {
				t.Errorf("PIT keep_alive = %q", got)
			}
			_, _ = io.WriteString(w, `{"id":"clan-pit"}`)
		case r.Method == http.MethodPost && r.URL.Path == "/_search":
			if err := json.NewDecoder(r.Body).Decode(&searchBody); err != nil {
				t.Errorf("decode search body: %v", err)
			}
			_, _ = io.WriteString(w, `{"hits":{"hits":[{"_source":{"tag":"#VY2J0LL","name":"Clash King","clan_level":27,"badge_token":"badge-token","location_id":32000249,"cwl_league_id":48000018,"member_count":49},"sort":[9.5,"#vy2j0ll"]}]}}`)
		case r.Method == http.MethodDelete && r.URL.Path == "/_pit":
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			closedPIT = body["id"]
			_, _ = io.WriteString(w, `{"succeeded":true}`)
		default:
			t.Errorf("unexpected Elasticsearch request %s %s", r.Method, r.URL.String())
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer elasticsearch.Close()

	search, err := apptypes.NewElasticsearchAdapter(apptypes.Config{
		ElasticsearchURL: elasticsearch.URL, ElasticsearchPlayersAlias: "players", ElasticsearchClansAlias: "clans",
	})
	if err != nil {
		t.Fatalf("create search adapter: %v", err)
	}
	clash, err := apptypes.NewClashAdapter(context.Background(), elasticsearch.URL)
	if err != nil {
		t.Fatalf("create Clash adapter: %v", err)
	}
	defer clash.Close()

	app := fiber.New(fiber.Config{RequestMethods: apptypes.APIRequestMethods(), ErrorHandler: apptypes.ErrorHandler})
	app.Add(apptypes.MethodQuery, "/v2/search/clan", searchClans(apptypes.Deps{Search: search, Clash: clash}))
	req := httptest.NewRequest(apptypes.MethodQuery, "/v2/search/clan", strings.NewReader(`{"query":"Clash","filters":{"location_ids":[32000249],"cwl_league_ids":[48000018],"clan_level":{"min":20},"members":{"min":40,"max":50}}}`))
	req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("execute request: %v", err)
	}
	defer resp.Body.Close()
	var result modelsv2.SearchClanResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.StatusCode != http.StatusOK || len(result.Items) != 1 {
		t.Fatalf("unexpected response status=%d body=%#v", resp.StatusCode, result)
	}
	item := result.Items[0]
	if item.Location == nil || item.Location.Name != "United States" || item.Location.CountryCode != "US" || !item.Location.IsCountry {
		t.Fatalf("location was not fleshed out: %#v", item.Location)
	}
	if item.WarLeague == nil || item.WarLeague.ID != 48000018 || item.WarLeague.Name != "Champion League I" {
		t.Fatalf("war league was not fleshed out: %#v", item.WarLeague)
	}
	if item.Badge != badgeURL("badge-token", 512) {
		t.Fatalf("badge = %q", item.Badge)
	}
	if result.Pagination.Limit != searchDefaultLimit || result.Pagination.HasMore || result.Pagination.NextCursor != nil {
		t.Fatalf("unexpected pagination: %#v", result.Pagination)
	}
	if closedPIT != "clan-pit" {
		t.Fatalf("closed PIT = %q", closedPIT)
	}
	query := searchBody["query"].(map[string]any)["bool"].(map[string]any)
	filters, ok := query["filter"].([]any)
	if !ok || len(filters) != 4 {
		t.Fatalf("expected all clan filters in Elasticsearch query: %#v", query["filter"])
	}
}

type searchPlayerTestResponse struct {
	StatusCode int
	Body       string
	Response   modelsv2.SearchPlayerResponse
}

func searchTestRequest(t *testing.T, app *fiber.App, path, body string) searchPlayerTestResponse {
	t.Helper()
	req := httptest.NewRequest(apptypes.MethodQuery, path, strings.NewReader(body))
	req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("execute request: %v", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	result := searchPlayerTestResponse{StatusCode: resp.StatusCode, Body: string(raw)}
	if resp.StatusCode == http.StatusOK {
		if err := json.Unmarshal(raw, &result.Response); err != nil {
			t.Fatalf("decode response: %v", err)
		}
	}
	return result
}

func mustJSON(t *testing.T, value string) string {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal value: %v", err)
	}
	return string(raw)
}
