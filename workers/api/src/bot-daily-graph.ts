import { BotDailyGraphEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
const historyTypes:Record<string,number[]>={troopLevels:[1,4],heroLevels:[3,5],equipmentLevels:[6],townhallLevels:[7],bestTrophies:[8],experienceLevels:[10],warPreferenceChanges:[11],nameChanges:[12]}
const stats:Record<string,string>={donated:"donated",received:"received",clanGames:"clan_games",capitalDonated:"capital_gold_donated"}
export const dispatchBotDailyGraph=(request:Request)=>Effect.gen(function*(){
 if(new URL(request.url).pathname!==BotDailyGraphEndpoint.path)return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 if(request.method!=="POST"||new URL(request.url).search)return yield* new InvalidRequest({message:"POST JSON without query parameters required"})
 const body=yield* readBoundedJson(request,8192).pipe(Effect.flatMap(Schema.decodeUnknownEffect(BotDailyGraphEndpoint.body)),Effect.catchTag("SchemaError",()=>Effect.fail(new InvalidRequest({message:"Choose a daily metric, 1–50 clans and 1–180 days"}))))
 const clans=[...new Set(body.clans)],end=new Date(),start=new Date(end);start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-body.days+1)
 const sql=yield* SqlClient.SqlClient
 type Row={tag:string;day:string;value:string}
 let rows:readonly Row[],basis:"recorded_clan"|"latest_stored_members"="recorded_clan"
 if(historyTypes[body.metric]){
  basis="latest_stored_members"
  // Change history has no historical clan field. Preserve the legacy report's
  // current-member basis explicitly; never label it historical clan attribution.
  const eventCount=["nameChanges","warPreferenceChanges"].includes(body.metric)
  rows=yield* sql<Row>`SELECT player.clan_tag AS tag,(change.event_time AT TIME ZONE 'UTC')::date::text AS day,
   sum(CASE WHEN ${eventCount} THEN 1 ELSE change.current_value::numeric-change.previous_value::numeric END)::text AS value
   FROM player_change_history change JOIN basic_player player ON player.tag=change.player_tag
   WHERE player.clan_tag=ANY(${clans}::text[]) AND change.change_type=ANY(${historyTypes[body.metric]}::smallint[])
     AND change.event_time>=${start} AND change.event_time<${end}
     AND CASE WHEN ${eventCount} THEN change.current_value<>change.previous_value
       WHEN change.current_value ~ '^[0-9]+$' AND change.previous_value ~ '^[0-9]+$'
       THEN change.current_value::numeric>change.previous_value::numeric ELSE false END
   GROUP BY player.clan_tag,(change.event_time AT TIME ZONE 'UTC')::date`
 }else if(stats[body.metric]){
  rows=yield* sql<Row>`SELECT clan_tag AS tag,(event_time AT TIME ZONE 'UTC')::date::text AS day,sum(delta)::text AS value
   FROM player_stat_changes WHERE clan_tag=ANY(${clans}::text[]) AND stat_type=${stats[body.metric]} AND delta>0
   AND event_time>=${start} AND event_time<${end} GROUP BY clan_tag,(event_time AT TIME ZONE 'UTC')::date`
 }else if(body.metric==="activity"){
  rows=yield* sql<Row>`SELECT clan_tag AS tag,(seen_at AT TIME ZONE 'UTC')::date::text AS day,count(*)::text AS value
   FROM player_online_events WHERE clan_tag=ANY(${clans}::text[]) AND seen_at>=${start} AND seen_at<${end}
   GROUP BY clan_tag,(seen_at AT TIME ZONE 'UTC')::date`
 }else{
  rows=yield* sql<Row>`SELECT clan_tag AS tag,(time AT TIME ZONE 'UTC')::date::text AS day,count(*)::text AS value
   FROM join_leave_history WHERE clan_tag=ANY(${clans}::text[]) AND time>=${start} AND time<${end}
   GROUP BY clan_tag,(time AT TIME ZONE 'UTC')::date`
 }
 const dates=Array.from({length:body.days},(_,index)=>new Date(start.getTime()+index*86400000).toISOString().slice(0,10))
 const values=new Map(rows.map(row=>[`${row.tag}:${row.day}`,Number(row.value)]))
 if([...values.values()].some(value=>!Number.isSafeInteger(value)||value<0))return yield* new DatabaseFailure({cause:"unsafe_integer",message:"Daily graph totals exceed numeric range"})
 return Response.json({metric:body.metric,basis,dates,partialLastDay:true,series:clans.map(tag=>({tag,values:dates.map(day=>values.get(`${tag}:${day}`)??0)}))})
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Daily graph query failed"}))))
