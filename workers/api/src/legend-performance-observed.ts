import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { rankedTroopWeights } from "./static-metadata.js"
import { InvalidRequest } from "./errors.js"
import { parseLegendDaysQuery } from "./league-analytics-query.js"
import { date, millisecondsPerDay, number, summarize, type Row, type Period, type PeriodKind } from "./legend-performance-summary.js"

// Match Tracking's classifier: main-troop housing only, with a 70% majority.
// Unknown composition or static metadata remains unknown, never guessed.
const rawWithArmyTypes = (start: string, end: string, weights: string) => `raw AS NOT MATERIALIZED (
  SELECT (battle_time-interval '5 hours')::date AS day,player_tag,direction,share_code,1::integer battles
  FROM battles_ranked WHERE battle_mode=2 AND battle_time>=${start}::timestamptz AND battle_time<${end}::timestamptz
), invalid_players AS MATERIALIZED (
  SELECT day,player_tag,direction FROM raw GROUP BY day,player_tag,direction HAVING count(*)>8
) , code_usage AS MATERIALIZED (
  SELECT r.day,r.direction,r.share_code,count(*)::integer battles FROM raw r WHERE NOT EXISTS (SELECT 1 FROM invalid_players i WHERE i.day=r.day AND i.player_tag=r.player_tag AND i.direction=r.direction) GROUP BY r.day,r.direction,r.share_code
), weights AS MATERIALIZED (SELECT * FROM jsonb_to_recordset(${weights}::jsonb) AS t(id integer,flying boolean,housing integer)),
army_types AS MATERIALIZED (
  SELECT c.share_code,CASE
    WHEN bool_or(w.id IS NULL OR (t.value->>'quantity')::integer<=0) OR coalesce(sum(w.housing*(t.value->>'quantity')::integer),0)<=0 THEN 'unknown'
    WHEN coalesce(sum(w.housing*(t.value->>'quantity')::integer) FILTER(WHERE w.flying),0)*10>=sum(w.housing*(t.value->>'quantity')::integer)*7 THEN 'air'
    WHEN coalesce(sum(w.housing*(t.value->>'quantity')::integer) FILTER(WHERE NOT w.flying),0)*10>=sum(w.housing*(t.value->>'quantity')::integer)*7 THEN 'ground'
    ELSE 'mixed' END kind
  FROM army_compositions c JOIN (SELECT DISTINCT share_code FROM code_usage WHERE share_code IS NOT NULL) codes USING(share_code)
  CROSS JOIN LATERAL jsonb_array_elements(c.main_troops) t(value)
  LEFT JOIN weights w ON w.id=(t.value->>'id')::integer GROUP BY c.share_code
)`
/** Completed days come exclusively from Tracking's daily aggregate. Never
 * rescan historical battles here; absent rollups stay absent until backfilled. */
export const queryObservedLegendDayPerformance = (query: URLSearchParams, now: Date) => Effect.gen(function* () {
  if (query.getAll("cohort").length !== 1) return yield* Effect.fail(new InvalidRequest({message:"cohort may be supplied only once"}))
  for (const key of ["compare", "armyTypes"]) {
    if (query.getAll(key).length>1 || (query.has(key) && !["true","false"].includes(query.get(key)!))) return yield* Effect.fail(new InvalidRequest({message:`Invalid ${key}`}))
  }
  const base = new URLSearchParams(query); base.set("cohort","legend_i"); base.delete("compare"); base.delete("armyTypes")
  const options = yield* parseLegendDaysQuery(base, now)
  const compare = query.get("compare") !== "false"
  const includeArmyTypes = query.get("armyTypes") !== "false"
  const currentStart = new Date(Math.floor((+now - 5*3600000)/millisecondsPerDay)*millisecondsPerDay+5*3600000)
  const priorEnd = Date.parse(`${options.window.firstDay}T00:00:00Z`)-millisecondsPerDay
  const periods: Period[] = [
    {kind:"selected",firstDay:options.window.firstDay,lastDay:options.window.lastDay,expectedDays:options.window.calendarDays},
    ...([30,90] as const).map(days=>({kind:`previous_${days}` as PeriodKind,firstDay:date(new Date(priorEnd-(days-1)*millisecondsPerDay)),lastDay:date(new Date(priorEnd)),expectedDays:days})),
  ]
  const selectedPeriods = compare ? periods : periods.slice(0,1)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<Row>(`SELECT * FROM legend_observed_daily_stats
    WHERE day BETWEEN $1::date AND $2::date AND source_window_end <= $3::timestamptz
      AND source_window_start=(day::timestamp AT TIME ZONE 'UTC')+interval '5 hours'
      AND eligible_player_count>0 ORDER BY day,direction`,
    [compare?periods[2]!.firstDay:options.window.firstDay,options.window.lastDay,currentStart.toISOString()])
  const availabilityRows = yield* sql.unsafe<{first_day: Date|string|null;last_day: Date|string|null}>(`
    SELECT min(day) first_day,max(day) last_day FROM (
      SELECT day FROM legend_observed_daily_stats WHERE eligible_player_count>0 AND source_window_end<=$1::timestamptz
      GROUP BY day HAVING count(*)=2
    ) days`,[currentStart.toISOString()])
  const availability = availabilityRows[0]?.first_day && availabilityRows[0]?.last_day
    ? {firstDay:date(availabilityRows[0].first_day),lastDay:date(availabilityRows[0].last_day)} : undefined
  const summarized = (data: readonly Row[]) => summarize(includeArmyTypes ? data : data.map(({attack_types: _attackTypes,...row})=>row))
  const periodResults = selectedPeriods.map(period=>{
    const selected=rows.filter(row=>date(row.day)>=period.firstDay && date(row.day)<=period.lastDay)
    return {...period,availableDays:selected.filter(row=>row.direction===1).length,
      offense:summarized(selected.filter(row=>row.direction===1)),defense:summarized(selected.filter(row=>row.direction===2)),
      perfectOffensePlayers:null,perfectedDefensePlayers:null}
  })
  const selected=rows.filter(row=>date(row.day)>=options.window.firstDay)
  const items=selected.filter(row=>row.direction===1).flatMap(offense=>{
    const defense=selected.find(row=>row.direction===2 && date(row.day)===date(offense.day))
    return defense?[{day:date(offense.day),sourceWindowStart:new Date(offense.source_window_start).toISOString(),sourceWindowEnd:new Date(offense.source_window_end).toISOString(),offense:summarized([offense]),defense:summarized([defense])}]:[]
  })
  let currentDay
  if (options.window.firstDay<=date(currentStart) && options.window.lastDay>=date(currentStart)) {
    currentDay=yield* queryLiveObservedLegendDayPerformance(includeArmyTypes,now)
  }
  return {cohort:"observed" as const,...(availability?{availability}:{}),...(currentDay?{currentDay}:{}),periods:periodResults,perfectDayContributions:[],items}
})

// The only request-time raw aggregation is the current unfinished game day.
const queryLiveObservedLegendDayPerformance = (includeArmyTypes: boolean, now: Date) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const currentStart = new Date(Math.floor((+now-5*3600000)/millisecondsPerDay)*millisecondsPerDay+5*3600000)
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    yield* sql.unsafe("SET LOCAL statement_timeout='25s'")
    const partial = yield* sql.unsafe<{direction:number;players:number|string;battles:number|string;triples:number|string;last_battle:Date|string;star_counts:number[];destruction:number|string;duration:number|string}>(`
      WITH current_battles AS (
        SELECT *,count(*) OVER(PARTITION BY player_tag,direction) day_battles FROM battles_ranked
        WHERE battle_mode=2 AND battle_time>=$1::timestamptz AND battle_time<$2::timestamptz
      )
      SELECT direction,count(DISTINCT player_tag) players,count(*) battles,count(*) FILTER(WHERE stars=3) triples,max(battle_time) last_battle,
        ARRAY[count(*) FILTER(WHERE stars=0),count(*) FILTER(WHERE stars=1),count(*) FILTER(WHERE stars=2),count(*) FILTER(WHERE stars=3)] star_counts,
        sum(destruction_percentage) destruction,sum(duration_seconds) duration
      FROM current_battles WHERE day_battles<=8 GROUP BY direction`,[currentStart.toISOString(),now.toISOString()])
    if (!partial.length) return undefined
    let types: ReadonlyArray<{direction:number;attack_types:number[]}> = []
    if (includeArmyTypes) {
      yield* sql.unsafe("SET LOCAL work_mem='64MB'")
      types=yield* sql.unsafe<{direction:number;attack_types:number[]}>(`
        WITH ${rawWithArmyTypes("$1","$2","$3")}
        SELECT direction,ARRAY[
          coalesce(sum(battles) FILTER(WHERE a.kind='air'),0),
          coalesce(sum(battles) FILTER(WHERE a.kind='ground'),0),
          coalesce(sum(battles) FILTER(WHERE a.kind='mixed'),0),
          coalesce(sum(battles) FILTER(WHERE a.kind IS NULL OR a.kind='unknown'),0)] attack_types
        FROM code_usage LEFT JOIN army_types a USING(share_code) GROUP BY direction`,
        [currentStart.toISOString(),now.toISOString(),JSON.stringify(rankedTroopWeights())])
    }
    const side=(direction:number)=>{
      const row=partial.find(row=>row.direction===direction),battles=number(row?.battles??0),triples=number(row?.triples??0)
      const stars=(row?.star_counts??[0,0,0,0]).map(number),counts=(types.find(row=>row.direction===direction)?.attack_types??[0,0,0,0]).map(number)
      return {players:number(row?.players??0),battles,triples,tripleRate:battles?triples/battles:null,
        starCounts:stars,averageStars:battles?stars.reduce((total,count,index)=>total+count*index,0)/battles:null,
        averageDestruction:battles?number(row?.destruction??0)/battles:null,averageDuration:battles?number(row?.duration??0)/battles:null,
        ...(includeArmyTypes?{attackTypes:{air:counts[0]!,ground:counts[1]!,mixed:counts[2]!,unknown:counts[3]!}}:{})}
    }
    return {day:date(currentStart),asOf:new Date(Math.max(...partial.map(row=>+new Date(row.last_battle)))).toISOString(),sourceWindowStart:currentStart.toISOString(),offense:side(1),defense:side(2)}
  }))
})
