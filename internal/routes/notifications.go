package routes

import (
	"strings"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

type notificationDeviceUnregistration struct {
	DeviceID    string `json:"device_id"`
	Environment string `json:"environment"`
}

func unregisterNotificationDevice(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := strings.TrimSpace(apptypes.UserID(c.UserContext()))
		if userID == "" {
			return apptypes.Error(fiber.StatusUnauthorized, "Missing authenticated user")
		}

		var request notificationDeviceUnregistration
		if err := apptypes.DecodeJSON(c, &request); err != nil {
			return err
		}

		tokenDeviceID := strings.TrimSpace(apptypes.DeviceID(c.UserContext()))
		requestDeviceID := strings.TrimSpace(request.DeviceID)
		if tokenDeviceID != "" && requestDeviceID != "" && tokenDeviceID != requestDeviceID {
			return apptypes.Error(fiber.StatusForbidden, "Device does not match the authenticated session")
		}

		deviceID := tokenDeviceID
		if deviceID == "" {
			deviceID = requestDeviceID
		}
		if deviceID == "" {
			return apptypes.Error(fiber.StatusBadRequest, "device_id is required")
		}

		environment := strings.ToLower(strings.TrimSpace(request.Environment))
		if environment == "" {
			environment = "production"
		}
		if environment != "production" && environment != "sandbox" {
			return apptypes.Error(fiber.StatusBadRequest, "environment must be production or sandbox")
		}

		if a.Store == nil || a.Store.SQL == nil {
			return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
		}
		tag, err := a.Store.SQL.Exec(
			c.UserContext(),
			`DELETE FROM mobile_push_devices WHERE user_id = $1 AND device_id = $2 AND environment = $3`,
			userID,
			deviceID,
			environment,
		)
		if err != nil {
			return apptypes.Error(fiber.StatusInternalServerError, "Failed to unregister notification device")
		}

		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"ok":      true,
			"removed": tag.RowsAffected(),
		})
	}
}
