import { Schema } from "effect"
import { defineEndpoint, NoBody, NoPathParams, type ContractSchema } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"
import { StarCounts, TimeRangeQuery } from "./league-analytics.js"

export const ArmySetupQuery = Schema.Struct({
  ...TimeRangeQuery.fields,
  leagueTierId: Schema.optionalKey(Schema.Number),
  rankLimit: Schema.optionalKey(Schema.Number),
  groupKey: Schema.optionalKey(Schema.String),
  variantKey: Schema.optionalKey(Schema.String),
  sort: Schema.optionalKey(Schema.Literals(["usage", "tripleRate"])),
  limit: Schema.optionalKey(Schema.Number),
})
export const ArmySetupCondition = Schema.Struct({
  kind: Schema.String, id: Schema.Int,
  heroId: Schema.optionalKey(Schema.Int),
  minimum: Schema.optionalKey(Schema.Int),
})
export const ArmySetupStatistics = Schema.Struct({
  groupKey: Schema.String, variantKey: Schema.String,
  coreTroops: Schema.Array(Schema.Int), conditions: Schema.Array(ArmySetupCondition),
  shareCode: Schema.String, attacks: Schema.Int, starCounts: StarCounts,
  usageRate: Schema.NullOr(Schema.Number), threeStarRate: Schema.NullOr(Schema.Number),
  averageDestruction: Schema.NullOr(Schema.Number), observedDays: Schema.Int,
  sieges: Schema.Array(Schema.Struct({ id: Schema.Int, attacks: Schema.Int, usageRate: Schema.Number })),
  dailyRank: Schema.NullOr(Schema.Int), previousDayRank: Schema.NullOr(Schema.Int), rankChange: Schema.NullOr(Schema.Int),
  comparisons: Schema.optionalKey(Schema.Array(Schema.Struct({
    rankLimit: Schema.NullOr(Schema.Int), attacks: Schema.Int, totalAttacks: Schema.Int,
    usageRate: Schema.NullOr(Schema.Number), threeStarRate: Schema.NullOr(Schema.Number),
  }))),
})
export const ArmySetupCoverage = Schema.Struct({
  firstDay: Schema.String, lastDay: Schema.String,
  completedDays: Schema.Array(Schema.String),
  totalAttacks: Schema.Int, classifiedAttacks: Schema.Int,
  leagueTierId: Schema.Int, rankLimit: Schema.NullOr(Schema.Int),
})
export const ArmySetupResponse = Schema.Struct({
  ...ArmySetupCoverage.fields,
  items: Schema.Array(ArmySetupStatistics),
})
export const ArmySetupTimelineResponse = Schema.Struct({
  ...ArmySetupCoverage.fields,
  benchmarks: Schema.optionalKey(Schema.Array(Schema.Struct({
    rankLimit: Schema.NullOr(Schema.Int),
    points: Schema.Array(Schema.Struct({ day: Schema.String, attacks: Schema.Int, threeStarRate: Schema.NullOr(Schema.Number) })),
  }))),
  items: Schema.Array(Schema.Struct({
    day: Schema.String, totalAttacks: Schema.Int,
    observation: Schema.NullOr(ArmySetupStatistics),
    rank: Schema.NullOr(Schema.Int), previousDayRank: Schema.NullOr(Schema.Int), rankChange: Schema.NullOr(Schema.Int),
  })),
})
export const ArmySetupRankHistoryResponse = Schema.Struct({
  firstDay: Schema.String, lastDay: Schema.String, leagueTierId: Schema.Int,
  rankLimit: Schema.NullOr(Schema.Int), groupKey: Schema.String, variantKey: Schema.String,
  sort: Schema.Literals(["usage", "tripleRate"]),
  points: Schema.Array(Schema.Struct({ day: Schema.String, attacks: Schema.NullOr(Schema.Int),
    rank: Schema.NullOr(Schema.Int), previousDayRank: Schema.NullOr(Schema.Int), rankChange: Schema.NullOr(Schema.Int) })),
})
const endpoint = <S extends ContractSchema>(operationId: string, path: `/${string}`, response: S, summary: string) => defineEndpoint({
  operationId, path, method: "GET", auth: "public", summary,
  body: NoBody, bodyMode: "none", pathParams: NoPathParams,
  query: ArmySetupQuery, response, responseMode: "json", successStatus: 200,
  errors: [{ status: 400, body: ErrorResponse }],
})
export const ArmySetupsEndpoint = endpoint("armySetups", "/v2/stats/army-setups", ArmySetupResponse,
  "Daily troop-overlap overview, or supported setups within a troop group")
export const ArmySetupTimelineEndpoint = endpoint("armySetupTimeline", "/v2/stats/army-setups/timeline", ArmySetupTimelineResponse,
  "Daily observations of a troop group or setup; null means no supported observation, not zero usage")
export const ArmySetupRankHistoryEndpoint = endpoint("armySetupRankHistory", "/v2/stats/army-setups/rank-history", ArmySetupRankHistoryResponse,
  "Daily selected-cohort rank for a troop group or supported setup")
export const armySetupEndpoints = { armySetups: ArmySetupsEndpoint, armySetupTimeline: ArmySetupTimelineEndpoint, armySetupRankHistory: ArmySetupRankHistoryEndpoint }
