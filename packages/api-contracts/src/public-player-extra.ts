import { Schema } from "effect"
import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
import { LeaderboardHistoryItem } from "./expo-rankings.js"

const PlayerPath = Schema.Struct({ playerTag: Schema.String })
const RankedPath = Schema.Struct({ playerTag: Schema.String, season: Schema.Number })
const OptionalNumber = Schema.optionalKey(Schema.Number)
const OptionalString = Schema.optionalKey(Schema.String)
export const RankedPlayerMember = Schema.Struct({
  name: Schema.String, tag: Schema.String, placement: Schema.Number, league_trophies: Schema.Number,
  town_hall: Schema.Number, maximum_battle_count: Schema.Number,
  group_tag: OptionalString, league_tier_id: OptionalNumber,
})
export const PlayerRankedGroupResponse = Schema.Union([
  Schema.Struct({ tag: Schema.String, season: Schema.Number, group: Schema.Null, members: Schema.Array(RankedPlayerMember) }),
  Schema.Struct({ season: Schema.Number, group_tag: Schema.String, league_tier_id: Schema.Number, player: RankedPlayerMember, members: Schema.Array(RankedPlayerMember), count: Schema.Number }),
])
export const PlayerTypedLeaderboardHistoryResponse = Schema.Struct({
  type: Schema.Literals(["player_home_trophies", "player_builder_base_trophies"]), playerTag: Schema.String,
  items: Schema.Array(Schema.Struct({ date: Schema.String, locationId: Schema.String, name: Schema.String, rank: Schema.Number, details: LeaderboardHistoryItem })),
})
export const PlayerJoinLeaveSharedResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({ clan: Schema.Struct({ name: Schema.String, tag: Schema.String }), minutes: Schema.Number })) })
export const PlayerStatType = Schema.Literals(["donated", "received", "clan_games", "capital_gold_donated"])
export const PlayerStatHistoryResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({
  eventTime: Schema.String, clanTag: Schema.NullOr(Schema.String), statType: PlayerStatType,
  previousValue: Schema.Number, currentValue: Schema.Number, delta: Schema.Number,
})) })
export const TrophyBucketsResponse = Schema.Struct({ league_tier_id: Schema.Number, items: Schema.Array(Schema.Struct({ bucket: Schema.Number, players: Schema.Number, trophies: Schema.Number })), count: Schema.Number })

const common = { method: "GET", auth: "public", body: NoBody, bodyMode: "none", responseMode: "json", successStatus: 200 } as const
export const PlayerRankedGroupEndpoint = defineEndpoint({ ...common, operationId: "getPlayerRankedGroup", path: "/v2/player/:playerTag/ranked/:season/group", summary: "Get a player's ranked season group", pathParams: RankedPath, query: NoQuery, response: PlayerRankedGroupResponse })
export const PlayerTypedLeaderboardHistoryEndpoint = defineEndpoint({ ...common, operationId: "getPlayerTypedLeaderboardHistory", path: "/v2/player/:playerTag/leaderboard-history/:leaderboardType", summary: "Get a player's official leaderboard history", pathParams: Schema.Struct({ playerTag: Schema.String, leaderboardType: Schema.Literals(["player_home_trophies", "player_builder_base_trophies"]) }), query: NoQuery, response: PlayerTypedLeaderboardHistoryResponse })
export const PlayerJoinLeaveSharedEndpoint = defineEndpoint({ ...common, operationId: "getPlayerJoinLeaveShared", path: "/v2/player/:playerTag/join-leave/shared", summary: "Get the time two players shared clans", pathParams: PlayerPath, query: Schema.Struct({ tag: Schema.String }), response: PlayerJoinLeaveSharedResponse })
export const PlayerStatHistoryEndpoint = defineEndpoint({ ...common, operationId: "getPlayerStatHistory", path: "/v2/player/:playerTag/history/stats", summary: "Get positive player activity changes", pathParams: PlayerPath, query: Schema.Struct({ type: PlayerStatType, limit: OptionalNumber, "time[after]": OptionalString, "time[before]": OptionalString }), response: PlayerStatHistoryResponse })
export const TrophyBucketsEndpoint = defineEndpoint({ ...common, operationId: "getTrophyBuckets", path: "/v2/leaderboard/:leagueTierId/trophy-buckets", summary: "Get current trophy buckets for a league tier", pathParams: Schema.Struct({ leagueTierId: Schema.Number }), query: NoQuery, response: TrophyBucketsResponse })
export const publicPlayerExtraEndpoints = {
  playerRankedGroup: PlayerRankedGroupEndpoint,
  playerTypedLeaderboardHistory: PlayerTypedLeaderboardHistoryEndpoint, playerJoinLeaveShared: PlayerJoinLeaveSharedEndpoint,
  playerStatHistory: PlayerStatHistoryEndpoint, trophyBuckets: TrophyBucketsEndpoint,
} as const
