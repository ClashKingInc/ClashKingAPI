package server

import (
	"net/http"
	"strconv"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// getServerPanel godoc
// @Summary Get server welcome panel
// @Description Returns the welcome panel configuration for a server.
// @Tags Server Panels
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/panel [get]
func getServerPanel(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		doc, err := sqlServerPanelDoc(c, a, serverID)
		if err != nil {
			// No document → return empty defaults
			return apptypes.JSON(c, http.StatusOK, serverPanelResponse(doc))
		}
		return apptypes.JSON(c, http.StatusOK, serverPanelResponse(doc))
	}
}

// updateServerPanel godoc
// @Summary Update server welcome panel
// @Description Updates the welcome panel configuration for a server.
// @Tags Server Panels
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param body body modelsv2.ServerPanelBody true "Panel configuration"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/panel [put]
func updateServerPanel(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body modelsv2.ServerPanelBody
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		buttons := body.Buttons
		if buttons == nil {
			buttons = []string{}
		}
		buttonColor := body.ButtonColor
		if buttonColor == "" {
			buttonColor = "Grey"
		}
		payload := map[string]any{
			"welcome_link": map[string]any{
				"embed_name":      body.EmbedName,
				"buttons":         buttons,
				"button_color":    buttonColor,
				"welcome_channel": body.WelcomeChannel,
			},
		}
		_, err = a.Store.SQL.Exec(c.UserContext(), `
			INSERT INTO servers (id, name, logs_config, data, updated_at)
			VALUES ($1, '', $2::jsonb, jsonb_build_object('logs', $2::jsonb), now())
			ON CONFLICT (id) DO UPDATE SET
				logs_config = servers.logs_config || EXCLUDED.logs_config,
				data = servers.data || jsonb_build_object('logs', servers.logs_config || EXCLUDED.logs_config),
				updated_at = now()
		`, strconv.Itoa(serverID), apptypes.Marshal(payload))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"embed_name":      body.EmbedName,
			"buttons":         buttons,
			"button_color":    buttonColor,
			"welcome_channel": body.WelcomeChannel,
		})
	}
}

func serverPanelResponse(doc map[string]any) map[string]any {
	welcomeLink := mapMaybe(mapMaybe(doc["logs"])["welcome_link"])
	return map[string]any{
		"embed_name":      welcomeLink["embed_name"],
		"buttons":         serverPanelButtonsSlice(welcomeLink["buttons"]),
		"button_color":    serverPanelString(welcomeLink["button_color"], "Grey"),
		"welcome_channel": welcomeLink["welcome_channel"],
	}
}

func sqlServerPanelDoc(c *fiber.Ctx, a apptypes.Deps, serverID int) (map[string]any, error) {
	var raw []byte
	err := a.Store.SQL.QueryRow(c.UserContext(), `SELECT logs_config FROM servers WHERE id = $1`, strconv.Itoa(serverID)).Scan(&raw)
	if err != nil {
		return map[string]any{}, err
	}
	logs := jsonObject(raw)
	return map[string]any{"logs": logs}, nil
}

func serverPanelButtonsSlice(v any) []string {
	items := anySlice(v)
	out := make([]string, 0, len(items))
	for _, item := range items {
		button := serverAsString(item)
		if button != "" {
			out = append(out, button)
		}
	}
	return out
}

func serverPanelString(v any, defaultVal string) string {
	if s, ok := v.(string); ok && s != "" {
		return s
	}
	return defaultVal
}
