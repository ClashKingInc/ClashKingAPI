import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { rankedTroopWeights } from "./static-metadata.js"
import { InvalidRequest } from "./errors.js"
import { parseLegendDaysQuery } from "./league-analytics-query.js"
import { date, millisecondsPerDay, number, summarize, type Row, type Period, type PeriodKind } from "./legend-performance-summary.js"

interface UniquePlayers { kind: PeriodKind; direction: number; players: number }
const trophyValue = `CASE WHEN stars=3 THEN 40
  WHEN stars=2 THEN 16+least(16,greatest(0,floor((destruction_percentage-50)/3.0)::integer))
  WHEN stars=1 THEN 5+least(10,greatest(0,floor((destruction_percentage-1)/9.0)::integer))
  ELSE least(4,floor(destruction_percentage/10.0)::integer) END`
// Match Tracking's classifier: main-troop housing only, with a 70% majority.
// Unknown composition or static metadata remains unknown, never guessed.
const rawWithArmyTypes = (start: string, end: string, weights: string) => `raw AS MATERIALIZED (
  SELECT (battle_time-interval '5 hours')::date AS day,player_tag,direction,share_code,1::integer battles
  FROM battles_ranked WHERE battle_mode=2 AND battle_time>=${start}::timestamptz AND battle_time<${end}::timestamptz
), valid_players AS (
  SELECT day,player_tag,direction FROM raw GROUP BY day,player_tag,direction HAVING count(*)<=8
), weights AS MATERIALIZED (SELECT * FROM jsonb_to_recordset(${weights}::jsonb) AS t(id integer,flying boolean,housing integer)),
army_types AS MATERIALIZED (
  SELECT c.share_code,CASE
    WHEN bool_or(w.id IS NULL OR (t.value->>'quantity')::integer<=0) OR coalesce(sum(w.housing*(t.value->>'quantity')::integer),0)<=0 THEN 'unknown'
    WHEN coalesce(sum(w.housing*(t.value->>'quantity')::integer) FILTER(WHERE w.flying),0)*10>=sum(w.housing*(t.value->>'quantity')::integer)*7 THEN 'air'
    WHEN coalesce(sum(w.housing*(t.value->>'quantity')::integer) FILTER(WHERE NOT w.flying),0)*10>=sum(w.housing*(t.value->>'quantity')::integer)*7 THEN 'ground'
    ELSE 'mixed' END kind
  FROM army_compositions c JOIN (SELECT DISTINCT share_code FROM raw WHERE share_code IS NOT NULL) codes USING(share_code)
  CROSS JOIN LATERAL jsonb_array_elements(c.main_troops) t(value)
  LEFT JOIN weights w ON w.id=(t.value->>'id')::integer GROUP BY c.share_code
)`
const starSums = Array.from({ length: 4 }, (_, i) => `coalesce(sum(o.star_counts[${i+1}]) FILTER(WHERE o.battles<=8),0)::bigint`).join(",")
const bucketCounts = Array.from({ length: 16 }, (_, index) => `count(*) FILTER (WHERE o.battles=8 AND least(o.trophies/20,15)=${index})::integer`).join(",")

/** This population is every player observed in Legend logs, never a guessed ranking cohort. */
export const queryObservedLegendDayPerformance = (query: URLSearchParams, now: Date) => Effect.gen(function* () {
  if (query.getAll("cohort").length !== 1) return yield* Effect.fail(new InvalidRequest({ message: "cohort may be supplied only once" }))
  if (query.getAll("compare").length>1 || (query.has("compare")&&!['true','false'].includes(query.get("compare")!))) return yield* Effect.fail(new InvalidRequest({message:"Invalid compare"}))
  const compare=query.get("compare")!=="false"
  if (query.getAll("armyTypes").length>1 || (query.has("armyTypes")&&!['true','false'].includes(query.get("armyTypes")!))) return yield* Effect.fail(new InvalidRequest({message:"Invalid armyTypes"}))
  const includeArmyTypes=query.get("armyTypes")!=="false"
  const base = new URLSearchParams(query); base.set("cohort", "legend_i"); base.delete("compare"); base.delete("armyTypes")
  const options = yield* parseLegendDaysQuery(base, now)
  const sql = yield* SqlClient.SqlClient
  const currentStart = new Date(Math.floor((+now - 5 * 3600000) / millisecondsPerDay) * millisecondsPerDay + 5 * 3600000)
  const priorEnd = Date.parse(`${options.window.firstDay}T00:00:00Z`) - millisecondsPerDay
  const periods: Period[] = [
    { kind: "selected", firstDay: options.window.firstDay, lastDay: options.window.lastDay, expectedDays: options.window.calendarDays },
    ...([30, 90] as const).map(days => ({ kind: `previous_${days}` as PeriodKind,
      firstDay: date(new Date(priorEnd - (days - 1) * millisecondsPerDay)), lastDay: date(new Date(priorEnd)), expectedDays: days })),
  ]
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    yield* sql.unsafe("SET LOCAL statement_timeout='25s'")
    // Current-day logs are reported separately below. Never mix an unfinished
    // calendar day into the completed-day trophy distribution or its baseline.
    const end = new Date(Math.min(+options.window.end, +currentStart))
    const result = yield* sql.unsafe<{ rows: Row[] | null; players: UniquePlayers[] | null }>(`
      WITH observed AS MATERIALIZED (
        SELECT (battle_time-interval '5 hours')::date AS day,player_tag,direction,
          count(*)::integer battles,count(*) FILTER (WHERE stars=3)::integer triples,
          sum(${trophyValue})::integer trophies,
          ARRAY[count(*) FILTER(WHERE stars=0),count(*) FILTER(WHERE stars=1),count(*) FILTER(WHERE stars=2),count(*) FILTER(WHERE stars=3)] star_counts,
          sum(destruction_percentage) destruction_sum,sum(duration_seconds) duration_sum
        FROM battles_ranked WHERE battle_mode=2 AND battle_time>=$1::timestamptz AND battle_time<$2::timestamptz
        GROUP BY 1,player_tag,direction
      ), population AS (
        SELECT day,count(DISTINCT player_tag)::integer players FROM observed GROUP BY day
      ), daily AS (
        SELECT p.day,d.direction,p.players eligible_player_count,
          (p.day::timestamp AT TIME ZONE 'UTC')+interval '5 hours' source_window_start,
          (p.day::timestamp AT TIME ZONE 'UTC')+interval '29 hours' source_window_end,
          count(o.player_tag)::integer observed_player_count,
          count(*) FILTER (WHERE o.battles=8)::integer complete_player_count,
          count(*) FILTER (WHERE o.battles>8)::integer invalid_player_count,
          coalesce(sum(o.battles) FILTER (WHERE o.battles<=8),0)::bigint observed_battle_count,
          coalesce(sum(o.triples) FILTER (WHERE o.battles<=8),0)::bigint observed_triple_count,
          count(*) FILTER (WHERE o.battles=8 AND o.triples=8)::integer perfect_player_count,
          coalesce(sum(o.trophies) FILTER (WHERE o.battles=8),0)::bigint complete_trophy_sum,
          ARRAY[${bucketCounts}] trophy_buckets,
          ARRAY[${starSums}] star_counts,
          coalesce(sum(o.destruction_sum) FILTER(WHERE o.battles<=8),0)::bigint destruction_sum,
          coalesce(sum(o.duration_sum) FILTER(WHERE o.battles<=8),0)::bigint duration_sum
        FROM population p CROSS JOIN (VALUES(1),(2)) d(direction)
        LEFT JOIN observed o ON o.day=p.day AND o.direction=d.direction
        GROUP BY p.day,p.players,d.direction
      ), periods(kind,first_day,last_day) AS (VALUES
        ('selected',$3::date,$4::date),('previous_30',$5::date,$6::date),('previous_90',$7::date,$6::date)
      ), unique_players AS (
        SELECT p.kind,o.direction,count(DISTINCT o.player_tag)::integer players
        FROM periods p JOIN observed o ON o.day BETWEEN p.first_day AND p.last_day
        WHERE o.battles=8 AND o.triples=8 GROUP BY p.kind,o.direction
      )
      SELECT (SELECT jsonb_agg(daily ORDER BY day,direction) FROM daily) AS rows,
        (SELECT jsonb_agg(unique_players) FROM unique_players) AS players`,
    [`${compare?periods[2]!.firstDay:options.window.firstDay}T05:00:00Z`, end.toISOString(), options.window.firstDay, options.window.lastDay,
      periods[1]!.firstDay, periods[1]!.lastDay, periods[2]!.firstDay])
    // Classify selected-window armies after grouping by share code. Expanding
    // every troop for every battle (or for unused comparison windows) is costly.
    let types: ReadonlyArray<{day: string; direction: number; attack_types: number[]}> = []
    if (includeArmyTypes) types = yield* sql.unsafe<{day: string; direction: number; attack_types: number[]}>(`
      WITH ${rawWithArmyTypes("$1", "$2", "$3")}
      SELECT day,direction,ARRAY[
        coalesce(sum(battles) FILTER(WHERE a.kind='air'),0),
        coalesce(sum(battles) FILTER(WHERE a.kind='ground'),0),
        coalesce(sum(battles) FILTER(WHERE a.kind='mixed'),0),
        coalesce(sum(battles) FILTER(WHERE a.kind IS NULL OR a.kind='unknown'),0)] attack_types
      FROM raw JOIN valid_players USING(day,player_tag,direction) LEFT JOIN army_types a USING(share_code) GROUP BY day,direction`,
      [options.window.start.toISOString(),new Date(Math.min(+options.window.end,+now)).toISOString(),JSON.stringify(rankedTroopWeights())])
    const rows = (result[0]?.rows ?? []).map(row => ({ ...row, attack_types: types.find(t => date(t.day)===date(row.day)&&t.direction===row.direction)?.attack_types })), unique = result[0]?.players ?? []
    const periodResults = (compare?periods:periods.slice(0,1)).map(period => {
      const included = rows.filter(row => date(row.day) >= period.firstDay && date(row.day) <= period.lastDay)
      const offense = summarize(included.filter(row => row.direction === 1)), defense = summarize(included.filter(row => row.direction === 2))
      return { ...period, availableDays: included.filter(row => row.direction === 1).length, offense, defense,
        perfectOffensePlayers: unique.find(row => row.kind === period.kind && row.direction === 1)?.players ?? 0,
        perfectedDefensePlayers: unique.find(row => row.kind === period.kind && row.direction === 2)?.players ?? 0 }
    })
    const selected = rows.filter(row => date(row.day) >= options.window.firstDay)
    const items = selected.filter(row => row.direction === 1).map(offense => ({ day: date(offense.day),
      sourceWindowStart: new Date(offense.source_window_start).toISOString(), sourceWindowEnd: new Date(offense.source_window_end).toISOString(),
      offense: summarize([offense]), defense: summarize(selected.filter(row => row.direction === 2 && date(row.day) === date(offense.day))) }))
    const range = yield* sql.unsafe<{ first_day: Date | string | null; last_day: Date | string | null }>(`
      SELECT (min(battle_time)-interval '5 hours')::date first_day,(max(battle_time)-interval '5 hours')::date last_day
      FROM battles_ranked WHERE battle_mode=2 AND battle_time>=$1::timestamptz AND battle_time<$2::timestamptz`,
    [new Date(+currentStart - 90 * millisecondsPerDay).toISOString(), currentStart.toISOString()])
    const availability = range[0]?.first_day && range[0]?.last_day ? { firstDay: date(range[0].first_day), lastDay: date(range[0].last_day) } : undefined
    const partial = yield* sql.unsafe<{ direction: number; players: number | string; battles: number | string; triples: number | string; last_battle: Date | string; star_counts: number[]; destruction: number | string; duration: number | string; attack_types: number[] }>(`
      WITH current_battles AS (
        SELECT *,count(*) OVER(PARTITION BY player_tag,direction) day_battles FROM battles_ranked
        WHERE battle_mode=2 AND battle_time>=$1::timestamptz AND battle_time<$2::timestamptz
      )
      SELECT direction,count(DISTINCT player_tag) players,count(*) battles,count(*) FILTER (WHERE stars=3) triples,max(battle_time) last_battle,
        ARRAY[count(*) FILTER(WHERE stars=0),count(*) FILTER(WHERE stars=1),count(*) FILTER(WHERE stars=2),count(*) FILTER(WHERE stars=3)] star_counts,
        sum(destruction_percentage) destruction,sum(duration_seconds) duration
      FROM current_battles WHERE day_battles<=8 GROUP BY direction`,
    [currentStart.toISOString(), now.toISOString()])
    const side = (direction: number) => {
      const row = partial.find(item => item.direction === direction), battles = number(row?.battles ?? 0), triples = number(row?.triples ?? 0)
      const stars = (row?.star_counts ?? [0,0,0,0]).map(number), typeCounts = (types.find(t => date(t.day)===date(currentStart)&&t.direction===direction)?.attack_types ?? [0,0,0,0]).map(number)
      return { players: number(row?.players ?? 0), battles, triples, tripleRate: battles ? triples / battles : null,
        starCounts: stars, averageStars: battles ? stars.reduce((total,count,index)=>total+count*index,0)/battles : null,
        averageDestruction: battles ? number(row?.destruction ?? 0)/battles : null,
        averageDuration: battles ? number(row?.duration ?? 0)/battles : null,
        ...(includeArmyTypes ? {attackTypes: {air:typeCounts[0]!,ground:typeCounts[1]!,mixed:typeCounts[2]!,unknown:typeCounts[3]!}} : {}) }
    }
    // A historical selection must not acquire today's battles in client totals.
    const includesCurrentDay = options.window.firstDay <= date(currentStart) && options.window.lastDay >= date(currentStart)
    const currentDay = includesCurrentDay && partial.length ? { day: date(currentStart), asOf: new Date(Math.max(...partial.map(row => +new Date(row.last_battle)))).toISOString(), sourceWindowStart: currentStart.toISOString(), offense: side(1), defense: side(2) } : undefined
    return { cohort: "observed" as const, ...(availability ? { availability } : {}), ...(currentDay ? { currentDay } : {}), periods: periodResults, perfectDayContributions: [], items }
  }))
})
