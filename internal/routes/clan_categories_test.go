package routes

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestClanCategoryRoutesAreServerManagerProtected(t *testing.T) {
	app := newRegisteredRoutesTestAppWithErrorHandler()
	Register(app, apptypes.Deps{}, func(next fiber.Handler) fiber.Handler { return next })

	routes := []struct {
		method string
		path   string
		url    string
		body   string
	}{
		{
			method: fiber.MethodGet,
			path:   "/v2/server/:server_id/clan-categories",
			url:    "/v2/server/111111111111111111/clan-categories",
		},
		{
			method: fiber.MethodPost,
			path:   "/v2/server/:server_id/clan-categories",
			url:    "/v2/server/111111111111111111/clan-categories",
			body:   `{"name":"CWL"}`,
		},
		{
			method: fiber.MethodGet,
			path:   "/v2/server/:server_id/clan-categories/:category_id/delete-preview",
			url:    "/v2/server/111111111111111111/clan-categories/019c95ab-f582-79a6-a309-6ea9202878cd/delete-preview",
		},
		{
			method: fiber.MethodPatch,
			path:   "/v2/server/:server_id/clan-categories/:category_id",
			url:    "/v2/server/111111111111111111/clan-categories/019c95ab-f582-79a6-a309-6ea9202878cd",
			body:   `{"name":"Events"}`,
		},
		{
			method: fiber.MethodDelete,
			path:   "/v2/server/:server_id/clan-categories/:category_id",
			url:    "/v2/server/111111111111111111/clan-categories/019c95ab-f582-79a6-a309-6ea9202878cd",
		},
	}

	for _, route := range routes {
		if registeredRouteIndex(app, route.method, route.path) < 0 {
			t.Fatalf("expected %s %s to be registered", route.method, route.path)
		}
		request := httptest.NewRequest(route.method, route.url, strings.NewReader(route.body))
		if route.body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		response, err := app.Test(request)
		if err != nil {
			t.Fatalf("%s %s failed: %v", route.method, route.url, err)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s %s returned %d without manager auth, want 401", route.method, route.url, response.StatusCode)
		}
	}
}
