import { Schema } from "effect"
import { DecimalSnowflake } from "./discord.js"
import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
const ServerPath = Schema.Struct({serverId:DecimalSnowflake})
export const ServerClanLinksEndpoint = defineEndpoint({
  auth:"server-read",body:NoBody,bodyMode:"none",method:"GET",operationId:"serverClanLinks",
  path:"/v2/links/server/:serverId/clans",pathParams:ServerPath,query:NoQuery,errors:[],
  response:Schema.Struct({
    categories:Schema.optionalKey(Schema.Array(Schema.Struct({id:Schema.String,name:Schema.String}))),
    statistics:Schema.optionalKey(Schema.Struct({
      players:Schema.Number,linked:Schema.Number,verified:Schema.Number,discordMembers:Schema.Number,inServer:Schema.Number,
      accountDistribution:Schema.Struct({one:Schema.Number,twoOrThree:Schema.Number,fourOrMore:Schema.Number}),
      townHalls:Schema.Array(Schema.Struct({level:Schema.Number,count:Schema.Number})),
    })),
    clans:Schema.Array(Schema.Struct({
    category:Schema.optionalKey(Schema.NullOr(Schema.String)),
    name:Schema.String,tag:Schema.String,badge:Schema.NullOr(Schema.String),level:Schema.Number,verified:Schema.Boolean,
    observedAt:Schema.NullOr(Schema.String),members:Schema.Array(Schema.Struct({
      name:Schema.String,tag:Schema.String,townHall:Schema.NullOr(Schema.Number),hidden:Schema.Boolean,
      link:Schema.NullOr(Schema.Struct({userId:DecimalSnowflake,verified:Schema.Boolean,inServer:Schema.Boolean,
        username:Schema.NullOr(Schema.String),avatar:Schema.NullOr(Schema.String)})),
    })),
  }))}),responseMode:"json",successStatus:200,summary:"Get clan rosters with account visibility and current Discord membership",
})
export const CreateClanRosterLinkEndpoint = defineEndpoint({
  auth:"server-write",body:Schema.Struct({userId:DecimalSnowflake}),bodyMode:"json",method:"POST",
  operationId:"createClanRosterLink",path:"/v2/links/server/:serverId/clans/:clanTag/:playerTag",
  pathParams:Schema.Struct({serverId:DecimalSnowflake,clanTag:Schema.String,playerTag:Schema.String}),query:NoQuery,errors:[],
  response:Schema.Struct({playerTag:Schema.String,userId:DecimalSnowflake,verified:Schema.Boolean}),
  responseMode:"json",successStatus:200,summary:"Create an unverified link for an unlinked clan roster account and current Discord member",
})

export const DeleteClanRosterLinkEndpoint = defineEndpoint({
  auth:"server-write",body:NoBody,bodyMode:"none",method:"DELETE",
  operationId:"deleteClanRosterLink",path:CreateClanRosterLinkEndpoint.path,
  pathParams:CreateClanRosterLinkEndpoint.pathParams,query:NoQuery,errors:[],
  response:CreateClanRosterLinkEndpoint.response,responseMode:"json",successStatus:200,
  summary:"Remove only an unverified link on a verified server clan roster",
})
export const BotModerateClanLinkEndpoint = defineEndpoint({
  auth:"bot",method:"POST",operationId:"botModerateClanLink",path:"/v2/bot/servers/:serverId/modlinks",
  pathParams:ServerPath,query:NoQuery,bodyMode:"json",errors:[],
  body:Schema.Union([
    Schema.Struct({action:Schema.Literal("add"),actorId:DecimalSnowflake,clanTag:Schema.String,playerTag:Schema.String,userId:DecimalSnowflake}),
    Schema.Struct({action:Schema.Literal("remove"),actorId:DecimalSnowflake,clanTag:Schema.String,playerTag:Schema.String}),
  ]),
  response:CreateClanRosterLinkEndpoint.response,responseMode:"json",successStatus:200,
  summary:"Manage unverified family links using the actor's current Dashboard Links permission",
})
