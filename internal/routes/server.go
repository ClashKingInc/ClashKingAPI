package routes

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

var (
	serverRoleCollections = map[string]string{
		"townhall":        "townhallroles",
		"league":          "legendleagueroles",
		"builderhall":     "builderhallroles",
		"builder_league":  "builderleagueroles",
		"achievement":     "achievementroles",
		"family_position": "family_roles",
	}
	serverSettingsEvalCollections = map[string]string{
		"league_roles":          "legendleagueroles",
		"ignored_roles":         "evalignore",
		"family_roles":          "generalrole",
		"not_family_roles":      "linkrole",
		"only_family_roles":     "familyexclusiveroles",
		"family_position_roles": "family_roles",
		"townhall_roles":        "townhallroles",
		"builderhall_roles":     "builderhallroles",
		"achievement_roles":     "achievementroles",
		"status_roles":          "statusroles",
		"builder_league_roles":  "builderleagueroles",
	}
	familyRoleCollections = map[string]string{
		"general":          "generalrole",
		"not_family":       "linkrole",
		"family_exclusive": "familyexclusiveroles",
		"family_position":  "family_roles",
		"ignored":          "evalignore",
	}
	countdownDBFields = map[string]string{
		"cwl":          "cwlCountdown",
		"clan_games":   "gamesCountdown",
		"raid_weekend": "raidCountdown",
		"eos":          "eosCountdown",
		"member_count": "memberCountWarning",
		"season_day":   "seasonCountdown",
		"war_score":    "warCountdown",
		"war_timer":    "warTimerCountdown",
	}
	serverCountdownTypes = []string{"cwl", "clan_games", "raid_weekend", "eos", "member_count", "season_day"}
	clanCountdownTypes   = []string{"war_score", "war_timer"}
	logMapping           = map[string]string{
		"join_log":               "join_leave_log",
		"leave_log":              "join_leave_log",
		"donation_log":           "donation_log",
		"clan_achievement_log":   "clan_achievement_log",
		"clan_requirements_log":  "clan_requirements_log",
		"clan_description_log":   "clan_description_log",
		"war_log":                "war_log",
		"war_panel":              "war_panel",
		"cwl_lineup_change_log":  "cwl_lineup_change_log",
		"capital_donations":      "capital_donation_log",
		"capital_attacks":        "capital_raid_log",
		"raid_panel":             "raid_panel",
		"capital_weekly_summary": "capital_weekly_summary",
		"role_change":            "player_upgrade_log",
		"th_upgrade":             "player_upgrade_log",
		"troop_upgrade":          "player_upgrade_log",
		"hero_upgrade":           "player_upgrade_log",
		"spell_upgrade":          "player_upgrade_log",
		"hero_equipment_upgrade": "player_upgrade_log",
		"super_troop_boost":      "player_upgrade_log",
		"league_change":          "player_upgrade_log",
		"name_change":            "player_upgrade_log",
		"legend_log_attacks":     "legend_log",
		"legend_log_defenses":    "legend_log",
	}
	apiToDBLogMapping = map[string][]string{
		"join_leave_log":         {"join_log", "leave_log"},
		"donation_log":           {"donation_log"},
		"clan_achievement_log":   {"clan_achievement_log"},
		"clan_requirements_log":  {"clan_requirements_log"},
		"clan_description_log":   {"clan_description_log"},
		"war_log":                {"war_log"},
		"war_panel":              {"war_panel"},
		"cwl_lineup_change_log":  {"cwl_lineup_change_log"},
		"capital_donation_log":   {"capital_donations"},
		"capital_raid_log":       {"capital_attacks"},
		"raid_panel":             {"raid_panel"},
		"capital_weekly_summary": {"capital_weekly_summary"},
		"player_upgrade_log": {
			"th_upgrade", "troop_upgrade", "hero_upgrade", "spell_upgrade",
			"hero_equipment_upgrade", "super_troop_boost", "role_change",
			"league_change", "name_change",
		},
		"legend_log": {"legend_log_attacks", "legend_log_defenses"},
	}
)

// getServerSettings godoc
// @Summary Get settings for a server
// @Description Returns the stored settings for a server, optionally including clan settings.
// @Tags Server Settings
// @Produce json
// @Param server_id path int true "Server ID"
// @Param clan_settings query bool false "Include clan settings"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
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

// getServerClanSettings godoc
// @Summary Get clan settings for a server
// @Description Returns the stored clan settings document for the given server and clan tag.
// @Tags Server Settings
// @Produce json
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/clan/{clan_tag}/settings [get]
func getServerClanSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		doc, err := findOneMap(c.UserContext(), rt.Store.C.ClanDB, bson.M{"tag": tag, "server": serverID})
		if err != nil {
			return notFoundErr(err, "Server or clan not found")
		}
		return apptypes.JSON(c, http.StatusOK, sanitize(doc))
	}
}

// putEmbedColor godoc
// @Summary Update server embed color
// @Description Updates the Discord embed color stored for the server.
// @Tags Server Settings
// @Produce json
// @Param server_id path int true "Server ID"
// @Param hex_code path int true "Embed color hex code"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
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
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Embed color updated", "server_id": serverID, "embed_color": hexCode})
	}
}

// patchServerSettings godoc
// @Summary Update server settings
// @Description Applies a partial update to the server settings document.
// @Tags Server Settings
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param request body map[string]interface{} true "Fields to update"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
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
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		update := flattenForMongo(body, "")
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
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Server settings updated successfully", "server_id": serverID, "updated_fields": len(update)})
	}
}

// getServerLogs godoc
// @Summary Get server logs
// @Description Returns the configured log wiring for the server and its clans.
// @Tags Server Logs
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/logs [get]
func getServerLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		clans, err := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		aggregated := map[string]map[string]any{}
		for _, clanDoc := range clans {
			logs, _ := clanDoc["logs"].(map[string]any)
			for dbName, apiName := range logMapping {
				raw, _ := logs[dbName].(map[string]any)
				webhook := serverAsString(raw["webhook"])
				if webhook == "" {
					continue
				}
				if _, ok := aggregated[apiName]; !ok {
					aggregated[apiName] = map[string]any{
						"enabled": true,
						"channel": nil,
						"thread":  raw["thread"],
						"webhook": webhook,
						"clans":   []string{},
					}
				}
				existing := aggregated[apiName]["clans"].([]string)
				tag := serverAsString(clanDoc["tag"])
				if !slices.Contains(existing, tag) {
					aggregated[apiName]["clans"] = append(existing, tag)
				}
			}
		}
		return apptypes.JSON(c, http.StatusOK, aggregated)
	}
}

// updateServerLogs godoc
// @Summary Update server logs
// @Description Updates the configured webhook/thread pairs for one or more server log categories.
// @Tags Server Logs
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param request body map[string]interface{} true "Log configuration payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/logs [put]
func updateServerLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body map[string]map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No log settings provided")
		}
		for apiName, config := range body {
			dbNames := apiToDBLogMapping[apiName]
			if len(dbNames) == 0 {
				continue
			}
			var clans []string
			switch raw := config["clans"].(type) {
			case []any:
				for _, item := range raw {
					if tag := serverNormalizeTag(serverAsString(item)); tag != "" {
						clans = append(clans, tag)
					}
				}
			case []string:
				for _, item := range raw {
					clans = append(clans, serverNormalizeTag(item))
				}
			}
			for _, clanTag := range clans {
				set := bson.M{}
				for _, dbName := range dbNames {
					set["logs."+dbName] = bson.M{
						"webhook": config["webhook"],
						"thread":  config["thread"],
					}
				}
				_, _ = rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": clanTag}, bson.M{"$set": set})
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Server logs updated successfully", "server_id": serverID})
	}
}

// patchServerLogType godoc
// @Summary Update log type
// @Description Updates the stored configuration for a specific server log type.
// @Tags Server Logs
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param log_type path string true "Log type"
// @Param request body map[string]interface{} true "Log type payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/logs/{log_type} [patch]
func patchServerLogType(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		logType := c.Params("log_type")
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if _, ok := apiToDBLogMapping[logType]; !ok {
			return apptypes.Error(http.StatusBadRequest, "Unknown log type")
		}
		_, err = rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$set": bson.M{"logs_config." + logType: body}})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Log type updated", "server_id": serverID, "log_type": logType})
	}
}

// getServerClansBasic godoc
// @Summary Get server clans basic
// @Description Returns a lightweight list of clans for the server.
// @Tags Server Logs
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/clans-basic [get]
func getServerClansBasic(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		clans, err := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		items := make([]map[string]any, 0, len(clans))
		for _, clanDoc := range clans {
			items = append(items, map[string]any{
				"tag":  clanDoc["tag"],
				"name": clanDoc["name"],
			})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items})
	}
}

// getAllClanLogs godoc
// @Summary Get all clan logs
// @Description Returns the full clan log documents for the server.
// @Tags Server Logs
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/clan-logs [get]
func getAllClanLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		clans, err := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(clans)})
	}
}

// putClanLogs godoc
// @Summary Update clan logs
// @Description Replaces the stored logs document for the given clan on the server.
// @Tags Server Logs
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan tag"
// @Param request body map[string]interface{} true "Logs payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/clan/{clan_tag}/logs [put]
func putClanLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$set": bson.M{"logs": body}})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Clan logs updated successfully", "server_id": serverID, "clan_tag": tag})
	}
}

// deleteClanLogs godoc
// @Summary Delete clan logs
// @Description Clears the stored logs document for the given clan on the server.
// @Tags Server Logs
// @Produce json
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/clan/{clan_tag}/logs [delete]
func deleteClanLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$set": bson.M{"logs": bson.M{}}})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Clan logs deleted successfully", "server_id": serverID, "clan_tag": tag})
	}
}

// getServerReminders godoc
// @Summary Get server reminders
// @Description Returns reminders grouped by reminder type for the server.
// @Tags Server Reminders
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/reminders [get]
func getServerReminders(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		reminders, err := findManyMaps(c.UserContext(), rt.Store.C.Reminders, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		response := map[string]any{
			"war_reminders":        []any{},
			"capital_reminders":    []any{},
			"clan_games_reminders": []any{},
			"inactivity_reminders": []any{},
			"roster_reminders":     []any{},
		}
		for _, reminder := range reminders {
			item := sanitize(reminder)
			switch serverAsString(reminder["type"]) {
			case "War":
				response["war_reminders"] = append(response["war_reminders"].([]any), item)
			case "Clan Capital":
				response["capital_reminders"] = append(response["capital_reminders"].([]any), item)
			case "Clan Games":
				response["clan_games_reminders"] = append(response["clan_games_reminders"].([]any), item)
			case "Inactivity":
				response["inactivity_reminders"] = append(response["inactivity_reminders"].([]any), item)
			case "roster":
				response["roster_reminders"] = append(response["roster_reminders"].([]any), item)
			}
		}
		return apptypes.JSON(c, http.StatusOK, response)
	}
}

// createReminder godoc
// @Summary Create a reminder
// @Description Creates a reminder for the given server.
// @Tags Server Reminders
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param request body map[string]interface{} true "Reminder payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/reminders [post]
func createReminder(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID}); err != nil {
			return notFoundErr(err, "Server not found")
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		body["server"] = serverID
		result, err := rt.Store.C.Reminders.InsertOne(c.UserContext(), body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Reminder created successfully", "reminder_id": sanitizeObjectID(result.InsertedID), "server_id": serverID})
	}
}

// updateReminder godoc
// @Summary Update a reminder
// @Description Updates an existing reminder for the given server.
// @Tags Server Reminders
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param reminder_id path string true "Reminder ID"
// @Param request body map[string]interface{} true "Reminder payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/reminders/{reminder_id} [put]
func updateReminder(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id, err := objectID(c.Params("reminder_id"))
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		result, err := rt.Store.C.Reminders.UpdateOne(c.UserContext(), bson.M{"_id": id, "server": serverID}, bson.M{"$set": body})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Reminder not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Reminder updated successfully", "reminder_id": c.Params("reminder_id"), "server_id": serverID})
	}
}

// deleteReminder godoc
// @Summary Delete a reminder
// @Description Deletes an existing reminder for the given server.
// @Tags Server Reminders
// @Produce json
// @Param server_id path int true "Server ID"
// @Param reminder_id path string true "Reminder ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/reminders/{reminder_id} [delete]
func deleteReminder(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id, err := objectID(c.Params("reminder_id"))
		if err != nil {
			return err
		}
		result, err := rt.Store.C.Reminders.DeleteOne(c.UserContext(), bson.M{"_id": id, "server": serverID})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Reminder not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Reminder deleted successfully", "reminder_id": c.Params("reminder_id"), "server_id": serverID})
	}
}

// getAutoboards godoc
// @Summary Get server autoboards
// @Description Returns the configured autoboards and counts for the server.
// @Tags Server AutoBoards
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/autoboards [get]
func getAutoboards(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		items, err := findManyMaps(c.UserContext(), rt.Store.C.Autoboards, bson.M{"server_id": serverID})
		if err != nil {
			return err
		}
		postCount := 0
		refreshCount := 0
		for _, item := range items {
			if serverAsString(item["type"]) == "post" {
				postCount++
			} else {
				refreshCount++
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"autoboards":    sanitize(items),
			"total":         len(items),
			"post_count":    postCount,
			"refresh_count": refreshCount,
			"limit":         asIntWithDefault(serverDoc["autoboard_limit"], 10),
		})
	}
}

// createAutoboard godoc
// @Summary Create an autoboard
// @Description Creates a new autoboard for the given server.
// @Tags Server AutoBoards
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param request body map[string]interface{} true "Autoboard payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/autoboards [post]
func createAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		limit := asIntWithDefault(serverDoc["autoboard_limit"], 10)
		existingCount, _ := rt.Store.C.Autoboards.CountDocuments(c.UserContext(), bson.M{"server_id": serverID})
		if int(existingCount) >= limit {
			return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("Autoboard limit reached (%d/%d). Please upgrade or delete existing autoboards.", existingCount, limit))
		}
		body["server_id"] = serverID
		body["created_at"] = time.Now().UTC()
		result, err := rt.Store.C.Autoboards.InsertOne(c.UserContext(), body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Autoboard created successfully", "autoboard_id": sanitizeObjectID(result.InsertedID), "server_id": serverID, "type": body["type"]})
	}
}

// updateAutoboard godoc
// @Summary Update an autoboard
// @Description Updates an existing autoboard by ID.
// @Tags Server AutoBoards
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param autoboard_id path string true "Autoboard ID"
// @Param request body map[string]interface{} true "Autoboard payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/autoboards/{autoboard_id} [patch]
func updateAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id, err := objectID(c.Params("autoboard_id"))
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		result, err := rt.Store.C.Autoboards.UpdateOne(c.UserContext(), bson.M{"_id": id, "server_id": serverID}, bson.M{"$set": body})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Autoboard not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Autoboard updated successfully", "autoboard_id": c.Params("autoboard_id"), "updated_fields": len(body)})
	}
}

// deleteAutoboard godoc
// @Summary Delete an autoboard
// @Description Deletes an existing autoboard by ID.
// @Tags Server AutoBoards
// @Produce json
// @Param server_id path int true "Server ID"
// @Param autoboard_id path string true "Autoboard ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/autoboards/{autoboard_id} [delete]
func deleteAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id, err := objectID(c.Params("autoboard_id"))
		if err != nil {
			return err
		}
		result, err := rt.Store.C.Autoboards.DeleteOne(c.UserContext(), bson.M{"_id": id, "server_id": serverID})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Autoboard not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Autoboard deleted successfully", "autoboard_id": c.Params("autoboard_id")})
	}
}

// getLinks godoc
// @Summary Get server links
// @Description Returns member link data grouped by Discord user ID for the server.
// @Tags Server Links
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/links [get]
func getLinks(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID}); err != nil {
			return notFoundErr(err, "Server not found")
		}
		links, err := findManyMaps(c.UserContext(), rt.Store.C.Links, bson.M{"server_id": serverID})
		if err != nil {
			links, _ = findManyMaps(c.UserContext(), rt.Store.C.Links, bson.M{"server": serverID})
		}
		grouped := map[string][]map[string]any{}
		for _, link := range links {
			userID := serverAsString(link["user_id"])
			if userID == "" {
				userID = serverAsString(link["discord_user"])
			}
			grouped[userID] = append(grouped[userID], map[string]any{
				"player_tag":  link["player_tag"],
				"order_index": link["order_index"],
			})
		}
		items := make([]map[string]any, 0, len(grouped))
		for userID, userLinks := range grouped {
			items = append(items, map[string]any{
				"user_discord_id": userID,
				"links":           userLinks,
			})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items, "count": len(items)})
	}
}

// deleteLink godoc
// @Summary Unlink account from member
// @Description Removes a single player tag from a Discord member on the server.
// @Tags Server Links
// @Produce json
// @Param server_id path int true "Server ID"
// @Param user_discord_id path string true "Discord user ID"
// @Param player_tag path string true "Player tag"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/links/{user_discord_id}/{player_tag} [delete]
func deleteLink(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		userID := c.Params("user_discord_id")
		tag := serverNormalizeTag(c.Params("player_tag"))
		result, err := rt.Store.C.Links.DeleteOne(c.UserContext(), bson.M{"server_id": serverID, "user_id": userID, "player_tag": tag})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			result, err = rt.Store.C.Links.DeleteOne(c.UserContext(), bson.M{"server": serverID, "user_id": userID, "player_tag": tag})
			if err != nil {
				return err
			}
			if result.DeletedCount == 0 {
				return apptypes.Error(http.StatusNotFound, "Link not found")
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Link removed successfully", "player_tag": tag, "user_id": userID})
	}
}

// bulkUnlink godoc
// @Summary Bulk unlink accounts from member
// @Description Removes multiple player tags from a Discord member on the server.
// @Tags Server Links
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param request body map[string]interface{} true "Bulk unlink payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/links/bulk-unlink [post]
func bulkUnlink(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body struct {
			UserDiscordID string   `json:"user_discord_id"`
			PlayerTags    []string `json:"player_tags"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tags := make([]string, 0, len(body.PlayerTags))
		for _, tag := range body.PlayerTags {
			tags = append(tags, serverNormalizeTag(tag))
		}
		result, err := rt.Store.C.Links.DeleteMany(c.UserContext(), bson.M{"server_id": serverID, "user_id": body.UserDiscordID, "player_tag": bson.M{"$in": tags}})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Links removed successfully", "deleted_count": result.DeletedCount})
	}
}

// getServerClans godoc
// @Summary Get server clans
// @Description Returns the clans stored on the server.
// @Tags Clan Settings
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/clans [get]
func getServerClans(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		clans, err := findManyMaps(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(clans), "count": len(clans)})
	}
}

// patchClanSettings godoc
// @Summary Update clan settings
// @Description Updates the stored settings for a clan attached to a server.
// @Tags Clan Settings
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan tag"
// @Param request body map[string]interface{} true "Clan settings payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/clan/{clan_tag}/settings [patch]
func patchClanSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$set": body})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Server or clan not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Clan settings updated successfully", "server_id": serverID, "clan_tag": tag, "updated_fields": len(body)})
	}
}

// addServerClan godoc
// @Summary Add clan
// @Description Adds a clan to the server configuration.
// @Tags Clan Settings
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param request body map[string]interface{} true "Clan payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/clans [post]
func addServerClan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		tag := serverNormalizeTag(serverAsString(body["tag"]))
		if tag == "" {
			return apptypes.Error(http.StatusBadRequest, "tag is required")
		}
		body["tag"] = tag
		body["server"] = serverID
		if body["name"] == nil && rt.Clash != nil {
			if clanDoc, err := rt.Clash.GetClan(c.UserContext(), tag); err == nil && clanDoc != nil {
				body["name"] = clanDoc.Name
			}
		}
		_, err = rt.Store.C.ClanDB.InsertOne(c.UserContext(), body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Clan added successfully", "server_id": serverID, "clan_tag": tag})
	}
}

// removeServerClan godoc
// @Summary Remove clan
// @Description Removes a clan from the server configuration.
// @Tags Clan Settings
// @Produce json
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/clans/{clan_tag} [delete]
func removeServerClan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		result, err := rt.Store.C.ClanDB.DeleteOne(c.UserContext(), bson.M{"server": serverID, "tag": tag})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Clan removed successfully", "server_id": serverID, "clan_tag": tag})
	}
}

// listRoles godoc
// @Summary List roles by type
// @Description Returns the configured roles for the requested role type.
// @Tags Role Management
// @Produce json
// @Param server_id path int true "Server ID"
// @Param role_type path string true "Role type"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/roles/{role_type} [get]
func listRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roleType := c.Params("role_type")
		var items []map[string]any
		if roleType == "status" {
			serverDoc, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
			if err != nil {
				return notFoundErr(err, "Server not found")
			}
			statusRoles, _ := serverDoc["status_roles"].(map[string]any)
			discordRoles, _ := statusRoles["discord"].([]any)
			for _, role := range discordRoles {
				if cast, ok := role.(map[string]any); ok {
					items = append(items, cast)
				}
			}
		} else {
			collection := roleCollection(rt, roleType)
			if collection == nil {
				return apptypes.Error(http.StatusBadRequest, "Unsupported role type")
			}
			items, err = findManyMaps(c.UserContext(), collection, bson.M{"server": serverID})
			if err != nil {
				return err
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(items), "count": len(items)})
	}
}

// createRole godoc
// @Summary Create role
// @Description Creates a role for the requested role type.
// @Tags Role Management
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param role_type path string true "Role type"
// @Param request body map[string]interface{} true "Role payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/roles/{role_type} [post]
func createRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roleType := c.Params("role_type")
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		body["server"] = serverID
		if roleType == "status" {
			roleID := body["id"]
			_, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$addToSet": bson.M{"status_roles.discord": body}})
			if err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Role created successfully", "role_type": roleType, "role_id": roleID})
		}
		collection := roleCollection(rt, roleType)
		if collection == nil {
			return apptypes.Error(http.StatusBadRequest, "Unsupported role type")
		}
		result, err := collection.InsertOne(c.UserContext(), body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Role created successfully", "role_type": roleType, "role_id": sanitizeObjectID(result.InsertedID)})
	}
}

// deleteRole godoc
// @Summary Delete role
// @Description Deletes a role for the requested role type.
// @Tags Role Management
// @Produce json
// @Param server_id path int true "Server ID"
// @Param role_type path string true "Role type"
// @Param role_id path string true "Role ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/roles/{role_type}/{role_id} [delete]
func deleteRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roleType := c.Params("role_type")
		roleID := c.Params("role_id")
		if roleType == "status" {
			_, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$pull": bson.M{"status_roles.discord": bson.M{"id": roleID}}})
			if err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Role deleted successfully", "role_type": roleType, "role_id": roleID})
		}
		collection := roleCollection(rt, roleType)
		if collection == nil {
			return apptypes.Error(http.StatusBadRequest, "Unsupported role type")
		}
		result, err := collection.DeleteOne(c.UserContext(), bson.M{"server": serverID, "$or": []bson.M{{"role": roleID}, {"role": numericMaybe(roleID)}}})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Role not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Role deleted successfully", "role_type": roleType, "role_id": roleID})
	}
}

// getRoleSettings godoc
// @Summary Get role settings
// @Description Returns the server's role settings document.
// @Tags Role Management
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/role-settings [get]
func getRoleSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"blacklisted_roles":   serverDoc["blacklisted_roles"],
			"role_treatment":      serverDoc["role_treatment"],
			"full_whitelist_role": serverDoc["full_whitelist_role"],
		})
	}
}

// patchRoleSettings godoc
// @Summary Update role settings
// @Description Applies a partial update to the server's role settings.
// @Tags Role Management
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param request body map[string]interface{} true "Role settings payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/role-settings [patch]
func patchRoleSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		result, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$set": body})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Role settings updated successfully", "updated_fields": len(body)})
	}
}

// getAllRoles godoc
// @Summary Get all roles
// @Description Returns every configured role group for the server.
// @Tags Role Management
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/all-roles [get]
func getAllRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		out := map[string]any{}
		for roleType := range serverRoleCollections {
			collection := roleCollection(rt, roleType)
			items, _ := findManyMaps(c.UserContext(), collection, bson.M{"server": serverID})
			out[roleType] = sanitize(items)
		}
		serverDoc, _ := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		statusRoles, _ := serverDoc["status_roles"].(map[string]any)
		out["status"] = sanitize(statusRoles["discord"])
		return apptypes.JSON(c, http.StatusOK, out)
	}
}

// getFamilyRoles godoc
// @Summary Get family roles
// @Description Returns family role documents for the server.
// @Tags Family Roles
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/family-roles [get]
func getFamilyRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		out := map[string]any{}
		for key, collectionName := range familyRoleCollections {
			items, _ := findManyMaps(c.UserContext(), rt.Store.DB.Usafam.Collection(collectionName), bson.M{"server": serverID})
			out[key] = sanitize(items)
		}
		return apptypes.JSON(c, http.StatusOK, out)
	}
}

// addFamilyRole godoc
// @Summary Add family role
// @Description Creates a family role entry for the requested role type.
// @Tags Family Roles
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param request body map[string]interface{} true "Family role payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/family-roles [post]
func addFamilyRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		roleType := serverAsString(body["role_type"])
		if roleType == "" {
			roleType = serverAsString(body["type"])
		}
		collectionName := familyRoleCollections[roleType]
		if collectionName == "" {
			return apptypes.Error(http.StatusBadRequest, "Unsupported family role type")
		}
		body["server"] = serverID
		result, err := rt.Store.DB.Usafam.Collection(collectionName).InsertOne(c.UserContext(), body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Family role created successfully", "role_id": sanitizeObjectID(result.InsertedID), "role_type": roleType})
	}
}

// removeFamilyRole godoc
// @Summary Remove family role
// @Description Deletes a family role entry for the requested role type.
// @Tags Family Roles
// @Produce json
// @Param server_id path int true "Server ID"
// @Param role_type path string true "Role type"
// @Param role_id path string true "Role ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/family-roles/{role_type}/{role_id} [delete]
func removeFamilyRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roleType := c.Params("role_type")
		collectionName := familyRoleCollections[roleType]
		if collectionName == "" {
			return apptypes.Error(http.StatusBadRequest, "Unsupported family role type")
		}
		roleID := c.Params("role_id")
		result, err := rt.Store.DB.Usafam.Collection(collectionName).DeleteOne(c.UserContext(), bson.M{"server": serverID, "$or": []bson.M{{"role": roleID}, {"role": numericMaybe(roleID)}}})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Family role not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Family role removed successfully", "role_type": roleType, "role_id": roleID})
	}
}

// getStrikes godoc
// @Summary Get strikes
// @Description Returns strike list entries for the server, optionally filtered by player tag or expiry state.
// @Tags Server Strikes
// @Produce json
// @Param server_id path int true "Server ID"
// @Param player_tag query string false "Player tag"
// @Param view_expired query bool false "Include expired strikes"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/strikes [get]
func getStrikes(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		query := bson.M{"server": serverID}
		if playerTag := strings.TrimSpace(c.Query("player_tag")); playerTag != "" {
			query["tag"] = serverNormalizeTag(playerTag)
		}
		viewExpired, err := apptypes.QueryBool(c, "view_expired", false)
		if err != nil {
			return err
		}
		if !viewExpired {
			now := time.Now().UTC().Unix()
			query["$or"] = []bson.M{{"rollover_date": nil}, {"rollover_date": bson.M{"$gte": now}}}
		}
		items, err := findManyMaps(c.UserContext(), rt.Store.C.StrikeList, query)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(items), "count": len(items)})
	}
}

// addStrike godoc
// @Summary Add strike
// @Description Creates a strike entry for a player on the server.
// @Tags Server Strikes
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param player_tag path string true "Player tag"
// @Param request body map[string]interface{} true "Strike payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/strikes/{player_tag} [post]
func addStrike(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		var body struct {
			Reason       string `json:"reason"`
			AddedBy      any    `json:"added_by"`
			StrikeWeight int    `json:"strike_weight"`
			RolloverDays int    `json:"rollover_days"`
			Image        string `json:"image"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		playerName := ""
		if rt.Clash != nil {
			if player, err := rt.Clash.GetPlayer(c.UserContext(), tag); err == nil && player != nil {
				playerName = player.Name
			}
		}
		if playerName == "" {
			playerName = tag
		}
		strikeID := strings.ToUpper(randomID(tag, 5))
		doc := bson.M{
			"tag":           tag,
			"date_created":  time.Now().UTC().Format("2006-01-02 15:04:05"),
			"reason":        body.Reason,
			"server":        serverID,
			"added_by":      body.AddedBy,
			"strike_weight": max(1, body.StrikeWeight),
			"strike_id":     strikeID,
		}
		if body.RolloverDays > 0 {
			doc["rollover_date"] = time.Now().UTC().Add(time.Duration(body.RolloverDays) * 24 * time.Hour).Unix()
		}
		if body.Image != "" {
			doc["image"] = body.Image
		}
		if _, err := rt.Store.C.StrikeList.InsertOne(c.UserContext(), doc); err != nil {
			return err
		}
		activeQuery := bson.M{"tag": tag, "server": serverID, "$or": []bson.M{{"rollover_date": nil}, {"rollover_date": bson.M{"$gte": time.Now().UTC().Unix()}}}}
		total, _ := rt.Store.C.StrikeList.CountDocuments(c.UserContext(), activeQuery)
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "created", "strike_id": strikeID, "player_tag": tag, "player_name": playerName, "server_id": serverID, "total_strikes": total})
	}
}

// deleteStrike godoc
// @Summary Delete strike
// @Description Removes a strike entry from the server.
// @Tags Server Strikes
// @Produce json
// @Param server_id path int true "Server ID"
// @Param strike_id path string true "Strike ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/strikes/{strike_id} [delete]
func deleteStrike(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		strikeID := c.Params("strike_id")
		result, err := rt.Store.C.StrikeList.DeleteOne(c.UserContext(), bson.M{"server": serverID, "strike_id": strikeID})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Strike not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "deleted", "strike_id": strikeID, "server_id": serverID})
	}
}

// strikeSummary godoc
// @Summary Get player strike summary
// @Description Returns strike summary information for a single player on the server.
// @Tags Server Strikes
// @Produce json
// @Param server_id path int true "Server ID"
// @Param player_tag path string true "Player tag"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/strikes/player/{player_tag}/summary [get]
func strikeSummary(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		items, err := findManyMaps(c.UserContext(), rt.Store.C.StrikeList, bson.M{"server": serverID, "tag": tag})
		if err != nil {
			return err
		}
		totalWeight := 0
		for _, item := range items {
			totalWeight += asIntWithDefault(item["strike_weight"], 1)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"player_tag": tag, "count": len(items), "total_weight": totalWeight, "items": sanitize(items)})
	}
}

// getBans godoc
// @Summary Get bans
// @Description Returns the ban list for the server.
// @Tags Server Bans
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/bans [get]
func getBans(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		items, err := findManyMaps(c.UserContext(), rt.Store.C.Banlist, bson.M{"server": serverID})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(items), "count": len(items)})
	}
}

// addBan godoc
// @Summary Add or update a ban
// @Description Creates a ban entry or updates the existing one for the given player tag.
// @Tags Server Bans
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param player_tag path string true "Player tag"
// @Param request body map[string]interface{} true "Ban payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/bans/{player_tag} [post]
func addBan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		var body struct {
			Reason  string `json:"reason"`
			AddedBy any    `json:"added_by"`
			Image   string `json:"image"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		playerName := tag
		if rt.Clash != nil {
			if player, err := rt.Clash.GetPlayer(c.UserContext(), tag); err == nil && player != nil {
				playerName = player.Name
			}
		}
		filter := bson.M{"VillageTag": tag, "server": serverID}
		existing, err := findOneMap(c.UserContext(), rt.Store.C.Banlist, filter)
		if err == nil && existing != nil {
			_, err = rt.Store.C.Banlist.UpdateOne(c.UserContext(), filter, bson.M{"$set": bson.M{"Notes": body.Reason}, "$push": bson.M{"edited_by": bson.M{"user": body.AddedBy, "previous": bson.M{"reason": existing["Notes"]}}}})
			if err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "updated", "player_tag": tag, "player_name": playerName, "server_id": serverID})
		}
		doc := bson.M{"VillageTag": tag, "VillageName": playerName, "DateCreated": time.Now().UTC().Format("2006-01-02 15:04:05"), "Notes": body.Reason, "server": serverID, "added_by": body.AddedBy, "image": body.Image}
		if _, err := rt.Store.C.Banlist.InsertOne(c.UserContext(), doc); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "created", "player_tag": tag, "player_name": playerName, "server_id": serverID})
	}
}

// removeBan godoc
// @Summary Remove a ban
// @Description Deletes the ban entry for the given player tag on the server.
// @Tags Server Bans
// @Produce json
// @Param server_id path int true "Server ID"
// @Param player_tag path string true "Player tag"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/bans/{player_tag} [delete]
func removeBan(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("player_tag"))
		result, err := rt.Store.C.Banlist.DeleteOne(c.UserContext(), bson.M{"VillageTag": tag, "server": serverID})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, fmt.Sprintf("Player %s is not banned on server %d.", tag, serverID))
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"status": "deleted", "player_tag": tag, "server_id": serverID})
	}
}

// getServerCountdowns godoc
// @Summary Get server countdowns status
// @Description Returns the configured countdown state for the server.
// @Tags Countdowns
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/countdowns [get]
func getServerCountdowns(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		items := make([]map[string]any, 0, len(serverCountdownTypes))
		for _, countdownType := range serverCountdownTypes {
			field := countdownDBFields[countdownType]
			items = append(items, map[string]any{"type": countdownType, "name": countdownType, "enabled": serverDoc[field] != nil, "channel_id": toStringMaybe(serverDoc[field])})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"server_id": strconv.Itoa(serverID), "countdowns": items})
	}
}

// getClanCountdowns godoc
// @Summary Get clan countdowns status
// @Description Returns the configured countdown state for a clan on the server.
// @Tags Countdowns
// @Produce json
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan tag"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/clan/{clan_tag}/countdowns [get]
func getClanCountdowns(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		clanDoc, err := findOneMap(c.UserContext(), rt.Store.C.ClanDB, bson.M{"server": serverID, "tag": tag})
		if err != nil {
			return notFoundErr(err, "Clan not found on this server")
		}
		items := make([]map[string]any, 0, len(clanCountdownTypes))
		for _, countdownType := range clanCountdownTypes {
			field := countdownDBFields[countdownType]
			items = append(items, map[string]any{"type": countdownType, "name": countdownType, "enabled": clanDoc[field] != nil, "channel_id": toStringMaybe(clanDoc[field])})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"server_id": strconv.Itoa(serverID), "clan_tag": tag, "countdowns": items})
	}
}

// enableCountdown godoc
// @Summary Enable a countdown
// @Description Enables a countdown for the server or a clan, depending on the countdown type.
// @Tags Countdowns
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param request body map[string]interface{} true "Countdown payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/countdowns [post]
func enableCountdown(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body struct {
			CountdownType string `json:"countdown_type"`
			ClanTag       string `json:"clan_tag"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		field := countdownDBFields[body.CountdownType]
		if field == "" {
			return apptypes.Error(http.StatusBadRequest, "Unknown countdown type")
		}
		channelID := time.Now().UTC().UnixNano()
		if slices.Contains(clanCountdownTypes, body.CountdownType) {
			tag := serverNormalizeTag(body.ClanTag)
			if tag == "" {
				return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("clan_tag is required for %s countdown", body.CountdownType))
			}
			result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$set": bson.M{field: channelID}})
			if err != nil {
				return err
			}
			if result.MatchedCount == 0 {
				return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
			}
		} else {
			result, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$set": bson.M{field: channelID}})
			if err != nil {
				return err
			}
			if result.MatchedCount == 0 {
				return apptypes.Error(http.StatusNotFound, "Server not found")
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": body.CountdownType + " countdown enabled successfully", "countdown_type": body.CountdownType, "server_id": serverID, "channel_id": strconv.FormatInt(channelID, 10)})
	}
}

// disableCountdown godoc
// @Summary Disable a countdown
// @Description Disables a countdown for the server or a clan, depending on the countdown type.
// @Tags Countdowns
// @Accept json
// @Produce json
// @Param server_id path int true "Server ID"
// @Param request body map[string]interface{} true "Countdown payload"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/countdowns [delete]
func disableCountdown(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body struct {
			CountdownType string `json:"countdown_type"`
			ClanTag       string `json:"clan_tag"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		field := countdownDBFields[body.CountdownType]
		if field == "" {
			return apptypes.Error(http.StatusBadRequest, "Unknown countdown type")
		}
		if slices.Contains(clanCountdownTypes, body.CountdownType) {
			tag := serverNormalizeTag(body.ClanTag)
			if tag == "" {
				return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("clan_tag is required for %s countdown", body.CountdownType))
			}
			result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$unset": bson.M{field: ""}})
			if err != nil {
				return err
			}
			if result.MatchedCount == 0 {
				return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
			}
		} else {
			result, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$unset": bson.M{field: ""}})
			if err != nil {
				return err
			}
			if result.MatchedCount == 0 {
				return apptypes.Error(http.StatusNotFound, "Server not found")
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": body.CountdownType + " countdown disabled successfully", "countdown_type": body.CountdownType, "server_id": serverID})
	}
}

// emptyItems godoc
// @Summary Get an empty item list
// @Description Returns an empty list for endpoints that currently have no backing data in the Go port.
// @Tags Server Logs
// @Produce json
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{} "OK"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 401 {object} map[string]interface{} "Unauthorized"
// @Failure 403 {object} map[string]interface{} "Forbidden"
// @Failure 404 {object} map[string]interface{} "Not found"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Security ApiKeyAuth
// @Router /v2/server/{server_id}/channels [get]
// @Router /v2/server/{server_id}/threads [get]
// @Router /v2/server/{server_id}/discord-roles [get]
func emptyItems(key string) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		return apptypes.JSON(c, http.StatusOK, map[string]any{key: []any{}})
	}
}

func pathInt(c *fiber.Ctx, key string) (int, error) {
	value := c.Params(key)
	out, err := strconv.Atoi(value)
	if err != nil {
		return 0, apptypes.Error(http.StatusBadRequest, "invalid "+key)
	}
	return out, nil
}

func objectID(raw string) (bson.ObjectID, error) {
	id, err := bson.ObjectIDFromHex(raw)
	if err != nil {
		return bson.ObjectID{}, apptypes.Error(http.StatusBadRequest, "invalid object id")
	}
	return id, nil
}

func findOneMap(ctx context.Context, collection *mongo.Collection, filter any) (map[string]any, error) {
	var out map[string]any
	err := collection.FindOne(ctx, filter).Decode(&out)
	return out, err
}

func findManyMaps(ctx context.Context, collection *mongo.Collection, filter any) ([]map[string]any, error) {
	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var out []map[string]any
	if err := cursor.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func flattenForMongo(input map[string]any, prefix string) bson.M {
	out := bson.M{}
	for key, value := range input {
		path := key
		if prefix != "" {
			path = prefix + "." + key
		}
		if nested, ok := value.(map[string]any); ok {
			for nestedKey, nestedValue := range flattenForMongo(nested, path) {
				out[nestedKey] = nestedValue
			}
			continue
		}
		out[path] = value
	}
	return out
}

func sanitize(value any) any {
	switch typed := value.(type) {
	case []map[string]any:
		out := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, sanitize(item).(map[string]any))
		}
		return out
	case []any:
		out := make([]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, sanitize(item))
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			if key == "_id" {
				continue
			}
			out[key] = sanitize(item)
		}
		return out
	case bson.ObjectID:
		return typed.Hex()
	default:
		return typed
	}
}

func roleCollection(rt apptypes.Deps, roleType string) *mongo.Collection {
	name := serverRoleCollections[roleType]
	if name == "" {
		return nil
	}
	return rt.Store.DB.Usafam.Collection(name)
}

func sanitizeObjectID(value any) any {
	if id, ok := value.(bson.ObjectID); ok {
		return id.Hex()
	}
	return value
}

func serverNormalizeTag(tag string) string {
	tag = apptypes.NormalizeTag(strings.ToUpper(strings.TrimSpace(strings.TrimPrefix(tag, "#"))))
	if tag == "" {
		return ""
	}
	return "#" + tag
}

func serverAsString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return fmt.Sprint(typed)
	}
}

func asIntWithDefault(value any, fallback int) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return fallback
	}
}

func numericMaybe(raw string) any {
	if value, err := strconv.ParseInt(raw, 10, 64); err == nil {
		return value
	}
	return raw
}

func toStringMaybe(value any) any {
	if value == nil {
		return nil
	}
	return serverAsString(value)
}

func notFoundErr(err error, message string) error {
	if err == mongo.ErrNoDocuments {
		return apptypes.Error(http.StatusNotFound, message)
	}
	return err
}

func randomID(seed string, n int) string {
	seed = strings.ToUpper(strings.ReplaceAll(seed, "#", "X"))
	if len(seed) >= n {
		return seed[:n]
	}
	if len(seed) == 0 {
		seed = "STRIKE"
	}
	for len(seed) < n {
		seed += "X"
	}
	return seed[:n]
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
