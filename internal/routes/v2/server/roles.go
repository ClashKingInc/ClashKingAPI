package server

import (
	"context"
	"net/http"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
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
			if sanitizedDoc, ok := sanitize(serverDoc).(map[string]any); ok {
				serverDoc = sanitizedDoc
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
		sanitized := sanitizeRoleList(items)
		return apptypes.JSON(c, http.StatusOK, modelsv2.RolesListResponse{
			ServerID: serverID,
			RoleType: roleType,
			Roles:    sanitized,
			Count:    len(sanitized),
		})
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
		if _, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID}); err != nil {
			return notFoundErr(err, "Server not found")
		}
		body["server"] = serverID
		if roleType == "status" {
			roleID := body["id"]
			_, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$addToSet": bson.M{"status_roles.discord": body}})
			if err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, modelsv2.RoleResponse{
				Message:  "Role created successfully",
				ServerID: serverID,
				RoleType: roleType,
				RoleID:   roleID,
			})
		}
		collection := roleCollection(rt, roleType)
		if collection == nil {
			return apptypes.Error(http.StatusBadRequest, "Unsupported role type")
		}
		result, err := collection.InsertOne(c.UserContext(), body)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.RoleResponse{
			Message:  "Role created successfully",
			ServerID: serverID,
			RoleType: roleType,
			RoleID:   sanitizeObjectID(result.InsertedID),
		})
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
			_, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$pull": bson.M{"status_roles.discord": bson.M{"id": numericMaybe(roleID)}}})
			if err != nil {
				return err
			}
			return apptypes.JSON(c, http.StatusOK, modelsv2.RoleResponse{
				Message:  "Role deleted successfully",
				ServerID: serverID,
				RoleType: roleType,
				RoleID:   roleID,
			})
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
		return apptypes.JSON(c, http.StatusOK, modelsv2.RoleResponse{
			Message:  "Role deleted successfully",
			ServerID: serverID,
			RoleType: roleType,
			RoleID:   roleID,
		})
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
		return apptypes.JSON(c, http.StatusOK, modelsv2.RoleSettingsResponse{
			ServerID:         serverID,
			AutoEvalStatus:   boolPtrMaybe(serverDoc["autoeval"]),
			AutoEvalNickname: boolPtrMaybe(serverDoc["auto_eval_nickname"]),
			AutoevalTriggers: stringSlice(serverDoc["autoeval_triggers"]),
			AutoevalLog:      serverDoc["autoeval_log"],
			BlacklistedRoles: anySlice(serverDoc["blacklisted_roles"]),
			RoleTreatment:    stringSlice(serverDoc["role_treatment"]),
			CategoryRoles:    mapMaybe(serverDoc["category_roles"]),
		})
	}
}

func patchRoleSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body modelsv2.RoleSettingsUpdate
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		updateDoc := bson.M{}
		if body.AutoEvalStatus != nil {
			updateDoc["autoeval"] = *body.AutoEvalStatus
		} else if body.Autoeval != nil {
			updateDoc["autoeval"] = *body.Autoeval
		}
		if body.AutoEvalNickname != nil {
			updateDoc["auto_eval_nickname"] = *body.AutoEvalNickname
		}
		if body.AutoevalTriggers != nil {
			updateDoc["autoeval_triggers"] = body.AutoevalTriggers
		}
		if body.AutoevalLog != nil {
			updateDoc["autoeval_log"] = body.AutoevalLog
		}
		if body.BlacklistedRoles != nil {
			updateDoc["blacklisted_roles"] = body.BlacklistedRoles
		}
		if body.RoleTreatment != nil {
			updateDoc["role_treatment"] = body.RoleTreatment
		}
		if len(updateDoc) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		result, err := rt.Store.C.ServerDB.UpdateOne(c.UserContext(), bson.M{"server": serverID}, bson.M{"$set": updateDoc})
		if err != nil {
			return err
		}
		if result.MatchedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Server not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.RoleResponse{
			Message:  "Role settings updated successfully",
			ServerID: serverID,
			RoleType: "settings",
			RoleID:   nil,
		})
	}
}

func getAllRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID}); err != nil {
			return notFoundErr(err, "Server not found")
		}
		out := map[string][]map[string]any{}
		totalCount := 0
		for roleType := range serverRoleCollections {
			collection := roleCollection(rt, roleType)
			items, _ := findManyMaps(c.UserContext(), collection, bson.M{"server": serverID})
			sanitized := sanitizeRoleList(items)
			out[roleType] = sanitized
			totalCount += len(sanitized)
		}
		serverDoc, _ := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID})
		if sanitizedDoc, ok := sanitize(serverDoc).(map[string]any); ok {
			serverDoc = sanitizedDoc
		}
		statusRoles, _ := serverDoc["status_roles"].(map[string]any)
		status := sanitizeRoleList(anyMapSlice(statusRoles["discord"]))
		out["status"] = status
		totalCount += len(status)
		return apptypes.JSON(c, http.StatusOK, modelsv2.AllRolesResponse{
			ServerID:   serverID,
			Roles:      out,
			TotalCount: totalCount,
		})
	}
}

func getFamilyRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID}); err != nil {
			return notFoundErr(err, "Server not found")
		}
		familyRoles, _ := findManyMaps(c.UserContext(), rt.Store.DB.Usafam.Collection("generalrole"), bson.M{"server": serverID})
		notFamilyRoles, _ := findManyMaps(c.UserContext(), rt.Store.DB.Usafam.Collection("linkrole"), bson.M{"server": serverID})
		onlyFamilyRoles, _ := findManyMaps(c.UserContext(), rt.Store.DB.Usafam.Collection("familyexclusiveroles"), bson.M{"server": serverID})
		ignoredRoles, _ := findManyMaps(c.UserContext(), rt.Store.DB.Usafam.Collection("evalignore"), bson.M{"server": serverID})
		positionRoles, _ := findManyMaps(c.UserContext(), rt.Store.DB.Usafam.Collection("family_roles"), bson.M{"server": serverID})

		resp := modelsv2.FamilyRolesResponse{
			ServerID:            serverID,
			FamilyRoles:         roleIDsAsStrings(familyRoles),
			NotFamilyRoles:      roleIDsAsStrings(notFamilyRoles),
			OnlyFamilyRoles:     roleIDsAsStrings(onlyFamilyRoles),
			IgnoredRoles:        roleIDsAsStrings(ignoredRoles),
			FamilyMemberRoles:   positionRoleIDsAsStrings(positionRoles, "family_member_roles"),
			FamilyElderRoles:    positionRoleIDsAsStrings(positionRoles, "family_elder_roles"),
			FamilyColeaderRoles: positionRoleIDsAsStrings(positionRoles, "family_co-leader_roles"),
			FamilyLeaderRoles:   positionRoleIDsAsStrings(positionRoles, "family_leader_roles"),
		}
		return apptypes.JSON(c, http.StatusOK, resp)
	}
}

func addFamilyRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := findOneMap(c.UserContext(), rt.Store.C.ServerDB, bson.M{"server": serverID}); err != nil {
			return notFoundErr(err, "Server not found")
		}
		var body modelsv2.FamilyRoleRequest
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		collectionName, internalType := familyRoleTarget(body.Type)
		if collectionName == "" {
			return apptypes.Error(http.StatusBadRequest, "Unsupported family role type")
		}
		doc := bson.M{"server": serverID, "role": numericMaybe(serverAsString(body.Role))}
		if internalType != "" {
			doc["type"] = internalType
		}
		if err := ensureFamilyRoleNotExists(c.UserContext(), rt.Store.DB.Usafam.Collection(collectionName), doc); err != nil {
			return err
		}
		result, err := rt.Store.DB.Usafam.Collection(collectionName).InsertOne(c.UserContext(), doc)
		if err != nil {
			return err
		}
		_ = result
		return apptypes.JSON(c, http.StatusOK, modelsv2.FamilyRoleOperationResponse{
			Message:  "Family role added successfully",
			ServerID: serverID,
			RoleType: body.Type,
			RoleID:   serverAsString(body.Role),
		})
	}
}

func removeFamilyRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roleType := c.Params("role_type")
		collectionName, internalType := familyRoleTarget(roleType)
		if collectionName == "" {
			return apptypes.Error(http.StatusBadRequest, "Unsupported family role type")
		}
		roleID := c.Params("role_id")
		filter := bson.M{"server": serverID, "$or": []bson.M{{"role": roleID}, {"role": numericMaybe(roleID)}}}
		if internalType != "" {
			filter["type"] = internalType
		}
		result, err := rt.Store.DB.Usafam.Collection(collectionName).DeleteOne(c.UserContext(), filter)
		if err != nil {
			return err
		}
		if result.DeletedCount == 0 {
			return apptypes.Error(http.StatusNotFound, "Family role not found")
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.FamilyRoleOperationResponse{
			Message:  "Family role removed successfully",
			ServerID: serverID,
			RoleType: roleType,
			RoleID:   roleID,
		})
	}
}

func sanitizeRoleList(items []map[string]any) []map[string]any {
	sanitized := make([]map[string]any, 0, len(items))
	for _, item := range items {
		role := sanitize(item).(map[string]any)
		delete(role, "toggle")
		if value, ok := role["role"]; ok {
			role["role"] = serverAsString(value)
		}
		if value, ok := role["id"]; ok {
			role["id"] = serverAsString(value)
		}
		sanitized = append(sanitized, role)
	}
	return sanitized
}

func boolPtrMaybe(value any) *bool {
	typed, ok := value.(bool)
	if !ok {
		return nil
	}
	return &typed
}

func stringSlice(value any) []string {
	items := anySlice(value)
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, serverAsString(item))
	}
	return out
}

func anySlice(value any) []any {
	if typed, ok := value.([]any); ok {
		return typed
	}
	return []any{}
}

func mapMaybe(value any) map[string]any {
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return map[string]any{}
}

func anyMapSlice(value any) []map[string]any {
	raw, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if cast, ok := item.(map[string]any); ok {
			out = append(out, cast)
		}
	}
	return out
}

func roleIDsAsStrings(items []map[string]any) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		if role := item["role"]; role != nil {
			out = append(out, serverAsString(role))
		}
	}
	return out
}

func positionRoleIDsAsStrings(items []map[string]any, roleType string) []string {
	out := make([]string, 0)
	for _, item := range items {
		if serverAsString(item["type"]) == roleType {
			out = append(out, serverAsString(item["role"]))
		}
	}
	return out
}

func familyRoleTarget(roleType string) (collection string, internalType string) {
	switch roleType {
	case "family":
		return "generalrole", ""
	case "not_family":
		return "linkrole", ""
	case "only_family":
		return "familyexclusiveroles", ""
	case "ignored":
		return "evalignore", ""
	case "family_member":
		return "family_roles", "family_member_roles"
	case "family_elder":
		return "family_roles", "family_elder_roles"
	case "family_coleader":
		return "family_roles", "family_co-leader_roles"
	case "family_leader":
		return "family_roles", "family_leader_roles"
	default:
		return "", ""
	}
}

func ensureFamilyRoleNotExists(ctx context.Context, collection *mongo.Collection, filter bson.M) error {
	var query bson.M
	query = bson.M{
		"server": filter["server"],
		"role":   filter["role"],
	}
	if roleType, ok := filter["type"]; ok {
		query["type"] = roleType
	}
	_, err := findOneMap(ctx, collection, query)
	if err == nil {
		return apptypes.Error(http.StatusBadRequest, "Family role already exists")
	}
	if err != mongo.ErrNoDocuments {
		return err
	}
	return nil
}
