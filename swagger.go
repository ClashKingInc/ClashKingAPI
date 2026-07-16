package main

import (
	"github.com/ClashKingInc/ClashKingAPI/internal/swaggerdocs"
	"github.com/gofiber/fiber/v2"
)

func (a *App) registerSwaggerRoutes(app *fiber.App) error {
	return swaggerdocs.RegisterRoutes(app)
}
