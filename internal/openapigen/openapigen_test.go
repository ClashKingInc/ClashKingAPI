package openapigen_test

import (
	"bytes"
	"encoding/json"
	"strings"
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

	scalarDocument, err := openapigen.ScalarAdapter(jsonDocument)
	if err != nil {
		t.Fatalf("generate Scalar adapter: %v", err)
	}
	embeddedScalar, err := swaggerdocs.BuildScalarDoc()
	if err != nil {
		t.Fatalf("read embedded Scalar adapter: %v", err)
	}
	if !bytes.Equal(scalarDocument, []byte(embeddedScalar)) {
		t.Fatal("embedded openapi.scalar.json is stale; run go generate")
	}
}

func TestScalarAdapterMakesQueryOperationsVisibleWithoutChangingTheirMeaning(t *testing.T) {
	jsonDocument, _, err := openapigen.Generate()
	if err != nil {
		t.Fatalf("generate OpenAPI documents: %v", err)
	}
	adapted, err := openapigen.ScalarAdapter(jsonDocument)
	if err != nil {
		t.Fatalf("generate Scalar adapter: %v", err)
	}

	var doc map[string]any
	if err := json.Unmarshal(adapted, &doc); err != nil {
		t.Fatalf("decode Scalar adapter: %v", err)
	}
	if doc["openapi"] != "3.2.0" || doc["x-scalar-query-adapter"] != true {
		t.Fatalf("unexpected Scalar adapter metadata: %v", doc)
	}

	paths := doc["paths"].(map[string]any)
	for _, path := range []string{"/v2/home/activity"} {
		pathItem := paths[path].(map[string]any)
		if _, ok := pathItem["query"]; ok {
			t.Fatalf("Scalar adapter retains invisible QUERY operation for %s", path)
		}
		post, ok := pathItem["post"].(map[string]any)
		if !ok || post["x-http-method"] != "QUERY" {
			t.Fatalf("Scalar adapter does not mark %s as QUERY: %v", path, pathItem)
		}
		if strings.HasPrefix(post["summary"].(string), "QUERY — ") {
			t.Fatalf("Scalar adapter should leave the operation summary unchanged for %s", path)
		}
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
	for _, path := range []string{"/v2/player/search", "/v2/clan/search"} {
		pathItem := paths[path].(map[string]any)
		if _, ok := pathItem["get"].(map[string]any); !ok {
			t.Fatalf("%s does not contain a GET operation: %v", path, pathItem)
		}
		if _, ok := pathItem["query"]; ok {
			t.Fatalf("%s unexpectedly contains a QUERY operation", path)
		}
	}

	upload := paths["/v2/cdn/upload"].(map[string]any)["post"].(map[string]any)
	uploadBody := upload["requestBody"].(map[string]any)
	if uploadBody["required"] != true {
		t.Fatalf("required upload request body = %v", uploadBody["required"])
	}
	multipart := uploadBody["content"].(map[string]any)["multipart/form-data"].(map[string]any)
	uploadSchema := multipart["schema"].(map[string]any)
	file := uploadSchema["properties"].(map[string]any)["file"].(map[string]any)
	if file["type"] != "string" || file["format"] != "binary" {
		t.Fatalf("file upload schema = %v", file)
	}
	if file["description"] != "File to upload (max 25 MB)" {
		t.Fatalf("file upload description = %v", file["description"])
	}

	baseUpload := paths["/v2/server/{server_id}/bases/images"].(map[string]any)["post"].(map[string]any)
	baseUploadBody := baseUpload["requestBody"].(map[string]any)
	if baseUploadBody["required"] != true {
		t.Fatalf("required base image request body = %v", baseUploadBody["required"])
	}
	baseMultipart := baseUploadBody["content"].(map[string]any)["multipart/form-data"].(map[string]any)
	baseFile := baseMultipart["schema"].(map[string]any)["properties"].(map[string]any)["file"].(map[string]any)
	if baseFile["description"] != "Image (max 25 MB)" {
		t.Fatalf("base image description = %v", baseFile["description"])
	}

	giveaway := paths["/v2/server/{server_id}/giveaways"].(map[string]any)["post"].(map[string]any)
	giveawayBody := giveaway["requestBody"].(map[string]any)
	if giveawayBody["required"] != true {
		t.Fatalf("required giveaway request body = %v", giveawayBody["required"])
	}
	giveawayMultipart := giveawayBody["content"].(map[string]any)["multipart/form-data"].(map[string]any)
	giveawayProperties := giveawayMultipart["schema"].(map[string]any)["properties"].(map[string]any)
	if giveawayProperties["prize"].(map[string]any)["description"] != "Prize description" {
		t.Fatalf("giveaway prize description = %v", giveawayProperties["prize"])
	}
	if giveawayProperties["image"].(map[string]any)["description"] != "Giveaway banner image" {
		t.Fatalf("giveaway image description = %v", giveawayProperties["image"])
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
