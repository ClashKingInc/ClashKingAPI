import { Schema } from "effect"

import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"
import { HistoryQuery, JsonValue, PlayerTagPath } from "./expo-common.js"
export { PlayerBattlelogHistoryEndpoint, PlayerBattlelogHistoryResponse } from "./league-analytics.js"

const NotFound = [{ status: 404, body: ErrorResponse }] as const
export const SearchLeagueReference = Schema.Struct({ id: Schema.Number, name: Schema.String })
export const SearchPlayerClan = Schema.Struct({ name: Schema.optionalKey(Schema.String), tag: Schema.String, badge: Schema.optionalKey(Schema.String), clanLevel: Schema.optionalKey(Schema.Number) })
export const SearchPlayerResult = Schema.Struct({ name: Schema.String, tag: Schema.String, townHallLevel: Schema.Number, leagueTier: Schema.optionalKey(SearchLeagueReference), clan: Schema.optionalKey(SearchPlayerClan) })
export const SearchPlayerResponse = Schema.Struct({ items: Schema.Array(SearchPlayerResult), pagination: Schema.Struct({ limit: Schema.Number, hasMore: Schema.Boolean, nextCursor: Schema.NullOr(Schema.String) }) })
export const PlayerChangeRecord = Schema.Struct({
  time: Schema.String, townhall_level: Schema.NullOr(Schema.Number), type: Schema.String,
  item: Schema.optionalKey(Schema.Struct({ name: Schema.String, id: Schema.Number })),
  previous: Schema.optionalKey(JsonValue), current: Schema.optionalKey(JsonValue),
})
export const PlayerChangesResponse = Schema.Struct({ items: Schema.Array(PlayerChangeRecord) })
const WarRecord = Schema.Struct({ won: Schema.Number, lost: Schema.Number, tied: Schema.Number })
const Placement = Schema.Struct({ clan: Schema.Number, group: Schema.Number })
const ClanPlacement = Schema.Struct({ group: Schema.NullOr(Schema.Number), global: Schema.NullOr(Schema.Number) })
const CwlAttack = Schema.Struct({
  warTag: Schema.String, round: Schema.Number, opponent: Schema.Struct({ tag: Schema.String, name: Schema.String }),
  defender: Schema.Struct({ tag: Schema.String, name: Schema.String, townHallLevel: Schema.Number, mapPosition: Schema.Number }),
  stars: Schema.Number, destructionPercentage: Schema.Number, order: Schema.Number, duration: Schema.Number,
})
export const PlayerCwlHistoryResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({
  season: Schema.String, townHallLevel: Schema.Number, teamSize: Schema.NullOr(Schema.Number),
  clan: Schema.Struct({ tag: Schema.String, name: Schema.String, badgeUrls: Schema.Struct({ small: Schema.String, medium: Schema.String, large: Schema.String }), warLeague: Schema.NullOr(SearchLeagueReference), wars: Schema.NullOr(WarRecord), totalStars: Schema.NullOr(Schema.Number), placement: Schema.NullOr(ClanPlacement) }),
  attacks: Schema.Array(CwlAttack), placement: Schema.NullOr(Placement), missedAttacks: Schema.Number,
})) })
export const PlayerTimersResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({ type: Schema.Literals(["war", "cwl", "capital"]), expiresAt: Schema.String, warTag: Schema.optionalKey(Schema.String), clans: Schema.Array(Schema.String) })) })
const JoinLeaveClan = Schema.Struct({ name: Schema.String, tag: Schema.String })
const JoinLeaveEvent = Schema.Struct({ time: Schema.String, type: Schema.String, tag: Schema.String, name: Schema.optionalKey(Schema.String), townHallLevel: Schema.optionalKey(Schema.Number), clan: Schema.optionalKey(JoinLeaveClan) })
export const PlayerJoinLeaveResponse = Schema.Struct({ items: Schema.Array(JoinLeaveEvent), available: Schema.Number, uniquePlayers: Schema.optionalKey(Schema.Number) })
export const PlayerJoinLeaveTotalsResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({ clan: JoinLeaveClan, visits: Schema.Number, minutes: Schema.Number })) })
const PlayerWarClan = Schema.Struct({ tag: Schema.String, name: Schema.String, badgeUrls: Schema.Struct({ small: Schema.String, medium: Schema.String, large: Schema.String }), clanLevel: Schema.Number, attacks: Schema.Number, stars: Schema.Number, destructionPercentage: Schema.Number })
const PlayerWarMember = Schema.Struct({ tag: Schema.String, name: Schema.String, townhallLevel: Schema.Number, mapPosition: Schema.Number })
const PlayerWarAttack = Schema.Struct({ stars: Schema.Number, destructionPercentage: Schema.Number, order: Schema.Number, duration: Schema.Number, fresh: Schema.Boolean, player: PlayerWarMember })
export const PlayerWarStatsResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({ teamSize: Schema.Number, attacksPerMember: Schema.Number, preparationStartTime: Schema.String, startTime: Schema.optionalKey(Schema.String), endTime: Schema.String, clan: PlayerWarClan, opponent: PlayerWarClan, type: Schema.String, player: PlayerWarMember, attacks: Schema.Array(PlayerWarAttack), defenses: Schema.Array(PlayerWarAttack) })) })

export const PlayerSearchEndpoint = defineEndpoint({ operationId: "searchExpoPlayers", method: "GET", path: "/v2/player/search", auth: "public", summary: "Search players for the Expo app", body: NoBody, bodyMode: "none", pathParams: Schema.Struct({}), query: Schema.Struct({ query: Schema.String, limit: Schema.optionalKey(Schema.Number), cursor: Schema.optionalKey(Schema.String), clanTags: Schema.optionalKey(Schema.String), leagueIds: Schema.optionalKey(Schema.String), townhallLevels: Schema.optionalKey(Schema.String) }), response: SearchPlayerResponse, responseMode: "json", successStatus: 200 })
export const PlayerChangesEndpoint = defineEndpoint({ operationId: "getExpoPlayerChanges", method: "GET", path: "/v2/player/:playerTag/history/changes", auth: "public", summary: "Get player change history", body: NoBody, bodyMode: "none", pathParams: PlayerTagPath, query: HistoryQuery, response: PlayerChangesResponse, responseMode: "json", successStatus: 200, errors: NotFound })
export const PlayerCwlHistoryEndpoint = defineEndpoint({ operationId: "getExpoPlayerCwlHistory", method: "GET", path: "/v2/player/:playerTag/cwl/history", auth: "public", summary: "Get player CWL history", body: NoBody, bodyMode: "none", pathParams: PlayerTagPath, query: Schema.Struct({ limit: Schema.optionalKey(Schema.Number) }), response: PlayerCwlHistoryResponse, responseMode: "json", successStatus: 200, errors: NotFound })
export const PlayerTimersEndpoint = defineEndpoint({ operationId: "getExpoPlayerTimers", method: "GET", path: "/v2/player/:playerTag/timers", auth: "public", summary: "Get player timers", body: NoBody, bodyMode: "none", pathParams: PlayerTagPath, query: NoQuery, response: PlayerTimersResponse, responseMode: "json", successStatus: 200, errors: NotFound })
export const PlayerJoinLeaveEndpoint = defineEndpoint({ operationId: "getExpoPlayerJoinLeave", method: "GET", path: "/v2/player/:playerTag/join-leave", auth: "user", summary: "Get player join and leave history", body: NoBody, bodyMode: "none", pathParams: PlayerTagPath, query: Schema.Struct({ limit: Schema.optionalKey(Schema.Number), "time[before]": Schema.optionalKey(Schema.String), "time[after]": Schema.optionalKey(Schema.String) }), response: PlayerJoinLeaveResponse, responseMode: "json", successStatus: 200, errors: NotFound })
export const PlayerJoinLeaveTotalsEndpoint = defineEndpoint({ operationId: "getExpoPlayerJoinLeaveTotals", method: "GET", path: "/v2/player/:playerTag/join-leave/totals", auth: "public", summary: "Get player join and leave totals", body: NoBody, bodyMode: "none", pathParams: PlayerTagPath, query: NoQuery, response: PlayerJoinLeaveTotalsResponse, responseMode: "json", successStatus: 200, errors: NotFound })
export const PlayerWarStatsEndpoint = defineEndpoint({ operationId: "getExpoPlayerWarStats", method: "GET", path: "/v2/player/:playerTag/war/stats", auth: "public", summary: "Get player war statistics", body: NoBody, bodyMode: "none", pathParams: PlayerTagPath, query: HistoryQuery, response: PlayerWarStatsResponse, responseMode: "json", successStatus: 200, errors: NotFound })
