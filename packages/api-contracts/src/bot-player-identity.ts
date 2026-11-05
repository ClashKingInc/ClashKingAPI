import { Schema } from "effect"
import { defineEndpoint, NoBody } from "./endpoint.js"
export const BotPlayerIdentityEndpoint = defineEndpoint({
  auth:"bot", method:"GET", path:"/v2/bot/players/:tag/identity", operationId:"botPlayerIdentity",
  pathParams:Schema.Struct({tag:Schema.String}), query:Schema.Struct({serverId:Schema.optionalKey(Schema.String)}),body:NoBody,bodyMode:"none",
  response:Schema.Struct({link:Schema.NullOr(Schema.Struct({userId:Schema.String,verified:Schema.Boolean})),lastObservedAt:Schema.NullOr(Schema.String)}),
  responseMode:"json",successStatus:200,
  summary:"Read permitted player identity for a Discord profile. Hidden links are omitted and owner identity requires confirmed membership in the requested server.",
})
