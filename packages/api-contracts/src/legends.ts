import { Schema } from "effect"

import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"

export const LegendRankRequest = Schema.Struct({
  tags: Schema.Array(Schema.String).check(Schema.isMaxLength(100)),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const LegendHistoricalRankRequest = Schema.Struct({
  day: Schema.String,
  tags: Schema.Array(Schema.String).check(Schema.isMaxLength(100)),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const LegendDaySummariesRequest = LegendHistoricalRankRequest
const LegendLocation = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
  isCountry: Schema.Boolean,
  countryCode: Schema.optionalKey(Schema.String),
})
const LegendClan = Schema.Struct({ tag: Schema.String, name: Schema.String })
export const LegendRank = Schema.Struct({
  tag: Schema.String,
  name: Schema.String,
  trophies: Schema.Int,
  globalRank: Schema.Int,
  clan: Schema.optionalKey(LegendClan),
  location: Schema.optionalKey(LegendLocation),
})
export const LegendRanksResponse = Schema.Struct({ items: Schema.Array(LegendRank) })
export const LegendTrophyBucket = Schema.Struct({
  minimumTrophies: Schema.Int,
  maximumTrophies: Schema.Int,
  playerCount: Schema.Int,
})
export const LegendTrophyBucketsResponse = Schema.Struct({ items: Schema.Array(LegendTrophyBucket) })
export const LegendDaySummary = Schema.Struct({
  tag: Schema.String,
  attackTrophies: Schema.Int,
  defenseTrophies: Schema.Int,
  netTrophies: Schema.Int,
  attacks: Schema.Int,
  defenses: Schema.Int,
})
export const LegendDaySummariesResponse = Schema.Struct({ items: Schema.Array(LegendDaySummary) })

const errors = [{ status: 400, body: ErrorResponse }] as const
export const LegendRanksEndpoint = defineEndpoint({
  operationId: "getLegendRanks", method: "POST", path: "/v2/legends/ranks", auth: "public",
  summary: "Get current Legend ranks for up to 100 players", body: LegendRankRequest, bodyMode: "json",
  pathParams: NoPathParams, query: NoQuery, response: LegendRanksResponse, responseMode: "json", successStatus: 200, errors,
})
export const LegendHistoricalRanksEndpoint = defineEndpoint({
  operationId: "getHistoricalLegendRanks", method: "POST", path: "/v2/legends/ranks/history", auth: "public",
  summary: "Get one daily Legend rank snapshot for up to 100 players", body: LegendHistoricalRankRequest, bodyMode: "json",
  pathParams: NoPathParams, query: NoQuery, response: LegendRanksResponse, responseMode: "json", successStatus: 200, errors,
})
export const LegendDaySummariesEndpoint = defineEndpoint({
  operationId: "getLegendDaySummaries", method: "POST", path: "/v2/legends/days", auth: "public",
  summary: "Get one Legend day's trophy summaries for up to 100 players", body: LegendDaySummariesRequest, bodyMode: "json",
  pathParams: NoPathParams, query: NoQuery, response: LegendDaySummariesResponse, responseMode: "json", successStatus: 200, errors,
})
export const LegendTrophyBucketsEndpoint = defineEndpoint({
  operationId: "getLegendTrophyBuckets", method: "GET", path: "/v2/legends/trophy-buckets", auth: "public",
  summary: "Get current Legend trophy buckets", body: NoBody, bodyMode: "none", pathParams: NoPathParams,
  query: NoQuery, response: LegendTrophyBucketsResponse, responseMode: "json", successStatus: 200, errors,
})
export const LegendHistoricalTrophyBucketsEndpoint = defineEndpoint({
  operationId: "getHistoricalLegendTrophyBuckets", method: "GET", path: "/v2/legends/trophy-buckets/:day", auth: "public",
  summary: "Get historical Legend trophy buckets", body: NoBody, bodyMode: "none",
  pathParams: Schema.Struct({ day: Schema.String }), query: NoQuery,
  response: LegendTrophyBucketsResponse, responseMode: "json", successStatus: 200, errors,
})

export const legendEndpoints = {
  legendRanks: LegendRanksEndpoint,
  historicalLegendRanks: LegendHistoricalRanksEndpoint,
  legendDaySummaries: LegendDaySummariesEndpoint,
  legendTrophyBuckets: LegendTrophyBucketsEndpoint,
  historicalLegendTrophyBuckets: LegendHistoricalTrophyBucketsEndpoint,
} as const
