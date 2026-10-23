import { Schema } from "effect"
import { defineEndpoint, NoBody } from "./endpoint.js"

export const BotLegendStatsResponse = Schema.Union([
  Schema.Struct({ day: Schema.NullOr(Schema.String), items: Schema.Array(Schema.Struct({ rank: Schema.Number, trophies: Schema.Number })) }),
  Schema.Struct({ items: Schema.Array(Schema.Struct({ season: Schema.String, tag: Schema.String, name: Schema.String, trophies: Schema.Number })) }),
])

export const BotLegendStatsEndpoint = defineEndpoint({
  auth: "bot", body: NoBody, bodyMode: "none", method: "GET", operationId: "botLegendStats",
  path: "/v2/bot/legends/stats", pathParams: Schema.Struct({}),
  query: Schema.Struct({ type: Schema.optionalKey(Schema.Literals(["cutoffs", "winners"])), limit: Schema.optionalKey(Schema.Number) }),
  response: BotLegendStatsResponse, responseMode: "json", successStatus: 200,
  summary: "Read retained Legend rank cutoffs or first-place season finishes. Cutoffs include their snapshot day; limit is 1–50.",
})
