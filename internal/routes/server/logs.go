package server

import (
	"net/http"
	"slices"
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/disgoorg/snowflake/v2"
	"github.com/gofiber/fiber/v2"
)

// getServerLogs godoc
// @Summary Get server logs
// @Description Returns each log configuration as an independent server, clan, and type row. Channel IDs are resolved from Discord and are not stored.
// @Tags Server Logs
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} modelsv2.ServerLogsResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/logs [get]
func getServerLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		logs, err := listServerLogs(c, rt, serverID)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerLogsResponse{Logs: logs, Count: len(logs)})
	}
}

// putServerLogs godoc
// @Summary Set server logs
// @Description Assigns a Discord channel to independent log types in one optional clan scope. The API reuses a bot-owned webhook in the channel or creates one with the bot profile.
// @Tags Server Logs
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param body body modelsv2.UpdateServerLogsRequest true "Log settings"
// @Success 200 {object} modelsv2.ServerLogsOperationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Failure 502 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/logs [put]
func putServerLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body modelsv2.UpdateServerLogsRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		logTypes, err := normalizeLogTypes(body.LogTypes)
		if err != nil {
			return err
		}
		clanTag := normalizeOptionalClanTag(body.ClanTag)
		if err := validateLogScope(c, rt, serverID, clanTag, logTypes); err != nil {
			return err
		}
		channelID, err := strconv.ParseInt(strings.TrimSpace(body.ChannelID), 10, 64)
		if err != nil || channelID <= 0 {
			return apptypes.Error(http.StatusBadRequest, "Invalid channel_id")
		}
		threadID, err := parseOptionalInt64(body.ThreadID)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "Invalid thread_id")
		}
		if err := validateLogThread(c, rt, channelID, threadID); err != nil {
			return err
		}
		if rt.Discord == nil {
			return apptypes.Error(http.StatusBadGateway, "Discord is unavailable")
		}
		webhook, err := rt.Discord.FindOrCreateLogWebhook(c.UserContext(), int64(serverID), channelID)
		if err != nil {
			return apptypes.Error(http.StatusBadGateway, "Failed to find or create a Discord webhook")
		}

		serverIDText := strconv.Itoa(serverID)
		previousWebhookIDs := queryLogWebhookIDs(c, rt, serverIDText, clanTag, logTypes)
		channelIDText := strconv.FormatInt(channelID, 10)
		updated := make([]modelsv2.ServerLog, 0, len(logTypes))
		tx, err := rt.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer tx.Rollback(c.UserContext())
		for _, logType := range logTypes {
			var disabled bool
			if err := tx.QueryRow(c.UserContext(), `
				INSERT INTO server_logs (server_id, clan_tag, type, webhook_id, thread_id)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (server_id, clan_tag, type) DO UPDATE SET
					webhook_id = EXCLUDED.webhook_id,
					thread_id = EXCLUDED.thread_id,
					updated_at = now()
				RETURNING disabled
			`, serverIDText, clanTag, logType, webhook.ID().String(), optionalInt64String(threadID)).Scan(&disabled); err != nil {
				return err
			}
			updated = append(updated, modelsv2.ServerLog{
				ClanTag: clanTag, Type: logType, WebhookID: webhook.ID().String(),
				ChannelID: &channelIDText, ThreadID: optionalInt64String(threadID), Disabled: disabled,
			})
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		cleanupUnusedLogWebhooks(c, rt, serverIDText, previousWebhookIDs)

		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerLogsOperationResponse{
			Message: "Server logs updated successfully", ServerID: serverID,
			ClanTag: clanTag, UpdatedLogTypes: logTypes, Logs: updated,
		})
	}
}

// patchServerLogs godoc
// @Summary Enable or disable server logs
// @Description Changes the disabled state without deleting the saved webhook or thread setup.
// @Tags Server Logs
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param body body modelsv2.UpdateServerLogsDisabledRequest true "Disabled state"
// @Success 200 {object} modelsv2.ServerLogsOperationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/logs [patch]
func patchServerLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body modelsv2.UpdateServerLogsDisabledRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if body.Disabled == nil {
			return apptypes.Error(http.StatusBadRequest, "disabled is required")
		}
		logTypes, err := normalizeLogTypes(body.LogTypes)
		if err != nil {
			return err
		}
		clanTag := normalizeOptionalClanTag(body.ClanTag)
		if err := validateLogScope(c, rt, serverID, clanTag, logTypes); err != nil {
			return err
		}

		result, err := rt.Store.SQL.Exec(c.UserContext(), `
			UPDATE server_logs
			SET disabled = $4, updated_at = now()
			WHERE server_id = $1 AND clan_tag IS NOT DISTINCT FROM $2 AND type = ANY($3)
		`, strconv.Itoa(serverID), clanTag, logTypes, *body.Disabled)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Server log setup not found")
		}

		logs, err := listServerLogs(c, rt, serverID)
		if err != nil {
			return err
		}
		updated := filterServerLogs(logs, clanTag, logTypes)
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerLogsOperationResponse{
			Message: "Server log state updated successfully", ServerID: serverID,
			ClanTag: clanTag, UpdatedLogTypes: logTypes, Logs: updated,
		})
	}
}

// deleteServerLogs godoc
// @Summary Delete server logs
// @Description Removes independent log configurations from one server or clan scope. A webhook is deleted only when no remaining log uses it.
// @Tags Server Logs
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param clan_tag query string false "Clan tag"
// @Param log_types query string true "Comma-separated log types"
// @Success 200 {object} modelsv2.ServerLogsOperationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/logs [delete]
func deleteServerLogs(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		logTypes, err := normalizeLogTypes(strings.Split(c.Query("log_types"), ","))
		if err != nil {
			return err
		}
		var rawClanTag *string
		if value := strings.TrimSpace(c.Query("clan_tag")); value != "" {
			rawClanTag = &value
		}
		clanTag := normalizeOptionalClanTag(rawClanTag)
		if err := validateLogScope(c, rt, serverID, clanTag, logTypes); err != nil {
			return err
		}
		serverIDText := strconv.Itoa(serverID)
		webhookIDs := queryLogWebhookIDs(c, rt, serverIDText, clanTag, logTypes)
		if _, err := rt.Store.SQL.Exec(c.UserContext(), `
			DELETE FROM server_logs
			WHERE server_id = $1 AND clan_tag IS NOT DISTINCT FROM $2 AND type = ANY($3)
		`, serverIDText, clanTag, logTypes); err != nil {
			return err
		}
		cleanupUnusedLogWebhooks(c, rt, serverIDText, webhookIDs)
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerLogsOperationResponse{
			Message: "Server logs deleted successfully", ServerID: serverID,
			ClanTag: clanTag, DeletedLogTypes: logTypes,
		})
	}
}

func listServerLogs(c *fiber.Ctx, rt apptypes.Deps, serverID int) ([]modelsv2.ServerLog, error) {
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT clan_tag, type, webhook_id, thread_id, disabled
		FROM server_logs WHERE server_id = $1
		ORDER BY clan_tag NULLS FIRST, type
	`, strconv.Itoa(serverID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	channelByWebhook := map[string]string{}
	if rt.Discord != nil {
		if webhooks, discordErr := rt.Discord.GetGuildWebhooks(c.UserContext(), int64(serverID)); discordErr == nil {
			for _, webhook := range webhooks {
				if channelID := logWebhookChannelID(webhook); channelID != "" {
					channelByWebhook[webhook.ID().String()] = channelID
				}
			}
		}
	}

	logs := make([]modelsv2.ServerLog, 0)
	for rows.Next() {
		var item modelsv2.ServerLog
		if err := rows.Scan(&item.ClanTag, &item.Type, &item.WebhookID, &item.ThreadID, &item.Disabled); err != nil {
			return nil, err
		}
		if channelID := channelByWebhook[item.WebhookID]; channelID != "" {
			item.ChannelID = &channelID
		}
		logs = append(logs, item)
	}
	return logs, rows.Err()
}

func filterServerLogs(logs []modelsv2.ServerLog, clanTag *string, logTypes []string) []modelsv2.ServerLog {
	filtered := make([]modelsv2.ServerLog, 0, len(logTypes))
	for _, item := range logs {
		if !sameOptionalString(item.ClanTag, clanTag) || !slices.Contains(logTypes, item.Type) {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func sameOptionalString(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func normalizeLogTypes(raw []string) ([]string, error) {
	logTypes := make([]string, 0, len(raw))
	for _, value := range raw {
		logType := strings.TrimSpace(value)
		if logType == "" || slices.Contains(logTypes, logType) {
			continue
		}
		if !modelsv2.HasEnumValue(modelsv2.LogTypeEnums, logType) {
			return nil, apptypes.Error(http.StatusBadRequest, "Unknown log type: "+logType)
		}
		logTypes = append(logTypes, logType)
	}
	if len(logTypes) == 0 {
		return nil, apptypes.Error(http.StatusBadRequest, "No log types provided")
	}
	return logTypes, nil
}

func normalizeOptionalClanTag(raw *string) *string {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return nil
	}
	value := serverNormalizeTag(*raw)
	if value == "" {
		return nil
	}
	return &value
}

func validateLogScope(c *fiber.Ctx, rt apptypes.Deps, serverID int, clanTag *string, logTypes []string) error {
	for _, logType := range logTypes {
		if modelsv2.EnumScope(modelsv2.LogTypeEnums, logType) == "clan" && clanTag == nil {
			return apptypes.Error(http.StatusBadRequest, "clan_tag is required for log type: "+logType)
		}
	}
	if clanTag == nil {
		return nil
	}
	var exists bool
	if err := rt.Store.SQL.QueryRow(c.UserContext(), `
		SELECT EXISTS(SELECT 1 FROM server_clans WHERE server_id = $1 AND tag = $2)
	`, strconv.Itoa(serverID), *clanTag).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
	}
	return nil
}

func validateLogThread(c *fiber.Ctx, rt apptypes.Deps, channelID int64, threadID *int64) error {
	if threadID == nil {
		return nil
	}
	if rt.Discord == nil {
		return apptypes.Error(http.StatusBadGateway, "Discord is unavailable")
	}
	channel, err := rt.Discord.GetChannel(c.UserContext(), *threadID)
	if err != nil {
		return apptypes.Error(http.StatusBadGateway, "Failed to fetch Discord thread")
	}
	thread, ok := channel.(interface{ ParentID() *snowflake.ID })
	if !ok || thread.ParentID() == nil || int64(*thread.ParentID()) != channelID {
		return apptypes.Error(http.StatusBadRequest, "thread_id is not in channel_id")
	}
	return nil
}

func queryLogWebhookIDs(c *fiber.Ctx, rt apptypes.Deps, serverID string, clanTag *string, logTypes []string) []string {
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT DISTINCT webhook_id FROM server_logs
		WHERE server_id = $1 AND clan_tag IS NOT DISTINCT FROM $2 AND type = ANY($3)
	`, serverID, clanTag, logTypes)
	if err != nil {
		return nil
	}
	defer rows.Close()
	webhookIDs := make([]string, 0)
	for rows.Next() {
		var webhookID string
		if rows.Scan(&webhookID) == nil {
			webhookIDs = append(webhookIDs, webhookID)
		}
	}
	return webhookIDs
}

func cleanupUnusedLogWebhooks(c *fiber.Ctx, rt apptypes.Deps, serverID string, candidates []string) {
	if rt.Discord == nil {
		return
	}
	for _, webhookID := range candidates {
		var used bool
		if err := rt.Store.SQL.QueryRow(c.UserContext(), `
			SELECT EXISTS(SELECT 1 FROM server_logs WHERE server_id = $1 AND webhook_id = $2)
		`, serverID, webhookID).Scan(&used); err != nil || used {
			continue
		}
		parsed, err := strconv.ParseInt(webhookID, 10, 64)
		if err == nil {
			_ = rt.Discord.DeleteWebhook(c.UserContext(), parsed)
		}
	}
}

func parseOptionalInt64(value *string) (*int64, error) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil, nil
	}
	parsed, err := strconv.ParseInt(strings.TrimSpace(*value), 10, 64)
	if err != nil || parsed <= 0 {
		return nil, strconv.ErrSyntax
	}
	return &parsed, nil
}

func optionalInt64String(value *int64) *string {
	if value == nil {
		return nil
	}
	out := strconv.FormatInt(*value, 10)
	return &out
}

func logWebhookChannelID(webhook discord.Webhook) string {
	switch typed := webhook.(type) {
	case discord.IncomingWebhook:
		return typed.ChannelID.String()
	case *discord.IncomingWebhook:
		return typed.ChannelID.String()
	default:
		return ""
	}
}
