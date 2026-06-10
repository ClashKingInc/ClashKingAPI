package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestRegisterSwaggerRoutesUsesSingleDocsSurface(t *testing.T) {
	app := fiber.New()
	if err := (&App{}).registerSwaggerRoutes(app); err != nil {
		t.Fatalf("failed to register swagger routes: %v", err)
	}

	for _, path := range []string{
		"/openapi.json",
		"/docs/index.html",
		"/docs/swagger-ui.css",
	} {
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil {
			t.Fatalf("request %s failed: %v", path, err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d", path, resp.StatusCode)
		}
	}

	for _, path := range []string{
		"/openapi-public.json",
		"/openapi-private.json",
		"/docs/public/index.html",
		"/docs/private/index.html",
	} {
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil {
			t.Fatalf("request %s failed: %v", path, err)
		}
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("expected 404 for %s, got %d", path, resp.StatusCode)
		}
	}
}
