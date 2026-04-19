package server

import (
	"net/http"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// getServerSettings godoc
// @Summary Get server settings
// @Description Returns the full settings document for a Discord server.
// @Tags Server Settings
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param clan_settings query bool false "Include clan settings"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/settings [get]
func getServerSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		server, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if err != nil {
			return notFoundErr(err, "Server Not Found")
		}
		includeClans, err := apptypes.QueryBool(c, "clan_settings", false)
		if err != nil {
			return err
		}
		eval := map[string]any{}
		for key, collectionName := range serverSettingsEvalCollections {
			items, _ := findManyMaps(c.UserContext(), rt.Store.DB.Usafam.Collection(collectionName), bson.M{"server": serverID})
			eval[key] = sanitize(items)
		}
		server["eval"] = eval
		if includeClans {
			clans, _ := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
			server["clans"] = sanitize(clans)
		}
		return apptypes.JSON(c, http.StatusOK, sanitize(server))
	}
}

// putEmbedColor godoc
// @Summary Set embed color
// @Description Sets the embed color (decimal integer) for a Discord server.
// @Tags Server Settings
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param hex_code path int true "Embed color as decimal integer"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/embed-color/{hex_code} [put]
func putEmbedColor(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		hexCode, err := pathInt(c, "hex_code")
		if err != nil {
			return err
		}
		result, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$set": bson.M{"embed_color": hexCode}})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.EmbedColorResponse{Message: "Embed color updated", ServerID: serverID, EmbedColor: hexCode})
	}
}

// patchServerSettings godoc
// @Summary Update server settings
// @Description Partially updates server-level settings (nickname rules, eval config, etc.).
// @Tags Server Settings
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/settings [patch]
func patchServerSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID}); err != nil {
			return notFoundErr(err, "Server not found")
		}
		var body modelsv2.ServerSettingsUpdate
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		rawBody := structToUpdateMap(body)
		if len(rawBody) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		update := flattenForMongo(rawBody, "")
		if len(update) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		result, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$set": update})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerSettingsResponse{Message: "Server settings updated successfully", ServerID: serverID, UpdatedFields: len(update)})
	}
}

func structToUpdateMap(body modelsv2.ServerSettingsUpdate) map[string]any {
	out := map[string]any{}
	if body.EmbedColor != nil {
		out["embed_color"] = *body.EmbedColor
	}
	if body.NicknameRule != nil {
		out["nickname_rule"] = *body.NicknameRule
	}
	if body.NonFamilyNickname != nil {
		out["non_family_nickname_rule"] = *body.NonFamilyNickname
	}
	if body.ChangeNickname != nil {
		out["change_nickname"] = *body.ChangeNickname
	}
	if body.FlairNonFamily != nil {
		out["flair_non_family"] = *body.FlairNonFamily
	}
	if body.AutoEvalNickname != nil {
		out["auto_eval_nickname"] = *body.AutoEvalNickname
	}
	if body.AutoevalTriggers != nil {
		out["autoeval_triggers"] = body.AutoevalTriggers
	}
	if body.AutoevalLog != nil {
		out["autoeval_log"] = body.AutoevalLog
	}
	if body.Autoeval != nil {
		out["autoeval"] = *body.Autoeval
	}
	if body.BlacklistedRoles != nil {
		out["blacklisted_roles"] = body.BlacklistedRoles
	}
	if body.RoleTreatment != nil {
		out["role_treatment"] = body.RoleTreatment
	}
	if body.FullWhitelistRole != nil {
		out["full_whitelist_role"] = body.FullWhitelistRole
	}
	if body.LeadershipEval != nil {
		out["leadership_eval"] = *body.LeadershipEval
	}
	if body.AutoboardLimit != nil {
		out["autoboard_limit"] = *body.AutoboardLimit
	}
	if body.APIToken != nil {
		out["api_token"] = *body.APIToken
	}
	if body.Tied != nil {
		out["tied"] = *body.Tied
	}
	if body.Banlist != nil {
		out["banlist"] = body.Banlist
	}
	if body.StrikeLog != nil {
		out["strike_log"] = body.StrikeLog
	}
	if body.RedditFeed != nil {
		out["reddit_feed"] = body.RedditFeed
	}
	if body.FamilyLabel != nil {
		out["family_label"] = *body.FamilyLabel
	}
	if body.Greeting != nil {
		out["greeting"] = *body.Greeting
	}
	if body.LinkParse != nil {
		linkParse := map[string]any{}
		if body.LinkParse.Clan != nil {
			linkParse["clan"] = *body.LinkParse.Clan
		}
		if body.LinkParse.Army != nil {
			linkParse["army"] = *body.LinkParse.Army
		}
		if body.LinkParse.Player != nil {
			linkParse["player"] = *body.LinkParse.Player
		}
		if body.LinkParse.Base != nil {
			linkParse["base"] = *body.LinkParse.Base
		}
		if body.LinkParse.Show != nil {
			linkParse["show"] = *body.LinkParse.Show
		}
		out["link_parse"] = linkParse
	}
	return out
}
