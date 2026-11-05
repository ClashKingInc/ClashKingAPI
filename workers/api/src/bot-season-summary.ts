import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { serverActivitySeason } from "./dashboard-server-activity.js"
import { forEachArchiveWar } from "./war-archive.js"

export const dispatchBotSeasonSummary=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url)
 if(request.method!=="POST"||url.pathname!=="/v2/bot/players/season-summary")return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 const raw=yield* readBoundedJson(request,8192),body=raw&&typeof raw==="object"?raw as Record<string,unknown>:{}
 if(url.search||!Array.isArray(body.tags)||body.tags.length<1||body.tags.length>100||body.tags.some(tag=>typeof tag!=="string"||!/^#[0289PYLQGRJCUV]{1,15}$/u.test(tag))||body.season!==undefined&&(typeof body.season!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/u.test(body.season))||Object.keys(body).some(key=>!["tags","season"].includes(key)))return yield* new InvalidRequest({message:"Provide 1–100 player tags and an optional YYYY-MM season"})
 const tags=[...new Set(body.tags as string[])],window=yield* serverActivitySeason(body.season as string|undefined)
 if(window.start>new Date())return yield* new InvalidRequest({message:"Choose a current or past season"})
 const sql=yield* SqlClient.SqlClient,fail=(cause:unknown)=>new DatabaseFailure({cause,message:"Season summary query failed"})
 const loot=yield* sql<{tag:string;attacks:string;wins:string;gold:string|null;elixir:string|null;dark:string|null}>`
  SELECT player_tag tag,count(*)::text attacks,count(*) FILTER(WHERE stars>0)::text wins,
    sum((looted_resources->>'gold')::numeric)::text gold,sum((looted_resources->>'elixir')::numeric)::text elixir,
    sum((looted_resources->>'darkElixir')::numeric)::text dark
  FROM (
    SELECT player_tag,stars,looted_resources FROM battles_farming
      WHERE player_tag=ANY(${tags}::text[]) AND battle_time>=${window.start} AND battle_time<${window.end}
    UNION ALL
    SELECT player_tag,stars,looted_resources FROM battles_ranked
      WHERE player_tag=ANY(${tags}::text[]) AND direction=1 AND battle_time>=${window.start} AND battle_time<${window.end}
  ) recorded GROUP BY player_tag`.pipe(Effect.mapError(fail))
 const contributions=yield* sql<{tag:string;donated:string|null;received:string|null;capital:string|null;games:string|null}>`
  SELECT player_tag tag,sum(delta) FILTER(WHERE stat_type='donated')::text donated,
    sum(delta) FILTER(WHERE stat_type='received')::text received,
    sum(delta) FILTER(WHERE stat_type='capital_gold_donated')::text capital,
    sum(delta) FILTER(WHERE stat_type='clan_games')::text games
  FROM player_stat_changes WHERE player_tag=ANY(${tags}::text[]) AND event_time>=${window.start} AND event_time<${window.end}
  GROUP BY player_tag`.pipe(Effect.mapError(fail))
 const snapshots=yield* sql<{tag:string;trophies:number;date:string}>`
  SELECT DISTINCT ON(player_tag) player_tag tag,trophies,date::text date FROM leaderboard_history_player_home
  WHERE player_tag=ANY(${tags}::text[]) AND location_id='global' AND date>=${window.start.toISOString().slice(0,10)}::date
    AND date<${window.end.toISOString().slice(0,10)}::date ORDER BY player_tag,date DESC`.pipe(Effect.mapError(fail))
 const warRows=yield* sql<{id:string}>`
  SELECT DISTINCT war.war_id::text id FROM player_war_history history
  CROSS JOIN LATERAL unnest(history.war_ids) candidate(id) JOIN wars war ON war.war_id=candidate.id
  WHERE history.player_tag=ANY(${tags}::text[]) AND war.prep_time>=${window.start} AND war.prep_time<${window.end}
    AND war.war_type IN ('random','cwl') AND lower(war.state) IN ('ended','warended')
  ORDER BY id LIMIT 1001`.pipe(Effect.mapError(fail))
 const warStars=new Map<string,number>(),wanted=new Set(tags);let loaded=0
 // Only completed wars selected by preparation time contribute. Missing or
 // unreadable archives invalidate this metric, not the independent loot and
 // contribution totals. Never publish a silently partial star leaderboard.
 const read=warRows.length>1000?false:yield* forEachArchiveWar(warRows.map(row=>row.id),(_id,war)=>Effect.sync(()=>{
  loaded++;const seen=new Set<string>()
  for(const side of [war.clan,war.opponent])for(const member of side.members??[]){
   if(!wanted.has(member.tag)||seen.has(member.tag))continue;seen.add(member.tag)
   warStars.set(member.tag,(warStars.get(member.tag)??0)+(member.attacks??[]).reduce((sum,hit)=>sum+hit.stars,0))
  }
 })).pipe(Effect.map(()=>true),Effect.catch(()=>Effect.succeed(false)))
 const complete=read&&loaded===warRows.length
 const numbers=(value:string|null|undefined)=>{if(value==null)return null;const number=Number(value);if(!Number.isSafeInteger(number)||number<0)throw new Error("Invalid stored summary number");return number}
 const byLoot=new Map(loot.map(row=>[row.tag,row])),byStats=new Map(contributions.map(row=>[row.tag,row])),bySnapshot=new Map(snapshots.map(row=>[row.tag,row]))
 const items=tags.map(tag=>{const battle=byLoot.get(tag),stats=byStats.get(tag),snapshot=bySnapshot.get(tag);return {tag,
  attacks:numbers(battle?.attacks),wins:numbers(battle?.wins),gold:numbers(battle?.gold),elixir:numbers(battle?.elixir),darkElixir:numbers(battle?.dark),
  donated:numbers(stats?.donated),received:numbers(stats?.received),capitalDonated:numbers(stats?.capital),clanGames:numbers(stats?.games),
  warStars:complete?warStars.get(tag)??null:null,trophies:snapshot?.trophies??null,snapshotDate:snapshot?.date??null}})
 return Response.json({season:window.season,start:window.start.toISOString(),end:window.end.toISOString(),warCoverageComplete:complete,items})
})
