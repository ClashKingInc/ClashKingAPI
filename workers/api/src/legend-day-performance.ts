import { Effect } from "effect"
import { SqlClient } from "effect/sql"

import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { parseLegendDaysQuery } from "./league-analytics-query.js"

const millisecondsPerDay = 86_400_000
const date = (value: Date | string) => new Date(value).toISOString().slice(0, 10)
const number = (value: number | string) => Number(value)
type PeriodKind = "selected" | "previous_30" | "previous_90"
interface Period { kind: PeriodKind; firstDay: string; lastDay: string; expectedDays: number }
interface Row {
  day: Date | string
  direction: number
  source_window_start: Date | string
  source_window_end: Date | string
  eligible_player_count: number
  observed_player_count: number
  complete_player_count: number
  invalid_player_count: number
  observed_battle_count: number | string
  observed_triple_count: number | string
  perfect_player_count: number
  complete_trophy_sum: number | string
  trophy_buckets: number[]
}
const summarize = (rows: readonly Row[]) => {
  const sum = (key: keyof Omit<Row, "day" | "source_window_start" | "source_window_end" | "trophy_buckets">) => rows.reduce((total, row) => total + number(row[key]), 0)
  const eligible = sum("eligible_player_count"), observed = sum("observed_player_count")
  const complete = sum("complete_player_count"), invalid = sum("invalid_player_count")
  const battles = sum("observed_battle_count"), triples = sum("observed_triple_count"), perfect = sum("perfect_player_count")
  return {
    eligiblePlayerDays: eligible, observedPlayerDays: observed, completePlayerDays: complete,
    partialPlayerDays: observed - complete - invalid, missingPlayerDays: eligible - observed,
    invalidPlayerDays: invalid, observedBattles: battles, observedTriples: triples, perfectPlayerDays: perfect,
    tripleRate: battles === 0 ? null : triples / battles,
    perfectDayRate: complete === 0 ? null : perfect / complete,
    meanTrophies: complete === 0 ? null : sum("complete_trophy_sum") / complete,
    buckets: Array.from({ length: 16 }, (_, index) => {
      const playerDays = rows.reduce((total, row) => total + number(row.trophy_buckets[index] ?? 0), 0)
      return { minimum: index * 20, maximum: index === 15 ? 320 : index * 20 + 19,
        playerDays, share: complete === 0 ? null : playerDays / complete }
    }),
  }
}

export const queryLegendDayPerformance = (query: URLSearchParams, now = new Date()) => Effect.gen(function* () {
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
    const rows = yield* sql.unsafe<Row>(`SELECT * FROM legend_day_performance
      WHERE cohort=$1 AND day BETWEEN $2::date AND $3::date ORDER BY day`,
    [options.cohort, periods[2]!.firstDay, options.window.lastDay])
    const unique = yield* sql.unsafe<{ kind: PeriodKind; direction: number; players: number | string; player_days: number | string }>(`
      WITH periods(kind,first_day,last_day) AS (VALUES
        ('selected',$2::date,$3::date),('previous_30',$4::date,$5::date),('previous_90',$6::date,$5::date))
      SELECT p.kind,s.direction,count(DISTINCT r.tag) players,count(*) player_days
      FROM periods p
      JOIN legend_rankings_history r ON r.day BETWEEN p.first_day AND p.last_day
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
      FROM legend_rankings_history WHERE day BETWEEN $1::date AND $2::date AND performance_calculated_at IS NOT NULL
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
    return { cohort: options.cohort, periods: periodResults,
      perfectDayContributions: (["1_200", "201_1000", "1001_plus"] as const).map((rankBand) => {
        const row = bands.find((value) => value.rank_band === rankBand)
        return { rankBand, offensePlayerDays: number(row?.offense ?? 0), defensePlayerDays: number(row?.defense ?? 0) }
      }), items }
  }))
}).pipe(Effect.mapError((cause) => cause instanceof InvalidRequest ? cause : new DatabaseFailure({ cause, message: "Legend-day performance query failed" })))
