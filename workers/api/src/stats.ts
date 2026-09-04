import type {
  StatsArmiesRequest,
  StatsArmiesResponse,
  StatsCwlRequest,
  StatsItemsRequest,
  StatsItemsResponse,
  StatsPerformanceResponse,
  StatsRankedRequest,
  StatsWarRequest,
} from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { queryRegularArchiveDaily } from "./stats-archive.js"
import { queryCwlArchiveDaily } from "./stats-cwl-archive.js"

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
  sample_size: n(row.sample_size),
  average_stars: n(row.average_stars),
  average_destruction: n(row.average_destruction),
  zero_star_rate: n(row.zero_star_rate),
  one_star_rate: n(row.one_star_rate),
  two_star_rate: n(row.two_star_rate),
  three_star_rate: n(row.three_star_rate),
  daily: daily.map((point) => ({
    date: point.date instanceof Date ? point.date.toISOString().slice(0, 10) : String(point.date).slice(0, 10),
    sample_size: n(point.sample_size),
    ...(point.use_count === undefined ? {} : { use_count: n(point.use_count) }),
    ...(point.usage_rate === undefined ? {} : { usage_rate: n(point.usage_rate) }),
    average_stars: n(point.average_stars),
    average_destruction: n(point.average_destruction),
    zero_star_rate: n(point.zero_star_rate),
    one_star_rate: n(point.one_star_rate),
    two_star_rate: n(point.two_star_rate),
    three_star_rate: n(point.three_star_rate),
  })),
})

const metricFromDaily = (points: ReadonlyArray<DailyMetricRow>) => {
  const total = points.reduce((sum, point) => sum + n(point.sample_size), 0)
  const weighted = (field: keyof Pick<MetricRow,
    "average_stars" | "average_destruction" | "zero_star_rate" | "one_star_rate" | "two_star_rate" | "three_star_rate"
  >) => total === 0
    ? 0
    : points.reduce((sum, point) => sum + n(point[field]) * n(point.sample_size), 0) / total
  return metric({
    sample_size: total,
    average_stars: weighted("average_stars"),
    average_destruction: weighted("average_destruction"),
    zero_star_rate: weighted("zero_star_rate"),
    one_star_rate: weighted("one_star_rate"),
    two_star_rate: weighted("two_star_rate"),
    three_star_rate: weighted("three_star_rate"),
  })
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
    return { date_range: dateRange(window), metrics: metric(row, daily) }
  }),
)

type BattleFilters = StatsArmiesRequest | StatsItemsRequest

const battleSource = (request: BattleFilters, window: DateWindow) => {
  const params: Array<unknown> = [window.start, window.endExclusive]
  const where = [
    "b.attack = true",
    "lower(b.battle_type) IN ('ranked', 'legend')",
    "b.\"timestamp\" >= $1",
    "b.\"timestamp\" < $2",
  ]
  let from = "battlelogs b"
  const bind = (value: unknown): string => {
    params.push(value)
    return `$${params.length}`
  }
  if (request.townhall_level !== undefined) where.push(`b.player_th = ${bind(request.townhall_level)}`)
  if (request.opponent_townhall_level !== undefined) where.push(`b.opponent_th = ${bind(request.opponent_townhall_level)}`)
  if (request.equal_townhalls === true) where.push("b.player_th = b.opponent_th")
  if (request.ranked_league_tier_id !== undefined) {
    from += ` JOIN LATERAL (
      SELECT membership.league_tier_id FROM ranked_league_group_members membership
      WHERE membership.player_tag = b.player_tag
        AND membership.season_id = to_char(b."timestamp" AT TIME ZONE 'UTC', 'YYYYMM')::bigint
      ORDER BY membership.group_tag LIMIT 1
    ) ranked_membership ON true`
    where.push(`ranked_membership.league_tier_id = ${bind(request.ranked_league_tier_id)}`)
  }
  for (const item of request.include_items ?? []) {
    const key = bind(item.item.trim())
    where.push(`b.army_counts ? ${key}`)
    if (item.min_quantity !== undefined) where.push(`(b.army_counts ->> ${key})::int >= ${bind(item.min_quantity)}`)
    if (item.max_quantity !== undefined) where.push(`(b.army_counts ->> ${key})::int <= ${bind(item.max_quantity)}`)
  }
  for (const item of request.exclude_items ?? []) {
    if (item.trim().length > 0) where.push(`NOT (b.army_counts ? ${bind(item.trim())})`)
  }
  return { from, params, where }
}

const validateBattleFilters = (request: BattleFilters) => Effect.gen(function* () {
  yield* positive("townhall_level", request.townhall_level)
  yield* positive("opponent_townhall_level", request.opponent_townhall_level)
  yield* positive("ranked_league_tier_id", request.ranked_league_tier_id)
  yield* positive("minimum_sample_size", request.minimum_sample_size)
  for (const item of request.include_items ?? []) {
    if (item.item.trim().length === 0) return yield* new InvalidRequest({ message: "include_items item is required" })
    yield* positive("min_quantity", item.min_quantity)
    yield* positive("max_quantity", item.max_quantity)
    if (item.min_quantity !== undefined && item.max_quantity !== undefined && item.min_quantity > item.max_quantity) {
      return yield* new InvalidRequest({ message: "min_quantity cannot exceed max_quantity" })
    }
  }
})

interface ArmyRow extends MetricRow {
  readonly army_counts: Readonly<Record<string, number>> | string
  readonly army_items: ReadonlyArray<string>
  readonly army_share_code: string
  readonly usage_rate: number | string
}

interface ArmyDailyRow extends DailyMetricRow {
  readonly army_counts: Readonly<Record<string, number>> | string
  readonly army_items: ReadonlyArray<string>
  readonly army_share_code: string
}

const counts = (value: Readonly<Record<string, number>> | string): Readonly<Record<string, number>> =>
  typeof value === "string" ? JSON.parse(value) as Readonly<Record<string, number>> : value

const armyKey = (share: string, items: ReadonlyArray<string>, values: Readonly<Record<string, number>>) =>
  JSON.stringify([share, items, Object.entries(values).sort(([left], [right]) => left.localeCompare(right))])

export const queryArmyStats = (
  request: StatsArmiesRequest,
): Effect.Effect<StatsArmiesResponse, DatabaseFailure | InvalidRequest, SqlClient.SqlClient> => database(
  "Stats.queryArmies",
  Effect.gen(function* () {
    yield* validateBattleFilters(request)
    const window = yield* statsDateWindow(request.dates)
    const sql = yield* SqlClient.SqlClient
    const source = battleSource(request, window)
    const minimum = request.minimum_sample_size ?? 100
    const limit = Math.max(1, Math.min(100, Math.trunc(request.limit ?? 25)))
    const sort = ({
      usage_rate: "usage_rate DESC, sample_size DESC",
      three_star_rate: "three_star_rate DESC, sample_size DESC",
      average_stars: "average_stars DESC, sample_size DESC",
      average_destruction: "average_destruction DESC, sample_size DESC",
    } as const)[request.sort_by ?? "usage_rate"] + ", army_share_code, army_items, army_counts"
    const params = [...source.params, minimum, limit]
    const minimumParameter = `$${params.length - 1}`
    const limitParameter = `$${params.length}`
    const filtered = `WITH filtered AS (
      SELECT b.army_share_code, b.army_items, b.army_counts, b.stars::int AS stars,
        b.destruction_percentage::float8 AS destruction_percentage, b."timestamp" AS event_time
      FROM ${source.from} WHERE ${source.where.join(" AND ")}
    ), totals AS (SELECT count(*)::float8 AS sample_size FROM filtered)`
    const rows = yield* sql.unsafe<ArmyRow>(`${filtered}
      SELECT army_share_code, army_items, army_counts, ${metricColumns},
        COALESCE(count(*)::float8 / NULLIF(totals.sample_size, 0), 0)::float8 AS usage_rate
      FROM filtered CROSS JOIN totals
      GROUP BY army_share_code, army_items, army_counts, totals.sample_size
      HAVING count(*) >= ${minimumParameter} ORDER BY ${sort} LIMIT ${limitParameter}`, params)
    if (rows.length === 0) return { date_range: dateRange(window), items: [], count: 0 }
    const daily = yield* sql.unsafe<ArmyDailyRow>(`${filtered}
      , selected AS (
        SELECT army_share_code, army_items, army_counts, ${metricColumns},
          COALESCE(count(*)::float8 / NULLIF(totals.sample_size, 0), 0)::float8 AS usage_rate
        FROM filtered CROSS JOIN totals
        GROUP BY army_share_code, army_items, army_counts, totals.sample_size
        HAVING count(*) >= ${minimumParameter} ORDER BY ${sort} LIMIT ${limitParameter}
      ), daily_totals AS (
        SELECT to_char(event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, count(*)::float8 AS sample_size
        FROM filtered GROUP BY to_char(event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      )
      SELECT f.army_share_code, f.army_items, f.army_counts, to_char(f.event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        ${metricColumns}, COALESCE(count(*)::float8 / NULLIF(t.sample_size, 0), 0)::float8 AS usage_rate
      FROM filtered f JOIN selected s USING (army_share_code, army_items, army_counts)
      JOIN daily_totals t ON t.date = to_char(f.event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      GROUP BY f.army_share_code, f.army_items, f.army_counts, to_char(f.event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD'), t.sample_size
      ORDER BY date`, params)
    const byArmy = Map.groupBy(daily, (row) => armyKey(row.army_share_code, row.army_items, counts(row.army_counts)))
    const items = rows.map((row) => {
      const armyCounts = counts(row.army_counts)
      return {
        army_share_code: row.army_share_code,
        army_items: [...row.army_items],
        army_counts: { ...armyCounts },
        ...metric(row, byArmy.get(armyKey(row.army_share_code, row.army_items, armyCounts)) ?? []),
        usage_rate: n(row.usage_rate),
      }
    })
    return { date_range: dateRange(window), items, count: items.length }
  }),
)

interface ItemRow extends MetricRow {
  readonly composition_share: number | string
  readonly use_count: number | string
  readonly usage_rate: number | string
}

const validHeroes = new Map([
  ["barbarian king", "Barbarian King"], ["archer queen", "Archer Queen"],
  ["grand warden", "Grand Warden"], ["royal champion", "Royal Champion"],
  ["minion prince", "Minion Prince"],
])

export const queryItemStats = (
  request: StatsItemsRequest,
): Effect.Effect<StatsItemsResponse, DatabaseFailure | InvalidRequest, SqlClient.SqlClient> => database(
  "Stats.queryItems",
  Effect.gen(function* () {
    yield* validateBattleFilters(request)
    if (request.items.length === 0 || request.items.length > 25) {
      return yield* new InvalidRequest({ message: "items must contain between 1 and 25 entries" })
    }
    const selectors = new Map<string, { item: string; type: string; hero?: string }>()
    for (const raw of request.items) {
      const item = raw.item.trim()
      if (item.length === 0) return yield* new InvalidRequest({ message: "item is required" })
      let hero = raw.hero?.trim()
      if (raw.type === "equipment") {
        hero = hero === undefined ? undefined : validHeroes.get(hero.toLowerCase())
        if (hero === undefined) return yield* new InvalidRequest({ message: "equipment hero is not a valid Clash hero" })
      } else if (hero !== undefined) {
        return yield* new InvalidRequest({ message: "hero is only valid for equipment" })
      }
      selectors.set(`${raw.type}\0${item}\0${hero ?? ""}`, { item, type: raw.type, ...(hero === undefined ? {} : { hero }) })
    }
    const window = yield* statsDateWindow(request.dates)
    const sql = yield* SqlClient.SqlClient
    const source = battleSource(request, window)
    const items = []
    for (const selector of selectors.values()) {
      const params = [...source.params, selector.item]
      const itemParameter = `$${params.length}`
      const filtered = `WITH filtered AS (
        SELECT b.army_counts, b.stars::int AS stars, b.destruction_percentage::float8 AS destruction_percentage,
          b."timestamp" AS event_time FROM ${source.from} WHERE ${source.where.join(" AND ")}
      )`
      const rows = yield* sql.unsafe<ItemRow>(`${filtered}, totals AS (
        SELECT count(*)::bigint AS sample_size,
          COALESCE(sum((SELECT sum(value::int) FROM jsonb_each_text(army_counts))), 0)::float8 AS item_slots FROM filtered
      ) SELECT totals.sample_size,
        count(*) FILTER (WHERE f.army_counts ? ${itemParameter})::bigint AS use_count,
        COALESCE(count(*) FILTER (WHERE f.army_counts ? ${itemParameter})::float8 / NULLIF(totals.sample_size, 0), 0)::float8 AS usage_rate,
        COALESCE(avg(f.stars) FILTER (WHERE f.army_counts ? ${itemParameter}), 0)::float8 AS average_stars,
        COALESCE(avg(f.destruction_percentage) FILTER (WHERE f.army_counts ? ${itemParameter}), 0)::float8 AS average_destruction,
        COALESCE(count(*) FILTER (WHERE f.army_counts ? ${itemParameter} AND f.stars = 0)::float8 / NULLIF(count(*) FILTER (WHERE f.army_counts ? ${itemParameter}), 0), 0)::float8 AS zero_star_rate,
        COALESCE(count(*) FILTER (WHERE f.army_counts ? ${itemParameter} AND f.stars = 1)::float8 / NULLIF(count(*) FILTER (WHERE f.army_counts ? ${itemParameter}), 0), 0)::float8 AS one_star_rate,
        COALESCE(count(*) FILTER (WHERE f.army_counts ? ${itemParameter} AND f.stars = 2)::float8 / NULLIF(count(*) FILTER (WHERE f.army_counts ? ${itemParameter}), 0), 0)::float8 AS two_star_rate,
        COALESCE(count(*) FILTER (WHERE f.army_counts ? ${itemParameter} AND f.stars = 3)::float8 / NULLIF(count(*) FILTER (WHERE f.army_counts ? ${itemParameter}), 0), 0)::float8 AS three_star_rate,
        COALESCE(sum(CASE WHEN f.army_counts ? ${itemParameter} THEN (f.army_counts ->> ${itemParameter})::int ELSE 0 END)::float8 / NULLIF(totals.item_slots, 0), 0)::float8 AS composition_share
      FROM totals LEFT JOIN filtered f ON true GROUP BY totals.sample_size, totals.item_slots`, params)
      const daily = yield* sql.unsafe<DailyMetricRow>(`${filtered}
        SELECT to_char(event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, count(*)::bigint AS sample_size,
          count(*) FILTER (WHERE army_counts ? ${itemParameter})::bigint AS use_count,
          COALESCE(count(*) FILTER (WHERE army_counts ? ${itemParameter})::float8 / NULLIF(count(*), 0), 0)::float8 AS usage_rate,
          COALESCE(avg(stars) FILTER (WHERE army_counts ? ${itemParameter}), 0)::float8 AS average_stars,
          COALESCE(avg(destruction_percentage) FILTER (WHERE army_counts ? ${itemParameter}), 0)::float8 AS average_destruction,
          COALESCE(count(*) FILTER (WHERE army_counts ? ${itemParameter} AND stars = 0)::float8 / NULLIF(count(*) FILTER (WHERE army_counts ? ${itemParameter}), 0), 0)::float8 AS zero_star_rate,
          COALESCE(count(*) FILTER (WHERE army_counts ? ${itemParameter} AND stars = 1)::float8 / NULLIF(count(*) FILTER (WHERE army_counts ? ${itemParameter}), 0), 0)::float8 AS one_star_rate,
          COALESCE(count(*) FILTER (WHERE army_counts ? ${itemParameter} AND stars = 2)::float8 / NULLIF(count(*) FILTER (WHERE army_counts ? ${itemParameter}), 0), 0)::float8 AS two_star_rate,
          COALESCE(count(*) FILTER (WHERE army_counts ? ${itemParameter} AND stars = 3)::float8 / NULLIF(count(*) FILTER (WHERE army_counts ? ${itemParameter}), 0), 0)::float8 AS three_star_rate
        FROM filtered GROUP BY to_char(event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') ORDER BY date`, params)
      const row = rows[0]
      if (row === undefined) throw new Error("Item aggregate returned no row")
      const metrics = metric(row, daily)
      items.push({
        ...selector,
        ...metrics,
        available: n(row.use_count) > 0,
        use_count: n(row.use_count),
        usage_rate: n(row.usage_rate),
        hit_rate: n(row.three_star_rate),
        ...((selector.type === "troop" || selector.type === "spell")
          ? { composition_share: n(row.composition_share) }
          : {}),
      })
    }
    return { date_range: dateRange(window), items, count: items.length }
  }),
)

export const queryWarStats = (request: StatsWarRequest) => Effect.gen(function* () {
  yield* positive("townhall_level", request.townhall_level)
  yield* positive("opponent_townhall_level", request.opponent_townhall_level)
  const window = yield* statsDateWindow(request.dates)
  const daily = yield* queryRegularArchiveDaily(window.start, window.endExclusive, request)
  const metrics = metricFromDaily(daily)
  return { date_range: dateRange(window), metrics: metric(metrics, daily) }
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
  return { date_range: dateRange(window), metrics: metric(metricFromDaily(daily), daily),
    breakdowns: [...Map.groupBy(daily, (point) => point.date.slice(0, 7))].map(([key, points]) => ({ key, metrics: metricFromDaily(points) })),
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

const queryRankedOverview = (window: DateWindow) => database("Stats.rankedOverview", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const params = [window.start, window.endExclusive]
  const source = `FROM (
    SELECT b."timestamp" AS event_time, b.stars::int AS stars,
      b.destruction_percentage::float8 AS destruction_percentage
    FROM battlelogs b WHERE b.attack = true AND lower(b.battle_type) IN ('ranked', 'legend')
      AND b."timestamp" >= $1 AND b."timestamp" < $2
  ) source`
  const rows = yield* sql.unsafe<MetricRow>(`SELECT ${metricColumns} ${source}`, params)
  const daily = yield* sql.unsafe<DailyMetricRow>(
    `SELECT to_char(event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, ${metricColumns} ${source}
     GROUP BY to_char(event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') ORDER BY date`,
    params,
  )
  const row = rows[0]
  if (row === undefined) throw new Error("Ranked overview aggregate returned no row")
  return metric(row, daily)
}))

export const queryStatsOverview = (
  dates: { readonly end_date?: string; readonly start_date?: string },
) => Effect.gen(function* () {
  const window = yield* statsDateWindow(dates)
  const [countsResult, ranked, war, cwl] = yield* Effect.all([
    queryGlobalCounts,
    queryRankedOverview(window),
    queryWarStats({ dates }),
    queryCwlStats({ dates }),
  ], { concurrency: "unbounded" })
  return {
    date_range: dateRange(window),
    counts: countsResult,
    ranked,
    war: war.metrics,
    cwl: cwl.metrics,
  }
})
