import { Schema } from "effect"
import { defineEndpoint, NoBody } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"
import { WarBadgeUrls, WarResponse } from "./expo-war.js"

// One stored-group contract shared by Bot and Expo, without importing the Bot
// endpoint graph into mobile. Stored rounds contain war objects, not tag strings.
export const StoredCwlGroupResponse = Schema.Struct({
  state: Schema.String, season: Schema.String,
  warLeague: Schema.NullOr(Schema.Struct({ id: Schema.Number, name: Schema.String })),
  clans: Schema.Array(Schema.Struct({
    tag: Schema.String, name: Schema.String, clanLevel: Schema.Number, badgeUrls: WarBadgeUrls,
    members: Schema.Array(Schema.Struct({ tag: Schema.String, name: Schema.String, townHallLevel: Schema.Number })),
  })),
  rounds: Schema.Array(Schema.Struct({ warTags: Schema.Array(Schema.Union([
    Schema.Struct({ ...WarResponse.fields, season: Schema.String }), Schema.Struct({ tag: Schema.String }),
  ])) })),
})
export const StoredCwlGroupEndpoint = defineEndpoint({
  operationId: "getStoredCwlGroup", method: "GET", path: "/v2/cwl/:tag/group", auth: "public",
  summary: "Get a stored CWL group for a clan and optional exact season", body: NoBody, bodyMode: "none",
  pathParams: Schema.Struct({ tag: Schema.String }), query: Schema.Struct({ season: Schema.optionalKey(Schema.String) }),
  response: StoredCwlGroupResponse, responseMode: "json", successStatus: 200,
  errors: [400, 404, 503].map(status => ({ status, body: ErrorResponse })),
})
