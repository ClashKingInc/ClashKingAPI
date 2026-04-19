package server

import (
	"net/http"
	"strconv"
	"slices"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/disgoorg/snowflake/v2"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// getServerLogs godoc
// @Summary Get server logs config
// @Description Returns the aggregated log configuration across all clans for a server.
// @Tags Server Logs
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
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
		aggregated := map[string]modelsv2.LogConfig{}
		for _, clanDoc := range clans {
			logs := bsonToMap(clanDoc["logs"])
			for dbName, apiName := range logMapping {
				raw := bsonToMap(logs[dbName])
				webhook := serverAsString(raw["webhook"])
				if webhook == "" {
					continue
				}
				if _, ok := aggregated[apiName]; !ok {
					aggregated[apiName] = modelsv2.LogConfig{
						Enabled: true,
						Thread:  stringPtrMaybe(raw["thread"]),
						Webhook: stringPtrMaybe(webhook),
						Clans:   []string{},
					}
				}
				current := aggregated[apiName]
				existing := current.Clans
				tag := serverAsString(clanDoc["tag"])
				if !slices.Contains(existing, tag) {
					current.Clans = append(existing, tag)
					aggregated[apiName] = current
				}
			}
		}
		return apptypes.JSON(c, http.StatusOK, aggregated)
	}
}

// updateServerLogs godoc
// @Summary Update server logs config
// @Description Bulk-updates log webhook/thread settings for multiple log types across clans.
// @Tags Server Logs
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/logs [put]
func updateServerLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body map[string]modelsv2.LogConfig
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
			for _, item := range config.Clans {
				if tag := serverNormalizeTag(item); tag != "" {
					clans = append(clans, tag)
				}
			}
			for _, clanTag := range clans {
				set := bson.M{}
				for _, dbName := range dbNames {
					set["logs."+dbName] = bson.M{"webhook": derefString(config.Webhook), "thread": derefString(config.Thread)}
				}
				_, _ = rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": clanTag}, bson.M{"$set": set})
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Server logs updated successfully", "server_id": serverID})
	}
}

// patchServerLogType godoc
// @Summary Patch a log type config
// @Description Updates the configuration for a single log type on a server.
// @Tags Server Logs
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param log_type path string true "Log type identifier"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
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

// getAllClanLogs godoc
// @Summary Get all clan logs
// @Description Returns the full log configuration for every clan tracked on the server.
// @Tags Server Logs
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
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

		webhookToChannel := map[string]string{}
		webhooks, err := rt.Discord.GetGuildWebhooks(c.UserContext(), int64(serverID))
		if err == nil {
			for _, webhook := range webhooks {
				channelID := clanLogWebhookChannelID(webhook)
				if channelID == "" {
					continue
				}
				webhookToChannel[webhook.ID().String()] = channelID
			}
		}

		items := make([]modelsv2.ClanLogsConfig, 0, len(clans))
		for _, clanDoc := range clans {
			logs := bsonToMap(clanDoc["logs"])
			items = append(items, modelsv2.ClanLogsConfig{
				Tag:                  serverAsString(clanDoc["tag"]),
				Name:                 serverAsString(clanDoc["name"]),
				JoinLog:              parseClanLogType(logs["join_log"], webhookToChannel),
				LeaveLog:             parseClanLogType(logs["leave_log"], webhookToChannel),
				DonationLog:          parseClanLogType(logs["donation_log"], webhookToChannel),
				ClanAchievementLog:   parseClanLogType(logs["clan_achievement_log"], webhookToChannel),
				ClanRequirementsLog:  parseClanLogType(logs["clan_requirements_log"], webhookToChannel),
				ClanDescriptionLog:   parseClanLogType(logs["clan_description_log"], webhookToChannel),
				WarLog:               parseClanLogType(logs["war_log"], webhookToChannel),
				WarPanel:             parseClanLogType(logs["war_panel"], webhookToChannel),
				CWLLineupChangeLog:   parseClanLogType(logs["cwl_lineup_change_log"], webhookToChannel),
				CapitalDonations:     parseClanLogType(logs["capital_donations"], webhookToChannel),
				CapitalAttacks:       parseClanLogType(logs["capital_attacks"], webhookToChannel),
				RaidPanel:            parseClanLogType(logs["raid_panel"], webhookToChannel),
				CapitalWeeklySummary: parseClanLogType(logs["capital_weekly_summary"], webhookToChannel),
				RoleChange:           parseClanLogType(logs["role_change"], webhookToChannel),
				TroopUpgrade:         parseClanLogType(logs["troop_upgrade"], webhookToChannel),
				SuperTroopBoostLog:   parseClanLogType(logs["super_troop_boost"], webhookToChannel),
				THUpgrade:            parseClanLogType(logs["th_upgrade"], webhookToChannel),
				LeagueChange:         parseClanLogType(logs["league_change"], webhookToChannel),
				SpellUpgrade:         parseClanLogType(logs["spell_upgrade"], webhookToChannel),
				HeroUpgrade:          parseClanLogType(logs["hero_upgrade"], webhookToChannel),
				HeroEquipmentUpgrade: parseClanLogType(logs["hero_equipment_upgrade"], webhookToChannel),
				NameChange:           parseClanLogType(logs["name_change"], webhookToChannel),
				LegendLogAttacks:     parseClanLogType(logs["legend_log_attacks"], webhookToChannel),
				LegendLogDefenses:    parseClanLogType(logs["legend_log_defenses"], webhookToChannel),
			})
		}

		return apptypes.JSON(c, http.StatusOK, items)
	}
}

// putClanLogs godoc
// @Summary Set clan log webhooks
// @Description Creates a Discord webhook and assigns it to the specified log types on a clan.
// @Tags Server Logs
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan Tag"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/clan/{clan_tag}/logs [put]
func putClanLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		var body modelsv2.UpdateClanLogRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}

		logTypes := make([]string, 0, len(body.LogTypes))
		for _, raw := range body.LogTypes {
			logType := serverAsString(raw)
			if logType != "" {
				logTypes = append(logTypes, logType)
			}
		}
		if len(logTypes) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No log types provided")
		}

		filter := bson.M{"server": serverID, "tag": tag}
		if _, err := findOneMap(c.UserContext(), rt.Store.C.ClanDB, filter); err != nil {
			if err.Error() == "mongo: no documents in result" {
				return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
			}
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}

		threadID, err := parseOptionalInt64(body.ThreadID)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "Invalid thread_id")
		}
		channelID, err := parseOptionalInt64(body.ChannelID)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "Invalid channel_id")
		}

		targetChannelID := channelID
		if threadID != nil {
			channel, err := rt.Discord.GetChannel(c.UserContext(), *threadID)
			if err != nil {
				return apptypes.Error(http.StatusBadGateway, "Failed to fetch Discord thread")
			}
			if threadChannel, ok := channel.(interface{ ParentID() *snowflake.ID }); ok && threadChannel.ParentID() != nil {
				parentID := int64(*threadChannel.ParentID())
				targetChannelID = &parentID
			}
		}

		var webhookID *int64
		if targetChannelID != nil {
			webhook, err := rt.Discord.CreateWebhook(c.UserContext(), *targetChannelID, "ClashKing")
			if err != nil {
				return apptypes.Error(http.StatusBadGateway, "Failed to create Discord webhook")
			}
			id := int64(webhook.ID())
			webhookID = &id
		}

		updateOps := bson.M{}
		for _, logType := range logTypes {
			if webhookID != nil {
				updateOps["logs."+logType+".webhook"] = *webhookID
				if threadID != nil {
					updateOps["logs."+logType+".thread"] = *threadID
				} else {
					updateOps["logs."+logType+".thread"] = nil
				}
			}
		}
		if len(updateOps) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No updates to perform")
		}

		result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), filter, bson.M{"$set": updateOps})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}

		response := modelsv2.ClanLogsOperationResponse{
			Message:         "Clan logs updated successfully",
			ClanTag:         tag,
			UpdatedLogTypes: logTypes,
		}
		if webhookID != nil {
			id := strconv.FormatInt(*webhookID, 10)
			response.WebhookID = &id
		}
		if threadID != nil {
			id := strconv.FormatInt(*threadID, 10)
			response.ThreadID = &id
		}
		return apptypes.JSON(c, http.StatusOK, response)
	}
}

// deleteClanLogs godoc
// @Summary Delete clan log webhooks
// @Description Removes the webhook config for specified log types on a clan.
// @Tags Server Logs
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param clan_tag path string true "Clan Tag"
// @Param log_types query string true "Comma-separated list of log types to delete"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/clan/{clan_tag}/logs [delete]
func deleteClanLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		tag := serverNormalizeTag(c.Params("clan_tag"))
		logTypesParam := c.Query("log_types")
		if logTypesParam == "" {
			return apptypes.Error(http.StatusBadRequest, "log_types is required")
		}
		logTypes := make([]string, 0)
		for _, raw := range strings.Split(logTypesParam, ",") {
			logType := strings.TrimSpace(raw)
			if logType != "" {
				logTypes = append(logTypes, logType)
			}
		}
		if len(logTypes) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No log types provided")
		}

		unsetOps := bson.M{}
		for _, logType := range logTypes {
			unsetOps["logs."+logType] = ""
		}

		result, err := rt.Store.C.ClanDB.UpdateOne(c.UserContext(), bson.M{"server": serverID, "tag": tag}, bson.M{"$unset": unsetOps})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ClanLogsOperationResponse{
			Message:         "Clan logs deleted successfully",
			ClanTag:         tag,
			DeletedLogTypes: logTypes,
		})
	}
}

func bsonToMap(raw any) map[string]any {
	switch v := raw.(type) {
	case map[string]any:
		return v
	case bson.D:
		out := make(map[string]any, len(v))
		for _, e := range v {
			out[e.Key] = e.Value
		}
		return out
	}
	return nil
}

func parseClanLogType(raw any, webhookToChannel map[string]string) *modelsv2.ClanLogTypeConfig {
	data := bsonToMap(raw)
	if data == nil {
		return nil
	}

	webhook := normalizeSnowflakeString(data["webhook"])
	thread := normalizeSnowflakeString(data["thread"])
	if webhook == "" && thread == "" {
		return nil
	}

	out := &modelsv2.ClanLogTypeConfig{}
	if webhook != "" {
		out.Webhook = &webhook
		if channel := webhookToChannel[webhook]; channel != "" {
			out.Channel = &channel
		}
	}
	if thread != "" {
		out.Thread = &thread
	}
	return out
}

func derefString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func clanLogWebhookChannelID(webhook discord.Webhook) string {
	switch typed := webhook.(type) {
	case discord.IncomingWebhook:
		return typed.ChannelID.String()
	case *discord.IncomingWebhook:
		return typed.ChannelID.String()
	case discord.ChannelFollowerWebhook:
		return typed.ChannelID.String()
	case *discord.ChannelFollowerWebhook:
		return typed.ChannelID.String()
	default:
		return ""
	}
}

func normalizeSnowflakeString(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case int:
		return strconv.Itoa(typed)
	case int32:
		return strconv.FormatInt(int64(typed), 10)
	case int64:
		return strconv.FormatInt(typed, 10)
	case float64:
		return strconv.FormatInt(int64(typed), 10)
	case snowflake.ID:
		return typed.String()
	default:
		return serverAsString(value)
	}
}

func parseOptionalInt64(value any) (*int64, error) {
	switch typed := value.(type) {
	case nil:
		return nil, nil
	case string:
		if typed == "" {
			return nil, nil
		}
		parsed, err := strconv.ParseInt(typed, 10, 64)
		if err != nil {
			return nil, err
		}
		return &parsed, nil
	case int:
		parsed := int64(typed)
		return &parsed, nil
	case int32:
		parsed := int64(typed)
		return &parsed, nil
	case int64:
		return &typed, nil
	case float64:
		parsed := int64(typed)
		return &parsed, nil
	default:
		return nil, strconv.ErrSyntax
	}
}
