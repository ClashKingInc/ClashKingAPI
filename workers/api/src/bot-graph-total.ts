import { BotGraphTotalEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { serverActivitySeason } from "./dashboard-server-activity.js"
import { publicTag } from "./public-war.js"
export const dispatchBotGraphTotal=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url),match=/^\/v2\/bot\/clans\/([^/]+)\/graph-total$/u.exec(url.pathname)
 if(!match)return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 if(request.method!=="GET"||[...url.searchParams.keys()].some(k=>!["metric","season"].includes(k))||url.searchParams.getAll("metric").length!==1||url.searchParams.getAll("season").length>1)return yield* new InvalidRequest({message:"Invalid graph request"})
 const query=yield* Schema.decodeUnknownEffect(BotGraphTotalEndpoint.query)(Object.fromEntries(url.searchParams)).pipe(Effect.mapError(()=>new InvalidRequest({message:"Invalid graph metric"})))
 const decoded=yield* Effect.try({try:()=>decodeURIComponent(match[1]!),catch:()=>new InvalidRequest({message:"Invalid clan tag"})})
 const tag=yield* publicTag(decoded),window=yield* serverActivitySeason(query.season)
 if(window.start>new Date())return yield* new InvalidRequest({message:"Choose a current or past season"})
 const sql=yield* SqlClient.SqlClient;let rows:readonly {value:string}[],basis:"recorded_clan"|"latest_stored_members"="recorded_clan"
 if(["gold","elixir","darkElixir","attackWins"].includes(query.metric)){
  basis="latest_stored_members"
  // Battles have no historical clan field. These totals describe the latest
  // stored members, including their earlier battles, not event-time membership.
  rows=yield* sql<{value:string}>`SELECT COALESCE(sum(CASE WHEN ${query.metric}='attackWins' THEN CASE WHEN battle.stars>0 THEN 1 ELSE 0 END ELSE COALESCE((battle.looted_resources->>${query.metric})::numeric,0) END),0)::text value FROM (
    SELECT player_tag,stars,looted_resources FROM battles_farming WHERE battle_time>=${window.start} AND battle_time<${window.end}
    UNION ALL SELECT player_tag,stars,looted_resources FROM battles_ranked WHERE direction=1 AND battle_time>=${window.start} AND battle_time<${window.end}
   ) battle JOIN basic_player player ON player.tag=battle.player_tag WHERE player.clan_tag=${tag}`
 }else if(query.metric==="activity"){
  rows=yield* sql<{value:string}>`SELECT count(*)::text value FROM player_online_events WHERE clan_tag=${tag} AND seen_at>=${window.start} AND seen_at<${window.end}`
 }else if(query.metric==="troopLevels"||query.metric==="heroLevels"){
  basis="latest_stored_members"
  rows=yield* sql<{value:string}>`SELECT COALESCE(sum(CASE WHEN change.current_value ~ '^[0-9]+$' AND change.previous_value ~ '^[0-9]+$' THEN greatest(0,change.current_value::numeric-change.previous_value::numeric) ELSE 0 END),0)::text value
   FROM player_change_history change JOIN basic_player player ON player.tag=change.player_tag WHERE player.clan_tag=${tag} AND change.change_type=ANY(${query.metric==="troopLevels"?[1,4]:[3,5]}::smallint[]) AND change.event_time>=${window.start} AND change.event_time<${window.end}`
 }else{
  // War identity and perspective come from stored metadata; reading compressed
  // attack archives is unnecessary for final scores and would change the unit.
  rows=yield* sql<{value:string}>`SELECT COALESCE(sum(CASE WHEN ${query.metric}='warsSpun' THEN 1 WHEN ${query.metric}='warStars' THEN CASE WHEN clan_tag=${tag} THEN clan_stars ELSE opponent_stars END ELSE CASE WHEN (clan_tag=${tag} AND (clan_stars>opponent_stars OR (clan_stars=opponent_stars AND clan_destruction_percentage>opponent_destruction_percentage))) OR (opponent_tag=${tag} AND (opponent_stars>clan_stars OR (opponent_stars=clan_stars AND opponent_destruction_percentage>clan_destruction_percentage))) THEN 1 ELSE 0 END END),0)::text value
   FROM wars WHERE (clan_tag=${tag} OR opponent_tag=${tag}) AND prep_time>=${window.start} AND prep_time<${window.end} AND war_type IN ('random','cwl') AND (${query.metric}='warsSpun' OR lower(state) IN ('ended','warended'))`
 }
 const value=Number(rows[0]?.value??0);if(!Number.isSafeInteger(value)||value<0)return yield* new DatabaseFailure({cause:"unsafe_integer",message:"Graph total exceeds numeric range"})
 return Response.json({season:window.season,value,basis})
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Graph total unavailable"}))))
