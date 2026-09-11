import { Schema } from "effect"

import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"

export const PersonalBaseId = Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/u)).annotate({
  description: "Base ID as a decimal string; never convert it to a JavaScript number.",
})
export const PersonalBaseSlotKind = Schema.Literals(["war", "legend"])
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
export const PersonalBaseSlot = Schema.Struct({
  playerTag: Schema.String,
  kind: PersonalBaseSlotKind,
  number: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 })),
  baseId: PersonalBaseId,
  assignedAt: Schema.String,
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const PersonalBasesState = Schema.Struct({
  items: Schema.Array(PersonalBase),
  slots: Schema.Array(PersonalBaseSlot),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

const PersonalErrors = [
  { status: 400, body: ErrorResponse },
  { status: 401, body: ErrorResponse },
  { status: 404, body: ErrorResponse },
  { status: 409, body: ErrorResponse },
] as const
const BasePath = Schema.Struct({ baseId: PersonalBaseId })
const SlotPath = Schema.Struct({
  playerTag: Schema.String,
  kind: PersonalBaseSlotKind,
  number: Schema.String.check(Schema.isPattern(/^[1-3]$/u)),
})

export const PersonalBasesEndpoint = defineEndpoint({
  operationId: "getPersonalBases", method: "GET", path: "/v2/bases/personal", auth: "user",
  summary: "List the authenticated user's saved bases and assigned slots", body: NoBody, bodyMode: "none",
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
  summary: "Unsave one shared base and clear its slots", body: NoBody, bodyMode: "none", pathParams: BasePath, query: NoQuery,
  response: PersonalBasesState, responseMode: "json", successStatus: 200, errors: PersonalErrors,
})
export const AssignPersonalBaseSlotEndpoint = defineEndpoint({
  operationId: "assignPersonalBaseSlot", method: "PUT", path: "/v2/bases/personal/slots/:playerTag/:kind/:number", auth: "user",
  summary: "Assign a saved base to a War or Legend slot", body: Schema.Struct({ baseId: PersonalBaseId }).annotate({ parseOptions: { onExcessProperty: "error" } }),
  bodyMode: "json", pathParams: SlotPath, query: NoQuery, response: PersonalBasesState, responseMode: "json", successStatus: 200,
  errors: PersonalErrors,
})
export const ClearPersonalBaseSlotEndpoint = defineEndpoint({
  operationId: "clearPersonalBaseSlot", method: "DELETE", path: "/v2/bases/personal/slots/:playerTag/:kind/:number", auth: "user",
  summary: "Clear one War or Legend base slot", body: NoBody, bodyMode: "none", pathParams: SlotPath, query: NoQuery,
  response: PersonalBasesState, responseMode: "json", successStatus: 200, errors: PersonalErrors,
})

export const personalBaseEndpoints = {
  personalBases: PersonalBasesEndpoint,
  savePersonalBase: SavePersonalBaseEndpoint,
  unsavePersonalBase: UnsavePersonalBaseEndpoint,
  assignPersonalBaseSlot: AssignPersonalBaseSlotEndpoint,
  clearPersonalBaseSlot: ClearPersonalBaseSlotEndpoint,
} as const
