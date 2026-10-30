import { Schema } from "effect"
import { defineEndpoint, NoPathParams, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"
export const DailyGraphMetric = Schema.Literals(["activity","troopLevels","heroLevels","equipmentLevels","townhallLevels","bestTrophies","experienceLevels","nameChanges","warPreferenceChanges","donated","received","clanGames","capitalDonated","clanMoves"])
export const BotDailyGraphEndpoint = defineEndpoint({
 operationId:"botDailyGraph",method:"POST",path:"/v2/bot/clans/daily-stats",auth:"bot",bodyMode:"json",
 body:Schema.Struct({clans:Schema.Array(Schema.String.check(Schema.isPattern(/^#[0289PYLQGRJCUV]{1,15}$/u))).check(Schema.isMinLength(1),Schema.isMaxLength(50)),metric:DailyGraphMetric,days:Schema.Number.check(Schema.isInt(),Schema.isBetween({minimum:1,maximum:180}))}),
 pathParams:NoPathParams,query:NoQuery,responseMode:"json",successStatus:200,
 response:Schema.Struct({metric:DailyGraphMetric,basis:Schema.Literals(["recorded_clan","latest_stored_members"]),dates:Schema.Array(Schema.String),partialLastDay:Schema.Boolean,series:Schema.Array(Schema.Struct({tag:Schema.String,values:Schema.Array(Schema.Number)}))}),
 errors:[{status:400,body:ErrorResponse},{status:401,body:ErrorResponse},{status:503,body:ErrorResponse}],summary:"Aggregate daily clan observations without exposing individual activity timestamps",
})
