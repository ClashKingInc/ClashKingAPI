package openapigen

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestConvertOperationParametersPreservesMultipartRequirementsAndDescriptions(t *testing.T) {
	parameters, body := convertOperationParameters([]any{
		map[string]any{
			"name":        "file",
			"in":          "formData",
			"type":        "file",
			"required":    true,
			"description": "Image (max 25 MB)",
		},
		map[string]any{
			"name":        "caption",
			"in":          "formData",
			"type":        "string",
			"description": "Optional caption",
		},
		map[string]any{
			"name":     "server_id",
			"in":       "path",
			"type":     "string",
			"required": true,
		},
	}, []string{"multipart/form-data"})

	if len(parameters) != 1 || parameters[0].(map[string]any)["name"] != "server_id" {
		t.Fatalf("non-form parameters = %v", parameters)
	}
	if body["required"] != true {
		t.Fatalf("requestBody.required = %v", body["required"])
	}
	schema := body["content"].(map[string]any)["multipart/form-data"].(map[string]any)["schema"].(map[string]any)
	if !reflect.DeepEqual(schema["required"], []string{"file"}) {
		t.Fatalf("schema.required = %v", schema["required"])
	}
	properties := schema["properties"].(map[string]any)
	file := properties["file"].(map[string]any)
	if file["type"] != "string" || file["format"] != "binary" || file["description"] != "Image (max 25 MB)" {
		t.Fatalf("file property = %v", file)
	}
	if properties["caption"].(map[string]any)["description"] != "Optional caption" {
		t.Fatalf("caption property = %v", properties["caption"])
	}

	_, optionalBody := convertOperationParameters([]any{
		map[string]any{"name": "caption", "in": "formData", "type": "string", "required": false},
		map[string]any{"name": "", "in": "formData", "type": "string"},
	}, []string{"multipart/form-data"})
	if _, ok := optionalBody["required"]; ok {
		t.Fatalf("optional multipart body is marked required: %v", optionalBody)
	}
}

func TestConvertSwaggerComponentsAndOperations(t *testing.T) {
	source := map[string]any{
		"swagger":  "2.0",
		"info":     map[string]any{"title": "Old", "version": "0"},
		"host":     "api.example.com",
		"basePath": "/v2",
		"schemes":  []any{"https", "http"},
		"produces": []any{"application/json"},
		"definitions": map[string]any{
			"Thing": map[string]any{"type": "object", "x-nullable": true},
		},
		"parameters": map[string]any{
			"TraceID": map[string]any{"name": "X-Trace-ID", "in": "header", "type": "string"},
		},
		"responses": map[string]any{
			"Missing": map[string]any{"description": "Missing", "schema": map[string]any{"$ref": "#/definitions/Thing"}},
		},
		"securityDefinitions": map[string]any{
			"Basic": map[string]any{"type": "basic"},
			"Key":   map[string]any{"type": "apiKey", "name": "X-Key", "in": "header"},
		},
		"paths": map[string]any{
			"/things/{id}": map[string]any{
				"x-path-note": "kept",
				"parameters":  []any{map[string]any{"name": "id", "in": "path", "type": "string", "required": true}},
				"post": map[string]any{
					"tags":        []any{"Extra"},
					"summary":     "Create thing",
					"operationId": "createThing",
					"parameters": []any{
						map[string]any{"name": "ids", "in": "query", "type": "array", "items": map[string]any{"type": "string"}, "collectionFormat": "multi"},
						map[string]any{"name": "body", "in": "body", "required": true, "description": "Thing body", "schema": map[string]any{"$ref": "#/definitions/Thing"}},
					},
					"responses": map[string]any{
						"200": map[string]any{"schema": map[string]any{"$ref": "#/definitions/Thing"}},
						"404": map[string]any{"$ref": "#/responses/Missing"},
					},
				},
			},
		},
		"x-document-note": "kept",
	}

	document, err := Convert(source)
	if err != nil {
		t.Fatalf("Convert: %v", err)
	}
	if document["openapi"] != OpenAPIVersion || document["x-document-note"] != "kept" {
		t.Fatalf("document metadata = %v", document)
	}
	servers := document["servers"].([]any)
	if len(servers) != 2 || servers[0].(map[string]any)["url"] != "https://api.example.com/v2" {
		t.Fatalf("servers = %v", servers)
	}
	components := document["components"].(map[string]any)
	if _, ok := components["parameters"].(map[string]any)["TraceID"]; !ok {
		t.Fatalf("component parameters = %v", components["parameters"])
	}
	missing := components["responses"].(map[string]any)["Missing"].(map[string]any)
	if missing["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)["$ref"] != "#/components/schemas/Thing" {
		t.Fatalf("component response = %v", missing)
	}
	path := document["paths"].(map[string]any)["/things/{id}"].(map[string]any)
	if path["x-path-note"] != "kept" || len(path["parameters"].([]any)) != 1 {
		t.Fatalf("path item = %v", path)
	}
	operation := path["post"].(map[string]any)
	query := operation["parameters"].([]any)[0].(map[string]any)
	if query["style"] != "form" || query["explode"] != true {
		t.Fatalf("query collection conversion = %v", query)
	}
	requestBody := operation["requestBody"].(map[string]any)
	if requestBody["required"] != true || requestBody["description"] != "Thing body" {
		t.Fatalf("request body = %v", requestBody)
	}
	if _, ok := operation["responses"].(map[string]any)["200"].(map[string]any)["description"]; !ok {
		t.Fatalf("response default description missing: %v", operation["responses"])
	}

	if _, err := Convert(map[string]any{"swagger": "1.2"}); err == nil {
		t.Fatal("Convert accepted a non-Swagger 2.0 document")
	}
}

func TestConversionHelpers(t *testing.T) {
	styles := []struct {
		in, format string
		style      string
		explode    bool
	}{
		{in: "query", format: "multi", style: "form", explode: true},
		{in: "query", format: "ssv", style: "spaceDelimited"},
		{in: "query", format: "pipes", style: "pipeDelimited"},
		{in: "query", format: "csv", style: "form"},
		{in: "path", format: "csv", style: "simple"},
		{in: "header", format: "csv", style: "simple"},
		{in: "cookie", format: "csv"},
	}
	for _, test := range styles {
		style, explode := parameterCollectionStyle(test.in, test.format)
		if style != test.style || explode != test.explode {
			t.Fatalf("parameterCollectionStyle(%q, %q) = (%q, %v)", test.in, test.format, style, explode)
		}
	}

	servers := convertServers(map[string]any{"basePath": "/v2"})
	if len(servers) != 1 || servers[0].(map[string]any)["url"] != "/v2" {
		t.Fatalf("base-path server = %v", servers)
	}
	if servers := convertServers(map[string]any{"basePath": "/"}); servers != nil {
		t.Fatalf("root-only servers = %v", servers)
	}

	for _, test := range []struct {
		input, want any
	}{
		{input: "#/definitions/Thing", want: "#/components/schemas/Thing"},
		{input: "#/securityDefinitions/Auth", want: "#/components/securitySchemes/Auth"},
		{input: "#/parameters/ID", want: "#/components/parameters/ID"},
		{input: "#/responses/Missing", want: "#/components/responses/Missing"},
		{input: "https://example.com/schema", want: "https://example.com/schema"},
		{input: 42, want: 42},
	} {
		if got := rewriteRef(test.input); got != test.want {
			t.Fatalf("rewriteRef(%v) = %v, want %v", test.input, got, test.want)
		}
	}

	nullable := []map[string]any{
		{"type": "string"},
		{"$ref": "#/components/schemas/Thing"},
		{"anyOf": []any{map[string]any{"type": "string"}}},
		{},
	}
	for _, schema := range nullable {
		makeNullable(schema)
		if !strings.Contains(strings.ToLower(fmt.Sprint(schema)), "null") {
			t.Fatalf("nullable schema = %v", schema)
		}
	}
}

func TestScalarAdapterErrorsAndDescriptionFallback(t *testing.T) {
	if _, err := ScalarAdapter([]byte("not JSON")); err == nil {
		t.Fatal("ScalarAdapter accepted invalid JSON")
	}

	conflict := []byte(`{"openapi":"3.2.0","info":{"title":"x","version":"1"},"paths":{"/x":{"query":{"responses":{"200":{"description":"ok"}}},"post":{"responses":{"200":{"description":"ok"}}}}}}`)
	if _, err := ScalarAdapter(conflict); err == nil {
		t.Fatal("ScalarAdapter accepted a QUERY/POST conflict")
	}

	document := []byte(`{"openapi":"3.2.0","info":{"title":"x","version":"1"},"paths":{"/x":{"query":{"responses":{"200":{"description":"ok"}}}}}}`)
	adapted, err := ScalarAdapter(document)
	if err != nil {
		t.Fatalf("ScalarAdapter: %v", err)
	}
	if !strings.Contains(string(adapted), "Scalar displays this through a POST compatibility view") {
		t.Fatalf("adapted description missing: %s", adapted)
	}

	if err := Validate([]byte(`{"openapi":"3.1.0","info":{"title":"x","version":"1"},"paths":{}}`)); err == nil {
		t.Fatal("Validate accepted OpenAPI 3.1")
	}
	if err := Validate([]byte("not YAML: [")); err == nil {
		t.Fatal("Validate accepted an invalid document")
	}
}
