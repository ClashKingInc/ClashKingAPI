package routes

import (
	"github.com/ClashKingInc/ClashKingAPI/internal/models"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

var (
	_ = models.GuildInfo{}
	_ = models.GuildDetails{}
)

// getUserGuilds returns the authenticated user's guild list.
//
// @Summary Get user guilds with bot status
// @Description Returns the authenticated user's guilds and whether the bot is present.
// @Tags Guilds
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {array} models.GuildInfo
// @Failure 401 {object} map[string]interface{}
// @Failure 501 {object} map[string]interface{}
// @Router /v2/guilds [get]
func getUserGuilds() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if apptypes.UserID(c.UserContext()) == "" {
			return apptypes.Error(fiber.StatusUnauthorized, "Authentication token missing")
		}
		return apptypes.Error(fiber.StatusNotImplemented, "Discord guild listing is not implemented yet in the shared Discord adapter")
	}
}

// getGuildDetails returns metadata for a single guild.
//
// @Summary Get guild details by ID
// @Description Returns guild metadata for the requested server identifier.
// @Tags Guild
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Server ID"
// @Success 200 {object} models.GuildDetails
// @Failure 401 {object} map[string]interface{}
// @Failure 501 {object} map[string]interface{}
// @Router /v2/guild/{server_id} [get]
func getGuildDetails() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if apptypes.UserID(c.UserContext()) == "" {
			return apptypes.Error(fiber.StatusUnauthorized, "Authentication token missing")
		}
		return apptypes.Error(fiber.StatusNotImplemented, "Discord guild lookup is not implemented yet in the shared Discord adapter")
	}
}
