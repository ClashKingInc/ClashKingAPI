package main

import (
	"encoding/json"

	docs "github.com/ClashKingInc/ClashKingAPI/internal/docs"
	"github.com/gofiber/fiber/v2"
	fiberSwagger "github.com/swaggo/fiber-swagger"
	"github.com/swaggo/swag"
)

const (
	swaggerBaseTitle       = "ClashKing API"
	swaggerBaseDescription = "ClashKing Go API documentation. This API is still under active construction, so use it with caution because endpoints and payloads may still change."
	swaggerPublicDesc      = "Unauthenticated endpoints only. For the full authenticated reference, see [private docs](/docs/private)."
	swaggerPrivateDesc     = "Authenticated endpoints only. Use Authorize with `Bearer <access_token>` for protected routes. For the unauthenticated reference, see [public docs](/docs/public)."
	swaggerVersion         = "1.0"
)

var swaggerHTTPMethods = map[string]struct{}{
	"get":     {},
	"post":    {},
	"put":     {},
	"patch":   {},
	"delete":  {},
	"head":    {},
	"options": {},
}

type swaggerScope int

const (
	swaggerScopePrivate swaggerScope = iota
	swaggerScopePublic
)

func (a *App) registerSwaggerRoutes(app *fiber.App) error {
	configureSwaggerInfo()

	publicDoc, err := buildSwaggerDoc(swaggerScopePublic)
	if err != nil {
		return err
	}
	privateDoc, err := buildSwaggerDoc(swaggerScopePrivate)
	if err != nil {
		return err
	}

	publicHandler := fiberSwagger.FiberWrapHandler(fiberSwagger.URL("/openapi-public.json"))
	privateHandler := fiberSwagger.FiberWrapHandler(fiberSwagger.URL("/openapi-private.json"))

	app.Get("/", func(c *fiber.Ctx) error {
		return c.Redirect("/docs", fiber.StatusTemporaryRedirect)
	})
	app.Get("/openapi.json", func(c *fiber.Ctx) error {
		c.Type("json")
		return c.SendString(publicDoc)
	})
	app.Get("/openapi-public.json", func(c *fiber.Ctx) error {
		c.Type("json")
		return c.SendString(publicDoc)
	})
	app.Get("/openapi-private.json", func(c *fiber.Ctx) error {
		c.Type("json")
		return c.SendString(privateDoc)
	})
	app.Get("/docs", func(c *fiber.Ctx) error {
		return c.Redirect("/docs/public/index.html", fiber.StatusTemporaryRedirect)
	})
	app.Get("/docs/public", func(c *fiber.Ctx) error {
		return c.Redirect("/docs/public/index.html", fiber.StatusTemporaryRedirect)
	})
	app.Get("/docs/public/*", publicHandler)
	app.Get("/docs/private", func(c *fiber.Ctx) error {
		return c.Redirect("/docs/private/index.html", fiber.StatusTemporaryRedirect)
	})
	app.Get("/docs/private/*", privateHandler)
	app.Get("/redoc", func(c *fiber.Ctx) error {
		return c.Redirect("/docs", fiber.StatusTemporaryRedirect)
	})

	return nil
}

func configureSwaggerInfo() {
	docs.SwaggerInfo.Title = swaggerBaseTitle
	docs.SwaggerInfo.Description = swaggerBaseDescription
	docs.SwaggerInfo.Version = swaggerVersion
	docs.SwaggerInfo.BasePath = "/"
}

func buildSwaggerDoc(scope swaggerScope) (string, error) {
	raw, err := swag.ReadDoc(docs.SwaggerInfo.InstanceName())
	if err != nil {
		return "", err
	}

	var doc map[string]any
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		return "", err
	}

	setSwaggerMetadata(doc, scope)
	ensureSwaggerSecurityDefinition(doc)
	if scope == swaggerScopePublic {
		filterPublicSwaggerPaths(doc)
		delete(doc, "securityDefinitions")
	} else {
		filterPrivateSwaggerPaths(doc)
	}

	data, err := json.Marshal(doc)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func setSwaggerMetadata(doc map[string]any, scope swaggerScope) {
	info, _ := doc["info"].(map[string]any)
	if info == nil {
		info = map[string]any{}
		doc["info"] = info
	}

	switch scope {
	case swaggerScopePublic:
		info["title"] = swaggerBaseTitle + " (Public)"
		info["description"] = swaggerBaseDescription + " " + swaggerPublicDesc
	default:
		info["title"] = swaggerBaseTitle + " (Private)"
		info["description"] = swaggerBaseDescription + " " + swaggerPrivateDesc
	}
	info["version"] = swaggerVersion
}

func ensureSwaggerSecurityDefinition(doc map[string]any) {
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

func filterPublicSwaggerPaths(doc map[string]any) {
	filterSwaggerPaths(doc, false)
}

func filterPrivateSwaggerPaths(doc map[string]any) {
	filterSwaggerPaths(doc, true)
}

func filterSwaggerPaths(doc map[string]any, authenticatedOnly bool) {
	paths, _ := doc["paths"].(map[string]any)
	if paths == nil {
		return
	}

	filteredPaths := make(map[string]any, len(paths))
	for path, rawPathItem := range paths {
		pathItem, _ := rawPathItem.(map[string]any)
		if pathItem == nil {
			continue
		}

		filteredPathItem := make(map[string]any, len(pathItem))
		hasOperation := false
		for method, rawOperation := range pathItem {
			if _, isHTTPMethod := swaggerHTTPMethods[method]; !isHTTPMethod {
				filteredPathItem[method] = rawOperation
				continue
			}

			operation, _ := rawOperation.(map[string]any)
			if operation == nil {
				continue
			}
			if authenticatedOnly != operationRequiresAuth(operation) {
				continue
			}
			filteredPathItem[method] = rawOperation
			hasOperation = true
		}

		if hasOperation {
			filteredPaths[path] = filteredPathItem
		}
	}

	doc["paths"] = filteredPaths
}

func operationRequiresAuth(operation map[string]any) bool {
	security, found := operation["security"]
	if !found {
		return false
	}

	entries, ok := security.([]any)
	if !ok {
		return true
	}
	return len(entries) > 0
}
