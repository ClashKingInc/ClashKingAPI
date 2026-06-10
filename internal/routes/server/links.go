package server

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/disgoorg/disgo/discord"
	"github.com/gofiber/fiber/v2"
)

// getLinks godoc
// @Summary Get server links
// @Description Returns all player-Discord account links for server members.
// @Tags Server Links
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param limit query int false "Max results per page (default 100)"
// @Param offset query int false "Pagination offset"
// @Param search query string false "Search by player tag"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 502 {object} map[string]interface{}
// @Router /v2/server/{server_id}/links [get]
func getLinks(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if err := ensureSQLServer(c, rt, serverID); err != nil {
			return notFoundErr(err, "Server not found")
		}
		limit := c.QueryInt("limit", 100)
		if limit <= 0 {
			limit = 100
		}
		offset := c.QueryInt("offset", 0)
		if offset < 0 {
			offset = 0
		}
		search := c.Query("search")

		serverMembers, err := fetchAllServerMembers(c, rt, int64(serverID))
		if err != nil {
			return apptypes.Error(http.StatusBadGateway, "Failed to fetch Discord members")
		}
		memberIDs := make([]string, 0, len(serverMembers))
		for userID := range serverMembers {
			memberIDs = append(memberIDs, userID)
		}
		if len(memberIDs) == 0 {
			return apptypes.JSON(c, http.StatusOK, map[string]any{
				"members":               []any{},
				"total_members":         0,
				"members_with_links":    0,
				"total_linked_accounts": 0,
				"verified_accounts":     0,
			})
		}

		// Resolve internal ClashKing UUIDs → Discord user IDs.
		// Accounts created via the Go API store an internal UUID as user_id,
		// while legacy Python-bot accounts stored Discord snowflake IDs directly.
		// We need both to show all linked accounts for server members.
		internalToDiscord := map[string]string{}
		internalIDs, err := sqlInternalUserIDsForDiscordMembers(c, rt, memberIDs, internalToDiscord)
		if err != nil {
			return err
		}

		// Query by both Discord IDs (legacy) and internal UUIDs (new accounts).
		linkIDs := append([]string{}, memberIDs...)
		if len(internalIDs) > 0 {
			linkIDs = append(linkIDs, internalIDs...)
		}
		links, err := sqlPlayerLinksByUsers(c, rt, linkIDs)
		if err != nil {
			return err
		}

		// Group by Discord ID, normalising internal UUIDs.
		grouped := map[string][]map[string]any{}
		for _, link := range links {
			userID := serverAsString(link["user_id"])
			if userID == "" {
				continue
			}
			discordID := userID
			if resolved, ok := internalToDiscord[userID]; ok {
				discordID = resolved
			}
			// Only include users who are currently on the server.
			if _, onServer := serverMembers[discordID]; !onServer {
				continue
			}
			grouped[discordID] = append(grouped[discordID], link)
		}

		type groupedMember struct {
			UserID        string
			Links         []map[string]any
			AccountCount  int
			VerifiedCount int
		}
		groupedMembers := make([]groupedMember, 0, len(grouped))
		totalLinkedAccounts := 0
		verifiedAccounts := 0
		for userID, userLinks := range grouped {
			if search != "" && !linksMatchSearch(userLinks, search) {
				continue
			}
			accountCount := len(userLinks)
			verifiedCount := 0
			for _, link := range userLinks {
				if asBool(link["is_verified"]) {
					verifiedCount++
				}
			}
			totalLinkedAccounts += accountCount
			verifiedAccounts += verifiedCount
			groupedMembers = append(groupedMembers, groupedMember{
				UserID:        userID,
				Links:         userLinks,
				AccountCount:  accountCount,
				VerifiedCount: verifiedCount,
			})
		}

		sort.SliceStable(groupedMembers, func(i, j int) bool {
			if groupedMembers[i].AccountCount != groupedMembers[j].AccountCount {
				return groupedMembers[i].AccountCount > groupedMembers[j].AccountCount
			}
			return groupedMembers[i].UserID < groupedMembers[j].UserID
		})

		totalFiltered := len(groupedMembers)
		start := offset
		if start > totalFiltered {
			start = totalFiltered
		}
		end := start + limit
		if end > totalFiltered {
			end = totalFiltered
		}
		paginatedGroups := groupedMembers[start:end]

		playerTags := make([]string, 0)
		for _, group := range paginatedGroups {
			for _, link := range group.Links {
				if tag := serverAsString(link["player_tag"]); tag != "" {
					playerTags = append(playerTags, tag)
				}
			}
		}
		playerDocs, err := sqlPlayerStatsByTags(c, rt, playerTags)
		if err != nil {
			playerDocs = nil
		}
		playerMap := map[string]map[string]any{}
		for _, playerDoc := range playerDocs {
			tag := serverAsString(playerDoc["tag"])
			if tag != "" {
				playerMap[tag] = playerDoc
			}
		}

		members := make([]map[string]any, 0, len(paginatedGroups))
		for _, group := range paginatedGroups {
			member := serverMembers[group.UserID]
			linkedAccounts := make([]map[string]any, 0, len(group.Links))
			for _, link := range group.Links {
				tag := serverAsString(link["player_tag"])
				playerDoc := playerMap[tag]
				townHall := playerDoc["town_hall"]
				if townHall == nil {
					townHall = playerDoc["townhall"]
				}
				linkedAccounts = append(linkedAccounts, map[string]any{
					"player_tag":  tag,
					"player_name": toStringMaybe(playerDoc["name"]),
					"town_hall":   townHall,
					"is_verified": asBool(link["is_verified"]),
					"added_at":    stringifyTimeLike(link["added_at"]),
				})
			}
			members = append(members, map[string]any{
				"user_id":         group.UserID,
				"username":        member.User.Username,
				"display_name":    member.EffectiveName(),
				"avatar_url":      member.EffectiveAvatarURL(),
				"linked_accounts": linkedAccounts,
				"account_count":   len(linkedAccounts),
			})
		}

		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"members":               members,
			"total_members":         totalFiltered,
			"members_with_links":    len(groupedMembers),
			"total_linked_accounts": totalLinkedAccounts,
			"verified_accounts":     verifiedAccounts,
		})
	}
}

// deleteLink godoc
// @Summary Delete a link
// @Description Removes the link between a Discord user and a player account.
// @Tags Server Links
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param user_discord_id path string true "Discord User ID"
// @Param player_tag path string true "Player Tag"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/links/{user_discord_id}/{player_tag} [delete]
func deleteLink(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		_, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		userID := c.Params("user_discord_id")
		tag := serverNormalizeTag(c.Params("player_tag"))
		result, err := rt.Store.SQL.Exec(c.UserContext(), `DELETE FROM player_links WHERE user_id = $1 AND tag = $2`, userID, tag)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Link not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Link removed successfully", "player_tag": tag, "user_id": userID})
	}
}

// bulkUnlink godoc
// @Summary Bulk unlink accounts
// @Description Removes multiple player-Discord links for a user in bulk.
// @Tags Server Links
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/links/bulk-unlink [post]
func bulkUnlink(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		_, err := pathInt(c, "server_id")
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
		result, err := rt.Store.SQL.Exec(c.UserContext(), `DELETE FROM player_links WHERE user_id = $1 AND tag = ANY($2)`, body.UserDiscordID, tags)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Links removed successfully", "deleted_count": result.RowsAffected()})
	}
}

func fetchAllServerMembers(c *fiber.Ctx, rt apptypes.Deps, serverID int64) (map[string]discord.Member, error) {
	members := map[string]discord.Member{}
	var after int64
	for {
		batch, err := rt.Discord.GetMembers(c.UserContext(), serverID, 1000, after)
		if err != nil {
			return nil, err
		}
		if len(batch) == 0 {
			break
		}
		for _, member := range batch {
			members[member.User.ID.String()] = member
			if int64(member.User.ID) > after {
				after = int64(member.User.ID)
			}
		}
		if len(batch) < 1000 {
			break
		}
	}
	return members, nil
}

func linksMatchSearch(links []map[string]any, search string) bool {
	if search == "" {
		return true
	}
	for _, link := range links {
		if containsInsensitive(serverAsString(link["player_tag"]), search) {
			return true
		}
	}
	return false
}

func containsInsensitive(value, search string) bool {
	value = strings.ToLower(value)
	search = strings.ToLower(search)
	return strings.Contains(value, search)
}

func asBool(value any) bool {
	if typed, ok := value.(bool); ok {
		return typed
	}
	return false
}

func stringifyTimeLike(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case string:
		return typed
	case time.Time:
		return typed.UTC().Format(time.RFC3339)
	default:
		return serverAsString(typed)
	}
}

func ensureSQLServer(c *fiber.Ctx, rt apptypes.Deps, serverID int) error {
	if rt.Store.SQL == nil {
		return apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	var found int
	return rt.Store.SQL.QueryRow(c.UserContext(), `SELECT 1 FROM servers WHERE id = $1 LIMIT 1`, strconv.Itoa(serverID)).Scan(&found)
}

func sqlInternalUserIDsForDiscordMembers(c *fiber.Ctx, rt apptypes.Deps, memberIDs []string, out map[string]string) ([]string, error) {
	if rt.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT user_id, discord_user_id
		FROM auth_users
		WHERE discord_user_id = ANY($1)
	`, memberIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	internalIDs := []string{}
	for rows.Next() {
		var userID, discordID string
		if err := rows.Scan(&userID, &discordID); err != nil {
			return nil, err
		}
		if userID != "" && discordID != "" {
			out[userID] = discordID
			internalIDs = append(internalIDs, userID)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return internalIDs, nil
}

func sqlPlayerLinksByUsers(c *fiber.Ctx, rt apptypes.Deps, userIDs []string) ([]map[string]any, error) {
	if rt.Store.SQL == nil {
		return nil, apptypes.Error(fiber.StatusServiceUnavailable, "SQL store is not configured")
	}
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT user_id, discord_id, tag, is_verified, added_at
		FROM player_links
		WHERE user_id = ANY($1) OR discord_id = ANY($1)
		ORDER BY order_index ASC, added_at ASC
	`, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	links := []map[string]any{}
	for rows.Next() {
		var userID, discordID *string
		var tag string
		var verified bool
		var addedAt time.Time
		if err := rows.Scan(&userID, &discordID, &tag, &verified, &addedAt); err != nil {
			return nil, err
		}
		linkUserID := ""
		if userID != nil {
			linkUserID = *userID
		} else if discordID != nil {
			linkUserID = *discordID
		}
		links = append(links, map[string]any{
			"user_id":     linkUserID,
			"player_tag":  tag,
			"is_verified": verified,
			"added_at":    addedAt,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return links, nil
}

func sqlPlayerStatsByTags(c *fiber.Ctx, rt apptypes.Deps, tags []string) ([]map[string]any, error) {
	if len(tags) == 0 {
		return nil, nil
	}
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT player_tag, name, townhall_level, data
		FROM player_current_stats
		WHERE player_tag = ANY($1)
	`, tags)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var tag, name string
		var townhall *int
		var raw []byte
		if err := rows.Scan(&tag, &name, &townhall, &raw); err != nil {
			return nil, err
		}
		doc := map[string]any{}
		_ = json.Unmarshal(raw, &doc)
		doc["tag"] = tag
		doc["name"] = name
		if townhall != nil {
			doc["townhall"] = *townhall
			doc["town_hall"] = *townhall
		}
		out = append(out, doc)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
