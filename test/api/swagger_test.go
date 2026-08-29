package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	"github.com/ClashKingInc/ClashKingAPI/internal/swaggerdocs"
	"github.com/gofiber/fiber/v2"
)

func TestOpenAPIDocumentIncludesAuthorizationScheme(t *testing.T) {
	doc := buildSwaggerDoc(t)
	components, ok := doc["components"].(map[string]any)
	if !ok {
		t.Fatal("expected OpenAPI components")
	}
	securitySchemes, ok := components["securitySchemes"].(map[string]any)
	if !ok {
		t.Fatal("expected OpenAPI security schemes")
	}
	apiKey, ok := securitySchemes["ApiKeyAuth"].(map[string]any)
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
	doc := buildSwaggerDoc(t)
	paths := doc["paths"].(map[string]any)

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
			`id="scalar-loader"`,
			`url: "\/openapi.json"`,
			`https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.63.0`,
			`theme: "none"`,
			`layout: "modern"`,
			`customCss: document.getElementById("ck-scalar-theme").textContent`,
			`customFetch: scalarFetch`,
			`tagsSorter: (a, b) => {`,
			`const tagName = (value) =>`,
			`"Player",`,
			`"War \u0026 CWL",`,
			`"Links",`,
			`request = new Request(request, { method: "QUERY" })`,
			`const labelScalarQueryMethods = () => {`,
			`value.endsWith("POST" + path)`,
			`node.data = node.data.replace(/POST/i, "QUERY")`,
			`new MutationObserver(() => {`,
			`watchScalarQueryLabels();`,
			`class="ck-docs-header"`,
			`class="ck-brand-logo ck-brand-logo--dark"`,
			`class="ck-brand-logo ck-brand-logo--light"`,
			`https://assets.clashk.ing/fonts/clashking.woff2`,
			`https://assets.clashk.ing/logos/clashking-wordmark-dark.svg`,
			`https://assets.clashk.ing/logos/clashking-wordmark-light.svg`,
			`--ck-primary: #d90709`,
			`--ck-radius-panel: 28px`,
			`@media (prefers-reduced-motion: reduce)`,
			`:focus-visible`,
			`href="/swagger"`,
			`href="/swagger">Swagger</a>`,
			`href="/openapi.json"`,
			`:where(input, textarea, select):focus-visible`,
			`.open-api-client-button:focus-visible`,
			`aria-label="Swagger" href="/swagger">Swagger</a>`,
		} {
			if !strings.Contains(html, marker) {
				t.Fatalf("expected Scalar html for %s to contain %q", path, marker)
			}
		}
		if strings.Contains(html, "ZgotmplZ") {
			t.Fatalf("expected Scalar CDN assets for %s to render as safe URLs", path)
		}
		if strings.Contains(html, "Swagger fallback") || strings.Contains(html, "ck-product-label") {
			t.Fatalf("expected Scalar html for %s to use the simplified documentation header", path)
		}
		for operationPath, pathItem := range paths {
			renderedPath := strings.ReplaceAll(operationPath, "/", `\/`)
			if _, ok := pathItem.(map[string]any)["query"]; ok && !strings.Contains(html, `"`+renderedPath+`",`) {
				t.Fatalf("expected Scalar html for %s to discover QUERY operation %s", path, operationPath)
			}
		}
	}
}

func TestSwaggerUIHandlerUsesPinnedAssets(t *testing.T) {
	app := fiber.New()
	app.Get("/swagger/*", swaggerdocs.NewUIHandler("/openapi.json"))

	req := httptest.NewRequest(http.MethodGet, "/swagger/index.html", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	for _, marker := range []string{
		"swagger-ui-dist@5.32.11/swagger-ui.css",
		"swagger-ui-dist@5.32.11/swagger-ui-bundle.js",
		"swagger-ui-dist@5.32.11/swagger-ui-standalone-preset.js",
	} {
		if !strings.Contains(string(body), marker) {
			t.Fatalf("expected pinned Swagger UI asset %q", marker)
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

func TestCurrentUserDocIncludesAccountSummary(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)

	for _, path := range []string{"/v2/me", "/v2/auth/me"} {
		operation := paths[path].(map[string]any)["get"].(map[string]any)
		response := operation["responses"].(map[string]any)["200"].(map[string]any)
		schema := openAPIResponseSchema(t, response)
		if schema["$ref"] != "#/components/schemas/modelsv2.CurrentUserInfo" {
			t.Fatalf("%s current-user schema = %v", path, schema["$ref"])
		}
	}

	definitions := swaggerDefinitions(t, doc)
	currentUser := definitions["modelsv2.CurrentUserInfo"].(map[string]any)
	properties := currentUser["properties"].(map[string]any)
	accountSummary := properties["account_summary"].(map[string]any)
	if accountSummary["$ref"] != "#/components/schemas/modelsv2.UserAccountSummary" {
		t.Fatalf("account_summary schema = %v", accountSummary["$ref"])
	}
	summary := definitions["modelsv2.UserAccountSummary"].(map[string]any)
	summaryProperties := summary["properties"].(map[string]any)
	if _, ok := summaryProperties["follower_count"]; !ok {
		t.Fatal("account summary schema omits follower_count")
	}
}

func TestAutoboardOpenAPIUsesTypedCleanBreakContract(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)

	capabilities, ok := paths["/v2/server/{server_id}/autoboards/capabilities"].(map[string]any)
	if !ok {
		t.Fatal("expected autoboard capabilities path")
	}
	if _, ok := capabilities["get"].(map[string]any); !ok {
		t.Fatal("expected GET autoboard capabilities operation")
	}

	itemPath, ok := paths["/v2/server/{server_id}/autoboards/{autoboard_id}"].(map[string]any)
	if !ok {
		t.Fatal("expected autoboard item path")
	}
	if _, ok := itemPath["put"].(map[string]any); !ok {
		t.Fatal("expected full-replacement PUT autoboard operation")
	}
	if _, exists := itemPath["patch"]; exists {
		t.Fatal("legacy partial PATCH autoboard operation is still documented")
	}

	definitions := swaggerDefinitions(t, doc)
	request, ok := definitions["modelsv2.CreateAutoBoardRequest"].(map[string]any)
	if !ok {
		t.Fatal("expected typed create autoboard definition")
	}
	properties, ok := request["properties"].(map[string]any)
	if !ok {
		t.Fatal("expected create autoboard properties")
	}
	for _, required := range []string{
		"boardType", "targetScope", "targets", "deliveryMode", "channelId", "threadId",
		"enabled", "intervalMinutes", "schedule",
	} {
		if _, exists := properties[required]; !exists {
			t.Fatalf("autoboard create contract is missing %q", required)
		}
	}
	for _, retired := range []string{
		"type", "button_id", "webhook_id", "messageId", "days", "locale", "data",
		"board_type", "target_scope", "delivery_mode", "channel_id", "thread_id", "interval_minutes",
	} {
		if _, exists := properties[retired]; exists {
			t.Fatalf("autoboard create contract still exposes %q", retired)
		}
	}
}

func TestHomePlatformOpenAPIUsesRFCQueryAndTypedContracts(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)

	homePath, ok := paths["/v2/home/activity"].(map[string]any)
	if !ok {
		t.Fatal("expected /v2/home/activity path")
	}
	if _, exists := homePath["post"]; exists {
		t.Fatal("did not expect POST documentation for the RFC QUERY route")
	}
	query, ok := homePath["query"].(map[string]any)
	if !ok {
		t.Fatal("expected native QUERY operation for /v2/home/activity")
	}
	assertTags(t, query, []string{"Activity & Inactivity"})

	for _, route := range []string{
		"/v2/links/{id}/last-login",
		"/v2/links/{id}/{playerTag}/upgrades",
		"/v2/links/{id}/{playerTag}/upgrade-preferences",
	} {
		if _, exists := paths[route]; !exists {
			t.Fatalf("expected %s in OpenAPI", route)
		}
	}

	definitions := swaggerDefinitions(t, doc)
	accountProps := swaggerDefinitionProperties(t, definitions, "modelsv2.AccountsLinkedAccount")
	lastLogin, exists := accountProps["last_login"].(map[string]any)
	if !exists || !reflect.DeepEqual(lastLogin["type"], []any{"string", "null"}) || lastLogin["format"] != "date-time" {
		t.Fatalf("expected nullable date-time AccountsLinkedAccount.last_login, got %v", accountProps["last_login"])
	}
	if hidden, exists := accountProps["hidden"].(map[string]any); !exists || hidden["type"] != "boolean" {
		t.Fatalf("expected AccountsLinkedAccount.hidden to remain boolean, got %v", accountProps["hidden"])
	}
	itemProps := swaggerDefinitionProperties(t, definitions, "modelsv2.HomeActivityItem")
	assertEnum(t, itemProps["type"], []any{"join_leave"})
	for _, field := range []string{"timestamp", "event_type", "player_tag", "clan_tag"} {
		if _, exists := itemProps[field]; !exists {
			t.Fatalf("expected HomeActivityItem.%s", field)
		}
	}
	for _, field := range []string{"data", "season", "value"} {
		if _, exists := itemProps[field]; exists {
			t.Fatalf("expected HomeActivityItem not to expose retired field %s", field)
		}
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
	assertArrayItemsRef(t, groupedProps["players"], "#/components/schemas/modelsv2.SearchRecentPlayerItem")
	assertArrayItemsRef(t, groupedProps["clans"], "#/components/schemas/modelsv2.SearchRecentClanItem")

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
	assertRef(t, playerProps["clan"], "#/components/schemas/modelsv2.SearchRecentClan")
	assertRef(t, playerProps["league"], "#/components/schemas/modelsv2.SearchRecentLeague")

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
	assertRef(t, clanItemProps["badgeUrls"], "#/components/schemas/modelsv2.SearchRecentBadgeURLs")

	badgeProps := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchRecentBadgeURLs")
	if _, exists := badgeProps["large"]; !exists {
		t.Fatal("expected recent badgeUrls schema to expose large")
	}
	if _, exists := definitions["modelsv2.SearchRecentBadgeURLs"].(map[string]any)["additionalProperties"]; exists {
		t.Fatal("expected recent badgeUrls schema not to use additionalProperties")
	}
	recentClanProps := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchRecentClan")
	assertRef(t, recentClanProps["badgeUrls"], "#/components/schemas/modelsv2.SearchRecentBadgeURLs")
	leagueProps := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchRecentLeague")
	assertRef(t, leagueProps["iconUrls"], "#/components/schemas/modelsv2.SearchRecentLeagueIconURLs")

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
		"/v2/clan/{clan_tag}/badge",
		"/v2/clan/{clan_tag}/basic",
		"/v2/clan/{clan_tag}/changes",
		"/v2/clan/{clan_tag}/war-log",
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
		"/v2/server/{server_id}/leaderboards/capital-raids",
		"/v2/server/{server_id}/leaderboards/activity",
		"/v2/server/{server_id}/leaderboards/looting",
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
		"/v2/player/{player_tag}/changes",
		"/v2/player/{player_tag}/stat-history",
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
		"/war/{clanTag}/previous",
		"/war/{clanTag}/basic",
		"/cwl/{clanTag}/group",
		"/cwl/{clanTag}/{season}",
		"/v2/war/clan/stats",
		"/v2/war/stats",
		"/v2/war/war-summary",
		"/v2/war/clans/warhits",
		"/v2/war/players/warhits",
		"/v2/cwl/{clan_tag}",
		"/v2/clan/{clan_tag}/leaderboard-history",
		"/v2/clan/{clan_tag}/legend-history",
		"/v2/search/clan",
		"/v2/search/player",
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
		"/v2/player/{player_tag}/history/stats",
		"/v2/player/{player_tag}/timers",
		"/v2/player/search",
		"/v2/clan/search",
		"/v2/links/{id}/searches",
		"/v2/links/{id}/{playerTag}",
		"/builderbaseleagues",
		"/v2/war/{clan_tag}/previous/{endtime}",
		"/v2/cwl/{clan_tag}/group",
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

	previous := paths["/v2/war/{clan_tag}/previous/{endtime}"].(map[string]any)["get"].(map[string]any)
	params, _ := previous["parameters"].([]any)
	assertRequiredParameter(t, params, "endtime", "path")
	assertRequiredParameter(t, params, "clan_tag", "path")
	assertTags(t, previous, []string{"War & CWL"})

	builderBaseLeagues := paths["/builderbaseleagues"].(map[string]any)["get"].(map[string]any)
	assertTags(t, builderBaseLeagues, []string{"Other"})
	for _, path := range []string{"/list/townhalls", "/list/seasons"} {
		if _, exists := paths[path]; exists {
			t.Fatalf("expected removed legacy list path %s to be absent", path)
		}
	}
	for _, path := range []string{"/v2/cdn/upload", "/v2/exports/war/cwl-summary", "/v2/exports/war/player-stats", "/v2/guild/{server_id}", "/v2/guilds"} {
		method := "get"
		if path == "/v2/cdn/upload" || path == "/v2/exports/war/player-stats" {
			method = "post"
		}
		operation := paths[path].(map[string]any)[method].(map[string]any)
		assertTags(t, operation, []string{"Other"})
	}

	definitions := swaggerDefinitions(t, doc)
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
	clanBasic, ok := definitions["modelsv2.ClanCachedResponse"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanCachedResponse definition")
	}
	clanBasicProperties, ok := clanBasic["properties"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanCachedResponse properties")
	}
	if _, exists := clanBasicProperties["member_tags"]; exists {
		t.Fatal("expected ClanCachedResponse not to expose removed member_tags field")
	}
	for _, field := range []string{
		"badge_url",
		"clan_level",
		"clan_points",
		"clanLevelAlias",
		"builderBasePoints",
		"capitalPoints",
		"member_count",
		"troops_donated",
		"troops_received",
		"war_win_streak",
	} {
		if _, exists := clanBasicProperties[field]; exists {
			t.Fatalf("expected ClanCachedResponse not to expose legacy field %s", field)
		}
	}
	for _, field := range []string{"name", "tag", "badgeUrls", "clanPoints", "memberCount", "members", "location", "warLeague", "capitalLeague", "troopsDonated", "troopsReceived", "warWinStreak"} {
		if _, exists := clanBasicProperties[field]; !exists {
			t.Fatalf("expected ClanCachedResponse to expose %s", field)
		}
	}
	if _, exists := clanBasicProperties["records"]; exists {
		t.Fatal("expected ClanCachedResponse not to expose records")
	}
	member := swaggerDefinitionProperties(t, definitions, "modelsv2.ClanCachedMember")
	if _, exists := member["townHallLevel"]; !exists {
		t.Fatal("expected ClanCachedMember to expose townHallLevel")
	}
	if _, exists := member["town_hall"]; exists {
		t.Fatal("expected ClanCachedMember not to expose town_hall")
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
	for _, field := range []string{"name", "tag", "badge", "homeVillage", "builderBase", "clanCapital"} {
		if _, exists := clanRankingsProperties[field]; !exists {
			t.Fatalf("expected ClanRankingsResponse to expose %s", field)
		}
	}
	for _, field := range []string{
		"location",
		"clanPoints",
		"warWins",
		"warWinStreak",
		"donations",
		"donationsReceived",
		"badgeUrls",
		"rankings",
		"updatedAt",
		"global_rank",
		"local_rank",
		"country_code",
		"country_name",
	} {
		if _, exists := clanRankingsProperties[field]; exists {
			t.Fatalf("expected ClanRankingsResponse not to expose legacy top-level field %s", field)
		}
	}
	clanRankingCategory, ok := definitions["modelsv2.ClanRankingCategory"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanRankingCategory definition")
	}
	clanRankingCategoryProperties, ok := clanRankingCategory["properties"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanRankingCategory properties")
	}
	for _, field := range []string{"points", "placements"} {
		if _, exists := clanRankingCategoryProperties[field]; !exists {
			t.Fatalf("expected ClanRankingCategory to expose %s", field)
		}
	}
	clanRankingPlacement, ok := definitions["modelsv2.ClanRankingPlacement"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanRankingPlacement definition")
	}
	clanRankingPlacementProperties, ok := clanRankingPlacement["properties"].(map[string]any)
	if !ok {
		t.Fatal("expected ClanRankingPlacement properties")
	}
	for _, field := range []string{"locationId", "rank", "points"} {
		if _, exists := clanRankingPlacementProperties[field]; !exists {
			t.Fatalf("expected ClanRankingPlacement to expose %s", field)
		}
	}
	if _, exists := clanRankingPlacementProperties["updatedAt"]; exists {
		t.Fatal("expected ClanRankingPlacement not to expose removed updatedAt")
	}
	for _, obsoleteDefinition := range []string{"modelsv2.ClanRankingMetric", "modelsv2.ClanRankingScope"} {
		if _, exists := definitions[obsoleteDefinition]; exists {
			t.Fatalf("expected %s definition to be removed", obsoleteDefinition)
		}
	}
}

func TestBuildDocKeepsJoinLeaveQueryParamsSimple(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)
	joinLeaveClan := swaggerDefinitionProperties(t, swaggerDefinitions(t, doc), "modelsv2.JoinLeaveClan")
	if _, exists := joinLeaveClan["badge"]; exists {
		t.Fatal("join-leave clan schema must not expose a badge")
	}

	wantHistory := []string{"time[after]", "time[before]", "limit"}
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

func TestPlayerStatHistoryOpenAPIUsesTypedCamelCaseContract(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)
	definitions := swaggerDefinitions(t, doc)

	path := "/v2/player/{player_tag}/history/stats"
	operation := paths[path].(map[string]any)["get"].(map[string]any)
	assertParameterEnum(
		t,
		operation["parameters"],
		"type",
		[]any{"donated", "received", "clan_games", "capital_gold_donated"},
	)
	assertRequiredParameter(t, operation["parameters"].([]any), "type", "query")
	queryParams := swaggerQueryParams(t, paths, path)
	wantParams := []string{"type", "time[after]", "time[before]", "limit"}
	if !reflect.DeepEqual(queryParams, wantParams) {
		t.Fatalf("player stat history query params = %v, want %v", queryParams, wantParams)
	}

	response := swaggerDefinitionProperties(t, definitions, "modelsv2.PlayerStatHistoryResponse")
	assertArrayItemsRef(t, response["items"], "#/components/schemas/modelsv2.PlayerStatChange")

	item := swaggerDefinitionProperties(t, definitions, "modelsv2.PlayerStatChange")
	for _, field := range []string{
		"eventTime",
		"clanTag",
		"statType",
		"previousValue",
		"currentValue",
		"delta",
	} {
		if _, exists := item[field]; !exists {
			t.Fatalf("PlayerStatChange missing %s", field)
		}
	}
	if clanTag, ok := item["clanTag"].(map[string]any); !ok || !isNullableType(clanTag, "string") {
		t.Fatalf("PlayerStatChange.clanTag must be nullable: %#v", item["clanTag"])
	}
	for _, retired := range []string{
		"playerTag",
		"season",
		"trophies",
		"loot",
		"activity",
		"activityScore",
		"attackWins",
		"townHallLevel",
		"lastOnline",
		"data",
	} {
		if _, exists := item[retired]; exists {
			t.Fatalf("PlayerStatChange exposes retired field %s", retired)
		}
	}

	donationItem := swaggerDefinitionProperties(t, definitions, "modelsv2.ServerDonationsLeaderboardItem")
	for _, field := range []string{"donated", "received"} {
		if _, exists := donationItem[field]; !exists {
			t.Fatalf("ServerDonationsLeaderboardItem missing %s", field)
		}
	}
	for _, unsupported := range []string{"clan_games", "activity_score"} {
		if _, exists := donationItem[unsupported]; exists {
			t.Fatalf("ServerDonationsLeaderboardItem exposes %s", unsupported)
		}
	}
	clanGamesItem := swaggerDefinitionProperties(t, definitions, "modelsv2.ServerClanGamesLeaderboardItem")
	if _, exists := clanGamesItem["clan_games"]; !exists {
		t.Fatal("ServerClanGamesLeaderboardItem missing truthful clan_games aggregate")
	}
	for _, unsupported := range []string{"donated", "received", "activity_score"} {
		if _, exists := clanGamesItem[unsupported]; exists {
			t.Fatalf("ServerClanGamesLeaderboardItem exposes %s", unsupported)
		}
	}
	donationsOperation := paths["/v2/server/{server_id}/leaderboards/donations"].(map[string]any)["get"].(map[string]any)
	donationsResponses := donationsOperation["responses"].(map[string]any)
	donationsSchema := openAPIResponseSchema(t, donationsResponses["200"].(map[string]any))
	assertRef(t, donationsSchema, "#/components/schemas/modelsv2.ServerDonationsLeaderboardResponse")
	clanGamesOperation := paths["/v2/server/{server_id}/leaderboards/clan-games"].(map[string]any)["get"].(map[string]any)
	clanGamesResponses := clanGamesOperation["responses"].(map[string]any)
	clanGamesSchema := openAPIResponseSchema(t, clanGamesResponses["200"].(map[string]any))
	assertRef(t, clanGamesSchema, "#/components/schemas/modelsv2.ServerClanGamesLeaderboardResponse")
}

func TestPlayerChangeHistoryOpenAPIRequiresTypedFilter(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)
	definitions := swaggerDefinitions(t, doc)
	operation := paths["/v2/player/{player_tag}/history/changes"].(map[string]any)["get"].(map[string]any)
	params := operation["parameters"].([]any)

	assertRequiredParameter(t, params, "type", "query")
	assertParameterEnum(t, params, "type", []any{
		"troop_level",
		"super_troop_boost",
		"hero_level",
		"spell_level",
		"pet_level",
		"equipment_level",
		"townhall_level",
		"best_trophies",
		"best_builder_base_trophies",
		"exp_level",
		"war_preference",
		"name",
	})
	if got := swaggerQueryParams(t, paths, "/v2/player/{player_tag}/history/changes"); !reflect.DeepEqual(got, []string{"type", "time[after]", "time[before]", "limit"}) {
		t.Fatalf("player change query params = %v", got)
	}
	response := swaggerDefinitionProperties(t, definitions, "modelsv2.PlayerChangesResponse")
	if _, exists := response["count"]; exists {
		t.Fatal("PlayerChangesResponse must not expose count")
	}
}

func TestPlayerWarHistoryOpenAPIUsesPerWarContract(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)
	definitions := swaggerDefinitions(t, doc)
	path := "/v2/player/{player_tag}/war/stats"
	operation := paths[path].(map[string]any)["get"].(map[string]any)
	assertParameterEnum(t, operation["parameters"], "type", []any{"cwl", "random", "friendly"})
	if got := swaggerQueryParams(t, paths, path); !reflect.DeepEqual(got, []string{"type", "time[after]", "time[before]", "limit"}) {
		t.Fatalf("player war history query params = %v", got)
	}
	response := swaggerDefinitionProperties(t, definitions, "modelsv2.PlayerWarStatsResponse")
	assertArrayItemsRef(t, response["items"], "#/components/schemas/modelsv2.PlayerWarHistoryItem")
	item := swaggerDefinitionProperties(t, definitions, "modelsv2.PlayerWarHistoryItem")
	for _, field := range []string{"teamSize", "attacksPerMember", "preparationStartTime", "startTime", "endTime", "clan", "opponent", "type", "player", "attacks", "defenses"} {
		if _, exists := item[field]; !exists {
			t.Fatalf("PlayerWarHistoryItem missing %s", field)
		}
	}
	for _, retired := range []string{"war", "missed"} {
		if _, exists := item[retired]; exists {
			t.Fatalf("PlayerWarHistoryItem exposes %s", retired)
		}
	}
}

func TestClanHistoryAndCachedClanOpenAPIContracts(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)
	definitions := swaggerDefinitions(t, doc)

	changesPath := "/v2/clan/{clan_tag}/history/changes"
	changes := paths[changesPath].(map[string]any)["get"].(map[string]any)
	assertParameterEnum(t, changes["parameters"], "type", []any{"description", "clanLevel"})
	if got := swaggerQueryParams(t, paths, changesPath); !reflect.DeepEqual(got, []string{"type", "time[after]", "time[before]", "limit"}) {
		t.Fatalf("clan change query params = %v", got)
	}
	changesResponse := swaggerDefinitionProperties(t, definitions, "modelsv2.ClanChangesResponse")
	if len(changesResponse) != 1 {
		t.Fatalf("ClanChangesResponse should only expose items: %#v", changesResponse)
	}
	assertArrayItemsRef(t, changesResponse["items"], "#/components/schemas/modelsv2.ClanChangeRecord")

	warlogPath := "/v2/clan/{clan_tag}/warlog"
	warlog := paths[warlogPath].(map[string]any)["get"].(map[string]any)
	assertParameterEnum(t, warlog["parameters"], "type", []any{"cwl", "random", "friendly"})
	if got := swaggerQueryParams(t, paths, warlogPath); !reflect.DeepEqual(got, []string{"type", "time[after]", "time[before]", "limit"}) {
		t.Fatalf("clan warlog query params = %v", got)
	}
	if _, exists := warlog["security"]; exists {
		t.Fatalf("clan warlog must allow unauthenticated requests: %#v", warlog["security"])
	}
	warlogResponse := swaggerDefinitionProperties(t, definitions, "routes.clanWarLogResponse")
	if len(warlogResponse) != 1 {
		t.Fatalf("clan warlog response should only expose items: %#v", warlogResponse)
	}
	for _, retired := range []string{"isPrivate", "reconstructed"} {
		if _, exists := warlogResponse[retired]; exists {
			t.Fatalf("clan warlog response exposes retired field %s", retired)
		}
	}

	warsPath := "/v2/clan/{clan_tag}/wars"
	wars := paths[warsPath].(map[string]any)["get"].(map[string]any)
	assertParameterEnum(t, wars["parameters"], "type", []any{"cwl", "random", "friendly"})
	if got := swaggerQueryParams(t, paths, warsPath); !reflect.DeepEqual(got, []string{"type", "time[after]", "time[before]", "limit"}) {
		t.Fatalf("clan wars query params = %v", got)
	}
	assertQueryParameterSchemaValue(t, wars["parameters"], "limit", "default", float64(15))
	assertQueryParameterSchemaValue(t, wars["parameters"], "limit", "maximum", float64(500))

	cached := swaggerDefinitionProperties(t, definitions, "modelsv2.ClanCachedResponse")
	if _, exists := cached["records"]; exists {
		t.Fatal("cached clan response exposes records")
	}
	league := swaggerDefinitionProperties(t, definitions, "modelsv2.ClanLeagueRef")
	for _, field := range []string{"id", "name"} {
		if _, exists := league[field]; !exists {
			t.Fatalf("ClanLeagueRef missing %s", field)
		}
	}
	if _, exists := paths["/v2/clan/{clan_tag}/records"]; !exists {
		t.Fatal("clan records path is missing")
	}
}

func TestCWLOpenAPIRoutesUseTheirOwningSections(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)
	definitions := swaggerDefinitions(t, doc)

	if _, exists := paths["/v2/war/{clan_tag}/previous"]; exists {
		t.Fatal("retired v2 previous-war route remains in swagger")
	}
	if _, exists := paths["/v2/cwl/league-thresholds"]; exists {
		t.Fatal("retired CWL threshold route remains in swagger")
	}
	if _, exists := paths["/v2/cwl/leagues/{league_id}/rankings"]; exists {
		t.Fatal("old CWL rankings route remains in swagger")
	}

	playerHistory := paths["/v2/player/{player_tag}/cwl/history"].(map[string]any)["get"].(map[string]any)
	assertTags(t, playerHistory, []string{"Player"})
	if got := swaggerQueryParams(t, paths, "/v2/player/{player_tag}/cwl/history"); !reflect.DeepEqual(got, []string{"limit"}) {
		t.Fatalf("player CWL history query params = %v", got)
	}
	assertQueryParameterSchemaValue(t, playerHistory["parameters"], "limit", "default", float64(6))

	groupHistory := paths["/v2/cwl/{clan_tag}/ranking-history"].(map[string]any)["get"].(map[string]any)
	assertTags(t, groupHistory, []string{"War & CWL"})
	group := paths["/v2/cwl/{clan_tag}/group"].(map[string]any)["get"].(map[string]any)
	assertTags(t, group, []string{"War & CWL"})
	seasons := paths["/v2/cwl/{clan_tag}/seasons"].(map[string]any)["get"].(map[string]any)
	assertTags(t, seasons, []string{"War & CWL"})
	if got := swaggerQueryParams(t, paths, "/v2/cwl/{clan_tag}/seasons"); !reflect.DeepEqual(got, []string{"limit"}) {
		t.Fatalf("CWL seasons query params = %v", got)
	}
	assertQueryParameterSchemaValue(t, seasons["parameters"], "limit", "default", float64(12))

	for _, path := range []string{
		"/v2/server/{server_id}/cwl/{clan_tag}/bonus-recipients",
	} {
		operation := paths[path].(map[string]any)
		for method, raw := range operation {
			if method == "parameters" {
				continue
			}
			assertTags(t, raw.(map[string]any), []string{"Server Clans"})
		}
	}
	leaderboard := paths["/v2/leaderboard/cwl/{league_id}"].(map[string]any)["get"].(map[string]any)
	assertTags(t, leaderboard, []string{"Leaderboard"})
	if got := swaggerQueryParams(t, paths, "/v2/leaderboard/cwl/{league_id}"); !reflect.DeepEqual(got, []string{"season", "team_size"}) {
		t.Fatalf("CWL leaderboard query params = %v", got)
	}

	item := swaggerDefinitionProperties(t, definitions, "modelsv2.CWLPlayerHistoryItem")
	for _, field := range []string{"season", "townHallLevel", "teamSize", "clan", "attacks", "placement", "missedAttacks"} {
		if _, exists := item[field]; !exists {
			t.Fatalf("CWL player history item missing %s", field)
		}
	}
	for _, retired := range []string{"cwlLeagueId", "warSize"} {
		if _, exists := item[retired]; exists {
			t.Fatalf("CWL player history item exposes retired field %s", retired)
		}
	}
	clan := swaggerDefinitionProperties(t, definitions, "modelsv2.CWLPlayerHistoryClan")
	if _, exists := clan["warLeague"]; !exists {
		t.Fatal("CWL player history clan omits warLeague")
	}
}

func TestPlayerWarAttacksOpenAPIUsesSharedWarFilters(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)
	path := "/v2/player/{player_tag}/war/attacks"
	operation := paths[path].(map[string]any)["get"].(map[string]any)
	assertParameterEnum(t, operation["parameters"], "type", []any{"cwl", "random", "friendly"})
	if got := swaggerQueryParams(t, paths, path); !reflect.DeepEqual(got, []string{"type", "time[after]", "time[before]", "limit"}) {
		t.Fatalf("player war attack query params = %v", got)
	}
}

func TestMigrationThreeOpenAPIUsesFinalRankingNotificationAndServerContracts(t *testing.T) {
	doc := buildSwaggerDoc(t)
	definitions := swaggerDefinitions(t, doc)

	playerRankings := swaggerDefinitionProperties(t, definitions, "modelsv2.PlayerRankingsResponse")
	for _, field := range []string{"tag", "homeVillage", "builderBase", "location"} {
		if _, exists := playerRankings[field]; !exists {
			t.Fatalf("PlayerRankingsResponse missing %s", field)
		}
	}
	category := swaggerDefinitionProperties(t, definitions, "modelsv2.PlayerRankingCategory")
	for _, field := range []string{"trophies", "globalRank", "localRank"} {
		property, exists := category[field].(map[string]any)
		if !exists || property["type"] != "integer" {
			t.Fatalf("PlayerRankingCategory.%s must be an optional integer: %#v", field, category[field])
		}
	}
	for _, retired := range []string{"points", "locationId", "locationName", "countryCode", "global_rank", "local_rank", "country_code", "country_name", "data", "updatedAt"} {
		if _, exists := category[retired]; exists {
			t.Fatalf("PlayerRankingCategory exposes retired field %s", retired)
		}
	}

	preferenceRequest := swaggerDefinitionProperties(t, definitions, "modelsv2.NotificationPreferencesRequest")
	for _, field := range []string{
		"deviceId", "environment", "notificationsEnabled",
		"warAttacksEnabled", "warStateEnabled", "warRemindersEnabled",
		"raidRemindersEnabled", "raidReminderTimings",
		"eventsEnabled", "announcementsEnabled",
		"monthlySupportEnabled", "reminderTimings",
	} {
		if _, exists := preferenceRequest[field]; !exists {
			t.Fatalf("NotificationPreferencesRequest missing %s", field)
		}
	}
	for _, retired := range []string{"enabled", "locale", "timezone", "types", "scopes", "subscriptions", "accountTags", "deviceEnabled", "autoAddVerifiedAccounts", "leagueBattlesEnabled", "upgradeFinishesEnabled", "legendAttacksEnabled", "legendDefensesEnabled"} {
		if _, exists := preferenceRequest[retired]; exists {
			t.Fatalf("NotificationPreferencesRequest exposes retired field %s", retired)
		}
	}

	deviceRequest := swaggerDefinitionProperties(t, definitions, "modelsv2.NotificationDeviceRequest")
	for _, retired := range []string{"apns_token", "build_number", "os_version", "device_model", "timezone"} {
		if _, exists := deviceRequest[retired]; exists {
			t.Fatalf("NotificationDeviceRequest exposes retired field %s", retired)
		}
	}

	for _, definitionName := range []string{
		"modelsv2.ServerSettingsUpdate",
		"modelsv2.ServerSettingsDocument",
		"modelsv2.ClanSettingsUpdate",
		"modelsv2.ClanSettingsDetail",
		"modelsv2.ClanSettings",
		"modelsv2.RoleSettingsUpdate",
		"modelsv2.RoleSettingsResponse",
	} {
		properties := swaggerDefinitionProperties(t, definitions, definitionName)
		for _, retired := range []string{
			"blacklisted_roles", "clan_channel", "greeting", "auto_greet_option",
			"ban_alert_channel", "api_token", "banlist", "strike_log", "reddit_feed",
		} {
			if _, exists := properties[retired]; exists {
				t.Fatalf("%s exposes retired field %s", definitionName, retired)
			}
		}
	}
	linkParse := swaggerDefinitionProperties(t, definitions, "modelsv2.LinkParseSettings")
	if _, exists := linkParse["channels"]; exists {
		t.Fatal("LinkParseSettings exposes retired channel filters")
	}
}

func TestClanCachedResponseKeepsOfficialIdentityFieldsFirst(t *testing.T) {
	body, err := json.Marshal(modelsv2.ClanCachedResponse{
		Name: "Tamilan",
		Tag:  "#22PU0L9CY",
		BadgeURLs: modelsv2.ClanBadgeURLs{
			Large: "badge.png",
		},
		Description:    "Be active perform war have fun",
		ClanLevel:      19,
		ClanPoints:     0,
		WarLeague:      modelsv2.ClanLeagueRef{ID: 48000009, Name: "Gold League I"},
		PublicWarLog:   false,
		WarWins:        70,
		WarWinStreak:   0,
		MemberCount:    39,
		TroopsDonated:  2150,
		TroopsReceived: 2150,
		Members:        []modelsv2.ClanCachedMember{{Tag: "#P1", Name: "Player", TownHallLevel: 17}},
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
	if !strings.Contains(payload, `"townHallLevel":17`) || strings.Contains(payload, `"town_hall"`) {
		t.Fatalf("expected cached members to use townHallLevel: %s", payload)
	}
}

func TestClanCachedResponseHasNoRecords(t *testing.T) {
	body, err := json.Marshal(modelsv2.ClanCachedResponse{
		Name: "Tamilan",
		Tag:  "#22PU0L9CY",
		BadgeURLs: modelsv2.ClanBadgeURLs{
			Large: "badge.png",
		},
		Members: []modelsv2.ClanCachedMember{},
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), `"records"`) {
		t.Fatalf("expected records to be absent from cached response: %s", body)
	}
}

func TestBuildDocIncludesPublicStatsSectionsFirst(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)

	for _, path := range []string{
		"/v2/player/{player_tag}/rankings",
		"/v2/player/{player_tag}/battlelog/history",
		"/v2/player/{player_tag}/legend-history",
		"/v2/clan/{clan_tag}/history/legends",
		"/v2/clan/{clan_tag}/history/legends/summary",
		"/v2/legends/history/{season}",
		"/v2/player/{player_tag}/ranked/{season}/battlelog",
		"/v2/player/{player_tag}/ranked/{season}/group",
		"/v2/player/{player_tag}/history/changes",
		"/v2/player/{player_tag}/leaderboard-history/{leaderboard_type}",
		"/v2/clan/{clan_tag}/history/leaderboards",
		"/v2/clan/{clan_tag}/history/leaderboards/summary",
		"/v2/leaderboard/history/{leaderboard_type}/{location_id}/{date}",
		"/v2/leaderboard/league/{league_tier_id}",
		"/v2/leaderboard/townhalls/{townhall_level}",
		"/v2/leaderboard/{location_id}/clan/donations",
		"/v2/leaderboard/{location_id}/clan/war-wins",
		"/v2/leaderboard/clan/win-streak",
		"/v2/leaderboard/{league_tier_id}/trophy-buckets",
		"/v2/counts",
		"/v2/counts/players/town-halls",
		"/v2/counts/players/builder-halls",
		"/v2/counts/players/league-tiers",
		"/v2/counts/clans/locations",
		"/v2/counts/clans/cwl-leagues",
		"/v2/counts/clans/capital-leagues",
		"/v2/stats/overview",
		"/v2/stats/armies",
		"/v2/stats/items",
		"/v2/stats/ranked",
		"/v2/stats/war",
		"/v2/stats/cwl",
		"/v2/clan/{clan_tag}/history/changes",
		"/v2/clan/{clan_tag}/rankings",
		"/v2/clan/{clan_tag}/cached",
		"/v2/clan/{clan_tag}/records",
	} {
		if _, exists := paths[path]; !exists {
			t.Fatalf("expected public stats path %s in swagger", path)
		}
	}
	builderHallPath, ok := paths["/v2/counts/players/builder-halls"].(map[string]any)
	if !ok {
		t.Fatal("expected Builder Hall counts path object")
	}
	builderHallGet, ok := builderHallPath["get"].(map[string]any)
	if !ok {
		t.Fatal("expected Builder Hall counts GET operation")
	}
	builderHallResponses, ok := builderHallGet["responses"].(map[string]any)
	if !ok {
		t.Fatal("expected Builder Hall counts responses")
	}
	if _, exists := builderHallResponses["501"]; !exists {
		t.Fatal("expected Builder Hall counts to document 501")
	}
	if _, exists := builderHallResponses["200"]; exists {
		t.Fatal("expected Builder Hall counts not to advertise fake successful data")
	}
	for path, rawPath := range paths {
		pathOperations, _ := rawPath.(map[string]any)
		for _, rawOperation := range pathOperations {
			operation, _ := rawOperation.(map[string]any)
			responses, _ := operation["responses"].(map[string]any)
			if _, exists := responses["501"]; exists && path != "/v2/counts/players/builder-halls" {
				t.Fatalf("expected only Builder Hall counts to document 501, found %s", path)
			}
		}
	}
	definitions := swaggerDefinitions(t, doc)
	groupedCountProps := swaggerDefinitionProperties(t, definitions, "modelsv2.GroupedCountItem")
	if _, exists := groupedCountProps["builderhall_level"]; exists {
		t.Fatal("expected grouped count model not to expose unsupported Builder Hall counts")
	}
	leaderboardSnapshotProps := swaggerDefinitionProperties(t, definitions, "modelsv2.LeaderboardSnapshotHistoryResponse")
	for _, field := range []string{"type", "locationId", "date", "items"} {
		if _, exists := leaderboardSnapshotProps[field]; !exists {
			t.Fatalf("expected leaderboard snapshot response field %s", field)
		}
	}
	leaderboardEntityProps := swaggerDefinitionProperties(t, definitions, "modelsv2.LeaderboardEntityHistoryItem")
	for _, field := range []string{"date", "locationId", "name", "rank", "details"} {
		if _, exists := leaderboardEntityProps[field]; !exists {
			t.Fatalf("expected leaderboard entity response field %s", field)
		}
	}
	leaderboardItemProps := swaggerDefinitionProperties(t, definitions, "modelsv2.LeaderboardHistoryItem")
	for _, field := range []string{
		"tag",
		"name",
		"expLevel",
		"trophies",
		"attackWins",
		"defenseWins",
		"builderBaseTrophies",
		"builderBaseBattleWins",
		"clan",
		"league",
		"leagueTier",
		"builderBaseLeague",
		"badgeUrls",
		"clanLevel",
		"clanPoints",
		"builderBasePoints",
		"capitalPoints",
		"members",
		"location",
		"rank",
		"previousRank",
	} {
		if _, exists := leaderboardItemProps[field]; !exists {
			t.Fatalf("expected typed leaderboard history item field %s", field)
		}
	}
	for _, forbidden := range []string{"data", "kind", "badgeToken"} {
		if _, exists := leaderboardItemProps[forbidden]; exists {
			t.Fatalf("typed leaderboard history item exposes internal field %s", forbidden)
		}
	}
	playerLeaderboardProps := swaggerDefinitionProperties(t, definitions, "modelsv2.PlayerLeaderboardHistoryResponse")
	if _, exists := playerLeaderboardProps["playerTag"]; !exists {
		t.Fatal("expected player leaderboard history to expose playerTag")
	}
	clanLeaderboardProps := swaggerDefinitionProperties(t, definitions, "modelsv2.ClanLeaderboardHistoryResponse")
	if len(clanLeaderboardProps) != 1 || clanLeaderboardProps["items"] == nil {
		t.Fatalf("expected clan leaderboard history to expose only items, got %v", clanLeaderboardProps)
	}
	clanLeaderboardItemProps := swaggerDefinitionProperties(t, definitions, "modelsv2.ClanLeaderboardHistoryItem")
	for _, field := range []string{"date", "rank", "clanPoints", "builderBasePoints", "capitalPoints", "members", "location"} {
		if _, exists := clanLeaderboardItemProps[field]; !exists {
			t.Fatalf("expected clan leaderboard history item field %s", field)
		}
	}
	for _, retired := range []string{"type", "clanTag", "name", "locationId", "details", "tag"} {
		if _, exists := clanLeaderboardItemProps[retired]; exists {
			t.Fatalf("clan leaderboard history item exposes retired field %s", retired)
		}
	}
	clanLeaderboardPath := paths["/v2/clan/{clan_tag}/history/leaderboards"].(map[string]any)
	clanLeaderboardGet := clanLeaderboardPath["get"].(map[string]any)
	assertTags(t, clanLeaderboardGet, []string{"Clan"})
	if got := swaggerQueryParams(t, paths, "/v2/clan/{clan_tag}/history/leaderboards"); !reflect.DeepEqual(got, []string{"type", "time[after]", "time[before]", "limit"}) {
		t.Fatalf("clan leaderboard history query params = %v", got)
	}
	assertRequiredParameter(t, clanLeaderboardGet["parameters"].([]any), "type", "query")
	assertParameterEnum(t, clanLeaderboardGet["parameters"], "type", []any{"clan_home_points", "clan_builder_base_points", "clan_capital_points"})
	assertQueryParameterSchemaValue(t, clanLeaderboardGet["parameters"], "limit", "default", float64(50))
	assertQueryParameterSchemaValue(t, clanLeaderboardGet["parameters"], "limit", "maximum", float64(250))
	clanLeaderboardSummaryPath := paths["/v2/clan/{clan_tag}/history/leaderboards/summary"].(map[string]any)
	clanLeaderboardSummaryGet := clanLeaderboardSummaryPath["get"].(map[string]any)
	assertTags(t, clanLeaderboardSummaryGet, []string{"Clan"})
	if got := swaggerQueryParams(t, paths, "/v2/clan/{clan_tag}/history/leaderboards/summary"); !reflect.DeepEqual(got, []string{"type"}) {
		t.Fatalf("clan leaderboard summary query params = %v", got)
	}
	assertRequiredParameter(t, clanLeaderboardSummaryGet["parameters"].([]any), "type", "query")
	assertParameterEnum(t, clanLeaderboardSummaryGet["parameters"], "type", []any{"clan_home_points", "clan_builder_base_points", "clan_capital_points"})
	for _, definition := range []string{
		"modelsv2.LegendSeasonHistoryResponse",
		"modelsv2.PlayerLegendHistoryResponse",
		"modelsv2.ClanLegendHistoryResponse",
	} {
		properties := swaggerDefinitionProperties(t, definitions, definition)
		if len(properties) != 1 || properties["items"] == nil {
			t.Fatalf("expected %s to expose only items, got %v", definition, properties)
		}
	}
	legendHistoryItemProps := swaggerDefinitionProperties(t, definitions, "modelsv2.LegendHistoryItem")
	for _, field := range []string{
		"season",
		"tag",
		"name",
		"expLevel",
		"trophies",
		"attackWins",
		"defenseWins",
		"rank",
		"clan",
		"leagueTier",
	} {
		if _, exists := legendHistoryItemProps[field]; !exists {
			t.Fatalf("expected final Legend item field %s", field)
		}
	}
	for _, unavailable := range []string{"previousRank", "league", "townHallLevel", "badgeToken", "data"} {
		if _, exists := legendHistoryItemProps[unavailable]; exists {
			t.Fatalf("Legend item exposes unavailable/internal field %s", unavailable)
		}
	}
	clanLegendItemProps := swaggerDefinitionProperties(t, definitions, "modelsv2.ClanLegendHistoryItem")
	if len(clanLegendItemProps) != 8 {
		t.Fatalf("expected compact clan Legend item, got %v", clanLegendItemProps)
	}
	for _, field := range []string{"season", "tag", "name", "expLevel", "trophies", "attackWins", "defenseWins", "rank"} {
		if _, exists := clanLegendItemProps[field]; !exists {
			t.Fatalf("expected clan Legend item field %s", field)
		}
	}
	clanLegendPath := paths["/v2/clan/{clan_tag}/history/legends"].(map[string]any)
	clanLegendGet := clanLegendPath["get"].(map[string]any)
	assertTags(t, clanLegendGet, []string{"Clan"})
	if got := swaggerQueryParams(t, paths, "/v2/clan/{clan_tag}/history/legends"); !reflect.DeepEqual(got, []string{"time[after]", "time[before]", "limit"}) {
		t.Fatalf("clan Legend history query params = %v", got)
	}
	assertQueryParameterSchemaValue(t, clanLegendGet["parameters"], "limit", "default", float64(50))
	assertQueryParameterSchemaValue(t, clanLegendGet["parameters"], "limit", "maximum", float64(250))
	clanLegendSummaryPath := paths["/v2/clan/{clan_tag}/history/legends/summary"].(map[string]any)
	clanLegendSummaryGet := clanLegendSummaryPath["get"].(map[string]any)
	assertTags(t, clanLegendSummaryGet, []string{"Clan"})
	if got := swaggerQueryParams(t, paths, "/v2/clan/{clan_tag}/history/legends/summary"); len(got) != 0 {
		t.Fatalf("clan Legend summary query params = %v", got)
	}
	snapshotPath := paths["/v2/leaderboard/history/{leaderboard_type}/{location_id}/{date}"].(map[string]any)
	snapshotGet := snapshotPath["get"].(map[string]any)
	assertParameterEnum(t, snapshotGet["parameters"], "leaderboard_type", []any{
		"player_home_trophies",
		"player_builder_base_trophies",
		"clan_home_points",
		"clan_builder_base_points",
		"clan_capital_points",
	})
	for _, path := range []string{
		"/v2/leaderboard/league/{league_tier_id}/history/{date}",
		"/v2/leaderboard/townhalls/{townhall_level}/history/{date}",
		"/v2/global/cwl-leagues",
		"/v2/global/clan/locations",
		"/v2/global/townhalls",
		"/v2/global/builderhalls",
		"/v2/global/capital-leagues",
		"/v2/global/leaguetiers",
		"/v2/global/war/completed/daily",
		"/v2/global/war/townhall/{townhall_level}/hitrate/weekly",
		"/v2/battlelogs/ranked/armies",
		"/v2/battlelogs/farming/armies",
	} {
		if _, exists := paths[path]; exists {
			t.Fatalf("expected replaced public stats path %s to be absent", path)
		}
	}

	tags, ok := doc["tags"].([]any)
	if !ok {
		t.Fatal("expected swagger tags list")
	}
	want := []string{"Player", "Clan", "War & CWL", "Leaderboard", "Counts", "Stats", "Search", "Dates", "Links"}
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
		case "Battlelogs", "Rankings", "Lists", "Auth", "Legacy Bot", "Legacy Links", "Legacy War", "Legacy Rankings", "Legacy Lists", "CDN", "Exports", "Guild", "Guilds", "Internal", "Tracking Endpoints", "Static Data":
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
	for _, marker := range []string{"Public Stats", "PlannedEndpoint", "planned public stats"} {
		if strings.Contains(raw, marker) {
			t.Fatalf("expected generated swagger not to contain %q", marker)
		}
	}
}

func TestBuildDocRepresentsQueryOperationsWithoutAdvertisingPost(t *testing.T) {
	paths := swaggerPaths(t, buildSwaggerDoc(t))
	for _, path := range []string{"/v2/home/activity", "/v2/stats/armies", "/v2/stats/items", "/v2/stats/ranked", "/v2/stats/war", "/v2/stats/cwl"} {
		operation, ok := paths[path].(map[string]any)
		if !ok {
			t.Fatalf("expected path object for %s", path)
		}
		if _, exists := operation["post"]; exists {
			t.Fatalf("expected %s not to advertise POST", path)
		}
		query, ok := operation["query"].(map[string]any)
		if !ok {
			t.Fatalf("expected %s to contain a native QUERY operation, got %v", path, operation)
		}
		requestBody, _ := query["requestBody"].(map[string]any)
		content, _ := requestBody["content"].(map[string]any)
		if _, ok := content["application/json"]; !ok {
			t.Fatalf("expected %s QUERY operation to accept application/json, got %v", path, requestBody)
		}
	}
}

func TestSearchOpenAPIUsesGETAndOwningSections(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)

	player := paths["/v2/player/search"].(map[string]any)["get"].(map[string]any)
	assertTags(t, player, []string{"Player"})
	if got := swaggerQueryParams(t, paths, "/v2/player/search"); !reflect.DeepEqual(got, []string{"query", "clanTags", "leagueIds", "townhallLevels", "limit", "cursor"}) {
		t.Fatalf("player search query params = %v", got)
	}
	assertRequiredParameter(t, player["parameters"].([]any), "query", "query")
	assertQueryParameterSchemaValue(t, player["parameters"], "limit", "default", float64(25))
	assertQueryParameterSchemaValue(t, player["parameters"], "limit", "maximum", float64(200))

	clan := paths["/v2/clan/search"].(map[string]any)["get"].(map[string]any)
	assertTags(t, clan, []string{"Clan"})
	if got := swaggerQueryParams(t, paths, "/v2/clan/search"); !reflect.DeepEqual(got, []string{"query", "locationIds", "warLeagueIds", "clanLevel[min]", "clanLevel[max]", "members[min]", "members[max]", "limit", "cursor"}) {
		t.Fatalf("clan search query params = %v", got)
	}
	assertRequiredParameter(t, clan["parameters"].([]any), "query", "query")

	definitions := swaggerDefinitions(t, doc)
	pagination := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchCursorPage")
	for _, field := range []string{"limit", "hasMore", "nextCursor"} {
		if _, exists := pagination[field]; !exists {
			t.Fatalf("search pagination missing %s", field)
		}
	}
	for _, retired := range []string{"has_more", "next_cursor"} {
		if _, exists := pagination[retired]; exists {
			t.Fatalf("search pagination exposes retired field %s", retired)
		}
	}
}

func TestSearchOpenAPIUsesCompactTypedContracts(t *testing.T) {
	doc := buildSwaggerDoc(t)
	definitions := swaggerDefinitions(t, doc)

	clan := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchClanResult")
	for _, field := range []string{"name", "tag", "badge", "clanLevel", "location", "warLeague", "members"} {
		if _, ok := clan[field]; !ok {
			t.Fatalf("clan search result omits %s", field)
		}
	}
	if _, ok := clan["badgeUrls"]; ok {
		t.Fatal("clan search result exposes badgeUrls instead of compact badge")
	}
	assertRef(t, clan["location"], "#/components/schemas/modelsv2.SearchLocation")
	assertRef(t, clan["warLeague"], "#/components/schemas/modelsv2.SearchLeagueReference")

	player := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchPlayerResult")
	assertRef(t, player["leagueTier"], "#/components/schemas/modelsv2.SearchLeagueReference")
	assertRef(t, player["clan"], "#/components/schemas/modelsv2.SearchPlayerClan")
	league := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchLeagueReference")
	if _, ok := league["badge"]; ok {
		t.Fatal("search league tier exposes an unwanted badge")
	}
	playerClan := swaggerDefinitionProperties(t, definitions, "modelsv2.SearchPlayerClan")
	if _, ok := playerClan["badge"]; !ok {
		t.Fatal("player clan omits compact badge")
	}

	timers := swaggerDefinitionProperties(t, definitions, "modelsv2.PlayerTimer")
	for _, field := range []string{"type", "expiresAt", "warTag", "clans"} {
		if _, ok := timers[field]; !ok {
			t.Fatalf("player timer omits %s", field)
		}
	}
	assertEnum(t, timers["type"], []any{"war", "cwl", "capital"})
}

func TestServerLogAndReminderDestinationOpenAPIContract(t *testing.T) {
	doc := buildSwaggerDoc(t)
	definitions := swaggerDefinitions(t, doc)

	for _, definition := range []string{
		"modelsv2.ServerLog",
		"modelsv2.UpdateServerLogsRequest",
		"modelsv2.ReminderConfig",
		"modelsv2.CreateReminderRequest",
		"modelsv2.UpdateReminderRequest",
	} {
		props := swaggerDefinitionProperties(t, definitions, definition)
		thread, ok := props["thread_id"].(map[string]any)
		if !ok || !isNullableType(thread, "string") {
			t.Fatalf("expected %s.thread_id to be nullable string, got %v", definition, props["thread_id"])
		}
	}

	channelProps := swaggerDefinitionProperties(t, definitions, "modelsv2.DiscordChannel")
	assertEnum(t, channelProps["type"], []any{"category", "text", "news", "forum"})

	paths := swaggerPaths(t, doc)
	assertSwaggerBodyRef(t, paths, "/v2/server/{server_id}/logs", "put", "#/components/schemas/modelsv2.UpdateServerLogsRequest")
	assertSwaggerBodyRef(t, paths, "/v2/server/{server_id}/reminders", "post", "#/components/schemas/modelsv2.CreateReminderRequest")
	assertSwaggerBodyRef(t, paths, "/v2/server/{server_id}/reminders/{reminder_id}", "put", "#/components/schemas/modelsv2.UpdateReminderRequest")
}

func assertSwaggerBodyRef(t *testing.T, paths map[string]any, path, method, wantRef string) {
	t.Helper()
	pathItem, ok := paths[path].(map[string]any)
	if !ok {
		t.Fatalf("expected path %s", path)
	}
	operation, ok := pathItem[method].(map[string]any)
	if !ok {
		t.Fatalf("expected %s %s operation", method, path)
	}
	requestBody, _ := operation["requestBody"].(map[string]any)
	content, _ := requestBody["content"].(map[string]any)
	mediaType, _ := content["application/json"].(map[string]any)
	schema, _ := mediaType["schema"].(map[string]any)
	if schema["$ref"] != wantRef {
		t.Fatalf("expected %s %s body ref %s, got %v", method, path, wantRef, schema)
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
	components, ok := doc["components"].(map[string]any)
	if !ok {
		t.Fatal("expected OpenAPI components")
	}
	schemas, ok := components["schemas"].(map[string]any)
	if !ok {
		t.Fatal("expected OpenAPI component schemas")
	}
	return schemas
}

func openAPIResponseSchema(t *testing.T, response map[string]any) map[string]any {
	t.Helper()
	content, ok := response["content"].(map[string]any)
	if !ok {
		t.Fatalf("expected response content, got %v", response)
	}
	mediaType, ok := content["application/json"].(map[string]any)
	if !ok {
		t.Fatalf("expected application/json response, got %v", content)
	}
	schema, ok := mediaType["schema"].(map[string]any)
	if !ok {
		t.Fatalf("expected response schema, got %v", mediaType)
	}
	return schema
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

func isNullable(schema map[string]any) bool {
	types, ok := schema["type"].([]any)
	if !ok {
		return false
	}
	for _, schemaType := range types {
		if schemaType == "null" {
			return true
		}
	}
	return false
}

func isNullableType(schema map[string]any, want string) bool {
	types, ok := schema["type"].([]any)
	return ok && reflect.DeepEqual(types, []any{want, "null"})
}

func assertSwaggerMaxItems(t *testing.T, value any, want float64) {
	t.Helper()
	field, _ := value.(map[string]any)
	if field["maxItems"] != want {
		t.Fatalf("expected maxItems %.0f, got %v", want, value)
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
			schema, _ := param["schema"].(map[string]any)
			if !reflect.DeepEqual(schema["enum"], want) {
				t.Fatalf("expected %s enum %v, got %v", name, want, param)
			}
			return
		}
	}
	t.Fatalf("expected %s parameter in %v", name, params)
}

func assertQueryParameterSchemaValue(t *testing.T, value any, name, key string, want any) {
	t.Helper()
	params, ok := value.([]any)
	if !ok {
		t.Fatalf("expected parameters array, got %v", value)
	}
	for _, raw := range params {
		param, _ := raw.(map[string]any)
		if param["name"] == name && param["in"] == "query" {
			schema, _ := param["schema"].(map[string]any)
			if !reflect.DeepEqual(schema[key], want) {
				t.Fatalf("expected %s %s %v, got %v", name, key, want, param)
			}
			return
		}
	}
	t.Fatalf("expected query parameter %s in %v", name, params)
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
