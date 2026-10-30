import { Schema } from "effect"
import { DecimalSnowflake } from "./discord.js"
import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
export const BotUserRostersEndpoint=defineEndpoint({operationId:"botUserRosters",method:"GET",path:"/v2/bot/servers/:serverId/users/:userId/rosters",auth:"bot",body:NoBody,bodyMode:"none",pathParams:Schema.Struct({serverId:DecimalSnowflake,userId:DecimalSnowflake}),query:NoQuery,responseMode:"json",successStatus:200,
 response:Schema.Struct({truncated:Schema.Boolean,items:Schema.Array(Schema.Struct({rosterId:Schema.String,rosterName:Schema.String,playerTag:Schema.String,playerName:Schema.String,clanName:Schema.NullOr(Schema.String),groupName:Schema.String}))}),summary:"List a member's visible linked accounts in this server's rosters"})
