package v2

import (
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// publicConfig returns public configuration values for clients.
//
// @Summary Get public configuration
// @Description Returns client-safe configuration values.
// @Tags Configuration
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /v2/public [get]
// @Router /v2/config/public [get]
func publicConfig(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"sentry_dsn_mobile": a.Config.SentryDSNMobile,
		})
	}
}
