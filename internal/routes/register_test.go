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
		"/v2/clan/:clan_tag/donations/:season",
		"/v2/legends/players/day/:day",
		"/v2/legends/players/season/:season",
		"/v2/legends/guild-stats",
		"/v2/legends/daily-tracking",
		"/v2/player/:player_tag/extended",
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
		"/v2/static/:category/names",
		"/v2/:category/:item_id_or_name/maxlevel",
		"/v2/static/:category/:item_id_or_name/maxlevel",
		"/v2/:category/:item_id_or_name",
		"/v2/static/:category/:item_id_or_name",
		"/v2/:category",
		"/v2/static/:category",
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
		"/global/war/townhall/:townhall_level/hitrate/weekly",
		"/global/war/completed/daily",
		"/war/:clan_tag/previous",
		"/war/:clan_tag/previous/:end_time",
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
		"/v2/links/:id",
		"/v2/links/:id/:playerTag",
		"/v2/links/:id/order",
		"/v2/links/:id/bookmarks",
		"/v2/links/:id/bookmarks/:type/:tag",
		"/v2/links/:id/bookmarks/order",
		"/v2/links/:id/searches",
		"/war/:clanTag/previous",
		"/war/:clanTag/basic",
		"/cwl/:clanTag/group",
		"/cwl/:clanTag/:season",
		"/v2/ranking/player-trophies/:location/:date",
		"/v2/ranking/player-builder/:location/:date",
		"/v2/ranking/clan-trophies/:location/:date",
		"/v2/ranking/clan-builder/:location/:date",
		"/v2/ranking/clan-capital/:location/:date",
		"/builderbaseleagues",
		"/v2/links/server/:server_id",
		"/v2/server/:server_id/dashboard-capabilities",
		"/v2/server/:server_id/dashboard-access",
		"/v2/server/:server_id/bot-profile",
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

func TestLegacyWarPreviousRequiresEndTimeQuery(t *testing.T) {
	app := newRegisteredRoutesTestAppWithErrorHandler()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	resp, err := app.Test(httptest.NewRequest("GET", "/war/%232PP/previous", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("expected missing endTime to return 400, got %d", resp.StatusCode)
	}
}

func newRegisteredRoutesTestApp() *fiber.App {
	return fiber.New(fiber.Config{RequestMethods: append(append([]string{}, fiber.DefaultMethods...), statsQueryMethod)})
}

func newRegisteredRoutesTestAppWithErrorHandler() *fiber.App {
	return fiber.New(fiber.Config{
		ErrorHandler:   apptypes.ErrorHandler,
		RequestMethods: append(append([]string{}, fiber.DefaultMethods...), statsQueryMethod),
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
