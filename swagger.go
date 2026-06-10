package main

import (
	"strings"

	"github.com/ClashKingInc/ClashKingAPI/internal/swaggerdocs"
	"github.com/gofiber/fiber/v2"
)

func (a *App) registerSwaggerRoutes(app *fiber.App) error {
	swaggerdocs.ConfigureInfo()

	doc, err := swaggerdocs.BuildDoc()
	if err != nil {
		return err
	}

	handler := swaggerdocs.NewUIHandler("/openapi.json")

	app.Get("/", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return c.Redirect("/docs", fiber.StatusTemporaryRedirect)
	}))
	app.Get("/openapi.json", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		c.Type("json")
		return c.SendString(doc)
	}))
	app.Get("/docs", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return c.Redirect("/docs/index.html", fiber.StatusTemporaryRedirect)
	}))
	app.Get("/docs/*", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		path := c.Path()
		if strings.HasPrefix(path, "/docs/public") || strings.HasPrefix(path, "/docs/private") {
			return fiber.ErrNotFound
		}
		return handler(c)
	}))
	app.Get("/redoc", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return c.Redirect("/docs", fiber.StatusTemporaryRedirect)
	}))

	return nil
}
