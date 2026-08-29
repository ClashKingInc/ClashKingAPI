package openapigen

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	docs "github.com/ClashKingInc/ClashKingAPI/internal/docs"
	"github.com/pb33f/libopenapi"
	"github.com/swaggo/swag"
	"go.yaml.in/yaml/v3"
)

const (
	OpenAPIVersion = "3.2.0"
	APITitle       = "ClashKing API"
	APIDescription = `### Clash of Clans Based API 👑
- No Auth Required, Free to Use
- Please credit if using these stats in your project, Creator Code: ClashKing
- Ratelimit is largely 30 req/sec, 5 req/sec on post & large requests
- Largely 300 second cache
- Not perfect, stats are collected by polling the Official API
- [ClashKing Discord](https://discord.gg/clashking) | [API Developers](https://discord.gg/clashapi)

This content is not affiliated with, endorsed, sponsored, or specifically approved by Supercell and Supercell is not responsible for it.
For more information see [Supercell's Fan Content Policy](https://supercell.com/fan-content-policy)`
	APIVersion = "1.0"
)

// Generate converts the Swagger document produced by swag into the OpenAPI
// 3.2 document served by the API. Swag remains responsible for reading the Go
// annotations and types; this package owns the public document format.
func Generate() ([]byte, []byte, error) {
	source, err := sourceDocument()
	if err != nil {
		return nil, nil, err
	}

	doc, err := Convert(source)
	if err != nil {
		return nil, nil, err
	}

	jsonDocument, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, nil, fmt.Errorf("marshal OpenAPI JSON: %w", err)
	}
	jsonDocument = append(jsonDocument, '\n')
	if err := Validate(jsonDocument); err != nil {
		return nil, nil, err
	}

	yamlDocument, err := yaml.Marshal(doc)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal OpenAPI YAML: %w", err)
	}
	if err := Validate(yamlDocument); err != nil {
		return nil, nil, fmt.Errorf("validate OpenAPI YAML: %w", err)
	}

	return jsonDocument, yamlDocument, nil
}

// ScalarAdapter creates a viewer-only document for Scalar, which can parse
// OpenAPI 3.2 but does not yet render native QUERY operations. The canonical
// JSON and YAML documents remain unchanged.
func ScalarAdapter(document []byte) ([]byte, error) {
	var doc map[string]any
	if err := json.Unmarshal(document, &doc); err != nil {
		return nil, fmt.Errorf("decode canonical OpenAPI document: %w", err)
	}

	paths, _ := doc["paths"].(map[string]any)
	for path, rawPathItem := range paths {
		pathItem, _ := rawPathItem.(map[string]any)
		query, ok := pathItem["query"].(map[string]any)
		if !ok {
			continue
		}
		if _, exists := pathItem["post"]; exists {
			return nil, fmt.Errorf("cannot adapt QUERY %s because POST already exists", path)
		}

		query["x-http-method"] = "QUERY"
		note := "**HTTP method:** `QUERY`. Scalar displays this through a POST compatibility view; requests from this page are still sent as QUERY."
		if description := stringValue(query["description"]); description != "" {
			query["description"] = note + "\n\n" + description
		} else {
			query["description"] = note
		}
		pathItem["post"] = query
		delete(pathItem, "query")
	}
	doc["x-scalar-query-adapter"] = true

	adapted, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal Scalar OpenAPI adapter: %w", err)
	}
	adapted = append(adapted, '\n')
	if err := Validate(adapted); err != nil {
		return nil, fmt.Errorf("validate Scalar OpenAPI adapter: %w", err)
	}
	return adapted, nil
}

func sourceDocument() (map[string]any, error) {
	docs.SwaggerInfo.Title = APITitle
	docs.SwaggerInfo.Description = APIDescription
	docs.SwaggerInfo.Version = APIVersion
	docs.SwaggerInfo.BasePath = "/"

	raw, err := swag.ReadDoc(docs.SwaggerInfo.InstanceName())
	if err != nil {
		return nil, fmt.Errorf("read generated Swagger document: %w", err)
	}

	var source map[string]any
	if err := json.Unmarshal([]byte(raw), &source); err != nil {
		return nil, fmt.Errorf("decode generated Swagger document: %w", err)
	}
	return source, nil
}

// Validate parses the document and builds libopenapi's OpenAPI 3 model. This
// catches invalid documents and unresolved local references during generation.
func Validate(document []byte) error {
	doc, err := libopenapi.NewDocument(document)
	if err != nil {
		return fmt.Errorf("parse OpenAPI document: %w", err)
	}
	model, err := doc.BuildV3Model()
	if err != nil {
		return fmt.Errorf("build OpenAPI model: %w", err)
	}
	if model.Model.Version != OpenAPIVersion {
		return fmt.Errorf("expected OpenAPI %s, got %q", OpenAPIVersion, model.Model.Version)
	}
	return nil
}

// Convert maps the Swagger 2.0 shapes emitted by swag into OpenAPI 3.2.
func Convert(source map[string]any) (map[string]any, error) {
	if source["swagger"] != "2.0" {
		return nil, fmt.Errorf("expected Swagger 2.0 source, got %v", source["swagger"])
	}

	out := map[string]any{
		"openapi": OpenAPIVersion,
		"info":    convertValue(source["info"]),
		"paths":   map[string]any{},
	}
	copyKeys(source, out, "tags", "externalDocs", "security")

	if servers := convertServers(source); len(servers) > 0 {
		out["servers"] = servers
	}

	components := map[string]any{}
	if definitions, ok := source["definitions"].(map[string]any); ok && len(definitions) > 0 {
		components["schemas"] = convertValue(definitions)
	}
	if schemes, ok := source["securityDefinitions"].(map[string]any); ok && len(schemes) > 0 {
		components["securitySchemes"] = convertSecuritySchemes(schemes)
	}
	if parameters, ok := source["parameters"].(map[string]any); ok && len(parameters) > 0 {
		components["parameters"] = convertComponentParameters(parameters)
	}
	if responses, ok := source["responses"].(map[string]any); ok && len(responses) > 0 {
		components["responses"] = convertComponentResponses(responses, mediaTypes(source["produces"], "application/json"))
	}
	if len(components) > 0 {
		out["components"] = components
	}

	paths, _ := source["paths"].(map[string]any)
	convertedPaths := out["paths"].(map[string]any)
	for path, rawPathItem := range paths {
		pathItem, _ := rawPathItem.(map[string]any)
		convertedPaths[path] = convertPathItem(pathItem, source)
	}

	copyExtensions(source, out)
	setMetadata(out)
	return out, nil
}

func setMetadata(doc map[string]any) {
	info, _ := doc["info"].(map[string]any)
	if info == nil {
		info = map[string]any{}
		doc["info"] = info
	}
	info["title"] = APITitle
	info["description"] = APIDescription
	info["version"] = APIVersion
	doc["tags"] = orderedTags(doc)
}

func convertPathItem(source, root map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range source {
		switch strings.ToLower(key) {
		case "$ref":
			out[key] = rewriteRef(value)
		case "parameters":
			out[key] = convertParameters(value)
		case "get", "put", "post", "delete", "options", "head", "patch", "trace":
			operation, _ := value.(map[string]any)
			method := strings.ToLower(key)
			if strings.EqualFold(stringValue(operation["x-http-method"]), "QUERY") {
				method = "query"
			}
			out[method] = convertOperation(operation, root)
		default:
			if strings.HasPrefix(strings.ToLower(key), "x-") {
				out[key] = convertValue(value)
			}
		}
	}
	return out
}

func convertOperation(source, root map[string]any) map[string]any {
	out := map[string]any{}
	copyKeys(source, out, "tags", "summary", "description", "operationId", "deprecated", "security", "externalDocs")
	copyExtensionsExcept(source, out, "x-http-method")

	parameters, requestBody := convertOperationParameters(source["parameters"], mediaTypes(firstNonNil(source["consumes"], root["consumes"]), "application/json"))
	if len(parameters) > 0 {
		out["parameters"] = parameters
	}
	if requestBody != nil {
		out["requestBody"] = requestBody
	}

	produces := mediaTypes(firstNonNil(source["produces"], root["produces"]), "application/json")
	out["responses"] = convertResponses(source["responses"], produces)
	return out
}

func convertOperationParameters(value any, consumes []string) ([]any, map[string]any) {
	raw, _ := value.([]any)
	parameters := make([]any, 0, len(raw))
	var body map[string]any
	formProperties := map[string]any{}
	formRequired := []string{}

	for _, item := range raw {
		parameter, _ := item.(map[string]any)
		switch parameter["in"] {
		case "body":
			body = map[string]any{
				"content": contentWithSchema(consumes, parameter["schema"]),
			}
			copyKeys(parameter, body, "description", "required")
		case "formData":
			name := stringValue(parameter["name"])
			if name == "" {
				continue
			}
			property := parameterSchema(parameter)
			copyKeys(parameter, property, "description")
			formProperties[name] = property
			if required, _ := parameter["required"].(bool); required {
				formRequired = append(formRequired, name)
			}
		default:
			parameters = append(parameters, convertParameter(parameter))
		}
	}

	if len(formProperties) > 0 {
		schema := map[string]any{"type": "object", "properties": formProperties}
		if len(formRequired) > 0 {
			sort.Strings(formRequired)
			schema["required"] = formRequired
		}
		body = map[string]any{
			"content": contentWithSchema(consumes, schema),
		}
		if len(formRequired) > 0 {
			body["required"] = true
		}
	}

	return parameters, body
}

func convertParameters(value any) []any {
	raw, _ := value.([]any)
	out := make([]any, 0, len(raw))
	for _, item := range raw {
		parameter, _ := item.(map[string]any)
		out = append(out, convertParameter(parameter))
	}
	return out
}

func convertParameter(source map[string]any) map[string]any {
	if ref, ok := source["$ref"]; ok {
		return map[string]any{"$ref": rewriteRef(ref)}
	}
	out := map[string]any{}
	copyKeys(source, out, "name", "in", "description", "required", "deprecated", "allowEmptyValue")
	copyExtensions(source, out)
	out["schema"] = parameterSchema(source)

	collectionFormat := stringValue(source["collectionFormat"])
	in := stringValue(source["in"])
	if collectionFormat != "" {
		style, explode := parameterCollectionStyle(in, collectionFormat)
		if style != "" {
			out["style"] = style
		}
		out["explode"] = explode
	}
	return out
}

func parameterSchema(source map[string]any) map[string]any {
	schema := map[string]any{}
	for _, key := range []string{
		"type", "format", "items", "default", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum",
		"maxLength", "minLength", "pattern", "maxItems", "minItems", "uniqueItems", "enum", "multipleOf",
	} {
		if value, ok := source[key]; ok {
			schema[key] = convertValue(value)
		}
	}
	return convertSchema(schema)
}

func parameterCollectionStyle(in, collectionFormat string) (string, bool) {
	switch in {
	case "query":
		switch collectionFormat {
		case "multi":
			return "form", true
		case "ssv":
			return "spaceDelimited", false
		case "pipes":
			return "pipeDelimited", false
		default:
			return "form", false
		}
	case "path", "header":
		return "simple", false
	default:
		return "", false
	}
}

func convertResponses(value any, produces []string) map[string]any {
	raw, _ := value.(map[string]any)
	out := map[string]any{}
	for status, response := range raw {
		responseMap, _ := response.(map[string]any)
		out[status] = convertResponse(responseMap, produces)
	}
	return out
}

func convertResponse(source map[string]any, produces []string) map[string]any {
	if ref, ok := source["$ref"]; ok {
		return map[string]any{"$ref": rewriteRef(ref)}
	}
	out := map[string]any{}
	copyKeys(source, out, "description", "links")
	copyExtensions(source, out)
	if _, ok := out["description"]; !ok {
		out["description"] = "Response"
	}

	if headers, ok := source["headers"].(map[string]any); ok {
		convertedHeaders := map[string]any{}
		for name, rawHeader := range headers {
			header, _ := rawHeader.(map[string]any)
			converted := map[string]any{}
			copyKeys(header, converted, "description")
			copyExtensions(header, converted)
			converted["schema"] = parameterSchema(header)
			convertedHeaders[name] = converted
		}
		out["headers"] = convertedHeaders
	}

	if schema, ok := source["schema"]; ok {
		content := contentWithSchema(produces, schema)
		if examples, ok := source["examples"].(map[string]any); ok {
			for mediaType, example := range examples {
				entry, _ := content[mediaType].(map[string]any)
				if entry == nil {
					entry = map[string]any{}
					content[mediaType] = entry
				}
				entry["example"] = convertValue(example)
			}
		}
		out["content"] = content
	}
	return out
}

func contentWithSchema(mediaTypes []string, schema any) map[string]any {
	out := map[string]any{}
	for _, mediaType := range mediaTypes {
		out[mediaType] = map[string]any{"schema": convertValue(schema)}
	}
	return out
}

func mediaTypes(value any, fallback string) []string {
	raw, _ := value.([]any)
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if mediaType := stringValue(item); mediaType != "" {
			out = append(out, mediaType)
		}
	}
	if len(out) == 0 {
		return []string{fallback}
	}
	return out
}

func convertSecuritySchemes(source map[string]any) map[string]any {
	out := map[string]any{}
	for name, rawScheme := range source {
		scheme, _ := rawScheme.(map[string]any)
		converted := map[string]any{}
		copyKeys(scheme, converted, "description")
		copyExtensions(scheme, converted)
		switch scheme["type"] {
		case "basic":
			converted["type"] = "http"
			converted["scheme"] = "basic"
		case "oauth2":
			converted["type"] = "oauth2"
			flow := map[string]any{"scopes": convertValue(scheme["scopes"])}
			switch scheme["flow"] {
			case "implicit":
				flow["authorizationUrl"] = scheme["authorizationUrl"]
				converted["flows"] = map[string]any{"implicit": flow}
			case "accessCode":
				flow["authorizationUrl"] = scheme["authorizationUrl"]
				flow["tokenUrl"] = scheme["tokenUrl"]
				converted["flows"] = map[string]any{"authorizationCode": flow}
			case "password":
				flow["tokenUrl"] = scheme["tokenUrl"]
				converted["flows"] = map[string]any{"password": flow}
			case "application":
				flow["tokenUrl"] = scheme["tokenUrl"]
				converted["flows"] = map[string]any{"clientCredentials": flow}
			}
		default:
			copyKeys(scheme, converted, "type", "name", "in")
		}
		if name == "ApiKeyAuth" && converted["description"] == nil {
			converted["description"] = "Enter `Bearer <access_token>`."
		}
		out[name] = converted
	}
	return out
}

func convertComponentParameters(source map[string]any) map[string]any {
	out := map[string]any{}
	for name, rawParameter := range source {
		parameter, _ := rawParameter.(map[string]any)
		out[name] = convertParameter(parameter)
	}
	return out
}

func convertComponentResponses(source map[string]any, produces []string) map[string]any {
	out := map[string]any{}
	for name, rawResponse := range source {
		response, _ := rawResponse.(map[string]any)
		out[name] = convertResponse(response, produces)
	}
	return out
}

func convertServers(source map[string]any) []any {
	host := stringValue(source["host"])
	basePath := stringValue(source["basePath"])
	if host == "" {
		if basePath != "" && basePath != "/" {
			return []any{map[string]any{"url": basePath}}
		}
		return nil
	}
	schemes := mediaTypes(source["schemes"], "https")
	servers := make([]any, 0, len(schemes))
	for _, scheme := range schemes {
		servers = append(servers, map[string]any{"url": scheme + "://" + host + basePath})
	}
	return servers
}

func convertValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return convertSchema(typed)
	case []any:
		out := make([]any, len(typed))
		for i, item := range typed {
			out[i] = convertValue(item)
		}
		return out
	default:
		return value
	}
}

func convertSchema(source map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range source {
		if key == "x-nullable" {
			continue
		}
		if key == "$ref" {
			out[key] = rewriteRef(value)
			continue
		}
		if key == "type" && value == "file" {
			out["type"] = "string"
			out["format"] = "binary"
			continue
		}
		out[key] = convertValue(value)
	}

	if nullable, _ := source["x-nullable"].(bool); nullable {
		makeNullable(out)
	}
	return out
}

func makeNullable(schema map[string]any) {
	if schemaType, ok := schema["type"].(string); ok {
		schema["type"] = []any{schemaType, "null"}
		return
	}
	if ref, ok := schema["$ref"]; ok {
		delete(schema, "$ref")
		schema["anyOf"] = []any{
			map[string]any{"$ref": ref},
			map[string]any{"type": "null"},
		}
		return
	}
	if anyOf, ok := schema["anyOf"].([]any); ok {
		schema["anyOf"] = append(anyOf, map[string]any{"type": "null"})
		return
	}
	schema["type"] = []any{"object", "null"}
}

func rewriteRef(value any) any {
	ref, ok := value.(string)
	if !ok {
		return value
	}
	replacements := map[string]string{
		"#/definitions/":         "#/components/schemas/",
		"#/securityDefinitions/": "#/components/securitySchemes/",
		"#/parameters/":          "#/components/parameters/",
		"#/responses/":           "#/components/responses/",
	}
	for old, replacement := range replacements {
		if strings.HasPrefix(ref, old) {
			return replacement + strings.TrimPrefix(ref, old)
		}
	}
	return ref
}

func orderedTags(doc map[string]any) []any {
	primary := []string{
		"Player", "Clan", "War & CWL", "Leaderboard", "Counts", "Stats", "Search", "Dates", "Links",
	}
	operationTags := map[string]bool{}
	paths, _ := doc["paths"].(map[string]any)
	for _, rawPath := range paths {
		path, _ := rawPath.(map[string]any)
		for _, rawOperation := range path {
			operation, _ := rawOperation.(map[string]any)
			tags, _ := operation["tags"].([]any)
			for _, rawTag := range tags {
				if tag := stringValue(rawTag); tag != "" {
					operationTags[tag] = true
				}
			}
		}
	}

	seen := map[string]bool{}
	result := make([]any, 0, len(operationTags))
	for _, name := range primary {
		if operationTags[name] {
			result = append(result, map[string]any{"name": name})
			seen[name] = true
		}
	}

	extra := make([]string, 0, len(operationTags))
	for name := range operationTags {
		if name != "Other" && !seen[name] {
			extra = append(extra, name)
		}
	}
	sort.Strings(extra)
	for _, name := range extra {
		result = append(result, map[string]any{"name": name})
	}
	if operationTags["Other"] {
		result = append(result, map[string]any{"name": "Other"})
	}
	return result
}

func copyKeys(source, destination map[string]any, keys ...string) {
	for _, key := range keys {
		if value, ok := source[key]; ok {
			destination[key] = convertValue(value)
		}
	}
}

func copyExtensions(source, destination map[string]any) {
	copyExtensionsExcept(source, destination)
}

func copyExtensionsExcept(source, destination map[string]any, excluded ...string) {
	exclude := map[string]bool{}
	for _, key := range excluded {
		exclude[strings.ToLower(key)] = true
	}
	for key, value := range source {
		lower := strings.ToLower(key)
		if strings.HasPrefix(lower, "x-") && !exclude[lower] {
			destination[key] = convertValue(value)
		}
	}
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}
