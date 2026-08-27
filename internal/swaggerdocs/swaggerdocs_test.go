package swaggerdocs

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestEmbeddedDocuments(t *testing.T) {
	jsonDocument, err := BuildDoc()
	if err != nil {
		t.Fatalf("BuildDoc: %v", err)
	}
	var document map[string]any
	if err := json.Unmarshal([]byte(jsonDocument), &document); err != nil {
		t.Fatalf("decode embedded OpenAPI JSON: %v", err)
	}
	if document["openapi"] != "3.2.0" {
		t.Fatalf("OpenAPI version = %v", document["openapi"])
	}

	yamlDocument, err := BuildYAMLDoc()
	if err != nil || !strings.Contains(yamlDocument, "openapi: 3.2.0") {
		t.Fatalf("embedded OpenAPI YAML is invalid: %v", err)
	}

	scalarDocument, err := BuildScalarDoc()
	if err != nil || !strings.Contains(scalarDocument, `"x-scalar-query-adapter": true`) {
		t.Fatalf("embedded Scalar document is invalid: %v", err)
	}
}

func TestRegisterRoutes(t *testing.T) {
	app := fiber.New()
	if err := RegisterRoutes(app); err != nil {
		t.Fatalf("RegisterRoutes: %v", err)
	}

	tests := []struct {
		path        string
		status      int
		contentType string
		contains    string
	}{
		{path: "/", status: http.StatusOK, contentType: "text/html", contains: "@scalar/api-reference"},
		{path: "/docs", status: http.StatusOK, contentType: "text/html", contains: "openapi.scalar.json"},
		{path: "/docs/search", status: http.StatusOK, contentType: "text/html", contains: "ClashKing API"},
		{path: "/openapi.json", status: http.StatusOK, contentType: "application/json", contains: `"openapi": "3.2.0"`},
		{path: "/openapi.yaml", status: http.StatusOK, contentType: "application/yaml", contains: "openapi: 3.2.0"},
		{path: "/openapi.scalar.json", status: http.StatusOK, contentType: "application/json", contains: `"x-scalar-query-adapter": true`},
		{path: "/swagger", status: fiber.StatusTemporaryRedirect},
		{path: "/swagger/", status: fiber.StatusTemporaryRedirect},
		{path: "/swagger/index.html", status: http.StatusOK, contentType: "text/html", contains: "SwaggerUIBundle"},
		{path: "/swagger/missing.js", status: http.StatusNotFound},
		{path: "/swagger/public/index.html", status: http.StatusNotFound},
		{path: "/swagger/private/index.html", status: http.StatusNotFound},
		{path: "/redoc", status: fiber.StatusTemporaryRedirect},
	}

	for _, test := range tests {
		t.Run(test.path, func(t *testing.T) {
			response, err := app.Test(httptest.NewRequest(http.MethodGet, test.path, nil))
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			defer response.Body.Close()
			if response.StatusCode != test.status {
				t.Fatalf("status = %d, want %d", response.StatusCode, test.status)
			}
			if response.Header.Get(fiber.HeaderCacheControl) != "no-store, no-cache, must-revalidate, private" {
				t.Fatalf("Cache-Control = %q", response.Header.Get(fiber.HeaderCacheControl))
			}
			if test.contentType != "" && !strings.HasPrefix(response.Header.Get(fiber.HeaderContentType), test.contentType) {
				t.Fatalf("Content-Type = %q, want prefix %q", response.Header.Get(fiber.HeaderContentType), test.contentType)
			}
			body, err := io.ReadAll(response.Body)
			if err != nil {
				t.Fatalf("read body: %v", err)
			}
			if test.contains != "" && !strings.Contains(string(body), test.contains) {
				t.Fatalf("body does not contain %q", test.contains)
			}
		})
	}
}

func TestScalarQueryPaths(t *testing.T) {
	paths := scalarQueryPaths()
	if len(paths) != 6 {
		t.Fatalf("QUERY path count = %d, want 6", len(paths))
	}
	if paths[0] != "/v2/home/activity" || paths[len(paths)-1] != "/v2/stats/war" {
		t.Fatalf("QUERY paths are not sorted: %v", paths)
	}

	original := openAPIJSON
	openAPIJSON = []byte("not JSON")
	t.Cleanup(func() { openAPIJSON = original })
	if invalid := scalarQueryPaths(); invalid != nil {
		t.Fatalf("invalid document paths = %v, want nil", invalid)
	}
}
