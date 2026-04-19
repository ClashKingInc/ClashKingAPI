package server

import (
	"net/http"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
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
// @Router /v2/{server_id}/panel [get]
func getServerPanel(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var doc bson.M
		err = a.Store.C.ServerDB.FindOne(c.UserContext(),
			bson.M{"server": serverID},
			options.FindOne().SetProjection(bson.M{"_id": 0, "logs.welcome_link": 1}),
		).Decode(&doc)
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
// @Router /v2/{server_id}/panel [put]
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
		_, err = a.Store.C.ServerDB.UpdateOne(c.UserContext(),
			bson.M{"server": serverID},
			bson.M{"$set": bson.M{
				"logs.welcome_link.embed_name":      body.EmbedName,
				"logs.welcome_link.buttons":         buttons,
				"logs.welcome_link.button_color":    buttonColor,
				"logs.welcome_link.welcome_channel": body.WelcomeChannel,
			}},
			options.UpdateOne().SetUpsert(true),
		)
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

func serverPanelResponse(doc bson.M) map[string]any {
	welcomeLink := mapMaybe(mapMaybe(doc["logs"])["welcome_link"])
	return map[string]any{
		"embed_name":      welcomeLink["embed_name"],
		"buttons":         serverPanelButtonsSlice(welcomeLink["buttons"]),
		"button_color":    serverPanelString(welcomeLink["button_color"], "Grey"),
		"welcome_channel": welcomeLink["welcome_channel"],
	}
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
