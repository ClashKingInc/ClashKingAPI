package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func TestAuthUserOrBotAllowsConfiguredBotToken(t *testing.T) {
	app := fiber.New()
	wrapCalled := false
	wrap := func(next fiber.Handler) fiber.Handler {
		return func(c *fiber.Ctx) error {
			wrapCalled = true
			return apptypes.Error(fiber.StatusUnauthorized, "user auth required")
		}
	}
	deps := apptypes.Deps{Config: apptypes.Config{APIBotToken: "bot-secret"}}
	app.Get("/protected", authUserOrBot(deps, wrap, func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer bot-secret")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected %d, got %d", fiber.StatusNoContent, resp.StatusCode)
	}
	if wrapCalled {
		t.Fatal("expected bot token path not to call user auth wrapper")
	}
}

func TestDashboardAccessCacheTTLIsSixtySeconds(t *testing.T) {
	if serverAccessCacheTTL != 60*time.Second {
		t.Fatalf("serverAccessCacheTTL = %s, want 60s", serverAccessCacheTTL)
	}
}

func TestDashboardEntryAllowsUnionedAccess(t *testing.T) {
	entry := serverAccessCacheEntry{sections: map[string]string{"links": "view", "rosters": "manage"}}
	if !dashboardEntryAllows(entry, "links", false, false) {
		t.Fatal("view grant should allow reading links")
	}
	if dashboardEntryAllows(entry, "links", true, false) {
		t.Fatal("view grant should not allow managing links")
	}
	if !dashboardEntryAllows(entry, "rosters", true, false) {
		t.Fatal("manage grant should allow managing rosters")
	}
	if !dashboardEntryAllows(entry, "", false, false) {
		t.Fatal("any granted section should allow shared metadata")
	}
}

func TestDashboardManagerAlwaysAllowed(t *testing.T) {
	entry := serverAccessCacheEntry{manager: true}
	if !dashboardEntryAllows(entry, "tickets", true, true) {
		t.Fatal("manager should pass manager-only access")
	}
}

func TestDashboardSectionForPath(t *testing.T) {
	tests := map[string]string{
		"/v2/links/server/123":                "links",
		"/v2/server/123/tickets/open":         "tickets",
		"/v2/server/123/bans":                 "moderation",
		"/v2/server/123/role-settings":        "roles",
		"/v2/server/123/bot-profile":          "settings",
		"/v2/server/123/leaderboards/legends": "leaderboards",
	}
	for path, expected := range tests {
		section, _ := dashboardSectionForPath(path)
		if section != expected {
			t.Errorf("dashboardSectionForPath(%q) = %q, want %q", path, section, expected)
		}
	}
}

func TestAuthUserOrBotFallsBackToUserAuth(t *testing.T) {
	app := fiber.New()
	wrapCalled := false
	wrap := func(next fiber.Handler) fiber.Handler {
		return func(c *fiber.Ctx) error {
			wrapCalled = true
			return c.SendStatus(fiber.StatusAccepted)
		}
	}
	deps := apptypes.Deps{Config: apptypes.Config{APIBotToken: "bot-secret"}}
	app.Get("/protected", authUserOrBot(deps, wrap, func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	}))

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/protected", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusAccepted {
		t.Fatalf("expected %d, got %d", fiber.StatusAccepted, resp.StatusCode)
	}
	if !wrapCalled {
		t.Fatal("expected missing bot token to fall back to user auth wrapper")
	}
}
