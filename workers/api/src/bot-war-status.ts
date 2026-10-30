import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { readBoundedJson } from "./request-body.js"

export const dispatchBotWarStatus=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url)
 if(request.method!=="POST"||url.pathname!=="/v2/bot/players/war-status")return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 const raw=yield* readBoundedJson(request,8192),body=raw&&typeof raw==="object"?raw as Record<string,unknown>:{}
 if(url.search||!Array.isArray(body.tags)||body.tags.length<1||body.tags.length>100||body.tags.some(tag=>typeof tag!=="string"||!/^#[0289PYLQGRJCUV]{1,15}$/u.test(tag))||Object.keys(body).some(key=>key!=="tags"))return yield* new InvalidRequest({message:"Provide 1–100 player tags"})
 const tags=[...new Set(body.tags as string[])],sql=yield* SqlClient.SqlClient
 const items=yield* sql<{tag:string;lastPreferenceChange:string|null;lastWarEnd:string|null;timers:Array<{type:"war"|"cwl";endsAt:string}>}>`
  SELECT wanted.tag, changed.event_time::text AS "lastPreferenceChange", finished.end_time::text AS "lastWarEnd",
    COALESCE(timers.items,'[]'::jsonb) AS timers
  FROM unnest(${tags}::text[]) wanted(tag)
  LEFT JOIN LATERAL (
    SELECT event_time FROM player_change_history WHERE player_tag=wanted.tag AND change_type=11 AND event_time<=now()
    ORDER BY event_time DESC LIMIT 1
  ) changed ON true
  LEFT JOIN LATERAL (
    SELECT war.end_time FROM player_war_history history
    JOIN wars war ON war.war_id=ANY(history.war_ids)
    WHERE history.player_tag=wanted.tag AND war.war_type IN ('random','cwl')
      AND lower(war.state) IN ('ended','warended') AND war.end_time<=now()
    ORDER BY war.end_time DESC LIMIT 1
  ) finished ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('type',type,'endsAt',ends_at) ORDER BY ends_at) items FROM (
      SELECT CASE WHEN schedule.war_type='cwl' THEN 'cwl' ELSE 'war' END type,max(timer.expires_at) ends_at
      FROM player_timers timer JOIN war_schedule schedule ON schedule.schedule_key=timer.event_key
      WHERE timer.player_tag=wanted.tag AND timer.event_type='war' AND timer.expires_at>now()
        AND schedule.war_type IN ('random','cwl')
      GROUP BY schedule.war_type
    ) active
  ) timers ON true`.pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"War status query failed"})))
 // These are observations, not a global eligibility check. Missing retained
 // history/timers cannot prove a player has never warred or has no war lock.
 return Response.json({items:items.map(item=>({...item,lastPreferenceChange:item.lastPreferenceChange?new Date(item.lastPreferenceChange).toISOString():null,lastWarEnd:item.lastWarEnd?new Date(item.lastWarEnd).toISOString():null}))})
})
