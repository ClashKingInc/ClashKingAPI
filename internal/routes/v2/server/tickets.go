package server

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// ticketServerID extracts server_id path param as int64.
func ticketServerID(c *fiber.Ctx) (int64, error) {
	serverID, err := pathInt(c, "server_id")
	return int64(serverID), err
}

// ticketChannelQuery builds the MongoDB filter for an open ticket by server+channel.
func ticketChannelQuery(serverID int64, channelID string) bson.M {
	return bson.M{
		"channel": bson.M{"$in": bson.A{channelID, ticketParseInt64(channelID)}},
		"server":  bson.M{"$in": bson.A{fmt.Sprint(serverID), serverID}},
	}
}

func ticketParseInt64(s string) int64 {
	var n int64
	fmt.Sscanf(s, "%d", &n)
	return n
}

// getTicketPanels returns all ticket panels for a server.
//
// @Summary Get ticket panels for a server
// @Tags Server Tickets
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Success 200 {object} map[string]interface{}
// @Router /v2/server/{server_id}/tickets [get]
func getTicketPanels(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		proj := options.Find().SetProjection(bson.M{"_id": 0})
		cur, err := a.Store.C.Ticketing.Find(c.UserContext(), bson.M{"server_id": serverID}, proj)
		if err != nil {
			return err
		}
		var panels []bson.M
		if err := cur.All(c.UserContext(), &panels); err != nil {
			return err
		}

		embedProj := options.Find().SetProjection(bson.M{"_id": 0, "name": 1})
		embedCur, err := a.Store.C.Embeds.Find(c.UserContext(), bson.M{"server": serverID}, embedProj)
		if err != nil {
			return err
		}
		var embedDocs []bson.M
		if err := embedCur.All(c.UserContext(), &embedDocs); err != nil {
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
		return apptypes.JSON(c, http.StatusOK, modelsv2.TicketPanelsResponse{Items: items, Total: len(items), AvailableEmbeds: availableEmbeds})
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
// @Param body body object true "Panel name"
// @Success 200 {object} map[string]interface{}
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
		existing, _ := findOneMap(c.UserContext(), a.Store.C.Ticketing, bson.M{"server_id": serverID, "name": name})
		if existing != nil {
			return apptypes.Error(http.StatusConflict, "A panel with this name already exists")
		}
		if _, err := a.Store.C.Ticketing.InsertOne(c.UserContext(), bson.M{
			"server_id":  serverID,
			"name":       name,
			"components": bson.A{},
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
// @Success 200 {object} map[string]interface{}
// @Router /v2/server/{server_id}/tickets/{panel_name} [delete]
func deleteTicketPanel(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		panelName := c.Params("panel_name")
		result, err := a.Store.C.Ticketing.DeleteOne(c.UserContext(), bson.M{"server_id": serverID, "name": panelName})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
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
// @Success 200 {object} map[string]interface{}
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

		panel, err := findOneMap(c.UserContext(), a.Store.C.Ticketing, bson.M{"server_id": serverID, "name": panelName})
		if err != nil || panel == nil {
			return apptypes.Error(http.StatusNotFound, "Panel not found")
		}
		components, _ := panel["components"].(bson.A)
		if len(components) >= 5 {
			return apptypes.Error(http.StatusBadRequest, "A panel can have at most 5 buttons")
		}

		customID := fmt.Sprintf("%s_%d", panelName, time.Now().UnixMilli())
		newComp := bson.M{
			"type":      2,
			"style":     body.Style,
			"label":     body.Label,
			"custom_id": customID,
		}
		if body.Emoji != nil {
			newComp["emoji"] = body.Emoji
		}
		if _, err := a.Store.C.Ticketing.UpdateOne(c.UserContext(),
			bson.M{"server_id": serverID, "name": panelName},
			bson.M{"$push": bson.M{"components": newComp}},
		); err != nil {
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
// @Success 200 {object} map[string]interface{}
// @Router /v2/server/{server_id}/tickets/{panel_name}/buttons/{custom_id} [delete]
func deleteTicketButton(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		panelName := c.Params("panel_name")
		customID := c.Params("custom_id")

		panel, err := findOneMap(c.UserContext(), a.Store.C.Ticketing, bson.M{"server_id": serverID, "name": panelName})
		if err != nil || panel == nil {
			return apptypes.Error(http.StatusNotFound, "Panel not found")
		}
		if _, err := a.Store.C.Ticketing.UpdateOne(c.UserContext(),
			bson.M{"server_id": serverID, "name": panelName},
			bson.M{
				"$pull":  bson.M{"components": bson.M{"custom_id": customID}},
				"$unset": bson.M{customID + "_settings": ""},
			},
		); err != nil {
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
// @Success 200 {object} map[string]interface{}
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

		panel, err := findOneMap(c.UserContext(), a.Store.C.Ticketing, bson.M{"server_id": serverID, "name": panelName})
		if err != nil || panel == nil {
			return apptypes.Error(http.StatusNotFound, "Panel not found")
		}

		updateFields := bson.M{
			"components.$[elem].label": body.Label,
			"components.$[elem].style": body.Style,
			"components.$[elem].emoji": body.Emoji,
		}
		arrayFilters := options.UpdateOne().SetArrayFilters([]any{
			bson.M{"elem.custom_id": customID},
		})
		if _, err := a.Store.C.Ticketing.UpdateOne(c.UserContext(),
			bson.M{"server_id": serverID, "name": panelName},
			bson.M{"$set": updateFields},
			arrayFilters,
		); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Button appearance updated successfully"})
	}
}

// getOpenTickets returns open tickets for a server.
//
// @Summary Get open tickets for a server
// @Tags Server Tickets
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param status query string false "Filter by status"
// @Success 200 {object} map[string]interface{}
// @Router /v2/server/{server_id}/tickets/open [get]
func getOpenTickets(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		query := bson.M{"server": bson.M{"$in": bson.A{fmt.Sprint(serverID), serverID}}}
		if status := c.Query("status"); status != "" {
			query["status"] = status
		}
		proj := options.Find().SetProjection(bson.M{"_id": 0})
		cur, err := a.Store.C.OpenTickets.Find(c.UserContext(), query, proj)
		if err != nil {
			return err
		}
		var tickets []bson.M
		if err := cur.All(c.UserContext(), &tickets); err != nil {
			return err
		}
		items := make([]modelsv2.OpenTicket, 0, len(tickets))
		for _, ticket := range tickets {
			items = append(items, openTicketFromDoc(ticket))
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.OpenTicketsResponse{Items: items, Total: len(items)})
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
// @Success 200 {object} map[string]interface{}
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

		toIntOrNil := func(s *string) any {
			if s == nil || *s == "" {
				return nil
			}
			var n int64
			fmt.Sscanf(*s, "%d", &n)
			return n
		}

		updateFields := bson.M{}
		if body.OpenCategory != nil {
			updateFields["open-category"] = toIntOrNil(body.OpenCategory)
		}
		if body.SleepCategory != nil {
			updateFields["sleep-category"] = toIntOrNil(body.SleepCategory)
		}
		if body.ClosedCategory != nil {
			updateFields["closed-category"] = toIntOrNil(body.ClosedCategory)
		}
		if body.StatusChangeLog != nil {
			updateFields["status_change_log"] = toIntOrNil(body.StatusChangeLog)
		}
		if body.TicketButtonClickLog != nil {
			updateFields["ticket_button_click_log"] = toIntOrNil(body.TicketButtonClickLog)
		}
		if body.TicketCloseLog != nil {
			updateFields["ticket_close_log"] = toIntOrNil(body.TicketCloseLog)
		}
		if body.EmbedName != nil {
			if *body.EmbedName == "" {
				updateFields["embed_name"] = nil
			} else {
				updateFields["embed_name"] = *body.EmbedName
			}
		}

		if len(updateFields) > 0 {
			if _, err := a.Store.C.Ticketing.UpdateOne(c.UserContext(),
				bson.M{"server_id": serverID, "name": panelName},
				bson.M{"$set": updateFields},
			); err != nil {
				return err
			}
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
// @Success 200 {object} map[string]interface{}
// @Router /v2/server/{server_id}/tickets/{panel_name}/buttons/{custom_id} [put]
func updateTicketButtonSettings(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		panelName := c.Params("panel_name")
		customID := c.Params("custom_id")

		panel, err := findOneMap(c.UserContext(), a.Store.C.Ticketing, bson.M{"server_id": serverID, "name": panelName})
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

		settings := bson.M{
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

		if _, err := a.Store.C.Ticketing.UpdateOne(c.UserContext(),
			bson.M{"server_id": serverID, "name": panelName},
			bson.M{"$set": bson.M{customID + "_settings": settings}},
		); err != nil {
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
// @Success 200 {object} map[string]interface{}
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
		messages := make(bson.A, 0, len(body.Messages))
		for _, m := range body.Messages {
			if m.Name != "" {
				messages = append(messages, bson.M{"name": m.Name, "message": m.Message})
			}
		}
		if _, err := a.Store.C.Ticketing.UpdateOne(c.UserContext(),
			bson.M{"server_id": serverID, "name": panelName},
			bson.M{"$set": bson.M{"approve_messages": messages}},
		); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Approve messages updated successfully"})
	}
}

// updateOpenTicketStatus updates the status of an open ticket.
//
// @Summary Update open ticket status
// @Tags Server Tickets
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param channel_id path string true "Ticket channel ID"
// @Success 200 {object} map[string]interface{}
// @Router /v2/server/{server_id}/tickets/open/{channel_id}/status [put]
func updateOpenTicketStatus(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		channelID := c.Params("channel_id")
		var body modelsv2.UpdateOpenTicketStatusRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}

		status := stringToLower(body.Status)
		if status == "close" {
			status = "closed"
		}
		validStatuses := map[string]bool{"open": true, "sleep": true, "closed": true, "delete": true}
		if !validStatuses[status] {
			return apptypes.Error(http.StatusBadRequest, "Invalid ticket status")
		}

		ticket, err := findOneMap(c.UserContext(), a.Store.C.OpenTickets, ticketChannelQuery(serverID, channelID))
		if err != nil || ticket == nil {
			return apptypes.Error(http.StatusNotFound, "Open ticket not found")
		}

		if _, err := a.Store.C.OpenTickets.UpdateOne(c.UserContext(),
			ticketChannelQuery(serverID, channelID),
			bson.M{"$set": bson.M{"status": status}},
		); err != nil {
			return err
		}

		if status == "delete" {
			return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Ticket deleted successfully"})
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Ticket status updated successfully"})
	}
}

// updateOpenTicketClan sets the assigned clan for an open ticket.
//
// @Summary Update clan for an open ticket
// @Tags Server Tickets
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param channel_id path string true "Ticket channel ID"
// @Success 200 {object} map[string]interface{}
// @Router /v2/server/{server_id}/tickets/open/{channel_id}/clan [put]
func updateOpenTicketClan(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		channelID := c.Params("channel_id")
		var body modelsv2.UpdateOpenTicketClanRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}

		ticket, err := findOneMap(c.UserContext(), a.Store.C.OpenTickets, ticketChannelQuery(serverID, channelID))
		if err != nil || ticket == nil {
			return apptypes.Error(http.StatusNotFound, "Open ticket not found")
		}

		clanTag := ""
		if body.SetClan != nil {
			clanTag = *body.SetClan
		}
		if clanTag != "" {
			clanTag = serverNormalizeTag(clanTag)
			existing, _ := findOneMap(c.UserContext(), a.Store.C.Clans, bson.M{"server": serverID, "tag": clanTag})
			if existing == nil {
				return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
			}
		}

		if _, err := a.Store.C.OpenTickets.UpdateOne(c.UserContext(),
			ticketChannelQuery(serverID, channelID),
			bson.M{"$set": bson.M{"set_clan": clanTag}},
		); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Ticket clan updated successfully"})
	}
}

// deleteOpenTicket deletes an open ticket record.
//
// @Summary Delete an open ticket
// @Tags Server Tickets
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param channel_id path string true "Ticket channel ID"
// @Success 200 {object} map[string]interface{}
// @Router /v2/server/{server_id}/tickets/open/{channel_id} [delete]
func deleteOpenTicket(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		channelID := c.Params("channel_id")

		ticket, err := findOneMap(c.UserContext(), a.Store.C.OpenTickets, ticketChannelQuery(serverID, channelID))
		if err != nil || ticket == nil {
			return apptypes.Error(http.StatusNotFound, "Open ticket not found")
		}

		if _, err := a.Store.C.OpenTickets.UpdateOne(c.UserContext(),
			ticketChannelQuery(serverID, channelID),
			bson.M{"$set": bson.M{"status": "delete"}},
		); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Ticket deleted successfully"})
	}
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
// @Success 200 {object} map[string]interface{}
// @Router /v2/server/{server_id}/embeds [get]
func getServerEmbeds(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		proj := options.Find().SetProjection(bson.M{"_id": 0, "name": 1, "data": 1})
		cur, err := a.Store.C.Embeds.Find(c.UserContext(), bson.M{"server": serverID}, proj)
		if err != nil {
			return err
		}
		var docs []bson.M
		if err := cur.All(c.UserContext(), &docs); err != nil {
			return err
		}
		items := make([]modelsv2.ServerEmbed, 0, len(docs))
		for _, d := range docs {
			if _, ok := d["name"].(string); ok {
				sanitizedData, _ := sanitize(d["data"]).(map[string]any)
				if sanitizedData == nil {
					sanitizedData = map[string]any{}
				}
				items = append(items, modelsv2.ServerEmbed{Name: serverAsString(d["name"]), Data: sanitizedData})
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
// @Param body body object true "Embed name and data"
// @Success 200 {object} map[string]interface{}
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
		existing, _ := findOneMap(c.UserContext(), a.Store.C.Embeds, bson.M{"server": serverID, "name": body.Name})
		if existing != nil {
			return apptypes.Error(http.StatusConflict, "An embed with this name already exists")
		}
		if _, err := a.Store.C.Embeds.InsertOne(c.UserContext(), bson.M{
			"server": serverID,
			"name":   body.Name,
			"data":   body.Data,
		}); err != nil {
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
// @Success 200 {object} map[string]interface{}
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
		upsertOpts := options.UpdateOne().SetUpsert(true)
		if _, err := a.Store.C.Embeds.UpdateOne(c.UserContext(),
			bson.M{"server": serverID, "name": embedName},
			bson.M{"$set": bson.M{"data": body.Data}},
			upsertOpts,
		); err != nil {
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
// @Success 200 {object} map[string]interface{}
// @Router /v2/server/{server_id}/embeds/{embed_name} [delete]
func deleteServerEmbed(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		embedName := c.Params("embed_name")
		result, err := a.Store.C.Embeds.DeleteOne(c.UserContext(), bson.M{"server": serverID, "name": embedName})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Embed not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Embed deleted successfully"})
	}
}

func ticketPanelFromDoc(panel bson.M) modelsv2.TicketPanel {
	result := modelsv2.TicketPanel{
		Name:                 asStringOr(panel["name"], ""),
		ServerID:             ticketParseInt64(asStringOr(panel["server_id"], "0")),
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
	raw, ok := value.([]any)
	if !ok {
		return []modelsv2.TicketButton{}
	}
	out := make([]modelsv2.TicketButton, 0, len(raw))
	for _, item := range raw {
		if doc, ok := item.(bson.M); ok {
			out = append(out, modelsv2.TicketButton{
				CustomID: asStringOr(doc["custom_id"], ""),
				Label:    asStringOr(doc["label"], ""),
				Style:    asIntWithDefault(doc["style"], 2),
				Emoji:    mapMaybe(doc["emoji"]),
				Type:     asIntWithDefault(doc["type"], 2),
			})
		}
	}
	return out
}

func ticketButtonSettings(panel bson.M) map[string]modelsv2.TicketButtonSettings {
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
			TownhallRequirements: mapMaybe(settings["townhall_requirements"]),
			NewMessage:           stringPtrMaybe(settings["new_message"]),
		}
	}
	return out
}

func ticketApproveMessages(value any) []modelsv2.ApproveMessage {
	raw, ok := value.([]any)
	if !ok {
		return []modelsv2.ApproveMessage{}
	}
	out := make([]modelsv2.ApproveMessage, 0, len(raw))
	for _, item := range raw {
		if doc, ok := item.(bson.M); ok {
			out = append(out, modelsv2.ApproveMessage{Name: asStringOr(doc["name"], ""), Message: asStringOr(doc["message"], "")})
		}
	}
	return out
}

func openTicketFromDoc(ticket bson.M) modelsv2.OpenTicket {
	return modelsv2.OpenTicket{
		Channel:            serverAsString(ticket["channel"]),
		ChannelExists:      !strings.EqualFold(asStringOr(ticket["status"], ""), "delete"),
		User:               asStringOr(ticket["user"], ""),
		DiscordUsername:    stringPtrMaybe(ticket["discord_username"]),
		DiscordDisplayName: stringPtrMaybe(ticket["discord_display_name"]),
		DiscordAvatarURL:   stringPtrMaybe(ticket["discord_avatar_url"]),
		Thread:             stringPtrMaybe(ticket["thread"]),
		Server:             asStringOr(ticket["server"], ""),
		Status:             asStringOr(ticket["status"], ""),
		Number:             asIntWithDefault(ticket["number"], 0),
		ApplyAccount:       stringPtrMaybe(ticket["apply_account"]),
		Panel:              asStringOr(ticket["panel"], ""),
		SetClan:            stringPtrMaybe(ticket["set_clan"]),
	}
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
