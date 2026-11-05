import { Schema } from "effect"
import { defineEndpoint } from "./endpoint.js"

export const BotManualRemindersEndpoint = defineEndpoint({
  operationId: "botManualReminders", method: "POST", path: "/v2/bot/server/:serverId/reminders/manual", auth: "bot",
  bodyMode: "json", body: Schema.Struct({
    clanTag: Schema.String.check(Schema.isPattern(/^#[0289PYLQGRJCUV]{3,15}$/u)),
    type: Schema.Literals(["War", "Clan Capital", "Clan Games", "roster"]),
  }),
  pathParams: Schema.Struct({ serverId: Schema.String }), query: Schema.Struct({}),
  response: Schema.Struct({ accepted: Schema.Number }), responseMode: "json", successStatus: 202,
  summary: "Request best-effort manual delivery of configured server reminders",
})
