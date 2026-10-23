import { Schema } from "effect"
import { defineEndpoint, NoBody } from "./endpoint.js"
export const BotPlayerSeasonEndpoint = defineEndpoint({
  auth: "bot", method: "GET", path: "/v2/bot/players/:tag/season-stats", operationId: "botPlayerSeasonStats",
  pathParams: Schema.Struct({ tag: Schema.String }), query: Schema.Struct({}), body: NoBody, bodyMode: "none",
  response: Schema.Struct({ start: Schema.String, end: Schema.String, recordedBattles: Schema.Number,
    gold: Schema.Number, elixir: Schema.Number, darkElixir: Schema.Number, clanGames: Schema.Number, capitalDonated: Schema.Number, statObservations: Schema.Number }),
  responseMode: "json", successStatus: 200,
  summary: "Read aggregate tracked season loot and event counts. Contains no account links, activity timestamps or private history.",
})
