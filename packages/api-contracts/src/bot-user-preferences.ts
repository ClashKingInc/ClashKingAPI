import { Schema } from "effect"
import { defineEndpoint, NoBody } from "./endpoint.js"
const response = Schema.Struct({ privateMode: Schema.Boolean })
const pathParams = Schema.Struct({ userId: Schema.String })
export const BotUserPreferencesEndpoint = defineEndpoint({
  auth: "bot", method: "GET", path: "/v2/bot/users/:userId/preferences", operationId: "botUserPreferences",
  pathParams, query: Schema.Struct({}), body: NoBody, bodyMode: "none", response, responseMode: "json", successStatus: 200,
  summary: "Read the signed Discord actor's statistics visibility preference.",
})
export const BotUpdateUserPreferencesEndpoint = defineEndpoint({
  auth: "bot", method: "PATCH", path: "/v2/bot/users/:userId/preferences", operationId: "botUpdateUserPreferences",
  pathParams, query: Schema.Struct({}), bodyMode: "json", body: Schema.Struct({ privateMode: Schema.Boolean }),
  response, responseMode: "json", successStatus: 200,
  summary: "Update statistics visibility for the signed Discord actor; preserve other preferences.",
})
