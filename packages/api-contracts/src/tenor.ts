import { Schema } from "effect"

import { defineEndpoint, NoPathParams, NoQuery } from "./endpoint.js"

export const TenorMediaRequest = Schema.Struct({
  url: Schema.String,
})

export const TenorMediaResponse = Schema.Struct({
  provider: Schema.Literal("tenor"),
  id: Schema.String,
  media_url: Schema.String,
  width: Schema.Number,
  height: Schema.Number,
})

export const TenorMediaEndpoint = defineEndpoint({
  operationId: "resolveTenorMedia",
  method: "POST",
  path: "/v2/media/tenor/resolve",
  auth: "user-or-bot",
  summary: "Resolve a Tenor share URL to bounded render metadata",
  body: TenorMediaRequest,
  bodyMode: "json",
  pathParams: NoPathParams,
  query: NoQuery,
  response: TenorMediaResponse,
  responseMode: "json",
  successStatus: 200,
})

export type TenorMediaRequest = typeof TenorMediaRequest.Type
export type TenorMediaResponse = typeof TenorMediaResponse.Type
