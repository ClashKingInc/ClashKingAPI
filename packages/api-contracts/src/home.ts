import { Schema } from "effect"

import { defineEndpoint, NoPathParams, NoQuery } from "./endpoint.js"

export const HomeActivityPlayerMapping = Schema.Struct({
  player_tag: Schema.String,
  clan_tag: Schema.NullOr(Schema.String),
})

export const HomeActivityRequest = Schema.Struct({
  account_id: Schema.String,
  mappings: Schema.Array(HomeActivityPlayerMapping),
  limit: Schema.optionalKey(Schema.Number),
})

export const HomeActivityItem = Schema.Struct({
  type: Schema.Literal("join_leave"),
  timestamp: Schema.String,
  event_type: Schema.String,
  player_tag: Schema.String,
  clan_tag: Schema.NullOr(Schema.String),
  player_name: Schema.optionalKey(Schema.String),
  clan_name: Schema.optionalKey(Schema.String),
  townhall_level: Schema.optionalKey(Schema.Number),
})

export const HomeActivityResponse = Schema.Struct({
  items: Schema.Array(HomeActivityItem),
})

export const HomeActivityEndpoint = defineEndpoint({
  operationId: "homeActivity",
  method: "POST",
  path: "/v2/home/activity",
  auth: "user-or-bot",
  summary: "Get account home activity",
  body: HomeActivityRequest,
  bodyMode: "json",
  pathParams: NoPathParams,
  query: NoQuery,
  response: HomeActivityResponse,
  responseMode: "json",
  successStatus: 200,
})

export type HomeActivityRequest = typeof HomeActivityRequest.Type
export type HomeActivityResponse = typeof HomeActivityResponse.Type
