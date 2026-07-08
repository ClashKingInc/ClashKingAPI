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

	scalarHandler := swaggerdocs.NewScalarHandler("/openapi.json")
	swaggerHandler := swaggerdocs.NewUIHandler("/openapi.json")

	app.Get("/", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return scalarHandler(c)
	}))
	app.Get("/openapi.json", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		c.Type("json")
		return c.SendString(doc)
	}))
	app.Get("/docs", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return scalarHandler(c)
	}))
	app.Get("/docs/*", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return scalarHandler(c)
	}))
	app.Get("/swagger", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return c.Redirect("/swagger/index.html", fiber.StatusTemporaryRedirect)
	}))
	app.Get("/swagger/*", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		path := c.Path()
		if strings.HasPrefix(path, "/swagger/public") || strings.HasPrefix(path, "/swagger/private") {
			return fiber.ErrNotFound
		}
		return swaggerHandler(c)
	}))
	app.Get("/redoc", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return c.Redirect("/", fiber.StatusTemporaryRedirect)
	}))

	return nil
}
