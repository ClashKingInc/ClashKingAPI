package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ClashKingInc/ClashKingAPI/internal/swaggerdocs"
	"github.com/gofiber/fiber/v2"
)

func TestRegisterSwaggerRoutesServesScalarByDefaultAndSwaggerFallback(t *testing.T) {
	app := fiber.New()
	if err := swaggerdocs.RegisterRoutes(app); err != nil {
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
		for _, marker := range []string{
			`class="ck-docs-header"`,
			`theme: "none"`,
			`https://assets.clashk.ing/fonts/clashking.woff2`,
			`https://assets.clashk.ing/logos/clashking-wordmark-dark.svg`,
			`https://assets.clashk.ing/logos/clashking-wordmark-light.svg`,
			`href="/openapi.json"`,
			`href="/swagger"`,
			`href="/swagger">Swagger</a>`,
			`:where(input, textarea, select):focus-visible`,
			`.open-api-client-button:focus-visible`,
			`aria-label="Swagger" href="/swagger">Swagger</a>`,
		} {
			if !strings.Contains(body, marker) {
				t.Fatalf("expected %s to serve branded Scalar html containing %q", path, marker)
			}
		}
		if strings.Contains(body, "ZgotmplZ") {
			t.Fatalf("expected %s CDN brand assets to render as safe URLs", path)
		}
		if strings.Contains(body, "Swagger fallback") || strings.Contains(body, "ck-product-label") {
			t.Fatalf("expected %s to use the simplified documentation header", path)
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
	if !strings.Contains(body, "swagger-ui-dist@5.32.11") {
		t.Fatal("expected /swagger/index.html to use the pinned OpenAPI 3.2 viewer")
	}

	resp, body = testDocsRequest(t, app, "/openapi.json")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected /openapi.json to return 200, got %d", resp.StatusCode)
	}
	var document map[string]any
	if err := json.Unmarshal([]byte(body), &document); err != nil {
		t.Fatalf("decode /openapi.json: %v", err)
	}
	if document["openapi"] != "3.2.0" {
		t.Fatalf("expected OpenAPI 3.2.0, got %v", document["openapi"])
	}

	resp, body = testDocsRequest(t, app, "/openapi.yaml")
	if resp.StatusCode != http.StatusOK || !strings.HasPrefix(body, "components:") {
		t.Fatalf("expected /openapi.yaml to serve the generated YAML document")
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
