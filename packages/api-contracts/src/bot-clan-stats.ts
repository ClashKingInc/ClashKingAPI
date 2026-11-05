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

export const BotClanCapitalContributionsEndpoint=defineEndpoint({
 auth:"bot",method:"GET",path:"/v2/bot/clans/:clanTag/capital-contributions",operationId:"botClanCapitalContributions",
 pathParams:ClanTagPath,query:Schema.Struct({weekend:Schema.String}),body:NoBody,bodyMode:"none",
 response:Schema.Struct({weekend:Schema.String,start:Schema.String,end:Schema.String,truncated:Schema.Boolean,items:Schema.Array(Schema.Struct({tag:Schema.String,name:Schema.String,donated:Schema.Number}))}),
 responseMode:"json",successStatus:200,summary:"Read recorded clan-attributed Capital Gold donations for Friday 07:00 UTC through the next Friday, excluding the endpoint.",
})

export const BotActivityEndpoint=defineEndpoint({
 auth:"bot",method:"POST",path:"/v2/bot/clans/activity",operationId:"botActivity",
 pathParams:Schema.Struct({}),query:NoQuery,body:Schema.Struct({clanTags:Schema.Array(Schema.String),season:Schema.optionalKey(Schema.String)}),bodyMode:"json",
 response:Schema.Struct({season:Schema.String,current:Schema.Boolean,truncated:Schema.Boolean,
  items:Schema.Array(Schema.Struct({tag:Schema.String,name:Schema.String,townHallLevel:Schema.Number,activity:Schema.Number,lastObservedAt:Schema.NullOr(Schema.String)})),
  clanTotals:Schema.Array(Schema.Struct({tag:Schema.String,activity:Schema.Number}))}),
 responseMode:"json",successStatus:200,summary:"Read clan-attributed activity counts and current-season last observed game activity without Discord ownership.",
})
