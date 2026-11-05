import { Schema } from "effect"
import { defineEndpoint, NoPathParams, NoQuery } from "./endpoint.js"
import { RuntimeInteractionProof } from "./persistent-runtime.js"

export const BotServerActivityEndpoint = defineEndpoint({
  operationId: "botServerActivity", method: "POST", path: "/v2/bot/server-activity", auth: "bot",
  summary: "Record a fresh signed guild command for the server activity window",
  body: RuntimeInteractionProof, bodyMode: "json", pathParams: NoPathParams, query: NoQuery,
  response: Schema.Struct({ recorded: Schema.Boolean }), responseMode: "json", successStatus: 200,
})
