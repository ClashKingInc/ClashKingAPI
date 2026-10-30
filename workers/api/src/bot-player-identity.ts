import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { InvalidRequest, DatabaseFailure } from "./errors.js"
import { publicTag } from "./public-war.js"
import type { WorkerBindings } from "./environment.js"

// User-requested legacy visibility rule: no hidden links; no Discord owner
// identity unless Discord confirms they currently belong to this server.
export const dispatchBotPlayerIdentity = (request:Request,bindings:WorkerBindings) => Effect.gen(function*(){
 const url=new URL(request.url),match=/^\/v2\/bot\/players\/([^/]+)\/identity$/u.exec(url.pathname)
 if(!match)return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 const server=url.searchParams.get("serverId")
 if(request.method!=="GET"||(server!==null&&!/^\d{15,22}$/u.test(server))||[...url.searchParams.keys()].some(key=>key!=="serverId")||url.searchParams.getAll("serverId").length>1)return yield* new InvalidRequest({message:"Invalid identity request"})
 const raw=yield* Effect.try({try:()=>decodeURIComponent(match[1]!),catch:()=>new InvalidRequest({message:"Invalid tag encoding"})})
 const tag=yield* publicTag(raw),sql=yield* SqlClient.SqlClient
 const rows=yield* sql<{user_id:string|null;is_verified:boolean;hidden:boolean}>`SELECT user_id,is_verified,hidden FROM player_links WHERE tag=${tag} LIMIT 1`
  .pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Player identity lookup failed"})))
 const row=rows[0]
 let link:{userId:string;verified:boolean}|null=null
 // Hidden applies to Discord ownership only; recorded game activity remains
 // visible even when the player has chosen not to expose their linked owner.
 if(!row?.hidden&&server&&row?.user_id&&/^\d{15,22}$/u.test(row.user_id)){
  const member=yield* Effect.tryPromise({try:async()=>{
   const response=await fetch(`https://discord.com/api/v10/guilds/${server}/members/${row.user_id}`,{headers:{Authorization:`Bot ${bindings.DISCORD_BOT_TOKEN}`},signal:AbortSignal.timeout(1800),redirect:"manual"})
   if(!response.ok)return false
   const body=await response.json() as {user?:{id?:string}}
   return body.user?.id===row.user_id
  },catch:()=>false}).pipe(Effect.catch(()=>Effect.succeed(false)))
  if(member)link={userId:row.user_id,verified:row.is_verified}
 }
 const seen=yield* sql<{seen_at:Date|string}>`SELECT seen_at FROM player_online_events WHERE tag=${tag} ORDER BY seen_at DESC LIMIT 1`
  .pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Player activity lookup failed"})))
 return Response.json({link,lastObservedAt:seen[0]?new Date(seen[0].seen_at).toISOString():null})
})
