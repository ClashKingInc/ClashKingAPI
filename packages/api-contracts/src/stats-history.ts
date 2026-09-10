import { Schema } from "effect"

import { defineEndpoint, NoBody, NoPathParams } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"

const PublicErrors = [{ status: 400, body: ErrorResponse }] as const
const TimeWindow = {
  "time[after]": Schema.optionalKey(Schema.String),
  "time[before]": Schema.optionalKey(Schema.String),
} as const
const Interval = Schema.Literals(["day", "week", "month"])
export const WarStatisticsQuery = Schema.Struct({
  ...TimeWindow,
  interval: Schema.optionalKey(Interval),
})
export const WarHitratesQuery = Schema.Struct({
  ...WarStatisticsQuery.fields,
  townHall: Schema.optionalKey(Schema.Int),
})
export const WarHitrateItem = Schema.Struct({
  period: Schema.String,
  townHall: Schema.Int,
  attacks: Schema.Int,
  stars: Schema.Array(Schema.Struct({ stars: Schema.Int, count: Schema.Int })),
  averageStars: Schema.Number,
  averageDestruction: Schema.Number,
  averageDuration: Schema.Number,
})
export const WarHitratesResponse = Schema.Struct({ items: Schema.Array(WarHitrateItem) })
export const WarHitratesEndpoint = defineEndpoint({
  operationId: "getWarHitrates", method: "GET", path: "/v2/stats/wars/hitrates", auth: "public",
  summary: "Get uploaded regular-war same-Town-Hall hit rates", body: NoBody, bodyMode: "none",
  pathParams: NoPathParams, query: WarHitratesQuery, response: WarHitratesResponse,
  responseMode: "json", successStatus: 200, errors: PublicErrors,
})

export const WarSummaryQuery = Schema.Struct({
  ...WarStatisticsQuery.fields,
  warSize: Schema.optionalKey(Schema.Int),
  groupBy: Schema.optionalKey(Schema.Literal("warSize")),
})
export const WarSummaryItem = Schema.Struct({
  period: Schema.String,
  warSize: Schema.optionalKey(Schema.Int),
  wars: Schema.Int,
  accounts: Schema.Int,
  townHalls: Schema.Array(Schema.Struct({ level: Schema.Int, count: Schema.Int })),
  draws: Schema.Int,
  missedAttacks: Schema.optionalKey(Schema.Int),
})
export const WarSummaryResponse = Schema.Struct({ items: Schema.Array(WarSummaryItem) })
export const WarSummaryEndpoint = defineEndpoint({
  operationId: "getWarSummary", method: "GET", path: "/v2/stats/wars/summary", auth: "public",
  summary: "Get uploaded regular-war participation summaries", body: NoBody, bodyMode: "none",
  pathParams: NoPathParams, query: WarSummaryQuery, response: WarSummaryResponse,
  responseMode: "json", successStatus: 200, errors: PublicErrors,
})

export const statsHistoryEndpoints = {
  warHitrates: WarHitratesEndpoint,
  warSummary: WarSummaryEndpoint,
} as const
