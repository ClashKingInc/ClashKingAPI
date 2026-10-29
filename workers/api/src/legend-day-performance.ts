import { Effect } from "effect"
import { SqlClient } from "effect/sql"

import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { parseLegendDaysQuery } from "./league-analytics-query.js"

import { date, number, millisecondsPerDay, summarize, type Row, type Period, type PeriodKind } from "./legend-performance-summary.js"
import { queryObservedLegendDayPerformance } from "./legend-performance-observed.js"

export const queryLegendDayPerformance = (query: URLSearchParams, now = new Date()) => Effect.gen(function* () {
  if (query.get("cohort") === "observed") return yield* queryObservedLegendDayPerformance(query, now)
  const options = yield* parseLegendDaysQuery(query, now)
  const sql = yield* SqlClient.SqlClient
  const priorEnd = new Date(`${options.window.firstDay}T00:00:00Z`).valueOf() - millisecondsPerDay
  const periods: Period[] = [
    { kind: "selected", firstDay: options.window.firstDay, lastDay: options.window.lastDay, expectedDays: options.window.calendarDays },
    ...([30, 90] as const).map((days) => ({ kind: `previous_${days}` as PeriodKind,
      firstDay: date(new Date(priorEnd - (days - 1) * millisecondsPerDay)), lastDay: date(new Date(priorEnd)), expectedDays: days })),
  ]
  return yield* sql.withTransaction(Effect.gen(function* () {
    // A rebuild updates player observations and rollups in one transaction.
    // Keep every response query on the same snapshot to preserve that pairing.
    yield* sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    // Never mix old 05:10 closeouts with corrected 05:00 days. They become
    // available here only after the existing bounded rebuild recalculates them.
    const rows = yield* sql.unsafe<Row>(`SELECT * FROM legend_day_performance
      WHERE cohort=$1 AND day BETWEEN $2::date AND $3::date
        AND source_window_start=(day::timestamp AT TIME ZONE 'UTC') + interval '5 hours'
        AND source_window_end=source_window_start + interval '24 hours'
      ORDER BY day`,
    [options.cohort, periods[2]!.firstDay, options.window.lastDay])
    // Advertise only completed, matching offense/defense summaries for this
    // cohort. Historic 05:10 rows and empty cohort placeholders are not data a
    // "latest available" action should navigate to.
    const availabilityRows = yield* sql.unsafe<{ first_day: Date | string | null; last_day: Date | string | null }>(`
      SELECT min(day) first_day,max(day) last_day FROM (
        SELECT day FROM legend_day_performance
        WHERE cohort=$1
          AND source_window_start=(day::timestamp AT TIME ZONE 'UTC') + interval '5 hours'
          AND source_window_end=source_window_start + interval '24 hours'
          AND source_window_end<=$2::timestamptz
        GROUP BY day HAVING count(*)=2 AND min(eligible_player_count)>0
      ) valid_days`, [options.cohort, now.toISOString()])
    const availability = availabilityRows[0]?.first_day && availabilityRows[0]?.last_day
      ? { firstDay: date(availabilityRows[0].first_day), lastDay: date(availabilityRows[0].last_day) }
      : undefined
    const unique = yield* sql.unsafe<{ kind: PeriodKind; direction: number; players: number | string; player_days: number | string }>(`
      WITH valid_days AS (
        SELECT day FROM legend_day_performance WHERE cohort=$1
          AND source_window_start=(day::timestamp AT TIME ZONE 'UTC') + interval '5 hours'
          AND source_window_end=source_window_start + interval '24 hours'
        GROUP BY day HAVING count(*)=2
      ), periods(kind,first_day,last_day) AS (VALUES
        ('selected',$2::date,$3::date),('previous_30',$4::date,$5::date),('previous_90',$6::date,$5::date))
      SELECT p.kind,s.direction,count(DISTINCT r.tag) players,count(*) player_days
      FROM periods p
      JOIN legend_rankings_history r ON r.day BETWEEN p.first_day AND p.last_day
      JOIN valid_days v ON v.day=r.day
      CROSS JOIN LATERAL (VALUES
        (1,r.observed_attack_count,r.observed_attack_triples),
        (2,r.observed_defense_count,r.observed_defense_triples)
      ) s(direction,battles,triples)
      WHERE r.performance_calculated_at IS NOT NULL AND s.battles=8 AND s.triples=8
        AND ($1='legend_i' OR $1='top_1000' AND r.global_rank<=1000 OR $1='top_200' AND r.global_rank<=200)
      GROUP BY p.kind,s.direction`, [options.cohort, options.window.firstDay, options.window.lastDay,
      periods[1]!.firstDay, periods[1]!.lastDay, periods[2]!.firstDay])
    const bands = yield* sql.unsafe<{ rank_band: "1_200" | "201_1000" | "1001_plus"; offense: number | string; defense: number | string }>(`
      SELECT CASE WHEN global_rank<=200 THEN '1_200' WHEN global_rank<=1000 THEN '201_1000' ELSE '1001_plus' END rank_band,
        count(*) FILTER (WHERE observed_attack_count=8 AND observed_attack_triples=8) offense,
        count(*) FILTER (WHERE observed_defense_count=8 AND observed_defense_triples=8) defense
      FROM legend_rankings_history r WHERE day BETWEEN $1::date AND $2::date AND performance_calculated_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM legend_day_performance p WHERE p.day=r.day AND p.cohort='legend_i'
          AND p.source_window_start=(p.day::timestamp AT TIME ZONE 'UTC') + interval '5 hours')
      GROUP BY rank_band`, [options.window.firstDay, options.window.lastDay])
    const periodResults = periods.map((period) => {
      const selected = rows.filter((row) => date(row.day) >= period.firstDay && date(row.day) <= period.lastDay)
      const offenseRows = selected.filter((row) => row.direction === 1), defenseRows = selected.filter((row) => row.direction === 2)
      const offense = summarize(offenseRows), defense = summarize(defenseRows)
      // Missing retained observations must not silently masquerade as a valid
      // distinct-player total, even when daily rollups remain available.
      const players = (direction: number, perfect: number) => {
        const value = unique.find((row) => row.kind === period.kind && row.direction === direction)
        return number(value?.player_days ?? 0) === perfect ? number(value?.players ?? 0) : null
      }
      return { ...period, availableDays: selected.filter((row) => row.direction === 1
        && defenseRows.some((other) => date(other.day) === date(row.day))).length,
      offense, defense, perfectOffensePlayers: players(1, offense.perfectPlayerDays), perfectedDefensePlayers: players(2, defense.perfectPlayerDays) }
    })
    const selected = rows.filter((row) => date(row.day) >= options.window.firstDay)
    const items = selected.filter((row) => row.direction === 1).flatMap((offense) => {
      const defense = selected.find((row) => row.direction === 2 && date(row.day) === date(offense.day))
      return defense ? [{ day: date(offense.day), sourceWindowStart: new Date(offense.source_window_start).toISOString(),
        sourceWindowEnd: new Date(offense.source_window_end).toISOString(), offense: summarize([offense]), defense: summarize([defense]) }] : []
    })
    return { cohort: options.cohort, ...(availability ? { availability } : {}), periods: periodResults,
      perfectDayContributions: (["1_200", "201_1000", "1001_plus"] as const).map((rankBand) => {
        const row = bands.find((value) => value.rank_band === rankBand)
        return { rankBand, offensePlayerDays: number(row?.offense ?? 0), defensePlayerDays: number(row?.defense ?? 0) }
      }), items }
  }))
}).pipe(Effect.mapError((cause) => cause instanceof InvalidRequest ? cause : new DatabaseFailure({ cause, message: "Legend-day performance query failed" })))
