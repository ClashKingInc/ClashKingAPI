package swaggerdocs

import (
	"encoding/json"
	"html/template"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"

	docs "github.com/ClashKingInc/ClashKingAPI/internal/docs"
	"github.com/gofiber/fiber/v2"
	swaggerFiles "github.com/swaggo/files"
	"github.com/swaggo/swag"
	"github.com/valyala/fasthttp/fasthttpadaptor"
)

const (
	swaggerBaseTitle       = "ClashKing API"
	swaggerBaseDescription = "ClashKing Go API documentation. This API is still under active construction, so use it with caution because endpoints and payloads may still change."
	swaggerVersion         = "1.0"
)

func ConfigureInfo() {
	docs.SwaggerInfo.Title = swaggerBaseTitle
	docs.SwaggerInfo.Description = swaggerBaseDescription
	docs.SwaggerInfo.Version = swaggerVersion
	docs.SwaggerInfo.BasePath = "/"
}

func BuildDoc() (string, error) {
	raw, err := swag.ReadDoc(docs.SwaggerInfo.InstanceName())
	if err != nil {
		return "", err
	}

	var doc map[string]any
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		return "", err
	}

	setSwaggerMetadata(doc)
	EnsureSecurityDefinition(doc)
	promoteQueryOperations(doc)

	data, err := json.Marshal(doc)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func NoStore(next fiber.Handler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set(fiber.HeaderCacheControl, "no-store, no-cache, must-revalidate, private")
		c.Set("Pragma", "no-cache")
		c.Set("Expires", "0")
		return next(c)
	}
}

type swaggerUIConfig struct {
	URL                  string
	DocExpansion         string
	DomID                string
	DeepLinking          bool
	PersistAuthorization bool
	TagOrder             []string
}

type scalarUIConfig struct {
	URL   string
	Title string
}

func NewScalarHandler(specURL string) fiber.Handler {
	index := template.Must(template.New("scalar_index.html").Parse(scalarIndexTemplate))
	config := scalarUIConfig{
		URL:   specURL,
		Title: swaggerBaseTitle + " - Scalar",
	}
	return func(c *fiber.Ctx) error {
		c.Type("html", "utf-8")
		return index.Execute(c, config)
	}
}

func NewUIHandler(specURL string) fiber.Handler {
	var once sync.Once
	handler := swaggerFiles.NewHandler()
	index := template.Must(template.New("swagger_index.html").Parse(swaggerIndexTemplate))
	re := regexp.MustCompile(`^(.*/)([^?].*)?[?|.]*$`)
	config := swaggerUIConfig{
		URL:                  specURL,
		DocExpansion:         "list",
		DomID:                "swagger-ui",
		DeepLinking:          true,
		PersistAuthorization: false,
		TagOrder:             primaryTagOrder(),
	}

	return func(c *fiber.Ctx) error {
		matches := re.FindStringSubmatch(string(c.Request().URI().Path()))
		path := ""
		prefix := "/"
		if len(matches) > 1 {
			prefix = matches[1]
		}
		if len(matches) > 2 {
			path = matches[2]
		}

		once.Do(func() {
			handler.Prefix = prefix
		})

		fileExt := filepath.Ext(path)
		switch path {
		case "":
			return c.Redirect(filepath.Join(handler.Prefix, "index.html"), fiber.StatusTemporaryRedirect)
		case "index.html":
			c.Type(fileExt[1:], "utf-8")
			return index.Execute(c, config)
		default:
			fasthttpadaptor.NewFastHTTPHandler(handler)(c.Context())
			switch fileExt {
			case ".css":
				c.Type(fileExt[1:], "utf-8")
			case ".png", ".js":
				c.Type(fileExt[1:])
			}
			return nil
		}
	}
}

const scalarIndexTemplate = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{.Title}}</title>
  </head>
  <body>
    <div id="app"></div>
    <script id="api-reference" data-url="{{.URL}}"></script>
    <script>
      const configuration = {
        theme: "deepSpace",
        layout: "modern",
        defaultHttpClient: {
          targetKey: "python",
          clientKey: "requests",
        },
        hiddenClients: {
          c: true,
          clojure: true,
          csharp: true,
          dart: true,
          fsharp: true,
          go: true,
          http: true,
          java: true,
          js: true,
          kotlin: true,
          node: ["axios", "ofetch", "undici"],
          objc: true,
          ocaml: true,
          php: true,
          powershell: true,
          python: ["httpx_async", "httpx_sync", "python3"],
          r: true,
          ruby: true,
          rust: true,
          shell: true,
          swift: true,
        },
      };

      const script = document.getElementById("api-reference");
      script.dataset.configuration = JSON.stringify(configuration);
      script.src = "https://cdn.jsdelivr.net/npm/@scalar/api-reference";
    </script>
  </body>
</html>
`

func EnsureSecurityDefinition(doc map[string]any) {
	securityDefinitions, _ := doc["securityDefinitions"].(map[string]any)
	if securityDefinitions == nil {
		securityDefinitions = map[string]any{}
		doc["securityDefinitions"] = securityDefinitions
	}

	apiKey, _ := securityDefinitions["ApiKeyAuth"].(map[string]any)
	if apiKey == nil {
		apiKey = map[string]any{}
		securityDefinitions["ApiKeyAuth"] = apiKey
	}
	apiKey["type"] = "apiKey"
	apiKey["name"] = "Authorization"
	apiKey["in"] = "header"
	apiKey["description"] = "Enter `Bearer <access_token>`."
}

const swaggerIndexTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Swagger UI</title>
  <link href="https://fonts.googleapis.com/css?family=Open+Sans:400,700|Source+Code+Pro:300,600|Titillium+Web:400,600,700" rel="stylesheet">
  <link rel="stylesheet" type="text/css" href="./swagger-ui.css" >
  <link rel="icon" type="image/png" href="./favicon-32x32.png" sizes="32x32" />
  <link rel="icon" type="image/png" href="./favicon-16x16.png" sizes="16x16" />
  <style>
    html
    {
        box-sizing: border-box;
        overflow: -moz-scrollbars-vertical;
        overflow-y: scroll;
    }
    *,
    *:before,
    *:after
    {
        box-sizing: inherit;
    }

    body {
      margin:0;
      background: #fafafa;
    }
  </style>
</head>

<body>

<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="position:absolute;width:0;height:0">
  <defs>
    <symbol viewBox="0 0 20 20" id="unlocked">
          <path d="M15.8 8H14V5.6C14 2.703 12.665 1 10 1 7.334 1 6 2.703 6 5.6V6h2v-.801C8 3.754 8.797 3 10 3c1.203 0 2 .754 2 2.199V8H4c-.553 0-1 .646-1 1.199V17c0 .549.428 1.139.951 1.307l1.197.387C5.672 18.861 6.55 19 7.1 19h5.8c.549 0 1.428-.139 1.951-.307l1.196-.387c.524-.167.953-.757.953-1.306V9.199C17 8.646 16.352 8 15.8 8z"></path>
    </symbol>

    <symbol viewBox="0 0 20 20" id="locked">
      <path d="M15.8 8H14V5.6C14 2.703 12.665 1 10 1 7.334 1 6 2.703 6 5.6V8H4c-.553 0-1 .646-1 1.199V17c0 .549.428 1.139.951 1.307l1.197.387C5.672 18.861 6.55 19 7.1 19h5.8c.549 0 1.428-.139 1.951-.307l1.196-.387c.524-.167.953-.757.953-1.306V9.199C17 8.646 16.352 8 15.8 8zM12 8H8V5.199C8 3.754 8.797 3 10 3c1.203 0 2 .754 2 2.199V8z"/>
    </symbol>
  </defs>
</svg>

<div id="swagger-ui"></div>

<script src="./swagger-ui-bundle.js"> </script>
<script src="./swagger-ui-standalone-preset.js"> </script>
<script>
window.onload = function() {
  const tagOrder = [
    {{- range .TagOrder }}
    "{{ . }}",
    {{- end }}
  ];
  const ui = SwaggerUIBundle({
    url: "{{.URL}}",
    deepLinking: {{.DeepLinking}},
    docExpansion: "{{.DocExpansion}}",
    dom_id: "#{{.DomID}}",
    persistAuthorization: {{.PersistAuthorization}},
    validatorUrl: null,
    tagsSorter: function(a, b) {
      const ai = tagOrder.indexOf(a);
      const bi = tagOrder.indexOf(b);
      if (ai !== -1 || bi !== -1) {
        return (ai === -1 ? tagOrder.length : ai) - (bi === -1 ? tagOrder.length : bi);
      }
      return a.localeCompare(b);
    },
    operationsSorter: function(a, b) {
      function pathRank(path, method) {
        const key = method.toUpperCase() + " " + path;
        const ranks = {
          "GET /v2/links/{id}": 0,
          "POST /v2/links/{id}": 1,
          "PUT /v2/links/{id}/order": 2,
          "DELETE /v2/links/{id}/{playerTag}": 3,
          "GET /v2/links/{id}/bookmarks": 4,
          "POST /v2/links/{id}/bookmarks": 5,
          "PUT /v2/links/{id}/bookmarks/order": 6,
          "DELETE /v2/links/{id}/bookmarks/{type}/{tag}": 7,
          "GET /v2/links/{id}/searches": 8
        };
        return Object.prototype.hasOwnProperty.call(ranks, key) ? ranks[key] : null;
      }
      const ap = a.get("path");
      const bp = b.get("path");
      const am = a.get("method");
      const bm = b.get("method");
      const ar = pathRank(ap, am);
      const br = pathRank(bp, bm);
      if (ar !== null || br !== null) {
        return (ar === null ? Number.MAX_SAFE_INTEGER : ar) - (br === null ? Number.MAX_SAFE_INTEGER : br);
      }
      const pathCompare = ap.localeCompare(bp);
      if (pathCompare !== 0) {
        return pathCompare;
      }
      return am.localeCompare(bm);
    },
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    plugins: [
      SwaggerUIBundle.plugins.DownloadUrl
    ],
    layout: "StandaloneLayout"
  })
  window.ui = ui
}
</script>
</body>
</html>
`

func setSwaggerMetadata(doc map[string]any) {
	info, _ := doc["info"].(map[string]any)
	if info == nil {
		info = map[string]any{}
		doc["info"] = info
	}

	info["title"] = swaggerBaseTitle
	info["description"] = swaggerBaseDescription
	info["version"] = swaggerVersion
	doc["tags"] = swaggerTags(doc)
}

func primaryTagOrder() []string {
	return []string{
		"Counts",
		"Stats",
		"Player",
		"Clan",
		"War",
		"Battlelogs",
		"Leaderboard",
		"Rankings",
		"Global",
		"Search",
		"Links",
		"Tracking",
		"Dates",
		"Lists",
	}
}

// promoteQueryOperations preserves QUERY semantics in Swagger 2.0 through a
// vendor-extension operation. Swag only accepts the standard Swagger verbs,
// so source annotations use POST as a generation placeholder with
// x-http-method=QUERY; the served document never advertises those operations
// as POST.
func promoteQueryOperations(doc map[string]any) {
	paths, _ := doc["paths"].(map[string]any)
	for _, rawPath := range paths {
		path, _ := rawPath.(map[string]any)
		post, _ := path["post"].(map[string]any)
		method, _ := post["x-http-method"].(string)
		if !strings.EqualFold(method, "QUERY") {
			continue
		}
		post["x-http-method"] = "QUERY"
		path["x-query"] = post
		delete(path, "post")
	}
}

func swaggerTags(doc map[string]any) []map[string]string {
	seen := map[string]bool{}
	out := []map[string]string{}
	for _, name := range primaryTagOrder() {
		out = append(out, map[string]string{"name": name})
		seen[name] = true
	}

	tags, _ := doc["tags"].([]any)
	hasOther := false
	for _, tag := range tags {
		tagMap, _ := tag.(map[string]any)
		name, _ := tagMap["name"].(string)
		if name == "Other" {
			hasOther = true
			continue
		}
		if name == "" || seen[name] {
			continue
		}
		out = append(out, map[string]string{"name": name})
		seen[name] = true
	}

	operationTags := operationTagNames(doc)
	for _, name := range operationTags {
		if name == "Other" {
			hasOther = true
			continue
		}
		if seen[name] {
			continue
		}
		out = append(out, map[string]string{"name": name})
		seen[name] = true
	}
	if hasOther && !seen["Other"] {
		out = append(out, map[string]string{"name": "Other"})
	}
	return out
}

func operationTagNames(doc map[string]any) []string {
	paths, _ := doc["paths"].(map[string]any)
	seen := map[string]bool{}
	for _, rawPath := range paths {
		path, _ := rawPath.(map[string]any)
		for _, method := range []string{"get", "post", "put", "patch", "delete", "options", "head", "x-query"} {
			operation, _ := path[method].(map[string]any)
			rawTags, _ := operation["tags"].([]any)
			for _, rawTag := range rawTags {
				name, _ := rawTag.(string)
				if name != "" {
					seen[name] = true
				}
			}
		}
	}
	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
