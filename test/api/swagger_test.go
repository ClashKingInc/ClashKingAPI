package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	"github.com/ClashKingInc/ClashKingAPI/internal/swaggerdocs"
	"github.com/gofiber/fiber/v2"
)

func TestEnsureSwaggerSecurityDefinitionAddsAuthorizationScheme(t *testing.T) {
	doc := map[string]any{}

	swaggerdocs.EnsureSecurityDefinition(doc)

	securityDefinitions, ok := doc["securityDefinitions"].(map[string]any)
	if !ok {
		t.Fatal("expected securityDefinitions to be added")
	}
	apiKey, ok := securityDefinitions["ApiKeyAuth"].(map[string]any)
	if !ok {
		t.Fatal("expected ApiKeyAuth definition to be added")
	}
	if apiKey["name"] != "Authorization" {
		t.Fatalf("expected Authorization header name, got %v", apiKey["name"])
	}
}

func TestScalarUIHandlerServesDefaultDocs(t *testing.T) {
	app := fiber.New()
	app.Get("/", swaggerdocs.NewScalarHandler("/openapi.json"))
	app.Get("/docs", swaggerdocs.NewScalarHandler("/openapi.json"))

	for _, path := range []string{"/", "/docs"} {
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil {
			t.Fatalf("request %s failed: %v", path, err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d", path, resp.StatusCode)
		}
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatalf("read %s body: %v", path, err)
		}
		html := string(body)
		for _, marker := range []string{
			`id="api-reference"`,
			`data-url="/openapi.json"`,
			`https://cdn.jsdelivr.net/npm/@scalar/api-reference`,
			`theme: "deepSpace"`,
			`layout: "modern"`,
		} {
			if !strings.Contains(html, marker) {
				t.Fatalf("expected Scalar html for %s to contain %q", path, marker)
			}
		}
	}
}

func TestSwaggerUIHandlersServeAssetsIndependently(t *testing.T) {
	app := fiber.New()
	app.Get("/swagger/*", swaggerdocs.NewUIHandler("/openapi.json"))

	for _, path := range []string{
		"/swagger/index.html",
		"/swagger/swagger-ui.css",
		"/swagger/swagger-ui-bundle.js",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("request %s failed: %v", path, err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d", path, resp.StatusCode)
		}
	}
}

func TestSwaggerUIOrdersLinksBookmarksAfterAccounts(t *testing.T) {
	app := fiber.New()
	app.Get("/swagger/*", swaggerdocs.NewUIHandler("/openapi.json"))

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/swagger/index.html", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	html := string(body)
	for _, marker := range []string{
		"operationsSorter: function(a, b)",
		"PUT /v2/links/{id}/order",
		"DELETE /v2/links/{id}/{playerTag}",
		"GET /v2/links/{id}/bookmarks",
		"DELETE /v2/links/{id}/bookmarks/{type}/{tag}",
		"GET /v2/links/{id}/searches",
	} {
		if !strings.Contains(html, marker) {
			t.Fatalf("expected swagger UI html to contain %q", marker)
		}
	}
}

func TestBuildDocIncludesPublicAndAuthenticatedOperations(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)

	if _, exists := paths["/v2/public"]; !exists {
		t.Fatal("expected unauthenticated /v2/public operation in swagger")
	}

	authPath, exists := paths["/v2/me"]
	if !exists {
		t.Fatal("expected authenticated /v2/me operation in swagger")
	}
	get, ok := authPath.(map[string]any)["get"].(map[string]any)
	if !ok {
		t.Fatal("expected /v2/me get operation")
	}
	security, ok := get["security"].([]any)
	if !ok || len(security) == 0 {
		t.Fatal("expected /v2/me to preserve ApiKeyAuth security marker")
	}
}

func TestLinksSearchOpenAPICleansRecentAndBookmarkShapes(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)
	if _, exists := paths["/v2/search/{id}/items"]; exists {
		t.Fatal("expected old query-driven search items endpoint to be absent")
	}
	if _, exists := paths["/v2/users/coc-accounts"]; exists {
		t.Fatal("expected old coc accounts endpoint to be absent")
	}
	if _, exists := paths["/v2/links/{id}/searches"]; !exists {
		t.Fatal("expected grouped recent searches endpoint")
	}

	definitions := swaggerDefinitions(t, doc)
	groupedProps := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchRecentGroupedResponse")
	assertArrayItemsRef(t, groupedProps["players"], "#/definitions/modelsv2.SearchRecentPlayerItem")
	assertArrayItemsRef(t, groupedProps["clans"], "#/definitions/modelsv2.SearchRecentClanItem")

	playerProps := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchRecentPlayerItem")
	for _, field := range []string{"type", "player_tag", "clan_tag"} {
		if _, exists := playerProps[field]; exists {
			t.Fatalf("expected SearchRecentPlayerItem not to expose stale field %s", field)
		}
	}
	for _, field := range []string{"name", "tag", "townHallLevel", "clan", "league", "created_at"} {
		if _, exists := playerProps[field]; !exists {
			t.Fatalf("expected SearchRecentPlayerItem to expose %s", field)
		}
	}
	for _, field := range []string{"badgeUrls", "members"} {
		if _, exists := playerProps[field]; exists {
			t.Fatalf("expected SearchRecentPlayerItem not to expose clan-only field %s", field)
		}
	}
	assertRef(t, playerProps["clan"], "#/definitions/modelsv2.SearchRecentClan")
	assertRef(t, playerProps["league"], "#/definitions/modelsv2.SearchRecentLeague")

	clanItemProps := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchRecentClanItem")
	for _, field := range []string{"type", "player_tag", "clan_tag", "townHallLevel", "clan", "league"} {
		if _, exists := clanItemProps[field]; exists {
			t.Fatalf("expected SearchRecentClanItem not to expose player-only/stale field %s", field)
		}
	}
	for _, field := range []string{"name", "tag", "badgeUrls", "members", "created_at"} {
		if _, exists := clanItemProps[field]; !exists {
			t.Fatalf("expected SearchRecentClanItem to expose %s", field)
		}
	}
	assertRef(t, clanItemProps["badgeUrls"], "#/definitions/modelsv2.SearchRecentBadgeURLs")

	badgeProps := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchRecentBadgeURLs")
	if _, exists := badgeProps["large"]; !exists {
		t.Fatal("expected recent badgeUrls schema to expose large")
	}
	if _, exists := definitions["modelsv2.SearchRecentBadgeURLs"].(map[string]any)["additionalProperties"]; exists {
		t.Fatal("expected recent badgeUrls schema not to use additionalProperties")
	}
	recentClanProps := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchRecentClan")
	assertRef(t, recentClanProps["badgeUrls"], "#/definitions/modelsv2.SearchRecentBadgeURLs")
	leagueProps := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchRecentLeague")
	assertRef(t, leagueProps["iconUrls"], "#/definitions/modelsv2.SearchRecentLeagueIconURLs")

	for _, name := range []string{"modelsv2.SearchBookmarkRequest", "modelsv2.SearchBookmarkOrderRequest", "modelsv2.SearchBookmarkItem"} {
		props := swaggerDefinitionProperties(t, definitions, name)
		assertEnum(t, props["type"], []any{"player", "clan"})
	}

	getBookmarks := paths["/v2/links/{id}/bookmarks"].(map[string]any)["get"].(map[string]any)
	assertParameterEnum(t, getBookmarks["parameters"], "type", []any{"player", "clan"})
	deleteBookmark := paths["/v2/links/{id}/bookmarks/{type}/{tag}"].(map[string]any)["delete"].(map[string]any)
	assertParameterEnum(t, deleteBookmark["parameters"], "type", []any{"player", "clan"})
}

func TestBuildDocOmitsRemovedRoutesAndKeepsV2JoinLeave(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)

	absent := []string{
		"/v1/{path}",
		"/ck/bulk",
		"/assets",
		"/json/{data_type}",
		"/activity",
		"/boost-rate",
		"/clan-games",
		"/donations",
		"/permalink/{clan_tag}",
		"/v2/clan/{clan_tag}/ranking",
		"/clan/{clan_tag}/badge",
		"/clan/{clan_tag}/basic",
		"/clan/{clan_tag}/wars",
		"/clan/{clan_tag}/join-leave",
		"/clan/search",
		"/clan/{clan_tag}/historical",
		"/capital",
		"/capital/bulk",
		"/capital/stats/district",
		"/capital/stats/leagues",
		"/capital/{clan_tag}",
		"/legends/clan/{clan_tag}/{date}",
		"/legends/eos-winners",
		"/legends/streaks",
		"/legends/trophy-buckets",
		"/ranking/live/legends",
		"/ranking/legends/{player_tag}",
		"/player/full-search/{name}",
		"/player/search/{name}",
		"/player/to-do",
		"/player/{player_tag}/historical/{season}",
		"/player/{player_tag}/join-leave",
		"/player/{player_tag}/join-leave/totals",
		"/player/{player_tag}/join-leave/shared",
		"/player/{player_tag}/legend_rankings",
		"/player/{player_tag}/legends",
		"/player/{player_tag}/raids",
		"/player/{player_tag}/stats",
		"/player/{player_tag}/warhits",
		"/player/{player_tag}/war/attacks",
		"/player/{player_tag}/war/stats",
		"/player/{player_tag}/wartimer",
		"/v2/capital/guild-leaderboard",
		"/v2/capital/player-stats",
		"/v2/clan/compo",
		"/v2/clan/donations/{season}",
		"/v2/clan/{clan_tag}/board/totals",
		"/v2/clan/{clan_tag}/donations/{season}",
		"/v2/clan/{clan_tag}/details",
		"/v2/clans/capital-raids",
		"/v2/clans/details",
		"/v2/inactive-players",
		"/v2/activity/inactive-players",
		"/v2/legends/daily-tracking",
		"/v2/legends/guild-stats",
		"/v2/legends/players/day/{day}",
		"/v2/legends/players/season/{season}",
		"/v2/player/{player_tag}/extended",
		"/v2/players",
		"/v2/players/extended",
		"/v2/players/legend-days",
		"/v2/players/legend_rankings",
		"/v2/players/location",
		"/v2/players/sorted/{attribute}",
		"/v2/players/summary/{season}/top",
		"/v2/search/{id}/items",
		"/server-settings/{server_id}",
		"/guild_links/{guild_id}",
		"/shortner",
		"/shortlink",
		"/war-stats",
		"/bot/config",
		"/ranking/player-trophies/{location}/{date}",
		"/ranking/player-builder/{location}/{date}",
		"/ranking/clan-trophies/{location}/{date}",
		"/ranking/clan-builder/{location}/{date}",
		"/ranking/clan-capital/{location}/{date}",
		"/v2/categories",
		"/v2/static/categories",
		"/v2/static/app-bundle",
		"/v2/static/app-translations",
		"/v2/{category}/names",
		"/v2/{category}/{item_id_or_name}/maxlevel",
		"/v2/static/{category}/{item_id_or_name}/maxlevel",
		"/v2/internal/bot/info",
		"/v2/{category}/{item_id_or_name}",
		"/v2/static/{category}/{item_id_or_name}",
		"/v2/{category}",
		"/v2/static/{category}",
		"/war/{clan_tag}/previous",
		"/war/{clan_tag}/previous/{end_time}",
		"/cwl/{clan_tag}/group",
		"/cwl/{clan_tag}/{season}",
		"/v2/links/{id}/{player_tag}",
	}
	for _, path := range absent {
		if _, exists := paths[path]; exists {
			t.Fatalf("expected %s to be absent from swagger", path)
		}
	}

	for _, path := range []string{
		"/v2/clan/{clan_tag}/join-leave",
		"/v2/player/{player_tag}/join-leave",
		"/v2/player/{player_tag}/join-leave/totals",
		"/v2/player/{player_tag}/join-leave/shared",
		"/v2/clan/{clan_tag}/badge",
		"/v2/links/{id}/searches",
		"/v2/links/{id}/{playerTag}",
		"/builderbaseleagues",
		"/war/{clanTag}/previous",
		"/war/{clanTag}/basic",
		"/cwl/{clanTag}/group",
		"/cwl/{clanTag}/{season}",
		"/list/townhalls",
		"/list/seasons",
		"/v2/ranking/player-trophies/{location}/{date}",
		"/v2/ranking/player-builder/{location}/{date}",
		"/v2/ranking/clan-trophies/{location}/{date}",
		"/v2/ranking/clan-builder/{location}/{date}",
		"/v2/ranking/clan-capital/{location}/{date}",
		"/v2/cdn/upload",
		"/v2/exports/war/cwl-summary",
		"/v2/exports/war/player-stats",
		"/v2/guild/{server_id}",
		"/v2/guilds",
		"/v2/enums",
		"/v2/enums/role-types",
		"/v2/enums/role-modes",
		"/v2/enums/log-types",
		"/v2/enums/countdown-types",
		"/v2/static/{category}/names",
		"/v2/static/{category}/{item_id_or_name}/max-level",
		"/v2/server/{server_id}/server-roles",
		"/v2/server/{server_id}/server-roles/{role_id}",
	} {
		if _, exists := paths[path]; !exists {
			t.Fatalf("expected %s to remain in swagger", path)
		}
	}

	previous := paths["/war/{clanTag}/previous"].(map[string]any)["get"].(map[string]any)
	params, _ := previous["parameters"].([]any)
	assertRequiredParameter(t, params, "endTime", "query")
	assertRequiredParameter(t, params, "clanTag", "path")

	builderBaseLeagues := paths["/builderbaseleagues"].(map[string]any)["get"].(map[string]any)
	assertTags(t, builderBaseLeagues, []string{"Other"})
	for _, path := range []string{"/war/{clanTag}/previous", "/war/{clanTag}/basic", "/cwl/{clanTag}/group", "/cwl/{clanTag}/{season}"} {
		operation := paths[path].(map[string]any)["get"].(map[string]any)
		assertTags(t, operation, []string{"War"})
	}
	for _, path := range []string{"/list/townhalls", "/list/seasons"} {
		operation := paths[path].(map[string]any)["get"].(map[string]any)
		assertTags(t, operation, []string{"Lists"})
	}
	for _, path := range []string{"/v2/ranking/player-trophies/{location}/{date}", "/v2/ranking/player-builder/{location}/{date}", "/v2/ranking/clan-trophies/{location}/{date}", "/v2/ranking/clan-builder/{location}/{date}", "/v2/ranking/clan-capital/{location}/{date}"} {
		operation := paths[path].(map[string]any)["get"].(map[string]any)
		assertTags(t, operation, []string{"Rankings"})
	}
	for _, path := range []string{"/v2/cdn/upload", "/v2/exports/war/cwl-summary", "/v2/exports/war/player-stats", "/v2/guild/{server_id}", "/v2/guilds"} {
		method := "get"
		if path == "/v2/cdn/upload" || path == "/v2/exports/war/player-stats" {
			method = "post"
		}
		operation := paths[path].(map[string]any)[method].(map[string]any)
		assertTags(t, operation, []string{"Other"})
	}

	definitions, ok := doc["definitions"].(map[string]any)
	if !ok {
		t.Fatal("expected swagger definitions")
	}
	joinLeaveResponse, ok := definitions["modelsv2.JoinLeaveResponse"].(map[string]any)
	if !ok {
		t.Fatal("expected JoinLeaveResponse definition")
	}
	properties, ok := joinLeaveResponse["properties"].(map[string]any)
	if !ok {
		t.Fatal("expected JoinLeaveResponse properties")
	}
	for _, field := range []string{"clan_tag", "player_tag", "timestamp_start", "timestamp_end", "history", "count", "clan_totals"} {
		if _, exists := properties[field]; exists {
			t.Fatalf("expected JoinLeaveResponse not to expose old field %s", field)
		}
	}
	for _, field := range []string{"items", "available"} {
		if _, exists := properties[field]; !exists {
			t.Fatalf("expected JoinLeaveResponse to expose %s", field)
		}
	}
	joinLeaveEvent, ok := definitions["modelsv2.JoinLeaveEvent"].(map[string]any)
	if !ok {
		t.Fatal("expected JoinLeaveEvent definition")
	}
	eventProperties, ok := joinLeaveEvent["properties"].(map[string]any)
	if !ok {
		t.Fatal("expected JoinLeaveEvent properties")
	}
	if _, exists := eventProperties["th"]; exists {
		t.Fatal("expected JoinLeaveEvent not to expose old th field")
	}
	if _, exists := eventProperties["townHallLevel"]; !exists {
		t.Fatal("expected JoinLeaveEvent to expose townHallLevel")
	}
	clanBasic, ok := definitions["modelsv2.ClanBasicResponse"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanBasicResponse definition")
	}
	clanBasicProperties, ok := clanBasic["properties"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanBasicResponse properties")
	}
	if _, exists := clanBasicProperties["member_tags"]; exists {
		t.Fatal("expected ClanBasicResponse not to expose removed member_tags field")
	}
	for _, field := range []string{
		"badge_url",
		"clan_level",
		"clan_points",
		"clanLevelAlias",
		"member_count",
		"troops_donated",
		"troops_received",
		"war_win_streak",
	} {
		if _, exists := clanBasicProperties[field]; exists {
			t.Fatalf("expected ClanBasicResponse not to expose legacy field %s", field)
		}
	}
	for _, field := range []string{"name", "tag", "badgeUrls", "clanPoints", "memberCount", "members", "records", "troopsDonated", "troopsReceived", "warWinStreak"} {
		if _, exists := clanBasicProperties[field]; !exists {
			t.Fatalf("expected ClanBasicResponse to expose %s", field)
		}
	}
	clanBasicRecords, ok := definitions["modelsv2.ClanBasicRecords"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanBasicRecords definition")
	}
	clanBasicRecordProperties, ok := clanBasicRecords["properties"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanBasicRecords properties")
	}
	for _, field := range []string{"clanPoints", "warWinStreak"} {
		if _, exists := clanBasicRecordProperties[field]; !exists {
			t.Fatalf("expected ClanBasicRecords to expose %s", field)
		}
	}
	clanBadgeURLs, ok := definitions["modelsv2.ClanBadgeURLs"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanBadgeURLs definition")
	}
	clanBadgeURLProperties, ok := clanBadgeURLs["properties"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanBadgeURLs properties")
	}
	if _, exists := clanBadgeURLProperties["large"]; !exists {
		t.Fatal("expected ClanBadgeURLs to expose large")
	}
	for _, field := range []string{"small", "medium"} {
		if _, exists := clanBadgeURLProperties[field]; exists {
			t.Fatalf("expected ClanBadgeURLs not to expose %s", field)
		}
	}
	clanRankings, ok := definitions["modelsv2.ClanRankingsResponse"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanRankingsResponse definition")
	}
	clanRankingsProperties, ok := clanRankings["properties"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanRankingsResponse properties")
	}
	for _, field := range []string{"name", "tag", "badge", "location", "clanPoints", "warWins", "warWinStreak", "donations", "donationsReceived"} {
		if _, exists := clanRankingsProperties[field]; !exists {
			t.Fatalf("expected ClanRankingsResponse to expose %s", field)
		}
	}
	for _, field := range []string{"badgeUrls", "rankings", "updatedAt", "donationsSent", "global_rank", "local_rank", "country_code", "country_name"} {
		if _, exists := clanRankingsProperties[field]; exists {
			t.Fatalf("expected ClanRankingsResponse not to expose legacy top-level field %s", field)
		}
	}
	clanRankingMetric, ok := definitions["modelsv2.ClanRankingMetric"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanRankingMetric definition")
	}
	clanRankingMetricProperties, ok := clanRankingMetric["properties"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanRankingMetric properties")
	}
	for _, field := range []string{"value", "globalRank", "localRank"} {
		if _, exists := clanRankingMetricProperties[field]; !exists {
			t.Fatalf("expected ClanRankingMetric to expose %s", field)
		}
	}
	for _, field := range []string{"global", "local"} {
		if _, exists := clanRankingMetricProperties[field]; exists {
			t.Fatalf("expected ClanRankingMetric not to expose %s", field)
		}
	}
	if _, exists := definitions["modelsv2.ClanRankingScope"]; exists {
		t.Fatal("expected ClanRankingScope definition to be removed")
	}
}

func TestBuildDocKeepsJoinLeaveQueryParamsSimple(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)

	wantHistory := []string{"limit", "time[after]", "time[before]"}
	for _, path := range []string{
		"/v2/clan/{clan_tag}/join-leave",
		"/v2/player/{player_tag}/join-leave",
	} {
		params := swaggerQueryParams(t, paths, path)
		if len(params) != len(wantHistory) {
			t.Fatalf("expected %s query params %v, got %v", path, wantHistory, params)
		}
		for i, want := range wantHistory {
			if params[i] != want {
				t.Fatalf("expected %s query param %d to be %s, got %s", path, i, want, params[i])
			}
		}
	}

	params := swaggerQueryParams(t, paths, "/v2/clan/{clan_tag}/join-leave/stats")
	wantStats := []string{"time[after]", "time[before]"}
	if len(params) != len(wantStats) {
		t.Fatalf("expected stats query params %v, got %v", wantStats, params)
	}
	for i, want := range wantStats {
		if params[i] != want {
			t.Fatalf("expected stats query param %d to be %s, got %s", i, want, params[i])
		}
	}

	for _, path := range []string{
		"/v2/player/{player_tag}/join-leave/totals",
	} {
		params := swaggerQueryParams(t, paths, path)
		if len(params) != 0 {
			t.Fatalf("expected %s to have no query params, got %v", path, params)
		}
	}

	for _, path := range []string{
		"/v2/player/{player_tag}/join-leave/shared",
	} {
		params := swaggerQueryParams(t, paths, path)
		if len(params) != 1 || params[0] != "tag" {
			t.Fatalf("expected %s query params [tag], got %v", path, params)
		}
	}
}

func TestClanBasicResponseKeepsOfficialIdentityFieldsFirst(t *testing.T) {
	body, err := json.Marshal(modelsv2.ClanBasicResponse{
		Name: "Tamilan",
		Tag:  "#22PU0L9CY",
		BadgeURLs: modelsv2.ClanBadgeURLs{
			Large: "badge.png",
		},
		Description:    "Be active perform war have fun",
		ClanLevel:      19,
		ClanPoints:     0,
		WarLeague:      modelsv2.ClanLeagueRef{ID: 48000009},
		PublicWarLog:   false,
		WarWins:        70,
		WarWinStreak:   0,
		MemberCount:    39,
		TroopsDonated:  2150,
		TroopsReceived: 2150,
		Records: &modelsv2.ClanBasicRecords{
			ClanPoints: &modelsv2.ClanRecordEntry{
				Value: 50000,
				Time:  time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC),
			},
		},
		Members: []any{},
	})
	if err != nil {
		t.Fatal(err)
	}
	payload := string(body)
	ordered := []string{`"name"`, `"tag"`, `"badgeUrls"`, `"description"`, `"members"`}
	last := -1
	for _, field := range ordered {
		next := strings.Index(payload, field)
		if next == -1 {
			t.Fatalf("expected payload to contain %s: %s", field, payload)
		}
		if next <= last {
			t.Fatalf("expected %s after previous field in payload: %s", field, payload)
		}
		last = next
	}
	if strings.Index(payload, `"members"`) < strings.Index(payload, `"troopsReceived"`) {
		t.Fatalf("expected members to stay after scalar fields: %s", payload)
	}
	if strings.Index(payload, `"members"`) < strings.Index(payload, `"records"`) {
		t.Fatalf("expected members to stay after records: %s", payload)
	}
}

func TestClanBasicResponseOmitsEmptyRecords(t *testing.T) {
	body, err := json.Marshal(modelsv2.ClanBasicResponse{
		Name: "Tamilan",
		Tag:  "#22PU0L9CY",
		BadgeURLs: modelsv2.ClanBadgeURLs{
			Large: "badge.png",
		},
		Members: []any{},
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), `"records"`) {
		t.Fatalf("expected records to be omitted when missing: %s", body)
	}
}

func TestBuildDocIncludesPublicStatsSectionsFirst(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)

	for _, path := range []string{
		"/v2/player/{player_tag}/rankings",
		"/v2/player/{player_tag}/battlelog/history",
		"/v2/player/{player_tag}/legends/{day}/day",
		"/v2/player/{player_tag}/legends/{season}/season",
		"/v2/player/legends/{season}/battlelog-stats",
		"/v2/player/{player_tag}/ranked/{season}/battlelog",
		"/v2/player/{player_tag}/ranked/{season}/group",
		"/v2/player/{player_tag}/changes",
		"/v2/leaderboard/league/{league_tier_id}",
		"/v2/leaderboard/league/{league_tier_id}/history/{date}",
		"/v2/leaderboard/townhalls/{townhall_level}",
		"/v2/leaderboard/townhalls/{townhall_level}/history/{date}",
		"/v2/leaderboard/{location_id}/clan/donations",
		"/v2/leaderboard/{location_id}/clan/war-wins",
		"/v2/leaderboard/clan/win-streak",
		"/v2/leaderboard/{league_tier_id}/trophy-buckets",
		"/v2/global/cwl-leagues",
		"/v2/global/clan/locations",
		"/v2/global/townhalls",
		"/v2/global/builderhalls",
		"/v2/global/capital-leagues",
		"/v2/global/leaguetiers",
		"/v2/clan/{clan_tag}/changes",
		"/v2/clan/{clan_tag}/rankings",
		"/v2/clan/{clan_tag}/basic",
		"/v2/clan/{clan_tag}/badge",
		"/v2/battlelogs/ranked/armies",
		"/v2/battlelogs/farming/armies",
		"/v2/battlelogs/items/townhall/{townhall_level}/usage",
		"/v2/battlelogs/items/townhall/{townhall_level}/hitrate",
		"/v2/battlelogs/items/league/{league_id}/usage",
		"/v2/battlelogs/items/league/{league_id}/hitrate",
		"/v2/battlelogs/items/top200/usage",
		"/v2/battlelogs/items/top200/hitrate",
		"/v2/ranking/player-trophies/{location}/{date}",
		"/v2/ranking/player-builder/{location}/{date}",
		"/v2/ranking/clan-trophies/{location}/{date}",
		"/v2/ranking/clan-builder/{location}/{date}",
		"/v2/ranking/clan-capital/{location}/{date}",
	} {
		if _, exists := paths[path]; !exists {
			t.Fatalf("expected public stats path %s in swagger", path)
		}
	}

	tags, ok := doc["tags"].([]any)
	if !ok {
		t.Fatal("expected swagger tags list")
	}
	want := []string{"Player", "Clan", "War", "Battlelogs", "Leaderboard", "Rankings", "Global", "Search", "Links", "Tracking", "Dates", "Lists"}
	if len(tags) < len(want) {
		t.Fatalf("expected at least %d tags, got %d", len(want), len(tags))
	}
	for i, name := range want {
		tag, ok := tags[i].(map[string]any)
		if !ok || tag["name"] != name {
			t.Fatalf("expected tag %d to be %s, got %v", i, name, tags[i])
		}
	}
	for _, raw := range tags {
		tag, _ := raw.(map[string]any)
		switch tag["name"] {
		case "Auth", "Legacy Bot", "Legacy Links", "Legacy War", "Legacy Rankings", "Legacy Lists", "CDN", "Exports", "Guild", "Guilds", "Internal", "Tracking Endpoints", "Static Data":
			t.Fatalf("expected swagger tags not to include %s", tag["name"])
		}
	}
	lastTag, _ := tags[len(tags)-1].(map[string]any)
	if lastTag["name"] != "Other" {
		t.Fatalf("expected Other to be the last swagger tag, got %v", lastTag)
	}

	raw, err := swaggerdocs.BuildDoc()
	if err != nil {
		t.Fatalf("failed to build swagger doc: %v", err)
	}
	for _, marker := range []string{"Public Stats", "PlannedEndpoint", `"501"`, "planned public stats"} {
		if strings.Contains(raw, marker) {
			t.Fatalf("expected generated swagger not to contain %q", marker)
		}
	}
}

func buildSwaggerDoc(t *testing.T) map[string]any {
	t.Helper()
	raw, err := swaggerdocs.BuildDoc()
	if err != nil {
		t.Fatalf("failed to build swagger doc: %v", err)
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		t.Fatalf("failed to decode swagger doc: %v", err)
	}
	return doc
}

func swaggerDefinitions(t *testing.T, doc map[string]any) map[string]any {
	t.Helper()
	definitions, ok := doc["definitions"].(map[string]any)
	if !ok {
		t.Fatal("expected swagger definitions")
	}
	return definitions
}

func swaggerDefinitionProperties(t *testing.T, definitions map[string]any, name string) map[string]any {
	t.Helper()
	definition, ok := definitions[name].(map[string]any)
	if !ok {
		t.Fatalf("expected %s definition", name)
	}
	properties, ok := definition["properties"].(map[string]any)
	if !ok {
		t.Fatalf("expected %s properties", name)
	}
	return properties
}

func assertRef(t *testing.T, value any, want string) {
	t.Helper()
	ref, _ := value.(map[string]any)
	if ref["$ref"] != want {
		t.Fatalf("expected ref %s, got %v", want, value)
	}
}

func assertArrayItemsRef(t *testing.T, value any, want string) {
	t.Helper()
	field, _ := value.(map[string]any)
	items, _ := field["items"].(map[string]any)
	if items["$ref"] != want {
		t.Fatalf("expected array items ref %s, got %v", want, value)
	}
}

func assertEnum(t *testing.T, value any, want []any) {
	t.Helper()
	field, _ := value.(map[string]any)
	if !reflect.DeepEqual(field["enum"], want) {
		t.Fatalf("expected enum %v, got %v", want, value)
	}
}

func assertParameterEnum(t *testing.T, value any, name string, want []any) {
	t.Helper()
	params, ok := value.([]any)
	if !ok {
		t.Fatalf("expected parameters array, got %v", value)
	}
	for _, raw := range params {
		param, _ := raw.(map[string]any)
		if param["name"] == name {
			if !reflect.DeepEqual(param["enum"], want) {
				t.Fatalf("expected %s enum %v, got %v", name, want, param)
			}
			return
		}
	}
	t.Fatalf("expected %s parameter in %v", name, params)
}

func assertRequiredParameter(t *testing.T, params []any, name string, in string) {
	t.Helper()
	for _, raw := range params {
		param, _ := raw.(map[string]any)
		if param["name"] == name && param["in"] == in {
			if param["required"] != true {
				t.Fatalf("expected %s %s parameter to be required, got %v", in, name, param)
			}
			return
		}
	}
	t.Fatalf("expected required %s %s parameter in %v", in, name, params)
}

func assertTags(t *testing.T, operation map[string]any, want []string) {
	t.Helper()
	rawTags, ok := operation["tags"].([]any)
	if !ok {
		t.Fatalf("expected operation tags, got %v", operation["tags"])
	}
	got := make([]string, 0, len(rawTags))
	for _, raw := range rawTags {
		got = append(got, raw.(string))
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected tags %v, got %v", want, got)
	}
}

func swaggerPaths(t *testing.T, doc map[string]any) map[string]any {
	t.Helper()
	paths, ok := doc["paths"].(map[string]any)
	if !ok {
		t.Fatal("expected swagger paths object")
	}
	return paths
}

func swaggerQueryParams(t *testing.T, paths map[string]any, path string) []string {
	t.Helper()
	pathItem, ok := paths[path].(map[string]any)
	if !ok {
		t.Fatalf("expected path %s in swagger", path)
	}
	get, ok := pathItem["get"].(map[string]any)
	if !ok {
		t.Fatalf("expected %s get operation", path)
	}
	paramsRaw, _ := get["parameters"].([]any)
	params := []string{}
	for _, raw := range paramsRaw {
		param, _ := raw.(map[string]any)
		if param["in"] == "query" {
			params = append(params, param["name"].(string))
		}
	}
	return params
}
