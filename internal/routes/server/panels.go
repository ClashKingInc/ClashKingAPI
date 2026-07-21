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
// @Success 200 {object} modelsv2.ServerPanelResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
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
// @Success 200 {object} modelsv2.ServerPanelResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
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
		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		if _, err = tx.Exec(c.UserContext(), `
			INSERT INTO server_welcome_panels (server_id, embed_name, button_color, welcome_channel_id, updated_at)
			VALUES ($1, NULLIF($2, ''), $3, NULLIF($4, ''), now())
			ON CONFLICT (server_id) DO UPDATE SET
				embed_name = EXCLUDED.embed_name,
				button_color = EXCLUDED.button_color,
				welcome_channel_id = EXCLUDED.welcome_channel_id,
				updated_at = now()
		`, strconv.Itoa(serverID), body.EmbedName, buttonColor, body.WelcomeChannel); err != nil {
			return err
		}
		if _, err = tx.Exec(c.UserContext(), `DELETE FROM server_welcome_panel_buttons WHERE server_id = $1`, strconv.Itoa(serverID)); err != nil {
			return err
		}
		for position, button := range buttons {
			if _, err = tx.Exec(c.UserContext(), `INSERT INTO server_welcome_panel_buttons (server_id, button_name, position) VALUES ($1, $2, $3)`, strconv.Itoa(serverID), button, position); err != nil {
				return err
			}
		}
		if err = tx.Commit(c.UserContext()); err != nil {
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
	return map[string]any{
		"embed_name":      doc["embed_name"],
		"buttons":         serverPanelButtonsSlice(doc["buttons"]),
		"button_color":    serverPanelString(doc["button_color"], "Grey"),
		"welcome_channel": doc["welcome_channel"],
	}
}

func sqlServerPanelDoc(c *fiber.Ctx, a apptypes.Deps, serverID int) (map[string]any, error) {
	var embedName, welcomeChannel *string
	var buttonColor string
	err := a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT embed_name, button_color, welcome_channel_id
		FROM server_welcome_panels WHERE server_id = $1
	`, strconv.Itoa(serverID)).Scan(&embedName, &buttonColor, &welcomeChannel)
	if err != nil {
		return map[string]any{}, err
	}
	buttons := queryStringColumn(c, a, `SELECT button_name FROM server_welcome_panel_buttons WHERE server_id = $1 ORDER BY position, button_name`, strconv.Itoa(serverID))
	doc := map[string]any{"button_color": buttonColor, "buttons": buttons}
	optionalDocString(doc, "embed_name", embedName)
	optionalDocString(doc, "welcome_channel", welcomeChannel)
	return doc, nil
}

func serverPanelButtonsSlice(v any) []string {
	if items, ok := v.([]string); ok {
		return items
	}
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
