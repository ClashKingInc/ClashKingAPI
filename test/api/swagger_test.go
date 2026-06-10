package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ClashKingInc/ClashKingAPI/internal/swaggerdocs"
	"github.com/gofiber/fiber/v2"
)

func TestEnsureSwaggerSecurityDefinitionAddsAuthorizationScheme(t *testing.T) {
	doc := map[string]any{}

	swaggerdocs.EnsureSecurityDefinition(doc)

	securityDefinitions, ok := doc["securityDefinitions"].(map[string]any)
	if !ok {
		t.Fatal("expected securityDefinitions to be added")
	}
	apiKey, ok := securityDefinitions["ApiKeyAuth"].(map[string]any)
	if !ok {
		t.Fatal("expected ApiKeyAuth definition to be added")
	}
	if apiKey["name"] != "Authorization" {
		t.Fatalf("expected Authorization header name, got %v", apiKey["name"])
	}
}

func TestSwaggerUIHandlersServeAssetsIndependently(t *testing.T) {
	app := fiber.New()
	app.Get("/docs/*", swaggerdocs.NewUIHandler("/openapi.json"))

	for _, path := range []string{
		"/docs/index.html",
		"/docs/swagger-ui.css",
		"/docs/swagger-ui-bundle.js",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("request %s failed: %v", path, err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d", path, resp.StatusCode)
		}
	}
}

func TestBuildDocIncludesPublicAndAuthenticatedOperations(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)

	if _, exists := paths["/v2/public"]; !exists {
		t.Fatal("expected unauthenticated /v2/public operation in swagger")
	}

	authPath, exists := paths["/v2/me"]
	if !exists {
		t.Fatal("expected authenticated /v2/me operation in swagger")
	}
	get, ok := authPath.(map[string]any)["get"].(map[string]any)
	if !ok {
		t.Fatal("expected /v2/me get operation")
	}
	security, ok := get["security"].([]any)
	if !ok || len(security) == 0 {
		t.Fatal("expected /v2/me to preserve ApiKeyAuth security marker")
	}
}

func TestBuildDocOmitsRemovedRoutesAndKeepsV2JoinLeave(t *testing.T) {
	doc := buildSwaggerDoc(t)
	paths := swaggerPaths(t, doc)

	absent := []string{
		"/v1/{path}",
		"/ck/bulk",
		"/assets",
		"/json/{data_type}",
		"/activity",
		"/boost-rate",
		"/clan-games",
		"/donations",
	}
	for _, path := range absent {
		if _, exists := paths[path]; exists {
			t.Fatalf("expected %s to be absent from swagger", path)
		}
	}

	for _, path := range []string{
		"/v2/clan/{clan_tag}/join-leave",
		"/v2/player/{player_tag}/join-leave",
	} {
		if _, exists := paths[path]; !exists {
			t.Fatalf("expected %s to remain in swagger", path)
		}
	}
}

func buildSwaggerDoc(t *testing.T) map[string]any {
	t.Helper()
	raw, err := swaggerdocs.BuildDoc()
	if err != nil {
		t.Fatalf("failed to build swagger doc: %v", err)
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		t.Fatalf("failed to decode swagger doc: %v", err)
	}
	return doc
}

func swaggerPaths(t *testing.T, doc map[string]any) map[string]any {
	t.Helper()
	paths, ok := doc["paths"].(map[string]any)
	if !ok {
		t.Fatal("expected swagger paths object")
	}
	return paths
}
