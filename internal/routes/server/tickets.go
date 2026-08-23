package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// ticketServerID extracts server_id path param as int64.
func ticketServerID(c *fiber.Ctx) (int64, error) {
	serverID, err := pathInt(c, "server_id")
	return int64(serverID), err
}

func ticketParseInt64(s string) int64 {
	var n int64
	fmt.Sscanf(s, "%d", &n)
	return n
}

func ticketPanelList(c *fiber.Ctx, a apptypes.Deps, serverID int64) ([]map[string]any, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT server_id, name, components, data, created_at, updated_at
		FROM ticket_panels
		WHERE server_id = $1
		ORDER BY name
	`, fmt.Sprint(serverID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		item, err := ticketPanelScan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func ticketPanelGet(c *fiber.Ctx, a apptypes.Deps, serverID int64, name string) (map[string]any, error) {
	return ticketPanelScan(a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT server_id, name, components, data, created_at, updated_at
		FROM ticket_panels
		WHERE server_id = $1 AND name = $2
	`, fmt.Sprint(serverID), name))
}

type sqlScanner interface {
	Scan(dest ...any) error
}

func ticketPanelScan(row sqlScanner) (map[string]any, error) {
	var serverID, name string
	var componentsRaw, dataRaw []byte
	var createdAt, updatedAt time.Time
	if err := row.Scan(&serverID, &name, &componentsRaw, &dataRaw, &createdAt, &updatedAt); err != nil {
		return nil, err
	}
	item := mapMaybe(decodeJSONAny(dataRaw))
	item["server_id"] = ticketParseInt64(serverID)
	item["name"] = name
	item["components"] = decodeJSONAny(componentsRaw)
	item["created_at"] = createdAt
	item["updated_at"] = updatedAt
	return item, nil
}

func ticketPanelSave(c *fiber.Ctx, a apptypes.Deps, panel map[string]any) error {
	_, err := a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO ticket_panels (server_id, name, components, data, created_at, updated_at)
		VALUES ($1, $2, $3::jsonb, $4::jsonb, COALESCE($5, now()), now())
		ON CONFLICT (server_id, name) DO UPDATE SET
			components = EXCLUDED.components,
			data = EXCLUDED.data,
			updated_at = now()
	`, fmt.Sprint(asInt64(panel["server_id"])), serverAsString(panel["name"]), apptypes.Marshal(anySlice(panel["components"])), apptypes.Marshal(panel), panel["created_at"])
	return err
}

func ticketPanelDelete(c *fiber.Ctx, a apptypes.Deps, serverID int64, name string) (int64, error) {
	cmd, err := a.Store.SQL.Exec(c.UserContext(), `
		DELETE FROM ticket_panels
		WHERE server_id = $1 AND name = $2
	`, fmt.Sprint(serverID), name)
	return cmd.RowsAffected(), err
}

func ticketEmbedList(c *fiber.Ctx, a apptypes.Deps, serverID int64) ([]map[string]any, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT name, data, created_at, updated_at
		FROM server_custom_embeds
		WHERE server_id = $1
		ORDER BY name
	`, fmt.Sprint(serverID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var name string
		var dataRaw []byte
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&name, &dataRaw, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item := map[string]any{"name": name, "data": decodeEmbedJSON(dataRaw), "created_at": createdAt, "updated_at": updatedAt}
		items = append(items, item)
	}
	return items, rows.Err()
}

func ticketEmbedSave(c *fiber.Ctx, a apptypes.Deps, serverID int64, name string, data map[string]any) error {
	_, err := a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO server_custom_embeds (server_id, name, data, created_at, updated_at)
		VALUES ($1, $2, $3::jsonb, now(), now())
		ON CONFLICT (server_id, name) DO UPDATE SET
			data = EXCLUDED.data,
			updated_at = now()
	`, fmt.Sprint(serverID), name, apptypes.Marshal(data))
	return err
}

func ticketEmbedDelete(c *fiber.Ctx, a apptypes.Deps, serverID int64, name string) (int64, error) {
	cmd, err := a.Store.SQL.Exec(c.UserContext(), `
		DELETE FROM server_custom_embeds
		WHERE server_id = $1 AND name = $2
	`, fmt.Sprint(serverID), name)
	return cmd.RowsAffected(), err
}

// getTicketPanels returns all ticket panels for a server.
//
// @Summary Get ticket panels for a server
// @Tags Server Tickets
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Success 200 {object} modelsv2.TicketPanelsResponse
// @Router /v2/server/{server_id}/tickets [get]
func getTicketPanels(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		panels, err := ticketPanelList(c, a, serverID)
		if err != nil {
			return err
		}

		embedDocs, err := ticketEmbedList(c, a, serverID)
		if err != nil {
			return err
		}
		availableEmbeds := make([]string, 0, len(embedDocs))
		for _, d := range embedDocs {
			if name, ok := d["name"].(string); ok && name != "" {
				availableEmbeds = append(availableEmbeds, name)
			}
		}
		sort.Strings(availableEmbeds)

		items := make([]modelsv2.TicketPanel, 0, len(panels))
		for _, panel := range panels {
			items = append(items, ticketPanelFromDoc(panel))
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.TicketPanelsResponse{
			Items:                     items,
			Total:                     len(items),
			AvailableEmbeds:           availableEmbeds,
			TownhallRequirementFields: ticketTownhallRequirementFields(),
		})
	}
}

// createTicketPanel creates a new ticket panel.
//
// @Summary Create a ticket panel
// @Tags Server Tickets
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param body body modelsv2.CreatePanelRequest true "Panel name"
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/tickets [post]
func createTicketPanel(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		var body modelsv2.CreatePanelRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		name := stringTrimSpace(body.Name)
		if name == "" {
			return apptypes.Error(http.StatusBadRequest, "Panel name cannot be empty")
		}
		if existing, _ := ticketPanelGet(c, a, serverID, name); existing != nil {
			return apptypes.Error(http.StatusConflict, "A panel with this name already exists")
		}
		if err := ticketPanelSave(c, a, map[string]any{
			"server_id":  serverID,
			"name":       name,
			"components": []any{},
		}); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Panel created successfully"})
	}
}

// deleteTicketPanel deletes a ticket panel.
//
// @Summary Delete a ticket panel
// @Tags Server Tickets
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param panel_name path string true "Panel name"
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/tickets/{panel_name} [delete]
func deleteTicketPanel(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		panelName := c.Params("panel_name")
		deleted, err := ticketPanelDelete(c, a, serverID, panelName)
		if err != nil {
			return err
		}
		if deleted == 0 {
			return apptypes.Error(http.StatusNotFound, "Panel not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Panel deleted successfully"})
	}
}

// createTicketButton adds a button to a ticket panel.
//
// @Summary Add a button to a ticket panel
// @Tags Server Tickets
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param panel_name path string true "Panel name"
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/tickets/{panel_name}/buttons [post]
func createTicketButton(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		panelName := c.Params("panel_name")
		var body modelsv2.CreateButtonRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}

		panel, err := ticketPanelGet(c, a, serverID, panelName)
		if err != nil || panel == nil {
			return apptypes.Error(http.StatusNotFound, "Panel not found")
		}
		components := anySlice(panel["components"])
		if len(components) >= 5 {
			return apptypes.Error(http.StatusBadRequest, "A panel can have at most 5 buttons")
		}

		customID := fmt.Sprintf("%s_%d", panelName, time.Now().UnixMilli())
		newComp := map[string]any{
			"type":      2,
			"style":     body.Style,
			"label":     body.Label,
			"custom_id": customID,
		}
		if body.Emoji != nil {
			newComp["emoji"] = body.Emoji
		}
		panel["components"] = append(components, newComp)
		if err := ticketPanelSave(c, a, panel); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Button added successfully"})
	}
}

// deleteTicketButton removes a button from a ticket panel.
//
// @Summary Delete a button from a ticket panel
// @Tags Server Tickets
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param panel_name path string true "Panel name"
// @Param custom_id path string true "Button custom ID"
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/tickets/{panel_name}/buttons/{custom_id} [delete]
func deleteTicketButton(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		panelName := c.Params("panel_name")
		customID := c.Params("custom_id")

		panel, err := ticketPanelGet(c, a, serverID, panelName)
		if err != nil || panel == nil {
			return apptypes.Error(http.StatusNotFound, "Panel not found")
		}
		components := anySlice(panel["components"])
		kept := make([]any, 0, len(components))
		for _, component := range components {
			if serverAsString(mapMaybe(component)["custom_id"]) == customID {
				continue
			}
			kept = append(kept, component)
		}
		panel["components"] = kept
		delete(panel, customID+"_settings")
		if err := ticketPanelSave(c, a, panel); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Button deleted successfully"})
	}
}

// updateTicketButtonAppearance updates the label/style/emoji of a button.
//
// @Summary Update ticket button appearance
// @Tags Server Tickets
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param panel_name path string true "Panel name"
// @Param custom_id path string true "Button custom ID"
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/tickets/{panel_name}/buttons/{custom_id} [patch]
func updateTicketButtonAppearance(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		panelName := c.Params("panel_name")
		customID := c.Params("custom_id")
		var body modelsv2.UpdateButtonAppearanceRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}

		panel, err := ticketPanelGet(c, a, serverID, panelName)
		if err != nil || panel == nil {
			return apptypes.Error(http.StatusNotFound, "Panel not found")
		}

		components := anySlice(panel["components"])
		for index, component := range components {
			doc := mapMaybe(component)
			if serverAsString(doc["custom_id"]) != customID {
				continue
			}
			doc["label"] = body.Label
			doc["style"] = body.Style
			doc["emoji"] = body.Emoji
			components[index] = doc
		}
		panel["components"] = components
		if err := ticketPanelSave(c, a, panel); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Button appearance updated successfully"})
	}
}

// updateTicketPanel updates panel category/log settings.
//
// @Summary Update ticket panel settings
// @Tags Server Tickets
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param panel_name path string true "Panel name"
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/tickets/{panel_name} [put]
func updateTicketPanel(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		panelName := c.Params("panel_name")
		var body modelsv2.UpdateTicketPanelRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}

		toInt := func(s string) int64 {
			var n int64
			fmt.Sscanf(s, "%d", &n)
			return n
		}

		panel, err := ticketPanelGet(c, a, serverID, panelName)
		if err != nil || panel == nil {
			return apptypes.Error(http.StatusNotFound, "Panel not found")
		}

		setOrUnset := func(key string, s *string) {
			if s == nil {
				return
			}
			if *s == "" {
				delete(panel, key)
			} else {
				panel[key] = toInt(*s)
			}
		}

		setOrUnset("open-category", body.OpenCategory)
		setOrUnset("sleep-category", body.SleepCategory)
		setOrUnset("closed-category", body.ClosedCategory)
		setOrUnset("status_change_log", body.StatusChangeLog)
		setOrUnset("ticket_button_click_log", body.TicketButtonClickLog)
		setOrUnset("ticket_close_log", body.TicketCloseLog)

		if body.EmbedName != nil {
			if *body.EmbedName == "" {
				delete(panel, "embed_name")
			} else {
				panel["embed_name"] = *body.EmbedName
			}
		}
		if err := ticketPanelSave(c, a, panel); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Panel updated successfully"})
	}
}

// updateTicketButtonSettings updates the settings (questions, roles, etc.) for a button.
//
// @Summary Update ticket button settings
// @Tags Server Tickets
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param panel_name path string true "Panel name"
// @Param custom_id path string true "Button custom ID"
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/tickets/{panel_name}/buttons/{custom_id} [put]
func updateTicketButtonSettings(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		panelName := c.Params("panel_name")
		customID := c.Params("custom_id")

		panel, err := ticketPanelGet(c, a, serverID, panelName)
		if err != nil || panel == nil {
			return apptypes.Error(http.StatusNotFound, "Panel not found")
		}

		var body modelsv2.UpdateButtonSettingsRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}

		naming := body.Naming
		if naming == "" {
			naming = "{ticket_count}-{user}"
		}
		numApply := body.NumApply
		if numApply == 0 {
			numApply = 25
		}

		settings := map[string]any{
			"questions":             body.Questions,
			"mod_role":              body.ModRole,
			"no_ping_mod_role":      body.NoPingModRole,
			"private_thread":        body.PrivateThread,
			"th_min":                body.THMin,
			"num_apply":             numApply,
			"naming":                naming,
			"account_apply":         body.AccountApply,
			"player_info":           body.PlayerInfo,
			"apply_clans":           body.ApplyClans,
			"roles_to_add":          body.RolesToAdd,
			"roles_to_remove":       body.RolesToRemove,
			"townhall_requirements": body.TownhallRequirements,
			"new_message":           body.NewMessage,
		}

		panel[customID+"_settings"] = settings
		if err := ticketPanelSave(c, a, panel); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Button settings updated successfully"})
	}
}

// updateTicketApproveMessages updates approve messages for a ticket panel.
//
// @Summary Update approve messages for a ticket panel
// @Tags Server Tickets
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param panel_name path string true "Panel name"
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/tickets/{panel_name}/approve-messages [put]
func updateTicketApproveMessages(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		panelName := c.Params("panel_name")
		var body modelsv2.UpdateApproveMessagesRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		approveMessages := normalizeApproveMessages(body.Messages)
		panel, err := ticketPanelGet(c, a, serverID, panelName)
		if err != nil || panel == nil {
			return apptypes.Error(http.StatusNotFound, "Panel not found")
		}
		messages := make([]any, 0, len(approveMessages))
		for _, m := range approveMessages {
			messages = append(messages, map[string]any{"name": m.Name, "message": m.Message})
		}
		panel["approve_messages"] = messages
		if err := ticketPanelSave(c, a, panel); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Approve messages updated successfully"})
	}
}

func normalizeApproveMessages(messages []modelsv2.ApproveMessage) []modelsv2.ApproveMessage {
	out := make([]modelsv2.ApproveMessage, 0, 1)
	for _, m := range messages {
		if trimSpaceStr(m.Name) == "" {
			continue
		}
		out = append(out, modelsv2.ApproveMessage{
			Name:    m.Name,
			Message: m.Message,
		})
		break
	}
	return out
}

// ─────────────────────────────────────────────
// Embed endpoints
// ─────────────────────────────────────────────

// getServerEmbeds returns all custom embeds for a server.
//
// @Summary Get server embeds
// @Tags Server Tickets
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Success 200 {object} modelsv2.ServerEmbedsResponse
// @Router /v2/server/{server_id}/embeds [get]
func getServerEmbeds(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		docs, err := ticketEmbedList(c, a, serverID)
		if err != nil {
			return err
		}
		items := make([]modelsv2.ServerEmbed, 0, len(docs))
		for _, d := range docs {
			if _, ok := d["name"].(string); ok {
				items = append(items, modelsv2.ServerEmbed{Name: serverAsString(d["name"]), Data: ticketEmbedPayload(d["data"])})
			}
		}
		sort.Slice(items, func(i, j int) bool {
			return items[i].Name < items[j].Name
		})
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerEmbedsResponse{Items: items, Total: len(items)})
	}
}

// createServerEmbed creates a new custom embed for a server.
//
// @Summary Create a server embed
// @Tags Server Tickets
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param body body modelsv2.UpsertEmbedRequest true "Embed name and data"
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/embeds [post]
func createServerEmbed(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		var body modelsv2.UpsertEmbedRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		existing, _ := ticketEmbedList(c, a, serverID)
		for _, item := range existing {
			if serverAsString(item["name"]) == body.Name {
				return apptypes.Error(http.StatusConflict, "An embed with this name already exists")
			}
		}
		if err := ticketEmbedSave(c, a, serverID, body.Name, body.Data); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Embed created successfully"})
	}
}

// updateServerEmbed updates a custom embed.
//
// @Summary Update a server embed
// @Tags Server Tickets
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param embed_name path string true "Embed name"
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/embeds/{embed_name} [put]
func updateServerEmbed(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		embedName := c.Params("embed_name")
		var body modelsv2.UpsertEmbedRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if err := ticketEmbedSave(c, a, serverID, embedName, body.Data); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Embed updated successfully"})
	}
}

// deleteServerEmbed deletes a custom embed.
//
// @Summary Delete a server embed
// @Tags Server Tickets
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param embed_name path string true "Embed name"
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/embeds/{embed_name} [delete]
func deleteServerEmbed(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		embedName := c.Params("embed_name")
		deleted, err := ticketEmbedDelete(c, a, serverID, embedName)
		if err != nil {
			return err
		}
		if deleted == 0 {
			return apptypes.Error(http.StatusNotFound, "Embed not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Embed deleted successfully"})
	}
}

func ticketPanelFromDoc(panel map[string]any) modelsv2.TicketPanel {
	result := modelsv2.TicketPanel{
		Name:                 asStringOr(panel["name"], ""),
		ServerID:             ticketParseInt64(serverAsString(panel["server_id"])),
		EmbedName:            stringPtrMaybe(panel["embed_name"]),
		Components:           ticketButtons(panel["components"]),
		ButtonSettings:       ticketButtonSettings(panel),
		OpenCategory:         stringPtrMaybe(panel["open-category"]),
		SleepCategory:        stringPtrMaybe(panel["sleep-category"]),
		ClosedCategory:       stringPtrMaybe(panel["closed-category"]),
		StatusChangeLog:      stringPtrMaybe(panel["status_change_log"]),
		TicketButtonClickLog: stringPtrMaybe(panel["ticket_button_click_log"]),
		TicketCloseLog:       stringPtrMaybe(panel["ticket_close_log"]),
		ApproveMessages:      ticketApproveMessages(panel["approve_messages"]),
	}
	return result
}

func ticketButtons(value any) []modelsv2.TicketButton {
	raw := anySlice(value)
	out := make([]modelsv2.TicketButton, 0, len(raw))
	for _, item := range raw {
		if doc := mapMaybe(item); len(doc) > 0 {
			out = append(out, modelsv2.TicketButton{
				CustomID: asStringOr(doc["custom_id"], ""),
				Label:    asStringOr(doc["label"], ""),
				Style:    asIntWithDefault(doc["style"], 2),
				Emoji:    ticketEmojiFromMap(mapMaybe(doc["emoji"])),
				Type:     asIntWithDefault(doc["type"], 2),
			})
		}
	}
	return out
}

func ticketButtonSettings(panel map[string]any) map[string]modelsv2.TicketButtonSettings {
	out := map[string]modelsv2.TicketButtonSettings{}
	for key, value := range panel {
		if !strings.HasSuffix(key, "_settings") {
			continue
		}
		settings := mapMaybe(value)
		out[strings.TrimSuffix(key, "_settings")] = modelsv2.TicketButtonSettings{
			Questions:            stringSlice(settings["questions"]),
			ModRole:              stringSlice(settings["mod_role"]),
			NoPingModRole:        stringSlice(settings["no_ping_mod_role"]),
			PrivateThread:        asBool(settings["private_thread"]),
			THMin:                asIntWithDefault(settings["th_min"], 0),
			NumApply:             asIntWithDefault(settings["num_apply"], 25),
			Naming:               asStringOr(settings["naming"], ""),
			AccountApply:         asBool(settings["account_apply"]),
			PlayerInfo:           asBool(settings["player_info"]),
			ApplyClans:           stringSlice(settings["apply_clans"]),
			RolesToAdd:           stringSlice(settings["roles_to_add"]),
			RolesToRemove:        stringSlice(settings["roles_to_remove"]),
			TownhallRequirements: ticketIntMap(settings["townhall_requirements"]),
			NewMessage:           stringPtrMaybe(settings["new_message"]),
		}
	}
	return out
}

func ticketEmojiFromMap(value map[string]any) *modelsv2.DiscordEmoji {
	if len(value) == 0 {
		return nil
	}
	return &modelsv2.DiscordEmoji{
		ID:       stringPtrMaybe(value["id"]),
		Name:     stringPtrMaybe(value["name"]),
		Animated: asBool(value["animated"]),
	}
}

func ticketIntMap(value any) map[string]int {
	raw := mapMaybe(value)
	out := make(map[string]int, len(raw))
	for key, item := range raw {
		out[key] = asIntWithDefault(item, 0)
	}
	return out
}

func decodeEmbedJSON(raw []byte) any {
	if len(raw) == 0 {
		return nil
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var out any
	if err := decoder.Decode(&out); err != nil {
		return nil
	}
	return out
}

func ticketEmbedPayload(value any) map[string]any {
	payload, ok := value.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return payload
}

func ticketApproveMessages(value any) []modelsv2.ApproveMessage {
	raw := anySlice(value)
	out := make([]modelsv2.ApproveMessage, 0, len(raw))
	for _, item := range raw {
		if doc := mapMaybe(item); len(doc) > 0 {
			out = append(out, modelsv2.ApproveMessage{Name: asStringOr(doc["name"], ""), Message: asStringOr(doc["message"], "")})
		}
	}
	return normalizeApproveMessages(out)
}

func ticketTownhallRequirementFields() []string {
	return []string{"BK", "AQ", "GW", "RC", "WARST"}
}

// stringTrimSpace trims whitespace from a string.
func stringTrimSpace(s string) string {
	result := ""
	for _, r := range s {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			continue
		}
		result += string(r)
	}
	// Actually use proper trimming
	return trimSpaceStr(s)
}

func trimSpaceStr(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}

func stringToLower(s string) string {
	result := make([]byte, len(s))
	for i := range s {
		if s[i] >= 'A' && s[i] <= 'Z' {
			result[i] = s[i] + 32
		} else {
			result[i] = s[i]
		}
	}
	return string(result)
}
