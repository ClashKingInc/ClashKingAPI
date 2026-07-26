package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestBuildFiberAllowsRFCQueryPreflight(t *testing.T) {
	a := &App{}
	app, err := a.buildFiber()
	if err != nil {
		t.Fatalf("build fiber: %v", err)
	}

	req := httptest.NewRequest(http.MethodOptions, "/v2/home/activity", nil)
	req.Header.Set("Origin", "https://app.clashking.xyz")
	req.Header.Set("Access-Control-Request-Method", "QUERY")
	req.Header.Set("Access-Control-Request-Headers", "Authorization, Content-Type")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("preflight request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected preflight 204, got %d", resp.StatusCode)
	}
	if methods := resp.Header.Get("Access-Control-Allow-Methods"); !strings.Contains(methods, "QUERY") {
		t.Fatalf("expected QUERY in Access-Control-Allow-Methods, got %q", methods)
	}
}
