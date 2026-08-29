package routes

import (
	"net/http/httptest"
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestRegisterOmitsRemovedRoutesAndKeepsV2Routes(t *testing.T) {
	app := newRegisteredRoutesTestApp()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	paths := registeredRoutePaths(app)
	for _, path := range []string{
		"/v1/*",
		"/ck/bulk",
		"/assets",
		"/json/:data_type",
		"/activity",
		"/boost-rate",
		"/clan-games",
		"/donations",
		"/capital",
		"/capital/bulk",
		"/capital/stats/district",
		"/capital/stats/leagues",
		"/capital/:clan_tag",
		"/clan/:clan_tag/basic",
		"/clan/:clan_tag/wars",
		"/clan/:clan_tag/join-leave",
		"/clan/search",
		"/clan/:clan_tag/historical",
		"/legends/clan/:clan_tag/:date",
		"/legends/streaks",
		"/legends/trophy-buckets",
		"/legends/eos-winners",
		"/player/:player_tag/stats",
		"/player/:player_tag/legends",
		"/player/:player_tag/historical/:season",
		"/player/:player_tag/warhits",
		"/player/:player_tag/war/attacks",
		"/player/:player_tag/war/stats",
		"/player/:player_tag/raids",
		"/player/to-do",
		"/player/:player_tag/legend_rankings",
		"/player/:player_tag/wartimer",
		"/player/:player_tag/join-leave",
		"/player/search/:name",
		"/player/full-search/:name",
		"/v2/capital/player-stats",
		"/v2/capital/guild-leaderboard",
		"/v2/server/:server_id/leaderboards/capital-raids",
		"/v2/server/:server_id/leaderboards/activity",
		"/v2/server/:server_id/leaderboards/looting",
		"/v2/clan/:clan_tag/donations/:season",
		"/v2/legends/players/day/:day",
		"/v2/legends/players/season/:season",
		"/v2/legends/guild-stats",
		"/v2/legends/daily-tracking",
		"/v2/player/:player_tag/extended",
		"/v2/leaderboard/league/:league_tier_id/history/:date",
		"/v2/leaderboard/townhalls/:townhall_level/history/:date",
		"/v2/players",
		"/v2/players/location",
		"/v2/players/sorted/:attribute",
		"/v2/players/summary/:season/top",
		"/v2/players/extended",
		"/v2/players/legend-days",
		"/v2/players/legend_rankings",
		"/v2/users/coc-accounts",
		"/v2/users/coc-accounts/order",
		"/v2/users/coc-accounts/:player_tag",
		"/v2/users/coc-accounts/:player_tag/status",
		"/v2/users/coc-accounts/:player_tag/verify",
		"/v2/users/coc-accounts/verified",
		"/v2/server/:server_id/links",
		"/v2/server/:server_id/links/:user_id/:player_tag",
		"/v2/server/:server_id/links/bulk-unlink",
		"/v2/link-discord",
		"/v2/auth/link-discord",
		"/v2/link-email",
		"/v2/auth/link-email",
		"/v2/search/bookmark/:user_id/:search_type/:tag",
		"/v2/search/recent/:user_id/:search_type/:tag",
		"/v2/roster/bindings",
		"/v2/me/rosters/recent",
		"/v2/internal/roster-bindings/:binding_id/pending",
		"/v2/internal/roster-bindings/:binding_id/events",
		"/v2/search/:id/items",
		"/server-settings/:server_id",
		"/guild_links/:guild_id",
		"/shortner",
		"/shortlink",
		"/war-stats",
		"/bot/config",
		"/ranking/player-trophies/:location/:date",
		"/ranking/player-builder/:location/:date",
		"/ranking/clan-trophies/:location/:date",
		"/ranking/clan-builder/:location/:date",
		"/ranking/clan-capital/:location/:date",
		"/v2/categories",
		"/v2/static/categories",
		"/v2/static/app-bundle",
		"/v2/static/app-translations",
		"/v2/:category/names",
		"/v2/:category/:item_id_or_name/maxlevel",
		"/v2/static/:category/:item_id_or_name/maxlevel",
		"/v2/:category/:item_id_or_name",
		"/v2/static/:category/:item_id_or_name",
		"/v2/:category",
		"/v2/static/:category",
		"/v2/server/:server_id/logs/:log_type",
		"/v2/server/:server_id/clan-logs",
		"/v2/server/:server_id/clan/:clan_tag/logs",
		"/v2/global/cwl-leagues",
		"/v2/global/clan/locations",
		"/v2/global/townhalls",
		"/v2/global/builderhalls",
		"/v2/global/capital-leagues",
		"/v2/global/leaguetiers",
		"/v2/global/war/townhall/:townhall_level/hitrate/weekly",
		"/v2/global/war/completed/daily",
		"/v2/battlelogs/ranked/armies",
		"/v2/battlelogs/farming/armies",
		"/v2/battlelogs/items/townhall/:townhall_level/usage",
		"/v2/battlelogs/items/townhall/:townhall_level/hitrate",
		"/v2/battlelogs/items/league/:league_id/usage",
		"/v2/battlelogs/items/league/:league_id/hitrate",
		"/v2/battlelogs/items/top200/usage",
		"/v2/battlelogs/items/top200/hitrate",
		"/v2/clan/:clan_tag/badge",
		"/v2/clan/:clan_tag/basic",
		"/v2/clan/:clan_tag/changes",
		"/v2/clan/:clan_tag/war-log",
		"/v2/player/:player_tag/changes",
		"/v2/player/:player_tag/stat-history",
		"/global/war/townhall/:townhall_level/hitrate/weekly",
		"/global/war/completed/daily",
		"/war/:clan_tag/previous",
		"/war/:clan_tag/previous/:end_time",
		"/v2/war/:clan_tag/previous",
		"/v2/cwl/leagues/:league_id/rankings",
		"/v2/cwl/league-thresholds",
		"/v2/war/clan/stats",
		"/v2/war/stats",
		"/v2/war/war-summary",
		"/v2/war/:clan_tag/war-summary",
		"/v2/war/players/warhits",
		"/v2/war/clans/warhits",
		"/v2/cwl/:clan_tag",
		"/v2/clan/:clan_tag/leaderboard-history/:leaderboard_type",
		"/v2/clan/:clan_tag/leaderboard-history",
		"/v2/clan/:clan_tag/legend-history",
		"/v2/search/clan",
		"/v2/search/player",
		"/war/:clanTag/previous",
		"/war/:clanTag/basic",
		"/cwl/:clanTag/group",
		"/cwl/:clanTag/:season",
	} {
		if paths[path] {
			t.Fatalf("expected %s to be absent from registered routes", path)
		}
	}

	for _, path := range []string{
		"/v2/clan/:clan_tag/join-leave",
		"/v2/player/:player_tag/join-leave",
		"/v2/player/:player_tag/war/attacks",
		"/v2/player/:player_tag/war/stats",
		"/v2/player/:player_tag/history/changes",
		"/v2/player/:player_tag/timers",
		"/v2/player/search",
		"/v2/clan/search",
		"/v2/player/:player_tag/history/stats",
		"/v2/player/:player_tag/legend-history",
		"/v2/clan/:clan_tag/history/legends",
		"/v2/clan/:clan_tag/cached",
		"/v2/clan/:clan_tag/records",
		"/v2/clan/:clan_tag/history/changes",
		"/v2/clan/:clan_tag/warlog",
		"/v2/legends/history/:season",
		"/v2/player/:player_tag/cwl/history",
		"/v2/server/:server_id/cwl/:clan_tag/bonus-recipients",
		"/v2/cwl/:clan_tag/seasons",
		"/v2/cwl/:clan_tag/group",
		"/v2/cwl/:clan_tag/ranking-history",
		"/v2/leaderboard/cwl/:league_id",
		"/v2/war/:clan_tag/previous/:endtime",
		"/v2/war/:clan_tag/basic",
		"/v2/links/:id",
		"/v2/links/:id/:playerTag",
		"/v2/links/:id/order",
		"/v2/links/:id/bookmarks",
		"/v2/links/:id/bookmarks/:type/:tag",
		"/v2/links/:id/bookmarks/order",
		"/v2/links/:id/searches",
		"/v2/links/:id/last-login",
		"/v2/links/:id/:playerTag/upgrades",
		"/v2/links/:id/:playerTag/upgrade-preferences",
		"/v2/home/activity",
		"/v2/notifications/devices",
		"/v2/notifications/preferences",
		"/v2/app/announcements/active",
		"/v2/app/announcements/:id",
		"/v2/app/posts",
		"/v2/player/:player_tag/leaderboard-history/:leaderboard_type",
		"/v2/clan/:clan_tag/history/leaderboards",
		"/v2/leaderboard/history/:leaderboard_type/:location_id/:date",
		"/builderbaseleagues",
		"/v2/links/server/:server_id",
		"/v2/server/:server_id/reactivate",
		"/v2/server/:server_id/dashboard-capabilities",
		"/v2/server/:server_id/dashboard-access",
		"/v2/roster/ai/context",
		"/v2/roster/ai/usage",
		"/v2/roster/metrics/query",
		"/v2/server/:server_id/rosters/:roster_id/discord-identity/refresh",
		"/v2/server/:server_id/bot-profile",
		"/v2/server/:server_id/bases",
		"/v2/server/:server_id/bases/images",
		"/v2/server/:server_id/bases/:base_id",
		"/v2/server/:server_id/bases/:base_id/downloaders/:user_id",
		"/v2/bases/:base_id/votes/:voter_id",
		"/v2/bases/:base_id/downloaders/:user_id",
		"/v2/server/:server_id/clan-categories",
		"/v2/server/:server_id/clan-categories/:category_id",
		"/v2/server/:server_id/clan-categories/:category_id/delete-preview",
		"/v2/enums",
		"/v2/enums/role-types",
		"/v2/enums/role-modes",
		"/v2/enums/log-types",
		"/v2/enums/countdown-types",
		"/v2/static/:category/names",
		"/v2/static/:category/:item_id_or_name/max-level",
		"/v2/server/:server_id/server-roles",
		"/v2/server/:server_id/server-roles/:role_id",
		"/v2/server/:server_id/logs",
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
		"/global/counts",
	} {
		if !paths[path] {
			t.Fatalf("expected %s to be registered", path)
		}
	}
}

func TestServerLinkMutationsAreRegisteredBeforeGenericPersonalLinkMutations(t *testing.T) {
	app := newRegisteredRoutesTestApp()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	for _, method := range []string{fiber.MethodDelete} {
		serverIndex := registeredRouteIndex(app, method, "/v2/links/server/:server_id")
		personalIndex := registeredRouteIndex(app, method, "/v2/links/:id/:playerTag")
		if serverIndex < 0 || personalIndex < 0 {
			t.Fatalf("expected both %s link routes to be registered", method)
		}
		if serverIndex >= personalIndex {
			t.Fatalf("expected static server %s route before generic personal route", method)
		}
	}
}

func TestServerLogMethodsAreRegistered(t *testing.T) {
	app := newRegisteredRoutesTestApp()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	for _, method := range []string{fiber.MethodGet, fiber.MethodPut, fiber.MethodPatch, fiber.MethodDelete} {
		if registeredRouteIndex(app, method, "/v2/server/:server_id/logs") < 0 {
			t.Fatalf("expected %s /v2/server/:server_id/logs to be registered", method)
		}
	}
}

func TestVersionedWarPreviousRequiresEndTimePath(t *testing.T) {
	app := newRegisteredRoutesTestAppWithErrorHandler()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	resp, err := app.Test(httptest.NewRequest("GET", "/v2/war/%232PP/previous/not-a-time", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("expected invalid endtime to return 400, got %d", resp.StatusCode)
	}
}

func TestHomeActivityUsesRFCQueryMethod(t *testing.T) {
	app := newRegisteredRoutesTestApp()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	if index := registeredRouteIndex(app, apptypes.MethodQuery, "/v2/home/activity"); index < 0 {
		t.Fatal("expected /v2/home/activity to be registered with QUERY")
	}
	if index := registeredRouteIndex(app, fiber.MethodPost, "/v2/home/activity"); index >= 0 {
		t.Fatal("did not expect a POST compatibility route for /v2/home/activity")
	}
}

func TestSearchRoutesUseGETUnderOwningResources(t *testing.T) {
	app := newRegisteredRoutesTestApp()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	for _, path := range []string{"/v2/clan/search", "/v2/player/search"} {
		if index := registeredRouteIndex(app, fiber.MethodGet, path); index < 0 {
			t.Fatalf("expected %s to be registered with GET", path)
		}
		for _, method := range []string{apptypes.MethodQuery, fiber.MethodPost} {
			if index := registeredRouteIndex(app, method, path); index >= 0 {
				t.Fatalf("did not expect a %s compatibility route for %s", method, path)
			}
		}
	}
	for _, path := range []string{"/v2/search/clan", "/v2/search/player"} {
		if index := registeredRouteIndex(app, apptypes.MethodQuery, path); index >= 0 {
			t.Fatalf("retired search route %s remains registered", path)
		}
	}
}

func TestAutoboardsUseCleanBreakRoutes(t *testing.T) {
	app := newRegisteredRoutesTestApp()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	for _, route := range []struct {
		method string
		path   string
	}{
		{fiber.MethodGet, "/v2/server/:server_id/autoboards/capabilities"},
		{fiber.MethodGet, "/v2/server/:server_id/autoboards"},
		{fiber.MethodPost, "/v2/server/:server_id/autoboards"},
		{fiber.MethodPut, "/v2/server/:server_id/autoboards/:autoboard_id"},
		{fiber.MethodDelete, "/v2/server/:server_id/autoboards/:autoboard_id"},
	} {
		if registeredRouteIndex(app, route.method, route.path) < 0 {
			t.Fatalf("expected %s %s to be registered", route.method, route.path)
		}
	}
	if registeredRouteIndex(app, fiber.MethodPatch, "/v2/server/:server_id/autoboards/:autoboard_id") >= 0 {
		t.Fatal("legacy partial PATCH autoboard route is still registered")
	}
}

func newRegisteredRoutesTestApp() *fiber.App {
	return fiber.New(fiber.Config{RequestMethods: apptypes.APIRequestMethods()})
}

func newRegisteredRoutesTestAppWithErrorHandler() *fiber.App {
	return fiber.New(fiber.Config{
		ErrorHandler:   apptypes.ErrorHandler,
		RequestMethods: apptypes.APIRequestMethods(),
	})
}

func registeredRoutePaths(app *fiber.App) map[string]bool {
	paths := map[string]bool{}
	for _, routes := range app.Stack() {
		for _, route := range routes {
			paths[route.Path] = true
		}
	}
	return paths
}

func registeredRouteIndex(app *fiber.App, method, path string) int {
	index := 0
	for _, routes := range app.Stack() {
		for _, route := range routes {
			if route.Method == method && route.Path == path {
				return index
			}
			index++
		}
	}
	return -1
}
