package main

import "testing"

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

	filterPublicSwaggerPaths(doc)

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

	filterPrivateSwaggerPaths(doc)

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

	ensureSwaggerSecurityDefinition(doc)

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
