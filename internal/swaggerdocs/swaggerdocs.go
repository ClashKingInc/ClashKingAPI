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
	URL              string
	Title            string
	FontURL          template.URL
	WordmarkDarkURL  template.URL
	WordmarkLightURL template.URL
}

func NewScalarHandler(specURL string) fiber.Handler {
	index := template.Must(template.New("scalar_index.html").Parse(scalarIndexTemplate))
	config := scalarUIConfig{
		URL:              specURL,
		Title:            swaggerBaseTitle + " - API Reference",
		FontURL:          template.URL("https://assets.clashk.ing/fonts/clashking.woff2"),
		WordmarkDarkURL:  template.URL("https://assets.clashk.ing/logos/clashking-wordmark-dark.svg"),
		WordmarkLightURL: template.URL("https://assets.clashk.ing/logos/clashking-wordmark-light.svg"),
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
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#030304" />
    <title>{{.Title}}</title>
    <style id="ck-scalar-theme">
      @font-face {
        font-family: "ClashKing";
        src: url("{{.FontURL}}") format("woff2");
        font-display: swap;
        font-style: normal;
        font-weight: 100 900;
      }

      :root {
        color-scheme: dark;
        --ck-page: #030304;
        --ck-surface: #0b0b0c;
        --ck-surface-raised: #111113;
        --ck-surface-muted: #171719;
        --ck-border: #303034;
        --ck-border-strong: #414147;
        --ck-content: #ffffff;
        --ck-content-muted: #a5a5ad;
        --ck-content-faint: #777780;
        --ck-primary: #d90709;
        --ck-primary-hover: #f0181b;
        --ck-info: #026cc2;
        --ck-war: #e8a524;
        --ck-win: #14a37f;
        --ck-capital: #8d63d9;
        --ck-danger: #e35d4f;
        --ck-radius-control: 12px;
        --ck-radius-chip: 16px;
        --ck-radius-tile: 20px;
        --ck-radius-panel: 28px;
        --ck-radius-pill: 999px;
        --ck-header-height: 56px;
      }

      * {
        box-sizing: border-box;
      }

      html {
        background: var(--ck-page);
        scroll-padding-top: calc(var(--ck-header-height) + 20px);
      }

      body {
        margin: 0;
        background: var(--ck-page);
        color: var(--ck-content);
        font-family: "ClashKing", Inter, ui-sans-serif, system-ui, sans-serif;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      .ck-skip-link {
        position: fixed;
        z-index: 1000;
        top: 8px;
        left: 12px;
        padding: 10px 14px;
        transform: translateY(-160%);
        border: 1px solid var(--ck-primary);
        border-radius: var(--ck-radius-control);
        background: var(--ck-surface);
        color: var(--ck-content);
        text-decoration: none;
      }

      .ck-skip-link:focus {
        transform: translateY(0);
      }

      .ck-docs-header {
        position: sticky;
        z-index: 80;
        top: 0;
        display: flex;
        height: var(--ck-header-height);
        align-items: center;
        gap: 20px;
        padding: 0 20px;
        border-bottom: 1px solid var(--ck-border);
        background: color-mix(in srgb, var(--ck-page) 94%, transparent);
        backdrop-filter: blur(16px);
      }

      .ck-brand {
        display: inline-flex;
        min-width: 0;
        align-items: center;
        gap: 14px;
        color: var(--ck-content);
        text-decoration: none;
      }

      .ck-brand-logo {
        display: block;
        width: 184px;
        height: 38px;
        object-fit: contain;
        object-position: left center;
      }

      .ck-brand-logo--light {
        display: none;
      }

      .ck-docs-nav {
        display: flex;
        margin-left: auto;
        align-items: center;
        gap: 8px;
      }

      .ck-docs-link {
        display: inline-flex;
        min-height: 34px;
        align-items: center;
        justify-content: center;
        padding: 0 14px;
        border: 1px solid var(--ck-border);
        border-radius: var(--ck-radius-control);
        background: var(--ck-surface);
        color: var(--ck-content-muted);
        font-size: 13px;
        text-decoration: none;
        transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease;
      }

      .ck-docs-link:hover {
        border-color: var(--ck-border-strong);
        background: var(--ck-surface-muted);
        color: var(--ck-content);
      }

      .ck-docs-link--primary {
        border-color: var(--ck-primary);
        background: var(--ck-primary);
        color: #ffffff;
      }

      .ck-docs-link--primary:hover {
        border-color: var(--ck-primary-hover);
        background: var(--ck-primary-hover);
        color: #ffffff;
      }

      #app {
        min-height: 1px;
      }

      #app:empty {
        display: none;
      }

      .ck-loading,
      .ck-load-error,
      noscript .ck-load-error {
        display: flex;
        width: min(560px, calc(100% - 32px));
        min-height: 112px;
        margin: 48px auto;
        align-items: center;
        gap: 16px;
        padding: 20px;
        border: 1px solid var(--ck-border);
        border-radius: var(--ck-radius-tile);
        background: var(--ck-surface);
        color: var(--ck-content-muted);
      }

      .ck-loading-mark {
        width: 28px;
        height: 28px;
        flex: 0 0 auto;
        border: 2px solid var(--ck-border-strong);
        border-top-color: var(--ck-primary);
        border-radius: 50%;
        animation: ck-spin 800ms linear infinite;
      }

      .ck-load-error {
        border-color: color-mix(in srgb, var(--ck-danger) 45%, var(--ck-border));
      }

      .ck-load-error strong {
        display: block;
        margin-bottom: 4px;
        color: var(--ck-content);
      }

      @keyframes ck-spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* Scalar theme contract */
      .scalar-app {
        --scalar-font: "ClashKing", Inter, ui-sans-serif, system-ui, sans-serif;
        --scalar-font-code: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        --scalar-font-normal: 500;
        --scalar-font-medium: 600;
        --scalar-font-bold: 800;
        --scalar-semibold: 700;
        --scalar-bold: 800;
        --scalar-radius: var(--ck-radius-control);
        --scalar-radius-md: var(--ck-radius-control);
        --scalar-radius-lg: var(--ck-radius-chip);
        --scalar-radius-xl: var(--ck-radius-tile);
        --scalar-radius-2xl: var(--ck-radius-panel);
        --scalar-radius-3xl: var(--ck-radius-panel);
        --scalar-radius-max: var(--ck-radius-panel);
        --scalar-radius-full: var(--ck-radius-pill);
        --scalar-border-width: 1px;
        --scalar-color-1: var(--ck-content);
        --scalar-color-2: var(--ck-content-muted);
        --scalar-color-3: var(--ck-content-faint);
        --scalar-color-accent: var(--ck-primary);
        --scalar-background-1: var(--ck-page);
        --scalar-background-2: var(--ck-surface);
        --scalar-background-3: var(--ck-surface-muted);
        --scalar-background-accent: var(--ck-primary);
        --scalar-border-color: var(--ck-border);
        --scalar-color-blue: var(--ck-info);
        --scalar-color-green: var(--ck-win);
        --scalar-color-orange: var(--ck-war);
        --scalar-color-red: var(--ck-danger);
        --scalar-color-purple: var(--ck-capital);
        --refs-header-height: var(--ck-header-height);
        --refs-sidebar-height: calc(100vh - var(--ck-header-height));
        --refs-sidebar-width: 292px;
        --scalar-custom-header-height: var(--ck-header-height);
        background: var(--ck-page);
        color: var(--ck-content);
      }

      .dark-mode {
        color-scheme: dark;
      }

      .light-mode {
        color-scheme: light;
        --ck-page: #f4f4f4;
        --ck-surface: #ffffff;
        --ck-surface-raised: #ffffff;
        --ck-surface-muted: #ececee;
        --ck-border: #d7d7da;
        --ck-border-strong: #bdbdc2;
        --ck-content: #09090a;
        --ck-content-muted: #56565d;
        --ck-content-faint: #75757d;
        --ck-primary: #bf0000;
        --ck-primary-hover: #d90709;
        --ck-info: #035293;
      }

      .light-mode .ck-brand-logo--dark {
        display: none;
      }

      .light-mode .ck-brand-logo--light {
        display: block;
      }

      .light-mode .ck-docs-header {
        background: color-mix(in srgb, var(--ck-page) 94%, transparent);
      }

      .t-doc__sidebar {
        top: var(--ck-header-height) !important;
        height: calc(100vh - var(--ck-header-height)) !important;
        border-color: var(--ck-border) !important;
        background: var(--ck-surface) !important;
      }

      .t-doc__sidebar [role="search"] {
        min-height: 36px;
        border: 1px solid var(--ck-border-strong);
        border-radius: var(--ck-radius-control);
        background: var(--ck-page);
        box-shadow: none;
      }

      .t-doc__sidebar [role="search"]:hover {
        border-color: var(--ck-content-faint);
        background: var(--ck-surface-muted);
      }

      .scalar-app :where(input, textarea, select):focus-visible {
        outline: none !important;
        box-shadow: none !important;
        border-color: var(--ck-border-strong) !important;
      }

      .t-doc__sidebar button {
        border-radius: var(--ck-radius-control);
      }

      .t-doc__sidebar button[aria-expanded="true"] {
        color: var(--ck-content);
      }

      .t-doc__sidebar button[aria-current="true"],
      .t-doc__sidebar button[data-active="true"] {
        background: color-mix(in srgb, var(--ck-primary) 14%, var(--ck-surface));
        color: var(--ck-content);
      }

      .api-reference-toolbar {
        display: none !important;
      }

      .references-rendered {
        background: var(--ck-page);
      }

      .references-rendered h1,
      .references-rendered h2,
      .references-rendered h3,
      .references-rendered h4 {
        color: var(--ck-content);
        font-family: "ClashKing", Inter, ui-sans-serif, system-ui, sans-serif;
        letter-spacing: 0;
      }

      .references-rendered h1 {
        font-size: clamp(28px, 4vw, 40px);
        line-height: 1.12;
      }

      .references-rendered h2 {
        font-size: 24px;
      }

      .references-rendered h3 {
        font-size: 18px;
      }

      .references-rendered p {
        color: var(--ck-content-muted);
      }

      .section-container {
        border-color: var(--ck-border) !important;
      }

      .tag-section-container {
        background: var(--ck-page);
      }

      .request-card,
      .response-card,
      .model-card,
      .schema-card,
      .authentication,
      .authentication-card,
      .endpoint-card,
      .scalar-card,
      .card {
        border-color: var(--ck-border) !important;
        border-radius: var(--ck-radius-tile) !important;
        background: var(--ck-surface) !important;
        box-shadow: none !important;
      }

      .request-card .card-header,
      .response-card .card-header,
      .selected-client,
      [role="tabpanel"] {
        border-color: var(--ck-border) !important;
        background: var(--ck-surface) !important;
        box-shadow: none !important;
      }

      .request-card-footer {
        border-color: var(--ck-border) !important;
        background: var(--ck-surface-muted) !important;
      }

      .scalar-app button,
      .scalar-app [role="button"] {
        border-radius: var(--ck-radius-control);
      }

      .scalar-app .client-libraries__select,
      .scalar-app .open-api-client-button,
      .scalar-app .client-libraries__select:hover,
      .scalar-app .open-api-client-button:hover,
      .scalar-app .client-libraries__select:active,
      .scalar-app .open-api-client-button:active,
      .scalar-app .client-libraries__select:focus-visible,
      .scalar-app .open-api-client-button:focus-visible {
        border: 0 !important;
        border-radius: 0 !important;
        outline: none !important;
        background: transparent !important;
        box-shadow: none !important;
      }

      .scalar-app [role="tablist"] {
        border-color: var(--ck-border);
      }

      .scalar-app [role="tab"][aria-selected="true"] {
        color: var(--ck-content);
      }

      .scalar-app input,
      .scalar-app textarea,
      .scalar-app select {
        min-height: 36px;
        border-color: var(--ck-border-strong) !important;
        border-radius: var(--ck-radius-control) !important;
        background: var(--ck-page) !important;
        color: var(--ck-content) !important;
        box-shadow: none !important;
      }

      .scalar-app pre,
      .scalar-app code,
      .scalar-app .code-snippet {
        font-family: var(--scalar-font-code);
        font-variant-ligatures: none;
      }

      .scalar-app pre,
      .scalar-app .code-snippet,
      .scalar-app [class*="code-block"] {
        border-color: var(--ck-border) !important;
        background: #070708 !important;
        box-shadow: none !important;
      }

      .light-mode .scalar-app pre,
      .light-mode .scalar-app .code-snippet,
      .light-mode .scalar-app [class*="code-block"] {
        background: #f7f7f8 !important;
      }

      .download-button {
        border-radius: var(--ck-radius-control);
      }

      .show-api-client-button {
        min-height: 34px !important;
        height: 34px !important;
        padding-inline: 12px !important;
        border-color: var(--ck-border-strong) !important;
        background: var(--ck-surface-raised) !important;
        color: var(--ck-content) !important;
        box-shadow: none !important;
      }

      .show-api-client-button:hover {
        border-color: var(--ck-content-faint) !important;
        background: var(--ck-surface) !important;
      }

      .show-api-client-button :where(svg, span) {
        color: inherit !important;
      }

      .introduction-section {
        padding-block: 64px !important;
      }

      [aria-label="Authentication"],
      [aria-label*="Authentication"] {
        border-color: var(--ck-border) !important;
      }

      .scalar-app .empty-state,
      .scalar-app .error-state,
      .scalar-app [class*="empty-state"],
      .scalar-app [class*="error-state"] {
        border: 1px solid var(--ck-border);
        border-radius: var(--ck-radius-tile);
        background: var(--ck-surface);
        box-shadow: none;
      }

      .scalar-app :where(button, a, input, select, textarea, [tabindex]):focus-visible,
      .ck-docs-header :where(a, button):focus-visible {
        outline: 3px solid color-mix(in srgb, var(--ck-info) 80%, white);
        outline-offset: 2px;
      }

      .scalar-app ::selection,
      .ck-docs-header ::selection {
        background: color-mix(in srgb, var(--ck-primary) 72%, transparent);
        color: #ffffff;
      }

      * {
        scrollbar-color: var(--ck-border-strong) transparent;
        scrollbar-width: thin;
      }

      @media (max-width: 1023px) {
        :root {
          --ck-header-height: 52px;
        }

        .ck-docs-header {
          gap: 12px;
          padding: 0 14px;
        }

        .ck-brand-logo {
          width: 158px;
          height: 34px;
        }

        .scalar-app {
          --refs-header-height: 0px;
          --refs-sidebar-height: 100vh;
        }

        .introduction-section {
          padding-block: 40px !important;
        }
      }

      @media (max-width: 680px) {
        .ck-brand-logo {
          width: 132px;
        }

        .ck-docs-link {
          min-width: 40px;
          min-height: 34px;
          padding: 0 10px;
          font-size: 0;
        }

        .ck-docs-link::after {
          font-size: 12px;
        }

        .ck-docs-link[href="/openapi.json"]::after {
          content: "JSON";
        }

        .ck-docs-link[href="/swagger"] {
          min-width: 68px;
          font-size: 12px;
        }

        .ck-docs-link[href="/swagger"]::after {
          content: none;
        }

        .references-rendered h1 {
          font-size: 28px;
        }
      }

      @media (max-width: 390px) {
        .ck-docs-header {
          padding-inline: 10px;
        }

        .ck-brand-logo {
          width: 118px;
        }

        .ck-docs-nav {
          gap: 6px;
        }

        .ck-docs-link {
          min-width: 38px;
          min-height: 34px;
          padding: 0 8px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          scroll-behavior: auto !important;
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
    </style>
  </head>
  <body>
    <a class="ck-skip-link" href="#app">Skip to API documentation</a>
    <header class="ck-docs-header" aria-label="ClashKing API documentation">
      <a class="ck-brand" href="/" aria-label="ClashKing API home">
        <img class="ck-brand-logo ck-brand-logo--dark" src="{{.WordmarkDarkURL}}" alt="ClashKing" />
        <img class="ck-brand-logo ck-brand-logo--light" src="{{.WordmarkLightURL}}" alt="ClashKing" />
      </a>
      <nav class="ck-docs-nav" aria-label="Documentation formats">
        <a class="ck-docs-link" aria-label="Swagger" href="/swagger">Swagger</a>
        <a class="ck-docs-link ck-docs-link--primary" aria-label="OpenAPI JSON" href="/openapi.json">OpenAPI JSON</a>
      </nav>
    </header>
    <div id="app">
      <div class="ck-loading" role="status" aria-live="polite">
        <span class="ck-loading-mark" aria-hidden="true"></span>
        <span>Loading the ClashKing API reference…</span>
      </div>
    </div>
    <noscript>
      <div class="ck-load-error" role="alert">
        <span>
          <strong>JavaScript is required.</strong>
          Enable JavaScript to browse endpoints, schemas, authentication, and code samples.
        </span>
      </div>
    </noscript>
    <script id="api-reference" data-url="{{.URL}}"></script>
    <script>
      const configuration = {
        theme: "none",
        layout: "modern",
        darkMode: true,
        hideDarkModeToggle: false,
        showSidebar: true,
        hideModels: false,
        hideDownloadButton: false,
        hideTestRequestButton: false,
        withDefaultFonts: false,
        defaultOpenAllTags: false,
        customCss: document.getElementById("ck-scalar-theme").textContent,
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
      script.addEventListener("load", () => {
        document.querySelector(".ck-loading")?.remove();
      });
      script.addEventListener("error", () => {
        document.getElementById("app").innerHTML = [
          '<div class="ck-load-error" role="alert">',
          "<span><strong>The API reference could not load.</strong>",
          'Use <a href="/swagger">Swagger</a> or open the ',
          '<a href="/openapi.json">OpenAPI document</a>.</span>',
          "</div>",
        ].join("");
      });
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
