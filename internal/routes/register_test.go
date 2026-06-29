package routes

import (
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestRegisterOmitsRemovedRoutesAndKeepsV2Routes(t *testing.T) {
	app := fiber.New()
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
		"/war-stats",
	} {
		if !paths[path] {
			t.Fatalf("expected %s to be registered", path)
		}
	}
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
