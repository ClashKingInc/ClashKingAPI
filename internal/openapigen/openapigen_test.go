package openapigen_test

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/ClashKingInc/ClashKingAPI/internal/openapigen"
	"github.com/ClashKingInc/ClashKingAPI/internal/swaggerdocs"
)

func TestGeneratedDocumentsAreCurrentAndValid(t *testing.T) {
	jsonDocument, yamlDocument, err := openapigen.Generate()
	if err != nil {
		t.Fatalf("generate OpenAPI documents: %v", err)
	}

	embeddedJSON, err := swaggerdocs.BuildDoc()
	if err != nil {
		t.Fatalf("read embedded OpenAPI JSON: %v", err)
	}
	if !bytes.Equal(jsonDocument, []byte(embeddedJSON)) {
		t.Fatal("embedded openapi.json is stale; run go generate")
	}

	embeddedYAML, err := swaggerdocs.BuildYAMLDoc()
	if err != nil {
		t.Fatalf("read embedded OpenAPI YAML: %v", err)
	}
	if !bytes.Equal(yamlDocument, []byte(embeddedYAML)) {
		t.Fatal("embedded openapi.yaml is stale; run go generate")
	}
}

func TestGeneratedDocumentUsesOpenAPI32Contracts(t *testing.T) {
	jsonDocument, _, err := openapigen.Generate()
	if err != nil {
		t.Fatalf("generate OpenAPI documents: %v", err)
	}

	var doc map[string]any
	if err := json.Unmarshal(jsonDocument, &doc); err != nil {
		t.Fatalf("decode OpenAPI JSON: %v", err)
	}
	if doc["openapi"] != "3.2.0" {
		t.Fatalf("OpenAPI version = %v", doc["openapi"])
	}
	for _, legacyKey := range []string{"swagger", "definitions", "securityDefinitions", "basePath"} {
		if _, ok := doc[legacyKey]; ok {
			t.Fatalf("generated document retains Swagger 2.0 key %q", legacyKey)
		}
	}

	paths := doc["paths"].(map[string]any)
	for _, path := range []string{
		"/v2/home/activity",
		"/v2/stats/armies",
		"/v2/stats/items",
		"/v2/stats/ranked",
		"/v2/stats/war",
		"/v2/stats/cwl",
		"/v2/search/clan",
		"/v2/search/player",
	} {
		pathItem := paths[path].(map[string]any)
		if _, ok := pathItem["post"]; ok {
			t.Fatalf("%s still contains its Swagger POST placeholder", path)
		}
		query, ok := pathItem["query"].(map[string]any)
		if !ok {
			t.Fatalf("%s does not contain a native QUERY operation", path)
		}
		if _, ok := query["x-http-method"]; ok {
			t.Fatalf("%s retains x-http-method", path)
		}
		requestBody := query["requestBody"].(map[string]any)
		content := requestBody["content"].(map[string]any)
		if _, ok := content["application/json"]; !ok {
			t.Fatalf("%s does not declare an application/json request body", path)
		}
	}

	upload := paths["/v2/cdn/upload"].(map[string]any)["post"].(map[string]any)
	uploadBody := upload["requestBody"].(map[string]any)
	multipart := uploadBody["content"].(map[string]any)["multipart/form-data"].(map[string]any)
	uploadSchema := multipart["schema"].(map[string]any)
	file := uploadSchema["properties"].(map[string]any)["file"].(map[string]any)
	if file["type"] != "string" || file["format"] != "binary" {
		t.Fatalf("file upload schema = %v", file)
	}

	components := doc["components"].(map[string]any)
	if _, ok := components["schemas"].(map[string]any); !ok {
		t.Fatal("generated document omits components.schemas")
	}
	auth, ok := components["securitySchemes"].(map[string]any)["ApiKeyAuth"].(map[string]any)
	if !ok {
		t.Fatal("generated document omits ApiKeyAuth")
	}
	if auth["description"] != "Enter `Bearer <access_token>`." {
		t.Fatalf("ApiKeyAuth description = %v", auth["description"])
	}
}
