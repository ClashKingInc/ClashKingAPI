package main

import (
	"github.com/ClashKingInc/ClashKingAPI/internal/swaggerdocs"
	"github.com/gofiber/fiber/v2"
)

func (a *App) registerSwaggerRoutes(app *fiber.App) error {
	swaggerdocs.ConfigureInfo()

	publicDoc, err := swaggerdocs.BuildDoc(swaggerdocs.PublicScope)
	if err != nil {
		return err
	}
	privateDoc, err := swaggerdocs.BuildDoc(swaggerdocs.PrivateScope)
	if err != nil {
		return err
	}

	publicHandler := swaggerdocs.NewUIHandler("/openapi-public.json")
	privateHandler := swaggerdocs.NewUIHandler("/openapi-private.json")

	app.Get("/", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return c.Redirect("/docs", fiber.StatusTemporaryRedirect)
	}))
	app.Get("/openapi.json", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		c.Type("json")
		return c.SendString(publicDoc)
	}))
	app.Get("/openapi-public.json", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		c.Type("json")
		return c.SendString(publicDoc)
	}))
	app.Get("/openapi-private.json", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		c.Type("json")
		return c.SendString(privateDoc)
	}))
	app.Get("/docs", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return c.Redirect("/docs/public/index.html", fiber.StatusTemporaryRedirect)
	}))
	app.Get("/docs/public", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return c.Redirect("/docs/public/index.html", fiber.StatusTemporaryRedirect)
	}))
	app.Get("/docs/public/*", swaggerdocs.NoStore(publicHandler))
	app.Get("/docs/private", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return c.Redirect("/docs/private/index.html", fiber.StatusTemporaryRedirect)
	}))
	app.Get("/docs/private/*", swaggerdocs.NoStore(privateHandler))
	app.Get("/redoc", swaggerdocs.NoStore(func(c *fiber.Ctx) error {
		return c.Redirect("/docs", fiber.StatusTemporaryRedirect)
	}))

	return nil
}
