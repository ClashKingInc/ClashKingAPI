import { Schema } from "effect"

import { defineEndpoint, NoBody, NoPathParams } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"

const StatsErrors = [
  { status: 400, body: ErrorResponse },
] as const

const OptionalPositiveInt = Schema.optionalKey(Schema.Number)
export const StatsDateRange = Schema.Struct({
  start: Schema.String,
  end: Schema.String,
})

export const StatsRankedQuery = Schema.Struct({
  startDate: Schema.optionalKey(Schema.String), endDate: Schema.optionalKey(Schema.String),
  townHallLevel: Schema.Number, leagueTierId: Schema.Number,
})
export const StatsWarQuery = Schema.Struct({
  startDate: Schema.optionalKey(Schema.String), endDate: Schema.optionalKey(Schema.String),
  townHallLevel: OptionalPositiveInt, opponentTownHallLevel: OptionalPositiveInt,
  equalTownHalls: Schema.optionalKey(Schema.Boolean),
})
export const StatsCwlQuery = Schema.Struct({
  ...StatsWarQuery.fields, cwlLeagueId: OptionalPositiveInt,
  seasons: Schema.optionalKey(Schema.Array(Schema.String)),
})

export const StatsDailyPoint = Schema.Struct({
  date: Schema.String,
  sampleSize: Schema.Number,
  useCount: Schema.optionalKey(Schema.Number),
  usageRate: Schema.optionalKey(Schema.Number),
  averageStars: Schema.Number,
  averageDestruction: Schema.Number,
  zeroStarRate: Schema.Number,
  oneStarRate: Schema.Number,
  twoStarRate: Schema.Number,
  threeStarRate: Schema.Number,
})

export const StatsMetrics = Schema.Struct({
  available: Schema.Boolean,
  sampleSize: Schema.Number,
  usageRate: Schema.optionalKey(Schema.Number),
  averageStars: Schema.Number,
  averageDestruction: Schema.Number,
  zeroStarRate: Schema.Number,
  oneStarRate: Schema.Number,
  twoStarRate: Schema.Number,
  threeStarRate: Schema.Number,
  daily: Schema.Array(StatsDailyPoint),
})

export const StatsBreakdown = Schema.Struct({
  key: Schema.String,
  metrics: StatsMetrics,
})

export const StatsPerformanceResponse = Schema.Struct({
  dateRange: StatsDateRange,
  metrics: StatsMetrics,
  breakdowns: Schema.optionalKey(Schema.Array(StatsBreakdown)),
})

export const StatsRankedEndpoint = defineEndpoint({
  operationId: "statsRanked",
  method: "GET",
  path: "/v2/stats/ranked",
  auth: "public",
  summary: "Query ranked performance",
  body: NoBody,
  bodyMode: "none",
  pathParams: NoPathParams,
  query: StatsRankedQuery,
  response: StatsPerformanceResponse,
  responseMode: "json",
  successStatus: 200,
  errors: StatsErrors,
})

export const StatsWarEndpoint = defineEndpoint({
  operationId: "statsWar",
  method: "GET",
  path: "/v2/stats/war",
  auth: "public",
  summary: "Query regular-war performance",
  body: NoBody,
  bodyMode: "none",
  pathParams: NoPathParams,
  query: StatsWarQuery,
  response: StatsPerformanceResponse,
  responseMode: "json",
  successStatus: 200,
  errors: StatsErrors,
})

export const StatsCwlEndpoint = defineEndpoint({
  operationId: "statsCwl",
  method: "GET",
  path: "/v2/stats/cwl",
  auth: "public",
  summary: "Query CWL performance",
  body: NoBody,
  bodyMode: "none",
  pathParams: NoPathParams,
  query: StatsCwlQuery,
  response: StatsPerformanceResponse,
  responseMode: "json",
  successStatus: 200,
  errors: StatsErrors,
})

export type StatsPerformanceResponse = typeof StatsPerformanceResponse.Type
