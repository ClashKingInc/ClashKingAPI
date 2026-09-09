import type { StatsPerformanceResponse } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { queryRegularArchiveDaily } from "./stats-archive.js"
import { queryCwlArchiveDaily } from "./stats-cwl-archive.js"
import type { StatsCwlRequest, StatsRankedRequest, StatsWarRequest } from "./stats-internal.js"

interface DateWindow {
  readonly end: Date
  readonly endExclusive: Date
  readonly start: Date
}

interface MetricRow {
  readonly average_destruction: number | string
  readonly average_stars: number | string
  readonly one_star_rate: number | string
  readonly sample_size: number | string
  readonly three_star_rate: number | string
  readonly two_star_rate: number | string
  readonly zero_star_rate: number | string
}

interface DailyMetricRow extends MetricRow {
  readonly date: Date | string
  readonly usage_rate?: number | string
  readonly use_count?: number | string
}

const positive = (name: string, value: number | undefined): Effect.Effect<void, InvalidRequest> =>
  value === undefined || Number.isInteger(value) && value > 0
    ? Effect.void
    : Effect.fail(new InvalidRequest({ message: `${name} must be a positive integer` }))

const queryFailure = (message: string) => new InvalidRequest({ message })
const one = (query: URLSearchParams, name: string): string | undefined => {
  const values = query.getAll(name)
  if (values.length > 1) throw queryFailure(`${name} must be provided once`)
  return values[0]
}
const integer = (query: URLSearchParams, name: string, required = false): number | undefined => {
  const value = one(query, name)
  if (value === undefined && !required) return undefined
  if (value === undefined || !/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) throw queryFailure(`${name} must be a positive integer`)
  return Number(value)
}
const boolean = (query: URLSearchParams, name: string): boolean | undefined => {
  const value = one(query, name)
  if (value === undefined) return undefined
  if (value !== "true" && value !== "false") throw queryFailure(`${name} must be true or false`)
  return value === "true"
}
const known = (query: URLSearchParams, names: ReadonlySet<string>) => {
  for (const name of query.keys()) if (!names.has(name)) throw queryFailure(`Unsupported query parameter: ${name}`)
}
const dates = (query: URLSearchParams) => ({
  ...(one(query, "startDate") === undefined ? {} : { start_date: one(query, "startDate")! }),
  ...(one(query, "endDate") === undefined ? {} : { end_date: one(query, "endDate")! }),
})
const warQueryNames = new Set(["startDate", "endDate", "townHallLevel", "opponentTownHallLevel", "equalTownHalls"])
export const parseStatsRankedQuery = (query: URLSearchParams): StatsRankedRequest => {
  known(query, new Set(["startDate", "endDate", "townHallLevel", "leagueTierId"]))
  return { dates: dates(query), townhall_level: integer(query, "townHallLevel", true)!, ranked_league_tier_id: integer(query, "leagueTierId", true)! }
}
export const parseStatsWarQuery = (query: URLSearchParams): StatsWarRequest => {
  known(query, warQueryNames)
  const townHallLevel = integer(query, "townHallLevel")
  const opponentTownHallLevel = integer(query, "opponentTownHallLevel")
  const equalTownHalls = boolean(query, "equalTownHalls")
  return { dates: dates(query),
    ...(townHallLevel === undefined ? {} : { townhall_level: townHallLevel }),
    ...(opponentTownHallLevel === undefined ? {} : { opponent_townhall_level: opponentTownHallLevel }),
    ...(equalTownHalls === undefined ? {} : { equal_townhalls: equalTownHalls }) }
}
export const parseStatsCwlQuery = (query: URLSearchParams): StatsCwlRequest => {
  known(query, new Set([...warQueryNames, "cwlLeagueId", "seasons"]))
  const base = parseStatsWarQuery(new URLSearchParams([...query].filter(([key]) => warQueryNames.has(key))))
  return { ...base, ...(integer(query, "cwlLeagueId") === undefined ? {} : { cwl_league_id: integer(query, "cwlLeagueId")! }), seasons: query.getAll("seasons") }
}

const parseDay = (name: string, value: string): Effect.Effect<Date, InvalidRequest> => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return Effect.fail(new InvalidRequest({ message: `${name} must use YYYY-MM-DD` }))
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value
    ? Effect.fail(new InvalidRequest({ message: `${name} must use YYYY-MM-DD` }))
    : Effect.succeed(date)
}

export const statsDateWindow = (
  dates: { readonly end_date?: string; readonly start_date?: string },
  now = new Date(),
): Effect.Effect<DateWindow, InvalidRequest> => Effect.gen(function* () {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end = dates.end_date === undefined ? today : yield* parseDay("end_date", dates.end_date)
  const defaultStart = new Date(end)
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 29)
  const start = dates.start_date === undefined ? defaultStart : yield* parseDay("start_date", dates.start_date)
  const endExclusive = new Date(end)
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
  if (start >= endExclusive) {
    return yield* new InvalidRequest({ message: "start_date must be on or before end_date" })
  }
  if (endExclusive.valueOf() - start.valueOf() > 90 * 24 * 60 * 60 * 1000) {
    return yield* new InvalidRequest({ message: "date range cannot exceed 90 days" })
  }
  return { start, end, endExclusive }
})

const dateRange = (window: DateWindow) => ({
  start: window.start.toISOString(),
  end: new Date(window.endExclusive.valueOf() - 1).toISOString(),
})

const n = (value: number | string): number => Number(value)

const metric = (row: MetricRow, daily: ReadonlyArray<DailyMetricRow> = []) => ({
  available: n(row.sample_size) > 0,
  sampleSize: n(row.sample_size),
  averageStars: n(row.average_stars),
  averageDestruction: n(row.average_destruction),
  zeroStarRate: n(row.zero_star_rate),
  oneStarRate: n(row.one_star_rate),
  twoStarRate: n(row.two_star_rate),
  threeStarRate: n(row.three_star_rate),
  daily: daily.map((point) => ({
    date: point.date instanceof Date ? point.date.toISOString().slice(0, 10) : String(point.date).slice(0, 10),
    sampleSize: n(point.sample_size),
    ...(point.use_count === undefined ? {} : { useCount: n(point.use_count) }),
    ...(point.usage_rate === undefined ? {} : { usageRate: n(point.usage_rate) }),
    averageStars: n(point.average_stars),
    averageDestruction: n(point.average_destruction),
    zeroStarRate: n(point.zero_star_rate),
    oneStarRate: n(point.one_star_rate),
    twoStarRate: n(point.two_star_rate),
    threeStarRate: n(point.three_star_rate),
  })),
})

const metricFromDaily = (points: ReadonlyArray<DailyMetricRow>) => {
  const total = points.reduce((sum, point) => sum + n(point.sample_size), 0)
  const weighted = (field: keyof Pick<MetricRow,
    "average_stars" | "average_destruction" | "zero_star_rate" | "one_star_rate" | "two_star_rate" | "three_star_rate"
  >) => total === 0
    ? 0
    : points.reduce((sum, point) => sum + n(point[field]) * n(point.sample_size), 0) / total
  return {
    sample_size: total,
    average_stars: weighted("average_stars"),
    average_destruction: weighted("average_destruction"),
    zero_star_rate: weighted("zero_star_rate"),
    one_star_rate: weighted("one_star_rate"),
    two_star_rate: weighted("two_star_rate"),
    three_star_rate: weighted("three_star_rate"),
  }
}

const metricColumns = `count(*)::bigint AS sample_size,
  COALESCE(avg(stars), 0)::float8 AS average_stars,
  COALESCE(avg(destruction_percentage), 0)::float8 AS average_destruction,
  COALESCE(count(*) FILTER (WHERE stars = 0)::float8 / NULLIF(count(*), 0), 0)::float8 AS zero_star_rate,
  COALESCE(count(*) FILTER (WHERE stars = 1)::float8 / NULLIF(count(*), 0), 0)::float8 AS one_star_rate,
  COALESCE(count(*) FILTER (WHERE stars = 2)::float8 / NULLIF(count(*), 0), 0)::float8 AS two_star_rate,
  COALESCE(count(*) FILTER (WHERE stars = 3)::float8 / NULLIF(count(*), 0), 0)::float8 AS three_star_rate`

const database = <A>(message: string, effect: Effect.Effect<A, unknown, SqlClient.SqlClient>) => effect.pipe(
  Effect.mapError((cause) => cause instanceof InvalidRequest
    ? cause
    : new DatabaseFailure({ cause, message })),
  Effect.withSpan(message),
)

export const queryRankedStats = (
  request: StatsRankedRequest,
): Effect.Effect<StatsPerformanceResponse, DatabaseFailure | InvalidRequest, SqlClient.SqlClient> => database(
  "Stats.queryRanked",
  Effect.gen(function* () {
    yield* positive("townhall_level", request.townhall_level)
    yield* positive("ranked_league_tier_id", request.ranked_league_tier_id)
    const window = yield* statsDateWindow(request.dates)
    const sql = yield* SqlClient.SqlClient
    const params = [window.start, window.endExclusive, request.townhall_level, request.ranked_league_tier_id]
    const source = `FROM (
      SELECT b."timestamp" AS event_time, b.stars::int AS stars,
        b.destruction_percentage::float8 AS destruction_percentage
      FROM battlelogs b
      JOIN LATERAL (
        SELECT membership.league_tier_id
        FROM ranked_league_group_members membership
        WHERE membership.player_tag = b.player_tag
          AND membership.season_id = to_char(b."timestamp" AT TIME ZONE 'UTC', 'YYYYMM')::bigint
        ORDER BY membership.group_tag LIMIT 1
      ) ranked ON true
      WHERE b.attack = true AND lower(b.battle_type) IN ('ranked', 'legend')
        AND b."timestamp" >= $1 AND b."timestamp" < $2
        AND b.player_th = $3 AND ranked.league_tier_id = $4
    ) source`
    const rows = yield* sql.unsafe<MetricRow>(`SELECT ${metricColumns} ${source}`, params)
    const daily = yield* sql.unsafe<DailyMetricRow>(
      `SELECT to_char(event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, ${metricColumns} ${source}
       GROUP BY to_char(event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') ORDER BY date`,
      params,
    )
    const row = rows[0]
    if (row === undefined) throw new Error("Ranked aggregate returned no row")
    return { dateRange: dateRange(window), metrics: metric(row, daily) }
  }),
)

export const queryWarStats = (request: StatsWarRequest) => Effect.gen(function* () {
  yield* positive("townhall_level", request.townhall_level)
  yield* positive("opponent_townhall_level", request.opponent_townhall_level)
  const window = yield* statsDateWindow(request.dates)
  const daily = yield* queryRegularArchiveDaily(window.start, window.endExclusive, request)
  const metrics = metricFromDaily(daily)
  return { dateRange: dateRange(window), metrics: metric(metrics, daily) }
})
export const queryCwlStats = (request: StatsCwlRequest) => Effect.gen(function* () {
  yield* positive("townhall_level", request.townhall_level)
  yield* positive("opponent_townhall_level", request.opponent_townhall_level)
  yield* positive("cwl_league_id", request.cwl_league_id)
  for (const season of request.seasons ?? []) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(season)) return yield* new InvalidRequest({ message: "seasons must use YYYY-MM" })
  }
  const window = yield* statsDateWindow(request.dates)
  const daily = yield* queryCwlArchiveDaily(window.start, window.endExclusive, request)
  return { dateRange: dateRange(window), metrics: metric(metricFromDaily(daily), daily),
    breakdowns: [...Map.groupBy(daily, (point) => point.date.slice(0, 7))].map(([key, points]) => ({ key, metrics: metric(metricFromDaily(points)) })),
  }
})

interface GlobalCountsRow {
  readonly clan_count: number | string
  readonly clans_in_war: number | string
  readonly player_count: number | string
  readonly players_in_legends: number | string
  readonly players_in_war: number | string
  readonly total_join_leaves: number | string
  readonly wars_stored: number | string
}

export const queryGlobalCounts = database("Stats.globalCounts", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<GlobalCountsRow>`
    SELECT players_in_war, clans_in_war, total_join_leaves, players_in_legends,
      player_count, clan_count, wars_stored FROM api_global_counts WHERE id = 1
  `
  const row = rows[0]
  if (row === undefined) throw new Error("Global count materialized view has no singleton row")
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, n(value)])) as unknown as {
    readonly clan_count: number
    readonly clans_in_war: number
    readonly player_count: number
    readonly players_in_legends: number
    readonly players_in_war: number
    readonly total_join_leaves: number
    readonly wars_stored: number
  }
}))

export type GroupedCountDimension =
  | "capital_league_id"
  | "cwl_league_id"
  | "league_tier_id"
  | "location_id"
  | "townhall_level"

const groupedCountQueries: Readonly<Record<GroupedCountDimension, string>> = {
  townhall_level: "SELECT level AS townhall_level, total_count AS count FROM townhall_counts ORDER BY level",
  league_tier_id: "SELECT league_tier_id, player_count AS count FROM api_league_tier_counts ORDER BY league_tier_id",
  location_id: "SELECT location_id, count(*)::bigint AS count FROM basic_clan GROUP BY location_id ORDER BY location_id NULLS LAST",
  cwl_league_id: "SELECT cwl_league_id, clan_count AS count FROM war_league_counts ORDER BY cwl_league_id",
  capital_league_id: "SELECT capital_league_id, count(*)::bigint AS count FROM basic_clan GROUP BY capital_league_id ORDER BY capital_league_id NULLS LAST",
}

export const queryGroupedCounts = (dimension: GroupedCountDimension) => database(
  `Stats.counts.${dimension}`,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql.unsafe<Record<string, number | string | null>>(groupedCountQueries[dimension])
    const items = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
      key,
      value === null ? undefined : n(value),
    ]).filter(([, value]) => value !== undefined)))
    return { items, count: items.length }
  }),
)
