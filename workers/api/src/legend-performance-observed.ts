import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { InvalidRequest } from "./errors.js"
import { parseLegendDaysQuery } from "./league-analytics-query.js"
import { date, millisecondsPerDay, number, summarize, type Row, type Period, type PeriodKind } from "./legend-performance-summary.js"

interface UniquePlayers { kind: PeriodKind; direction: number; players: number }
const trophyValue = `CASE WHEN stars=3 THEN 40
  WHEN stars=2 THEN 16+least(16,greatest(0,floor((destruction_percentage-50)/3.0)::integer))
  WHEN stars=1 THEN 5+least(10,greatest(0,floor((destruction_percentage-1)/9.0)::integer))
  ELSE least(4,floor(destruction_percentage/10.0)::integer) END`
const bucketCounts = Array.from({ length: 16 }, (_, index) => `count(*) FILTER (WHERE o.battles=8 AND least(o.trophies/20,15)=${index})::integer`).join(",")

/** This population is every player observed in Legend logs, never a guessed ranking cohort. */
export const queryObservedLegendDayPerformance = (query: URLSearchParams, now: Date) => Effect.gen(function* () {
  if (query.getAll("cohort").length !== 1) return yield* Effect.fail(new InvalidRequest({ message: "cohort may be supplied only once" }))
  const base = new URLSearchParams(query); base.set("cohort", "legend_i")
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
          sum(${trophyValue})::integer trophies
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
          ARRAY[${bucketCounts}] trophy_buckets
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
    [`${periods[2]!.firstDay}T05:00:00Z`, end.toISOString(), options.window.firstDay, options.window.lastDay,
      periods[1]!.firstDay, periods[1]!.lastDay, periods[2]!.firstDay])
    const rows = result[0]?.rows ?? [], unique = result[0]?.players ?? []
    const periodResults = periods.map(period => {
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
    const partial = yield* sql.unsafe<{ direction: number; players: number | string; battles: number | string; triples: number | string; last_battle: Date | string }>(`
      SELECT direction,count(DISTINCT player_tag) players,count(*) battles,count(*) FILTER (WHERE stars=3) triples,max(battle_time) last_battle
      FROM battles_ranked WHERE battle_mode=2 AND battle_time>=$1::timestamptz AND battle_time<=$2::timestamptz GROUP BY direction`,
    [currentStart.toISOString(), now.toISOString()])
    const side = (direction: number) => {
      const row = partial.find(item => item.direction === direction), battles = number(row?.battles ?? 0), triples = number(row?.triples ?? 0)
      return { players: number(row?.players ?? 0), battles, triples, tripleRate: battles ? triples / battles : null }
    }
    // A historical selection must not acquire today's battles in client totals.
    const includesCurrentDay = options.window.firstDay <= date(currentStart) && options.window.lastDay >= date(currentStart)
    const currentDay = includesCurrentDay && partial.length ? { day: date(currentStart), asOf: new Date(Math.max(...partial.map(row => +new Date(row.last_battle)))).toISOString(), sourceWindowStart: currentStart.toISOString(), offense: side(1), defense: side(2) } : undefined
    return { cohort: "observed" as const, ...(availability ? { availability } : {}), ...(currentDay ? { currentDay } : {}), periods: periodResults, perfectDayContributions: [], items }
  }))
})
