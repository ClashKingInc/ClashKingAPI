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
    FROM server_clans scoped LEFT JOIN server_clan_categories category ON category.id=scoped.category_id AND category.server_id=scoped.server_id LEFT JOIN server_clan_verifications verification ON verification.server_id=scoped.server_id AND verification.clan_tag=scoped.tag WHERE scoped.server_id=${serverId} ORDER BY category.position NULLS LAST, scoped.position, scoped.tag`
  const cached=yield* readTrackedClans(bindings,configured.map(clan=>clan.tag))
  const clans=(yield* Effect.forEach(configured,clan=>liveClan(bindings,clan.tag,cached.get(clan.tag)).pipe(Effect.map(profile=>({...clan,profile}))),{concurrency:3}))

  const tags=clans.flatMap(clan=>clan.profile.memberList.map(member=>member.tag))
  // A roster member may not yet have a basic_player row; retain its link too.
  const links=tags.length ? yield* sql<{tag:string;user_id:string;is_verified:boolean;hidden:boolean}>`SELECT tag,user_id,is_verified,hidden FROM player_links WHERE tag=ANY(${tags}::text[]) AND user_id ~ '^[1-9][0-9]{0,19}$'` : []
  const users=new Map(discordMembers.map(member=>[member.user.id,member])),byLink=new Map(links.map(link=>[link.tag,link]))
  const uniquePlayers=new Map(clans.flatMap(clan=>clan.profile.memberList.map(member=>[member.tag,member] as const)))
  const familyLinks=[...uniquePlayers.keys()].flatMap(tag=>{const link=byLink.get(tag);return link?[link]:[]})
  const accountCounts=new Map<string,number>(),townHalls=new Map<number,number>()
  for(const link of familyLinks)accountCounts.set(link.user_id,(accountCounts.get(link.user_id)??0)+1)
  for(const member of uniquePlayers.values()){const level=member.townHallLevel??0;townHalls.set(level,(townHalls.get(level)??0)+1)}
  const counts=[...accountCounts.values()]
  // Aggregate hidden links without exposing their owner. Deduplicate players
  // across clan snapshots so a recent transfer cannot inflate family coverage.
  const statistics={players:uniquePlayers.size,linked:familyLinks.length,verified:familyLinks.filter(link=>link.is_verified).length,
    discordMembers:accountCounts.size,inServer:[...accountCounts.keys()].filter(id=>users.has(id)).length,
    accountDistribution:{one:counts.filter(n=>n===1).length,twoOrThree:counts.filter(n=>n===2||n===3).length,fourOrMore:counts.filter(n=>n>=4).length},
    townHalls:[...townHalls].sort((a,b)=>b[0]-a[0]).map(([level,count])=>({level,count}))}
  return {categories,statistics,clans:clans.map(clan=>({category:clan.category,name:clan.profile.name,tag:clan.tag,
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

/** Shared eligibility for Dashboard and Discord. Provider reads happen before
 * transaction locks; configuration and verification are locked again below. */
const eligibleRoster = (bindings:WorkerBindings,serverId:string,rawClan:string,rawPlayer:string)=>Effect.gen(function*(){
  const clanTag=tag(rawClan),playerTag=tag(rawPlayer)
  if(!clanTag||!playerTag)return yield* new InvalidRequest({message:"Invalid clan or player tag"})
  const sql=yield* SqlClient.SqlClient
  const configured=(yield* sql<{verified:boolean}>`SELECT EXISTS(SELECT 1 FROM server_clan_verifications v WHERE v.server_id=s.server_id AND v.clan_tag=s.tag AND v.state='verified') AS verified FROM server_clans s WHERE s.server_id=${serverId} AND s.tag=${clanTag}`)[0]
  if(!configured)return yield* new NotFound({message:"This player must belong to a family clan linked to this server"})
  if(!configured.verified)return yield* new Forbidden({message:"Verify this family clan before managing its unverified links"})
  const cached=yield* readTrackedClans(bindings,[clanTag])
  const roster=yield* liveClan(bindings,clanTag,cached.get(clanTag))
  if(!roster.memberList.some(member=>member.tag===playerTag))return yield* new NotFound({message:"This player is not in the selected family clan"})
  return {clanTag,playerTag}
})
const lockVerifiedRoster = (serverId:string,clanTag:string)=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  const row=(yield* sql`SELECT s.tag FROM server_clans s JOIN server_clan_verifications v ON v.server_id=s.server_id AND v.clan_tag=s.tag
    WHERE s.server_id=${serverId} AND s.tag=${clanTag} AND v.state='verified' FOR SHARE OF s,v`)[0]
  if(!row)return yield* new Forbidden({message:"Verify this family clan before managing its unverified links"})
})
export const createRosterLink=(bindings:WorkerBindings,serverId:string,rawClan:string,rawPlayer:string,userId:string)=>Effect.gen(function*(){
  if(!Schema.is(DecimalSnowflake)(userId))return yield* new InvalidRequest({message:"Invalid Discord user"})
  const {clanTag,playerTag}=yield* eligibleRoster(bindings,serverId,rawClan,rawPlayer)
  const currentMembers=yield* members(bindings,serverId)
  if(!currentMembers.some(member=>member.user.id===userId&&!member.user.bot))return yield* new Forbidden({message:"Choose a current Discord server member"})
  const sql=yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function*(){
    yield* lockVerifiedRoster(serverId,clanTag)
    // A unique tag and DO NOTHING prevent this weaker proof from replacing any
    // existing owner. Verified accounts are protected even for an identical add.
    const inserted=yield* sql`INSERT INTO player_links(tag,user_id,source,order_index,is_verified)
      SELECT ${playerTag},${userId},'dashboard',COALESCE(max(order_index)+1,0),false FROM player_links WHERE user_id=${userId}
      ON CONFLICT(tag) DO NOTHING RETURNING tag`
    if(!inserted.length){
      const existing=(yield* sql<{user_id:string;is_verified:boolean}>`SELECT user_id,is_verified FROM player_links WHERE tag=${playerTag} FOR UPDATE`)[0]
      if(existing?.is_verified)return yield* new Forbidden({message:"Verified account links can only be changed by their owner"})
      if(!existing||existing.user_id!==userId)return yield* new Conflict({message:"This account is already linked. Remove its unverified link before assigning it again"})
      return {playerTag,userId,verified:false}
    }
    yield* queueSubjectRoleRefresh(userId)
    return {playerTag,userId,verified:false}
  }))
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Unverified clan linking failed"}))))

export const deleteRosterLink=(bindings:WorkerBindings,serverId:string,rawClan:string,rawPlayer:string)=>Effect.gen(function*(){
  const {clanTag,playerTag}=yield* eligibleRoster(bindings,serverId,rawClan,rawPlayer)
  const sql=yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function*(){
    yield* lockVerifiedRoster(serverId,clanTag)
    const owner=(yield* sql<{user_id:string;is_verified:boolean}>`SELECT user_id,is_verified FROM player_links WHERE tag=${playerTag} FOR UPDATE`)[0]
    if(!owner)return yield* new NotFound({message:"This account has no link to remove"})
    if(owner.is_verified)return yield* new Forbidden({message:"Verified account links can only be changed by their owner"})
    yield* sql`DELETE FROM player_links WHERE tag=${playerTag} AND is_verified=false`
    yield* sql`WITH ordered AS(SELECT tag,row_number() OVER(ORDER BY order_index,added_at,tag)-1 AS position FROM player_links WHERE user_id=${owner.user_id})
      UPDATE player_links p SET order_index=ordered.position FROM ordered WHERE p.tag=ordered.tag`
    yield* queueSubjectRoleRefresh(owner.user_id)
    return {playerTag,userId:owner.user_id,verified:false}
  }))
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Unverified clan unlinking failed"}))))

export const executeClanLinks=(input:DashboardServerOperationInput)=>Effect.gen(function*(){
  if(input.endpoint.operationId==="serverClanLinks")return yield* readClanLinks(input.bindings,String(input.path.serverId))
  const path=yield* Schema.decodeUnknownEffect(CreateClanRosterLinkEndpoint.pathParams)(input.path).pipe(Effect.mapError(()=>new InvalidRequest({message:"Invalid roster link path"})))
  if(input.endpoint.operationId==="deleteClanRosterLink")return yield* deleteRosterLink(input.bindings,path.serverId,path.clanTag,path.playerTag)
  const body=yield* Schema.decodeUnknownEffect(CreateClanRosterLinkEndpoint.body)(input.body).pipe(Effect.mapError(()=>new InvalidRequest({message:"Invalid roster link recipient"})))
  return yield* createRosterLink(input.bindings,path.serverId,path.clanTag,path.playerTag,body.userId)
})
