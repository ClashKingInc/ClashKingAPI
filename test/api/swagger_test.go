package api_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ClashKingInc/ClashKingAPI/internal/swaggerdocs"
	"github.com/gofiber/fiber/v2"
)

func TestFilterPublicSwaggerPathsRemovesSecuredOperations(t *testing.T) {
	doc := map[string]any{
		"paths": map[string]any{
			"/public": map[string]any{
				"get": map[string]any{
					"summary": "public",
				},
			},
			"/mixed": map[string]any{
				"get": map[string]any{
					"summary": "public",
				},
				"post": map[string]any{
					"summary":  "private",
					"security": []any{map[string]any{"ApiKeyAuth": []any{}}},
				},
			},
			"/private": map[string]any{
				"get": map[string]any{
					"summary":  "private",
					"security": []any{map[string]any{"ApiKeyAuth": []any{}}},
				},
			},
		},
	}

	swaggerdocs.FilterPublicPaths(doc)

	paths := doc["paths"].(map[string]any)
	if _, exists := paths["/private"]; exists {
		t.Fatal("expected private path to be removed from public swagger")
	}
	mixed := paths["/mixed"].(map[string]any)
	if _, exists := mixed["post"]; exists {
		t.Fatal("expected secured operation to be removed from mixed path")
	}
	if _, exists := mixed["get"]; !exists {
		t.Fatal("expected public operation to remain on mixed path")
	}
}

func TestFilterPrivateSwaggerPathsRemovesPublicOperations(t *testing.T) {
	doc := map[string]any{
		"paths": map[string]any{
			"/public": map[string]any{
				"get": map[string]any{
					"summary": "public",
				},
			},
			"/mixed": map[string]any{
				"get": map[string]any{
					"summary": "public",
				},
				"post": map[string]any{
					"summary":  "private",
					"security": []any{map[string]any{"ApiKeyAuth": []any{}}},
				},
			},
			"/private": map[string]any{
				"get": map[string]any{
					"summary":  "private",
					"security": []any{map[string]any{"ApiKeyAuth": []any{}}},
				},
			},
		},
	}

	swaggerdocs.FilterPrivatePaths(doc)

	paths := doc["paths"].(map[string]any)
	if _, exists := paths["/public"]; exists {
		t.Fatal("expected public path to be removed from private swagger")
	}
	mixed := paths["/mixed"].(map[string]any)
	if _, exists := mixed["get"]; exists {
		t.Fatal("expected public operation to be removed from mixed path")
	}
	if _, exists := mixed["post"]; !exists {
		t.Fatal("expected secured operation to remain on mixed path")
	}
}

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
	app.Get("/docs/public/*", swaggerdocs.NewUIHandler("/openapi-public.json"))
	app.Get("/docs/private/*", swaggerdocs.NewUIHandler("/openapi-private.json"))

	for _, path := range []string{
		"/docs/public/index.html",
		"/docs/private/index.html",
		"/docs/public/swagger-ui.css",
		"/docs/private/swagger-ui.css",
		"/docs/public/swagger-ui-bundle.js",
		"/docs/private/swagger-ui-bundle.js",
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
