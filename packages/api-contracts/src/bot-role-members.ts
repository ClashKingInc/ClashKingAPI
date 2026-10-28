import { Schema } from "effect"
import { defineEndpoint } from "./endpoint.js"
export const BotRoleMembersEndpoint=defineEndpoint({
 auth:"bot",method:"GET",path:"/v2/bot/servers/:serverId/roles/:roleId/members",operationId:"botRoleMembers",
 pathParams:Schema.Struct({serverId:Schema.String,roleId:Schema.String}),query:Schema.Struct({actorId:Schema.String,offset:Schema.optionalKey(Schema.NumberFromString),limit:Schema.optionalKey(Schema.NumberFromString)}),
 body:Schema.Void,bodyMode:"none",response:Schema.Struct({role:Schema.Struct({id:Schema.String,name:Schema.String}),total:Schema.Number,offset:Schema.Number,items:Schema.Array(Schema.Struct({id:Schema.String,name:Schema.String}))}),responseMode:"json",successStatus:200,errors:[],summary:"Read Discord role membership without linked account data",
})
