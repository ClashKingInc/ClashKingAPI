import { BotSeasonSummaryEndpoint } from "./bot-season-summary.js"
export { BotSeasonSummaryEndpoint } from "./bot-season-summary.js"
import { BotPlayerProgressEndpoint } from "./bot-player-progress.js"
export { BotPlayerProgressEndpoint } from "./bot-player-progress.js"
import { BotTaskProgressEndpoint } from "./bot-task-progress.js"
export { BotTaskProgressEndpoint } from "./bot-task-progress.js"
import { BotModerationImageEndpoint } from "./bot-moderation.js"
export { BotModerationImageEndpoint } from "./bot-moderation.js"
import { botAdjacentEndpoints } from "./bot-adjacent.js"
import { BotLegendStatsEndpoint } from "./bot-legend-stats.js"
import { BotPlayerSeasonEndpoint } from "./bot-player-season.js"
import { BotPlayerIdentityEndpoint } from "./bot-player-identity.js"
import { BotPlayerClanTimelineEndpoint } from "./bot-player-history.js"
import { BotClanSeasonStatsEndpoint, BotClanGamesEndpoint, BotClanCapitalContributionsEndpoint } from "./bot-clan-stats.js"
export { BotClanSeasonStatsEndpoint, BotClanGamesEndpoint, BotClanCapitalContributionsEndpoint } from "./bot-clan-stats.js"
import {
  BotClanCachedEndpoint,
  BotClanCapitalLeaderboardEndpoint,
  BotClanDonationsLeaderboardEndpoint,
  BotClanHistoryEndpoint,
  BotClanJoinLeaveEndpoint,
  BotClanLegendSummaryEndpoint,
  BotClanRankingsEndpoint,
  BotClanRecordsEndpoint,
  BotClanWarLogEndpoint,
  BotClanWarsEndpoint,
  BotClanWarWinsLeaderboardEndpoint,
  BotClanWinStreakLeaderboardEndpoint,
  BotCountsEndpoint,
  BotCurrentWarEndpoint,
  BotCwlGroupEndpoint,
  BotCwlLeaderboardEndpoint,
  BotCwlRankingHistoryEndpoint,
  BotCwlSeasonsEndpoint,
  BotLeagueLeaderboardEndpoint,
  BotLegendSeasonEndpoint,
  BotPlayerCwlHistoryEndpoint,
  BotPlayerHistoryEndpoint,
  BotPlayerLegendHistoryEndpoint,
  BotPlayerRankingsEndpoint,
  BotPlayerTimersEndpoint,
  BotPlayerWarAttacksEndpoint,
  BotPlayerWarStatsEndpoint,
  BotPreviousWarEndpoint,
  BotTownHallLeaderboardEndpoint,
} from "./bot-public.js"
import {
  BotAccountsEndpoint,
  BotAddStrikeEndpoint,
  BotBaseEndpoint,
  BotBasesEndpoint,
  BotBansEndpoint,
  BotDashboardCapabilitiesEndpoint,
  BotDeleteBanEndpoint,
  BotDeleteStrikeEndpoint,
  BotEmbedsEndpoint,
  BotGiveawayEndpoint,
  BotGiveawaysEndpoint,
  BotLinkAccountEndpoint,
  BotRefreshRosterEndpoint,
  BotRemindersEndpoint,
  BotRerollGiveawayEndpoint,
  BotRosterEndpoint,
  BotRostersEndpoint,
  BotSaveBanEndpoint,
  BotServerClanGamesLeaderboardEndpoint,
  BotServerClansEndpoint,
  BotServerDonationsLeaderboardEndpoint,
  BotServerLegendsLeaderboardEndpoint,
  BotServerLinksEndpoint,
  BotServerWarLeaderboardEndpoint,
  BotStrikeSummaryEndpoint,
  BotStrikesEndpoint,
  BotTicketsEndpoint,
  BotUnlinkAccountEndpoint,
} from "./bot-server.js"

export * from "./bot-public.js"
export * from "./bot-server.js"
export * from "./bot-adjacent.js"
export * from "./bot-legend-stats.js"
export * from "./bot-player-season.js"
export * from "./bot-player-identity.js"

// Only established API operations belong here. Deferred Discord orchestration
// schemas are available explicitly from the reference-only /deferred-runtime entry.
export const botEndpoints = {
  moderationImage: BotModerationImageEndpoint,
  ...botAdjacentEndpoints,
  legendStats: BotLegendStatsEndpoint,
  playerSeasonStats: BotPlayerSeasonEndpoint,
  playerIdentity: BotPlayerIdentityEndpoint,
  playerClanHistory: BotPlayerClanTimelineEndpoint,
  taskProgress: BotTaskProgressEndpoint,
  playerUpgradeProgress: BotPlayerProgressEndpoint,
  playerSeasonSummary: BotSeasonSummaryEndpoint,
  clanSeasonStats: BotClanSeasonStatsEndpoint,
  clanGames: BotClanGamesEndpoint,
  clanCapitalContributions: BotClanCapitalContributionsEndpoint,
  accounts: BotAccountsEndpoint,
  addStrike: BotAddStrikeEndpoint,
  base: BotBaseEndpoint,
  bases: BotBasesEndpoint,
  bans: BotBansEndpoint,
  clanCached: BotClanCachedEndpoint,
  clanCapitalLeaderboard: BotClanCapitalLeaderboardEndpoint,
  clanDonationsLeaderboard: BotClanDonationsLeaderboardEndpoint,
  clanHistory: BotClanHistoryEndpoint,
  clanJoinLeave: BotClanJoinLeaveEndpoint,
  clanLegendSummary: BotClanLegendSummaryEndpoint,
  clanRankings: BotClanRankingsEndpoint,
  clanRecords: BotClanRecordsEndpoint,
  clanWarLog: BotClanWarLogEndpoint,
  clanWars: BotClanWarsEndpoint,
  clanWarWinsLeaderboard: BotClanWarWinsLeaderboardEndpoint,
  clanWinStreakLeaderboard: BotClanWinStreakLeaderboardEndpoint,
  counts: BotCountsEndpoint,
  currentWar: BotCurrentWarEndpoint,
  cwlGroup: BotCwlGroupEndpoint,
  cwlLeaderboard: BotCwlLeaderboardEndpoint,
  cwlRankingHistory: BotCwlRankingHistoryEndpoint,
  cwlSeasons: BotCwlSeasonsEndpoint,
  dashboardCapabilities: BotDashboardCapabilitiesEndpoint,
  deleteBan: BotDeleteBanEndpoint,
  deleteStrike: BotDeleteStrikeEndpoint,
  embeds: BotEmbedsEndpoint,
  giveaway: BotGiveawayEndpoint,
  giveaways: BotGiveawaysEndpoint,
  leagueLeaderboard: BotLeagueLeaderboardEndpoint,
  legendSeason: BotLegendSeasonEndpoint,
  linkAccount: BotLinkAccountEndpoint,
  playerCwlHistory: BotPlayerCwlHistoryEndpoint,
  playerHistory: BotPlayerHistoryEndpoint,
  playerLegendHistory: BotPlayerLegendHistoryEndpoint,
  playerRankings: BotPlayerRankingsEndpoint,
  playerTimers: BotPlayerTimersEndpoint,
  playerWarAttacks: BotPlayerWarAttacksEndpoint,
  playerWarStats: BotPlayerWarStatsEndpoint,
  previousWar: BotPreviousWarEndpoint,
  refreshRoster: BotRefreshRosterEndpoint,
  reminders: BotRemindersEndpoint,
  rerollGiveaway: BotRerollGiveawayEndpoint,
  roster: BotRosterEndpoint,
  rosters: BotRostersEndpoint,
  saveBan: BotSaveBanEndpoint,
  serverClanGamesLeaderboard: BotServerClanGamesLeaderboardEndpoint,
  serverClans: BotServerClansEndpoint,
  serverDonationsLeaderboard: BotServerDonationsLeaderboardEndpoint,
  serverLegendsLeaderboard: BotServerLegendsLeaderboardEndpoint,
  serverLinks: BotServerLinksEndpoint,
  serverWarLeaderboard: BotServerWarLeaderboardEndpoint,
  strikeSummary: BotStrikeSummaryEndpoint,
  strikes: BotStrikesEndpoint,
  tickets: BotTicketsEndpoint,
  townHallLeaderboard: BotTownHallLeaderboardEndpoint,
  unlinkAccount: BotUnlinkAccountEndpoint,
} as const
