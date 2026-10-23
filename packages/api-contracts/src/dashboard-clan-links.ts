import { Schema } from "effect"
import { DecimalSnowflake } from "./discord.js"
import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"
const ServerPath = Schema.Struct({serverId:DecimalSnowflake})
export const ServerClanLinksEndpoint = defineEndpoint({
  auth:"server-read",body:NoBody,bodyMode:"none",method:"GET",operationId:"serverClanLinks",
  path:"/v2/links/server/:serverId/clans",pathParams:ServerPath,query:NoQuery,errors:[],
  response:Schema.Struct({clans:Schema.Array(Schema.Struct({
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
