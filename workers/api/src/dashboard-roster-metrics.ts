import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DashboardRosterViewSpec, DashboardRosterViewResultRow } from "@clashking/api-contracts"

import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { forEachArchiveWar, forEachPlayerWar } from "./war-archive.js"
import { archiveAttackFacts } from "./war-archive-model.js"
import { validRosterQuestionId } from "./roster-questionnaire.js"
import { queryRosterCwlPerformance } from "./roster-cwl-performance.js"
import { WorkerEnvironment } from "./environment.js"
import { calculateRosterHeroPercent, lookupStaticItem, maxLevelAtTownHall, prepareStaticMetadata, rosterHeroNames } from "./static-metadata.js"

type Spec = typeof DashboardRosterViewSpec.Type
type Row = typeof DashboardRosterViewResultRow.Type
type JsonValue = typeof Schema.Json.Type

export const rosterSnapshotMetricKeys: Readonly<Record<string, string>> = {
  "player.name": "playerName", "player.tag": "playerTag", "clan.name": "clanName", "clan.tag": "clanTag",
  "player.townhall": "townhall", "player.trophies": "trophies", "player.league": "leagueName",
  "player.heroes": "heroLevelSum", "player.max_percent": "maxPercent", "player.war_preference": "warPreference",
  "discord.username": "discordUsername",
}

export const normalizeRosterMetricParameters = (metricId: string, parameters: Readonly<Record<string, JsonValue>> = {}) => {
  const normalized: Record<string, JsonValue> = {}
  if (metricId === "cwl.performance_history") {
    const count = parameters.seasonCount ?? 6
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 24)
      throw new Error("seasonCount must be between 1 and 24")
    if (parameters.windowDays !== undefined || parameters.warCount !== undefined || parameters.warType !== undefined)
      throw new Error("CWL performance uses participating seasons, not a war count or calendar window")
    return { seasonCount: count }
  }
  let window = ["war.missed_attacks", "war.participation", "war.hit_rate_confidence", "war.hit_rate", "war.hit_rate.30d", "war.regular_hit_rate", "war.cwl_hit_rate", "benchmark.th_hit_rate", "benchmark.th_hit_rate_delta", "benchmark.th_hit_rate_delta.30d"].includes(metricId)
    ? 30 : ["trophies.delta", "trophies.delta.7d"].includes(metricId) ? 7 : 0
  if (typeof parameters.windowDays === "number" && parameters.windowDays >= 1 && parameters.windowDays <= 365) window = Math.trunc(parameters.windowDays)
  if (window > 0) normalized.windowDays = window
  if (typeof parameters.seasonOffset === "number" && parameters.seasonOffset >= 0 && parameters.seasonOffset <= 24) normalized.seasonOffset = Math.trunc(parameters.seasonOffset)
  if (typeof parameters.warCount === "number") {
    if (!Number.isInteger(parameters.warCount) || parameters.warCount < 1 || parameters.warCount > 500) throw new Error("warCount must be an integer between 1 and 500")
    normalized.warCount = parameters.warCount
    if (parameters.windowDays === undefined) delete normalized.windowDays
  }
  if (typeof parameters.warType === "string") {
    if (!["random", "cwl", "friendly", "all"].includes(parameters.warType)) throw new Error("Invalid warType")
    normalized.warType = parameters.warType
  }
  if (typeof parameters.questionId === "string") normalized.questionId = parameters.questionId
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
  attackCounts?: Map<string, number>,
) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const normalized = yield* Effect.try({ try: () => normalizeRosterMetricParameters(metricId, parameters),
    catch: () => new InvalidRequest({ message: "Invalid roster metric parameters" }) })
  if (["war.missed_attacks", "war.participation", "war.hit_rate_confidence", "war.regular_hit_rate", "war.cwl_hit_rate", "benchmark.th_hit_rate", "player.hero_percent", "player.hero_rushed_percent", "player.last_online", "cwl.league_history"].includes(metricId)
    || metricId === "cwl.performance_history" || normalized.warCount !== undefined || normalized.warType !== undefined) {
    return yield* queryRosterAnalysisMetric(rosterId, metricId, normalized, now, attackCounts)
  }
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
  const members = yield* sql<{ readonly tag: string; readonly townhall: number }>`SELECT tag, townhall FROM roster_members WHERE roster_id = ${rosterId}::uuid`.pipe(
    Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to load roster metric members" })),
  )
  const cwl = metricId === "cwl.stars" || metricId === "cwl.stars.current"
  const end = cwl ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1 - (Number(normalized.seasonOffset ?? 0)), 1)) : now
  const start = cwl ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Number(normalized.windowDays ?? 30) * 86_400_000)
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
  for (const { tag, townhall } of members) {
    const player = players.get(tag)
    attackCounts?.set(tag, player?.attacks ?? 0)
    if (player === undefined) { values.set(tag, null); continue }
    if (cwl) { values.set(tag, player.stars); continue }
    const rate = 100 * player.triples / player.attacks
    if (benchmarks !== undefined) {
      const baseline = benchmarks.get(townhall)
      values.set(tag, baseline === undefined || baseline.attacks === 0 ? null : rate - 100 * baseline.triples / baseline.attacks)
    } else values.set(tag, rate)
  }
  return values
})

/** Latest-N selection is per player and filters war type before ranking. Missing attacks stay null. */
const queryRosterAnalysisMetric = (
  rosterId: string, metricId: string, parameters: Readonly<Record<string, JsonValue>>, now: Date,
  attackCounts?: Map<string, number>,
) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const members = yield* sql<{ tag: string; townhall: number }>`SELECT tag, townhall FROM roster_members WHERE roster_id = ${rosterId}::uuid`
    .pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to load roster analysis members" })))
  const values = new Map<string, JsonValue>(members.map(({ tag }) => [tag, null]))
  if (!members.length) return values
  if (metricId === "player.last_online") {
    const rows = yield* sql<{ tag: string; last_online: Date | string | null }>`
      SELECT member.tag, GREATEST(member.last_online, max(event.seen_at)) AS last_online
      FROM roster_members member LEFT JOIN player_online_events event ON event.tag = member.tag
      WHERE member.roster_id = ${rosterId}::uuid GROUP BY member.tag, member.last_online
    `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to query last observed roster activity" })))
    for (const row of rows) values.set(row.tag, row.last_online === null ? null : new Date(row.last_online).toISOString())
    return values
  }
  if (metricId === "player.hero_percent" || metricId === "player.hero_rushed_percent") {
    yield* prepareStaticMetadata(yield* WorkerEnvironment, ["heroes"])
    const rows = yield* sql<{ tag: string; townhall: number; profile_townhall: number | null; heroes: unknown; hero_level_sum: number; refreshed_at: Date | string | null }>`
      SELECT member.tag, member.townhall, profile.townhall_level AS profile_townhall, profile.heroes, member.hero_level_sum, member.refreshed_at
      FROM roster_members member LEFT JOIN player_profile_details profile ON profile.player_tag = member.tag
      WHERE member.roster_id = ${rosterId}::uuid
    `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to query roster hero progress" })))
    const heroes = Schema.Array(Schema.Struct({ name: Schema.String, level: Schema.Number, village: Schema.optionalKey(Schema.String) }))
    for (const row of rows) {
      if (row.heroes === null) {
        // Refreshed roster snapshots retain the authoritative home-village hero total even when a historical import has no profile details.
        if (row.refreshed_at === null || !Number.isFinite(row.hero_level_sum) || !Number.isInteger(row.townhall)) continue
        const maximum = rosterHeroNames().reduce((sum, name) => sum + maxLevelAtTownHall("heroes", name, row.townhall), 0)
        if (maximum > 0) {
          const percent = Math.max(0, Math.min(100, 100 * row.hero_level_sum / maximum))
          values.set(row.tag, metricId === "player.hero_percent" ? percent : 100 - percent)
        }
        continue
      }
      if (!Number.isInteger(row.profile_townhall)) continue
      const units = yield* Schema.decodeUnknownEffect(heroes)(row.heroes).pipe(
        Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Invalid stored roster hero levels" })))
      const percent = calculateRosterHeroPercent(row.profile_townhall!, units)
      if (percent !== undefined) values.set(row.tag, metricId === "player.hero_percent" ? percent : 100 - percent)
    }
    return values
  }
  if (metricId === "cwl.league_history") {
    yield* prepareStaticMetadata(yield* WorkerEnvironment, ["war_leagues"])
    const rows = yield* sql<{ tag: string; season: string; clan_tag: string; league_id: number | null }>`
      SELECT DISTINCT member.tag, league.season, squad.clan_tag, league.cwl_league_id AS league_id
      FROM roster_members member JOIN cwl_group_members squad ON squad.tag = member.tag
      JOIN cwl_groups league ON league.cwl_id = squad.cwl_id
      WHERE member.roster_id = ${rosterId}::uuid ORDER BY member.tag, league.season DESC, squad.clan_tag
    `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to query roster CWL league history" })))
    for (const member of members) values.set(member.tag, [])
    for (const row of rows) {
      const entries = values.get(row.tag) as JsonValue[]
      entries.push({ season: row.season, clanTag: row.clan_tag, leagueId: row.league_id,
        leagueName: row.league_id === null ? null : lookupStaticItem("war_leagues", row.league_id)?.name ?? null,
        evidence: "registered_squad" })
    }
    return values
  }
  return yield* queryPlayerWarMetric(members, metricId, parameters, now, attackCounts)
})

/** Shared archive calculation; callers must authorize the player set first.
 * Family discovery does not require inserting players into a temporary roster. */
export const queryPlayerWarMetric = (
  members: readonly { tag: string; townhall: number }[], metricId: string,
  parameters: Readonly<Record<string, JsonValue>>, now = new Date(), attackCounts?: Map<string, number>,
) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const values = new Map<string, JsonValue>(members.map(({ tag }) => [tag, null]))
  if (!members.length) return values
  if (metricId === "cwl.performance_history") {
    const history = yield* queryRosterCwlPerformance(members.map(member => member.tag), Number(parameters.seasonCount ?? 6), now)
    for (const [tag, value] of history) { values.set(tag, value); attackCounts?.set(tag, value.summary.attacks) }
    return values
  }
  const windowDays = Number(parameters.windowDays ?? 30)
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - windowDays * 86_400_000)
  if (metricId === "benchmark.th_hit_rate") {
    const benchmarks = yield* townhallBenchmarks(sql, start, now)
    for (const member of members) {
      const baseline = benchmarks.get(member.townhall)
      values.set(member.tag, baseline && baseline.attacks > 0 ? 100 * baseline.triples / baseline.attacks : null)
      attackCounts?.set(member.tag, baseline?.attacks ?? 0)
    }
    return values
  }
  const warType = metricId === "war.regular_hit_rate" || metricId.startsWith("benchmark.") ? "random"
    : metricId === "war.cwl_hit_rate" || metricId.startsWith("cwl.") ? "cwl" : String(parameters.warType ?? "all")
  const totals = new Map<string, WarTotal>()
  const participation = new Map<string, { wars: number; expectedAttacks: number; unknownAllowance: boolean }>()
  const wanted = new Set(members.map(({ tag }) => tag))
  const warCount = parameters.warCount === undefined ? undefined : Number(parameters.warCount)
  const selected = new Map<string, Set<string>>()
  const consume = (id: string, war: Parameters<typeof archiveAttackFacts>[1]) => Effect.sync(() => {
    if (warType !== "all" && war.type !== warType || !["warended", "ended"].includes(war.state.toLowerCase())) return
    for (const member of [...war.clan.members, ...war.opponent.members]) {
      if (!wanted.has(member.tag) || warCount !== undefined && !selected.get(member.tag)?.has(id)) continue
      const allowance = war.type === "cwl" ? 1 : Number.isInteger(war.attacksPerMember) && war.attacksPerMember > 0 ? war.attacksPerMember : null
      const current = participation.get(member.tag) ?? { wars: 0, expectedAttacks: 0, unknownAllowance: false }
      current.wars += 1
      current.expectedAttacks += allowance ?? 0
      current.unknownAllowance ||= allowance === null
      participation.set(member.tag, current)
    }
    for (const attack of archiveAttackFacts(id, war)) {
      if (!wanted.has(attack.attackerTag) || warCount !== undefined && !selected.get(attack.attackerTag)?.has(id)) continue
      const total = totals.get(attack.attackerTag) ?? { attacks: 0, triples: 0, stars: 0, townhall: attack.attackerTownhall }
      total.attacks++; total.triples += attack.stars === 3 ? 1 : 0; total.stars += attack.stars
      totals.set(attack.attackerTag, total)
    }
  })
  if (warCount !== undefined) {
    const from = parameters.windowDays === undefined ? new Date(0) : start
    const rows = yield* sql<{ player_tag: string; war_id: number | string }>`
      WITH observed AS (
        SELECT DISTINCT history.player_tag, war.war_id, war.end_time
        FROM player_war_history history CROSS JOIN LATERAL unnest(history.war_ids) history_id
        JOIN wars war ON war.war_id = history_id
        WHERE history.player_tag = ANY(${[...wanted]}::text[]) AND war.end_time >= ${from} AND war.end_time <= ${now}
          AND lower(war.state) IN ('warended', 'ended') AND (${warType} = 'all' OR war.war_type = ${warType})
      ), ranked AS (
        SELECT player_tag, war_id, row_number() OVER (PARTITION BY player_tag ORDER BY end_time DESC, war_id DESC) AS position FROM observed
      ) SELECT player_tag, war_id FROM ranked WHERE position <= ${warCount} ORDER BY player_tag, position
    `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to select latest roster wars" })))
    for (const row of rows) {
      const ids = selected.get(row.player_tag) ?? new Set<string>(); ids.add(String(row.war_id)); selected.set(row.player_tag, ids)
    }
    yield* forEachArchiveWar(rows.map(row => String(row.war_id)), consume)
  } else yield* forEachPlayerWar([...wanted], start, now, consume)
  const benchmarks = metricId.startsWith("benchmark.") ? yield* townhallBenchmarks(sql, start, now) : undefined
  for (const member of members) {
    const total = totals.get(member.tag)
    attackCounts?.set(member.tag, total?.attacks ?? 0)
    if (["war.missed_attacks", "war.participation", "war.hit_rate_confidence"].includes(metricId)) {
      const sample = participation.get(member.tag)
      if (!sample) continue
      const attacks = total?.attacks ?? 0
      const expected = sample.unknownAllowance ? null : sample.expectedAttacks
      const missed = expected === null ? null : Math.max(0, expected - attacks)
      if (metricId === "war.missed_attacks") { values.set(member.tag, missed); continue }
      if (metricId === "war.participation") {
        values.set(member.tag, { completedWars: sample.wars, attacks, expectedAttacks: expected, missedAttacks: missed,
          completionPercent: expected ? 100 * Math.min(attacks, expected) / expected : null })
        continue
      }
      const triples = total?.triples ?? 0
      const p = attacks ? triples / attacks : null
      const denominator = 1 + 1.96 ** 2 / Math.max(1, attacks)
      const center = p === null ? null : (p + 1.96 ** 2 / (2 * attacks)) / denominator
      const margin = p === null ? null : 1.96 * Math.sqrt(p * (1 - p) / attacks + 1.96 ** 2 / (4 * attacks ** 2)) / denominator
      values.set(member.tag, { attacks, triples, completedWars: sample.wars,
        ratePercent: p === null ? null : p * 100,
        wilson95LowPercent: center === null || margin === null ? null : Math.max(0, 100 * (center - margin)),
        wilson95HighPercent: center === null || margin === null ? null : Math.min(100, 100 * (center + margin)),
      })
      continue
    }
    if (!total || total.attacks === 0) continue
    const rate = 100 * total.triples / total.attacks
    if (metricId.startsWith("cwl.stars")) values.set(member.tag, total.stars)
    else if (benchmarks) {
      const baseline = benchmarks.get(member.townhall)
      values.set(member.tag, baseline && baseline.attacks > 0 ? rate - 100 * baseline.triples / baseline.attacks : null)
    } else values.set(member.tag, rate)
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
    if (column.metricId === "signup.answer" && (typeof column.parameters?.questionId !== "string" || !validRosterQuestionId(column.parameters.questionId))) return yield* new InvalidRequest({ message: "signup.answer columns require a valid questionId parameter" })
  }
  if ((spec.sort ?? []).some((item) => !ids.has(item.columnId))) return yield* new InvalidRequest({ message: "Invalid roster view sort" })
  if ((spec.filters ?? []).some((item) => !ids.has(item.columnId))) return yield* new InvalidRequest({ message: "Invalid roster view filter" })
  const highlights = spec.highlights ?? []
  if (highlights.length > 20 || new Set(highlights.map((item) => item.id)).size !== highlights.length) return yield* new InvalidRequest({ message: "Roster views support at most 20 unique highlight rules" })
  for (const item of highlights) {
    if (item.gradient) {
      const { columnId, min, max, from, to } = item.gradient
      if (!ids.has(columnId)) return yield* new InvalidRequest({ message: `Gradient "${item.id}" references unknown column "${columnId}"; available: ${[...ids].join(", ")}` })
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return yield* new InvalidRequest({ message: `Gradient "${item.id}" requires finite min < max` })
      if (![from, to].every((color) => /^#[0-9a-f]{6}$/iu.test(color))) return yield* new InvalidRequest({ message: `Gradient "${item.id}" requires six-digit hex colors for from and to` })
    }
    if (!validId(item.id)) return yield* new InvalidRequest({ message: `Highlight ID "${item.id}" must start with a lowercase letter and contain only lowercase letters, digits, or underscores (up to 48 characters)` })
    if ((item.target === "column" || item.target === "cell") && !ids.has(item.columnId ?? "")) return yield* new InvalidRequest({ message: `Highlight "${item.id}" requires columnId to match a view column ID. Received "${item.columnId ?? ""}"; available: ${[...ids].join(", ")}` })
    if (item.when?.columnId !== undefined && item.when.columnId !== "" && !ids.has(item.when.columnId)) return yield* new InvalidRequest({ message: `Highlight "${item.id}" condition references unknown column "${item.when.columnId}". Use a view column ID, not a metric ID; available: ${[...ids].join(", ")}` })
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
