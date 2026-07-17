package routes

import (
	"net/http"
	"net/url"
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

// rosterGenID generates a clean short custom ID.
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
		body["custom_id"] = rosterGenID()
		body["created_at"] = time.Now().UTC()
		body["updated_at"] = time.Now().UTC()
		if _, ok := body["members"]; !ok {
			body["members"] = []any{}
		}
		if err := rosterSave(c, a, body); err != nil {
			return err
		}
		created, err := rosterGet(c, a, serverAsString(body["custom_id"]), &serverID)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusCreated, map[string]any{
			"message":   "Roster created successfully",
			"roster_id": body["custom_id"],
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
			filter.customID = rosterID
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
				"roster_id":       roster["custom_id"],
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
		delete(body, "custom_id")
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
			if err := rosterSave(c, a, doc); err != nil {
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
		if err := rosterSave(c, a, doc); err != nil {
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
			filter.customID = rosterID
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
			if err := rosterSave(c, a, roster); err != nil {
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
		cloned["custom_id"] = rosterGenID()
		cloned["server_id"] = serverID
		cloned["created_at"] = time.Now().UTC()
		cloned["updated_at"] = time.Now().UTC()
		if body.NewAlias != "" {
			cloned["alias"] = body.NewAlias
		}
		if !body.CopyMembers {
			cloned["members"] = []any{}
		}
		if err := rosterSave(c, a, cloned); err != nil {
			return err
		}
		created, err := rosterGet(c, a, serverAsString(cloned["custom_id"]), &serverID)
		if err != nil {
			return err
		}
		memberCount := 0
		if members, ok := cloned["members"].([]any); ok {
			memberCount = len(members)
		}
		return apptypes.JSON(c, http.StatusCreated, map[string]any{
			"message":          "Roster cloned successfully",
			"new_roster_id":    cloned["custom_id"],
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
			    data = data - 'group_id',
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

// createRosterSignupCategory godoc
// @Summary Create roster signup category
// @Description Creates a new signup category.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query int true "Discord server ID"
// @Param body body modelsv2.RosterSignupCategoryRequest true "Signup category"
// @Success 201 {object} modelsv2.RosterSignupCategoryMutationResponse
// @Router /v2/roster-signup-category [post]
func createRosterSignupCategory(a apptypes.Deps) fiber.Handler {
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
		customID, _ := body["custom_id"].(string)
		if customID == "" {
			body["custom_id"] = rosterGenID()
		}
		if existing, _ := rosterSignupList(c, a, serverID, serverAsString(body["custom_id"])); len(existing) > 0 {
			return apptypes.Error(http.StatusBadRequest, "Signup category with this custom_id already exists")
		}
		body["created_at"] = time.Now().UTC()
		body["updated_at"] = time.Now().UTC()
		if err := rosterSignupSave(c, a, body); err != nil {
			return err
		}
		created, err := rosterSignupList(c, a, serverID, serverAsString(body["custom_id"]))
		if err != nil {
			return err
		}
		if len(created) == 0 {
			return apptypes.Error(http.StatusInternalServerError, "Created signup category could not be loaded")
		}
		return apptypes.JSON(c, http.StatusCreated, map[string]any{
			"message":   "Signup category created",
			"custom_id": body["custom_id"],
			"category":  sanitize(created[0]),
		})
	}
}

// listRosterSignupCategories godoc
// @Summary List roster signup categories
// @Description Returns signup categories for a server.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query int true "Discord server ID"
// @Success 200 {object} modelsv2.RosterSignupCategoryListResponse
// @Router /v2/roster-signup-category/list [get]
func listRosterSignupCategories(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		cats, err := rosterSignupList(c, a, serverID, "")
		if err != nil {
			return err
		}
		items := sanitize(cats)
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items, "categories": items, "count": len(cats), "server_id": rosterServerIDText(serverID)})
	}
}

// updateRosterSignupCategory godoc
// @Summary Update roster signup category
// @Description Updates a signup category.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param custom_id path string true "Custom ID"
// @Param server_id query int true "Discord server ID"
// @Param body body modelsv2.RosterSignupCategoryRequest true "Signup category fields"
// @Success 200 {object} modelsv2.RosterSignupCategoryMutationResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster-signup-category/{custom_id} [patch]
func updateRosterSignupCategory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		customID := c.Params("custom_id")
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		delete(body, "custom_id")
		delete(body, "server_id")
		existing, err := rosterSignupList(c, a, serverID, customID)
		if err != nil {
			return err
		}
		if len(existing) == 0 {
			return apptypes.Error(http.StatusNotFound, "Signup category not found")
		}
		updated := existing[0]
		for k, v := range body {
			updated[k] = v
		}
		updated["updated_at"] = time.Now().UTC()
		if err := rosterSignupSave(c, a, updated); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Category updated", "category": sanitize(updated)})
	}
}

// deleteRosterSignupCategory godoc
// @Summary Delete roster signup category
// @Description Deletes a signup category.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param custom_id path string true "Custom ID"
// @Param server_id query int true "Discord server ID"
// @Success 200 {object} modelsv2.MessageResponse
// @Failure 404 {object} modelsv2.ErrorResponse
// @Router /v2/roster-signup-category/{custom_id} [delete]
func deleteRosterSignupCategory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		customID := c.Params("custom_id")
		cmd, err := a.Store.SQL.Exec(c.UserContext(), `
			DELETE FROM roster_signup_categories
			WHERE custom_id = $1 AND server_id = $2
		`, customID, rosterServerIDText(serverID))
		if err != nil {
			return err
		}
		if cmd.RowsAffected() == 0 {
			return apptypes.Error(http.StatusNotFound, "Signup category not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Signup category deleted"})
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
		if err := rosterSave(c, a, existing); err != nil {
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
		if err := rosterSave(c, a, doc); err != nil {
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
		if err := rosterSave(c, a, doc); err != nil {
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
	customID string
	groupID  string
	clanTag  string
}

func rosterServerIDText(serverID int64) string {
	return strconv.FormatInt(serverID, 10)
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
	member["last_updated"] = time.Now().UTC().Unix()
	if player.Clan != nil {
		member["current_clan"] = player.Clan.Name
		member["current_clan_tag"] = player.Clan.Tag
	} else {
		member["current_clan"] = ""
		member["current_clan_tag"] = ""
	}
	if player.League != nil {
		member["current_league"] = player.League.Name
	} else if player.LeagueTier != nil {
		member["current_league"] = player.LeagueTier.Name
	}
}

func rosterSave(c *fiber.Ctx, a apptypes.Deps, doc map[string]any) error {
	customID := serverAsString(doc["custom_id"])
	serverID := serverAsString(doc["server_id"])
	groupID := rosterOptionalString(doc["group_id"])
	clanTag := rosterOptionalString(doc["clan_tag"])
	alias := rosterOptionalString(doc["alias"])
	members := doc["members"]
	if members == nil {
		members = []any{}
	}
	_, err := a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO rosters (custom_id, server_id, group_id, clan_tag, alias, members, data, created_at, updated_at)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6::jsonb, $7::jsonb, COALESCE($8, now()), COALESCE($9, now()))
		ON CONFLICT (custom_id) DO UPDATE SET
			server_id = EXCLUDED.server_id,
			group_id = EXCLUDED.group_id,
			clan_tag = EXCLUDED.clan_tag,
			alias = EXCLUDED.alias,
			members = EXCLUDED.members,
			data = EXCLUDED.data,
			updated_at = EXCLUDED.updated_at
	`, customID, serverID, groupID, clanTag, alias, apptypes.Marshal(members), apptypes.Marshal(doc), doc["created_at"], doc["updated_at"])
	return err
}

func rosterGet(c *fiber.Ctx, a apptypes.Deps, customID string, serverID *int64) (map[string]any, error) {
	filter := rosterFilter{customID: customID, serverID: serverID}
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
	if filter.customID != "" {
		args = append(args, filter.customID)
		where = append(where, "custom_id = $"+strconv.Itoa(len(args)))
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
		SELECT custom_id, server_id, group_id, clan_tag, alias, members, data, created_at, updated_at
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
		var customID, serverID, alias string
		var groupID, clanTag *string
		var membersRaw, dataRaw []byte
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&customID, &serverID, &groupID, &clanTag, &alias, &membersRaw, &dataRaw, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item := playerDecodeJSONObject(dataRaw)
		item["custom_id"] = customID
		item["server_id"] = serverID
		if groupID != nil {
			item["group_id"] = *groupID
		}
		if clanTag != nil {
			item["clan_tag"] = *clanTag
		}
		item["alias"] = alias
		item["members"] = playerDecodeJSONValue(membersRaw, []any{})
		item["created_at"] = createdAt
		item["updated_at"] = updatedAt
		items = append(items, item)
	}
	return items, rows.Err()
}

func rosterDelete(c *fiber.Ctx, a apptypes.Deps, customID string, serverID int64) (int64, error) {
	tag, err := a.Store.SQL.Exec(c.UserContext(), `
		DELETE FROM rosters
		WHERE custom_id = $1 AND server_id = $2
	`, customID, rosterServerIDText(serverID))
	return tag.RowsAffected(), err
}

func rosterUpdate(c *fiber.Ctx, a apptypes.Deps, customID string, serverID int64, patch map[string]any) (map[string]any, error) {
	doc, err := rosterGet(c, a, customID, &serverID)
	if err != nil {
		return nil, err
	}
	for k, v := range patch {
		doc[k] = v
	}
	doc["updated_at"] = time.Now().UTC()
	delete(doc, "custom_id")
	delete(doc, "server_id")
	doc["custom_id"] = customID
	doc["server_id"] = serverID
	if err := rosterSave(c, a, doc); err != nil {
		return nil, err
	}
	return rosterGet(c, a, customID, &serverID)
}

func rosterGroupSave(c *fiber.Ctx, a apptypes.Deps, doc map[string]any) error {
	groupID := serverAsString(doc["group_id"])
	serverID := serverAsString(doc["server_id"])
	name := rosterOptionalString(doc["name"])
	description := rosterOptionalString(doc["description"])
	_, err := a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO roster_groups (group_id, server_id, name, description, data, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6, now()), COALESCE($7, now()))
		ON CONFLICT (group_id) DO UPDATE SET
			server_id = EXCLUDED.server_id,
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			data = EXCLUDED.data,
			updated_at = EXCLUDED.updated_at
	`, groupID, serverID, name, description, apptypes.Marshal(doc), doc["created_at"], doc["updated_at"])
	return err
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
		SELECT group_id, server_id, name, description, data, created_at, updated_at
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
		var dataRaw []byte
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&gid, &sid, &name, &description, &dataRaw, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item := playerDecodeJSONObject(dataRaw)
		item["group_id"] = gid
		item["server_id"] = sid
		item["name"] = name
		item["description"] = description
		item["created_at"] = createdAt
		item["updated_at"] = updatedAt
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

func rosterSignupSave(c *fiber.Ctx, a apptypes.Deps, doc map[string]any) error {
	_, err := a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO roster_signup_categories (custom_id, server_id, name, description, sort_order, data, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7, now()), COALESCE($8, now()))
		ON CONFLICT (custom_id) DO UPDATE SET
			server_id = EXCLUDED.server_id,
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			sort_order = EXCLUDED.sort_order,
			data = EXCLUDED.data,
			updated_at = EXCLUDED.updated_at
	`, serverAsString(doc["custom_id"]), serverAsString(doc["server_id"]), rosterOptionalString(doc["name"]), rosterOptionalString(doc["description"]), activityAsInt(doc["sort_order"]), apptypes.Marshal(doc), doc["created_at"], doc["updated_at"])
	return err
}

func rosterSignupList(c *fiber.Ctx, a apptypes.Deps, serverID int64, customID string) ([]map[string]any, error) {
	args := []any{rosterServerIDText(serverID)}
	where := []string{"server_id = $1"}
	if customID != "" {
		args = append(args, customID)
		where = append(where, "custom_id = $2")
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT custom_id, server_id, name, description, sort_order, data, created_at, updated_at
		FROM roster_signup_categories
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY sort_order, created_at
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var cid, sid, name, description string
		var sortOrder int
		var dataRaw []byte
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&cid, &sid, &name, &description, &sortOrder, &dataRaw, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item := playerDecodeJSONObject(dataRaw)
		item["custom_id"] = cid
		item["server_id"] = sid
		item["name"] = name
		item["description"] = description
		item["sort_order"] = sortOrder
		item["created_at"] = createdAt
		item["updated_at"] = updatedAt
		items = append(items, item)
	}
	return items, rows.Err()
}

func rosterAutomationSave(c *fiber.Ctx, a apptypes.Deps, doc map[string]any) error {
	_, err := a.Store.SQL.Exec(c.UserContext(), `
		INSERT INTO roster_automation_rules (automation_id, server_id, group_id, enabled, trigger_type, data, created_at, updated_at)
		VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6::jsonb, COALESCE($7, now()), COALESCE($8, now()))
		ON CONFLICT (automation_id) DO UPDATE SET
			server_id = EXCLUDED.server_id,
			group_id = EXCLUDED.group_id,
			enabled = EXCLUDED.enabled,
			trigger_type = EXCLUDED.trigger_type,
			data = EXCLUDED.data,
			updated_at = EXCLUDED.updated_at
	`, serverAsString(doc["automation_id"]), serverAsString(doc["server_id"]), rosterOptionalString(doc["group_id"]), !strings.EqualFold(serverAsString(doc["active"]), "false"), rosterOptionalString(doc["trigger_type"]), apptypes.Marshal(doc), doc["created_at"], doc["updated_at"])
	return err
}

func rosterAutomationList(c *fiber.Ctx, a apptypes.Deps, serverID int64, rosterID, groupID string, activeOnly bool) ([]map[string]any, error) {
	args := []any{rosterServerIDText(serverID)}
	where := []string{"server_id = $1"}
	if rosterID != "" {
		args = append(args, rosterID)
		where = append(where, "data->>'roster_id' = $"+strconv.Itoa(len(args)))
	}
	if groupID != "" {
		args = append(args, groupID)
		where = append(where, "group_id = $"+strconv.Itoa(len(args)))
	}
	if activeOnly {
		where = append(where, "enabled = true")
	}
	rows, err := a.Store.SQL.Query(c.UserContext(), `
		SELECT automation_id, server_id, group_id, enabled, trigger_type, data, created_at, updated_at
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
		var automationID, sid, triggerType string
		var group *string
		var enabled bool
		var dataRaw []byte
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&automationID, &sid, &group, &enabled, &triggerType, &dataRaw, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item := playerDecodeJSONObject(dataRaw)
		item["automation_id"] = automationID
		item["server_id"] = sid
		if group != nil {
			item["group_id"] = *group
		}
		item["active"] = enabled
		item["trigger_type"] = triggerType
		item["created_at"] = createdAt
		item["updated_at"] = updatedAt
		items = append(items, item)
	}
	return items, rows.Err()
}
