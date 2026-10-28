import { Schema } from "effect"
import { defineEndpoint } from "./endpoint.js"
export const BotWarStatusEndpoint=defineEndpoint({
 auth:"bot",method:"POST",path:"/v2/bot/players/war-status",operationId:"botPlayerWarStatus",pathParams:Schema.Struct({}),query:Schema.Struct({}),
 body:Schema.Struct({tags:Schema.Array(Schema.String)}),bodyMode:"json",
 response:Schema.Struct({items:Schema.Array(Schema.Struct({tag:Schema.String,lastPreferenceChange:Schema.NullOr(Schema.String),lastWarEnd:Schema.NullOr(Schema.String),timers:Schema.Array(Schema.Struct({type:Schema.Literals(["war","cwl"]),endsAt:Schema.String}))}))}),
 responseMode:"json",successStatus:200,summary:"Read recorded war preference changes, completed war membership and active war/CWL timers for up to 100 players.",
})
