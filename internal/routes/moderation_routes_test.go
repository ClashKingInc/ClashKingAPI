package routes

import (
	"net/http"
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestModerationRoutesAreFullyRegistered(t *testing.T) {
	app := newRegisteredRoutesTestApp()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	for _, route := range []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/v2/server/:server_id/bans"},
		{http.MethodPost, "/v2/server/:server_id/bans/:player_tag"},
		{http.MethodDelete, "/v2/server/:server_id/bans/:player_tag"},
		{http.MethodGet, "/v2/server/:server_id/strikes"},
		{http.MethodPost, "/v2/server/:server_id/strikes/:player_tag"},
		{http.MethodDelete, "/v2/server/:server_id/strikes/:strike_id"},
		{http.MethodGet, "/v2/server/:server_id/strikes/player/:player_tag/summary"},
	} {
		if registeredRouteIndex(app, route.method, route.path) < 0 {
			t.Errorf("missing %s %s", route.method, route.path)
		}
	}
}
