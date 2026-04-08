package v2

import (
	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// publicMobileConfig returns public mobile app configuration values.
//
// @Summary Get public app configuration
// @Description Returns client-safe configuration values for the mobile app.
// @Tags Mobile App
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Router /v2/public-config [get]
func publicMobileConfig(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"sentry_dsn": a.Config.SentryDSNMobile,
		})
	}
}

// mobileInitialization returns the initial mobile account payload.
//
// @Summary Initialize all account data for mobile app
// @Description Returns a minimal initialization payload for the mobile app based on the supplied player tags.
// @Tags Mobile App
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body modelsv2.MobilePlayerTagsRequest true "Initialization payload"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/initialization [post]
func mobileInitialization(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body modelsv2.MobilePlayerTagsRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body.PlayerTags) == 0 {
			return apptypes.Error(fiber.StatusBadRequest, "player_tags cannot be empty")
		}
		playersBasic := make([]map[string]any, 0, len(body.PlayerTags))
		for _, tag := range body.PlayerTags {
			playersBasic = append(playersBasic, map[string]any{"tag": tag})
		}
		return apptypes.JSON(c, fiber.StatusOK, map[string]any{
			"players":       playersBasic,
			"players_basic": playersBasic,
			"clans": map[string]any{
				"clan_details":    map[string]any{},
				"clan_stats":      map[string]any{},
				"war_data":        []any{},
				"join_leave_data": map[string]any{},
				"capital_data":    []any{},
				"war_log_data":    []any{},
				"clan_war_stats":  []any{},
				"cwl_data":        []any{},
			},
			"war_stats": []any{},
			"clan_tags": []string{},
			"metadata": map[string]any{
				"total_players": len(body.PlayerTags),
				"total_clans":   0,
				"fetch_time":    "endpoint_calls",
				"user_id":       apptypes.UserID(c.UserContext()),
			},
		})
	}
}
