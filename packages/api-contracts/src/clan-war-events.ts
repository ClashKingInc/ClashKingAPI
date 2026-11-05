import { Schema } from "effect"
import { DecimalSnowflake } from "./discord.js"
import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
const warEvents={path:"/v2/server/:serverId/clan/:clanTag/war-events" as const,pathParams:Schema.Struct({serverId:DecimalSnowflake,clanTag:Schema.String}),query:NoQuery,response:Schema.Struct({enabled:Schema.Boolean}),responseMode:"json" as const,successStatus:200 as const}
export const ClanWarEventsGet=defineEndpoint({...warEvents,operationId:"clanWarEventsGet",method:"GET",auth:"server-manager-read",body:NoBody,bodyMode:"none",summary:"Read automatic Discord war-event configuration"})
export const ClanWarEventsPut=defineEndpoint({...warEvents,operationId:"clanWarEventsPut",method:"PUT",auth:"server-manager-write",body:Schema.Struct({enabled:Schema.Boolean}),bodyMode:"json",summary:"Enable or disable automatic Discord war events for a linked clan"})
