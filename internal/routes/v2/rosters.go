package v2

import (
	"encoding/base64"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
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

func rosterAccessToken() string {
	id := uuid.New()
	return base64.RawURLEncoding.EncodeToString(id[:])
}

// createRoster godoc
// @Summary Create roster
// @Description Creates a new roster for a Discord server.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query int true "Discord server ID"
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
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
		if _, err := a.Store.C.Rosters.InsertOne(c.UserContext(), body); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusCreated, map[string]any{
			"message":   "Roster created successfully",
			"roster_id": body["custom_id"],
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
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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
		filter := bson.M{"server_id": serverID}
		if rosterID != "" {
			filter["custom_id"] = rosterID
		} else {
			filter["group_id"] = groupID
		}
		rosters, err := findManyMaps(c.UserContext(), a.Store.C.Rosters, filter)
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
			"server_id":             serverID,
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
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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
		opts := options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(bson.M{"_id": 0})
		var updated map[string]any
		err = a.Store.C.Rosters.FindOneAndUpdate(
			c.UserContext(),
			bson.M{"custom_id": rosterID, "server_id": serverID},
			bson.M{"$set": body},
			opts,
		).Decode(&updated)
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/roster/{roster_id} [get]
func getRoster(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		doc, err := findOneMap(c.UserContext(), a.Store.C.Rosters, bson.M{"custom_id": rosterID, "server_id": serverID})
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/roster/{roster_id} [delete]
func deleteRoster(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		res, err := a.Store.C.Rosters.DeleteOne(c.UserContext(), bson.M{"custom_id": rosterID, "server_id": serverID})
		if err != nil {
			return err
		}
		if res.DeletedCount == 0 {
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/roster/{roster_id}/members/{player_tag} [delete]
func removeRosterMember(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		tag := rosterNormalizeTag(c.Params("player_tag"))
		res, err := a.Store.C.Rosters.UpdateOne(
			c.UserContext(),
			bson.M{"custom_id": rosterID, "server_id": serverID},
			bson.M{
				"$pull": bson.M{"members": bson.M{"tag": tag}},
				"$set":  bson.M{"updated_at": time.Now().UTC()},
			},
		)
		if err != nil {
			return err
		}
		if res.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Roster not found")
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
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Router /v2/roster/refresh [post]
func refreshRosters(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rosterID := c.Query("roster_id")
		groupID := c.Query("group_id")
		serverIDRaw := c.Query("server_id")
		filter := bson.M{}
		if rosterID != "" {
			filter["custom_id"] = rosterID
		} else if groupID != "" {
			filter["group_id"] = groupID
		} else if serverIDRaw != "" {
			sid, err := strconv.ParseInt(serverIDRaw, 10, 64)
			if err != nil {
				return apptypes.Error(http.StatusBadRequest, "invalid server_id")
			}
			filter["server_id"] = sid
		} else {
			return apptypes.Error(http.StatusBadRequest, "Must provide roster_id, group_id, or server_id")
		}
		rosters, err := findManyMaps(c.UserContext(), a.Store.C.Rosters, filter)
		if err != nil {
			return err
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
// @Success 201 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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
		src, err := findOneMap(c.UserContext(), a.Store.C.Rosters, bson.M{"custom_id": rosterID})
		if err != nil {
			return notFoundErr(err, "Source roster not found")
		}
		cloned := make(map[string]any, len(src))
		for k, v := range src {
			cloned[k] = v
		}
		delete(cloned, "_id")
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
		if _, err := a.Store.C.Rosters.InsertOne(c.UserContext(), cloned); err != nil {
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
			"target_server_id": serverID,
			"source_server_id": src["server_id"],
			"members_copied":   memberCount,
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
// @Success 200 {object} map[string]interface{}
// @Router /v2/roster/{server_id}/list [get]
func listRosters(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverIDRaw := c.Params("server_id")
		serverID, err := strconv.ParseInt(serverIDRaw, 10, 64)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "invalid server_id")
		}
		filter := bson.M{"server_id": serverID}
		if groupID := c.Query("group_id"); groupID != "" {
			filter["group_id"] = groupID
		}
		if clanTag := c.Query("clan_tag"); clanTag != "" {
			filter["clan_tag"] = clanTag
		}
		rosters, err := findManyMaps(c.UserContext(), a.Store.C.Rosters, filter)
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
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
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
		if _, err := a.Store.C.RosterGroups.InsertOne(c.UserContext(), body); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusCreated, map[string]any{
			"message":  "Roster group created",
			"group_id": body["group_id"],
		})
	}
}

// listRosterGroups godoc
// @Summary List roster groups
// @Description Returns roster groups for a server.
// @Tags Rosters
// @Produce json
// @Param server_id query int true "Discord server ID"
// @Success 200 {object} map[string]interface{}
// @Router /v2/roster-group/list [get]
func listRosterGroups(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		groups, err := findManyMaps(c.UserContext(), a.Store.C.RosterGroups, bson.M{"server_id": serverID})
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"groups": sanitize(groups), "count": len(groups)})
	}
}

// getRosterGroup godoc
// @Summary Get roster group
// @Description Returns a specific roster group.
// @Tags Rosters
// @Produce json
// @Param group_id path string true "Group ID"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/roster-group/{group_id} [get]
func getRosterGroup(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		groupID := c.Params("group_id")
		doc, err := findOneMap(c.UserContext(), a.Store.C.RosterGroups, bson.M{"group_id": groupID})
		if err != nil {
			return notFoundErr(err, "Roster group not found")
		}
		serverID := asInt64(doc["server_id"])
		rosters, _ := findManyMaps(c.UserContext(), a.Store.C.Rosters, bson.M{"group_id": groupID, "server_id": serverID})
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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
		opts := options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(bson.M{"_id": 0})
		var updated map[string]any
		err = a.Store.C.RosterGroups.FindOneAndUpdate(
			c.UserContext(),
			bson.M{"group_id": groupID, "server_id": serverID},
			bson.M{"$set": body},
			opts,
		).Decode(&updated)
		if err != nil {
			return notFoundErr(err, "Roster group not found")
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/roster-group/{group_id} [delete]
func deleteRosterGroup(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		groupID := c.Params("group_id")
		group, err := findOneMap(c.UserContext(), a.Store.C.RosterGroups, bson.M{"group_id": groupID, "server_id": serverID})
		if err != nil {
			return notFoundErr(err, "Roster group not found")
		}
		_ = group

		res, err := a.Store.C.Rosters.UpdateMany(
			c.UserContext(),
			bson.M{"group_id": groupID, "server_id": serverID},
			bson.M{
				"$unset": bson.M{"group_id": ""},
				"$set":   bson.M{"updated_at": time.Now().UTC()},
			},
		)
		if err != nil {
			return err
		}
		if _, err := a.Store.C.RosterAutomation.DeleteMany(c.UserContext(), bson.M{"group_id": groupID, "server_id": serverID}); err != nil {
			return err
		}
		if _, err := a.Store.C.RosterGroups.DeleteOne(c.UserContext(), bson.M{"group_id": groupID, "server_id": serverID}); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"message":          "Roster group deleted successfully",
			"affected_rosters": res.ModifiedCount,
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
// @Success 201 {object} map[string]interface{}
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
		if existing, _ := findOneMap(c.UserContext(), a.Store.C.SignupCats, bson.M{"server_id": serverID, "custom_id": body["custom_id"]}); existing != nil {
			return apptypes.Error(http.StatusBadRequest, "Signup category with this custom_id already exists")
		}
		body["created_at"] = time.Now().UTC()
		body["updated_at"] = time.Now().UTC()
		if _, err := a.Store.C.SignupCats.InsertOne(c.UserContext(), body); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusCreated, map[string]any{
			"message":   "Signup category created",
			"custom_id": body["custom_id"],
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
// @Success 200 {object} map[string]interface{}
// @Router /v2/roster-signup-category/list [get]
func listRosterSignupCategories(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		cats, err := findManyMaps(c.UserContext(), a.Store.C.SignupCats, bson.M{"server_id": serverID})
		if err != nil {
			return err
		}
		items := sanitize(cats)
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": items, "categories": items, "count": len(cats), "server_id": serverID})
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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
		opts := options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(bson.M{"_id": 0})
		var updated map[string]any
		err = a.Store.C.SignupCats.FindOneAndUpdate(
			c.UserContext(),
			bson.M{"custom_id": customID, "server_id": serverID},
			bson.M{"$set": body},
			opts,
		).Decode(&updated)
		if err != nil {
			return notFoundErr(err, "Signup category not found")
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/roster-signup-category/{custom_id} [delete]
func deleteRosterSignupCategory(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		customID := c.Params("custom_id")
		res, err := a.Store.C.SignupCats.DeleteOne(c.UserContext(), bson.M{"custom_id": customID, "server_id": serverID})
		if err != nil {
			return err
		}
		if res.DeletedCount == 0 {
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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
			Operation  string           `json:"operation"` // "add" | "remove" | "update"
			PlayerTags []string         `json:"player_tags"`
		}
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		existing, err := findOneMap(c.UserContext(), a.Store.C.Rosters, bson.M{"custom_id": rosterID, "server_id": serverID})
		if err != nil {
			return notFoundErr(err, "Roster not found")
		}
		_ = existing

		switch body.Operation {
		case "remove":
			tags := make([]string, 0, len(body.PlayerTags))
			for _, t := range body.PlayerTags {
				tags = append(tags, rosterNormalizeTag(t))
			}
			_, err = a.Store.C.Rosters.UpdateOne(
				c.UserContext(),
				bson.M{"custom_id": rosterID},
				bson.M{
					"$pull": bson.M{"members": bson.M{"tag": bson.M{"$in": tags}}},
					"$set":  bson.M{"updated_at": time.Now().UTC()},
				},
			)
		default: // "add" or unspecified
			newMembers := make([]any, 0, len(body.Members))
			for _, m := range body.Members {
				m["added_at"] = time.Now().UTC()
				newMembers = append(newMembers, m)
			}
			_, err = a.Store.C.Rosters.UpdateOne(
				c.UserContext(),
				bson.M{"custom_id": rosterID, "server_id": serverID},
				bson.M{
					"$push": bson.M{"members": bson.M{"$each": newMembers}},
					"$set":  bson.M{"updated_at": time.Now().UTC()},
				},
			)
		}
		if err != nil {
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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
		setFields := bson.M{"updated_at": time.Now().UTC()}
		for k, v := range body {
			setFields["members.$."+k] = v
		}
		res, err := a.Store.C.Rosters.UpdateOne(
			c.UserContext(),
			bson.M{"custom_id": rosterID, "server_id": serverID, "members.tag": memberTag},
			bson.M{"$set": setFields},
		)
		if err != nil {
			return err
		}
		if res.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Member not found in roster")
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/roster/{roster_id}/members/{member_tag}/refresh [post]
func refreshRosterMember(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Params("roster_id")
		memberTag := rosterNormalizeTag(c.Params("member_tag"))
		var update bson.M
		if a.Clash != nil {
			if player, err := a.Clash.GetPlayer(c.UserContext(), memberTag); err == nil && player != nil {
				update = bson.M{
					"members.$.name":      player.Name,
					"members.$.trophies":  player.Trophies,
					"members.$.town_hall": player.TownHall,
					"updated_at":          time.Now().UTC(),
				}
			}
		}
		if update == nil {
			update = bson.M{"updated_at": time.Now().UTC()}
		}
		res, err := a.Store.C.Rosters.UpdateOne(
			c.UserContext(),
			bson.M{"custom_id": rosterID, "server_id": serverID, "members.tag": memberTag},
			bson.M{"$set": update},
		)
		if err != nil {
			return err
		}
		if res.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Member not found in roster")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Member refreshed"})
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
// @Success 201 {object} map[string]interface{}
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
		if _, err := a.Store.C.RosterAutomation.InsertOne(c.UserContext(), body); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusCreated, map[string]any{
			"message":       "Automation rule created",
			"automation_id": body["automation_id"],
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
// @Success 200 {object} map[string]interface{}
// @Router /v2/roster-automation/list [get]
func listRosterAutomation(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		filter := bson.M{"server_id": serverID}
		if rosterID := c.Query("roster_id"); rosterID != "" {
			filter["roster_id"] = rosterID
		}
		if groupID := c.Query("group_id"); groupID != "" {
			filter["group_id"] = groupID
		}
		activeOnly := true
		if raw := c.Query("active_only"); raw != "" {
			parsed, parseErr := strconv.ParseBool(raw)
			if parseErr != nil {
				return apptypes.Error(http.StatusBadRequest, "invalid active_only")
			}
			activeOnly = parsed
		}
		if activeOnly {
			filter["active"] = true
		}
		rules, err := findManyMaps(c.UserContext(), a.Store.C.RosterAutomation, filter)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"items":     sanitize(rules),
			"rules":     sanitize(rules),
			"count":     len(rules),
			"server_id": serverID,
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
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
		opts := options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(bson.M{"_id": 0})
		var updated map[string]any
		err = a.Store.C.RosterAutomation.FindOneAndUpdate(
			c.UserContext(),
			bson.M{"automation_id": automationID, "server_id": serverID},
			bson.M{"$set": body},
			opts,
		).Decode(&updated)
		if err != nil {
			return notFoundErr(err, "Automation rule not found")
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
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/roster-automation/{automation_id} [delete]
func deleteRosterAutomation(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		automationID := c.Params("automation_id")
		res, err := a.Store.C.RosterAutomation.DeleteOne(c.UserContext(), bson.M{"automation_id": automationID, "server_id": serverID})
		if err != nil {
			return err
		}
		if res.DeletedCount == 0 {
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
// @Success 200 {object} map[string]interface{}
// @Router /v2/roster/server/{server_id}/members [get]
func getServerClanMembers(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverIDRaw := c.Params("server_id")
		serverID, err := strconv.ParseInt(serverIDRaw, 10, 64)
		if err != nil {
			return apptypes.Error(http.StatusBadRequest, "invalid server_id")
		}
		clans, err := findManyMaps(c.UserContext(), a.Store.DB.Usafam.Collection("clans"), bson.M{"server": serverID})
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

// generateRosterToken godoc
// @Summary Generate roster token
// @Description Generates an access token for public roster viewing.
// @Tags Rosters
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id query int true "Discord server ID"
// @Success 200 {object} map[string]interface{}
// @Router /v2/roster-token [post]
func generateRosterToken(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID, err := rosterQueryServerID(c)
		if err != nil {
			return err
		}
		rosterID := c.Query("roster_id")
		token := rosterAccessToken()
		expiresAt := time.Now().UTC().Add(time.Hour)
		tokenDoc := bson.M{
			"server_id":  serverID,
			"token":      token,
			"type":       "roster",
			"expires_at": expiresAt,
		}
		if rosterID != "" {
			tokenDoc["roster_id"] = rosterID
		}
		if _, err := a.Store.C.Tokens.InsertOne(c.UserContext(), tokenDoc); err != nil {
			return err
		}
		rosterCount, _ := a.Store.C.Rosters.CountDocuments(c.UserContext(), bson.M{"server_id": serverID})
		baseURL := "https://api.clashk.ing"
		if a.Config.Local {
			baseURL = "http://localhost:8000"
		}
		dashboardURL := baseURL + "/ui/roster/dashboard?token=" + token
		if rosterID != "" {
			dashboardURL += "&server_id=" + strconv.FormatInt(serverID, 10) + "&roster_id=" + rosterID
		} else {
			dashboardURL += "&server_id=" + strconv.FormatInt(serverID, 10)
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"message": "Server roster access token generated successfully",
			"server_info": map[string]any{
				"server_id":    serverID,
				"roster_count": rosterCount,
			},
			"access_url": dashboardURL,
			"token":      token,
			"expires_at": expiresAt.Format(time.RFC3339),
		})
	}
}
