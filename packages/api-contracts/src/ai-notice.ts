import { Schema } from "effect"
import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"
export const AI_NOTICE_VERSION = "2026-10-28"
const response = Schema.Struct({ version: Schema.String, acknowledged: Schema.Boolean })
export const AiNoticeGetEndpoint = defineEndpoint({operationId:"getAiNotice",method:"GET",path:"/v2/users/me/ai-notice",auth:"user",summary:"Read the signed-in person's AI notice acknowledgement",pathParams:NoPathParams,query:NoQuery,body:NoBody,bodyMode:"none",response,responseMode:"json",successStatus:200,errors:[]})
export const AiNoticeAcceptEndpoint = defineEndpoint({operationId:"acceptAiNotice",method:"POST",path:"/v2/users/me/ai-notice",auth:"user",summary:"Acknowledge the current AI notice for the signed-in person",pathParams:NoPathParams,query:NoQuery,body:Schema.Struct({version:Schema.Literal(AI_NOTICE_VERSION)}),bodyMode:"json",response,responseMode:"json",successStatus:200,errors:[]})
