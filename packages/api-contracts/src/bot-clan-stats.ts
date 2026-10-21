import { Schema } from "effect"
import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
import { ClanTagPath } from "./expo-common.js"
export const BotClanGamesEndpoint=defineEndpoint({
 auth:"bot",method:"GET",path:"/v2/bot/clans/:clanTag/clan-games",operationId:"botClanGames",
 pathParams:ClanTagPath,query:NoQuery,body:NoBody,bodyMode:"none",
 response:Schema.Struct({items:Schema.Array(Schema.Struct({tag:Schema.String,points:Schema.Number}))}),
 responseMode:"json",successStatus:200,summary:"Read current Clan Games points for current clan members, including points earned before joining.",
})
export const BotClanSeasonStatsEndpoint=defineEndpoint({
 auth:"bot",method:"GET",path:"/v2/bot/clans/:clanTag/season-stats",operationId:"botClanSeasonStats",
 pathParams:ClanTagPath,query:Schema.Struct({season:Schema.optionalKey(Schema.String)}),body:NoBody,bodyMode:"none",
 response:Schema.Struct({season:Schema.String,start:Schema.String,end:Schema.String,current:Schema.Boolean,truncated:Schema.Boolean,activeDaily:Schema.Number,items:Schema.Array(Schema.Struct({tag:Schema.String,name:Schema.String,townHallLevel:Schema.Number,donated:Schema.Number,received:Schema.Number,clanGames:Schema.Number,capitalDonated:Schema.Number}))}),
 responseMode:"json",successStatus:200,summary:"Read recorded season contributions attributed to a clan, including former members.",
})
