package server

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
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

type ticketUserIdentity struct {
	Username    *string
	DisplayName *string
	AvatarURL   *string
}

func ticketIdentityFromAuthUser(doc map[string]any) ticketUserIdentity {
	discord := mapMaybe(mapMaybe(doc["linked_accounts"])["discord"])
	username := stringPtrMaybe(discord["username"])
	avatarURL := stringPtrMaybe(discord["avatar_url"])
	return ticketUserIdentity{
		Username:    username,
		DisplayName: username,
		AvatarURL:   avatarURL,
	}
}

func sqlAuthUserIdentities(c *fiber.Ctx, a apptypes.Deps, discordIDs []string) (map[string]ticketUserIdentity, int, error) {
	out := map[string]ticketUserIdentity{}
	if len(discordIDs) == 0 || a.Store.SQL == nil {
		return out, 0, nil
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT discord_user_id, username, data
		FROM auth_users
		WHERE discord_user_id = ANY($1)
	`, discordIDs)
	if err != nil {
		return out, 0, err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var discordID, username string
		var raw []byte
		if err := rows.Scan(&discordID, &username, &raw); err != nil {
			return out, count, err
		}
		count++
		doc := map[string]any{}
		_ = json.Unmarshal(raw, &doc)
		linked := mapMaybe(doc["linked_accounts"])
		discordDoc := mapMaybe(linked["discord"])
		discordDoc["discord_user_id"] = discordID
		if discordDoc["username"] == nil && username != "" {
			discordDoc["username"] = username
		}
		linked["discord"] = discordDoc
		doc["linked_accounts"] = linked
		out[discordID] = ticketIdentityFromAuthUser(doc)
	}
	if err := rows.Err(); err != nil {
		return out, count, err
	}
	return out, count, nil
}

func sqlPlayerLinksForTickets(c *fiber.Ctx, a apptypes.Deps, userIDs []string) (map[string][]string, int, error) {
	out := map[string][]string{}
	if len(userIDs) == 0 || a.Store.SQL == nil {
		return out, 0, nil
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT COALESCE(user_id, ''), tag
		FROM player_links
		WHERE user_id = ANY($1)
	`, userIDs)
	if err != nil {
		return out, 0, err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var userID, tag string
		if err := rows.Scan(&userID, &tag); err != nil {
			return out, count, err
		}
		count++
		if userID != "" && tag != "" {
			out[userID] = append(out[userID], tag)
		}
	}
	return out, count, rows.Err()
}

func sqlTicketPlayerMap(c *fiber.Ctx, a apptypes.Deps, tags []string) (map[string]map[string]any, int, error) {
	out := map[string]map[string]any{}
	if len(tags) == 0 || a.Store.SQL == nil {
		return out, 0, nil
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT player_tag, name, townhall_level
		FROM player_current_stats
		WHERE player_tag = ANY($1)
	`, tags)
	if err != nil {
		return out, 0, err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var tag, name string
		var townhall *int
		if err := rows.Scan(&tag, &name, &townhall); err != nil {
			return out, count, err
		}
		count++
		doc := map[string]any{"tag": tag, "name": name}
		if townhall != nil {
			doc["town_hall"] = *townhall
			doc["townhall"] = *townhall
		}
		out[tag] = doc
	}
	return out, count, rows.Err()
}

func ticketIdentityFromMember(member discord.Member) ticketUserIdentity {
	var username *string
	if member.User.Username != "" {
		name := member.User.Username
		username = &name
	}

	var displayName *string
	if effectiveName := member.EffectiveName(); effectiveName != "" {
		name := effectiveName
		displayName = &name
	}

	var avatarURL *string
	if effectiveAvatarURL := member.EffectiveAvatarURL(); effectiveAvatarURL != "" {
		url := effectiveAvatarURL
		avatarURL = &url
	}

	return ticketUserIdentity{
		Username:    username,
		DisplayName: displayName,
		AvatarURL:   avatarURL,
	}
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
		FROM custom_embeds
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
		item := map[string]any{"name": name, "data": mapMaybe(decodeJSONAny(dataRaw)), "created_at": createdAt, "updated_at": updatedAt}
		items = append(items, item)
	}
	return items, rows.Err()
}

func ticketEmbedSave(c *fiber.Ctx, a apptypes.Deps, serverID int64, name string, data modelsv2.DiscordEmbed) error {
	_, err := a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO custom_embeds (server_id, name, data, created_at, updated_at)
		VALUES ($1, $2, $3::jsonb, now(), now())
		ON CONFLICT (server_id, name) DO UPDATE SET
			data = EXCLUDED.data,
			updated_at = now()
	`, fmt.Sprint(serverID), name, apptypes.Marshal(data))
	return err
}

func ticketEmbedDelete(c *fiber.Ctx, a apptypes.Deps, serverID int64, name string) (int64, error) {
	cmd, err := a.Store.SQL.Exec(c.UserContext(), `
		DELETE FROM custom_embeds
		WHERE server_id = $1 AND name = $2
	`, fmt.Sprint(serverID), name)
	return cmd.RowsAffected(), err
}

func openTicketList(c *fiber.Ctx, a apptypes.Deps, serverID int64, status string) ([]map[string]any, error) {
	args := []any{fmt.Sprint(serverID)}
	where := "server_id = $1"
	if status != "" {
		args = append(args, status)
		where += " AND status = $2"
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT server_id, channel_id, panel_name, status, user_id, set_clan, data, created_at, updated_at
		FROM open_tickets
		WHERE `+where+`
		ORDER BY created_at DESC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		item, err := openTicketScan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func openTicketGet(c *fiber.Ctx, a apptypes.Deps, serverID int64, channelID string) (map[string]any, error) {
	return openTicketScan(a.Store.SQL.QueryRow(c.UserContext(), `
		SELECT server_id, channel_id, panel_name, status, user_id, set_clan, data, created_at, updated_at
		FROM open_tickets
		WHERE server_id = $1 AND channel_id = $2
	`, fmt.Sprint(serverID), channelID))
}

func openTicketScan(row sqlScanner) (map[string]any, error) {
	var serverID, channelID, status string
	var panelName, userID, setClan *string
	var dataRaw []byte
	var createdAt, updatedAt time.Time
	if err := row.Scan(&serverID, &channelID, &panelName, &status, &userID, &setClan, &dataRaw, &createdAt, &updatedAt); err != nil {
		return nil, err
	}
	item := mapMaybe(decodeJSONAny(dataRaw))
	item["server"] = serverID
	item["channel"] = channelID
	item["status"] = status
	if panelName != nil {
		item["panel"] = *panelName
	}
	if userID != nil {
		item["user"] = *userID
	}
	if setClan != nil {
		item["set_clan"] = *setClan
	}
	item["created_at"] = createdAt
	item["updated_at"] = updatedAt
	return item, nil
}

func openTicketSave(c *fiber.Ctx, a apptypes.Deps, ticket map[string]any) error {
	_, err := a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO open_tickets (server_id, channel_id, panel_name, status, user_id, set_clan, data, created_at, updated_at)
		VALUES ($1, $2, NULLIF($3, ''), $4, NULLIF($5, ''), NULLIF($6, ''), $7::jsonb, COALESCE($8, now()), now())
		ON CONFLICT (server_id, channel_id) DO UPDATE SET
			panel_name = EXCLUDED.panel_name,
			status = EXCLUDED.status,
			user_id = EXCLUDED.user_id,
			set_clan = EXCLUDED.set_clan,
			data = EXCLUDED.data,
			updated_at = now()
	`, fmt.Sprint(asInt64(ticket["server"])), serverAsString(ticket["channel"]), serverAsString(ticket["panel"]), serverAsString(ticket["status"]), serverAsString(ticket["user"]), serverAsString(ticket["set_clan"]), apptypes.Marshal(ticket), ticket["created_at"])
	return err
}

func openTicketDelete(c *fiber.Ctx, a apptypes.Deps, serverID int64, channelID string) (int64, error) {
	cmd, err := a.Store.SQL.Exec(c.UserContext(), `
		DELETE FROM open_tickets
		WHERE server_id = $1 AND channel_id = $2
	`, fmt.Sprint(serverID), channelID)
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

// getOpenTickets returns open tickets for a server.
//
// @Summary Get open tickets for a server
// @Tags Server Tickets
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param status query string false "Filter by status"
// @Success 200 {object} modelsv2.OpenTicketsResponse
// @Router /v2/server/{server_id}/tickets/open [get]
func getOpenTickets(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		startedAt := time.Now()
		var serverID int64
		debugEnabled := apptypes.Logger().Enabled(c.UserContext(), slog.LevelDebug)
		debugLog := func(duration time.Duration, ticketCount, uniqueUsers, missingIdentityUsers, linkDocCount, linkedUserCount, uniqueTags, playerDocCount, authUserDocCount, authIdentityHits, discordLookupsAttempted, discordLookupsSucceeded, resultCount int, statusFilter string, openTicketsMS, linksMS, playersMS, authUsersMS, discordMS, serializeMS int64) {
			if !debugEnabled {
				return
			}
			apptypes.Logger().Debug("tickets_open_profile",
				"request_id", apptypes.RequestID(c),
				"server_id", serverID,
				"status", statusFilter,
				"tickets", ticketCount,
				"unique_users", uniqueUsers,
				"missing_identity_users", missingIdentityUsers,
				"link_docs", linkDocCount,
				"linked_users", linkedUserCount,
				"unique_tags", uniqueTags,
				"player_docs", playerDocCount,
				"auth_user_docs", authUserDocCount,
				"auth_identity_hits", authIdentityHits,
				"discord_lookup_attempted", discordLookupsAttempted,
				"discord_lookup_succeeded", discordLookupsSucceeded,
				"result_count", resultCount,
				"open_tickets_ms", openTicketsMS,
				"links_ms", linksMS,
				"players_ms", playersMS,
				"auth_users_ms", authUsersMS,
				"discord_ms", discordMS,
				"serialize_ms", serializeMS,
				"total_ms", duration.Milliseconds(),
			)
		}

		var err error
		serverID, err = ticketServerID(c)
		if err != nil {
			return err
		}
		statusFilter := c.Query("status")
		openTicketsStartedAt := time.Now()
		tickets, err := openTicketList(c, a, serverID, statusFilter)
		if err != nil {
			return err
		}
		openTicketsDuration := time.Since(openTicketsStartedAt)

		panelCategoryMap := map[string]map[string]any{}
		panelNames := make([]string, 0)
		panelNameSet := map[string]struct{}{}
		for _, ticket := range tickets {
			panelName := serverAsString(ticket["panel"])
			if panelName == "" {
				continue
			}
			if _, seen := panelNameSet[panelName]; seen {
				continue
			}
			panelNameSet[panelName] = struct{}{}
			panelNames = append(panelNames, panelName)
		}
		if len(panelNames) > 0 {
			panelDocs, perr := ticketPanelList(c, a, serverID)
			if perr == nil {
				for _, panelDoc := range panelDocs {
					panelName := serverAsString(panelDoc["name"])
					if panelName != "" {
						panelCategoryMap[panelName] = panelDoc
					}
				}
			}
		}
		categoryNameMap := map[string]string{}
		channelExistsByID := map[string]bool{}
		channelExistenceLoaded := false
		channels, cerr := a.Discord.GetGuildChannels(c.UserContext(), serverID)
		if cerr == nil {
			for _, channel := range channels {
				if channel.Type() != discord.ChannelTypeGuildCategory {
					continue
				}
				categoryNameMap[channel.ID().String()] = channel.Name()
			}
		}
		ticketChannelIDs := make([]string, 0, len(tickets))
		ticketChannelIDSet := map[string]struct{}{}
		for _, ticket := range tickets {
			channelID := serverAsString(ticket["channel"])
			if channelID == "" {
				continue
			}
			if _, seen := ticketChannelIDSet[channelID]; seen {
				continue
			}
			ticketChannelIDSet[channelID] = struct{}{}
			ticketChannelIDs = append(ticketChannelIDs, channelID)
		}
		if len(ticketChannelIDs) > 0 {
			channelExistenceLoaded = true
			var wg sync.WaitGroup
			var mu sync.Mutex
			sem := make(chan struct{}, 10)
			for _, channelID := range ticketChannelIDs {
				channelInt := ticketParseInt64(channelID)
				if channelInt == 0 {
					channelExistsByID[channelID] = false
					continue
				}
				wg.Add(1)
				go func(channelID string, channelInt int64) {
					defer wg.Done()
					sem <- struct{}{}
					defer func() { <-sem }()

					_, err := a.Discord.GetChannelDirect(c.UserContext(), channelInt)

					mu.Lock()
					channelExistsByID[channelID] = err == nil
					mu.Unlock()
				}(channelID, channelInt)
			}
			wg.Wait()
		}

		// Collect unique user IDs to batch-fetch linked accounts and missing identities.
		userIDSet := map[string]struct{}{}
		missingIdentityUserSet := map[string]struct{}{}
		for _, t := range tickets {
			if uid := serverAsString(t["user"]); uid != "" {
				userIDSet[uid] = struct{}{}
				if stringPtrMaybe(t["discord_username"]) == nil && stringPtrMaybe(t["discord_display_name"]) == nil {
					missingIdentityUserSet[uid] = struct{}{}
				}
			}
		}
		userIDs := make([]string, 0, len(userIDSet))
		for uid := range userIDSet {
			userIDs = append(userIDs, uid)
		}

		// user_id → []player_tag
		userTagMap := map[string][]string{}
		linkDocCount := 0
		linksDuration := time.Duration(0)
		if len(userIDs) > 0 {
			linksStartedAt := time.Now()
			var lerr error
			userTagMap, linkDocCount, lerr = sqlPlayerLinksForTickets(c, a, userIDs)
			if lerr != nil {
				return lerr
			}
			linksDuration = time.Since(linksStartedAt)
		}

		// Collect all tags to batch-fetch player info
		allTags := []string{}
		tagSet := map[string]struct{}{}
		for _, tags := range userTagMap {
			for _, tag := range tags {
				if _, seen := tagSet[tag]; !seen {
					tagSet[tag] = struct{}{}
					allTags = append(allTags, tag)
				}
			}
		}
		playerMap := map[string]map[string]any{}
		playerDocCount := 0
		playersDuration := time.Duration(0)
		if len(allTags) > 0 {
			playersStartedAt := time.Now()
			var perr error
			playerMap, playerDocCount, perr = sqlTicketPlayerMap(c, a, allTags)
			if perr != nil {
				return perr
			}
			playersDuration = time.Since(playersStartedAt)
		}

		userIdentityMap := map[string]ticketUserIdentity{}
		missingIdentityIDs := make([]string, 0, len(missingIdentityUserSet))
		for uid := range missingIdentityUserSet {
			missingIdentityIDs = append(missingIdentityIDs, uid)
		}
		authUserDocCount := 0
		authIdentityHits := 0
		authUsersDuration := time.Duration(0)
		if len(missingIdentityIDs) > 0 {
			authUsersStartedAt := time.Now()
			var uerr error
			userIdentityMap, authUserDocCount, uerr = sqlAuthUserIdentities(c, a, missingIdentityIDs)
			if uerr != nil {
				return uerr
			}
			for _, identity := range userIdentityMap {
				if identity.Username != nil || identity.DisplayName != nil || identity.AvatarURL != nil {
					authIdentityHits++
				}
			}
			authUsersDuration = time.Since(authUsersStartedAt)
		}

		remainingMissingIdentityUserIDs := make([]string, 0, len(missingIdentityUserSet))
		for uid := range missingIdentityUserSet {
			identity := userIdentityMap[uid]
			if identity.Username != nil || identity.DisplayName != nil {
				continue
			}
			remainingMissingIdentityUserIDs = append(remainingMissingIdentityUserIDs, uid)
		}
		sort.Strings(remainingMissingIdentityUserIDs)

		// Step 1: resolve from Valkey cache before hitting Discord API.
		// The bot populates discord:guild_member:{guild_id}:{user_id} on member events.
		cacheResolved := make([]string, 0, len(remainingMissingIdentityUserIDs))
		for _, uid := range remainingMissingIdentityUserIDs {
			entry, ok := a.Cache.GetDiscordMember(c.UserContext(), serverID, uid)
			if !ok {
				continue
			}
			cacheResolved = append(cacheResolved, uid)
			if entry.NotOnServer {
				// negative cache hit — user confirmed absent, no Discord call needed
				userIdentityMap[uid] = ticketUserIdentity{}
			} else {
				userIdentityMap[uid] = ticketUserIdentity{
					Username:    entry.Username,
					DisplayName: entry.DisplayName,
					AvatarURL:   entry.AvatarURL,
				}
			}
		}
		if len(cacheResolved) > 0 {
			resolved := make(map[string]bool, len(cacheResolved))
			for _, uid := range cacheResolved {
				resolved[uid] = true
			}
			filtered := remainingMissingIdentityUserIDs[:0]
			for _, uid := range remainingMissingIdentityUserIDs {
				if !resolved[uid] {
					filtered = append(filtered, uid)
				}
			}
			remainingMissingIdentityUserIDs = filtered
		}

		// Step 2: fall back to live Discord API only for users not in cache.
		// Cap at 20 lookups per request to prevent slow responses on large servers.
		const maxDiscordLookups = 20
		if len(remainingMissingIdentityUserIDs) > maxDiscordLookups {
			remainingMissingIdentityUserIDs = remainingMissingIdentityUserIDs[:maxDiscordLookups]
		}
		discordLookupsAttempted := 0
		discordLookupsSucceeded := 0
		discordDuration := time.Duration(0)
		if len(remainingMissingIdentityUserIDs) > 0 {
			discordStartedAt := time.Now()
			var wg sync.WaitGroup
			var mu sync.Mutex
			sem := make(chan struct{}, 10)

			for _, uid := range remainingMissingIdentityUserIDs {
				userInt := ticketParseInt64(uid)
				if userInt == 0 {
					continue
				}
				discordLookupsAttempted++

				wg.Add(1)
				go func(userID string, userInt int64) {
					defer wg.Done()
					sem <- struct{}{}
					defer func() { <-sem }()

					member := a.Discord.GetMemberDirect(c.UserContext(), serverID, userInt)
					if member == nil {
						return
					}

					mu.Lock()
					userIdentityMap[userID] = ticketIdentityFromMember(*member)
					discordLookupsSucceeded++
					mu.Unlock()
				}(uid, userInt)
			}

			wg.Wait()
			discordDuration = time.Since(discordStartedAt)
		}

		serializeStartedAt := time.Now()
		items := make([]modelsv2.OpenTicket, 0, len(tickets))
		for _, ticket := range tickets {
			t := openTicketFromDoc(ticket)
			categoryID := t.CategoryID
			if categoryID == nil {
				categoryID = ticketPanelCategoryID(panelCategoryMap[t.Panel], t.Status)
			}
			if categoryID != nil {
				t.CategoryID = categoryID
				if t.CategoryName == nil {
					if categoryName := categoryNameMap[*categoryID]; categoryName != "" {
						t.CategoryName = &categoryName
					}
				}
			}

			if t.CategoryName == nil && t.CategoryID != nil {
				if categoryName := categoryNameMap[*t.CategoryID]; categoryName != "" {
					t.CategoryName = &categoryName
				}
			}

			if channelExistenceLoaded {
				t.ChannelExists = channelExistsByID[t.Channel]
			}

			if identity, ok := userIdentityMap[t.User]; ok {
				if t.DiscordUsername == nil && identity.Username != nil {
					t.DiscordUsername = identity.Username
				}
				if t.DiscordDisplayName == nil {
					if identity.DisplayName != nil {
						t.DiscordDisplayName = identity.DisplayName
					} else if identity.Username != nil {
						t.DiscordDisplayName = identity.Username
					}
				}
				if t.DiscordAvatarURL == nil && identity.AvatarURL != nil {
					t.DiscordAvatarURL = identity.AvatarURL
				}
			}

			uid := t.User
			if tags, ok := userTagMap[uid]; ok {
				accounts := make([]modelsv2.LinkedAccount, 0, len(tags))
				for _, tag := range tags {
					pd := playerMap[tag]
					var name *string
					if n := serverAsString(pd["name"]); n != "" {
						n := n
						name = &n
					}
					var th *int
					raw := pd["town_hall"]
					if raw == nil {
						raw = pd["townhall"]
					}
					if n := asIntWithDefault(raw, -1); n >= 0 {
						n := n
						th = &n
					}
					accounts = append(accounts, modelsv2.LinkedAccount{
						PlayerTag:  tag,
						PlayerName: name,
						TownHall:   th,
					})
				}
				t.LinkedAccounts = accounts
			}
			items = append(items, t)
		}
		serializeDuration := time.Since(serializeStartedAt)
		debugLog(
			time.Since(startedAt),
			len(tickets),
			len(userIDSet),
			len(missingIdentityUserSet),
			linkDocCount,
			len(userTagMap),
			len(tagSet),
			playerDocCount,
			authUserDocCount,
			authIdentityHits,
			discordLookupsAttempted,
			discordLookupsSucceeded,
			len(items),
			statusFilter,
			openTicketsDuration.Milliseconds(),
			linksDuration.Milliseconds(),
			playersDuration.Milliseconds(),
			authUsersDuration.Milliseconds(),
			discordDuration.Milliseconds(),
			serializeDuration.Milliseconds(),
		)
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

// updateOpenTicketStatus updates the status of an open ticket.
//
// @Summary Update open ticket status
// @Tags Server Tickets
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Discord server ID"
// @Param channel_id path string true "Ticket channel ID"
// @Success 200 {object} modelsv2.MessageResponse
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

		ticket, err := openTicketGet(c, a, serverID, channelID)
		if err != nil || ticket == nil {
			return apptypes.Error(http.StatusNotFound, "Open ticket not found")
		}

		if status == "delete" {
			deleted, err := openTicketDelete(c, a, serverID, channelID)
			if err != nil {
				return err
			}
			if deleted == 0 {
				return apptypes.Error(http.StatusNotFound, "Open ticket not found")
			}
			return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Ticket deleted successfully"})
		}

		ticket["status"] = status
		if err := openTicketSave(c, a, ticket); err != nil {
			return err
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
// @Success 200 {object} modelsv2.MessageResponse
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

		ticket, err := openTicketGet(c, a, serverID, channelID)
		if err != nil || ticket == nil {
			return apptypes.Error(http.StatusNotFound, "Open ticket not found")
		}

		clanTag := ""
		if body.SetClan != nil {
			clanTag = *body.SetClan
		}
		if clanTag != "" {
			clanTag = serverNormalizeTag(clanTag)
			existing, _ := sqlServerClanDoc(c, a, int(serverID), clanTag)
			if existing == nil {
				return apptypes.Error(http.StatusNotFound, "Clan not found on this server")
			}
		}

		ticket["set_clan"] = clanTag
		if err := openTicketSave(c, a, ticket); err != nil {
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
// @Success 200 {object} modelsv2.MessageResponse
// @Router /v2/server/{server_id}/tickets/open/{channel_id} [delete]
func deleteOpenTicket(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := ticketServerID(c)
		if err != nil {
			return err
		}
		channelID := c.Params("channel_id")

		ticket, err := openTicketGet(c, a, serverID, channelID)
		if err != nil || ticket == nil {
			return apptypes.Error(http.StatusNotFound, "Open ticket not found")
		}

		deleted, err := openTicketDelete(c, a, serverID, channelID)
		if err != nil {
			return err
		}
		if deleted == 0 {
			return apptypes.Error(http.StatusNotFound, "Open ticket not found")
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
				items = append(items, modelsv2.ServerEmbed{Name: serverAsString(d["name"]), Data: ticketEmbedFromMap(mapMaybe(d["data"]))})
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

func ticketEmbedFromMap(value map[string]any) modelsv2.DiscordEmbed {
	embed := modelsv2.DiscordEmbed{
		Title:       stringPtrMaybe(value["title"]),
		Description: stringPtrMaybe(value["description"]),
		URL:         stringPtrMaybe(value["url"]),
		Timestamp:   stringPtrMaybe(value["timestamp"]),
		Color:       intPtrMaybe(value["color"]),
	}
	if footer := mapMaybe(value["footer"]); len(footer) > 0 {
		embed.Footer = &modelsv2.DiscordEmbedFooter{Text: serverAsString(footer["text"]), IconURL: stringPtrMaybe(footer["icon_url"])}
	}
	if image := mapMaybe(value["image"]); len(image) > 0 {
		embed.Image = &modelsv2.DiscordEmbedMedia{URL: serverAsString(image["url"])}
	}
	if thumbnail := mapMaybe(value["thumbnail"]); len(thumbnail) > 0 {
		embed.Thumbnail = &modelsv2.DiscordEmbedMedia{URL: serverAsString(thumbnail["url"])}
	}
	if author := mapMaybe(value["author"]); len(author) > 0 {
		embed.Author = &modelsv2.DiscordEmbedAuthor{Name: serverAsString(author["name"]), URL: stringPtrMaybe(author["url"]), IconURL: stringPtrMaybe(author["icon_url"])}
	}
	for _, raw := range anySlice(value["fields"]) {
		field := mapMaybe(raw)
		embed.Fields = append(embed.Fields, modelsv2.DiscordEmbedField{Name: serverAsString(field["name"]), Value: serverAsString(field["value"]), Inline: asBool(field["inline"])})
	}
	return embed
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

func openTicketFromDoc(ticket map[string]any) modelsv2.OpenTicket {
	return modelsv2.OpenTicket{
		Channel:            serverAsString(ticket["channel"]),
		ChannelExists:      !strings.EqualFold(serverAsString(ticket["status"]), "delete"),
		User:               serverAsString(ticket["user"]),
		DiscordUsername:    stringPtrMaybe(ticket["discord_username"]),
		DiscordDisplayName: stringPtrMaybe(ticket["discord_display_name"]),
		DiscordAvatarURL:   stringPtrMaybe(ticket["discord_avatar_url"]),
		Thread:             stringPtrMaybe(ticket["thread"]),
		Server:             serverAsString(ticket["server"]),
		Status:             serverAsString(ticket["status"]),
		Number:             asIntWithDefault(ticket["number"], 0),
		ApplyAccount:       stringPtrMaybe(ticket["apply_account"]),
		Panel:              serverAsString(ticket["panel"]),
		CategoryID:         stringPtrMaybe(ticket["category_id"]),
		CategoryName:       stringPtrMaybe(ticket["category_name"]),
		SetClan:            stringPtrMaybe(ticket["set_clan"]),
	}
}

func ticketPanelCategoryID(panel map[string]any, status string) *string {
	field := "open-category"
	switch strings.ToLower(status) {
	case "sleep":
		field = "sleep-category"
	case "closed", "delete":
		field = "closed-category"
	}
	return stringPtrMaybe(panel[field])
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
