import { Schema } from "effect"
import { defineEndpoint, NoBody } from "./endpoint.js"
export const BotPlayerAutocompleteEndpoint = defineEndpoint({
  auth: "bot", method: "GET", path: "/v2/bot/servers/:serverId/player-autocomplete", operationId: "botPlayerAutocomplete",
  pathParams: Schema.Struct({ serverId: Schema.String }), query: Schema.Struct({ query: Schema.optionalKey(Schema.String) }), body: NoBody, bodyMode: "none",
  response: Schema.Struct({ items: Schema.Array(Schema.Struct({ tag: Schema.String, name: Schema.String, townHallLevel: Schema.Number, clanName: Schema.String })) }),
  responseMode: "json", successStatus: 200,
  summary: "Suggest up to 25 players from the tracked rosters of clans linked to this server.",
})
