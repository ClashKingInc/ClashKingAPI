import { Schema } from "effect"
import { defineEndpoint, NoBody, NoQuery, NoPathParams } from "./endpoint.js"
const Count=Schema.Int.check(Schema.isBetween({minimum:0,maximum:10000}))
const Money=Schema.Number.check(Schema.isBetween({minimum:0,maximum:10000}))
export const ServerLimits=Schema.Struct({serverId:Schema.String,name:Schema.String,
 clanLimit:Count,autoboardLimit:Count,aiMonthlyLimitUsd:Money,customAutoboardIntervalEnabled:Schema.Boolean,botCustomizationEnabled:Schema.Boolean,
 clanCount:Schema.Int,autoboardCount:Schema.Int,aiSpentUsd:Schema.Number,aiReservedUsd:Schema.Number,resetsAt:Schema.String,supportUrl:Schema.String})
export const ManualLimits=Schema.Struct({clanLimit:Count,autoboardLimit:Count,aiMonthlyLimitUsd:Money,customAutoboardIntervalEnabled:Schema.optionalKey(Schema.Boolean),botCustomizationEnabled:Schema.optionalKey(Schema.Boolean)})
export const ServerLimitsEndpoint=defineEndpoint({summary:"Manual server limits and AI budgeting",operationId:"serverLimits",method:"GET",path:"/v2/server/:serverId/limits",auth:"server-read",pathParams:Schema.Struct({serverId:Schema.String}),query:NoQuery,body:NoBody,bodyMode:"none",response:ServerLimits,responseMode:"json",successStatus:200})
export const AdminServerLimitsEndpoint=defineEndpoint({summary:"Manual server limits and AI budgeting",operationId:"adminServerLimits",method:"GET",path:"/v2/admin/server-limits",auth:"admin",pathParams:NoPathParams,query:Schema.Struct({search:Schema.optionalKey(Schema.String)}),body:NoBody,bodyMode:"none",response:Schema.Array(ServerLimits),responseMode:"json",successStatus:200})
export const AdminUpdateServerLimitsEndpoint=defineEndpoint({summary:"Manual server limits and AI budgeting",operationId:"adminUpdateServerLimits",method:"PATCH",path:"/v2/admin/server-limits/:serverId",auth:"admin",pathParams:Schema.Struct({serverId:Schema.String}),query:NoQuery,body:ManualLimits,bodyMode:"json",response:ServerLimits,responseMode:"json",successStatus:200})
export const ReserveAIStepEndpoint=defineEndpoint({summary:"Manual server limits and AI budgeting",operationId:"reserveAIStep",method:"POST",path:"/v2/runtime/roster-ai/reserve",auth:"ai-metering",pathParams:NoPathParams,query:NoQuery,body:Schema.Struct({requestId:Schema.String,step:Schema.Int,inputTokenLimit:Schema.Int,outputTokenLimit:Schema.Int}),bodyMode:"json",response:Schema.Struct({step:Schema.Int,maxOutputTokens:Schema.Int,reservedUsd:Schema.Number}),responseMode:"json",successStatus:200})
export const SettleAIStepEndpoint=defineEndpoint({summary:"Manual server limits and AI budgeting",operationId:"settleAIStep",method:"POST",path:"/v2/runtime/roster-ai/settle",auth:"ai-metering",pathParams:NoPathParams,query:NoQuery,body:Schema.Struct({requestId:Schema.String,step:Schema.Int,inputTokens:Schema.Int,outputTokens:Schema.Int,cachedInputTokens:Schema.optionalKey(Schema.Int),cacheWriteTokens:Schema.optionalKey(Schema.Int)}),bodyMode:"json",response:Schema.Struct({settled:Schema.Boolean}),responseMode:"json",successStatus:200})

export const AdminResetBotProfileEndpoint=defineEndpoint({
 summary:"Restore a server bot profile to global defaults; leaves its customization grant unchanged",
 operationId:"adminResetBotProfile",method:"POST",path:"/v2/admin/server-limits/:serverId/reset-bot-profile",auth:"admin",
 pathParams:Schema.Struct({serverId:Schema.String}),query:NoQuery,body:NoBody,bodyMode:"none",
 response:Schema.Struct({reset:Schema.Boolean}),responseMode:"json",successStatus:200,
})
