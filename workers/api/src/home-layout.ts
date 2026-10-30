import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { HomeLayout } from "@clashking/api-contracts"
import { AuthIdentity } from "./auth.js"
import { Conflict, DatabaseFailure, InvalidRequest, Unauthenticated } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { publicTag } from "./public-war.js"

const builtins=["todo","ranked","upgrade","activity"] as const
const initial=()=>builtins.map(kind=>({id:kind,kind,entityTag:null,size:"wide" as const}))
export const dispatchHomeLayout=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url),isLayout=url.pathname==="/v2/users/me/home-layout",farm=/^\/v2\/player\/([^/]+)\/farming$/u.exec(url.pathname)
 const donations=/^\/v2\/clan\/([^/]+)\/donations\/summary$/u.exec(url.pathname)
 const activity=/^\/v2\/player\/([^/]+)\/activity-summary$/u.exec(url.pathname)
 if(!isLayout&&!farm&&!donations&&!activity)return undefined
 const sql=yield* SqlClient.SqlClient
 if(activity){
  if(request.method!=="GET"||url.search)return yield* new InvalidRequest({message:"GET without query required"})
  const raw=yield* Effect.try({try:()=>decodeURIComponent(activity[1]!),catch:()=>new InvalidRequest({message:"Invalid player tag"})}),tag=yield* publicTag(raw)
  if(!/^#?[0289PYLQGRJCUV]{1,15}$/iu.test(raw.trim()))return yield* new InvalidRequest({message:"Invalid player tag"})
  const until=new Date(),from=new Date(+until-30*86400000)
  // Keep the exact rolling window. UTC calendar buckets include partial first
  // and current days; no events outside the totals' window enter the graph.
  // Empty buckets mean no recorded events, not proof that tracking was complete.
  const days=yield* sql<{from:Date;until:Date;gold:string;elixir:string;darkElixir:string;donated:string;received:string;farmingAttacks:number;rankedAttacks:number;legendAttacks:number;upgradeLevels:number}>`
   WITH bounds AS (SELECT ${from}::timestamptz AS start_at, ${until}::timestamptz AS end_at),
   buckets AS (
    SELECT generate_series(date_trunc('day',start_at AT TIME ZONE 'UTC'),date_trunc('day',end_at AT TIME ZONE 'UTC'),interval '1 day') AS day FROM bounds
   ), farming AS (
    SELECT date_trunc('day',battle_time AT TIME ZONE 'UTC') AS day,
     sum(COALESCE((looted_resources->>'gold')::numeric,0)) AS gold,
     sum(COALESCE((looted_resources->>'elixir')::numeric,0)) AS elixir,
     sum(COALESCE((looted_resources->>'darkElixir')::numeric,0)) AS dark,
     count(*)::int AS attacks
    FROM battles_farming,bounds WHERE player_tag=${tag} AND battle_time>=start_at AND battle_time<end_at GROUP BY 1
   ), donations AS (
    SELECT date_trunc('day',event_time AT TIME ZONE 'UTC') AS day,
     COALESCE(sum(delta) FILTER(WHERE stat_type='donated'),0) AS donated,
     COALESCE(sum(delta) FILTER(WHERE stat_type='received'),0) AS received
    FROM player_stat_changes,bounds WHERE player_tag=${tag} AND event_time>=start_at AND event_time<end_at GROUP BY 1
   ), battles AS (
    SELECT date_trunc('day',battle_time AT TIME ZONE 'UTC') AS day,
     count(*) FILTER(WHERE battle_mode=1)::int AS ranked,
     count(*) FILTER(WHERE battle_mode=2)::int AS legend
    FROM battles_ranked,bounds WHERE player_tag=${tag} AND direction=1 AND battle_time>=start_at AND battle_time<end_at GROUP BY 1
   ), upgrades AS (
    SELECT date_trunc('day',event_time AT TIME ZONE 'UTC') AS day,
     COALESCE(sum(CASE WHEN current_value ~ '^[0-9]+$' AND previous_value ~ '^[0-9]+$'
      THEN GREATEST(current_value::bigint-previous_value::bigint,0) ELSE 0 END),0)::int AS levels
    FROM player_change_history,bounds WHERE player_tag=${tag} AND event_time>=start_at AND event_time<end_at AND change_type IN (1,3,4,5,6,7) GROUP BY 1
   )
   SELECT GREATEST(b.day AT TIME ZONE 'UTC',bounds.start_at) AS "from",
    LEAST((b.day+interval '1 day') AT TIME ZONE 'UTC',bounds.end_at) AS "until",
    COALESCE(f.gold,0)::text AS gold,COALESCE(f.elixir,0)::text AS elixir,COALESCE(f.dark,0)::text AS "darkElixir",
    COALESCE(d.donated,0)::text AS donated,COALESCE(d.received,0)::text AS received,
    COALESCE(f.attacks,0)::int AS "farmingAttacks",COALESCE(a.ranked,0)::int AS "rankedAttacks",
    COALESCE(a.legend,0)::int AS "legendAttacks",COALESCE(u.levels,0)::int AS "upgradeLevels"
   FROM buckets b CROSS JOIN bounds
   LEFT JOIN farming f USING(day) LEFT JOIN donations d USING(day)
   LEFT JOIN battles a USING(day) LEFT JOIN upgrades u USING(day)
   ORDER BY b.day`
  const sumText=(key:"gold"|"elixir"|"darkElixir"|"donated"|"received")=>days.reduce((total,day)=>total+BigInt(day[key]),0n).toString()
  const sumCount=(key:"farmingAttacks"|"rankedAttacks"|"legendAttacks"|"upgradeLevels")=>days.reduce((total,day)=>total+day[key],0)
  return Response.json({from:from.toISOString(),until:until.toISOString(),gold:sumText("gold"),elixir:sumText("elixir"),darkElixir:sumText("darkElixir"),donated:sumText("donated"),received:sumText("received"),farmingAttacks:sumCount("farmingAttacks"),rankedAttacks:sumCount("rankedAttacks"),legendAttacks:sumCount("legendAttacks"),upgradeLevels:sumCount("upgradeLevels"),days:days.map(day=>({...day,from:day.from.toISOString(),until:day.until.toISOString()}))},{headers:{"Cache-Control":"public, max-age=30"}})
 }
 if(donations){
  if(request.method!=="GET"||url.search)return yield* new InvalidRequest({message:"GET without query required"})
  const raw=yield* Effect.try({try:()=>decodeURIComponent(donations[1]!),catch:()=>new InvalidRequest({message:"Invalid clan tag"})}),tag=yield* publicTag(raw)
  const now=new Date(),from=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1))
  const rows=yield* sql<{donated:string;received:string;observations:number}>`SELECT COALESCE(sum(delta) FILTER(WHERE stat_type='donated'),0)::text AS donated,COALESCE(sum(delta) FILTER(WHERE stat_type='received'),0)::text AS received,count(*)::int AS observations FROM player_stat_changes WHERE clan_tag=${tag} AND stat_type IN ('donated','received') AND event_time>=${from} AND event_time<${now}`
  return Response.json({from:from.toISOString(),asOf:now.toISOString(),...rows[0]},{headers:{"Cache-Control":"public, max-age=30"}})
 }
 if(farm){
  if(request.method!=="GET")return yield* new InvalidRequest({message:"GET required"})
  const raw=yield* Effect.try({try:()=>decodeURIComponent(farm[1]!),catch:()=>new InvalidRequest({message:"Invalid player tag"})}),tag=yield* publicTag(raw)
  const now=new Date(),until=url.searchParams.has("until")?new Date(url.searchParams.get("until")!):now
  const from=url.searchParams.has("from")?new Date(url.searchParams.get("from")!):new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1))
  if(!Number.isFinite(+until)||!Number.isFinite(+from)||from>=until||+until>+now||+until-+from>366*86400000)return yield* new InvalidRequest({message:"Invalid farming date range"})
  const rows=yield* sql<{gold:string;elixir:string;dark:string;total:string;attacks:number;timed:number;duration:number;session:number}>`SELECT gold::text,elixir::text,dark_elixir::text AS dark,total_loot::text AS total,attacks::int,timed_attacks::int AS timed,attack_seconds::float8 AS duration,session_seconds::float8 AS session FROM farming_summary(ARRAY[${tag}]::text[],${from},${until})`
  const row=rows[0]
  return Response.json({from:from.toISOString(),until:until.toISOString(),asOf:now.toISOString(),gold:row?.gold??"0",elixir:row?.elixir??"0",darkElixir:row?.dark??"0",totalLoot:row?.total??"0",attacks:row?.attacks??0,timedAttacks:row?.timed??0,attackSeconds:row?.duration??0,sessionSeconds:row&&row.attacks===row.timed?row.session:null},{headers:{"Cache-Control":"public, max-age=30"}})
 }
 const user=yield* (yield* AuthIdentity).requireUser(request)
 if(request.method==="GET"){
  const revisions=yield* sql<{revision:number}>`SELECT revision::int FROM home_layouts WHERE user_id=${user.userId}`
  if(!revisions.length)return Response.json({revision:0,items:initial()},{headers:{"Cache-Control":"no-store"}})
  const items=yield* sql<{id:string;kind:string;entityTag:string|null;size:string}>`SELECT id,kind,entity_tag AS "entityTag",size FROM home_items WHERE user_id=${user.userId} ORDER BY position`
  return Response.json({revision:revisions[0]!.revision,items},{headers:{"Cache-Control":"no-store"}})
 }
 if(request.method!=="PUT")return yield* new InvalidRequest({message:"GET or PUT required"})
 const body=yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(HomeLayout)),Effect.mapError(()=>new InvalidRequest({message:"Invalid Home layout"})))
 if(body.revision<0||body.items.length!==4||new Set(body.items.map(i=>i.id)).size!==body.items.length)return yield* new InvalidRequest({message:"Invalid Home cards"})
 for(const kind of ["todo","ranked","upgrade","activity"]){if(body.items.filter(i=>i.kind===kind&&i.id===kind&&i.entityTag===null&&i.size==="wide").length!==1)return yield* new InvalidRequest({message:"Keep each original Home card"})}
 for(const item of body.items){if(builtins.includes(item.kind as typeof builtins[number])){if(item.id!==item.kind||item.entityTag!==null||item.size!=="wide")return yield* new InvalidRequest({message:"Invalid original card"})}else if(!/^[a-f0-9-]{36}$/iu.test(item.id)||!/^#[0289PYLQGRJCUV]+$/u.test(item.entityTag??""))return yield* new InvalidRequest({message:"Invalid widget identity"})}
 const items=body.items
 const revision=yield* sql.withTransaction(Effect.gen(function*(){
  if(body.revision===0){const inserted=yield* sql`INSERT INTO home_layouts(user_id) VALUES(${user.userId}) ON CONFLICT DO NOTHING RETURNING user_id`;if(!inserted.length)return yield* new Conflict({message:"Home layout changed; reload before saving"})}
  else {const updated=yield* sql`UPDATE home_layouts SET revision=revision+1,updated_at=now() WHERE user_id=${user.userId} AND revision=${body.revision} RETURNING user_id`;if(!updated.length)return yield* new Conflict({message:"Home layout changed; reload before saving"})}
  yield* sql`DELETE FROM home_items WHERE user_id=${user.userId}`
  for(const [position,item]of items.entries())yield* sql`INSERT INTO home_items(user_id,id,kind,entity_tag,size,position) VALUES(${user.userId},${item.id},${item.kind},${item.entityTag},${item.size},${position})`
  return body.revision+1
 }))
 return Response.json({revision,items},{headers:{"Cache-Control":"no-store"}})
}).pipe(Effect.mapError(cause=>cause instanceof InvalidRequest||cause instanceof Conflict||cause instanceof Unauthenticated||cause instanceof DatabaseFailure?cause:new DatabaseFailure({cause,message:"Home data unavailable"})))
