import { Schema } from "effect"
import { defineEndpoint, NoBody, type ContractSchema } from "./endpoint.js"

export const LegacyBadgeUrls = Schema.Struct({ small: Schema.String, large: Schema.String, medium: Schema.String })
export const LegacyWarAttack = Schema.Struct({ attackerTag: Schema.String, defenderTag: Schema.String, stars: Schema.Number, destructionPercentage: Schema.Number, order: Schema.Number, duration: Schema.Number })
export const LegacyWarMember = Schema.Struct({
  tag: Schema.String, name: Schema.String, townhallLevel: Schema.Number, mapPosition: Schema.Number,
  attacks: Schema.optionalKey(Schema.Array(LegacyWarAttack)), opponentAttacks: Schema.optionalKey(Schema.Number),
  bestOpponentAttack: Schema.optionalKey(LegacyWarAttack),
})
export const LegacyWarClan = Schema.Struct({
  tag: Schema.String, name: Schema.String, badgeUrls: LegacyBadgeUrls, clanLevel: Schema.Number,
  attacks: Schema.Number, stars: Schema.Number, destructionPercentage: Schema.Number,
  members: Schema.optionalKey(Schema.Array(LegacyWarMember)),
})
export const LegacyWar = Schema.Struct({
  type: Schema.optionalKey(Schema.String), state: Schema.String, teamSize: Schema.Number,
  attacksPerMember: Schema.optionalKey(Schema.Number), battleModifier: Schema.optionalKey(Schema.String),
  preparationStartTime: Schema.String, startTime: Schema.optionalKey(Schema.String), endTime: Schema.String,
  clan: LegacyWarClan, opponent: LegacyWarClan, warStartTime: Schema.optionalKey(Schema.String),
  tag: Schema.optionalKey(Schema.String), season: Schema.optionalKey(Schema.String),
})
export const LegacyWarHitAttack = Schema.Struct({
  ...LegacyWarAttack.fields, fresh: Schema.Boolean, defender: Schema.optionalKey(LegacyWarMember),
  attacker: Schema.optionalKey(LegacyWarMember), attack_order: Schema.Number,
})
export const LegacyPlayerWarHitsResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({
  war_data: LegacyWar, member_data: LegacyWarMember,
  attacks: Schema.Array(LegacyWarHitAttack), defenses: Schema.Array(LegacyWarHitAttack),
})) })
export const LegacyWarListResponse = Schema.Struct({ items: Schema.Array(LegacyWar) })
export const LegacyJoinLeaveResponse = Schema.Struct({ items: Schema.Array(Schema.Struct({
  name: Schema.String, tag: Schema.String, th: Schema.Number, time: Schema.String,
  clan: Schema.String, type: Schema.String, clan_name: Schema.optionalKey(Schema.String),
})) })
export const LegacyCwlClan = Schema.Struct({
  tag: Schema.String, name: Schema.String, clanLevel: Schema.Number, badgeUrls: LegacyBadgeUrls,
  members: Schema.Array(Schema.Struct({ tag: Schema.String, name: Schema.String, townHallLevel: Schema.Number })),
})
const LegacyCwlRoundTags = Schema.Struct({ warTags: Schema.Array(Schema.String) })
const LegacyCwlRoundWars = Schema.Struct({ warTags: Schema.Array(Schema.Union([LegacyWar, Schema.Struct({ tag: Schema.String })])) })
export const LegacyCwlGroup = Schema.Struct({ state: Schema.String, season: Schema.String, clans: Schema.Array(LegacyCwlClan), rounds: Schema.Array(LegacyCwlRoundWars) })
export const LegacyCurrentCwlResponse = Schema.Union([Schema.Null, Schema.Struct({ data: Schema.Struct({ state: Schema.String, season: Schema.String, clans: Schema.Array(LegacyCwlClan), rounds: Schema.Array(LegacyCwlRoundTags) }) })])
const legacyQuery = Schema.Struct({ timestamp_start: Schema.optionalKey(Schema.String), timestamp_end: Schema.optionalKey(Schema.String), limit: Schema.optionalKey(Schema.String) })
const joinLeaveQuery = Schema.Struct({ timestamp_start: Schema.optionalKey(Schema.String), time_stamp_end: Schema.optionalKey(Schema.String), limit: Schema.optionalKey(Schema.String) })
const endpoint = <PathParams extends ContractSchema, Query extends ContractSchema, Response extends ContractSchema>(operationId: string, path: `/${string}`, pathParams: PathParams, query: Query, response: Response, summary: string) => defineEndpoint({
  operationId, method: "GET", path, auth: "public", summary, body: NoBody, bodyMode: "none", pathParams, query, response, responseMode: "json", successStatus: 200,
})

export const legacyPublicEndpoints = {
  legacyPlayerWarHits: endpoint("getLegacyPlayerWarHits", "/player/:player_tag/warhits", Schema.Struct({ player_tag: Schema.String }), legacyQuery, LegacyPlayerWarHitsResponse, "Get legacy player war attacks and defenses"),
  legacyPlayerJoinLeave: endpoint("getLegacyPlayerJoinLeave", "/player/:player_tag/join-leave", Schema.Struct({ player_tag: Schema.String }), joinLeaveQuery, LegacyJoinLeaveResponse, "Get legacy player join and leave history"),
  legacyClanJoinLeave: endpoint("getLegacyClanJoinLeave", "/clan/:clan_tag/join-leave", Schema.Struct({ clan_tag: Schema.String }), joinLeaveQuery, LegacyJoinLeaveResponse, "Get legacy clan join and leave history"),
  legacyPreviousWars: endpoint("getLegacyPreviousWars", "/war/:clan_tag/previous", Schema.Struct({ clan_tag: Schema.String }), legacyQuery, LegacyWarListResponse, "Get legacy stored clan wars"),
  legacyPreviousWarAtTime: endpoint("getLegacyPreviousWarAtTime", "/war/:clan_tag/previous/:end_time", Schema.Struct({ clan_tag: Schema.String, end_time: Schema.String }), Schema.Struct({}), LegacyWar, "Get a legacy stored clan war at an end time"),
  legacyCurrentCwlGroup: endpoint("getLegacyCurrentCwlGroup", "/cwl/:clan_tag/group", Schema.Struct({ clan_tag: Schema.String }), Schema.Struct({}), LegacyCurrentCwlResponse, "Get the current legacy CWL group"),
  legacyCwlSeason: endpoint("getLegacyCwlSeason", "/cwl/:clan_tag/:season", Schema.Struct({ clan_tag: Schema.String, season: Schema.String }), Schema.Struct({}), LegacyCwlGroup, "Get a legacy CWL season with stored wars"),
} as const
