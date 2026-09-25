import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { ArmySetupResponse, ArmySetupTimelineResponse, ArmySetupRankHistoryResponse, type ArmySetupStatistics } from "@clashking/api-contracts"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { parseLegendAggregateWindow } from "./league-analytics-query.js"

export const legendOneTierId = 105000036
export const parseSetupQuery = (query: URLSearchParams, now = new Date(), timeline = false) => {
  const allowed = new Set(["time[after]", "time[before]", "leagueTierId", "rankLimit", "groupKey", "variantKey", "sort", "limit"])
  for (const key of query.keys()) {
    if (!allowed.has(key) || query.getAll(key).length !== 1) throw new InvalidRequest({ message: `Invalid parameter: ${key}` })
  }
  const leagueTierId = query.has("leagueTierId") ? Number(query.get("leagueTierId")) : legendOneTierId
  if (leagueTierId !== legendOneTierId) throw new InvalidRequest({ message: "Only Legend League I setup observations are available" })
  const rankLimit = query.has("rankLimit") ? Number(query.get("rankLimit")) : null
  if (rankLimit !== null && rankLimit !== 200 && rankLimit !== 1000) throw new InvalidRequest({ message: "rankLimit must be 200 or 1000; omit for Overall" })
  const groupKey = query.get("groupKey") ?? null, variantKey = query.get("variantKey") ?? null
  if (!timeline && variantKey !== null) throw new InvalidRequest({ message: "variantKey is only supported by the timeline endpoint" })
  if (groupKey !== null && (groupKey.length === 0 || groupKey.length > 256) || variantKey !== null && (variantKey.length === 0 || variantKey.length > 1024))
    throw new InvalidRequest({ message: "Invalid group or variant key" })
  if ((timeline || variantKey !== null) && groupKey === null) throw new InvalidRequest({ message: "groupKey is required" })
  const sort = query.get("sort") ?? "usage", limit = query.has("limit") ? Number(query.get("limit")) : 100
  if (sort !== "usage" && sort !== "tripleRate" || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new InvalidRequest({ message: "Invalid sort or limit" })
  const times = new URLSearchParams([...query].filter(([key]) => key.startsWith("time[")))
  return { leagueTierId, rankLimit, groupKey, variantKey, sort, limit,
    cohort: rankLimit === null ? "legend_i" : `top_${rankLimit}`,
    window: parseLegendAggregateWindow(times, now, { maximumDays: timeline ? 365 : 90, defaultDays: 90 }) }
}
interface TotalRow { day: string; attack_count: number; classified_army_attacks: number; three_star_count: number; cohort: string }
interface ComparisonRow { group_key: string; variant_key: string; cohort: string; attack_count: number; three_star_count: number }
interface SetupRow {
  day: string; group_key: string; variant_key: string; core_troops: number[];
  conditions: (typeof ArmySetupStatistics.Type)["conditions"];
  representative_share_code: string; attack_count: number;
  zero_star_count: number; one_star_count: number; two_star_count: number; three_star_count: number;
  destruction_percentage_sum: number; observed_days: number;
  siege_usage?: { id: number; attacks: number }[];
  siege_usage_days?: { id: number; attacks: number }[][];
}
interface RankRow { day: string; group_key: string; variant_key: string; attack_count: number; daily_rank: number }
const previousDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
const rankIdentity = (row: { day: string; group_key: string; variant_key: string }) => `${row.day}\u0000${row.group_key}\u0000${row.variant_key}`
const rankFields = (row: { day: string; group_key: string; variant_key: string }, ranks: ReadonlyMap<string, RankRow>) => {
  const current = ranks.get(rankIdentity(row))
  const prior = ranks.get(rankIdentity({ ...row, day: previousDay(row.day) }))
  return { dailyRank: current?.daily_rank ?? null, previousDayRank: prior?.daily_rank ?? null,
    rankChange: current && prior ? prior.daily_rank - current.daily_rank : null }
}
const topSieges = (row: SetupRow) => {
  const summed = new Map<number, number>()
  for (const day of row.siege_usage_days ?? [row.siege_usage ?? []]) for (const entry of day) {
    summed.set(Number(entry.id), (summed.get(Number(entry.id)) ?? 0) + Number(entry.attacks))
  }
  return [...summed].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([id, attacks]) => ({
    id, attacks, usageRate: attacks / Number(row.attack_count),
  }))
}
export const setupStatistics = (row: SetupRow, total: number): typeof ArmySetupStatistics.Type => ({
  groupKey: row.group_key, variantKey: row.variant_key, coreTroops: row.core_troops, conditions: row.conditions,
  shareCode: row.representative_share_code, attacks: Number(row.attack_count),
  starCounts: { zero: Number(row.zero_star_count), one: Number(row.one_star_count), two: Number(row.two_star_count), three: Number(row.three_star_count) },
  usageRate: total > 0 ? Number(row.attack_count) / total : null,
  threeStarRate: Number(row.attack_count) > 0 ? Number(row.three_star_count) / Number(row.attack_count) : null,
  averageDestruction: Number(row.attack_count) > 0 ? Number(row.destruction_percentage_sum) / Number(row.attack_count) : null,
  observedDays: Number(row.observed_days),
  sieges: topSieges(row), dailyRank: null, previousDayRank: null, rankChange: null,
})
const queryDailyRanks = (sql: SqlClient.SqlClient, q: ReturnType<typeof parseSetupQuery>, variantScope: boolean) => {
  const order = q.sort === "usage" ? "s.attack_count" : "s.three_star_count::float8 / NULLIF(s.attack_count,0)"
  const selector = variantScope ? "s.group_key=$5 AND s.variant_key<>''" : "s.variant_key=''"
  const values = [previousDay(q.window.firstDay), q.window.lastDay, q.leagueTierId, q.rankLimit, ...(variantScope ? [q.groupKey] : [])]
  return sql.unsafe<RankRow>(`SELECT s.day::text AS day,s.group_key,s.variant_key,s.attack_count,
    row_number() OVER (PARTITION BY s.day ORDER BY ${order} DESC,s.attack_count DESC,s.group_key,s.variant_key)::integer AS daily_rank
    FROM army_setup_daily_stats s JOIN legend_daily_stats d ON d.day=s.day AND d.cohort=$${values.length + 1}
      AND d.classified_army_attacks IS NOT NULL
    WHERE s.day BETWEEN $1::date AND $2::date AND s.league_tier_id=$3
      AND s.rank_limit IS NOT DISTINCT FROM $4::integer AND ${selector}
    ORDER BY s.day,s.group_key,s.variant_key`, [...values, q.cohort])
}
const cohorts = [{ rankLimit: null, name: "legend_i" }, { rankLimit: 1000, name: "top_1000" }, { rankLimit: 200, name: "top_200" }] as const
export const setupComparisons = (row: SetupRow, observations: readonly ComparisonRow[], totals: readonly TotalRow[]) => cohorts.map(cohort => {
  const observation = observations.find(item => item.group_key === row.group_key && item.variant_key === row.variant_key && item.cohort === cohort.name)
  const attacks = Number(observation?.attack_count ?? 0)
  const totalAttacks = totals.filter(item => item.cohort === cohort.name).reduce((sum, item) => sum + Number(item.attack_count), 0)
  return { rankLimit: cohort.rankLimit, attacks, totalAttacks,
    usageRate: observation && totalAttacks > 0 ? attacks / totalAttacks : null,
    threeStarRate: attacks > 0 ? Number(observation?.three_star_count ?? 0) / attacks : null }
})
export const setupBenchmarks = (totals: readonly TotalRow[]) => cohorts.map(cohort => ({
  rankLimit: cohort.rankLimit,
  points: totals.filter(item => item.cohort === cohort.name).map(item => ({
    day: item.day, attacks: Number(item.attack_count),
    threeStarRate: Number(item.attack_count) > 0 ? Number(item.three_star_count) / Number(item.attack_count) : null,
  })),
}))

export const queryArmySetupList = (query: URLSearchParams, now = new Date()) => queryArmySetups(query, now).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(ArmySetupResponse)),
  Effect.mapError(cause => cause instanceof InvalidRequest || cause instanceof DatabaseFailure ? cause : new DatabaseFailure({ cause, message: "Invalid stored army observation" })),
)
export const queryArmySetupTimeline = (query: URLSearchParams, now = new Date()) => queryArmySetups(query, now, true).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(ArmySetupTimelineResponse)),
  Effect.mapError(cause => cause instanceof InvalidRequest || cause instanceof DatabaseFailure ? cause : new DatabaseFailure({ cause, message: "Invalid stored army timeline" })),
)
export const queryArmySetupRankHistory = (query: URLSearchParams, now = new Date()) => Effect.gen(function* () {
  const q = yield* Effect.try({ try: () => parseSetupQuery(query, now, true),
    catch: cause => cause instanceof InvalidRequest ? cause : new InvalidRequest({ message: "Invalid setup rank query" }) })
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const days = yield* sql.unsafe<{ day: string }>(`SELECT day::text AS day FROM legend_daily_stats
      WHERE cohort=$1 AND classified_army_attacks IS NOT NULL AND day BETWEEN $2::date AND $3::date ORDER BY day`,
      [q.cohort, q.window.firstDay, q.window.lastDay])
    const ranks = new Map((yield* queryDailyRanks(sql, q, q.variantKey !== null)).map(row => [rankIdentity(row), row]))
    const variantKey = q.variantKey ?? ""
    return { firstDay: q.window.firstDay, lastDay: q.window.lastDay, leagueTierId: q.leagueTierId,
      rankLimit: q.rankLimit, groupKey: q.groupKey!, variantKey, sort: q.sort,
      points: days.map(({ day }) => {
        const identity = { day, group_key: q.groupKey!, variant_key: variantKey }
        const row = ranks.get(rankIdentity(identity))
        const rank = rankFields(identity, ranks)
        return { day, attacks: row ? Number(row.attack_count) : null, rank: rank.dailyRank,
          previousDayRank: rank.previousDayRank, rankChange: rank.rankChange }
      }) }
  }))
}).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(ArmySetupRankHistoryResponse)),
  Effect.mapError(cause => cause instanceof InvalidRequest || cause instanceof DatabaseFailure ? cause : new DatabaseFailure({ cause, message: "Daily army ranks could not be read" })),
)
export const queryArmySetups = (query: URLSearchParams, now = new Date(), timeline = false) => Effect.gen(function* () {
  const q = yield* Effect.try({ try: () => parseSetupQuery(query, now, timeline),
    catch: cause => cause instanceof InvalidRequest ? cause : new InvalidRequest({ message: "Invalid setup query" }) })
  const sql = yield* SqlClient.SqlClient
  // One read transaction ensures denominator, completion and observations refer
  // to the same atomic daily rebuild, even while a local replay is running.
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const allTotals = yield* sql.unsafe<TotalRow>(`SELECT day::text,cohort,attack_count,three_star_count,classified_army_attacks FROM legend_daily_stats
      WHERE cohort IN ('legend_i','top_1000','top_200') AND day BETWEEN $1::date AND $2::date
      AND classified_army_attacks IS NOT NULL ORDER BY day`, [q.window.firstDay, q.window.lastDay])
    const totals = allTotals.filter(row => row.cohort === q.cohort)
    const coverage = { firstDay: q.window.firstDay, lastDay: q.window.lastDay, leagueTierId: q.leagueTierId, rankLimit: q.rankLimit,
      completedDays: totals.map(row => row.day), totalAttacks: totals.reduce((sum, row) => sum + Number(row.attack_count), 0),
      classifiedAttacks: totals.reduce((sum, row) => sum + Number(row.classified_army_attacks), 0) }
    const rankRows = yield* queryDailyRanks(sql, q, timeline ? q.variantKey !== null : q.groupKey !== null)
    const ranks = new Map(rankRows.map(row => [rankIdentity(row), row]))
    const selector = timeline ? "s.group_key=$6 AND s.variant_key=$7" : q.groupKey === null ? "s.variant_key=''" : "s.group_key=$6 AND s.variant_key<>''"
    const values = [q.window.firstDay, q.window.lastDay, q.leagueTierId, q.rankLimit, q.cohort,
      ...(timeline || q.groupKey !== null ? [q.groupKey] : []), ...(timeline ? [q.variantKey ?? ""] : [])]
    const source = `FROM army_setup_daily_stats s JOIN legend_daily_stats d ON s.day=d.day AND d.cohort=$5
      AND d.classified_army_attacks IS NOT NULL WHERE s.day BETWEEN $1::date AND $2::date
      AND s.league_tier_id=$3 AND s.rank_limit IS NOT DISTINCT FROM $4::integer AND ${selector}`
    if (timeline) {
      const rows = yield* sql.unsafe<SetupRow>(`SELECT s.*,s.day::text AS day,1 observed_days ${source} ORDER BY s.day`, values)
      const byDay = new Map(rows.map(row => [row.day, row]))
      return { ...coverage, benchmarks: setupBenchmarks(allTotals), items: totals.map(total => {
        const row = byDay.get(total.day)
        const rank = rankFields({ day: total.day, group_key: q.groupKey!, variant_key: q.variantKey ?? "" }, ranks)
        return { day: total.day, totalAttacks: Number(total.attack_count),
          observation: row ? { ...setupStatistics(row, Number(total.attack_count)), ...rank } : null,
          rank: rank.dailyRank, previousDayRank: rank.previousDayRank, rankChange: rank.rankChange }
      }) }
    }
    const order = q.sort === "usage" ? "sum(s.attack_count)" : "sum(s.three_star_count)::float8 / NULLIF(sum(s.attack_count),0)"
    const having = ` HAVING sum(s.attack_count)*${q.groupKey === null ? 1000 : 100} >= $${values.length + 1}`
    const listValues = [...values, coverage.totalAttacks]
    const rows = yield* sql.unsafe<SetupRow>(`SELECT s.group_key,s.variant_key,
      (jsonb_agg(s.core_troops ORDER BY s.day DESC)->0) core_troops,
      (jsonb_agg(s.conditions ORDER BY s.day DESC)->0) conditions,
      (array_agg(s.representative_share_code ORDER BY s.day DESC))[1] representative_share_code,
      sum(s.attack_count)::bigint attack_count,sum(s.zero_star_count)::bigint zero_star_count,
      sum(s.one_star_count)::bigint one_star_count,sum(s.two_star_count)::bigint two_star_count,
      sum(s.three_star_count)::bigint three_star_count,sum(s.destruction_percentage_sum)::bigint destruction_percentage_sum,
      count(*)::integer observed_days,jsonb_agg(s.siege_usage ORDER BY s.day) siege_usage_days ${source} GROUP BY s.group_key,s.variant_key${having}
      ORDER BY ${order} DESC,s.group_key,s.variant_key LIMIT ${q.limit}`, listValues)
    const latestDay = coverage.completedDays.at(-1)
    const withRank = (row: SetupRow) => ({ ...setupStatistics(row, coverage.totalAttacks),
      ...(latestDay ? rankFields({ day: latestDay, group_key: row.group_key, variant_key: row.variant_key }, ranks) : {}) })
    if (q.rankLimit !== null) return { ...coverage, items: rows.map(withRank) }
    const comparisonValues = [q.window.firstDay, q.window.lastDay, q.leagueTierId, ...(q.groupKey === null ? [] : [q.groupKey])]
    const comparisonFilter = q.groupKey === null ? "s.variant_key=''" : "s.group_key=$4 AND s.variant_key<>''"
    const comparisonRows = yield* sql.unsafe<ComparisonRow>(`SELECT s.group_key,s.variant_key,d.cohort,
      sum(s.attack_count)::bigint attack_count,sum(s.three_star_count)::bigint three_star_count
      FROM army_setup_daily_stats s JOIN legend_daily_stats d ON d.day=s.day
      AND d.classified_army_attacks IS NOT NULL AND d.cohort=CASE s.rank_limit
        WHEN 1000 THEN 'top_1000' WHEN 200 THEN 'top_200' ELSE 'legend_i' END
      WHERE s.day BETWEEN $1::date AND $2::date AND s.league_tier_id=$3 AND ${comparisonFilter}
      GROUP BY s.group_key,s.variant_key,d.cohort`, comparisonValues)
    return { ...coverage, items: rows.map(row => ({ ...withRank(row),
      comparisons: setupComparisons(row, comparisonRows, allTotals) })) }
  }))
}).pipe(Effect.mapError(cause => cause instanceof InvalidRequest ? cause : new DatabaseFailure({ cause, message: "Daily army observations could not be read" })))
