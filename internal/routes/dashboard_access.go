package routes

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"

	modelsv2 "github.com/ClashKingInc/ClashKingAPI/internal/models/v2"
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

var dashboardSectionSet = func() map[string]struct{} {
	out := make(map[string]struct{}, len(dashboardSections))
	for _, section := range dashboardSections {
		out[section] = struct{}{}
	}
	return out
}()

// getDashboardAccess returns role choices and the configured grants.
// @Summary Get dashboard role access
// @Description Returns assignable Discord roles and role grants. Requires Manage Guild permission.
// @Tags Dashboard Access
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Success 200 {object} modelsv2.DashboardAccessConfig
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/dashboard-access [get]
func getDashboardAccess(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := strings.TrimSpace(c.Params("server_id"))
		guildID, err := strconv.ParseInt(serverID, 10, 64)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid server_id")
		}
		roles, err := a.Discord.GetRoles(c.UserContext(), guildID)
		if err != nil {
			return apptypes.Error(fiber.StatusBadGateway, "Failed to fetch Discord roles")
		}
		available := make([]modelsv2.DashboardAccessRole, 0, len(roles))
		for _, role := range roles {
			if role.Managed || role.ID.String() == serverID {
				continue
			}
			available = append(available, modelsv2.DashboardAccessRole{ID: role.ID.String(), Name: role.Name, Color: int(role.Color), Position: role.Position})
		}
		sort.Slice(available, func(i, j int) bool { return available[i].Position > available[j].Position })

		grants, err := readDashboardGrants(c, a, serverID)
		if err != nil {
			return err
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.DashboardAccessConfig{ServerID: serverID, Roles: available, Grants: grants, Sections: dashboardSections})
	}
}

// putDashboardAccess atomically replaces role grants for a server.
// @Summary Replace dashboard role access
// @Description Replaces all dashboard role grants. Managed roles and @everyone are rejected. Requires Manage Guild permission.
// @Tags Dashboard Access
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Param body body modelsv2.DashboardAccessUpdate true "Role grants"
// @Success 200 {object} modelsv2.DashboardAccessConfig
// @Failure 400 {object} modelsv2.ErrorResponse
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/dashboard-access [put]
func putDashboardAccess(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := strings.TrimSpace(c.Params("server_id"))
		guildID, err := strconv.ParseInt(serverID, 10, 64)
		if err != nil {
			return apptypes.Error(fiber.StatusBadRequest, "Invalid server_id")
		}
		var body modelsv2.DashboardAccessUpdate
		if err := apptypes.DecodeJSON(c, &body); err != nil {
			return err
		}
		roles, err := a.Discord.GetRoles(c.UserContext(), guildID)
		if err != nil {
			return apptypes.Error(fiber.StatusBadGateway, "Failed to fetch Discord roles")
		}
		assignable := make(map[string]struct{}, len(roles))
		for _, role := range roles {
			if !role.Managed && role.ID.String() != serverID {
				assignable[role.ID.String()] = struct{}{}
			}
		}
		seen := make(map[string]struct{}, len(body.Grants))
		for _, grant := range body.Grants {
			if _, ok := assignable[grant.RoleID]; !ok {
				return apptypes.Error(fiber.StatusBadRequest, "A selected role is managed, missing, or @everyone")
			}
			if _, ok := dashboardSectionSet[grant.Section]; !ok {
				return apptypes.Error(fiber.StatusBadRequest, "Invalid dashboard section")
			}
			if grant.AccessLevel != modelsv2.DashboardAccessView && grant.AccessLevel != modelsv2.DashboardAccessManage {
				return apptypes.Error(fiber.StatusBadRequest, "access_level must be view or manage")
			}
			key := grant.RoleID + ":" + grant.Section
			if _, ok := seen[key]; ok {
				return apptypes.Error(fiber.StatusBadRequest, "Duplicate role and section grant")
			}
			seen[key] = struct{}{}
		}

		before, err := readDashboardGrants(c, a, serverID)
		if err != nil {
			return err
		}
		tx, err := a.Store.SQL.Begin(c.UserContext())
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback(c.UserContext()) }()
		if _, err := tx.Exec(c.UserContext(), `DELETE FROM dashboard_role_grants WHERE server_id = $1`, serverID); err != nil {
			return err
		}
		actorID := apptypes.UserID(c.UserContext())
		for _, grant := range body.Grants {
			if _, err := tx.Exec(c.UserContext(), `INSERT INTO dashboard_role_grants (server_id, role_id, section, access_level, created_by_user_id) VALUES ($1, $2, $3, $4, $5)`, serverID, grant.RoleID, grant.Section, grant.AccessLevel, actorID); err != nil {
				return err
			}
		}
		beforeJSON, _ := json.Marshal(before)
		afterJSON, _ := json.Marshal(body.Grants)
		if _, err := tx.Exec(c.UserContext(), `INSERT INTO dashboard_access_audit (server_id, actor_user_id, before_grants, after_grants) VALUES ($1, $2, $3::jsonb, $4::jsonb)`, serverID, actorID, beforeJSON, afterJSON); err != nil {
			return err
		}
		if err := tx.Commit(c.UserContext()); err != nil {
			return err
		}
		invalidateServerAccess(serverID)
		return apptypes.JSON(c, http.StatusOK, modelsv2.DashboardAccessConfig{ServerID: serverID, Grants: body.Grants, Sections: dashboardSections})
	}
}

// getDashboardCapabilities returns effective access for the current user.
// @Summary Get effective dashboard capabilities
// @Description Returns the current user's effective view/manage access by dashboard section.
// @Tags Dashboard Access
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Discord server ID"
// @Success 200 {object} modelsv2.DashboardCapabilities
// @Failure 401 {object} modelsv2.ErrorResponse
// @Failure 403 {object} modelsv2.ErrorResponse
// @Router /v2/server/{server_id}/dashboard-capabilities [get]
func getDashboardCapabilities(a apptypes.Deps) fiber.Handler {
	return func(c *fiber.Ctx) error {
		serverID := strings.TrimSpace(c.Params("server_id"))
		userID := apptypes.UserID(c.UserContext())
		entry, ok := cachedServerAccess(userID, serverID)
		if !ok {
			if isBotPrincipal(c) || a.Config.Local && userID == a.Config.DevUserID {
				entry = serverAccessCacheEntry{manager: true, sections: map[string]string{}}
			} else {
				var err error
				entry, err = resolveDashboardAccessOnce(c, a, userID, serverID)
				if err != nil {
					return err
				}
			}
			setCachedServerAccess(userID, serverID, entry)
		}
		if !entry.manager && len(entry.sections) == 0 {
			return apptypes.Error(fiber.StatusForbidden, "You do not have dashboard access")
		}
		sections := entry.sections
		if entry.manager {
			sections = make(map[string]string, len(dashboardSections))
			for _, section := range dashboardSections {
				sections[section] = "manage"
			}
		}
		return apptypes.JSON(c, http.StatusOK, modelsv2.DashboardCapabilities{ServerID: serverID, FullAccess: entry.manager, Sections: sections})
	}
}

func readDashboardGrants(c *fiber.Ctx, a apptypes.Deps, serverID string) ([]modelsv2.DashboardAccessGrant, error) {
	rows, err := a.Store.SQL.Query(c.UserContext(), `SELECT role_id, section, access_level FROM dashboard_role_grants WHERE server_id = $1 ORDER BY role_id, section`, serverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	grants := make([]modelsv2.DashboardAccessGrant, 0)
	for rows.Next() {
		var grant modelsv2.DashboardAccessGrant
		if err := rows.Scan(&grant.RoleID, &grant.Section, &grant.AccessLevel); err != nil {
			return nil, err
		}
		grants = append(grants, grant)
	}
	return grants, rows.Err()
}
