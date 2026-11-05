import { BotCapitalTrophyHistoryEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { InvalidRequest, DatabaseFailure } from "./errors.js"
import { publicTag } from "./public-war.js"
import { serverActivitySeason } from "./dashboard-server-activity.js"
export const dispatchBotCapitalTrophyHistory=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url),match=/^\/v2\/bot\/clans\/([^/]+)\/capital-trophy-history$/u.exec(url.pathname)
 if(!match)return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 if(request.method!=="GET"||[...url.searchParams.keys()].some(k=>!["season","months"].includes(k))||["season","months"].some(k=>url.searchParams.getAll(k).length>1))return yield* new InvalidRequest({message:"Invalid Capital history request"})
 const query=yield* Schema.decodeUnknownEffect(BotCapitalTrophyHistoryEndpoint.query)(Object.fromEntries(url.searchParams)).pipe(Effect.mapError(()=>new InvalidRequest({message:"Choose 2–12 seasons"})))
 const decoded=yield* Effect.try({try:()=>decodeURIComponent(match[1]!),catch:()=>new InvalidRequest({message:"Invalid clan tag"})}),tag=yield* publicTag(decoded)
 const last=yield* serverActivitySeason(query.season),now=new Date()
 if(last.start>now)return yield* new InvalidRequest({message:"Choose a current or past season"})
 const [year,month]=last.season.split("-").map(Number),firstId=new Date(Date.UTC(year!,month!-(query.months??4),1)).toISOString().slice(0,7),first=yield* serverActivitySeason(firstId)
 const end=new Date(Math.min(last.end.valueOf(),now.valueOf())),endDate=end.toISOString().slice(0,10),startDate=first.start.toISOString().slice(0,10)
 const endExclusive=end.valueOf()===last.end.valueOf()?endDate:new Date(Date.parse(endDate+"T00:00:00Z")+86400000).toISOString().slice(0,10)
 const sql=yield* SqlClient.SqlClient
 const rows=yield* sql<{week:string;date:string;value:number}>`SELECT DISTINCT ON (week) (date-((extract(isodow FROM date)::int+2)%7))::text AS week,date::text,capital_points AS value
  FROM leaderboard_history_clan_capital WHERE clan_tag=${tag} AND location_id='global' AND date>=${startDate}::date AND date<${endExclusive}::date
  ORDER BY week,date DESC`
 const start=new Date(startDate+"T00:00:00Z");start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+2)%7)
 const weeks:string[]=[];for(let time=start.valueOf();time<end.valueOf();time+=7*86400000)weeks.push(new Date(time).toISOString().slice(0,10))
 const lookup=new Map(rows.map(row=>[row.week,row]))
 if(rows.some(row=>!Number.isSafeInteger(row.value)||row.value<0))return yield* new DatabaseFailure({cause:"unsafe_integer",message:"Capital trophy history exceeds numeric range"})
 return Response.json({weeks,values:weeks.map(week=>lookup.get(week)?.value??null),sampleDates:weeks.map(week=>lookup.get(week)?.date??null)})
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Capital trophy history unavailable"}))))
