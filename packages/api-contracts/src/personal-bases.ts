import { Schema } from "effect"

import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"

export const PersonalBaseId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/u)).annotate({
  description: "Base ID as a decimal string; never convert it to a JavaScript number.",
})
export const PersonalBase = Schema.Struct({
  id: PersonalBaseId,
  baseLink: Schema.String,
  images: Schema.Array(Schema.String),
  description: Schema.String,
  createdAt: Schema.String,
  serverId: Schema.String,
  channelId: Schema.String,
  messageId: Schema.String,
  discordMessageUrl: Schema.String,
  downloadCount: Schema.Int,
  upvotes: Schema.Int,
  downvotes: Schema.Int,
  saved: Schema.Boolean,
  savedAt: Schema.NullOr(Schema.String),
  downloadedAt: Schema.NullOr(Schema.String),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const PersonalBasesState = Schema.Struct({
  items: Schema.Array(PersonalBase),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

const PersonalErrors = [
  { status: 400, body: ErrorResponse },
  { status: 401, body: ErrorResponse },
  { status: 404, body: ErrorResponse },
  { status: 409, body: ErrorResponse },
] as const
const BasePath = Schema.Struct({ baseId: PersonalBaseId })

export const PersonalBasesEndpoint = defineEndpoint({
  operationId: "getPersonalBases", method: "GET", path: "/v2/bases/personal", auth: "user",
  summary: "List the authenticated user's saved and historically downloaded bases", body: NoBody, bodyMode: "none",
  pathParams: NoPathParams, query: NoQuery, response: PersonalBasesState, responseMode: "json", successStatus: 200,
  errors: PersonalErrors,
})
export const SavePersonalBaseEndpoint = defineEndpoint({
  operationId: "savePersonalBase", method: "PUT", path: "/v2/bases/personal/:baseId", auth: "user",
  summary: "Save one shared base", body: NoBody, bodyMode: "none", pathParams: BasePath, query: NoQuery,
  response: PersonalBasesState, responseMode: "json", successStatus: 200, errors: PersonalErrors,
})
export const UnsavePersonalBaseEndpoint = defineEndpoint({
  operationId: "unsavePersonalBase", method: "DELETE", path: "/v2/bases/personal/:baseId", auth: "user",
  summary: "Unsave one shared base", body: NoBody, bodyMode: "none", pathParams: BasePath, query: NoQuery,
  response: PersonalBasesState, responseMode: "json", successStatus: 200, errors: PersonalErrors,
})
export const DeleteOldPersonalBasesEndpoint = defineEndpoint({
  operationId: "deleteOldPersonalBases", method: "DELETE", path: "/v2/bases/personal/older-than-90-days", auth: "user",
  summary: "Unsave bases saved more than 90 days ago", body: NoBody, bodyMode: "none", pathParams: NoPathParams, query: NoQuery,
  response: PersonalBasesState, responseMode: "json", successStatus: 200, errors: PersonalErrors,
})

export const personalBaseEndpoints = {
  personalBases: PersonalBasesEndpoint,
  savePersonalBase: SavePersonalBaseEndpoint,
  unsavePersonalBase: UnsavePersonalBaseEndpoint,
  deleteOldPersonalBases: DeleteOldPersonalBasesEndpoint,
} as const
