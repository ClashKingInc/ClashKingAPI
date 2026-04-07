package routes

import (
	"net/http"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func emptyItems(key string) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, http.StatusOK, map[string]any{key: []any{}})
	}
}
