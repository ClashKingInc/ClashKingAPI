import { ServerClanLinksEndpoint, CreateClanRosterLinkEndpoint, DecimalSnowflake, type EndpointResponse } from "@clashking/api-contracts"
import { Effect,Schema } from "effect"
import { SqlClient } from "effect/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import type { WorkerBindings } from "./environment.js"
import { readDashboardGatewayCollection } from "./dashboard-gateway-cache.js"
import { Conflict,DatabaseFailure,Forbidden,InvalidRequest,NotFound } from "./errors.js"
import { correctTag } from "./home.js"
import { queueSubjectRoleRefresh } from "./role-refresh-queue.js"
import { ProxyClanResponse } from "../../../packages/api-contracts/src/proxy.js"
import { readBoundedJson } from "./request-body.js"
import { readTrackedClans } from "./tracked-clan-cache.js"
import { UpstreamUnavailable } from "./errors.js"

const Member=Schema.Struct({user:Schema.Struct({id:DecimalSnowflake,username:Schema.String,
  avatar:Schema.optionalKey(Schema.NullOr(Schema.String)),bot:Schema.optionalKey(Schema.Boolean)}),
  nick:Schema.optionalKey(Schema.NullOr(Schema.String)),avatar:Schema.optionalKey(Schema.NullOr(Schema.String))})
const members=(bindings:WorkerBindings,serverId:string)=>readDashboardGatewayCollection(bindings.DISCORD_CLIENT_ID,serverId,"members")
  .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Member))),Effect.mapError(cause=>new DatabaseFailure({cause,message:"Discord membership snapshot is unavailable"})))
const tag=(raw:string)=>{const value=correctTag(raw);return /^#[0289PYLQGRJCUV]{3,15}$/u.test(value) ? value : undefined}
interface Clan {category:string|null;tag:string;verified:boolean}
const LinkClanProfile=Schema.Struct({
  tag:ProxyClanResponse.fields.tag,name:ProxyClanResponse.fields.name,
  clanLevel:ProxyClanResponse.fields.clanLevel,badgeUrls:ProxyClanResponse.fields.badgeUrls,
  memberList:ProxyClanResponse.fields.memberList,
})
const completeClan = (value:unknown,clanTag:string) => Schema.decodeUnknownEffect(LinkClanProfile)(value).pipe(
  Effect.flatMap(clan => clan.tag===clanTag && clan.memberList!==undefined
    ? Effect.succeed({...clan,memberList:clan.memberList})
    : Effect.fail(new UpstreamUnavailable({cause:"incomplete_clan",message:"Clan roster is unavailable"}))),
)
const liveClan = (bindings:WorkerBindings,clanTag:string,cached?:unknown) => {
  const fromApi=()=>Effect.gen(function*(){
    const response=yield* Effect.tryPromise({try:signal=>bindings.CLASH_PROXY.fetch(new Request(`http://clash-proxy.internal/v1/clans/${encodeURIComponent(clanTag)}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(15_000)])})),catch:cause=>new UpstreamUnavailable({cause,message:"Clan roster lookup failed"})})
    if(!response.ok){yield* Effect.promise(()=>response.body?.cancel().catch(()=>undefined) ?? Promise.resolve());return yield* new UpstreamUnavailable({cause:response.status,message:"Clan roster lookup failed"})}
    return yield* completeClan(yield* readBoundedJson(response,2*1024*1024),clanTag)
  }).pipe(Effect.mapError(cause=>cause instanceof UpstreamUnavailable?cause:new UpstreamUnavailable({cause,message:"Clan roster lookup failed"})))
  return cached===undefined ? fromApi() : completeClan(cached,clanTag).pipe(Effect.catch(()=>fromApi()))
}
export const readClanLinks=(bindings:WorkerBindings,serverId:string)=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient,discordMembers=yield* members(bindings,serverId)
  // Read the existing category order through the Links permission boundary. Requiring
  // the separate Clans endpoint here would exclude users granted only Links access.
  const categories=yield* sql<{id:string;name:string}>`SELECT id::text,name FROM server_clan_categories
    WHERE server_id=${serverId} ORDER BY position,name,id`
  const configured=yield* sql<Clan>`SELECT category.name AS category,scoped.tag,COALESCE(verification.state='verified',false) AS verified
    FROM server_clans scoped LEFT JOIN server_clan_categories category ON category.id=scoped.category_id AND category.server_id=scoped.server_id LEFT JOIN server_clan_verifications verification ON verification.server_id=scoped.server_id AND verification.clan_tag=scoped.tag WHERE scoped.server_id=${serverId} ORDER BY scoped.tag`
  const cached=yield* readTrackedClans(bindings,configured.map(clan=>clan.tag))
  const clans=(yield* Effect.forEach(configured,clan=>liveClan(bindings,clan.tag,cached.get(clan.tag)).pipe(Effect.map(profile=>({...clan,profile}))),{concurrency:3}))
    .sort((a,b)=>a.profile.name.localeCompare(b.profile.name) || a.tag.localeCompare(b.tag))
  const tags=clans.flatMap(clan=>clan.profile.memberList.map(member=>member.tag))
  // A roster member may not yet have a basic_player row; retain its link too.
  const links=tags.length ? yield* sql<{tag:string;user_id:string;is_verified:boolean;hidden:boolean}>`SELECT tag,user_id,is_verified,hidden FROM player_links WHERE tag=ANY(${tags}::text[]) AND user_id ~ '^[1-9][0-9]{0,19}$'` : []
  const users=new Map(discordMembers.map(member=>[member.user.id,member])),byLink=new Map(links.map(link=>[link.tag,link]))
  return {categories,clans:clans.map(clan=>({category:clan.category,name:clan.profile.name,tag:clan.tag,
    badge:clan.profile.badgeUrls?.medium ?? clan.profile.badgeUrls?.large ?? clan.profile.badgeUrls?.small ?? null,
    // The tracker snapshot has no observation timestamp. Do not label SQL last_active as roster freshness.
    level:clan.profile.clanLevel,verified:clan.verified,observedAt:null,
    members:clan.profile.memberList.map(member=>{
      const playerTag=member.tag,link=byLink.get(playerTag),user=link ? users.get(link.user_id) : undefined
      const hash=user?.avatar ?? user?.user.avatar
      return {name:member.name,tag:playerTag,townHall:member.townHallLevel,hidden:link?.hidden ?? false,
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
  const configured=yield* sql`SELECT tag FROM server_clans WHERE server_id=${serverId} AND tag=${clanTag}`
  if(!configured.length)return yield* new NotFound({message:"Clan is not configured for this server"})
  const cached=yield* readTrackedClans(bindings,[clanTag])
  const snapshot=yield* liveClan(bindings,clanTag,cached.get(clanTag))
  if(!snapshot.memberList.some(member=>member.tag===playerTag))return yield* new NotFound({message:"Account is not on this server's clan roster"})
  return yield* sql.withTransaction(Effect.gen(function*(){
    // Recheck configuration under lock after provider I/O; clan removal must not race a new link.
    const roster=yield* sql`SELECT tag FROM server_clans WHERE server_id=${serverId} AND tag=${clanTag} FOR SHARE`
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
