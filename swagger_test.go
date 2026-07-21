package main

import (
	"io"
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

func TestRegisterSwaggerRoutesServesScalarByDefaultAndSwaggerFallback(t *testing.T) {
	app := fiber.New()
	a := &App{}
	if err := a.registerSwaggerRoutes(app); err != nil {
		t.Fatalf("register swagger routes: %v", err)
	}

	for _, path := range []string{"/", "/docs"} {
		resp, body := testDocsRequest(t, app, path)
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected %s to return 200, got %d", path, resp.StatusCode)
		}
		if !strings.Contains(body, `id="api-reference"`) || !strings.Contains(body, `@scalar/api-reference`) {
			t.Fatalf("expected %s to serve Scalar html", path)
		}
	}

	resp, _ := testDocsRequest(t, app, "/swagger")
	if resp.StatusCode != fiber.StatusTemporaryRedirect {
		t.Fatalf("expected /swagger to redirect to Swagger UI index, got %d", resp.StatusCode)
	}
	if location := resp.Header.Get("Location"); location != "/swagger/index.html" {
		t.Fatalf("expected /swagger redirect location /swagger/index.html, got %q", location)
	}

	resp, body := testDocsRequest(t, app, "/swagger/index.html")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected /swagger/index.html to return 200, got %d", resp.StatusCode)
	}
	if !strings.Contains(body, "SwaggerUIBundle") {
		t.Fatal("expected /swagger/index.html to serve Swagger UI html")
	}
}

func testDocsRequest(t *testing.T, app *fiber.App, path string) (*http.Response, string) {
	t.Helper()

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
	if err != nil {
		t.Fatalf("request %s failed: %v", path, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read %s body: %v", path, err)
	}
	return resp, string(body)
}
