import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { BotClanSeasonStatsEndpoint } from "@clashking/api-contracts"
import { AuthIdentity } from "./auth.js"
import { InvalidRequest, DatabaseFailure } from "./errors.js"
import { publicTag } from "./public-war.js"
import { serverActivitySeason } from "./dashboard-server-activity.js"
export const dispatchBotClanStats=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url),match=/^\/v2\/bot\/clans\/([^/]+)\/(season-stats|clan-games)$/u.exec(url.pathname)
 if(!match)return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 if(request.method!=="GET"||[...url.searchParams.keys()].some(key=>key!=="season")||url.searchParams.getAll("season").length>1)return yield* new InvalidRequest({message:"Invalid clan season request"})
 const raw=yield* Effect.try({try:()=>decodeURIComponent(match[1]!),catch:()=>new InvalidRequest({message:"Invalid clan tag"})})
 const tag=yield* publicTag(raw),season=url.searchParams.get("season")??undefined
 if(match[2]==="clan-games"){
  if(url.searchParams.size)return yield* new InvalidRequest({message:"Clan Games does not accept a season"})
  const sql=yield* SqlClient.SqlClient,now=new Date(),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),22,8)),end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),28,8))
  // Clan Games points follow the player when they move clans. Do not filter
  // changes by clan_tag or use the game's trophy-season date boundaries.
  const rows=yield* sql<{tag:string;points:string}>`SELECT change.player_tag AS tag,sum(change.delta)::text AS points
   FROM player_stat_changes change
   WHERE change.stat_type='clan_games' AND change.event_time>=${start} AND change.event_time<${end}
   AND change.player_tag IN (SELECT member->>'tag' FROM basic_clan clan CROSS JOIN LATERAL jsonb_array_elements(clan.members) member WHERE clan.tag=${tag})
   GROUP BY change.player_tag`.pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Clan Games query failed"})))
  return Response.json({items:rows.map(row=>({tag:row.tag,points:Number(row.points)}))})
 }
 if(season&&!/^\d{4}-(0[1-9]|1[0-2])$/u.test(season))return yield* new InvalidRequest({message:"Season must be YYYY-MM"})
 const window=yield* serverActivitySeason(season),sql=yield* SqlClient.SqlClient,now=new Date()
 if(window.start>now)return yield* new InvalidRequest({message:"Choose a current or past season"})
 // Attribute contributions to the clan recorded on the event, not the player's
 // present clan. Former members remain included; current counters are a Bot fallback only.
 const rows=yield* sql<{tag:string;name:string;townHallLevel:number;donated:string;received:string;clanGames:string;capitalDonated:string}>`
 SELECT stats.player_tag AS tag,COALESCE(player.name,stats.player_tag) AS name,
 COALESCE(player.townhall_level,0) AS "townHallLevel",
 COALESCE(sum(stats.delta) FILTER(WHERE stats.stat_type='donated'),0)::text AS donated,
 COALESCE(sum(stats.delta) FILTER(WHERE stats.stat_type='received'),0)::text AS received,
 COALESCE(sum(stats.delta) FILTER(WHERE stats.stat_type='clan_games'),0)::text AS "clanGames",
 COALESCE(sum(stats.delta) FILTER(WHERE stats.stat_type='capital_gold_donated'),0)::text AS "capitalDonated"
 FROM player_stat_changes stats LEFT JOIN basic_player player ON player.tag=stats.player_tag
 WHERE stats.clan_tag=${tag} AND stats.event_time>=${window.start} AND stats.event_time<${window.end}
 GROUP BY stats.player_tag,player.name,player.townhall_level ORDER BY stats.player_tag LIMIT 501`
 .pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Clan contributions query failed"})))
 const items=rows.slice(0,500).map(row=>({...row,donated:Number(row.donated),received:Number(row.received),clanGames:Number(row.clanGames),capitalDonated:Number(row.capitalDonated)}))
 const activity=yield* sql<{average:string}>`SELECT COALESCE(avg(count),0)::text AS average FROM (
 SELECT count(DISTINCT tag) AS count FROM player_online_events
 WHERE clan_tag=${tag} AND seen_at>=${window.start} AND seen_at<${window.end}
 AND seen_at < (date_trunc('day',${now}::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
 GROUP BY (seen_at AT TIME ZONE 'UTC')::date) days`.pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Clan activity query failed"})))
 if(items.some(row=>[row.donated,row.received,row.clanGames,row.capitalDonated].some(value=>!Number.isSafeInteger(value))))return yield* new DatabaseFailure({cause:"unsafe_integer",message:"Contribution count exceeds numeric range"})
 const body=yield* Schema.encodeUnknownEffect(BotClanSeasonStatsEndpoint.response)({season:window.season,start:window.start.toISOString(),end:window.end.toISOString(),current:window.start<=now&&now<window.end,truncated:rows.length>500,activeDaily:Math.floor(Number(activity[0]?.average??0)),items}).pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Clan contributions encoding failed"})))
 return Response.json(body)
})
