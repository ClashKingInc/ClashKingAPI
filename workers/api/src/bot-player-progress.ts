import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { InvalidRequest, DatabaseFailure } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { serverActivitySeason } from "./dashboard-server-activity.js"
import { playerHistoryStaticItem } from "./public-changes.js"
const groups:Record<string,number[]>={heroes:[3,5],troops:[1,4],equipment:[6],all:[1,3,4,5,6]}
export const dispatchBotPlayerProgress=(request:Request)=>Effect.gen(function*(){
 if(request.method!=="POST"||new URL(request.url).pathname!=="/v2/bot/players/upgrade-progress")return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 const raw=yield* readBoundedJson(request,8192),body=raw&&typeof raw==="object"?raw as Record<string,unknown>:{}
 if(new URL(request.url).search||!Array.isArray(body.tags)||body.tags.length<1||body.tags.length>100||body.tags.some(tag=>typeof tag!=="string"||!/^#[0289PYLQGRJCUV]{1,15}$/u.test(tag))||typeof body.type!=="string"||!Object.hasOwn(groups,body.type)||body.season!==undefined&&(typeof body.season!=="string"||!/^\d{4}-(0[1-9]|1[0-2])$/u.test(body.season))||Object.keys(body).some(key=>!["tags","type","season"].includes(key)))return yield* new InvalidRequest({message:"Provide 1–100 player tags, a progress type and an optional YYYY-MM season"})
 const tags=[...new Set(body.tags as string[])],window=yield* serverActivitySeason(body.season as string|undefined)
 if(window.start>new Date())return yield* new InvalidRequest({message:"Choose a current or past season"})
 const sql=yield* SqlClient.SqlClient
 // Count observations separately from level gains: a missed poll can observe
 // several levels at once. Boost toggles and unchanged/decreasing values are
 // not upgrades, even when a historical import contains those rows.
 const rows=yield* sql<{tag:string;type:number;itemId:number;changes:string;levels:string}>`
  SELECT player_tag tag,change_type type,item_id "itemId",count(*)::text changes,
    sum(current_value::numeric-previous_value::numeric)::text levels
  FROM player_change_history
  WHERE player_tag=ANY(${tags}::text[]) AND change_type=ANY(${groups[body.type]}::smallint[])
    AND item_id IS NOT NULL AND event_time>=${window.start} AND event_time<${window.end}
    AND CASE WHEN previous_value ~ '^[0-9]+$' AND current_value ~ '^[0-9]+$'
      THEN current_value::numeric>previous_value::numeric ELSE false END
  GROUP BY player_tag,change_type,item_id ORDER BY player_tag,change_type,item_id`
  .pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Upgrade progress query failed"})))
 const items=new Map<string,{tag:string;units:Array<{type:number;itemId:number;name:string;changes:number;levels:number}>}>()
 for(const row of rows){
  const changes=Number(row.changes),levels=Number(row.levels)
  if(!Number.isSafeInteger(changes)||!Number.isSafeInteger(levels))return yield* new DatabaseFailure({cause:"unsafe_integer",message:"Upgrade totals exceed numeric range"})
  const player=items.get(row.tag)??{tag:row.tag,units:[]},metadata=playerHistoryStaticItem(row.type,row.itemId)
  player.units.push({type:row.type,itemId:row.itemId,name:metadata?.name??`Unknown unit ${row.itemId}`,changes,levels});items.set(row.tag,player)
 }
 return Response.json({season:window.season,start:window.start.toISOString(),end:window.end.toISOString(),items:[...items.values()]})
})
