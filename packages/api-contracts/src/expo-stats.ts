import { Schema } from "effect"
import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"

const DateRange = Schema.Struct({ start: Schema.String, end: Schema.String })
const DailyPoint = Schema.Struct({
  date: Schema.String, sample_size: Schema.Number, use_count: Schema.optionalKey(Schema.Number),
  usage_rate: Schema.optionalKey(Schema.Number), average_stars: Schema.Number,
  average_destruction: Schema.Number, zero_star_rate: Schema.Number, one_star_rate: Schema.Number,
  two_star_rate: Schema.Number, three_star_rate: Schema.Number,
})
const StatsMetrics = Schema.Struct({
  available: Schema.Boolean, sample_size: Schema.Number, usage_rate: Schema.optionalKey(Schema.Number),
  average_stars: Schema.Number, average_destruction: Schema.Number, zero_star_rate: Schema.Number,
  one_star_rate: Schema.Number, two_star_rate: Schema.Number, three_star_rate: Schema.Number,
  daily: Schema.Array(DailyPoint),
})
export const GlobalCounts = Schema.Struct({ players_in_war: Schema.Number, clans_in_war: Schema.Number, total_join_leaves: Schema.Number, players_in_legends: Schema.Number, player_count: Schema.Number, clan_count: Schema.Number, wars_stored: Schema.Number })
export const StatsOverviewResponse = Schema.Struct({ date_range: DateRange, counts: GlobalCounts, ranked: StatsMetrics, war: StatsMetrics, cwl: StatsMetrics })
export const GroupedCountsResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({ cwl_league_id: Schema.optionalKey(Schema.Number), location_id: Schema.optionalKey(Schema.Number), townhall_level: Schema.optionalKey(Schema.Number), capital_league_id: Schema.optionalKey(Schema.Number), league_tier_id: Schema.optionalKey(Schema.Number), count: Schema.Number })), count: Schema.Number })

export const StatsOverviewEndpoint = defineEndpoint({ operationId: "getExpoStatsOverview", method: "GET", path: "/v2/stats/overview", auth: "public", summary: "Get public statistics overview metadata", body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: Schema.Struct({ start_date: Schema.optionalKey(Schema.String), end_date: Schema.optionalKey(Schema.String) }), response: StatsOverviewResponse, responseMode: "json", successStatus: 200 })
export const GlobalCountsEndpoint = defineEndpoint({ operationId: "getExpoGlobalCounts", method: "GET", path: "/v2/counts", auth: "public", summary: "Get global ClashKing counts", body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: NoQuery, response: GlobalCounts, responseMode: "json", successStatus: 200 })
const groupedCounts = (operationId: string, path: `/v2/counts/${string}`) => defineEndpoint({ operationId, method: "GET", path, auth: "public", summary: operationId, body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: NoQuery, response: GroupedCountsResponse, responseMode: "json", successStatus: 200 })
export const PlayerTownhallCountsEndpoint = groupedCounts("getExpoPlayerTownhallCounts", "/v2/counts/players/town-halls")
export const PlayerBuilderhallCountsUnavailableResponse = Schema.Struct({
  code: Schema.Literal("not_implemented"),
  message: Schema.Literal("Builder Hall counts are not implemented"),
  request_id: Schema.optionalKey(Schema.String),
})
// Preserve the original public 501 route without advertising invented count data.
export const PlayerBuilderhallCountsEndpoint = defineEndpoint({
  operationId: "getExpoPlayerBuilderhallCounts", method: "GET", path: "/v2/counts/players/builder-halls",
  auth: "public", summary: "Builder Hall counts are unavailable (501)",
  body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: NoQuery,
  response: Schema.Never, responseMode: "none", successStatus: null,
  errors: [{ status: 501, body: PlayerBuilderhallCountsUnavailableResponse }],
})
export const PlayerLeagueTierCountsEndpoint = groupedCounts("getExpoPlayerLeagueTierCounts", "/v2/counts/players/league-tiers")
export const ClanLocationCountsEndpoint = groupedCounts("getExpoClanLocationCounts", "/v2/counts/clans/locations")
export const CwlLeagueCountsEndpoint = groupedCounts("getExpoCwlLeagueCounts", "/v2/counts/clans/cwl-leagues")
export const ClanCapitalLeagueCountsEndpoint = groupedCounts("getExpoClanCapitalLeagueCounts", "/v2/counts/clans/capital-leagues")
