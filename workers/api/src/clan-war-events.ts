import { ClanWarEventsGet, ClanWarEventsPut } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DatabaseFailure, InvalidRequest, NotFound } from "./errors.js"
import { ServerAuthorization } from "./server-authorization.js"
import { readBoundedJson } from "./request-body.js"
export const dispatchClanWarEvents=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url),match=/^\/v2\/server\/([^/]+)\/clan\/([^/]+)\/war-events$/u.exec(url.pathname)
 if(!match)return undefined
 if(url.search||!["GET","PUT"].includes(request.method))return yield* new InvalidRequest({message:"Invalid war-event request"})
 const tag=yield* Effect.try({try:()=>decodeURIComponent(match[2]!),catch:()=>new InvalidRequest({message:"Invalid clan encoding"})})
 const params=yield* Schema.decodeUnknownEffect(ClanWarEventsGet.pathParams)({serverId:match[1],clanTag:tag}).pipe(Effect.mapError(()=>new InvalidRequest({message:"Invalid server or clan"})))
 if(!/^#[0289PYLQGRJCUV]{1,15}$/u.test(tag))return yield* new InvalidRequest({message:"Invalid clan tag"})
 yield* (yield* ServerAuthorization).require(request,params.serverId,{managerOnly:true,write:request.method==="PUT",section:"clans"})
 const sql=yield* SqlClient.SqlClient
 if(request.method==="PUT"){
  const body=yield* readBoundedJson(request,1024).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ClanWarEventsPut.body)),Effect.mapError(()=>new InvalidRequest({message:"Provide an enabled boolean"})))
  const rows=yield* sql`UPDATE server_clans SET war_events_enabled=${body.enabled},updated_at=now() WHERE server_id=${params.serverId} AND tag=${tag} RETURNING war_events_enabled AS enabled`
  if(!rows.length)return yield* new NotFound({message:"Clan is not linked to this server"})
  return Response.json(rows[0])
 }
 const rows=yield* sql`SELECT war_events_enabled AS enabled FROM server_clans WHERE server_id=${params.serverId} AND tag=${tag}`
 if(!rows.length)return yield* new NotFound({message:"Clan is not linked to this server"})
 return Response.json(rows[0])
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"War-event settings unavailable"}))))
