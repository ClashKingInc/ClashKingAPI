import { Effect } from "effect"

import { InvalidRequest } from "./errors.js"

export type LeagueMode = "legend" | "ranked"
export type ArmySort = "averageDestruction" | "averageDuration" | "tripleRate" | "usage" | "zeroStarRate"
export interface AnalyticsWindow {
  readonly start: Date
  readonly end: Date
  readonly firstDay: string
  readonly lastDay: string
  readonly calendarDays: number
}
export interface ArmySearchOptions {
  readonly window: AnalyticsWindow
  readonly heroIds: readonly number[]
  readonly equipmentIds: readonly number[]
  readonly minimumAttacks: number
  readonly minimumPlayers: number
  readonly minimumTripleRate: number
  readonly sort: ArmySort
  readonly direction: "asc" | "desc"
  readonly limit: number
}
export interface LeagueHitRateOptions {
  readonly window: AnalyticsWindow
  readonly mode?: LeagueMode
  readonly leagueTierId?: number
  readonly townHallLevel?: number
}
export interface LegendDaysOptions {
  readonly window: AnalyticsWindow
}

const day = 86_400_000
const invalid = (message: string) => new InvalidRequest({ message })
const assertKeys = (query: URLSearchParams, allowed: ReadonlySet<string>) => {
  for (const key of query.keys()) if (!allowed.has(key)) throw invalid(`Unsupported query parameter: ${key}`)
}
const single = (query: URLSearchParams, key: string): string | undefined => {
  const values = query.getAll(key)
  if (values.length > 1) throw invalid(`${key} may be supplied only once`)
  const value = values[0]?.trim()
  return value ? value : undefined
}
const integer = (query: URLSearchParams, key: string, minimum: number, maximum: number): number | undefined => {
  const raw = single(query, key)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!/^\d+$/u.test(raw) || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw invalid(`Invalid ${key}`)
  return value
}
const decimal = (query: URLSearchParams, key: string, minimum: number, maximum: number): number | undefined => {
  const raw = single(query, key)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw invalid(`Invalid ${key}`)
  return value
}
const idList = (query: URLSearchParams, key: string): readonly number[] => {
  const raw = single(query, key)
  if (raw === undefined) return []
  const ids = [...new Set(raw.split(",").map((entry) => entry.trim()))]
  if (ids.length > 10 || ids.some((entry) => !/^\d+$/u.test(entry) || Number(entry) > 2_147_483_647)) throw invalid(`Invalid ${key}`)
  return ids.map(Number)
}
const parseTime = (raw: string, key: string, end: boolean): Date => {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(raw)) {
    const value = new Date(`${raw}T${end ? "23:59:59.999" : "00:00:00.000"}Z`)
    if (Number.isNaN(value.valueOf()) || value.toISOString().slice(0, 10) !== raw) throw invalid(`Invalid ${key}`)
    return value
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(raw)) throw invalid(`Invalid ${key}`)
  const value = new Date(raw)
  if (Number.isNaN(value.valueOf())) throw invalid(`Invalid ${key}`)
  return value
}
const utcDay = (value: Date) => value.toISOString().slice(0, 10)
/** Complete Legend days: inclusive date labels, or half-open aligned timestamps. */
export const parseLegendAggregateWindow = (
  query: URLSearchParams,
  now = new Date(),
  options: { readonly defaultDays?: number; readonly maximumDays: number },
): AnalyticsWindow => {
  const offset = (5 * 60 + 10) * 60_000
  const boundary = (raw: string, key: string, before: boolean) => {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/u.test(raw)
    const value = parseTime(raw, key, false)
    if (dateOnly) return new Date(value.valueOf() + offset + (before ? day : 0))
    if ((value.valueOf() - offset) % day !== 0) throw invalid(`${key} must align to 05:10 UTC for complete Legend days`)
    return value
  }
  const rawAfter = single(query, "time[after]"), rawBefore = single(query, "time[before]")
  const end = rawBefore === undefined
    ? new Date(Math.floor((now.valueOf() - offset) / day) * day + offset)
    : boundary(rawBefore, "time[before]", true)
  const start = rawAfter === undefined ? new Date(end.valueOf() - (options.defaultDays ?? 30) * day)
    : boundary(rawAfter, "time[after]", false)
  const calendarDays = (end.valueOf() - start.valueOf()) / day
  if (calendarDays < 1) throw invalid("Time range must include at least one complete Legend day")
  if (calendarDays > options.maximumDays) throw invalid(`Time range cannot exceed ${options.maximumDays} Legend days`)
  return { start, end, firstDay: utcDay(start), lastDay: utcDay(new Date(end.valueOf() - day)), calendarDays }
}

export const parseAnalyticsWindow = (
  query: URLSearchParams,
  now = new Date(),
  options: { readonly defaultDays?: number; readonly maximumDays: number },
): AnalyticsWindow => {
  const rawAfter = single(query, "time[after]")
  const rawBefore = single(query, "time[before]")
  const end = rawBefore === undefined ? now : parseTime(rawBefore, "time[before]", true)
  const defaultDays = options.defaultDays ?? 30
  const defaultStartDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - (defaultDays - 1) * day)
  const start = rawAfter === undefined ? defaultStartDay : parseTime(rawAfter, "time[after]", false)
  if (start > end) throw invalid("time[after] must not exceed time[before]")
  const firstDay = utcDay(start), lastDay = utcDay(end)
  const calendarDays = Math.round((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${firstDay}T00:00:00Z`)) / day) + 1
  if (calendarDays > options.maximumDays) throw invalid(`Time range cannot exceed ${options.maximumDays} UTC days`)
  return { start, end, firstDay, lastDay, calendarDays }
}

export const parseArmySearchQuery = (query: URLSearchParams, now = new Date()) => Effect.try({
  try: (): ArmySearchOptions => {
    assertKeys(query, new Set(["time[after]", "time[before]", "heroIds", "equipmentIds", "minimumAttacks", "minimumPlayers", "minimumTripleRate", "sort", "direction", "limit"]))
    const window = parseLegendAggregateWindow(query, now, { maximumDays: 30 })
    const sort = single(query, "sort") ?? "usage"
    if (!["usage", "tripleRate", "zeroStarRate", "averageDuration", "averageDestruction"].includes(sort)) throw invalid("Invalid sort")
    const direction = single(query, "direction") ?? "desc"
    if (direction !== "asc" && direction !== "desc") throw invalid("Invalid direction")
    const maximumLimit = window.calendarDays === 1 ? 250 : 10
    return {
      window,
      heroIds: idList(query, "heroIds"),
      equipmentIds: idList(query, "equipmentIds"),
      minimumAttacks: integer(query, "minimumAttacks", 0, 1_000_000_000) ?? 0,
      minimumPlayers: integer(query, "minimumPlayers", 0, 1_000_000_000) ?? 0,
      minimumTripleRate: decimal(query, "minimumTripleRate", 0, 1) ?? 0,
      sort: sort as ArmySort,
      direction,
      limit: integer(query, "limit", 1, maximumLimit) ?? Math.min(10, maximumLimit),
    }
  },
  catch: (cause) => cause instanceof InvalidRequest ? cause : invalid("Invalid army search query"),
})

export const parseLeagueHitRateQuery = (query: URLSearchParams, now = new Date()) => Effect.try({
  try: (): LeagueHitRateOptions => {
    assertKeys(query, new Set(["time[after]", "time[before]", "mode", "leagueTierId", "townHallLevel"]))
    const rawMode = single(query, "mode")
    if (rawMode !== undefined && rawMode !== "ranked" && rawMode !== "legend") throw invalid("Invalid mode")
    const leagueTierId = integer(query, "leagueTierId", 1, 2_147_483_647)
    const townHallLevel = integer(query, "townHallLevel", 1, 20)
    return { window: parseAnalyticsWindow(query, now, { maximumDays: 90 }),
      ...(rawMode === undefined ? {} : { mode: rawMode }), ...(leagueTierId === undefined ? {} : { leagueTierId }),
      ...(townHallLevel === undefined ? {} : { townHallLevel }) }
  },
  catch: (cause) => cause instanceof InvalidRequest ? cause : invalid("Invalid league hit-rate query"),
})

export const parseLegendDaysQuery = (query: URLSearchParams, now = new Date()) => Effect.try({
  try: (): LegendDaysOptions => {
    assertKeys(query, new Set(["time[after]", "time[before]"]))
    return { window: parseLegendAggregateWindow(query, now, { maximumDays: 90 }) }
  },
  catch: (cause) => cause instanceof InvalidRequest ? cause : invalid("Invalid Legend-day query"),
})

export const parsePlayerHistoryWindow = (query: URLSearchParams, now = new Date(), maximumDays = 365) => Effect.try({
  try: () => {
    assertKeys(query, new Set(["time[after]", "time[before]"]))
    return parseAnalyticsWindow(query, now, { maximumDays })
  },
  catch: (cause) => cause instanceof InvalidRequest ? cause : invalid("Invalid player history query"),
})
