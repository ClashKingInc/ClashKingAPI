import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { serverActivitySeason } from "./dashboard-server-activity.js"
import { forEachArchiveWar } from "./war-archive.js"
import { archiveAttackFacts } from "./war-archive-model.js"

export const dispatchBotWarStatistics=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url)
 if(request.method!=="POST"||url.pathname!=="/v2/bot/war-statistics")return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 const raw=yield* readBoundedJson(request,16384),body=raw&&typeof raw==="object"?raw as Record<string,unknown>:{}
 const invalid=(message:string)=>new InvalidRequest({message})
 if(url.search||!Array.isArray(body.clans)||!body.clans.length||body.clans.length>200||body.clans.some(tag=>typeof tag!=="string"||!/^#[0289PYLQGRJCUV]{1,15}$/u.test(tag))||Object.keys(body).some(key=>!["clans","view","warTypes","stars","thFilter","season","days","warCount"].includes(key)))return yield* invalid("Provide 1–200 clan tags and valid report options")
 const view=body.view??"attack",types=body.warTypes??["random","cwl","friendly"],stars=body.stars??[3],th=body.thFilter??"all"
 if(!["attack","defense"].includes(String(view))||!Array.isArray(types)||!types.length||types.some(type=>!["random","cwl","friendly"].includes(type))||!Array.isArray(stars)||!stars.length||stars.some(star=>!Number.isInteger(star)||star<0||star>3)||typeof th!=="string"||! /^(?:all|equal|(?:[1-9]|[12][0-9]|30)(?:v(?:[1-9]|[12][0-9]|30))?)$/u.test(th))return yield* invalid("Invalid war type, star or Town Hall filter")
 if([body.season,body.days,body.warCount].filter(value=>value!==undefined).length>1)return yield* invalid("Choose season, days or war count, not multiple windows")
 if(body.days!==undefined&&(!Number.isInteger(body.days)||Number(body.days)<1||Number(body.days)>365)||body.warCount!==undefined&&(!Number.isInteger(body.warCount)||Number(body.warCount)<1||Number(body.warCount)>1000))return yield* invalid("Days must be 1–365 and war count 1–1000")
 if(body.season!==undefined&&(typeof body.season!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/u.test(body.season)))return yield* invalid("Use a YYYY-MM season")
 const now=new Date(),season=body.days===undefined&&body.warCount===undefined?yield* serverActivitySeason(body.season as string|undefined):undefined
 const start=season?.start??(body.days?new Date(now.getTime()-Number(body.days)*86400000):new Date(0)),end=season?.end??now
 if(start>now)return yield* invalid("Choose a current or past window")
 const clans=[...new Set(body.clans as string[])],sql=yield* SqlClient.SqlClient
 const refs=yield* sql<{id:string}>`SELECT war_id::text id FROM wars
  WHERE (clan_tag=ANY(${clans}::text[]) OR opponent_tag=ANY(${clans}::text[]))
    AND prep_time>=${start} AND prep_time<${end} AND end_time<=${now}
    AND lower(state) IN ('ended','warended') AND war_type=ANY(${[...new Set(types)]}::text[])
  ORDER BY prep_time DESC,war_id DESC LIMIT ${body.warCount?Number(body.warCount):1001}`.pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"War statistics query failed"})))
 const metadata={start:start.toISOString(),end:end.toISOString(),season:season?.season??null,selectedWars:refs.length,truncated:refs.length>1000}
 if(refs.length>1000)return Response.json({...metadata,loadedWars:0,complete:false,items:[]})
 const ownClans=new Set(clans),outcomes=new Set(stars),[ownHall,enemyHall]=th.split("v").map(Number)
 const totals=new Map<string,{tag:string;name:string;townhall:number;attempts:number;matching:number;stars:number;destruction:number}>();let loaded=0
 const complete=yield* forEachArchiveWar(refs.map(row=>row.id),(_id,war)=>Effect.sync(()=>{
  loaded++
  // Process the archive once even if both clans belong to the family. Each
  // attack belongs to one attacker and one defender; do not replay per clan.
  for(const hit of archiveAttackFacts(_id,war)){
   const defense=view==="defense",own=defense?hit.defendingClanTag:hit.attackingClanTag
   if(!ownClans.has(own))continue
   const hall=defense?hit.defenderTownhall:hit.attackerTownhall,enemy=defense?hit.attackerTownhall:hit.defenderTownhall
   if(th==="equal"&&(hall<=0||enemy<=0||hall!==enemy)||th!=="all"&&th!=="equal"&&(hall!==ownHall||enemyHall&&enemy!==enemyHall))continue
   const tag=defense?hit.defenderTag:hit.attackerTag;if(!tag)continue
   const row=totals.get(tag)??{tag,name:defense?hit.defenderName:hit.attackerName,townhall:hall,attempts:0,matching:0,stars:0,destruction:0}
   row.townhall=Math.max(row.townhall,hall);row.attempts++;row.matching+=outcomes.has(hit.stars)?1:0;row.stars+=hit.stars;row.destruction+=hit.destructionPercentage;totals.set(tag,row)
  }
 })).pipe(Effect.map(()=>true),Effect.catch(()=>Effect.succeed(false)))
 // An unreadable or missing archive must not yield an apparently complete
 // ranking. Return coverage only, so callers can ask for a narrower/retried view.
 const covered=complete&&loaded===refs.length
 return Response.json({...metadata,loadedWars:loaded,complete:covered,items:covered?[...totals.values()]:[]})
})
