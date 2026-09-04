import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DashboardRosterViewSpec, DashboardRosterViewResultRow } from "@clashking/api-contracts"

import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { forEachPlayerWar } from "./war-archive.js"
import { archiveAttackFacts } from "./war-archive-model.js"

type Spec = typeof DashboardRosterViewSpec.Type
type Row = typeof DashboardRosterViewResultRow.Type
type JsonValue = typeof Schema.Json.Type

export const rosterSnapshotMetricKeys: Readonly<Record<string, string>> = {
  "player.name": "playerName", "player.tag": "playerTag", "clan.name": "clanName", "clan.tag": "clanTag",
  "player.townhall": "townhall", "player.trophies": "trophies", "player.league": "leagueName",
  "player.heroes": "heroLevelSum", "player.max_percent": "maxPercent", "player.war_preference": "warPreference",
  "discord.username": "discordUsername", "player.last_online": "lastOnline",
}

export const normalizeRosterMetricParameters = (metricId: string, parameters: Readonly<Record<string, JsonValue>> = {}) => {
  const normalized: Record<string, number> = {}
  let window = ["war.hit_rate", "war.hit_rate.30d", "benchmark.th_hit_rate_delta", "benchmark.th_hit_rate_delta.30d"].includes(metricId)
    ? 30 : ["trophies.delta", "trophies.delta.7d"].includes(metricId) ? 7 : 0
  if (typeof parameters.windowDays === "number" && parameters.windowDays >= 1 && parameters.windowDays <= 365) window = Math.trunc(parameters.windowDays)
  if (window > 0) normalized.windowDays = window
  if (typeof parameters.seasonOffset === "number" && parameters.seasonOffset >= 0 && parameters.seasonOffset <= 24) normalized.seasonOffset = Math.trunc(parameters.seasonOffset)
  return normalized
}

interface WarTotal { attacks: number; triples: number; stars: number; townhall: number }
const townhallBenchmarks = (sql: SqlClient.SqlClient, start: Date, end: Date) => Effect.gen(function* () {
  // Tracking persists regular-only matchup aggregates. A single statement sees
  // either the pending row or its atomically finalized pack, never a gap between
  // two READ COMMITTED snapshots, and returns only one row per Town Hall.
  const rows = yield* sql<{ readonly townhall: number; readonly attacks: string; readonly triples: string }>`
    WITH packed AS (
      SELECT split_part(matchup.key, ':', 1)::integer AS townhall,
        sum((matchup.value->>'attacks')::bigint) AS attacks,
        sum((matchup.value#>>'{threeStars,attacks}')::bigint) AS triples
      FROM war_archive_packs pack
      CROSS JOIN LATERAL jsonb_each(COALESCE(pack.stats->'byDay', '{}'::jsonb)) day
      CROSS JOIN LATERAL jsonb_each(COALESCE(day.value->'regularHitRates', '{}'::jsonb)) matchup
      WHERE pack.status = 'uploaded' AND pack.last_end_time >= ${start} AND pack.first_end_time <= ${end}
        AND day.key::date::timestamp AT TIME ZONE 'UTC' >= ${start}
        AND day.key::date::timestamp AT TIME ZONE 'UTC' <= ${end}
      GROUP BY split_part(matchup.key, ':', 1)::integer
    ), pending AS (
      SELECT COALESCE((member.value->>'townhallLevel')::integer, 0) AS townhall,
        count(*) AS attacks, count(*) FILTER (WHERE (attack.value->>'stars')::integer = 3) AS triples
      FROM war_archive_pending pending
      JOIN wars war ON war.war_id = pending.war_id AND war.end_time = pending.end_time
      CROSS JOIN LATERAL (
        SELECT value FROM jsonb_array_elements(COALESCE(pending.payload#>'{clan,members}', '[]'::jsonb))
        UNION ALL SELECT value FROM jsonb_array_elements(COALESCE(pending.payload#>'{opponent,members}', '[]'::jsonb))
      ) member
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NULLIF(member.value->'attacks', 'null'::jsonb), '[]'::jsonb)) attack
      WHERE pending.end_time >= ${start} AND pending.end_time <= ${end} AND war.war_type = 'random'
      GROUP BY COALESCE((member.value->>'townhallLevel')::integer, 0)
    ) SELECT townhall, sum(attacks)::text AS attacks, sum(triples)::text AS triples
      FROM (SELECT * FROM packed UNION ALL SELECT * FROM pending) totals GROUP BY townhall
  `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to load regular-war roster townhall benchmarks" })))
  return new Map(rows.map((row) => [row.townhall, { attacks: Number(row.attacks), triples: Number(row.triples) }]))
})

/** Current Go recipe semantics: archive attacks include CWL in hit rate, and a
 * missing observation is null rather than zero. No persistent metric cache exists. */
export const queryDynamicRosterMetric = (
  rosterId: string, metricId: string, parameters: Readonly<Record<string, JsonValue>> = {}, now = new Date(),
) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const normalized = normalizeRosterMetricParameters(metricId, parameters)
  if (metricId === "trophies.delta" || metricId === "trophies.delta.7d") {
    const rows = yield* sql<{ readonly tag: string; readonly value: number | string | null }>`
      SELECT m.tag, (array_agg(h.value ORDER BY h.event_time DESC))[1] - (array_agg(h.value ORDER BY h.event_time))[1] AS value
      FROM roster_members m LEFT JOIN player_history_events h ON h.player_tag = m.tag AND h.event_type = 'trophies'
        AND h.event_time >= now() - ${normalized.windowDays ?? 7}::int * interval '1 day'
      WHERE m.roster_id = ${rosterId}::uuid GROUP BY m.tag
    `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to query roster trophy delta" })))
    return new Map(rows.map((row) => [row.tag, row.value === null ? null : Number(row.value)]))
  }
  if (!["war.hit_rate", "war.hit_rate.30d", "cwl.stars", "cwl.stars.current", "benchmark.th_hit_rate_delta", "benchmark.th_hit_rate_delta.30d"].includes(metricId)) {
    return new Map<string, number | null>()
  }
  const members = yield* sql<{ readonly tag: string }>`SELECT tag FROM roster_members WHERE roster_id = ${rosterId}::uuid`.pipe(
    Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to load roster metric members" })),
  )
  const cwl = metricId === "cwl.stars" || metricId === "cwl.stars.current"
  const end = cwl ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1 - (normalized.seasonOffset ?? 0), 1)) : now
  const start = cwl ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1)) : new Date(now.getTime() - (normalized.windowDays ?? 30) * 86_400_000)
  const players = new Map<string, WarTotal>()
  const wanted = new Set(members.map((member) => member.tag))
  const benchmark = metricId.startsWith("benchmark.")
  yield* forEachPlayerWar([...wanted], start, end, (id, war) => Effect.sync(() => {
    if (cwl && war.type !== "cwl" || benchmark && war.type !== "random") return
    for (const attack of archiveAttackFacts(id, war)) {
      if (!wanted.has(attack.attackerTag)) continue
      const current = players.get(attack.attackerTag) ?? { attacks: 0, triples: 0, stars: 0, townhall: attack.attackerTownhall }
      current.attacks += 1
      current.triples += attack.stars === 3 ? 1 : 0
      current.stars += attack.stars
      players.set(attack.attackerTag, current)
    }
  }))
  const benchmarks = benchmark ? yield* townhallBenchmarks(sql, start, end) : undefined
  const values = new Map<string, number | null>()
  for (const { tag } of members) {
    const player = players.get(tag)
    if (player === undefined) { values.set(tag, null); continue }
    if (cwl) { values.set(tag, player.stars); continue }
    const rate = 100 * player.triples / player.attacks
    if (benchmarks !== undefined) {
      const baseline = benchmarks.get(player.townhall)
      values.set(tag, baseline === undefined || baseline.attacks === 0 ? null : rate - 100 * baseline.triples / baseline.attacks)
    } else values.set(tag, rate)
  }
  return values
})

export const validateRosterViewSpec = (spec: Spec, knownMetrics: ReadonlySet<string>) => Effect.gen(function* () {
  const validId = (value: string) => /^[a-z][a-z0-9_]{0,47}$/u.test(value)
  const ids = new Set(spec.columns.map((column) => column.id))
  if (spec.columns.length < 1 || spec.columns.length > 24 || ids.size !== spec.columns.length) return yield* new InvalidRequest({ message: "Roster views require 1 to 24 unique columns" })
  if (spec.limit !== undefined && (!Number.isInteger(spec.limit) || spec.limit < 1 || spec.limit > 500)) return yield* new InvalidRequest({ message: "Roster view limit must be between 1 and 500" })
  for (const column of spec.columns) {
    if (!validId(column.id) || !column.label.trim()) return yield* new InvalidRequest({ message: "Roster columns require stable IDs and labels" })
    if (!knownMetrics.has(column.metricId)) return yield* new InvalidRequest({ message: `Unknown roster metric: ${column.metricId}` })
    if (column.metricId === "signup.answer" && (typeof column.parameters?.questionId !== "string" || !validId(column.parameters.questionId))) return yield* new InvalidRequest({ message: "signup.answer columns require a valid questionId parameter" })
  }
  if ((spec.sort ?? []).some((item) => !ids.has(item.columnId))) return yield* new InvalidRequest({ message: "Invalid roster view sort" })
  if ((spec.filters ?? []).some((item) => !ids.has(item.columnId))) return yield* new InvalidRequest({ message: "Invalid roster view filter" })
  const highlights = spec.highlights ?? []
  if (highlights.length > 20 || new Set(highlights.map((item) => item.id)).size !== highlights.length) return yield* new InvalidRequest({ message: "Roster views support at most 20 unique highlight rules" })
  for (const item of highlights) {
    if (!validId(item.id) || (item.target === "column" || item.target === "cell") && !ids.has(item.columnId ?? "")
      || item.when?.columnId !== undefined && item.when.columnId !== "" && !ids.has(item.when.columnId)) return yield* new InvalidRequest({ message: "Invalid roster highlight identifier or column" })
  }
})

const goText = (value: JsonValue | undefined): string => value === null || value === undefined ? "<nil>"
  : Array.isArray(value) ? `[${value.map(goText).join(" ")}]`
  : typeof value === "object" ? `map[${Object.keys(value).sort().map((key) => `${key}:${goText((value as Readonly<Record<string, JsonValue>>)[key])}`).join(" ")}]` : String(value)

export const compareRosterValues = (left: JsonValue | undefined, right: JsonValue | undefined): number => {
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  if (typeof left === "number" && typeof right === "number") return left < right ? -1 : left > right ? 1 : 0
  const a = goText(left).toLowerCase(), b = goText(right).toLowerCase()
  return a < b ? -1 : a > b ? 1 : 0
}

const matchesFilter = (actual: JsonValue | undefined, operator: string, expected: JsonValue) => {
  const comparison = compareRosterValues(actual, expected)
  switch (operator) {
    case "eq": return comparison === 0
    case "neq": return comparison !== 0
    case "gt": return comparison > 0
    case "gte": return comparison >= 0
    case "lt": return comparison < 0
    case "lte": return comparison <= 0
    case "in": return Array.isArray(expected) && expected.some((value) => compareRosterValues(actual, value) === 0)
    case "contains": return goText(actual).toLowerCase().includes(goText(expected).toLowerCase())
    default: return false
  }
}

export const presentRosterView = (rows: readonly Row[], spec: Spec): Row[] => {
  const sorted = rows.filter((row) => (spec.filters ?? []).every((filter) => matchesFilter(row.values[filter.columnId], filter.operator, filter.value)))
    .sort((left, right) => {
      for (const item of spec.sort ?? []) {
        const comparison = compareRosterValues(left.values[item.columnId], right.values[item.columnId])
        if (comparison !== 0) return item.direction === "desc" ? -comparison : comparison
      }
      return left.playerTag < right.playerTag ? -1 : left.playerTag > right.playerTag ? 1 : 0
    })
  const limited = spec.limit === undefined ? sorted : sorted.slice(0, spec.limit)
  return limited.map((row, index) => ({ ...row, values: {
    ...row.values, ...Object.fromEntries(spec.columns.filter((column) => column.metricId === "view.rank").map((column) => [column.id, index + 1])),
  } }))
}
