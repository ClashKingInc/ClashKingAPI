package routes

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// rosterQueryServerID extracts server_id from query param (int).
func rosterQueryServerID(c *fiber.Ctx) (int64, error) {
	raw := c.Query("server_id")
	if raw == "" {
		return 0, apptypes.Error(http.StatusBadRequest, "server_id is required")
	}
	v, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, apptypes.Error(http.StatusBadRequest, "invalid server_id")
	}
	return v, nil
}

// rosterNormalizeTag normalizes a player tag to #TAG format.
func rosterNormalizeTag(tag string) string {
	for range 2 {
		decoded, err := url.PathUnescape(tag)
		if err != nil || decoded == tag {
			break
		}
		tag = decoded
	}
	tag = strings.ToUpper(strings.TrimSpace(strings.TrimPrefix(tag, "#")))
	if tag == "" {
		return ""
	}
	return "#" + tag
}

// rosterGenID generates compact identifiers for legacy non-roster resources
// such as roster groups and automation rules.
func rosterGenID() string {
	return strings.ReplaceAll(uuid.New().String(), "-", "")[:12]
}

// createRoster godoc
// @Summary Create roster
// @Description Creates a new roster for a Discord server.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query int true "Discord server ID"
// @Param body body modelsv2.CreateRosterRequest true "Roster"
// @Success 201 {object} modelsv2.RosterMutationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Router /v2/roster [post]
func createRoster(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		body["server_id"] = serverID
		body["created_at"] = time.Now().UTC()
		body["updated_at"] = time.Now().UTC()
		if _, ok := body["members"]; !ok {
			body["members"] = []any{}
		}
		rosterID, err := rosterSave(c, a, body)
		if err != nil {
			return err
		}
		created, err := rosterGet(c, a, rosterID.String(), &serverID)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusCreated, map[string]any{
			"message":   "Roster created successfully",
			"roster_id": rosterID,
			"roster":    sanitize(created),
		})
	}
}

// getMissingMembers godoc
// @Summary Get missing members
// @Description Identifies clan members not yet registered in a roster.
// @Tags Rosters
// @Produce json
// @Param server_id query int true "Discord server ID"
// @Param roster_id query string false "Roster ID"
// @Param group_id query string false "Group ID"
// @Success 200 {object} modelsv2.MissingRosterMembersResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster/missing-members [get]
func getMissingMembers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Query("roster_id")
		groupID := c.Query("group_id")
		if rosterID == "" && groupID == "" {
			return apptypes.Error(http.StatusBadRequest, "Must provide roster_id or group_id")
		}
		filter := rosterFilter{serverID: &serverID}
		if rosterID != "" {
			filter.id = rosterID
		} else {
			filter.groupID = groupID
		}
		rosters, err := rosterList(c, a, filter)
		if err != nil {
			return err
		}
		if len(rosters) == 0 {
			return apptypes.Error(http.StatusNotFound, "No rosters found")
		}
		results := make([]map[string]any, 0, len(rosters))
		for _, roster := range rosters {
			clanTag, _ := roster["clan_tag"].(string)
			members, _ := roster["members"].([]any)
			memberTags := make(map[string]bool, len(members))
			for _, m := range members {
				if mmap, ok := m.(map[string]any); ok {
					if tag, ok := mmap["tag"].(string); ok {
						memberTags[tag] = true
					}
				}
			}
			var clanMembers []map[string]any
			if clanTag != "" && a.Clash != nil {
				if clan, err := a.Clash.GetClan(c.UserContext(), clanTag); err == nil && clan != nil {
					for _, m := range clan.Members {
						if !memberTags[m.Tag] {
							clanMembers = append(clanMembers, map[string]any{
								"tag":      m.Tag,
								"name":     m.Name,
								"role":     m.Role,
								"trophies": m.Trophies,
							})
						}
					}
				}
			}
			results = append(results, map[string]any{
				"roster_id":       roster["id"],
				"roster_alias":    roster["alias"],
				"clan_tag":        clanTag,
				"missing_members": clanMembers,
				"missing_count":   len(clanMembers),
			})
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"query_type":            map[bool]string{true: "roster", false: "group"}[rosterID != ""],
			"query_value":           map[bool]string{true: rosterID, false: groupID}[rosterID != ""],
			"server_id":             rosterServerIDText(serverID),
			"results":               results,
			"total_rosters_checked": len(results),
		})
	}
}

// updateRoster godoc
// @Summary Update roster
// @Description Updates roster settings.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Param server_id query int true "Discord server ID"
// @Param body body modelsv2.UpdateRosterRequest true "Roster fields"
// @Success 200 {object} modelsv2.RosterMutationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster/{roster_id} [patch]
func updateRoster(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if len(body) == 0 {
			return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Nothing to update"})
		}
		body["updated_at"] = time.Now().UTC()
		delete(body, "id")
		delete(body, "server_id")
		updated, err := rosterUpdate(c, a, rosterID, serverID, body)
		if err != nil {
			return notFoundErr(err, "Roster not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Roster updated", "roster": sanitize(updated)})
	}
}

// getRoster godoc
// @Summary Get roster
// @Description Returns a specific roster by ID.
// @Tags Rosters
// @Produce json
// @Param roster_id path string true "Roster ID"
// @Param server_id query int true "Discord server ID"
// @Success 200 {object} modelsv2.RosterResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster/{roster_id} [get]
func getRoster(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		doc, err := rosterGet(c, a, rosterID, &serverID)
		if err != nil {
			return notFoundErr(err, "Roster not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"roster": sanitize(doc)})
	}
}

// deleteRoster godoc
// @Summary Delete roster
// @Description Permanently deletes a roster.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Param server_id query int true "Discord server ID"
// @Success 200 {object} modelsv2.MessageResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster/{roster_id} [delete]
func deleteRoster(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		if c.QueryBool("members_only") {
			doc, err := rosterGet(c, a, rosterID, &serverID)
			if err != nil {
				return notFoundErr(err, "Roster not found")
			}
			doc["members"] = []any{}
			doc["updated_at"] = time.Now().UTC()
			if _, err := rosterSave(c, a, doc); err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Roster members cleared"})
		}
		deleted, err := rosterDelete(c, a, rosterID, serverID)
		if err != nil {
			return err
		}
		if deleted == 0 {
			return apptypes.Error(http.StatusNotFound, "Roster not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Roster deleted successfully"})
	}
}

// removeRosterMember godoc
// @Summary Remove roster member
// @Description Removes a player from a roster.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Param player_tag path string true "Player tag"
// @Success 200 {object} modelsv2.MessageResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster/{roster_id}/members/{player_tag} [delete]
func removeRosterMember(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		tag := rosterNormalizeTag(c.Params("player_tag"))
		doc, err := rosterGet(c, a, rosterID, &serverID)
		if err != nil {
			return notFoundErr(err, "Roster not found")
		}
		members := rosterMemberList(doc["members"])
		filtered := make([]any, 0, len(members))
		for _, member := range members {
			if serverAsString(member["tag"]) == tag {
				continue
			}
			filtered = append(filtered, member)
		}
		doc["members"] = filtered
		doc["updated_at"] = time.Now().UTC()
		if _, err := rosterSave(c, a, doc); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Member removed from roster"})
	}
}

// refreshRosters godoc
// @Summary Refresh rosters
// @Description Refreshes member data from CoC API for one or more rosters.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query int false "Discord server ID"
// @Param group_id query string false "Group ID"
// @Param roster_id query string false "Roster ID"
// @Success 200 {object} modelsv2.RosterRefreshResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Router /v2/roster/refresh [post]
func refreshRosters(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Query("roster_id")
		groupID := c.Query("group_id")
		filter := rosterFilter{serverID: &serverID}
		if rosterID != "" {
			filter.id = rosterID
		} else if groupID != "" {
			filter.groupID = groupID
		}
		rosters, err := rosterList(c, a, filter)
		if err != nil {
			return err
		}
		for _, roster := range rosters {
			members := rosterMemberList(roster["members"])
			for _, member := range members {
				rosterHydrateMember(c, a, member)
			}
			roster["members"] = rosterMembersAny(members)
			roster["updated_at"] = time.Now().UTC()
			if _, err := rosterSave(c, a, roster); err != nil {
				return err
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"message":           "Refreshed " + strconv.Itoa(len(rosters)) + " roster(s)",
			"refreshed_rosters": sanitize(rosters),
		})
	}
}

// cloneRoster godoc
// @Summary Clone roster
// @Description Creates a copy of an existing roster.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Source roster ID"
// @Param server_id query int true "Target Discord server ID"
// @Param body body modelsv2.RosterCloneRequest true "Clone options"
// @Success 201 {object} modelsv2.RosterCloneResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster/{roster_id}/clone [post]
func cloneRoster(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		var body struct {
			NewAlias    string `json:"new_alias"`
			CopyMembers bool   `json:"copy_members"`
		}
		_ = apptypes.DecodeJSON(c, &body)
		src, err := rosterGet(c, a, rosterID, nil)
		if err != nil {
			return notFoundErr(err, "Source roster not found")
		}
		if err := authorizeDiscordServerAccess(c, a, serverAsString(src["server_id"]), true); err != nil {
			return err
		}
		cloned := make(map[string]any, len(src))
		for k, v := range src {
			cloned[k] = v
		}
		delete(cloned, "id")
		cloned["server_id"] = serverID
		cloned["created_at"] = time.Now().UTC()
		cloned["updated_at"] = time.Now().UTC()
		if body.NewAlias != "" {
			cloned["alias"] = body.NewAlias
		}
		if !body.CopyMembers {
			cloned["members"] = []any{}
		}
		newRosterID, err := rosterSave(c, a, cloned)
		if err != nil {
			return err
		}
		created, err := rosterGet(c, a, newRosterID.String(), &serverID)
		if err != nil {
			return err
		}
		memberCount := 0
		if members, ok := cloned["members"].([]any); ok {
			memberCount = len(members)
		}
		return apptypes.JSON(c, http.StatusCreated, map[string]any{
			"message":          "Roster cloned successfully",
			"new_roster_id":    newRosterID,
			"new_alias":        cloned["alias"],
			"target_server_id": rosterServerIDText(serverID),
			"source_server_id": src["server_id"],
			"members_copied":   memberCount,
			"roster":           sanitize(created),
		})
	}
}

// listRosters godoc
// @Summary List rosters
// @Description Returns all rosters for a Discord server.
// @Tags Rosters
// @Produce json
// @Param server_id path int true "Discord server ID"
// @Param group_id query string false "Filter by group"
// @Param clan_tag query string false "Filter by clan"
// @Success 200 {object} modelsv2.RosterListResponse
// @Router /v2/roster/{server_id}/list [get]
func listRosters(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverIDRaw := c.Params("server_id")
		serverID, err := strconv.ParseInt(serverIDRaw, 10, 64)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "invalid server_id")
		}
		filter := rosterFilter{serverID: &serverID}
		if groupID := c.Query("group_id"); groupID != "" {
			filter.groupID = groupID
		}
		if clanTag := c.Query("clan_tag"); clanTag != "" {
			filter.clanTag = clanTag
		}
		rosters, err := rosterList(c, a, filter)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"rosters": sanitize(rosters),
			"count":   len(rosters),
		})
	}
}

// createRosterGroup godoc
// @Summary Create roster group
// @Description Creates a new roster group.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query int true "Discord server ID"
// @Param body body modelsv2.RosterGroupRequest true "Roster group"
// @Success 201 {object} modelsv2.RosterGroupMutationResponse
// @Failure 400 {object} modelsv2.ErrorResponse
// @Router /v2/roster-group [post]
func createRosterGroup(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		body["server_id"] = serverID
		body["group_id"] = rosterGenID()
		body["created_at"] = time.Now().UTC()
		body["updated_at"] = time.Now().UTC()
		if err := rosterGroupSave(c, a, body); err != nil {
			return err
		}
		created, err := rosterGroupGet(c, a, serverAsString(body["group_id"]), &serverID)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusCreated, map[string]any{
			"message":  "Roster group created",
			"group_id": body["group_id"],
			"group":    sanitize(created),
		})
	}
}

// listRosterGroups godoc
// @Summary List roster groups
// @Description Returns roster groups for a server.
// @Tags Rosters
// @Produce json
// @Param server_id query int true "Discord server ID"
// @Success 200 {object} modelsv2.RosterGroupListResponse
// @Router /v2/roster-group/list [get]
func listRosterGroups(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		groups, err := rosterGroups(c, a, &serverID, "")
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(groups), "count": len(groups)})
	}
}

// getRosterGroup godoc
// @Summary Get roster group
// @Description Returns a specific roster group.
// @Tags Rosters
// @Produce json
// @Param group_id path string true "Group ID"
// @Success 200 {object} modelsv2.RosterGroupResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster-group/{group_id} [get]
func getRosterGroup(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		groupID := c.Params("group_id")
		doc, err := rosterGroupGet(c, a, groupID, &serverID)
		if err != nil {
			return notFoundErr(err, "Roster group not found")
		}
		rosters, _ := rosterList(c, a, rosterFilter{groupID: groupID, serverID: &serverID})
		doc["rosters"] = sanitize(rosters)
		return apptypes.JSON(c, http.StatusOK, map[string]any{"group": sanitize(doc)})
	}
}

// updateRosterGroup godoc
// @Summary Update roster group
// @Description Updates a roster group.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param group_id path string true "Group ID"
// @Param server_id query int true "Discord server ID"
// @Param body body modelsv2.RosterGroupRequest true "Roster group fields"
// @Success 200 {object} modelsv2.RosterGroupMutationResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster-group/{group_id} [patch]
func updateRosterGroup(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		groupID := c.Params("group_id")
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		delete(body, "group_id")
		delete(body, "server_id")
		updated, err := rosterGroupGet(c, a, groupID, &serverID)
		if err != nil {
			return notFoundErr(err, "Roster group not found")
		}
		for k, v := range body {
			updated[k] = v
		}
		updated["updated_at"] = time.Now().UTC()
		if err := rosterGroupSave(c, a, updated); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Group updated", "group": sanitize(updated)})
	}
}

// deleteRosterGroup godoc
// @Summary Delete roster group
// @Description Deletes a roster group.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param group_id path string true "Group ID"
// @Param server_id query int true "Discord server ID"
// @Success 200 {object} modelsv2.RosterGroupDeleteResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster-group/{group_id} [delete]
func deleteRosterGroup(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		groupID := c.Params("group_id")
		group, err := rosterGroupGet(c, a, groupID, &serverID)
		if err != nil {
			return notFoundErr(err, "Roster group not found")
		}
		_ = group
		cmd, err := a.Store.SQL.Exec(c.UserContext(), `
			UPDATE rosters
			SET group_id = NULL,
			    updated_at = now()
			WHERE group_id = $1 AND server_id = $2
		`, groupID, rosterServerIDText(serverID))
		if err != nil {
			return err
		}
		if _, err := a.Store.SQL.Exec(c.UserContext(), `
			DELETE FROM roster_automation_rules
			WHERE group_id = $1 AND server_id = $2
		`, groupID, rosterServerIDText(serverID)); err != nil {
			return err
		}
		if _, err := a.Store.SQL.Exec(c.UserContext(), `
			DELETE FROM roster_groups
			WHERE group_id = $1 AND server_id = $2
		`, groupID, rosterServerIDText(serverID)); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"message":          "Roster group deleted successfully",
			"affected_rosters": cmd.RowsAffected(),
		})
	}
}

// manageRosterMembers godoc
// @Summary Manage roster members
// @Description Adds or updates members in a roster.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Param body body modelsv2.RosterMembersRequest true "Roster member operation"
// @Success 200 {object} modelsv2.MessageResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster/{roster_id}/members [post]
func manageRosterMembers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		var body struct {
			Members    []map[string]any `json:"members"`
			Add        []map[string]any `json:"add"`
			Operation  string           `json:"operation"` // "add" | "remove" | "update"
			PlayerTags []string         `json:"player_tags"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		existing, err := rosterGet(c, a, rosterID, &serverID)
		if err != nil {
			return notFoundErr(err, "Roster not found")
		}
		members := rosterMemberList(existing["members"])
		if len(body.Members) == 0 && len(body.Add) > 0 {
			body.Members = body.Add
		}

		switch body.Operation {
		case "remove":
			removeTags := map[string]struct{}{}
			for _, t := range body.PlayerTags {
				removeTags[rosterNormalizeTag(t)] = struct{}{}
			}
			kept := make([]any, 0, len(members))
			for _, member := range members {
				if _, ok := removeTags[serverAsString(member["tag"])]; ok {
					continue
				}
				kept = append(kept, member)
			}
			existing["members"] = kept
		default: // "add" or unspecified
			for _, m := range body.Members {
				rosterHydrateMember(c, a, m)
				m["added_at"] = time.Now().UTC()
				members = append(members, m)
			}
			existing["members"] = rosterMembersAny(members)
		}
		existing["updated_at"] = time.Now().UTC()
		if _, err := rosterSave(c, a, existing); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Members updated"})
	}
}

// updateRosterMember godoc
// @Summary Update roster member
// @Description Updates a single member's data in a roster.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Param member_tag path string true "Player tag"
// @Param body body modelsv2.RosterMemberUpdateRequest true "Roster member fields"
// @Success 200 {object} modelsv2.MessageResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster/{roster_id}/members/{member_tag} [patch]
func updateRosterMember(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		memberTag := rosterNormalizeTag(c.Params("member_tag"))
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		doc, err := rosterGet(c, a, rosterID, &serverID)
		if err != nil {
			return notFoundErr(err, "Roster not found")
		}
		members := rosterMemberList(doc["members"])
		found := false
		for _, member := range members {
			if serverAsString(member["tag"]) != memberTag {
				continue
			}
			for k, v := range body {
				member[k] = v
			}
			found = true
		}
		if !found {
			return apptypes.Error(http.StatusNotFound, "Member not found in roster")
		}
		doc["members"] = rosterMembersAny(members)
		doc["updated_at"] = time.Now().UTC()
		if _, err := rosterSave(c, a, doc); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Member updated"})
	}
}

// refreshRosterMember godoc
// @Summary Refresh roster member
// @Description Refreshes a single member's data from the CoC API.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Param member_tag path string true "Player tag"
// @Success 200 {object} modelsv2.RosterMemberResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster/{roster_id}/members/{member_tag}/refresh [post]
func refreshRosterMember(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		memberTag := rosterNormalizeTag(c.Params("member_tag"))
		doc, err := rosterGet(c, a, rosterID, &serverID)
		if err != nil {
			return notFoundErr(err, "Roster not found")
		}
		members := rosterMemberList(doc["members"])
		found := false
		var refreshed map[string]any
		for _, member := range members {
			if serverAsString(member["tag"]) != memberTag {
				continue
			}
			rosterHydrateMember(c, a, member)
			refreshed = member
			found = true
		}
		if !found {
			return apptypes.Error(http.StatusNotFound, "Member not found in roster")
		}
		doc["members"] = rosterMembersAny(members)
		doc["updated_at"] = time.Now().UTC()
		if _, err := rosterSave(c, a, doc); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Member refreshed", "member": sanitize(refreshed)})
	}
}

// createRosterAutomation godoc
// @Summary Create roster automation
// @Description Creates a new automation rule for rosters.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query int true "Discord server ID"
// @Param body body modelsv2.RosterAutomationRequest true "Automation rule"
// @Success 201 {object} modelsv2.RosterAutomationMutationResponse
// @Router /v2/roster-automation [post]
func createRosterAutomation(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		body["server_id"] = serverID
		body["automation_id"] = rosterGenID()
		body["active"] = true
		body["executed"] = false
		body["created_at"] = time.Now().UTC()
		body["updated_at"] = time.Now().UTC()
		if err := rosterAutomationSave(c, a, body); err != nil {
			return err
		}
		created, err := rosterAutomationList(c, a, serverID, "", "", false)
		if err != nil {
			return err
		}
		var rule map[string]any
		for _, item := range created {
			if serverAsString(item["automation_id"]) == serverAsString(body["automation_id"]) {
				rule = item
				break
			}
		}
		if rule == nil {
			return apptypes.Error(http.StatusInternalServerError, "Created automation rule could not be loaded")
		}
		return apptypes.JSON(c, http.StatusCreated, map[string]any{
			"message":       "Automation rule created",
			"automation_id": body["automation_id"],
			"rule":          sanitize(rule),
		})
	}
}

// listRosterAutomation godoc
// @Summary List roster automation
// @Description Returns all automation rules for a server.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query int true "Discord server ID"
// @Success 200 {object} modelsv2.RosterAutomationListResponse
// @Router /v2/roster-automation/list [get]
func listRosterAutomation(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Query("roster_id")
		groupID := c.Query("group_id")
		activeOnly := true
		if raw := c.Query("active_only"); raw != "" {
			parsed, parseErr := strconv.ParseBool(raw)
			if parseErr != nil {
				return apptypes.Error(http.StatusBadRequest, "invalid active_only")
			}
			activeOnly = parsed
		}
		rules, err := rosterAutomationList(c, a, serverID, rosterID, groupID, activeOnly)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"items":     sanitize(rules),
			"rules":     sanitize(rules),
			"count":     len(rules),
			"server_id": rosterServerIDText(serverID),
			"roster_id": c.Query("roster_id"),
			"group_id":  c.Query("group_id"),
		})
	}
}

// updateRosterAutomation godoc
// @Summary Update roster automation
// @Description Updates an automation rule.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param automation_id path string true "Automation ID"
// @Param server_id query int true "Discord server ID"
// @Param body body modelsv2.RosterAutomationRequest true "Automation fields"
// @Success 200 {object} modelsv2.RosterAutomationMutationResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster-automation/{automation_id} [patch]
func updateRosterAutomation(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		automationID := c.Params("automation_id")
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		delete(body, "automation_id")
		delete(body, "server_id")
		body["updated_at"] = time.Now().UTC()
		existing, err := rosterAutomationList(c, a, serverID, "", "", false)
		if err != nil {
			return err
		}
		var updated map[string]any
		for _, item := range existing {
			if serverAsString(item["automation_id"]) == automationID {
				updated = item
				break
			}
		}
		if updated == nil {
			return apptypes.Error(http.StatusNotFound, "Automation rule not found")
		}
		for k, v := range body {
			updated[k] = v
		}
		if err := rosterAutomationSave(c, a, updated); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Automation updated", "rule": sanitize(updated)})
	}
}

// deleteRosterAutomation godoc
// @Summary Delete roster automation
// @Description Deletes an automation rule.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param automation_id path string true "Automation ID"
// @Param server_id query int true "Discord server ID"
// @Success 200 {object} modelsv2.MessageResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster-automation/{automation_id} [delete]
func deleteRosterAutomation(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		automationID := c.Params("automation_id")
		cmd, err := a.Store.SQL.Exec(c.UserContext(), `
			DELETE FROM roster_automation_rules
			WHERE automation_id = $1 AND server_id = $2
		`, automationID, rosterServerIDText(serverID))
		if err != nil {
			return err
		}
		if cmd.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Automation rule not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Automation rule deleted"})
	}
}

// getServerClanMembers godoc
// @Summary Get server clan members
// @Description Returns all clan members for all clans linked to a server.
// @Tags Rosters
// @Produce json
// @Param server_id path int true "Discord server ID"
// @Success 200 {object} modelsv2.ServerClanMembersResponse
// @Router /v2/roster/server/{server_id}/members [get]
func getServerClanMembers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverIDRaw := c.Params("server_id")
		serverID, err := strconv.ParseInt(serverIDRaw, 10, 64)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "invalid server_id")
		}
		clans, err := serverClans(c, a, serverID)
		if err != nil {
			return err
		}
		if len(clans) == 0 {
			return apptypes.JSON(c, http.StatusOK, map[string]any{"members": []any{}})
		}
		members := make([]map[string]any, 0)
		for _, clan := range clans {
			tag, _ := clan["tag"].(string)
			if tag == "" || a.Clash == nil {
				continue
			}
			if clanData, err := a.Clash.GetClan(c.UserContext(), tag); err == nil && clanData != nil {
				for _, m := range clanData.Members {
					members = append(members, map[string]any{
						"tag":       m.Tag,
						"name":      m.Name,
						"clan_tag":  tag,
						"clan_name": clanData.Name,
						"role":      m.Role,
						"trophies":  m.Trophies,
					})
				}
			}
		}
		sort.SliceStable(members, func(i, j int) bool {
			return strings.ToLower(serverAsString(members[i]["name"])) < strings.ToLower(serverAsString(members[j]["name"]))
		})
		return apptypes.JSON(c, http.StatusOK, map[string]any{"members": members, "count": len(members)})
	}
}

type rosterFilter struct {
	serverID *int64
	id       string
	groupID  string
	clanTag  string
}

func rosterServerIDText(serverID int64) string {
	return strconv.FormatInt(serverID, 10)
}

func parseRosterUUIDs(values []string) ([]uuid.UUID, error) {
	ids := make([]uuid.UUID, 0, len(values))
	for _, value := range values {
		id, err := uuid.Parse(value)
		if err != nil {
			return nil, apptypes.Error(http.StatusBadRequest, "invalid roster_id")
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func rosterOptionalString(value any) string {
	if value == nil {
		return ""
	}
	return serverAsString(value)
}

func rosterMemberList(value any) []map[string]any {
	raw, ok := value.([]any)
	if !ok {
		return []map[string]any{}
	}
	members := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if member, ok := item.(map[string]any); ok {
			members = append(members, member)
		}
	}
	return members
}

func rosterMembersAny(members []map[string]any) []any {
	out := make([]any, 0, len(members))
	for _, member := range members {
		out = append(out, member)
	}
	return out
}

func rosterStringDefault(value any, fallback string) string {
	if out := serverAsString(value); out != "" {
		return out
	}
	return fallback
}

func rosterNullableInt(value any) *int {
	if value == nil || serverAsString(value) == "" {
		return nil
	}
	out := activityAsInt(value)
	return &out
}

func rosterNullableInt64(value any) *int64 {
	if value == nil || serverAsString(value) == "" {
		return nil
	}
	var out int64
	switch typed := value.(type) {
	case int64:
		out = typed
	case int:
		out = int64(typed)
	case float64:
		out = int64(typed)
	default:
		parsed, err := strconv.ParseInt(serverAsString(value), 10, 64)
		if err != nil {
			return nil
		}
		out = parsed
	}
	return &out
}

func rosterNullableTime(value any) *time.Time {
	if value == nil {
		return nil
	}
	switch typed := value.(type) {
	case time.Time:
		out := typed.UTC()
		return &out
	case *time.Time:
		return typed
	case int64:
		out := time.Unix(typed, 0).UTC()
		return &out
	case int:
		out := time.Unix(int64(typed), 0).UTC()
		return &out
	case float64:
		out := time.Unix(int64(typed), 0).UTC()
		return &out
	default:
		parsed, err := time.Parse(time.RFC3339, serverAsString(value))
		if err != nil {
			return nil
		}
		return &parsed
	}
}

func rosterNullableFloat(value any) *float64 {
	if value == nil || serverAsString(value) == "" {
		return nil
	}
	var out float64
	switch typed := value.(type) {
	case float64:
		out = typed
	case int:
		out = float64(typed)
	case int64:
		out = float64(typed)
	default:
		parsed, err := strconv.ParseFloat(serverAsString(value), 64)
		if err != nil {
			return nil
		}
		out = parsed
	}
	return &out
}

func rosterAnySlice(value any) []any {
	switch typed := value.(type) {
	case []any:
		return typed
	case []string:
		out := make([]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, item)
		}
		return out
	default:
		return []any{}
	}
}

func rosterStringSlice(value any) []string {
	out := []string{}
	for _, raw := range rosterAnySlice(value) {
		if item := strings.TrimSpace(serverAsString(raw)); item != "" {
			out = append(out, item)
		}
	}
	return out
}

func rosterSortConfiguration(value any) ([]map[string]string, error) {
	items := rosterAnySlice(value)
	if len(items) > 5 {
		return nil, apptypes.Error(http.StatusBadRequest, "A roster can have at most five sort fields")
	}
	out := make([]map[string]string, 0, len(items))
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			return nil, apptypes.Error(http.StatusBadRequest, "Roster sort fields require columnId and direction")
		}
		columnID, direction := strings.TrimSpace(serverAsString(item["columnId"])), strings.TrimSpace(serverAsString(item["direction"]))
		if !regexp.MustCompile(`^[a-z][a-z0-9_]{0,47}$`).MatchString(columnID) || (direction != "asc" && direction != "desc") {
			return nil, apptypes.Error(http.StatusBadRequest, "Roster sort fields require a stable columnId and asc or desc direction")
		}
		out = append(out, map[string]string{"columnId": columnID, "direction": direction})
	}
	return out, nil
}

func rosterBoolPtrMaybe(value any) *bool {
	if value == nil {
		return nil
	}
	switch typed := value.(type) {
	case bool:
		return &typed
	case string:
		parsed, err := strconv.ParseBool(typed)
		if err == nil {
			return &parsed
		}
	}
	return nil
}

func rosterBoolDefault(value any, fallback bool) bool {
	if parsed := rosterBoolPtrMaybe(value); parsed != nil {
		return *parsed
	}
	return fallback
}

func rosterLoadMembers(c *fiber.Ctx, a apptypes.Deps, rosterID uuid.UUID) []any {
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT tag, name, townhall, trophies, current_clan_name, current_clan_tag,
		       league_id, league_name, hero_level_sum, max_percent,
		       war_preference, discord_user_id, discord_username,
		       discord_avatar_url, last_online, refreshed_at, signup_answers
		FROM roster_members WHERE roster_id = $1 ORDER BY position, tag
	`, rosterID)
	if err != nil {
		return []any{}
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var tag, name string
		var townhall, heroLevelSum int
		var trophies, leagueID *int
		var currentClanName, currentClanTag, leagueName *string
		var discordUserID, discordUsername, discordAvatarURL *string
		var maxPercent *float64
		var warPreference *bool
		var lastOnline, refreshedAt *time.Time
		var answersRaw []byte
		if rows.Scan(&tag, &name, &townhall, &trophies, &currentClanName, &currentClanTag,
			&leagueID, &leagueName, &heroLevelSum, &maxPercent,
			&warPreference, &discordUserID, &discordUsername,
			&discordAvatarURL, &lastOnline, &refreshedAt, &answersRaw) != nil {
			continue
		}
		item := map[string]any{"tag": tag, "name": name, "townhall": townhall}
		var answers any
		_ = json.Unmarshal(answersRaw, &answers)
		item["hero_level_sum"], item["answers"] = heroLevelSum, answers
		rosterPutOptional(item, "discord", discordUserID)
		rosterPutOptional(item, "discord_username", discordUsername)
		rosterPutOptional(item, "discord_avatar_url", discordAvatarURL)
		rosterPutOptional(item, "current_clan", currentClanName)
		rosterPutOptional(item, "current_clan_tag", currentClanTag)
		rosterPutOptional(item, "war_pref", warPreference)
		rosterPutOptional(item, "trophies", trophies)
		rosterPutOptional(item, "league_id", leagueID)
		rosterPutOptional(item, "league_name", leagueName)
		rosterPutOptional(item, "max_percent", maxPercent)
		rosterPutOptional(item, "last_online", lastOnline)
		rosterPutOptional(item, "refreshed_at", refreshedAt)
		out = append(out, item)
	}
	return out
}

func rosterPutOptional(target map[string]any, key string, value any) {
	switch typed := value.(type) {
	case *string:
		if typed != nil {
			target[key] = *typed
		}
	case *int:
		if typed != nil {
			target[key] = *typed
		}
	case *int64:
		if typed != nil {
			target[key] = *typed
		}
	case *float64:
		if typed != nil {
			target[key] = *typed
		}
	case *bool:
		if typed != nil {
			target[key] = *typed
		}
	case *time.Time:
		if typed != nil {
			target[key] = *typed
		}
	}
}

func rosterHydrateMember(c *fiber.Ctx, a apptypes.Deps, member map[string]any) {
	tag := rosterNormalizeTag(serverAsString(member["tag"]))
	if tag == "" {
		return
	}
	member["tag"] = tag
	if a.Clash == nil {
		return
	}
	player, err := a.Clash.GetPlayer(c.UserContext(), tag)
	if err != nil || player == nil {
		return
	}
	member["name"] = player.Name
	member["townhall"] = player.TownHall
	member["trophies"] = player.Trophies
	member["hero_level_sum"] = rosterHeroLevelSum(player.Heroes)
	if maxPercent, maxPercentErr := calculateRosterMaxPercent(player); maxPercentErr == nil {
		member["max_percent"] = maxPercent
	}
	member["refreshed_at"] = time.Now().UTC()
	if player.Clan != nil {
		member["current_clan"] = player.Clan.Name
		member["current_clan_tag"] = player.Clan.Tag
	} else {
		member["current_clan"] = ""
		member["current_clan_tag"] = ""
	}
	if player.LeagueTier.ID != 0 || player.LeagueTier.Name != "" {
		member["league_id"] = player.LeagueTier.ID
		member["league_name"] = player.LeagueTier.Name
	}
}

func rosterSave(c *fiber.Ctx, a apptypes.Deps, doc map[string]any) (uuid.UUID, error) {
	rosterID, err := uuid.Parse(serverAsString(doc["id"]))
	if err != nil {
		rosterID, err = uuid.NewV7()
		if err != nil {
			return uuid.Nil, err
		}
	}
	serverID := serverAsString(doc["server_id"])
	groupID := rosterOptionalString(doc["group_id"])
	clanTag := rosterOptionalString(doc["clan_tag"])
	alias := rosterOptionalString(doc["alias"])
	displayColumnIDs := rosterStringSlice(doc["columns"])
	if len(displayColumnIDs) > 24 {
		return uuid.Nil, apptypes.Error(http.StatusBadRequest, "A roster can have at most 24 display columns")
	}
	for _, columnID := range displayColumnIDs {
		if !regexp.MustCompile(`^[a-z][a-z0-9_]{0,47}$`).MatchString(columnID) {
			return uuid.Nil, apptypes.Error(http.StatusBadRequest, "Roster columns require stable lowercase IDs")
		}
	}
	sortConfiguration, err := rosterSortConfiguration(doc["sort"])
	if err != nil {
		return uuid.Nil, err
	}
	webhookID, messageID := rosterOptionalString(doc["webhook_id"]), rosterOptionalString(doc["message_id"])
	if (webhookID == "") != (messageID == "") {
		return uuid.Nil, apptypes.Error(http.StatusBadRequest, "webhook_id and message_id must be set or cleared together")
	}
	if webhookID != "" {
		if _, err := strconv.ParseUint(webhookID, 10, 64); err != nil {
			return uuid.Nil, apptypes.Error(http.StatusBadRequest, "webhook_id must be a Discord ID")
		}
		if _, err := strconv.ParseUint(messageID, 10, 64); err != nil {
			return uuid.Nil, apptypes.Error(http.StatusBadRequest, "message_id must be a Discord ID")
		}
	}
	tx, err := a.Store.SQL.Begin(c.UserContext())
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(c.UserContext())
	err = tx.QueryRow(c.UserContext(), `
		INSERT INTO rosters (
			id, server_id, group_id, clan_tag, alias, description,
			roster_type, signup_scope, min_townhall, max_townhall,
			min_signups, max_accounts_per_user, display_column_ids, sort_configuration,
			webhook_id, message_id,
			image_url, event_start_time,
			recurrence_days, recurrence_day_of_month, created_at, updated_at
		)
		VALUES (
			$1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, NULLIF($6, ''),
			$7, $8, $9, $10, $11, $12, $13, $14::jsonb,
			NULLIF($15, ''), NULLIF($16, ''),
			NULLIF($17, ''), $18, $19, $20,
			COALESCE($21, now()), COALESCE($22, now())
		)
		ON CONFLICT (id) DO UPDATE SET
			server_id = EXCLUDED.server_id,
			group_id = EXCLUDED.group_id,
			clan_tag = EXCLUDED.clan_tag,
			alias = EXCLUDED.alias,
			description = EXCLUDED.description,
			roster_type = EXCLUDED.roster_type,
			signup_scope = EXCLUDED.signup_scope,
			min_townhall = EXCLUDED.min_townhall,
			max_townhall = EXCLUDED.max_townhall,
			min_signups = EXCLUDED.min_signups,
			max_accounts_per_user = EXCLUDED.max_accounts_per_user,
			display_column_ids = EXCLUDED.display_column_ids,
			sort_configuration = EXCLUDED.sort_configuration,
			webhook_id = EXCLUDED.webhook_id,
			message_id = EXCLUDED.message_id,
			image_url = EXCLUDED.image_url,
			event_start_time = EXCLUDED.event_start_time,
			recurrence_days = EXCLUDED.recurrence_days,
			recurrence_day_of_month = EXCLUDED.recurrence_day_of_month,
			updated_at = EXCLUDED.updated_at,
			revision = rosters.revision + 1
		RETURNING id
	`, rosterID, serverID, groupID, clanTag, alias, rosterOptionalString(doc["description"]),
		rosterStringDefault(doc["roster_type"], "clan"), rosterStringDefault(doc["signup_scope"], "clan-only"),
		rosterNullableInt(doc["min_th"]), rosterNullableInt(doc["max_th"]),
		rosterNullableInt(doc["min_signups"]), rosterNullableInt(doc["max_accounts_per_user"]), displayColumnIDs, apptypes.Marshal(sortConfiguration),
		webhookID, messageID, rosterOptionalString(doc["image"]), rosterNullableInt64(doc["event_start_time"]),
		rosterNullableInt(doc["recurrence_days"]), rosterNullableInt(doc["recurrence_day_of_month"]), doc["created_at"], doc["updated_at"]).Scan(&rosterID)
	if err != nil {
		return uuid.Nil, err
	}
	if _, err := tx.Exec(c.UserContext(), `DELETE FROM roster_members WHERE roster_id = $1`, rosterID); err != nil {
		return uuid.Nil, err
	}
	for position, member := range rosterMemberList(doc["members"]) {
		tag := rosterNormalizeTag(serverAsString(member["tag"]))
		if tag == "" {
			continue
		}
		if _, err := tx.Exec(c.UserContext(), `
			INSERT INTO roster_members (
				roster_id, tag, name, townhall, trophies, current_clan_name,
				current_clan_tag, league_id, league_name, hero_level_sum, max_percent,
				war_preference, discord_user_id, discord_username,
				discord_avatar_url, last_online, refreshed_at,
				signup_answers, position
			) VALUES (
				$1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8,
				NULLIF($9, ''), $10, $11, $12,
				NULLIF($13, ''), NULLIF($14, ''), NULLIF($15, ''),
				$16, $17, $18, $19
			)
		`, rosterID, tag, rosterOptionalString(member["name"]), activityAsInt(member["townhall"]),
			rosterNullableInt(member["trophies"]), rosterOptionalString(member["current_clan"]), rosterOptionalString(member["current_clan_tag"]),
			rosterNullableInt(member["league_id"]), rosterOptionalString(member["league_name"]), activityAsInt(member["hero_level_sum"]),
			rosterNullableFloat(member["max_percent"]), rosterBoolPtrMaybe(member["war_pref"]), rosterOptionalString(member["discord"]), rosterOptionalString(member["discord_username"]),
			rosterOptionalString(member["discord_avatar_url"]), rosterNullableTime(member["last_online"]),
			rosterNullableTime(member["refreshed_at"]), rosterAnswersJSON(member["answers"]), position); err != nil {
			return uuid.Nil, err
		}
	}
	if err := tx.Commit(c.UserContext()); err != nil {
		return uuid.Nil, err
	}
	return rosterID, nil
}

func rosterAnswersJSON(value any) string {
	if value == nil {
		return "{}"
	}
	return apptypes.Marshal(value)
}

func rosterGet(c *fiber.Ctx, a apptypes.Deps, rosterID string, serverID *int64) (map[string]any, error) {
	filter := rosterFilter{id: rosterID, serverID: serverID}
	rows, err := rosterList(c, a, filter)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, pgx.ErrNoRows
	}
	return rows[0], nil
}

func rosterList(c *fiber.Ctx, a apptypes.Deps, filter rosterFilter) ([]map[string]any, error) {
	args := []any{}
	where := []string{"true"}
	if filter.serverID != nil {
		args = append(args, rosterServerIDText(*filter.serverID))
		where = append(where, "server_id = $"+strconv.Itoa(len(args)))
	}
	if filter.id != "" {
		id, err := uuid.Parse(filter.id)
		if err != nil {
			return nil, apptypes.Error(http.StatusBadRequest, "invalid roster_id")
		}
		args = append(args, id)
		where = append(where, "id = $"+strconv.Itoa(len(args)))
	}
	if filter.groupID != "" {
		args = append(args, filter.groupID)
		where = append(where, "group_id = $"+strconv.Itoa(len(args)))
	}
	if filter.clanTag != "" {
		args = append(args, filter.clanTag)
		where = append(where, "clan_tag = $"+strconv.Itoa(len(args)))
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT id, server_id, group_id, clan_tag, alias, description,
		       roster_type, signup_scope, min_townhall, max_townhall,
		       min_signups, max_accounts_per_user, display_column_ids, sort_configuration,
		       webhook_id, message_id,
		       image_url, event_start_time,
		       recurrence_days, recurrence_day_of_month, created_at, updated_at, revision
		FROM rosters
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY updated_at DESC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var rosterID uuid.UUID
		var serverID, alias, rosterType, signupScope string
		var groupID, clanTag, description, imageURL, webhookID, messageID *string
		var minTownhall, maxTownhall, minSignups, maxAccountsPerUser *int
		var columns []string
		var sortRaw []byte
		var recurrenceDays, recurrenceDayOfMonth *int
		var eventStartTime *int64
		var createdAt, updatedAt time.Time
		var revision int64
		if err := rows.Scan(&rosterID, &serverID, &groupID, &clanTag, &alias, &description,
			&rosterType, &signupScope, &minTownhall, &maxTownhall, &minSignups,
			&maxAccountsPerUser, &columns, &sortRaw, &webhookID, &messageID, &imageURL,
			&eventStartTime, &recurrenceDays, &recurrenceDayOfMonth, &createdAt, &updatedAt, &revision); err != nil {
			return nil, err
		}
		var sortConfiguration any = []any{}
		_ = json.Unmarshal(sortRaw, &sortConfiguration)
		item := map[string]any{
			"id": rosterID, "server_id": serverID, "alias": alias,
			"roster_type": rosterType, "signup_scope": signupScope,
			"members":    rosterLoadMembers(c, a, rosterID),
			"columns":    columns,
			"sort":       sortConfiguration,
			"created_at": createdAt, "updated_at": updatedAt, "revision": revision,
		}
		if groupID != nil {
			item["group_id"] = *groupID
		}
		if clanTag != nil {
			item["clan_tag"] = *clanTag
		}
		rosterPutOptional(item, "description", description)
		rosterPutOptional(item, "min_th", minTownhall)
		rosterPutOptional(item, "max_th", maxTownhall)
		rosterPutOptional(item, "min_signups", minSignups)
		rosterPutOptional(item, "max_accounts_per_user", maxAccountsPerUser)
		rosterPutOptional(item, "webhook_id", webhookID)
		rosterPutOptional(item, "message_id", messageID)
		rosterPutOptional(item, "image", imageURL)
		rosterPutOptional(item, "event_start_time", eventStartTime)
		rosterPutOptional(item, "recurrence_days", recurrenceDays)
		rosterPutOptional(item, "recurrence_day_of_month", recurrenceDayOfMonth)
		items = append(items, item)
	}
	return items, rows.Err()
}

func rosterDelete(c *fiber.Ctx, a apptypes.Deps, rosterID string, serverID int64) (int64, error) {
	id, err := uuid.Parse(rosterID)
	if err != nil {
		return 0, apptypes.Error(http.StatusBadRequest, "invalid roster_id")
	}
	tag, err := a.Store.SQL.Exec(c.UserContext(), `
		DELETE FROM rosters
		WHERE id = $1 AND server_id = $2
	`, id, rosterServerIDText(serverID))
	return tag.RowsAffected(), err
}

func rosterUpdate(c *fiber.Ctx, a apptypes.Deps, rosterID string, serverID int64, patch map[string]any) (map[string]any, error) {
	doc, err := rosterGet(c, a, rosterID, &serverID)
	if err != nil {
		return nil, err
	}
	for k, v := range patch {
		doc[k] = v
	}
	doc["updated_at"] = time.Now().UTC()
	delete(doc, "id")
	delete(doc, "server_id")
	doc["id"] = rosterID
	doc["server_id"] = serverID
	if _, err := rosterSave(c, a, doc); err != nil {
		return nil, err
	}
	return rosterGet(c, a, rosterID, &serverID)
}

func rosterGroupSave(c *fiber.Ctx, a apptypes.Deps, doc map[string]any) error {
	groupID := serverAsString(doc["group_id"])
	serverID := serverAsString(doc["server_id"])
	name := rosterOptionalString(doc["name"])
	description := rosterOptionalString(doc["description"])
	tx, err := a.Store.SQL.Begin(c.UserContext())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.UserContext())
	_, err = tx.Exec(c.UserContext(), `
		INSERT INTO roster_groups (
			group_id, server_id, name, alias, description, max_accounts_per_user,
			min_signups, created_at, updated_at
		)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, COALESCE($8, now()), COALESCE($9, now()))
		ON CONFLICT (group_id) DO UPDATE SET
			server_id = EXCLUDED.server_id,
			name = EXCLUDED.name,
			alias = EXCLUDED.alias,
			description = EXCLUDED.description,
			max_accounts_per_user = EXCLUDED.max_accounts_per_user,
			min_signups = EXCLUDED.min_signups,
			updated_at = EXCLUDED.updated_at
	`, groupID, serverID, name, rosterOptionalString(doc["alias"]), description,
		rosterNullableInt(doc["max_accounts_per_user"]), rosterNullableInt(doc["min_signups"]), doc["created_at"], doc["updated_at"])
	if err != nil {
		return err
	}
	return tx.Commit(c.UserContext())
}

func rosterGroups(c *fiber.Ctx, a apptypes.Deps, serverID *int64, groupID string) ([]map[string]any, error) {
	args := []any{}
	where := []string{"true"}
	if serverID != nil {
		args = append(args, rosterServerIDText(*serverID))
		where = append(where, "server_id = $"+strconv.Itoa(len(args)))
	}
	if groupID != "" {
		args = append(args, groupID)
		where = append(where, "group_id = $"+strconv.Itoa(len(args)))
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT group_id, server_id, name, alias, description, max_accounts_per_user,
		       min_signups, created_at, updated_at
		FROM roster_groups
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY created_at DESC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var gid, sid, name, description string
		var alias *string
		var maxAccountsPerUser, minSignups *int
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&gid, &sid, &name, &alias, &description, &maxAccountsPerUser,
			&minSignups, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item := map[string]any{
			"group_id": gid, "server_id": sid, "name": name, "description": description,
			"created_at": createdAt, "updated_at": updatedAt,
		}
		rosterPutOptional(item, "alias", alias)
		rosterPutOptional(item, "max_accounts_per_user", maxAccountsPerUser)
		rosterPutOptional(item, "min_signups", minSignups)
		items = append(items, item)
	}
	return items, rows.Err()
}

func rosterGroupGet(c *fiber.Ctx, a apptypes.Deps, groupID string, serverID *int64) (map[string]any, error) {
	groups, err := rosterGroups(c, a, serverID, groupID)
	if err != nil {
		return nil, err
	}
	if len(groups) == 0 {
		return nil, pgx.ErrNoRows
	}
	return groups[0], nil
}

func rosterAutomationSave(c *fiber.Ctx, a apptypes.Deps, doc map[string]any) error {
	options, _ := doc["options"].(map[string]any)
	_, err := a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO roster_automation_rules (
			automation_id, server_id, roster_id, group_id, enabled, trigger_type,
			action_type, offset_seconds, discord_channel_id, ping_type, executed,
			executed_at, last_triggered_at, execution_status, last_missed_at,
			created_at, updated_at
		)
		VALUES (
			$1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8,
			NULLIF($9, ''), NULLIF($10, ''), $11, $12, $13, NULLIF($14, ''), $15,
			COALESCE($16, now()), COALESCE($17, now())
		)
		ON CONFLICT (automation_id) DO UPDATE SET
			server_id = EXCLUDED.server_id,
			roster_id = EXCLUDED.roster_id,
			group_id = EXCLUDED.group_id,
			enabled = EXCLUDED.enabled,
			trigger_type = EXCLUDED.trigger_type,
			action_type = EXCLUDED.action_type,
			offset_seconds = EXCLUDED.offset_seconds,
			discord_channel_id = EXCLUDED.discord_channel_id,
			ping_type = EXCLUDED.ping_type,
			executed = EXCLUDED.executed,
			executed_at = EXCLUDED.executed_at,
			last_triggered_at = EXCLUDED.last_triggered_at,
			execution_status = EXCLUDED.execution_status,
			last_missed_at = EXCLUDED.last_missed_at,
			updated_at = EXCLUDED.updated_at
	`, serverAsString(doc["automation_id"]), serverAsString(doc["server_id"]), rosterOptionalString(doc["roster_id"]),
		rosterOptionalString(doc["group_id"]), !strings.EqualFold(serverAsString(doc["active"]), "false"),
		rosterOptionalString(doc["trigger_type"]), rosterOptionalString(doc["action_type"]), activityAsInt(doc["offset_seconds"]),
		rosterOptionalString(doc["discord_channel_id"]), rosterOptionalString(options["ping_type"]),
		rosterBoolDefault(doc["executed"], false), rosterNullableInt64(doc["executed_at"]), rosterNullableInt64(doc["last_triggered_at"]),
		rosterOptionalString(doc["execution_status"]), rosterNullableInt64(doc["last_missed_at"]), doc["created_at"], doc["updated_at"])
	return err
}

func rosterAutomationList(c *fiber.Ctx, a apptypes.Deps, serverID int64, rosterID, groupID string, activeOnly bool) ([]map[string]any, error) {
	args := []any{rosterServerIDText(serverID)}
	where := []string{"server_id = $1"}
	if rosterID != "" {
		args = append(args, rosterID)
		where = append(where, "roster_id = $"+strconv.Itoa(len(args)))
	}
	if groupID != "" {
		args = append(args, groupID)
		where = append(where, "group_id = $"+strconv.Itoa(len(args)))
	}
	if activeOnly {
		where = append(where, "enabled = true")
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT automation_id, server_id, roster_id, group_id, enabled, trigger_type,
		       action_type, offset_seconds, discord_channel_id, ping_type, executed,
		       executed_at, last_triggered_at, execution_status, last_missed_at,
		       created_at, updated_at
		FROM roster_automation_rules
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY created_at DESC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var automationID, sid, triggerType, actionType string
		var roster, group, discordChannel, pingType, executionStatus *string
		var enabled bool
		var offsetSeconds int
		var executed bool
		var executedAt, lastTriggeredAt, lastMissedAt *int64
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&automationID, &sid, &roster, &group, &enabled, &triggerType,
			&actionType, &offsetSeconds, &discordChannel, &pingType, &executed,
			&executedAt, &lastTriggeredAt, &executionStatus, &lastMissedAt,
			&createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item := map[string]any{
			"automation_id": automationID, "server_id": sid, "active": enabled,
			"trigger_type": triggerType, "action_type": actionType, "offset_seconds": offsetSeconds,
			"executed": executed, "created_at": createdAt, "updated_at": updatedAt,
		}
		rosterPutOptional(item, "roster_id", roster)
		if group != nil {
			item["group_id"] = *group
		}
		rosterPutOptional(item, "discord_channel_id", discordChannel)
		if pingType != nil {
			item["options"] = map[string]any{"ping_type": *pingType}
		}
		rosterPutOptional(item, "executed_at", executedAt)
		rosterPutOptional(item, "last_triggered_at", lastTriggeredAt)
		rosterPutOptional(item, "execution_status", executionStatus)
		rosterPutOptional(item, "last_missed_at", lastMissedAt)
		items = append(items, item)
	}
	return items, rows.Err()
}
