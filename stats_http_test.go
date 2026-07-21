package main

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestBuildFiberSupportsQueryCORSPreflight(t *testing.T) {
	app, err := (&App{}).buildFiber()
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(fiber.MethodOptions, "/v2/stats/armies", nil)
	req.Header.Set(fiber.HeaderOrigin, "https://dashboard.clashk.ing")
	req.Header.Set(fiber.HeaderAccessControlRequestMethod, "QUERY")
	req.Header.Set(fiber.HeaderAccessControlRequestHeaders, fiber.HeaderContentType)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected CORS preflight 204, got %d", resp.StatusCode)
	}
	if methods := resp.Header.Get(fiber.HeaderAccessControlAllowMethods); !strings.Contains(methods, "QUERY") {
		t.Fatalf("expected QUERY in CORS allowed methods, got %q", methods)
	}
}
