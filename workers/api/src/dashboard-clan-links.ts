import { ServerClanLinksEndpoint, CreateClanRosterLinkEndpoint, DecimalSnowflake, type EndpointResponse } from "@clashking/api-contracts"
import { Effect,Schema } from "effect"
import { SqlClient } from "effect/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import type { WorkerBindings } from "./environment.js"
import { readDashboardGatewayCollection } from "./dashboard-gateway-cache.js"
import { Conflict,DatabaseFailure,Forbidden,InvalidRequest,NotFound } from "./errors.js"
import { correctTag } from "./home.js"
import { queueSubjectRoleRefresh } from "./role-refresh-queue.js"

const Member=Schema.Struct({user:Schema.Struct({id:DecimalSnowflake,username:Schema.String,
  avatar:Schema.optionalKey(Schema.NullOr(Schema.String)),bot:Schema.optionalKey(Schema.Boolean)}),
  nick:Schema.optionalKey(Schema.NullOr(Schema.String)),avatar:Schema.optionalKey(Schema.NullOr(Schema.String))})
const members=(bindings:WorkerBindings,serverId:string)=>readDashboardGatewayCollection(bindings.DISCORD_CLIENT_ID,serverId,"members")
  .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Member))),Effect.mapError(cause=>new DatabaseFailure({cause,message:"Discord membership snapshot is unavailable"})))
const object=(value:unknown):Record<string,unknown>=>typeof value==="object" && value!==null && !Array.isArray(value) ? value as Record<string,unknown> : {}
const tag=(raw:string)=>{const value=correctTag(raw);return /^#[0289PYLQGRJCUV]{3,15}$/u.test(value) ? value : undefined}
interface Clan {name:string;tag:string;badge_token:string;clan_level:number;last_active:Date|string|null;members:unknown;verified:boolean}
interface Player {tag:string;townhall_level:number|null}
export const readClanLinks=(bindings:WorkerBindings,serverId:string)=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient,discordMembers=yield* members(bindings,serverId)
  const clans=yield* sql<Clan>`SELECT clan.name,clan.tag,clan.badge_token,clan.clan_level,clan.last_active,clan.members,COALESCE(verification.state='verified',false) AS verified
    FROM server_clans scoped JOIN basic_clan clan ON clan.tag=scoped.tag LEFT JOIN server_clan_verifications verification ON verification.server_id=scoped.server_id AND verification.clan_tag=scoped.tag WHERE scoped.server_id=${serverId} ORDER BY clan.name,clan.tag`
  const tags=clans.flatMap(clan=>Array.isArray(clan.members) ? clan.members.map(member=>String(object(member).tag ?? "")) : [])
  const players=tags.length ? yield* sql<Player>`SELECT player.tag,player.townhall_level FROM basic_player player WHERE player.tag=ANY(${tags}::text[])` : []
  // A roster member may not yet have a basic_player row; retain its link too.
  const links=tags.length ? yield* sql<{tag:string;user_id:string;is_verified:boolean;hidden:boolean}>`SELECT tag,user_id,is_verified,hidden FROM player_links WHERE tag=ANY(${tags}::text[]) AND user_id ~ '^[1-9][0-9]{0,19}$'` : []
  const users=new Map(discordMembers.map(member=>[member.user.id,member])),byPlayer=new Map(players.map(player=>[player.tag,player])),byLink=new Map(links.map(link=>[link.tag,link]))
  return {clans:clans.map(clan=>({name:clan.name,tag:clan.tag,
    badge:clan.badge_token ? `https://api-assets.clashofclans.com/badges/200/${clan.badge_token.replace(/\.png$/u,"")}.png` : null,
    level:clan.clan_level,verified:clan.verified,observedAt:clan.last_active ? new Date(clan.last_active).toISOString() : null,
    members:(Array.isArray(clan.members) ? clan.members : []).map(raw=>{
      const member=object(raw),playerTag=String(member.tag ?? ""),player=byPlayer.get(playerTag),link=byLink.get(playerTag),user=link ? users.get(link.user_id) : undefined
      const hash=user?.avatar ?? user?.user.avatar
      return {name:String(member.name ?? playerTag),tag:playerTag,townHall:player?.townhall_level ?? null,hidden:link?.hidden ?? false,
        link:link && (!link.hidden || clan.verified) ? {userId:link.user_id,verified:link.is_verified,inServer:Boolean(user),username:user ? user.nick ?? user.user.username : null,
          avatar:hash && user ? `https://cdn.discordapp.com${user.avatar ? `/guilds/${serverId}/users/${user.user.id}/avatars` : `/avatars/${user.user.id}`}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}` : null} : null}
    }).sort((a,b)=>(b.townHall ?? 0)-(a.townHall ?? 0) || a.name.localeCompare(b.name) || a.tag.localeCompare(b.tag)),
  }))} satisfies EndpointResponse<typeof ServerClanLinksEndpoint>
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Clan links lookup failed"}))))

export const createRosterLink=(bindings:WorkerBindings,serverId:string,rawClan:string,rawPlayer:string,userId:string)=>Effect.gen(function*(){
  const clanTag=tag(rawClan),playerTag=tag(rawPlayer)
  if (!clanTag || !playerTag || !Schema.is(DecimalSnowflake)(userId))return yield* new InvalidRequest({message:"Invalid clan, player or Discord user"})
  const currentMembers=yield* members(bindings,serverId)
  if(!currentMembers.some(member=>member.user.id===userId && !member.user.bot))return yield* new Forbidden({message:"Choose a current Discord server member"})
  const sql=yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function*(){
    const roster=yield* sql`SELECT clan.tag FROM server_clans scoped JOIN basic_clan clan ON clan.tag=scoped.tag
      WHERE scoped.server_id=${serverId} AND clan.tag=${clanTag}
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(clan.members) member WHERE member->>'tag'=${playerTag}) FOR SHARE OF scoped,clan`
    if(!roster.length)return yield* new NotFound({message:"Account is not on this server's clan roster"})
    // Unique player tags prevent concurrent unverified claims from replacing ownership.
    const inserted=yield* sql`INSERT INTO player_links(tag,user_id,source,order_index,is_verified)
      SELECT ${playerTag},${userId},'dashboard',COALESCE(max(order_index)+1,0),false FROM player_links WHERE user_id=${userId}
      ON CONFLICT(tag) DO NOTHING RETURNING tag`
    if(!inserted.length){
      const existing=(yield* sql<{user_id:string;is_verified:boolean;hidden:boolean}>`SELECT user_id,is_verified,hidden FROM player_links WHERE tag=${playerTag}`)[0]
      if(!existing || existing.user_id!==userId || existing.hidden)return yield* new Conflict({message:"This account already has an owner. Use an in-game API token to change ownership."})
      return {playerTag,userId,verified:existing.is_verified}
    }
    yield* queueSubjectRoleRefresh(userId)
    return {playerTag,userId,verified:false}
  }))
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Unverified clan linking failed"}))))

export const executeClanLinks=(input:DashboardServerOperationInput)=>Effect.gen(function*(){
  if(input.endpoint.operationId==="serverClanLinks")return yield* readClanLinks(input.bindings,String(input.path.serverId))
  const path=yield* Schema.decodeUnknownEffect(CreateClanRosterLinkEndpoint.pathParams)(input.path).pipe(Effect.mapError(()=>new InvalidRequest({message:"Invalid roster link path"})))
  const body=yield* Schema.decodeUnknownEffect(CreateClanRosterLinkEndpoint.body)(input.body).pipe(Effect.mapError(()=>new InvalidRequest({message:"Invalid roster link recipient"})))
  return yield* createRosterLink(input.bindings,path.serverId,path.clanTag,path.playerTag,body.userId)
})
