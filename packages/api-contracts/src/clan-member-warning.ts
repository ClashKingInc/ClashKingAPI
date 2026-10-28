import { Schema } from "effect"
import { DecimalSnowflake } from "./discord.js"
import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
const Threshold=Schema.Int.check(Schema.isBetween({minimum:0,maximum:50}))
export const ClanMemberWarning=Schema.Struct({channelId:DecimalSnowflake,below:Schema.NullOr(Threshold),above:Schema.NullOr(Threshold),roleId:Schema.NullOr(DecimalSnowflake)})
const shared={path:"/v2/server/:serverId/clan/:clanTag/member-warning" as const,pathParams:Schema.Struct({serverId:DecimalSnowflake,clanTag:Schema.String}),query:NoQuery,response:Schema.Struct({settings:Schema.NullOr(ClanMemberWarning)}),responseMode:"json" as const,successStatus:200 as const}
export const ClanMemberWarningGet=defineEndpoint({...shared,operationId:"clanMemberWarningGet",method:"GET",auth:"server-manager-read",body:NoBody,bodyMode:"none",summary:"Read a linked clan's member threshold warning"})
export const ClanMemberWarningPut=defineEndpoint({...shared,operationId:"clanMemberWarningPut",method:"PUT",auth:"server-manager-write",body:ClanMemberWarning,bodyMode:"json",summary:"Configure a linked clan's member threshold warning"})
export const ClanMemberWarningDelete=defineEndpoint({...shared,operationId:"clanMemberWarningDelete",method:"DELETE",auth:"server-manager-write",body:NoBody,bodyMode:"none",summary:"Disable a linked clan's member threshold warning"})
