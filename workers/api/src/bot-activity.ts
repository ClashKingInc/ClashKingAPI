import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { BotActivityEndpoint } from "@clashking/api-contracts"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { serverActivitySeason } from "./dashboard-server-activity.js"

export const dispatchBotActivity=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url)
 if(url.pathname!=="/v2/bot/clans/activity")return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 if(request.method!=="POST"||url.search)return yield* new InvalidRequest({message:"Invalid activity request"})
 const raw=yield* readBoundedJson(request,8192)
 const body=yield* Schema.decodeUnknownEffect(BotActivityEndpoint.body)(raw).pipe(Effect.mapError(()=>new InvalidRequest({message:"Provide clan tags and an optional season"})))
 if(body.clanTags.length<1||body.clanTags.length>200||body.clanTags.some(tag=>!/^#[0289PYLQGRJCUV]{1,15}$/u.test(tag))||body.season!==undefined&&!/^\d{4}-(0[1-9]|1[0-2])$/u.test(body.season))return yield* new InvalidRequest({message:"Provide 1–200 clan tags and an optional YYYY-MM season"})
 const clans=[...new Set(body.clanTags)],now=new Date(),window=yield* serverActivitySeason(body.season),sql=yield* SqlClient.SqlClient
 if(window.start>now)return yield* new InvalidRequest({message:"Choose a current or past season"})
 const current=now<window.end
 // Count events where the player was observed, including former members.
 // Grouping by player deduplicates family moves. Last online is the latest
 // observation anywhere, as in the old bot; historical reports omit it.
 // Hidden Discord links do not hide public game activity or expose ownership.
 const rows=yield* sql<{tag:string;name:string;townHallLevel:number;activity:string;lastObservedAt:Date|string|null}>`
  WITH activity AS (
   SELECT tag,count(*)::text activity FROM player_online_events
   WHERE clan_tag=ANY(${clans}::text[]) AND seen_at>=${window.start} AND seen_at<${window.end} AND seen_at<=${now}
   GROUP BY tag
  )
  SELECT activity.tag,coalesce(player.name,activity.tag) name,coalesce(player.townhall_level,0) "townHallLevel",activity.activity,
    CASE WHEN ${current} THEN (SELECT max(seen_at) FROM player_online_events latest WHERE latest.tag=activity.tag AND latest.seen_at<=${now}) END "lastObservedAt"
  FROM activity LEFT JOIN basic_player player ON player.tag=activity.tag ORDER BY activity.tag LIMIT 10001`
  .pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Activity query failed"})))
 const totals=yield* sql<{tag:string;activity:string}>`SELECT clan_tag tag,count(*)::text activity FROM player_online_events
  WHERE clan_tag=ANY(${clans}::text[]) AND seen_at>=${window.start} AND seen_at<${window.end} AND seen_at<=${now} GROUP BY clan_tag`
  .pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Activity totals query failed"})))
 const items=rows.slice(0,10000).map(row=>({...row,activity:Number(row.activity),lastObservedAt:row.lastObservedAt===null?null:new Date(row.lastObservedAt).toISOString()}))
 const clanTotals=clans.map(tag=>({tag,activity:Number(totals.find(row=>row.tag===tag)?.activity??0)}))
 if([...items,...clanTotals].some(row=>!Number.isSafeInteger(row.activity)))return yield* new DatabaseFailure({cause:"unsafe_integer",message:"Activity count exceeds numeric range"})
 return Response.json({season:window.season,current,truncated:rows.length>10000,items,clanTotals})
})
