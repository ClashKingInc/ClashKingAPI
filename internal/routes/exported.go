package routes

import (
	apptypes "github.com/ClashKingInc/ClashKingAPI/internal/utils"
	"github.com/gofiber/fiber/v2"
)

func AccountStatus(a apptypes.Deps) fiber.Handler { return accountStatus(a) }

func AddBan(a apptypes.Deps) fiber.Handler { return addBan(a) }

func AddTrackingPlayers(a apptypes.Deps) fiber.Handler { return addTrackingPlayers(a) }

func BookmarkSearch(a apptypes.Deps) fiber.Handler { return bookmarkSearch(a) }

func AddFamilyRole(a apptypes.Deps) fiber.Handler { return addFamilyRole(a) }

func AddServerClan(a apptypes.Deps) fiber.Handler { return addServerClan(a) }

func AddStandardAccount(a apptypes.Deps) fiber.Handler { return addStandardAccount(a) }

func AddStrike(a apptypes.Deps) fiber.Handler { return addStrike(a) }

func AddVerifiedAccount(a apptypes.Deps) fiber.Handler { return addVerifiedAccount(a) }

func BoardTotals(a apptypes.Deps) fiber.Handler { return boardTotals(a) }

func BotInfo(a apptypes.Deps) fiber.Handler { return botInfo(a) }

func BulkUnlink(a apptypes.Deps) fiber.Handler { return bulkUnlink(a) }

func CapitalBulk(a apptypes.Deps) fiber.Handler { return capitalBulk(a) }

func CapitalLog(a apptypes.Deps) fiber.Handler { return capitalLog(a) }

func CategoryItem(a apptypes.Deps) fiber.Handler { return categoryItem(a) }

func CategoryItems(a apptypes.Deps) fiber.Handler { return categoryItems(a) }

func CategoryNames(a apptypes.Deps) fiber.Handler { return categoryNames(a) }

func ClanBasic(a apptypes.Deps) fiber.Handler { return clanBasic(a) }

func ClanComposition(a apptypes.Deps) fiber.Handler { return clanComposition(a) }

func ClanDetails(a apptypes.Deps) fiber.Handler { return clanDetails(a) }

func ClanDonationsMany(a apptypes.Deps) fiber.Handler { return clanDonationsMany(a) }

func ClanDonationsSingle(a apptypes.Deps) fiber.Handler { return clanDonationsSingle(a) }

func ClanHistorical(a apptypes.Deps) fiber.Handler { return clanHistorical(a) }

func ClanJoinLeaveSingle(a apptypes.Deps) fiber.Handler { return clanJoinLeaveSingle(a) }

func ClanMembers(a apptypes.Deps) fiber.Handler { return clanMembers(a) }

func ClanRanking(a apptypes.Deps) fiber.Handler { return clanRanking(a) }

func ClanSearch(a apptypes.Deps) fiber.Handler { return clanSearch(a) }

func ClanStats(a apptypes.Deps) fiber.Handler { return clanStats(a) }

func ClanWarhits(a apptypes.Deps) fiber.Handler { return clanWarhits(a) }

func ClansCapitalRaids(a apptypes.Deps) fiber.Handler { return clansCapitalRaids(a) }

func ClansDetails(a apptypes.Deps) fiber.Handler { return clansDetails(a) }

func ClansJoinLeave(a apptypes.Deps) fiber.Handler { return clansJoinLeave(a) }

func CloneRoster() fiber.Handler { return cloneRoster() }

func CreateAutoboard(a apptypes.Deps) fiber.Handler { return createAutoboard(a) }

func CreateReminder(a apptypes.Deps) fiber.Handler { return createReminder(a) }

func CreateRole(a apptypes.Deps) fiber.Handler { return createRole(a) }

func CreateRoster() fiber.Handler { return createRoster() }

func CreateRosterAutomation() fiber.Handler { return createRosterAutomation() }

func CreateRosterGroup() fiber.Handler { return createRosterGroup() }

func CreateRosterSignupCategory() fiber.Handler { return createRosterSignupCategory() }

func CurrentDates() fiber.Handler { return currentDates }

func CurrentUser(a apptypes.Deps) fiber.Handler { return currentUser(a) }

func CwlRankingHistory(a apptypes.Deps) fiber.Handler { return cwlRankingHistory(a) }

func CwlThresholds() fiber.Handler { return cwlThresholds }

func DailyTracking(a apptypes.Deps) fiber.Handler { return dailyTracking(a) }

func DeleteAutoboard(a apptypes.Deps) fiber.Handler { return deleteAutoboard(a) }

func DeleteServerGiveaway(a apptypes.Deps) fiber.Handler { return deleteServerGiveaway(a) }

func DeleteClanLogs(a apptypes.Deps) fiber.Handler { return deleteClanLogs(a) }

func DeleteLink(a apptypes.Deps) fiber.Handler { return deleteLink(a) }

func DeleteReminder(a apptypes.Deps) fiber.Handler { return deleteReminder(a) }

func DeleteRole(a apptypes.Deps) fiber.Handler { return deleteRole(a) }

func DeleteRoster() fiber.Handler { return deleteRoster() }

func DeleteRosterAutomation() fiber.Handler { return deleteRosterAutomation() }

func DeleteRosterGroup() fiber.Handler { return deleteRosterGroup() }

func DeleteRosterSignupCategory() fiber.Handler { return deleteRosterSignupCategory() }

func DeleteStrike(a apptypes.Deps) fiber.Handler { return deleteStrike(a) }

func DisableCountdown(a apptypes.Deps) fiber.Handler { return disableCountdown(a) }

func DiscordAuth(a apptypes.Deps) fiber.Handler { return discordAuth(a) }

func DistrictStats(a apptypes.Deps) fiber.Handler { return districtStats(a) }

func EmailLogin(a apptypes.Deps) fiber.Handler { return emailLogin(a) }

func ServerChannels() fiber.Handler { return emptyItems("channels") }

func ServerThreads() fiber.Handler { return emptyItems("threads") }

func DiscordRoles() fiber.Handler { return emptyItems("roles") }

func EnableCountdown(a apptypes.Deps) fiber.Handler { return enableCountdown(a) }

func ForgotPassword(a apptypes.Deps) fiber.Handler { return forgotPassword(a) }

func GenerateRosterToken() fiber.Handler { return generateRosterToken() }

func GetAllClanLogs(a apptypes.Deps) fiber.Handler { return getAllClanLogs(a) }

func GetAllRoles(a apptypes.Deps) fiber.Handler { return getAllRoles(a) }

func GetAutoboards(a apptypes.Deps) fiber.Handler { return getAutoboards(a) }

func GetServerGiveaway(a apptypes.Deps) fiber.Handler { return getServerGiveaway(a) }

func GetServerGiveaways(a apptypes.Deps) fiber.Handler { return getServerGiveaways(a) }

func GetServerLeaderboards(a apptypes.Deps) fiber.Handler { return getServerLeaderboards(a) }

func GetServerLegendsLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerLegendsLeaderboard(a)
}

func GetServerPanel(a apptypes.Deps) fiber.Handler { return getServerPanel(a) }

func GetServerWarLeaderboard(a apptypes.Deps) fiber.Handler { return getServerWarLeaderboard(a) }

func GetServerDonationsLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerDonationsLeaderboard(a)
}

func GetServerCapitalRaidsLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerCapitalRaidsLeaderboard(a)
}

func GetServerClanGamesLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerClanGamesLeaderboard(a)
}

func GetServerActivityLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerActivityLeaderboard(a)
}

func GetServerLootingLeaderboard(a apptypes.Deps) fiber.Handler {
	return getServerLootingLeaderboard(a)
}

func CreateServerGiveaway(a apptypes.Deps) fiber.Handler { return createServerGiveaway(a) }

func UpdateServerGiveaway(a apptypes.Deps) fiber.Handler { return updateServerGiveaway(a) }

func RerollGiveawayWinners(a apptypes.Deps) fiber.Handler { return rerollGiveawayWinners(a) }

func GetBans(a apptypes.Deps) fiber.Handler { return getBans(a) }

func GetClanCountdowns(a apptypes.Deps) fiber.Handler { return getClanCountdowns(a) }

func GetDiscordChannels() fiber.Handler { return getDiscordChannels() }

func GetFamilyRoles(a apptypes.Deps) fiber.Handler { return getFamilyRoles(a) }

func GetGuildDetails(a apptypes.Deps) fiber.Handler { return getGuildDetails(a) }

func GetLinks(a apptypes.Deps) fiber.Handler { return getLinks(a) }

func GetMissingMembers() fiber.Handler { return getMissingMembers() }

func GetRoleSettings(a apptypes.Deps) fiber.Handler { return getRoleSettings(a) }

func GetRoster() fiber.Handler { return getRoster() }

func GetRosterGroup() fiber.Handler { return getRosterGroup() }

func GetServerClanMembers() fiber.Handler { return getServerClanMembers() }

func GetServerClanSettings(a apptypes.Deps) fiber.Handler { return getServerClanSettings(a) }

func GetServerClans(a apptypes.Deps) fiber.Handler { return getServerClans(a) }

func GetServerClansBasic(a apptypes.Deps) fiber.Handler { return getServerClansBasic(a) }

func GetServerCountdowns(a apptypes.Deps) fiber.Handler { return getServerCountdowns(a) }

func GetServerLogs(a apptypes.Deps) fiber.Handler { return getServerLogs(a) }

func GetServerReminders(a apptypes.Deps) fiber.Handler { return getServerReminders(a) }

func GetServerSettings(a apptypes.Deps) fiber.Handler { return getServerSettings(a) }

func GetStrikes(a apptypes.Deps) fiber.Handler { return getStrikes(a) }

func GetUserGuilds(a apptypes.Deps) fiber.Handler { return getUserGuilds(a) }

func GroupAdd(a apptypes.Deps) fiber.Handler { return groupAdd(a) }

func GroupCreate(a apptypes.Deps) fiber.Handler { return groupCreate(a) }

func GroupDelete(a apptypes.Deps) fiber.Handler { return groupDelete(a) }

func GroupGet(a apptypes.Deps) fiber.Handler { return groupGet(a) }

func GroupList(a apptypes.Deps) fiber.Handler { return groupList(a) }

func GroupRemove(a apptypes.Deps) fiber.Handler { return groupRemove(a) }

func GuildLeaderboard(a apptypes.Deps) fiber.Handler { return guildLeaderboard(a) }

func GuildStats(a apptypes.Deps) fiber.Handler { return guildStats(a) }

func GuildSummary(a apptypes.Deps) fiber.Handler { return guildSummary(a) }

func InactivePlayers(a apptypes.Deps) fiber.Handler { return inactivePlayers(a) }

func LeagueStats(a apptypes.Deps) fiber.Handler { return leagueStats(a) }

func LegendStatsDay(a apptypes.Deps) fiber.Handler { return legendStatsDay(a) }

func LegendStatsSeason(a apptypes.Deps) fiber.Handler { return legendStatsSeason(a) }

func LinkEmail(a apptypes.Deps) fiber.Handler { return linkEmail(a) }

func ListAccounts(a apptypes.Deps) fiber.Handler { return listAccounts(a) }

func ListCategories(a apptypes.Deps) fiber.Handler { return listCategories(a) }

func ListRoles(a apptypes.Deps) fiber.Handler { return listRoles(a) }

func ListRosterAutomation() fiber.Handler { return listRosterAutomation() }

func ListRosterGroups() fiber.Handler { return listRosterGroups() }

func ListRosterSignupCategories() fiber.Handler { return listRosterSignupCategories() }

func ListRosters() fiber.Handler { return listRosters() }

func ManageRosterMembers() fiber.Handler { return manageRosterMembers() }

func MaxLevel(a apptypes.Deps) fiber.Handler { return maxLevel(a) }

func MobileInitialization(a apptypes.Deps) fiber.Handler { return mobileInitialization(a) }

func NotImplementedDiscord() fiber.Handler { return notImplementedDiscord() }

func PatchClanSettings(a apptypes.Deps) fiber.Handler { return patchClanSettings(a) }

func PatchRoleSettings(a apptypes.Deps) fiber.Handler { return patchRoleSettings(a) }

func PatchServerLogType(a apptypes.Deps) fiber.Handler { return patchServerLogType(a) }

func PatchServerSettings(a apptypes.Deps) fiber.Handler { return patchServerSettings(a) }

func PlayerStats(a apptypes.Deps) fiber.Handler { return playerStats(a) }

func PlayerWarhits(a apptypes.Deps) fiber.Handler { return playerWarhits(a) }

func PreviousWars(a apptypes.Deps) fiber.Handler { return previousWars(a) }

func PublicConfig(a apptypes.Deps) fiber.Handler { return publicConfig(a) }

func PublicMobileConfig(a apptypes.Deps) fiber.Handler { return publicMobileConfig(a) }

func PutClanLogs(a apptypes.Deps) fiber.Handler { return putClanLogs(a) }

func PutEmbedColor(a apptypes.Deps) fiber.Handler { return putEmbedColor(a) }

func RaidWeekends() fiber.Handler { return raidWeekends }

func RecentSearch(a apptypes.Deps) fiber.Handler { return recentSearch(a) }

func RemoveTrackingPlayers(a apptypes.Deps) fiber.Handler { return removeTrackingPlayers(a) }

func RefreshRosterMember() fiber.Handler { return refreshRosterMember() }

func RefreshRosters() fiber.Handler { return refreshRosters() }

func RefreshToken(a apptypes.Deps) fiber.Handler { return refreshToken(a) }

func Register(a apptypes.Deps) fiber.Handler { return register(a) }

func RemoveAccount(a apptypes.Deps) fiber.Handler { return removeAccount(a) }

func RemoveBan(a apptypes.Deps) fiber.Handler { return removeBan(a) }

func RemoveFamilyRole(a apptypes.Deps) fiber.Handler { return removeFamilyRole(a) }

func RemoveRosterMember() fiber.Handler { return removeRosterMember() }

func RemoveServerClan(a apptypes.Deps) fiber.Handler { return removeServerClan(a) }

func ReorderAccounts(a apptypes.Deps) fiber.Handler { return reorderAccounts(a) }

func ResendVerification(a apptypes.Deps) fiber.Handler { return resendVerification(a) }

func ResetPassword(a apptypes.Deps) fiber.Handler { return resetPassword(a) }

func SearchBannedPlayers(a apptypes.Deps) fiber.Handler { return searchBannedPlayers(a) }

func SearchClan(a apptypes.Deps) fiber.Handler { return searchClan(a) }

func SeasonRaidDates() fiber.Handler { return seasonRaidDates }

func SeasonStartEnd() fiber.Handler { return seasonStartEnd }

func Seasons() fiber.Handler { return seasons }

func StrikeSummary(a apptypes.Deps) fiber.Handler { return strikeSummary(a) }

func TestDiscordAPI() fiber.Handler { return testDiscordAPI() }

func UpdateAutoboard(a apptypes.Deps) fiber.Handler { return updateAutoboard(a) }

func UpdateServerPanel(a apptypes.Deps) fiber.Handler { return updateServerPanel(a) }

func UpdateReminder(a apptypes.Deps) fiber.Handler { return updateReminder(a) }

func UpdateRoster() fiber.Handler { return updateRoster() }

func UpdateRosterAutomation() fiber.Handler { return updateRosterAutomation() }

func UpdateRosterGroup() fiber.Handler { return updateRosterGroup() }

func UpdateRosterMember() fiber.Handler { return updateRosterMember() }

func UpdateRosterSignupCategory() fiber.Handler { return updateRosterSignupCategory() }

func UpdateServerLogs(a apptypes.Deps) fiber.Handler { return updateServerLogs(a) }

func V1ClanJoinLeave(a apptypes.Deps) fiber.Handler { return v1ClanJoinLeave(a) }

func VerifyAccount(a apptypes.Deps) fiber.Handler { return verifyAccount(a) }

func VerifyEmailCode(a apptypes.Deps) fiber.Handler { return verifyEmailCode(a) }

func WarSummaryBulk(a apptypes.Deps) fiber.Handler { return warSummaryBulk(a) }

func WarSummarySingle(a apptypes.Deps) fiber.Handler { return warSummarySingle(a) }
