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
	} {
		if paths[path] {
			t.Fatalf("expected %s to be absent from registered routes", path)
		}
	}

	for _, path := range []string{
		"/v2/clan/:clan_tag/join-leave",
		"/v2/player/:player_tag/join-leave",
		"/capital",
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
