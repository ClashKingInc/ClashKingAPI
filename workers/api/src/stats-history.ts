import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { parseHistoryTime } from "./public-time.js"

type Interval = "day" | "month" | "week"
interface StatsWindow { readonly start: Date; readonly end: Date }

const failure = (message: string, effect: Effect.Effect<unknown, unknown, SqlClient.SqlClient>) => effect.pipe(
  Effect.mapError((cause) => cause instanceof InvalidRequest ? cause : new DatabaseFailure({ cause, message })),
)
const invalid = (message: string) => new InvalidRequest({ message })
const strict = (query: URLSearchParams, allowed: ReadonlySet<string>) => {
  for (const key of query.keys()) if (!allowed.has(key)) throw invalid(`Unsupported query parameter: ${key}`)
}
const single = (query: URLSearchParams, key: string): string | undefined => {
  const values = query.getAll(key)
  if (values.length > 1) throw invalid(`${key} may be supplied only once`)
  return values[0]?.trim() || undefined
}
const integer = (query: URLSearchParams, key: string, minimum: number, maximum: number): number | undefined => {
  const raw = single(query, key)
  if (raw === undefined) return undefined
  if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < minimum || Number(raw) > maximum) throw invalid(`Invalid ${key}`)
  return Number(raw)
}
const utcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
const addDays = (date: Date, days: number) => new Date(date.valueOf() + days * 86_400_000)
const day = (date: Date | string) => new Date(date).toISOString().slice(0, 10)

export const parseStatsHistoryWindow = (
  query: URLSearchParams,
  now = new Date(),
  maximumDays = 90,
): Effect.Effect<StatsWindow, InvalidRequest> => Effect.gen(function* () {
  const fallbackEnd = utcDay(now)
  const fallbackStart = addDays(fallbackEnd, -29)
  const start = utcDay(yield* parseHistoryTime(query.get("time[after]"), fallbackStart))
  const end = utcDay(yield* parseHistoryTime(query.get("time[before]"), fallbackEnd))
  if (start > end) return yield* invalid("Invalid time range")
  if ((end.valueOf() - start.valueOf()) / 86_400_000 + 1 > maximumDays) return yield* invalid(`Time range cannot exceed ${maximumDays} days`)
  return { start, end }
})

interface ArchiveDayRow { readonly archive_day: string; readonly stats: unknown }
interface StarOutcome { readonly attacks?: number; readonly destructionPercent?: number; readonly durationSeconds?: number }
interface HitRates { readonly attacks?: number; readonly zeroStars?: StarOutcome; readonly oneStars?: StarOutcome; readonly twoStars?: StarOutcome; readonly threeStars?: StarOutcome }
interface WarSizeStats { readonly wars?: number; readonly townhalls?: Record<string, number>; readonly ties?: number }
interface ArchiveDay {
  readonly regularHitRates?: Record<string, HitRates>
  readonly regularByWarSize?: Record<string, WarSizeStats>
  readonly totalMissedAttacks?: number
}
const record = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
const archiveDay = (value: unknown): ArchiveDay => record(value) as ArchiveDay
const number = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0
const period = (date: string, interval: Interval): string => {
  const value = new Date(`${date}T00:00:00.000Z`)
  if (interval === "week") value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7)
  if (interval === "month") value.setUTCDate(1)
  return day(value)
}
const parseIntervalWindow = (query: URLSearchParams, allowed: ReadonlySet<string>, now: Date) => Effect.gen(function* () {
  yield* Effect.try({ try: () => strict(query, allowed), catch: (cause) => cause as InvalidRequest })
  const interval = yield* Effect.try({ try: () => single(query, "interval") ?? "month", catch: (cause) => cause as InvalidRequest })
  if (interval !== "day" && interval !== "week" && interval !== "month") return yield* invalid("Invalid interval")
  return { ...(yield* parseStatsHistoryWindow(query, now)), interval: interval as Interval }
})
const loadArchiveDays = (start: Date, end: Date) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.unsafe<ArchiveDayRow>(`SELECT day.key AS archive_day,day.value AS stats
    FROM war_archive_packs pack CROSS JOIN LATERAL jsonb_each(COALESCE(pack.stats->'byDay','{}'::jsonb)) day
    WHERE pack.status='uploaded' AND day.key >= $1 AND day.key <= $2 ORDER BY day.key`, [day(start), day(end)])
})

export const queryWarHitrates = (query: URLSearchParams, now = new Date()) => failure("War hit-rate query failed", Effect.gen(function* () {
  const options = yield* parseIntervalWindow(query, new Set(["time[after]", "time[before]", "interval", "townHall"]), now)
  const selectedTownHall = yield* Effect.try({ try: () => integer(query, "townHall", 1, 20), catch: (cause) => cause as InvalidRequest })
  const rows = yield* loadArchiveDays(options.start, options.end)
  const output = new Map<string, { period: string; townHall: number; attacks: number; stars: [number, number, number, number]; destruction: number; duration: number }>()
  for (const row of rows) for (const [matchup, value] of Object.entries(archiveDay(row.stats).regularHitRates ?? {})) {
    const [attacker, defender, extra] = matchup.split(":").map(Number)
    if (extra !== undefined || !Number.isInteger(attacker) || attacker !== defender || selectedTownHall !== undefined && attacker !== selectedTownHall) continue
    const at = period(row.archive_day, options.interval), key = `${at}\0${attacker}`
    const item = output.get(key) ?? { period: at, townHall: attacker!, attacks: 0, stars: [0, 0, 0, 0], destruction: 0, duration: 0 }
    const outcomes = [value.zeroStars, value.oneStars, value.twoStars, value.threeStars]
    item.attacks += number(value.attacks)
    outcomes.forEach((outcome, stars) => {
      const count = number(outcome?.attacks)
      item.stars[stars] = (item.stars[stars] ?? 0) + count
      item.destruction += stars === 3 ? count * 100 : number(outcome?.destructionPercent)
      item.duration += number(outcome?.durationSeconds)
    })
    output.set(key, item)
  }
  return { items: [...output.values()].sort((a, b) => a.period.localeCompare(b.period) || a.townHall - b.townHall).map((item) => ({
    period: item.period, townHall: item.townHall, attacks: item.attacks,
    stars: item.stars.map((count, stars) => ({ stars, count })),
    averageStars: item.attacks === 0 ? 0 : item.stars.reduce((sum, count, stars) => sum + count * stars, 0) / item.attacks,
    averageDestruction: item.attacks === 0 ? 0 : item.destruction / item.attacks,
    averageDuration: item.attacks === 0 ? 0 : item.duration / item.attacks,
  })) }
})) as Effect.Effect<unknown, DatabaseFailure | InvalidRequest, SqlClient.SqlClient>

export const queryWarSummary = (query: URLSearchParams, now = new Date()) => failure("War summary query failed", Effect.gen(function* () {
  const options = yield* parseIntervalWindow(query, new Set(["time[after]", "time[before]", "interval", "warSize", "groupBy"]), now)
  const warSize = yield* Effect.try({ try: () => integer(query, "warSize", 1, 100), catch: (cause) => cause as InvalidRequest })
  const groupBy = yield* Effect.try({ try: () => single(query, "groupBy"), catch: (cause) => cause as InvalidRequest })
  if (groupBy !== undefined && groupBy !== "warSize") return yield* invalid("groupBy must be warSize")
  const rows = yield* loadArchiveDays(options.start, options.end)
  const output = new Map<string, { period: string; warSize?: number; wars: number; draws: number; missedAttacks: number; townHalls: Map<number, number> }>()
  for (const row of rows) {
    const stats = archiveDay(row.stats), at = period(row.archive_day, options.interval)
    const matched = Object.entries(stats.regularByWarSize ?? {}).filter(([raw]) => warSize === undefined || Number(raw) === warSize)
    if (groupBy === undefined && matched.length > 0) {
      const current = output.get(at) ?? { period: at, wars: 0, draws: 0, missedAttacks: 0, townHalls: new Map() }
      current.missedAttacks += number(stats.totalMissedAttacks)
      output.set(at, current)
    }
    for (const [rawSize, value] of matched) {
      const size = Number(rawSize)
      if (!Number.isInteger(size) || size < 1) continue
      const key = groupBy === "warSize" ? `${at}\0${size}` : at
      const current = output.get(key) ?? { period: at, ...(groupBy === "warSize" ? { warSize: size } : {}), wars: 0, draws: 0, missedAttacks: 0, townHalls: new Map() }
      current.wars += number(value.wars); current.draws += number(value.ties)
      for (const [rawLevel, count] of Object.entries(value.townhalls ?? {})) {
        const level = Number(rawLevel)
        if (Number.isInteger(level)) current.townHalls.set(level, (current.townHalls.get(level) ?? 0) + number(count))
      }
      output.set(key, current)
    }
  }
  return { items: [...output.values()].sort((a, b) => a.period.localeCompare(b.period) || (a.warSize ?? 0) - (b.warSize ?? 0)).map((item) => ({
    period: item.period, ...(item.warSize === undefined ? {} : { warSize: item.warSize }), wars: item.wars,
    accounts: [...item.townHalls.values()].reduce((sum, count) => sum + count, 0),
    townHalls: [...item.townHalls].sort(([a], [b]) => b - a).map(([level, count]) => ({ level, count })),
    draws: item.draws, ...(groupBy === undefined ? { missedAttacks: item.missedAttacks } : {}),
  })) }
})) as Effect.Effect<unknown, DatabaseFailure | InvalidRequest, SqlClient.SqlClient>

export const dispatchStatsHistory = (request: Request) => Effect.gen(function* () {
  if (request.method !== "GET") return undefined
  const url = new URL(request.url)
  if (url.pathname === "/v2/stats/wars/hitrates") return Response.json(yield* queryWarHitrates(url.searchParams))
  if (url.pathname === "/v2/stats/wars/summary") return Response.json(yield* queryWarSummary(url.searchParams))
  return undefined
})
