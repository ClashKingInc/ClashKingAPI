import { Schema } from "effect"
import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"
import { BadgeUrls, IconUrls } from "./expo-common.js"

const LimitQuery = Schema.Struct({ limit: Schema.optionalKey(Schema.Number) })
const HistoryLocation = Schema.Struct({ id: Schema.Number, name: Schema.optionalKey(Schema.String), isCountry: Schema.Boolean, countryCode: Schema.optionalKey(Schema.String), localizedName: Schema.optionalKey(Schema.String) })
const HistoryLeague = Schema.Struct({ id: Schema.Number, name: Schema.optionalKey(Schema.String), iconUrls: Schema.optionalKey(IconUrls) })
const HistoryClan = Schema.Struct({ tag: Schema.String, name: Schema.String, badgeUrls: BadgeUrls })
export const LeaderboardHistoryItem = Schema.Struct({
  tag: Schema.String, name: Schema.String, expLevel: Schema.optionalKey(Schema.Number), trophies: Schema.optionalKey(Schema.Number),
  attackWins: Schema.optionalKey(Schema.Number), defenseWins: Schema.optionalKey(Schema.Number), builderBaseTrophies: Schema.optionalKey(Schema.Number),
  builderBaseBattleWins: Schema.optionalKey(Schema.Number), clan: Schema.optionalKey(HistoryClan), league: Schema.optionalKey(HistoryLeague),
  leagueTier: Schema.optionalKey(HistoryLeague), builderBaseLeague: Schema.optionalKey(HistoryLeague), badgeUrls: Schema.optionalKey(BadgeUrls),
  clanLevel: Schema.optionalKey(Schema.Number), clanPoints: Schema.optionalKey(Schema.Number), builderBasePoints: Schema.optionalKey(Schema.Number),
  capitalPoints: Schema.optionalKey(Schema.Number), members: Schema.optionalKey(Schema.Number), location: Schema.optionalKey(HistoryLocation),
  rank: Schema.Number, previousRank: Schema.optionalKey(Schema.Number),
})
export const LeaderboardHistoryResponse = Schema.Struct({ type: Schema.Literals(["player_home_trophies", "player_builder_base_trophies", "clan_home_points", "clan_builder_base_points", "clan_capital_points"]), locationId: Schema.String, date: Schema.String, items: Schema.Array(LeaderboardHistoryItem) })
const PlayerLeaderboardItem = Schema.Struct({ rank: Schema.Number, tag: Schema.String, name: Schema.String, leagueGroupId: Schema.String, league_id: Schema.optionalKey(Schema.Number), league: Schema.optionalKey(Schema.Struct({ id: Schema.Number, name: Schema.String, badge: Schema.String })), clan_tag: Schema.optionalKey(Schema.String), clan: Schema.optionalKey(Schema.Struct({ tag: Schema.String, name: Schema.optionalKey(Schema.String), badge: Schema.String })), townhall_level: Schema.Number, trophies: Schema.Number, country_code: Schema.optionalKey(Schema.String), country_name: Schema.optionalKey(Schema.String) })
export const PlayerLeaderboardResponse = Schema.Struct({ league_tier_id: Schema.optionalKey(Schema.Number), townhall_level: Schema.optionalKey(Schema.Number), items: Schema.Array(PlayerLeaderboardItem), count: Schema.Number, generated_at: Schema.optionalKey(Schema.String) })
const ClanLeaderboardItem = Schema.Struct({ tag: Schema.String, name: Schema.String, location_id: Schema.optionalKey(Schema.Number), badge_url: Schema.String, badgeUrls: BadgeUrls, donations: Schema.optionalKey(Schema.Number), war_wins: Schema.optionalKey(Schema.Number), capital_gold_total: Schema.optionalKey(Schema.Number), war_win_streak: Schema.Number, rank: Schema.optionalKey(Schema.Number) })
export const ClanLeaderboardResponse = Schema.Struct({ location_id: Schema.optionalKey(Schema.Number), kind: Schema.optionalKey(Schema.String), items: Schema.Array(ClanLeaderboardItem), count: Schema.Number })
const NotFound = [{ status: 404, body: ErrorResponse }] as const

export const LeaderboardHistoryEndpoint = defineEndpoint({ operationId: "getExpoLeaderboardHistory", method: "GET", path: "/v2/leaderboard/history/:leaderboardType/:locationId/:date", auth: "public", summary: "Get a historical leaderboard snapshot", body: NoBody, bodyMode: "none", pathParams: Schema.Struct({ leaderboardType: Schema.String, locationId: Schema.String, date: Schema.String }), query: NoQuery, response: LeaderboardHistoryResponse, responseMode: "json", successStatus: 200, errors: NotFound })
export const LeaderboardTownhallsEndpoint = defineEndpoint({ operationId: "getExpoTownhallLeaderboard", method: "GET", path: "/v2/leaderboard/townhalls/:townhallLevel", auth: "public", summary: "Get the town hall leaderboard", body: NoBody, bodyMode: "none", pathParams: Schema.Struct({ townhallLevel: Schema.Number }), query: LimitQuery, response: PlayerLeaderboardResponse, responseMode: "json", successStatus: 200 })
export const LeaderboardLeagueEndpoint = defineEndpoint({ operationId: "getExpoLeagueLeaderboard", method: "GET", path: "/v2/leaderboard/league/:leagueTierId", auth: "public", summary: "Get the ranked league leaderboard", body: NoBody, bodyMode: "none", pathParams: Schema.Struct({ leagueTierId: Schema.Number }), query: LimitQuery, response: PlayerLeaderboardResponse, responseMode: "json", successStatus: 200 })
const clanLeaderboardEndpoint = (operationId: string, path: "/v2/leaderboard/:locationId/clan/donations" | "/v2/leaderboard/:locationId/clan/war-wins") => defineEndpoint({ operationId, method: "GET", path, auth: "public", summary: operationId, body: NoBody, bodyMode: "none", pathParams: Schema.Struct({ locationId: Schema.Number }), query: LimitQuery, response: ClanLeaderboardResponse, responseMode: "json", successStatus: 200 })
export const LeaderboardClanDonationsEndpoint = clanLeaderboardEndpoint("getExpoClanDonationsLeaderboard", "/v2/leaderboard/:locationId/clan/donations")
export const LeaderboardClanWarWinsEndpoint = clanLeaderboardEndpoint("getExpoClanWarWinsLeaderboard", "/v2/leaderboard/:locationId/clan/war-wins")
export const LeaderboardClanWinStreakEndpoint = defineEndpoint({ operationId: "getExpoClanWinStreakLeaderboard", method: "GET", path: "/v2/leaderboard/clan/win-streak", auth: "public", summary: "Get the clan win streak leaderboard", body: NoBody, bodyMode: "none", pathParams: Schema.Struct({}), query: LimitQuery, response: ClanLeaderboardResponse, responseMode: "json", successStatus: 200 })
