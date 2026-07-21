package server

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// listServerRoles godoc
// @Summary List server roles
// @Description Returns configured roles for a server. Use type and clan_tag to filter the list.
// @Tags Server Roles
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param type query string false "Role type"
// @Param clan_tag query string false "Clan tag"
// @Success 200 {object} modelsv2.ServerRolesResponse
// @Router /v2/server/{server_id}/server-roles [get]
func listServerRoles(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		roles, err := queryServerRoles(c, rt, serverID, strings.TrimSpace(c.Query("type")), serverNormalizeTag(c.Query("clan_tag")))
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerRolesResponse{ServerID: serverID, Roles: roles, Count: len(roles)})
	}
}

// createServerRole godoc
// @Summary Create a server role
// @Description Creates one server-level or clan-level role configuration.
// @Tags Server Roles
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Success 201 {object} modelsv2.ServerRoleResponse
// @Router /v2/server/{server_id}/server-roles [post]
func createServerRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		var body modelsv2.ServerRoleCreate
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		role, err := normalizedServerRoleInput(serverID, body)
		if err != nil {
			return err
		}
		created, err := insertServerRole(c, rt, role)
		if err != nil {
			return serverRoleWriteError(err)
		}
		return apptypes.JSON(c, http.StatusCreated, modelsv2.ServerRoleResponse{Message: "Server role created.", Role: created})
	}
}

// patchServerRole godoc
// @Summary Update a server role
// @Description Updates one server role configuration.
// @Tags Server Roles
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param role_id path string true "Server role ID"
// @Success 200 {object} modelsv2.ServerRoleResponse
// @Router /v2/server/{server_id}/server-roles/{role_id} [patch]
func patchServerRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		current, err := getServerRole(c, rt, serverID, c.Params("role_id"))
		if err != nil {
			return serverRoleLookupError(err)
		}
		var body modelsv2.ServerRoleUpdate
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		if body.Type != nil {
			current.Type = strings.TrimSpace(*body.Type)
		}
		if body.Option != nil {
			current.Option = strings.TrimSpace(*body.Option)
		}
		if body.RoleID != nil {
			current.RoleID = strings.TrimSpace(*body.RoleID)
		}
		if body.Mode != nil {
			current.Mode = strings.TrimSpace(*body.Mode)
		}
		if body.ClanTag != nil {
			if tag := serverNormalizeTag(*body.ClanTag); tag != "" {
				current.ClanTag = &tag
			} else {
				current.ClanTag = nil
			}
		}
		if err := validateServerRole(current); err != nil {
			return err
		}
		updated, err := updateServerRole(c, rt, current)
		if err != nil {
			return serverRoleWriteError(err)
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerRoleResponse{Message: "Server role updated.", Role: updated})
	}
}

// deleteServerRole godoc
// @Summary Delete a server role
// @Description Deletes one server role configuration.
// @Tags Server Roles
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path int true "Server ID"
// @Param role_id path string true "Server role ID"
// @Success 200 {object} modelsv2.ServerRoleResponse
// @Router /v2/server/{server_id}/server-roles/{role_id} [delete]
func deleteServerRole(rt apptypes.Deps) apptypes.HandlerFunc {
	return func(c *fiber.Ctx) error {
		serverID, err := pathInt(c, "server_id")
		if err != nil {
			return err
		}
		role, err := scanServerRole(rt.Store.SQL.QueryRow(c.UserContext(), `
			DELETE FROM server_roles WHERE server_id = $1 AND id = $2::uuid
			RETURNING id::text, server_id, clan_tag, type, option, role_id, mode, created_at, updated_at
		`, strconv.Itoa(serverID), c.Params("role_id")))
		if err != nil {
			return serverRoleLookupError(err)
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.ServerRoleResponse{Message: "Server role deleted.", Role: role})
	}
}

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
			AutoevalLog:      stringPtrMaybe(serverDoc["autoeval_log"]),
			BlacklistedRoles: stringSlice(serverDoc["blacklisted_roles"]),
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
		settingsUpdate := modelsv2.ServerSettingsUpdate{
			Autoeval:         body.AutoEvalStatus,
			AutoEvalNickname: body.AutoEvalNickname,
			AutoevalTriggers: body.AutoevalTriggers,
			AutoevalLog:      body.AutoevalLog,
			BlacklistedRoles: body.BlacklistedRoles,
		}
		if body.AutoEvalStatus == nil && body.AutoEvalNickname == nil && body.AutoevalLog == nil && body.AutoevalTriggers == nil && body.BlacklistedRoles == nil {
			return apptypes.Error(http.StatusBadRequest, "No fields to update")
		}
		if err := updateNormalizedServerSettings(c, rt, serverID, settingsUpdate); err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, map[string]any{"message": "Role settings updated.", "server_id": serverID})
	}
}

func normalizedServerRoleInput(serverID int, body modelsv2.ServerRoleCreate) (modelsv2.ServerRole, error) {
	role := modelsv2.ServerRole{
		ServerID: serverID,
		Type:     strings.TrimSpace(body.Type),
		Option:   strings.TrimSpace(body.Option),
		RoleID:   strings.TrimSpace(body.RoleID),
		Mode:     strings.TrimSpace(body.Mode),
	}
	if role.Mode == "" {
		role.Mode = "both"
	}
	if body.ClanTag != nil {
		if tag := serverNormalizeTag(*body.ClanTag); tag != "" {
			role.ClanTag = &tag
		}
	}
	return role, validateServerRole(role)
}

func validateServerRole(role modelsv2.ServerRole) error {
	if !modelsv2.HasEnumValue(modelsv2.RoleTypeEnums, role.Type) {
		return apptypes.Error(http.StatusBadRequest, "Unknown role type")
	}
	if !modelsv2.HasEnumValue(modelsv2.RoleModeEnums, role.Mode) {
		return apptypes.Error(http.StatusBadRequest, "Unknown role mode")
	}
	if role.Option == "" {
		return apptypes.Error(http.StatusBadRequest, "option is required")
	}
	if role.RoleID == "" {
		return apptypes.Error(http.StatusBadRequest, "role_id is required")
	}
	if role.ClanTag != nil && role.Type != "clan_role" {
		return apptypes.Error(http.StatusBadRequest, "Only clan_role can use clan_tag")
	}
	if role.Type == "family" && role.Option != "family" && role.Option != "not_family" {
		return apptypes.Error(http.StatusBadRequest, "Family roles only support family and not_family options")
	}
	if role.Type == "clan_role" {
		supported := role.Option == "member" || role.Option == "elder" || role.Option == "co_leader" || role.Option == "leader"
		if !supported {
			return apptypes.Error(http.StatusBadRequest, "Unknown clan role option")
		}
		if role.ClanTag == nil && role.Option == "member" {
			return apptypes.Error(http.StatusBadRequest, "Server-level Member is the same as Family; use the family role type")
		}
	}
	return nil
}

func queryServerRoles(c *fiber.Ctx, rt apptypes.Deps, serverID int, roleType, clanTag string) ([]modelsv2.ServerRole, error) {
	rows, err := rt.Store.SQL.Query(c.UserContext(), `
		SELECT id::text, server_id, clan_tag, type, option, role_id, mode, created_at, updated_at
		FROM server_roles
		WHERE server_id = $1
		  AND ($2 = '' OR type = $2)
		  AND ($3 = '' OR clan_tag = $3)
		ORDER BY type, option, clan_tag NULLS FIRST, role_id
	`, strconv.Itoa(serverID), roleType, clanTag)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	roles := []modelsv2.ServerRole{}
	for rows.Next() {
		role, err := scanServerRole(rows)
		if err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

func getServerRole(c *fiber.Ctx, rt apptypes.Deps, serverID int, roleID string) (modelsv2.ServerRole, error) {
	return scanServerRole(rt.Store.SQL.QueryRow(c.UserContext(), `
		SELECT id::text, server_id, clan_tag, type, option, role_id, mode, created_at, updated_at
		FROM server_roles WHERE server_id = $1 AND id = $2::uuid
	`, strconv.Itoa(serverID), roleID))
}

func insertServerRole(c *fiber.Ctx, rt apptypes.Deps, role modelsv2.ServerRole) (modelsv2.ServerRole, error) {
	return scanServerRole(rt.Store.SQL.QueryRow(c.UserContext(), `
		INSERT INTO server_roles (server_id, clan_tag, type, option, role_id, mode)
		SELECT id, $2, $3, $4, $5, $6 FROM servers WHERE id = $1
		RETURNING id::text, server_id, clan_tag, type, option, role_id, mode, created_at, updated_at
	`, strconv.Itoa(role.ServerID), role.ClanTag, role.Type, role.Option, role.RoleID, role.Mode))
}

func updateServerRole(c *fiber.Ctx, rt apptypes.Deps, role modelsv2.ServerRole) (modelsv2.ServerRole, error) {
	return scanServerRole(rt.Store.SQL.QueryRow(c.UserContext(), `
		UPDATE server_roles SET clan_tag = $3, type = $4, option = $5, role_id = $6, mode = $7, updated_at = now()
		WHERE server_id = $1 AND id = $2::uuid
		RETURNING id::text, server_id, clan_tag, type, option, role_id, mode, created_at, updated_at
	`, strconv.Itoa(role.ServerID), role.ID, role.ClanTag, role.Type, role.Option, role.RoleID, role.Mode))
}

type serverRoleScanner interface {
	Scan(dest ...any) error
}

func scanServerRole(row serverRoleScanner) (modelsv2.ServerRole, error) {
	var role modelsv2.ServerRole
	var serverID string
	var createdAt, updatedAt time.Time
	err := row.Scan(&role.ID, &serverID, &role.ClanTag, &role.Type, &role.Option, &role.RoleID, &role.Mode, &createdAt, &updatedAt)
	if err != nil {
		return role, err
	}
	role.ServerID, _ = strconv.Atoi(serverID)
	role.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	role.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	return role, nil
}

func serverRoleWriteError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return apptypes.Error(http.StatusNotFound, "Server or clan not found")
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			return apptypes.Error(http.StatusConflict, "Server role already exists")
		case "23503":
			return apptypes.Error(http.StatusNotFound, "Server or clan not found")
		case "23514":
			return apptypes.Error(http.StatusBadRequest, "Server role is invalid")
		}
	}
	return err
}

func serverRoleLookupError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return apptypes.Error(http.StatusNotFound, "Server role not found")
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "22P02" {
		return apptypes.Error(http.StatusBadRequest, "role_id must be a UUID")
	}
	return err
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
