package server

import (
	"encoding/json"
	"net/http"
	"strconv"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// listRoles godoc
// @Summary List roles by type
// @Description Returns all roles of a given type configured for the server.
// @Tags Server Roles
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param role_type path string true "Role type (clan, league, townhall, status...)"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/roles/{role_type} [get]
func listRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roleType := c.Params("role_type")
		var items []map[string]any
		if roleType == "status" {
			serverDoc, err := sqlServerSettingsDoc(c, rt, serverID)
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
			if serverRoleCollections[roleType] == "" {
				return apptypes.Error(http.StatusBadRequest, "Unsupported role type")
			}
			items, err = sqlRoleBindings(c, rt, serverID, roleType)
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

// createRole godoc
// @Summary Create a role
// @Description Creates a new role of a given type for the server.
// @Tags Server Roles
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param role_type path string true "Role type"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/roles/{role_type} [post]
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
		if _, err := sqlServerSettingsDoc(c, rt, serverID); err != nil {
			return notFoundErr(err, "Server not found")
		}
		body["server"] = serverID
		if roleType == "status" {
			roleID := body["id"]
			err := sqlAddStatusRole(c, rt, serverID, body)
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
		if serverRoleCollections[roleType] == "" {
			return apptypes.Error(http.StatusBadRequest, "Unsupported role type")
		}
		roleID := serverAsString(firstNonNil(body["role"], body["id"]))
		if roleID == "" {
			return apptypes.Error(http.StatusBadRequest, "role is required")
		}
		_, err = rt.Store.SQL.Exec(c.UserContext(), `
			INSERT INTO role_bindings (server_id, role_type, role_key, role_id, data, created_at, updated_at)
			VALUES ($1, $2, '', $3, $4::jsonb, now(), now())
			ON CONFLICT (server_id, role_type, role_key, role_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
		`, strconv.Itoa(serverID), roleType, roleID, apptypes.Marshal(body))
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
}

// deleteRole godoc
// @Summary Delete a role
// @Description Deletes a role by type and ID.
// @Tags Server Roles
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param role_type path string true "Role type"
// @Param role_id path string true "Role ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/roles/{role_type}/{role_id} [delete]
func deleteRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roleType := c.Params("role_type")
		roleID := c.Params("role_id")
		if roleType == "status" {
			err := sqlDeleteStatusRole(c, rt, serverID, roleID)
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
		if serverRoleCollections[roleType] == "" {
			return apptypes.Error(http.StatusBadRequest, "Unsupported role type")
		}
		result, err := rt.Store.SQL.Exec(c.UserContext(), `DELETE FROM role_bindings WHERE server_id = $1 AND role_type = $2 AND role_id = $3`, strconv.Itoa(serverID), roleType, roleID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
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

// getRoleSettings godoc
// @Summary Get role settings
// @Description Returns the role evaluation settings for a server.
// @Tags Server Roles
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/role-settings [get]
func getRoleSettings(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		serverDoc, err := sqlServerSettingsDoc(c, rt, serverID)
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
			CategoryRoles:    categoryRolesStrings(serverDoc["category_roles"]),
		})
	}
}

// patchRoleSettings godoc
// @Summary Update role settings
// @Description Partially updates the role evaluation settings for a server.
// @Tags Server Roles
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/role-settings [patch]
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
		setDoc := map[string]any{}
		unsetDoc := map[string]any{}
		if body.AutoEvalStatus != nil {
			setDoc["autoeval"] = *body.AutoEvalStatus
		} else if body.Autoeval != nil {
			setDoc["autoeval"] = *body.Autoeval
		}
		if body.AutoEvalNickname != nil {
			setDoc["auto_eval_nickname"] = *body.AutoEvalNickname
		}
		if body.AutoevalTriggers != nil {
			setDoc["autoeval_triggers"] = body.AutoevalTriggers
		}
		if body.AutoevalLog != nil {
			setDoc["autoeval_log"] = body.AutoevalLog
		}
		if body.BlacklistedRoles != nil {
			setDoc["blacklisted_roles"] = body.BlacklistedRoles
		}
		if body.RoleTreatment != nil {
			setDoc["role_treatment"] = body.RoleTreatment
		}
		for category, roleVal := range body.CategoryRoles {
			key := "category_roles." + category
			roleStr := serverAsString(roleVal)
			if roleStr == "" || roleVal == nil {
				unsetDoc[key] = ""
			} else {
				setDoc[key] = numericMaybe(roleStr)
			}
		}
		if len(setDoc) == 0 && len(unsetDoc) == 0 {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		for key := range unsetDoc {
			delete(setDoc, key)
		}
		result, err := rt.Store.SQL.Exec(c.UserContext(), `UPDATE servers SET data = data || $2::jsonb, updated_at = now() WHERE id = $1`, strconv.Itoa(serverID), apptypes.Marshal(setDoc))
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
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

// getAllRoles godoc
// @Summary Get all roles
// @Description Returns all roles of every type configured for the server.
// @Tags Server Roles
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/all-roles [get]
func getAllRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := sqlServerSettingsDoc(c, rt, serverID); err != nil {
			return notFoundErr(err, "Server not found")
		}
		out := map[string][]map[string]any{}
		totalCount := 0
		for roleType := range serverRoleCollections {
			items, _ := sqlRoleBindings(c, rt, serverID, roleType)
			sanitized := sanitizeRoleList(items)
			out[roleType] = sanitized
			totalCount += len(sanitized)
		}
		serverDoc, _ := sqlServerSettingsDoc(c, rt, serverID)
		statusRoles, _ := serverDoc["status_roles"].(map[string]any)
		status := sanitizeRoleList(anyMapSlice(statusRoles["discord"]))
		out["status"] = status
		totalCount += len(status)
		return apptypes.JSON(c, http.StatusOK, modelsv2.AllRolesResponse{
			ServerID:      serverID,
			Roles:         out,
			CategoryRoles: categoryRolesStrings(serverDoc["category_roles"]),
			TotalCount:    totalCount,
		})
	}
}

// getFamilyRoles godoc
// @Summary Get family roles
// @Description Returns all family-related role configurations for the server.
// @Tags Server Roles
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/family-roles [get]
func getFamilyRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := sqlServerSettingsDoc(c, rt, serverID); err != nil {
			return notFoundErr(err, "Server not found")
		}
		familyRoles, _ := sqlRoleBindings(c, rt, serverID, "family")
		notFamilyRoles, _ := sqlRoleBindings(c, rt, serverID, "not_family")
		onlyFamilyRoles, _ := sqlRoleBindings(c, rt, serverID, "only_family")
		ignoredRoles, _ := sqlRoleBindings(c, rt, serverID, "ignored")
		positionRoles, _ := sqlRoleBindings(c, rt, serverID, "family_position")

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

// addFamilyRole godoc
// @Summary Add a family role
// @Description Adds a Discord role to a family role category.
// @Tags Server Roles
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Router /v2/server/{server_id}/family-roles [post]
func addFamilyRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		if _, err := sqlServerSettingsDoc(c, rt, serverID); err != nil {
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
		doc := map[string]any{"server": serverID, "role": numericMaybe(serverAsString(body.Role))}
		if internalType != "" {
			doc["type"] = internalType
		}
		_ = collectionName
		roleKey := internalType
		if roleKey == "" {
			roleKey = body.Type
		}
		_, err = rt.Store.SQL.Exec(c.UserContext(), `
			INSERT INTO role_bindings (server_id, role_type, role_key, role_id, data, created_at, updated_at)
			VALUES ($1, 'family_position', $2, $3, $4::jsonb, now(), now())
			ON CONFLICT (server_id, role_type, role_key, role_id) DO NOTHING
		`, strconv.Itoa(serverID), roleKey, serverAsString(body.Role), apptypes.Marshal(doc))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.FamilyRoleOperationResponse{
			Message:  "Family role added successfully",
			ServerID: serverID,
			RoleType: body.Type,
			RoleID:   serverAsString(body.Role),
		})
	}
}

// removeFamilyRole godoc
// @Summary Remove a family role
// @Description Removes a Discord role from a family role category.
// @Tags Server Roles
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param role_type path string true "Family role type"
// @Param role_id path string true "Discord Role ID"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 401 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Router /v2/server/{server_id}/family-roles/{role_type}/{role_id} [delete]
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
		_ = collectionName
		roleKey := internalType
		if roleKey == "" {
			roleKey = roleType
		}
		result, err := rt.Store.SQL.Exec(c.UserContext(), `
			DELETE FROM role_bindings
			WHERE server_id = $1 AND role_type = 'family_position' AND role_key = $2 AND role_id = $3
		`, strconv.Itoa(serverID), roleKey, roleID)
		if err != nil {
			return err
		}
		if result.RowsAffected() == 0 {
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
	if sanitized, ok := sanitize(value).([]any); ok {
		return sanitized
	}
	return []any{}
}

func mapMaybe(value any) map[string]any {
	if sanitized, ok := sanitize(value).(map[string]any); ok {
		return sanitized
	}
	return map[string]any{}
}

func categoryRolesStrings(value any) map[string]string {
	raw := mapMaybe(value)
	out := make(map[string]string, len(raw))
	for k, v := range raw {
		out[k] = serverAsString(v)
	}
	return out
}

func anyMapSlice(value any) []map[string]any {
	raw := anySlice(value)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if cast := mapMaybe(item); len(cast) > 0 {
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

func sqlRoleBindings(c *fiber.Ctx, rt apptypes.Deps, serverID int, roleType string) ([]map[string]any, error) {
	query := `
		SELECT role_key, role_id, data
		FROM role_bindings
		WHERE server_id = $1 AND role_type = $2
	`
	args := []any{strconv.Itoa(serverID), roleType}
	if roleType == "family_position" {
		query = `
			SELECT role_key, role_id, data
			FROM role_bindings
			WHERE server_id = $1 AND role_type = $2
		`
	}
	rows, err := rt.Store.SQL.Query(c.UserContext(), query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var roleKey, roleID string
		var raw []byte
		if err := rows.Scan(&roleKey, &roleID, &raw); err != nil {
			return nil, err
		}
		doc := map[string]any{}
		_ = json.Unmarshal(raw, &doc)
		doc["server"] = serverID
		doc["role"] = roleID
		doc["id"] = roleID
		if roleKey != "" {
			doc["type"] = roleKey
		}
		items = append(items, doc)
	}
	return items, rows.Err()
}

func sqlAddStatusRole(c *fiber.Ctx, rt apptypes.Deps, serverID int, body map[string]any) error {
	serverDoc, err := sqlServerSettingsDoc(c, rt, serverID)
	if err != nil {
		return err
	}
	statusRoles := mapMaybe(serverDoc["status_roles"])
	discordRoles := anyMapSlice(statusRoles["discord"])
	roleID := serverAsString(body["id"])
	replaced := false
	for i, role := range discordRoles {
		if serverAsString(role["id"]) == roleID {
			discordRoles[i] = body
			replaced = true
			break
		}
	}
	if !replaced {
		discordRoles = append(discordRoles, body)
	}
	statusRoles["discord"] = discordRoles
	_, err = rt.Store.SQL.Exec(c.UserContext(), `UPDATE servers SET status_roles = $2::jsonb, data = data || jsonb_build_object('status_roles', $2::jsonb), updated_at = now() WHERE id = $1`, strconv.Itoa(serverID), apptypes.Marshal(statusRoles))
	return err
}

func sqlDeleteStatusRole(c *fiber.Ctx, rt apptypes.Deps, serverID int, roleID string) error {
	serverDoc, err := sqlServerSettingsDoc(c, rt, serverID)
	if err != nil {
		return err
	}
	statusRoles := mapMaybe(serverDoc["status_roles"])
	discordRoles := anyMapSlice(statusRoles["discord"])
	filtered := discordRoles[:0]
	for _, role := range discordRoles {
		if serverAsString(role["id"]) != roleID {
			filtered = append(filtered, role)
		}
	}
	statusRoles["discord"] = filtered
	_, err = rt.Store.SQL.Exec(c.UserContext(), `UPDATE servers SET status_roles = $2::jsonb, data = data || jsonb_build_object('status_roles', $2::jsonb), updated_at = now() WHERE id = $1`, strconv.Itoa(serverID), apptypes.Marshal(statusRoles))
	return err
}
