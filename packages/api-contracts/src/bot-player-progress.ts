import { Schema } from "effect"
import { defineEndpoint } from "./endpoint.js"
export const BotPlayerProgressEndpoint = defineEndpoint({
 auth:"bot",method:"POST",path:"/v2/bot/players/upgrade-progress",operationId:"botPlayerUpgradeProgress",
 pathParams:Schema.Struct({}),query:Schema.Struct({}),
 body:Schema.Struct({tags:Schema.Array(Schema.String),type:Schema.Literals(["heroes","troops","equipment","all"]),season:Schema.optionalKey(Schema.String)}),bodyMode:"json",
 response:Schema.Struct({season:Schema.String,start:Schema.String,end:Schema.String,items:Schema.Array(Schema.Struct({tag:Schema.String,units:Schema.Array(Schema.Struct({type:Schema.Number,itemId:Schema.Number,name:Schema.String,changes:Schema.Number,levels:Schema.Number}))}))}),
 responseMode:"json",successStatus:200,summary:"Read observed unit upgrade changes and level gains for 1–100 players within one game season. Excludes boosts and non-upgrade changes.",
})
