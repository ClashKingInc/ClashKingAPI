package utils

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func newCORSTestApp(cfg Config) *fiber.App {
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler, RequestMethods: APIRequestMethods()})
	app.Use(CORSMiddleware(cfg))
	app.Get("/v2/stats/public", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })
	app.Get("/v2/player/test", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })
	app.Get("/v2/clan/search", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })
	app.Get("/v2/player/search", func(c *fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) })
	app.Post("/v2/auth/web/refresh", RequireWebOrigin(cfg), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})
	return app
}

func TestCORSPublicSearchesRemainWildcard(t *testing.T) {
	app := newCORSTestApp(Config{WebAllowedOrigins: []string{"https://dash.clashk.ing"}})
	for _, path := range []string{"/v2/clan/search", "/v2/player/search"} {
		t.Run(path+" preflight", func(t *testing.T) {
			request := httptest.NewRequest(fiber.MethodOptions, path, nil)
			request.Header.Set(fiber.HeaderOrigin, "https://unrelated.example")
			request.Header.Set(fiber.HeaderAccessControlRequestMethod, fiber.MethodGet)
			request.Header.Set(fiber.HeaderAccessControlRequestHeaders, "content-type")

			response, err := app.Test(request)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			if response.StatusCode != fiber.StatusNoContent {
				t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusNoContent)
			}
			if got := response.Header.Get(fiber.HeaderAccessControlAllowOrigin); got != "*" {
				t.Fatalf("allow origin = %q, want wildcard", got)
			}
			if got := response.Header.Get(fiber.HeaderAccessControlAllowCredentials); got != "" {
				t.Fatalf("public preflight unexpectedly allows credentials: %q", got)
			}
		})

		t.Run(path+" request", func(t *testing.T) {
			request := httptest.NewRequest(fiber.MethodGet, path, nil)
			request.Header.Set(fiber.HeaderOrigin, "https://unrelated.example")

			response, err := app.Test(request)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			if response.StatusCode != fiber.StatusNoContent {
				t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusNoContent)
			}
			if got := response.Header.Get(fiber.HeaderAccessControlAllowOrigin); got != "*" {
				t.Fatalf("allow origin = %q, want wildcard", got)
			}
			if got := response.Header.Get(fiber.HeaderAccessControlAllowCredentials); got != "" {
				t.Fatalf("public response unexpectedly allows credentials: %q", got)
			}
		})
	}
}

func TestCORSPublicReadsRemainWildcard(t *testing.T) {
	app := newCORSTestApp(Config{WebAllowedOrigins: []string{"https://dash.clashk.ing"}})
	request := httptest.NewRequest(fiber.MethodGet, "/v2/stats/public", nil)
	request.Header.Set(fiber.HeaderOrigin, "https://unrelated.example")

	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if got := response.Header.Get(fiber.HeaderAccessControlAllowOrigin); got != "*" {
		t.Fatalf("allow origin = %q, want wildcard", got)
	}
	if got := response.Header.Get(fiber.HeaderAccessControlAllowCredentials); got != "" {
		t.Fatalf("public response unexpectedly allows credentials: %q", got)
	}
}

func TestCORSAllowedWebOriginCanReadPublicRoutesWithCredentials(t *testing.T) {
	app := newCORSTestApp(Config{WebAllowedOrigins: []string{"https://app.clashk.ing"}})
	request := httptest.NewRequest(fiber.MethodGet, "/v2/player/test", nil)
	request.Header.Set(fiber.HeaderOrigin, "https://app.clashk.ing")

	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if got := response.Header.Get(fiber.HeaderAccessControlAllowOrigin); got != "https://app.clashk.ing" {
		t.Fatalf("allow origin = %q", got)
	}
	if got := response.Header.Get(fiber.HeaderAccessControlAllowCredentials); got != "true" {
		t.Fatalf("allow credentials = %q", got)
	}
}

func TestCORSAllowedWebOriginGetsCredentialedPreflight(t *testing.T) {
	app := newCORSTestApp(Config{WebAllowedOrigins: []string{"https://dash.clashk.ing"}})
	request := httptest.NewRequest(fiber.MethodOptions, "/v2/auth/web/refresh", nil)
	request.Header.Set(fiber.HeaderOrigin, "https://dash.clashk.ing")
	request.Header.Set(fiber.HeaderAccessControlRequestMethod, fiber.MethodPost)
	request.Header.Set(fiber.HeaderAccessControlRequestHeaders, "content-type")

	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusNoContent)
	}
	if got := response.Header.Get(fiber.HeaderAccessControlAllowOrigin); got != "https://dash.clashk.ing" {
		t.Fatalf("allow origin = %q", got)
	}
	if got := response.Header.Get(fiber.HeaderAccessControlAllowCredentials); got != "true" {
		t.Fatalf("allow credentials = %q", got)
	}
	if got := response.Header.Get(fiber.HeaderAccessControlMaxAge); got != "3600" {
		t.Fatalf("max age = %q, want 3600", got)
	}
}

func TestCORSExplicitLocalhostOriginGetsCredentialedRefreshPreflight(t *testing.T) {
	for _, origin := range []string{"http://localhost:3002", "http://127.0.0.1:3002"} {
		t.Run(origin, func(t *testing.T) {
			app := newCORSTestApp(Config{WebAllowedOrigins: []string{origin}})
			request := httptest.NewRequest(fiber.MethodOptions, "/v2/auth/web/refresh", nil)
			request.Header.Set(fiber.HeaderOrigin, origin)
			request.Header.Set(fiber.HeaderAccessControlRequestMethod, fiber.MethodPost)
			request.Header.Set(fiber.HeaderAccessControlRequestHeaders, "content-type")

			response, err := app.Test(request)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			if response.StatusCode != fiber.StatusNoContent {
				t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusNoContent)
			}
			if got := response.Header.Get(fiber.HeaderAccessControlAllowOrigin); got != origin {
				t.Fatalf("allow origin = %q, want %q", got, origin)
			}
			if got := response.Header.Get(fiber.HeaderAccessControlAllowCredentials); got != "true" {
				t.Fatalf("allow credentials = %q", got)
			}
		})
	}
}

func TestCORSRejectsUnknownOriginForCredentialedRoute(t *testing.T) {
	app := newCORSTestApp(Config{WebAllowedOrigins: []string{"https://dash.clashk.ing"}})
	request := httptest.NewRequest(fiber.MethodOptions, "/v2/auth/web/refresh", nil)
	request.Header.Set(fiber.HeaderOrigin, "https://attacker.example")
	request.Header.Set(fiber.HeaderAccessControlRequestMethod, fiber.MethodPost)
	request.Header.Set(fiber.HeaderAccessControlRequestHeaders, "content-type")

	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusForbidden {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusForbidden)
	}
	if got := response.Header.Get(fiber.HeaderAccessControlAllowOrigin); got != "" {
		t.Fatalf("unexpected allow origin: %q", got)
	}
}

func TestRequireWebOriginRejectsActualCrossSiteRequest(t *testing.T) {
	app := newCORSTestApp(Config{WebAllowedOrigins: []string{"https://dash.clashk.ing"}})
	request := httptest.NewRequest(fiber.MethodPost, "/v2/auth/web/refresh", nil)
	request.Header.Set(fiber.HeaderOrigin, "https://attacker.example")

	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusForbidden {
		t.Fatalf("status = %d, want %d", response.StatusCode, fiber.StatusForbidden)
	}
}
