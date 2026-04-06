package routes

import (
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

// createRoster godoc
// @Summary Create roster
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Success 501 {object} map[string]string
// @Router /v2/roster [post]
func createRoster() fiber.Handler { return apptypes.NotImplemented }

// getMissingMembers godoc
// @Summary Get missing members
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Success 501 {object} map[string]string
// @Router /v2/roster/missing-members [get]
func getMissingMembers() fiber.Handler { return apptypes.NotImplemented }

// updateRoster godoc
// @Summary Update roster
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster/{roster_id} [patch]
func updateRoster() fiber.Handler { return apptypes.NotImplemented }

// getRoster godoc
// @Summary Get roster
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster/{roster_id} [get]
func getRoster() fiber.Handler { return apptypes.NotImplemented }

// deleteRoster godoc
// @Summary Delete roster
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster/{roster_id} [delete]
func deleteRoster() fiber.Handler { return apptypes.NotImplemented }

// removeRosterMember godoc
// @Summary Remove roster member
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Param player_tag path string true "Player tag"
// @Success 501 {object} map[string]string
// @Router /v2/roster/{roster_id}/members/{player_tag} [delete]
func removeRosterMember() fiber.Handler { return apptypes.NotImplemented }

// refreshRosters godoc
// @Summary Refresh rosters
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Success 501 {object} map[string]string
// @Router /v2/roster/refresh [post]
func refreshRosters() fiber.Handler { return apptypes.NotImplemented }

// cloneRoster godoc
// @Summary Clone roster
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster/{roster_id}/clone [post]
func cloneRoster() fiber.Handler { return apptypes.NotImplemented }

// listRosters godoc
// @Summary List rosters
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Server ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster/{server_id}/list [get]
func listRosters() fiber.Handler { return apptypes.NotImplemented }

// createRosterGroup godoc
// @Summary Create roster group
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Success 501 {object} map[string]string
// @Router /v2/roster-group [post]
func createRosterGroup() fiber.Handler { return apptypes.NotImplemented }

// listRosterGroups godoc
// @Summary List roster groups
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Success 501 {object} map[string]string
// @Router /v2/roster-group/list [get]
func listRosterGroups() fiber.Handler { return apptypes.NotImplemented }

// getRosterGroup godoc
// @Summary Get roster group
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param group_id path string true "Group ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster-group/{group_id} [get]
func getRosterGroup() fiber.Handler { return apptypes.NotImplemented }

// updateRosterGroup godoc
// @Summary Update roster group
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param group_id path string true "Group ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster-group/{group_id} [patch]
func updateRosterGroup() fiber.Handler { return apptypes.NotImplemented }

// deleteRosterGroup godoc
// @Summary Delete roster group
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param group_id path string true "Group ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster-group/{group_id} [delete]
func deleteRosterGroup() fiber.Handler { return apptypes.NotImplemented }

// createRosterSignupCategory godoc
// @Summary Create roster signup category
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Success 501 {object} map[string]string
// @Router /v2/roster-signup-category [post]
func createRosterSignupCategory() fiber.Handler { return apptypes.NotImplemented }

// listRosterSignupCategories godoc
// @Summary List roster signup categories
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Success 501 {object} map[string]string
// @Router /v2/roster-signup-category/list [get]
func listRosterSignupCategories() fiber.Handler { return apptypes.NotImplemented }

// updateRosterSignupCategory godoc
// @Summary Update roster signup category
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param custom_id path string true "Custom ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster-signup-category/{custom_id} [patch]
func updateRosterSignupCategory() fiber.Handler { return apptypes.NotImplemented }

// deleteRosterSignupCategory godoc
// @Summary Delete roster signup category
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param custom_id path string true "Custom ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster-signup-category/{custom_id} [delete]
func deleteRosterSignupCategory() fiber.Handler { return apptypes.NotImplemented }

// manageRosterMembers godoc
// @Summary Manage roster members
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster/{roster_id}/members [post]
func manageRosterMembers() fiber.Handler { return apptypes.NotImplemented }

// updateRosterMember godoc
// @Summary Update roster member
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Param member_tag path string true "Member tag"
// @Success 501 {object} map[string]string
// @Router /v2/roster/{roster_id}/members/{member_tag} [patch]
func updateRosterMember() fiber.Handler { return apptypes.NotImplemented }

// refreshRosterMember godoc
// @Summary Refresh roster member
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param roster_id path string true "Roster ID"
// @Param member_tag path string true "Member tag"
// @Success 501 {object} map[string]string
// @Router /v2/roster/{roster_id}/members/{member_tag}/refresh [post]
func refreshRosterMember() fiber.Handler { return apptypes.NotImplemented }

// createRosterAutomation godoc
// @Summary Create roster automation
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Success 501 {object} map[string]string
// @Router /v2/roster-automation [post]
func createRosterAutomation() fiber.Handler { return apptypes.NotImplemented }

// listRosterAutomation godoc
// @Summary List roster automation
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Success 501 {object} map[string]string
// @Router /v2/roster-automation/list [get]
func listRosterAutomation() fiber.Handler { return apptypes.NotImplemented }

// updateRosterAutomation godoc
// @Summary Update roster automation
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param automation_id path string true "Automation ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster-automation/{automation_id} [patch]
func updateRosterAutomation() fiber.Handler { return apptypes.NotImplemented }

// deleteRosterAutomation godoc
// @Summary Delete roster automation
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param automation_id path string true "Automation ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster-automation/{automation_id} [delete]
func deleteRosterAutomation() fiber.Handler { return apptypes.NotImplemented }

// getServerClanMembers godoc
// @Summary Get server clan members
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Server ID"
// @Success 501 {object} map[string]string
// @Router /v2/roster/server/{server_id}/members [get]
func getServerClanMembers() fiber.Handler { return apptypes.NotImplemented }

// generateRosterToken godoc
// @Summary Generate roster token
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Success 501 {object} map[string]string
// @Router /v2/roster-token [post]
func generateRosterToken() fiber.Handler { return apptypes.NotImplemented }

// getDiscordChannels godoc
// @Summary Get discord channels
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Server ID"
// @Success 501 {object} map[string]string
// @Router /v2/server/{server_id}/discord-channels [get]
func getDiscordChannels() fiber.Handler { return apptypes.NotImplemented }

// testDiscordAPI godoc
// @Summary Test discord API
// @Description Currently returns not implemented.
// @Tags Rosters
// @Produce json
// @Security ApiKeyAuth
// @Param server_id path string true "Server ID"
// @Success 501 {object} map[string]string
// @Router /v2/server/{server_id}/discord-test [get]
func testDiscordAPI() fiber.Handler { return apptypes.NotImplemented }
