package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/gofiber/fiber/v2"
)

// getAutoboards godoc
// @Summary Get server autoboards
// @Description Returns all autoboards for a server with post/refresh counts and limit.
// @Tags Server Autoboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/autoboards [get]
func getAutoboards(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := sqlServerSettingsDoc(c, rt, serverID)
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		items, err := sqlAutoboards(c, rt, serverID)
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

		webhookChannelIDs := map[string]string{}
		for _, item := range items {
			if stringPtrMaybe(item["channel_id"]) != nil {
				continue
			}
			webhookID := serverAsString(item["webhook_id"])
			if webhookID == "" {
				continue
			}
			if _, seen := webhookChannelIDs[webhookID]; seen {
				continue
			}
			webhookInt := ticketParseInt64(webhookID)
			if webhookInt == 0 {
				continue
			}
			webhook, err := rt.Discord.GetWebhook(c.UserContext(), webhookInt)
			if err != nil {
				continue
			}
			switch typed := webhook.(type) {
			case discord.IncomingWebhook:
				webhookChannelIDs[webhookID] = typed.ChannelID.String()
			case discord.ChannelFollowerWebhook:
				webhookChannelIDs[webhookID] = typed.ChannelID.String()
			}
		}

		// Collect all resolved channel IDs and check which ones still exist in Discord.
		deletedChannels := map[string]bool{}
		seenChannels := map[string]bool{}
		for _, item := range items {
			cfg := autoBoardConfigFromDoc(item, webhookChannelIDs)
			if cfg.ChannelID == nil {
				continue
			}
			chID := *cfg.ChannelID
			if seenChannels[chID] {
				continue
			}
			seenChannels[chID] = true
			chInt := ticketParseInt64(chID)
			if chInt == 0 {
				continue
			}
			if _, err := rt.Discord.GetChannel(c.UserContext(), chInt); err != nil {
				deletedChannels[chID] = true
			}
		}

		responseItems := make([]modelsv2.AutoBoardConfig, 0, len(items))
		for _, item := range items {
			cfg := autoBoardConfigFromDoc(item, webhookChannelIDs)
			if cfg.ChannelID != nil && deletedChannels[*cfg.ChannelID] {
				cfg.ChannelDeleted = true
			}
			responseItems = append(responseItems, cfg)
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerAutoBoardsResponse{
			Autoboards:   responseItems,
			Total:        len(items),
			PostCount:    postCount,
			RefreshCount: refreshCount,
			Limit:        asIntWithDefault(serverDoc["autoboard_limit"], 10),
		})
	}
}

// createAutoboard godoc
// @Summary Create an autoboard
// @Description Creates a new autoboard. Fails if the server autoboard limit is reached.
// @Tags Server Autoboards
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/autoboards [post]
func createAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := sqlServerSettingsDoc(c, rt, serverID)
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		var body modelsv2.CreateAutoBoardRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		limit := asIntWithDefault(serverDoc["autoboard_limit"], 10)
		existingCount, _ := sqlAutoboardCount(c, rt, serverID)
		if existingCount >= limit {
			return apptypes.Error(http.StatusBadRequest, fmt.Sprintf("Autoboard limit reached (%d/%d). Please upgrade or delete existing autoboards.", existingCount, limit))
		}
		doc := map[string]any{
			"type":       body.Type,
			"board_type": body.BoardType,
			"button_id":  body.ButtonID,
			"webhook_id": body.WebhookID,
			"server_id":  serverID,
			"created_at": time.Now().UTC(),
		}
		if body.ThreadID != nil {
			doc["thread_id"] = *body.ThreadID
		}
		if body.ChannelID != nil {
			doc["channel_id"] = *body.ChannelID
		}
		if body.Days != nil {
			doc["days"] = body.Days
		}
		if body.Locale != "" {
			doc["locale"] = body.Locale
		}
		var id string
		err = rt.Store.SQL.QueryRow(c.UserContext(), `
			INSERT INTO autoboards (
				server_id, type, board_type, button_id, webhook_id, thread_id, channel_id, days, locale, data, created_at, updated_at
			) VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, $7, $8, $9, $10::jsonb, now(), now())
			RETURNING id::text
		`, strconv.Itoa(serverID), body.Type, body.BoardType, body.ButtonID, body.WebhookID, body.ThreadID, body.ChannelID, body.Days, body.Locale, apptypes.Marshal(doc)).Scan(&id)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.AutoBoardOperationResponse{Message: "Autoboard created successfully", AutoboardID: id, ServerID: serverID, Type: body.Type})
	}
}

// updateAutoboard godoc
// @Summary Update an autoboard
// @Description Updates fields of an existing autoboard by ID.
// @Tags Server Autoboards
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param autoboard_id path string true "Autoboard ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/autoboards/{autoboard_id} [patch]
func updateAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id := c.Params("autoboard_id")
		var body modelsv2.UpdateAutoBoardRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		updateBody := map[string]any{}
		if body.Type != nil {
			updateBody["type"] = *body.Type
		}
		if body.Days != nil {
			updateBody["days"] = body.Days
		}
		if body.WebhookID != nil {
			updateBody["webhook_id"] = *body.WebhookID
		}
		if body.ThreadID != nil {
			updateBody["thread_id"] = *body.ThreadID
		}
		if len(updateBody) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		result, err := rt.Store.SQL.Exec(c.UserContext(), `
			UPDATE autoboards
			SET type = COALESCE($3, type),
				days = COALESCE($4, days),
				webhook_id = COALESCE($5, webhook_id),
				thread_id = COALESCE($6, thread_id),
				data = data || $7::jsonb,
				updated_at = now()
			WHERE server_id = $1 AND id = $2::uuid
		`, strconv.Itoa(serverID), id, optionalString(updateBody["type"]), autoboardUpdateDays(updateBody), optionalString(updateBody["webhook_id"]), optionalString(updateBody["thread_id"]), apptypes.Marshal(updateBody))
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Autoboard not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.AutoBoardOperationResponse{Message: "Autoboard updated successfully", AutoboardID: c.Params("autoboard_id"), UpdatedFields: len(updateBody)})
	}
}

// deleteAutoboard godoc
// @Summary Delete an autoboard
// @Description Deletes an autoboard by ID.
// @Tags Server Autoboards
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param autoboard_id path string true "Autoboard ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/autoboards/{autoboard_id} [delete]
func deleteAutoboard(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		id := c.Params("autoboard_id")
		result, err := rt.Store.SQL.Exec(c.UserContext(), `DELETE FROM autoboards WHERE server_id = $1 AND id = $2::uuid`, strconv.Itoa(serverID), id)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Autoboard not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.AutoBoardOperationResponse{Message: "Autoboard deleted successfully", AutoboardID: c.Params("autoboard_id")})
	}
}

func autoBoardConfigFromDoc(item map[string]any, webhookChannelIDs map[string]string) modelsv2.AutoBoardConfig {
	id := serverAsString(item["_id"])
	// board_type may not be stored (bot-created docs); extract from button_id like the Python API
	boardType := serverAsString(item["board_type"])
	if boardType == "" {
		if buttonID := serverAsString(item["button_id"]); strings.Contains(buttonID, ":") {
			boardType = strings.SplitN(buttonID, ":", 2)[0]
		}
	}
	channelID := stringPtrMaybe(item["channel_id"])
	if channelID == nil {
		if fallback := webhookChannelIDs[serverAsString(item["webhook_id"])]; fallback != "" {
			channelID = &fallback
		}
	}
	return modelsv2.AutoBoardConfig{
		ID:        id,
		Type:      serverAsString(item["type"]),
		BoardType: boardType,
		ButtonID:  serverAsString(item["button_id"]),
		WebhookID: serverAsString(item["webhook_id"]),
		ThreadID:  stringPtrMaybe(item["thread_id"]),
		ChannelID: channelID,
		Days:      autoboardStringSlice(item["days"]),
		Locale:    serverAsString(item["locale"]),
		CreatedAt: stringPtrMaybe(stringifyTimeLike(item["created_at"])),
	}
}

func sqlAutoboards(c *fiber.Ctx, rt apptypes.Deps, serverID int) ([]map[string]any, error) {
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT id::text, type, board_type, button_id, webhook_id, thread_id, channel_id, days, locale, data, created_at
		FROM autoboards
		WHERE server_id = $1
		ORDER BY created_at ASC
	`, strconv.Itoa(serverID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, typ, boardType, buttonID string
		var webhookID, threadID, channelID *string
		var days []string
		var locale string
		var raw []byte
		var createdAt time.Time
		if err := rows.Scan(&id, &typ, &boardType, &buttonID, &webhookID, &threadID, &channelID, &days, &locale, &raw, &createdAt); err != nil {
			return nil, err
		}
		doc := map[string]any{}
		_ = json.Unmarshal(raw, &doc)
		doc["_id"] = id
		doc["type"] = typ
		doc["board_type"] = boardType
		doc["button_id"] = buttonID
		if webhookID != nil {
			doc["webhook_id"] = *webhookID
		}
		if threadID != nil {
			doc["thread_id"] = *threadID
		}
		if channelID != nil {
			doc["channel_id"] = *channelID
		}
		doc["days"] = days
		doc["locale"] = locale
		doc["created_at"] = createdAt
		items = append(items, doc)
	}
	return items, rows.Err()
}

func sqlAutoboardCount(c *fiber.Ctx, rt apptypes.Deps, serverID int) (int, error) {
	var count int
	err := rt.Store.SQL.QueryRow(c.UserContext(), `SELECT count(*) FROM autoboards WHERE server_id = $1`, strconv.Itoa(serverID)).Scan(&count)
	return count, err
}

func autoboardUpdateDays(update map[string]any) []string {
	if value, ok := update["days"].([]string); ok {
		return value
	}
	return nil
}

func autoboardStringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	default:
		return stringSlice(value)
	}
}

func stringPtrMaybe(value any) *string {
	if value == nil {
		return nil
	}
	out := serverAsString(value)
	if out == "" {
		return nil
	}
	return &out
}
