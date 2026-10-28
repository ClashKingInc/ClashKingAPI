import { ClanMemberWarning, ClanMemberWarningGet } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import { ServerAuthorization } from "./server-authorization.js"
import { DiscordApi } from "./discord-api.js"
import { readBoundedJson } from "./request-body.js"
export const dispatchClanMemberWarning=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url),match=/^\/v2\/server\/([^/]+)\/clan\/([^/]+)\/member-warning$/u.exec(url.pathname)
 if(!match)return undefined
 if(url.search||!["GET","PUT","DELETE"].includes(request.method))return yield* new InvalidRequest({message:"Unsupported member-warning request"})
 const params=yield* Schema.decodeUnknownEffect(ClanMemberWarningGet.pathParams)({serverId:match[1],clanTag:decodeURIComponent(match[2]!)}).pipe(Effect.mapError(()=>new InvalidRequest({message:"Invalid server or clan"})))
 if(!/^#[0289PYLQGRJCUV]+$/u.test(params.clanTag))return yield* new InvalidRequest({message:"Invalid clan tag"})
 yield* (yield* ServerAuthorization).require(request,params.serverId,{managerOnly:true,write:request.method!=="GET",section:"clans"})
 const sql=yield* SqlClient.SqlClient
 const linked=yield* sql`SELECT 1 FROM server_clans WHERE server_id=${params.serverId} AND tag=${params.clanTag}`
 if(!linked.length)return yield* new NotFound({message:"Clan is not linked to this server"})
 if(request.method==="DELETE") {yield* sql`DELETE FROM server_clan_member_warnings WHERE server_id=${params.serverId} AND clan_tag=${params.clanTag}`;return Response.json({settings:null})}
 if(request.method==="PUT"){
  const body=yield* readBoundedJson(request,4096).pipe(Effect.flatMap(Schema.decodeUnknownEffect(ClanMemberWarning)),Effect.catchTag("SchemaError",()=>Effect.fail(new InvalidRequest({message:"Invalid warning settings"}))))
  if(body.below===null&&body.above===null||body.below!==null&&body.below<1||body.above!==null&&body.above>49||body.below!==null&&body.above!==null&&body.below>body.above)return yield* new InvalidRequest({message:"Choose a below limit from 1–50 or an above limit from 0–49, with below not greater than above"})
  const discord=yield* DiscordApi
  const channel=yield* Schema.decodeUnknownEffect(Schema.Struct({guild_id:Schema.String,type:Schema.Number}))(yield* discord.request(`/channels/${body.channelId}`))
  if(channel.guild_id!==params.serverId||![0,5].includes(channel.type))return yield* new InvalidRequest({message:"Choose a text channel in this server"})
  if(body.roleId!==null){const roles=yield* Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({id:Schema.String})))(yield* discord.request(`/guilds/${params.serverId}/roles`));if(body.roleId===params.serverId||!roles.some(role=>role.id===body.roleId))return yield* new InvalidRequest({message:"Choose a role in this server other than everyone"})}
  yield* sql`INSERT INTO server_clan_member_warnings(server_id,clan_tag,channel_id,below_count,above_count,role_id) VALUES(${params.serverId},${params.clanTag},${body.channelId},${body.below},${body.above},${body.roleId}) ON CONFLICT(server_id,clan_tag) DO UPDATE SET channel_id=EXCLUDED.channel_id,below_count=EXCLUDED.below_count,above_count=EXCLUDED.above_count,role_id=EXCLUDED.role_id,updated_at=now()`
  return Response.json({settings:body})
 }
 const rows=yield* sql`SELECT channel_id AS "channelId",below_count AS below,above_count AS above,role_id AS "roleId" FROM server_clan_member_warnings WHERE server_id=${params.serverId} AND clan_tag=${params.clanTag}`
 return Response.json({settings:rows[0]??null})
}).pipe(Effect.catchTag("SchemaError",cause=>Effect.fail(new UpstreamUnavailable({cause,message:"Discord returned invalid warning configuration data"}))),Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Member-warning settings unavailable"}))))
