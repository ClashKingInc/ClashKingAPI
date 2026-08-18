package routes

import (
	"strconv"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// reactivateServerTracking treats an authenticated Dashboard visit as server
// activity and restarts the same 90-day clock used by bot commands.
//
// @Summary Re-enable server tracking
// @Description Treats an authenticated Dashboard reactivation as server activity and restarts the 90-day tracking clock.
// @Tags Other
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Success 200 {object} modelsv2.NotificationMessageResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 500 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/reactivate [post]
func reactivateServerTracking(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := parseServerID(c)
		if err != nil {
			return err
		}
		result, err := a.Store.SQL.Exec(c.UserContext(), `
			UPDATE servers
			SET last_command_at = now()
			WHERE id = $1
		`, strconv.FormatInt(serverID, 10))
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(fiber.StatusNotFound, "Server not found")
		}
		return apptypes.JSON(c, fiber.StatusOK, modelsv2.NotificationMessageResponse{Message: "Server tracking re-enabled"})
	}
}
