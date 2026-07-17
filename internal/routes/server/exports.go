package server

import (
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func AddBan(a apptypes.Deps) fiber.Handler { return addBan(a) }

func AddFamilyRole(a apptypes.Deps) fiber.Handler { return addFamilyRole(a) }

func AddServerClan(a apptypes.Deps) fiber.Handler { return addServerClan(a) }

func AddStrike(a apptypes.Deps) fiber.Handler { return addStrike(a) }

func CreateAutoboard(a apptypes.Deps) fiber.Handler { return createAutoboard(a) }

func CreateReminder(a apptypes.Deps) fiber.Handler { return createReminder(a) }

func CreateRole(a apptypes.Deps) fiber.Handler { return createRole(a) }

func CreateServerEmbed(a apptypes.Deps) fiber.Handler { return createServerEmbed(a) }

func CreateServerGiveaway(a apptypes.Deps) fiber.Handler { return createServerGiveaway(a) }

func CreateTicketButton(a apptypes.Deps) fiber.Handler { return createTicketButton(a) }

func CreateTicketPanel(a apptypes.Deps) fiber.Handler { return createTicketPanel(a) }

func DeleteAutoboard(a apptypes.Deps) fiber.Handler { return deleteAutoboard(a) }

func DeleteClanLogs(a apptypes.Deps) fiber.Handler { return deleteClanLogs(a) }

func DeleteLink(a apptypes.Deps) fiber.Handler { return deleteLink(a) }

func CreateLink(a apptypes.Deps) fiber.Handler { return createLink(a) }

func DeleteOpenTicket(a apptypes.Deps) fiber.Handler { return deleteOpenTicket(a) }

func DeleteReminder(a apptypes.Deps) fiber.Handler { return deleteReminder(a) }

func DeleteRole(a apptypes.Deps) fiber.Handler { return deleteRole(a) }

func DeleteServerEmbed(a apptypes.Deps) fiber.Handler { return deleteServerEmbed(a) }

func DeleteServerGiveaway(a apptypes.Deps) fiber.Handler { return deleteServerGiveaway(a) }

func DeleteStrike(a apptypes.Deps) fiber.Handler { return deleteStrike(a) }

func DeleteTicketButton(a apptypes.Deps) fiber.Handler { return deleteTicketButton(a) }

func DeleteTicketPanel(a apptypes.Deps) fiber.Handler { return deleteTicketPanel(a) }

func DisableCountdown(a apptypes.Deps) fiber.Handler { return disableCountdown(a) }

func DiscordRoles(a apptypes.Deps) fiber.Handler { return getDiscordRoles(a) }

func EnableCountdown(a apptypes.Deps) fiber.Handler { return enableCountdown(a) }

func GetAllClanLogs(a apptypes.Deps) fiber.Handler { return getAllClanLogs(a) }

func GetAllRoles(a apptypes.Deps) fiber.Handler { return getAllRoles(a) }

func GetAutoboards(a apptypes.Deps) fiber.Handler { return getAutoboards(a) }

func GetBans(a apptypes.Deps) fiber.Handler { return getBans(a) }

func GetClanCountdowns(a apptypes.Deps) fiber.Handler { return getClanCountdowns(a) }

func GetDiscordChannels(a apptypes.Deps) fiber.Handler { return getServerDiscordChannels(a) }

func GetFamilyRoles(a apptypes.Deps) fiber.Handler { return getFamilyRoles(a) }

func GetLinks(a apptypes.Deps) fiber.Handler { return getLinks(a) }

func ListRoles(a apptypes.Deps) fiber.Handler { return listRoles(a) }

func GetOpenTickets(a apptypes.Deps) fiber.Handler { return getOpenTickets(a) }

func GetRoleSettings(a apptypes.Deps) fiber.Handler { return getRoleSettings(a) }

func GetServerActivityLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerActivityLeaderboard(a)
}

func GetServerCapitalRaidsLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerCapitalRaidsLeaderboard(a)
}

func GetServerClanGamesLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerClanGamesLeaderboard(a)
}

func GetServerClanSettings(a apptypes.Deps) fiber.Handler { return getServerClanSettings(a) }

func GetServerClans(a apptypes.Deps) fiber.Handler { return getServerClans(a) }

func GetServerClansBasic(a apptypes.Deps) fiber.Handler { return getServerClansBasic(a) }

func GetServerCountdowns(a apptypes.Deps) fiber.Handler { return getServerCountdowns(a) }

func GetServerDonationsLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerDonationsLeaderboard(a)
}

func GetServerEmbeds(a apptypes.Deps) fiber.Handler { return getServerEmbeds(a) }

func GetGiveawayEntries(a apptypes.Deps) fiber.Handler { return getGiveawayEntries(a) }
func GetServerGiveaway(a apptypes.Deps) fiber.Handler  { return getServerGiveaway(a) }

func GetServerGiveaways(a apptypes.Deps) fiber.Handler { return getServerGiveaways(a) }

func GetServerLeaderboards(a apptypes.Deps) fiber.Handler { return getServerLeaderboards(a) }

func GetServerLegendsLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerLegendsLeaderboard(a)
}

func GetServerLogs(a apptypes.Deps) fiber.Handler { return getServerLogs(a) }

func GetServerLootingLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerLootingLeaderboard(a)
}

func GetServerPanel(a apptypes.Deps) fiber.Handler { return getServerPanel(a) }

func GetServerReminders(a apptypes.Deps) fiber.Handler { return getServerReminders(a) }

func GetServerSettings(a apptypes.Deps) fiber.Handler { return getServerSettings(a) }

func GetServerWarLeaderboard(a apptypes.Deps) fiber.Handler { return getServerWarLeaderboard(a) }

func GetStrikes(a apptypes.Deps) fiber.Handler { return getStrikes(a) }

func GetTicketPanels(a apptypes.Deps) fiber.Handler { return getTicketPanels(a) }

func PatchClanSettings(a apptypes.Deps) fiber.Handler { return patchClanSettings(a) }

func PatchRoleSettings(a apptypes.Deps) fiber.Handler { return patchRoleSettings(a) }

func PatchServerLogType(a apptypes.Deps) fiber.Handler { return patchServerLogType(a) }

func PatchServerSettings(a apptypes.Deps) fiber.Handler { return patchServerSettings(a) }

func PutClanLogs(a apptypes.Deps) fiber.Handler { return putClanLogs(a) }

func PutEmbedColor(a apptypes.Deps) fiber.Handler { return putEmbedColor(a) }

func RemoveBan(a apptypes.Deps) fiber.Handler { return removeBan(a) }

func RemoveFamilyRole(a apptypes.Deps) fiber.Handler { return removeFamilyRole(a) }

func RemoveServerClan(a apptypes.Deps) fiber.Handler { return removeServerClan(a) }

func RerollGiveawayWinners(a apptypes.Deps) fiber.Handler { return rerollGiveawayWinners(a) }

func ServerChannels(a apptypes.Deps) fiber.Handler { return getServerChannels(a) }

func ServerThreads(a apptypes.Deps) fiber.Handler { return getServerThreads(a) }

func StrikeSummary(a apptypes.Deps) fiber.Handler { return strikeSummary(a) }

func TestDiscordAPI(a apptypes.Deps) fiber.Handler { return testDiscordAPIStatus(a) }

func UpdateAutoboard(a apptypes.Deps) fiber.Handler { return updateAutoboard(a) }

func UpdateOpenTicketClan(a apptypes.Deps) fiber.Handler { return updateOpenTicketClan(a) }

func UpdateOpenTicketStatus(a apptypes.Deps) fiber.Handler { return updateOpenTicketStatus(a) }

func UpdateReminder(a apptypes.Deps) fiber.Handler { return updateReminder(a) }

func UpdateServerEmbed(a apptypes.Deps) fiber.Handler { return updateServerEmbed(a) }

func UpdateServerGiveaway(a apptypes.Deps) fiber.Handler { return updateServerGiveaway(a) }

func UpdateServerLogs(a apptypes.Deps) fiber.Handler { return updateServerLogs(a) }

func UpdateServerPanel(a apptypes.Deps) fiber.Handler { return updateServerPanel(a) }

func UpdateTicketApproveMessages(a apptypes.Deps) fiber.Handler {
	return updateTicketApproveMessages(a)
}

func UpdateTicketButtonAppearance(a apptypes.Deps) fiber.Handler {
	return updateTicketButtonAppearance(a)
}

func UpdateTicketButtonSettings(a apptypes.Deps) fiber.Handler {
	return updateTicketButtonSettings(a)
}

func UpdateTicketPanel(a apptypes.Deps) fiber.Handler { return updateTicketPanel(a) }
