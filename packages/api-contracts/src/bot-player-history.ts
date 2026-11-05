import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
import { PlayerTagPath } from "./expo-common.js"
import { PlayerJoinLeaveResponse } from "./expo-player.js"
export const BotPlayerClanTimelineEndpoint = defineEndpoint({
 auth:"bot",method:"GET",path:"/v2/bot/players/:playerTag/clan-history",operationId:"botPlayerClanHistory",
 pathParams:PlayerTagPath,query:NoQuery,body:NoBody,bodyMode:"none",response:PlayerJoinLeaveResponse,responseMode:"json",successStatus:200,
 summary:"Read recent recorded clan visits for the user-authorized Discord history view.",
})
