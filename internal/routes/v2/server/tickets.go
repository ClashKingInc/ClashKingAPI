package server

import (
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
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

type ticketUserIdentity struct {
	Username    *string
	DisplayName *string
	AvatarURL   *string
}

func ticketIdentityFromAuthUser(doc bson.M) ticketUserIdentity {
	discord := mapMaybe(mapMaybe(doc["linked_accounts"])["discord"])
	username := stringPtrMaybe(discord["username"])
	avatarURL := stringPtrMaybe(discord["avatar_url"])
	return ticketUserIdentity{
		Username:    username,
		DisplayName: username,
		AvatarURL:   avatarURL,
	}
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
		query := bson.M{"server": bson.M{"$in": bson.A{fmt.Sprint(serverID), serverID}}}
		if statusFilter != "" {
			query["status"] = statusFilter
		}
		proj := options.Find().SetProjection(bson.M{"_id": 0})
		openTicketsStartedAt := time.Now()
		cur, err := a.Store.C.OpenTickets.Find(c.UserContext(), query, proj)
		if err != nil {
			return err
		}
		var tickets []bson.M
		if err := cur.All(c.UserContext(), &tickets); err != nil {
			return err
		}
		openTicketsDuration := time.Since(openTicketsStartedAt)

		panelCategoryMap := map[string]bson.M{}
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
			panelCur, perr := a.Store.C.Ticketing.Find(c.UserContext(),
				bson.M{"server_id": serverID, "name": bson.M{"$in": panelNames}},
				options.Find().SetProjection(bson.M{"_id": 0, "name": 1, "open-category": 1, "sleep-category": 1, "closed-category": 1}))
			if perr == nil {
				var panelDocs []bson.M
				if err := panelCur.All(c.UserContext(), &panelDocs); err == nil {
					for _, panelDoc := range panelDocs {
						panelName := serverAsString(panelDoc["name"])
						if panelName != "" {
							panelCategoryMap[panelName] = panelDoc
						}
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
		userIDs := make([]any, 0, len(userIDSet))
		for uid := range userIDSet {
			userIDs = append(userIDs, uid)
			if n := ticketParseInt64(uid); n != 0 {
				userIDs = append(userIDs, n)
			}
		}

		// user_id → []player_tag
		userTagMap := map[string][]string{}
		linkDocCount := 0
		linksDuration := time.Duration(0)
		if len(userIDs) > 0 {
			linksStartedAt := time.Now()
			linkCur, lerr := a.Store.C.Links.Find(c.UserContext(),
				bson.M{"user_id": bson.M{"$in": userIDs}},
				options.Find().SetProjection(bson.M{"_id": 0, "user_id": 1, "player_tag": 1}))
			if lerr == nil {
				var linkDocs []bson.M
				if err := linkCur.All(c.UserContext(), &linkDocs); err != nil {
					return err
				}
				linkDocCount = len(linkDocs)
				for _, ld := range linkDocs {
					uid := serverAsString(ld["user_id"])
					tag := serverAsString(ld["player_tag"])
					if uid != "" && tag != "" {
						userTagMap[uid] = append(userTagMap[uid], tag)
					}
				}
			}
			linksDuration = time.Since(linksStartedAt)
		}

		// Collect all tags to batch-fetch player info
		allTags := []any{}
		tagSet := map[string]struct{}{}
		for _, tags := range userTagMap {
			for _, tag := range tags {
				if _, seen := tagSet[tag]; !seen {
					tagSet[tag] = struct{}{}
					allTags = append(allTags, tag)
				}
			}
		}
		playerMap := map[string]bson.M{}
		playerDocCount := 0
		playersDuration := time.Duration(0)
		if len(allTags) > 0 {
			playersStartedAt := time.Now()
			pCur, perr := a.Store.C.PlayerStats.Find(c.UserContext(),
				bson.M{"tag": bson.M{"$in": allTags}},
				options.Find().SetProjection(bson.M{"_id": 0, "tag": 1, "name": 1, "town_hall": 1, "townhall": 1}))
			if perr == nil {
				var playerDocs []bson.M
				if err := pCur.All(c.UserContext(), &playerDocs); err != nil {
					return err
				}
				playerDocCount = len(playerDocs)
				for _, pd := range playerDocs {
					if tag := serverAsString(pd["tag"]); tag != "" {
						playerMap[tag] = pd
					}
				}
			}
			playersDuration = time.Since(playersStartedAt)
		}

		userIdentityMap := map[string]ticketUserIdentity{}
		missingIdentityIDs := make([]any, 0, len(missingIdentityUserSet)*2)
		for uid := range missingIdentityUserSet {
			missingIdentityIDs = append(missingIdentityIDs, uid)
			if n := ticketParseInt64(uid); n != 0 {
				missingIdentityIDs = append(missingIdentityIDs, n)
			}
		}
		authUserDocCount := 0
		authIdentityHits := 0
		authUsersDuration := time.Duration(0)
		if len(missingIdentityIDs) > 0 {
			authUsersStartedAt := time.Now()
			userCur, uerr := a.Store.C.Users.Find(c.UserContext(),
				bson.M{"linked_accounts.discord.discord_user_id": bson.M{"$in": missingIdentityIDs}},
				options.Find().SetProjection(bson.M{"_id": 0, "linked_accounts.discord": 1}))
			if uerr == nil {
				var userDocs []bson.M
				if err := userCur.All(c.UserContext(), &userDocs); err != nil {
					return err
				}
				authUserDocCount = len(userDocs)
				for _, userDoc := range userDocs {
					discordAccount := mapMaybe(mapMaybe(userDoc["linked_accounts"])["discord"])
					uid := serverAsString(discordAccount["discord_user_id"])
					if uid == "" {
						continue
					}
					identity := ticketIdentityFromAuthUser(userDoc)
					if identity.Username != nil || identity.DisplayName != nil || identity.AvatarURL != nil {
						userIdentityMap[uid] = identity
						authIdentityHits++
					}
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

		toInt := func(s string) int64 {
			var n int64
			fmt.Sscanf(s, "%d", &n)
			return n
		}

		setFields := bson.M{}
		unsetFields := bson.M{}

		setOrUnset := func(key string, s *string) {
			if s == nil {
				return
			}
			if *s == "" {
				unsetFields[key] = ""
			} else {
				setFields[key] = toInt(*s)
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
				unsetFields["embed_name"] = ""
			} else {
				setFields["embed_name"] = *body.EmbedName
			}
		}

		if len(setFields) > 0 || len(unsetFields) > 0 {
			update := bson.M{}
			if len(setFields) > 0 {
				update["$set"] = setFields
			}
			if len(unsetFields) > 0 {
				update["$unset"] = unsetFields
			}
			if _, err := a.Store.C.Ticketing.UpdateOne(c.UserContext(),
				bson.M{"server_id": serverID, "name": panelName},
				update,
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
		approveMessages := normalizeApproveMessages(body.Messages)
		messages := make(bson.A, 0, len(approveMessages))
		for _, m := range approveMessages {
			messages = append(messages, bson.M{"name": m.Name, "message": m.Message})
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

		if status == "delete" {
			result, err := a.Store.C.OpenTickets.DeleteMany(c.UserContext(), ticketChannelQuery(serverID, channelID))
			if err != nil {
				return err
			}
			if result.DeletedCount == 0 {
				return apptypes.Error(http.StatusNotFound, "Open ticket not found")
			}
			return apptypes.JSON(c, http.StatusOK, modelsv2.MessageResponse{Message: "Ticket deleted successfully"})
		}

		if _, err := a.Store.C.OpenTickets.UpdateMany(c.UserContext(),
			ticketChannelQuery(serverID, channelID),
			bson.M{"$set": bson.M{"status": status}},
		); err != nil {
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

		if _, err := a.Store.C.OpenTickets.UpdateMany(c.UserContext(),
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

		result, err := a.Store.C.OpenTickets.DeleteMany(c.UserContext(), ticketChannelQuery(serverID, channelID))
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
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
				sanitizedData, _ := normalizeEmbedPayload(sanitize(d["data"])).(map[string]any)
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
		body.Data, _ = normalizeEmbedPayload(body.Data).(map[string]any)
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
		body.Data, _ = normalizeEmbedPayload(body.Data).(map[string]any)
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

func normalizeEmbedPayload(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for key, item := range typed {
			out[key] = normalizeEmbedPayload(item)
		}
		return out
	case []any:
		out := make([]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, normalizeEmbedPayload(item))
		}
		return out
	case float64:
		if !math.IsNaN(typed) && !math.IsInf(typed, 0) && math.Trunc(typed) == typed {
			return int64(typed)
		}
		return typed
	default:
		return typed
	}
}

func ticketPanelFromDoc(panel bson.M) modelsv2.TicketPanel {
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

func openTicketFromDoc(ticket bson.M) modelsv2.OpenTicket {
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

func ticketPanelCategoryID(panel bson.M, status string) *string {
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
