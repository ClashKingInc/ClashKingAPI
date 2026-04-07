package routes

import (
	"net/http"

	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func listRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roleType := c.Params("role_type")
		var items []map[string]any
		if roleType == "status" {
			serverDoc, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
			if err != nil {
				return notFoundErr(err, "Server not found")
			}
			statusRoles, _ := serverDoc["status_roles"].(map[string]any)
			discordRoles, _ := statusRoles["discord"].([]any)
			for _, role := range discordRoles {
				if cast, ok := role.(map[string]any); ok {
					items = append(items, cast)
				}
			}
		} else {
			collection := roleCollection(rt, roleType)
			if collection == nil {
				return apptypes.Error(http.StatusBadRequest, "Unsupported role type")
			}
			items, err = findManyMaps(c.UserContext(), collection, bson.M{"server": serverID})
			if err != nil {
				return err
			}
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"items": sanitize(items), "count": len(items)})
	}
}

func createRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roleType := c.Params("role_type")
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		body["server"] = serverID
		if roleType == "status" {
			roleID := body["id"]
			_, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$addToSet": bson.M{"status_roles.discord": body}})
			if err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Role created successfully", "role_type": roleType, "role_id": roleID})
		}
		collection := roleCollection(rt, roleType)
		if collection == nil {
			return apptypes.Error(http.StatusBadRequest, "Unsupported role type")
		}
		result, err := collection.InsertOne(c.UserContext(), body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Role created successfully", "role_type": roleType, "role_id": sanitizeObjectID(result.InsertedID)})
	}
}

func deleteRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roleType := c.Params("role_type")
		roleID := c.Params("role_id")
		if roleType == "status" {
			_, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$pull": bson.M{"status_roles.discord": bson.M{"id": roleID}}})
			if err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Role deleted successfully", "role_type": roleType, "role_id": roleID})
		}
		collection := roleCollection(rt, roleType)
		if collection == nil {
			return apptypes.Error(http.StatusBadRequest, "Unsupported role type")
		}
		result, err := collection.DeleteOne(c.UserContext(), bson.M{"server": serverID, "$or": []bson.M{{"role": roleID}, {"role": numericMaybe(roleID)}}})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Role not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Role deleted successfully", "role_type": roleType, "role_id": roleID})
	}
}

func getRoleSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if err != nil {
			return notFoundErr(err, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{
			"blacklisted_roles":   serverDoc["blacklisted_roles"],
			"role_treatment":      serverDoc["role_treatment"],
			"full_whitelist_role": serverDoc["full_whitelist_role"],
		})
	}
}

func patchRoleSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		result, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$set": body})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Role settings updated successfully", "updated_fields": len(body)})
	}
}

func getAllRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		out := map[string]any{}
		for roleType := range serverRoleCollections {
			collection := roleCollection(rt, roleType)
			items, _ := findManyMaps(c.UserContext(), collection, bson.M{"server": serverID})
			out[roleType] = sanitize(items)
		}
		serverDoc, _ := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		statusRoles, _ := serverDoc["status_roles"].(map[string]any)
		out["status"] = sanitize(statusRoles["discord"])
		return apptypes.JSON(c, http.StatusOK, out)
	}
}

func getFamilyRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		out := map[string]any{}
		for key, collectionName := range familyRoleCollections {
			items, _ := findManyMaps(c.UserContext(), rt.Store.DB.Usafam.Collection(collectionName), bson.M{"server": serverID})
			out[key] = sanitize(items)
		}
		return apptypes.JSON(c, http.StatusOK, out)
	}
}

func addFamilyRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body map[string]any
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		roleType := serverAsString(body["role_type"])
		if roleType == "" {
			roleType = serverAsString(body["type"])
		}
		collectionName := familyRoleCollections[roleType]
		if collectionName == "" {
			return apptypes.Error(http.StatusBadRequest, "Unsupported family role type")
		}
		body["server"] = serverID
		result, err := rt.Store.DB.Usafam.Collection(collectionName).InsertOne(c.UserContext(), body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Family role created successfully", "role_id": sanitizeObjectID(result.InsertedID), "role_type": roleType})
	}
}

func removeFamilyRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roleType := c.Params("role_type")
		collectionName := familyRoleCollections[roleType]
		if collectionName == "" {
			return apptypes.Error(http.StatusBadRequest, "Unsupported family role type")
		}
		roleID := c.Params("role_id")
		result, err := rt.Store.DB.Usafam.Collection(collectionName).DeleteOne(c.UserContext(), bson.M{"server": serverID, "$or": []bson.M{{"role": roleID}, {"role": numericMaybe(roleID)}}})
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Family role not found")
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Family role removed successfully", "role_type": roleType, "role_id": roleID})
	}
}
