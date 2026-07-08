package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

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
