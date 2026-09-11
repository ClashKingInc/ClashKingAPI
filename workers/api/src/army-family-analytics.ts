import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { InvalidRequest, NotFound } from "./errors.js"
import { normalizeArmyLink, parseArmyLinkQuery } from "./army-link.js"
import { parseArmySearchQuery, parseLegendAggregateWindow, type AnalyticsWindow, type ArmySearchOptions } from "./league-analytics-query.js"

export interface FamilyIdentityRow {
  family_id: string; name: string | null; representative_share_code: string; hero_ids: number[]; equipment_ids: number[]
}
interface FamilyStatisticsRow extends FamilyIdentityRow {
  attacks: number; players: number | null; zero: number; one: number; two: number; three: number
  destruction: number; duration: number; total_legend_attacks: number
}
export const familyIdentity = (row: FamilyIdentityRow) => ({ familyId: row.family_id, name: row.name,
  shareCode: row.representative_share_code, heroIds: row.hero_ids, equipmentIds: row.equipment_ids })
export const resultStatistics = (row: Omit<FamilyStatisticsRow, keyof FamilyIdentityRow | "total_legend_attacks">) => ({
  attacks: Number(row.attacks), players: row.players === null ? null : Number(row.players),
  starCounts: { zero: Number(row.zero), one: Number(row.one), two: Number(row.two), three: Number(row.three) },
  averageDuration: Number(row.attacks) === 0 ? null : Number(row.duration) / Number(row.attacks),
  averageDestruction: Number(row.attacks) === 0 ? null : Number(row.destruction) / Number(row.attacks),
})
const familyStatistics = (row: FamilyStatisticsRow) => ({ familyId: row.family_id, name: row.name,
  shareCode: row.representative_share_code, ...resultStatistics(row), totalLegendAttacks: Number(row.total_legend_attacks) })
export const parseFamilyId = (raw: unknown) => Effect.try({ try: (): string => {
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/u.test(raw) || BigInt(raw) > 9223372036854775807n)
    throw new InvalidRequest({ message: "Invalid family ID" })
  return raw
}, catch: () => new InvalidRequest({ message: "Invalid family ID" }) })
export const aggregateWindow = (query: URLSearchParams, now = new Date(), maximumDays = 90, defaultDays = 30) => Effect.try({
  try: () => {
    for (const key of query.keys()) if (key !== "time[after]" && key !== "time[before]") throw new InvalidRequest({ message: `Unsupported query parameter: ${key}` })
    return parseLegendAggregateWindow(query, now, { maximumDays, defaultDays })
  }, catch: (cause) => cause instanceof InvalidRequest ? cause : new InvalidRequest({ message: "Invalid Legend aggregate window" }),
})

const familyRead = (options: ArmySearchOptions, extra: { familyId?: string; search?: string; named?: string; page?: number; admin?: boolean } = {}) => Effect.gen(function* () {
  if (options.window.calendarDays > 1 && options.minimumPlayers > 0) {
    return yield* new InvalidRequest({ message: "minimumPlayers is available only for a single daily aggregate" })
  }
  const sql = yield* SqlClient.SqlClient, w = options.window
  const values: unknown[] = [w.firstDay, w.lastDay, options.cohort]
  const filters: string[] = []
  const param = (value: unknown) => { values.push(value); return `$${values.length}` }
  if (extra.familyId) filters.push(`f.family_id=${param(extra.familyId)}::bigint`)
  if (extra.named === "named") filters.push("f.name IS NOT NULL")
  if (extra.named === "unnamed") filters.push("f.name IS NULL")
  if (options.heroIds.length) filters.push(`composition.heroes @> ${param(options.heroIds)}::integer[]`)
  if (options.equipmentIds.length) filters.push(`composition.equipment @> ${param(options.equipmentIds.map((equipmentId) => ({ equipmentId })))}::jsonb`)
  if (extra.search) {
    let code: string | undefined
    try { code = normalizeArmyLink(extra.search) } catch { /* A plain name need not be a code. */ }
    const search = param(extra.search), exactCode = param(code ?? null)
    filters.push(`(strpos(lower(COALESCE(f.name,'')),lower(${search}))>0 OR f.family_id::text=${search}
      OR EXISTS (SELECT 1 FROM army_family_members sm WHERE sm.family_id=f.family_id AND sm.share_code=${exactCode}))`)
  }
  const minAttacks = param(options.minimumAttacks), minPlayers = param(options.minimumPlayers), minRate = param(options.minimumTripleRate)
  const limit = param(options.limit + (extra.admin ? 1 : 0)), offset = param(((extra.page ?? 1) - 1) * options.limit)
  const order = { usage: "attacks", tripleRate: "three::float8/NULLIF(attacks,0)", zeroStarRate: "zero::float8/NULLIF(attacks,0)",
    averageDuration: "duration::float8/NULLIF(attacks,0)", averageDestruction: "destruction::float8/NULLIF(attacks,0)" }[options.sort]
  const result = yield* sql.unsafe<{ items: FamilyStatisticsRow[] }>(`WITH eligible AS (SELECT f.family_id,f.name,f.representative_share_code,
      composition.heroes hero_ids,ARRAY(SELECT (entry->>'equipmentId')::integer FROM jsonb_array_elements(composition.equipment) entry ORDER BY (entry->>'equipmentId')::integer) equipment_ids
      FROM army_families f JOIN army_compositions composition ON composition.share_code=f.representative_share_code
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}),
    totals AS (SELECT s.family_id,sum(s.attack_count)::bigint attacks,sum(s.distinct_player_count)::bigint day_players,
      sum(s.zero_star_count)::bigint zero,sum(s.one_star_count)::bigint one,sum(s.two_star_count)::bigint two,
      sum(s.three_star_count)::bigint three,sum(s.destruction_percentage_sum)::bigint destruction,
      sum(s.duration_seconds_sum)::bigint duration
      FROM army_family_daily_stats s JOIN eligible f ON f.family_id=s.family_id
      WHERE s.day BETWEEN $1::date AND $2::date AND s.cohort=$3 GROUP BY s.family_id),
    measured AS (SELECT f.family_id::text family_id,f.name,f.representative_share_code,f.hero_ids,f.equipment_ids,
      COALESCE(t.attacks,0) attacks,${w.calendarDays > 1 ? "NULL::bigint" : "COALESCE(t.day_players,0)"} players,
      COALESCE(t.zero,0) zero,COALESCE(t.one,0) one,COALESCE(t.two,0) two,COALESCE(t.three,0) three,
      COALESCE(t.destruction,0) destruction,COALESCE(t.duration,0) duration,
      (SELECT COALESCE(sum(attack_count),0)::bigint FROM legend_daily_stats WHERE day BETWEEN $1::date AND $2::date AND cohort=$3) total_legend_attacks
      FROM eligible f ${extra.admin || extra.familyId ? "LEFT" : "INNER"} JOIN totals t ON t.family_id=f.family_id),
    selected AS (SELECT * FROM measured WHERE attacks>=${minAttacks} AND (${minPlayers}=0 OR players>=${minPlayers})
      AND (${minRate}=0 OR three::float8/NULLIF(attacks,0)>=${minRate})
      ORDER BY ${order} ${options.direction.toUpperCase()} NULLS LAST,family_id::bigint LIMIT ${limit} OFFSET ${offset})
    SELECT COALESCE((SELECT jsonb_agg(selected) FROM selected),'[]'::jsonb) items`, values)
  return result[0]?.items ?? []
})
const basicOptions = (window: AnalyticsWindow, cohort: ArmySearchOptions["cohort"] = "legend_i"): ArmySearchOptions => ({ window, cohort, heroIds: [], equipmentIds: [], minimumAttacks: 0,
  minimumPlayers: 0, minimumTripleRate: 0, sort: "usage", direction: "desc", limit: 1 })
export const queryArmySearch = (query: URLSearchParams, now = new Date()) => Effect.gen(function* () {
  const options = yield* parseArmySearchQuery(query, now)
  const rows = yield* familyRead(options)
  return { cohort: options.cohort, items: rows.map(familyStatistics) }
})
const aggregateSelection = (query: URLSearchParams, now: Date, maximumDays: number) => Effect.gen(function* () {
  const cohort = query.get("cohort") ?? "legend_i"
  if (query.getAll("cohort").length > 1 || !["legend_i", "top_1000", "top_200"].includes(cohort)) {
    return yield* new InvalidRequest({ message: "Invalid cohort" })
  }
  const time = new URLSearchParams(query)
  time.delete("cohort")
  return { cohort: cohort as ArmySearchOptions["cohort"], window: yield* aggregateWindow(time, now, maximumDays) }
})
export const resolveCodeFamily = (shareCode: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<FamilyIdentityRow>(`SELECT f.family_id::text,f.name,f.representative_share_code,
    composition.heroes hero_ids,ARRAY(SELECT (entry->>'equipmentId')::integer FROM jsonb_array_elements(composition.equipment) entry ORDER BY (entry->>'equipmentId')::integer) equipment_ids
    FROM army_family_members m JOIN army_families f ON f.family_id=m.family_id
    JOIN army_compositions composition ON composition.share_code=f.representative_share_code WHERE m.share_code=$1`, [shareCode])
  if (!rows[0]) return yield* new NotFound({ message: "Army family not found" })
  return rows[0]
})
export const queryArmyDetail = (query: URLSearchParams, now = new Date()) => Effect.gen(function* () {
  const { shareCode, timeQuery } = yield* parseArmyLinkQuery(query), selection = yield* aggregateSelection(timeQuery, now, 90)
  const family = yield* resolveCodeFamily(shareCode), rows = yield* familyRead(basicOptions(selection.window, selection.cohort), { familyId: family.family_id })
  if (!rows[0]) return yield* new NotFound({ message: "Army family not found" })
  return { cohort: selection.cohort, ...familyStatistics(rows[0]) }
})
export const queryArmyTimeline = (query: URLSearchParams, now = new Date()) => Effect.gen(function* () {
  const { shareCode, timeQuery } = yield* parseArmyLinkQuery(query), selection = yield* aggregateSelection(timeQuery, now, 365), window = selection.window
  const family = yield* resolveCodeFamily(shareCode), sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<FamilyStatisticsRow & { day: string | Date }>(`SELECT s.day,s.attack_count attacks,s.distinct_player_count players,
    s.zero_star_count zero,s.one_star_count one,s.two_star_count two,s.three_star_count three,
    s.destruction_percentage_sum destruction,s.duration_seconds_sum duration,g.attack_count total_legend_attacks
    FROM army_family_daily_stats s JOIN legend_daily_stats g ON g.day=s.day AND g.cohort=s.cohort
    WHERE s.family_id=$1::bigint AND s.cohort=$2 AND s.day BETWEEN $3::date AND $4::date ORDER BY s.day`, [family.family_id, selection.cohort, window.firstDay, window.lastDay])
  return { cohort: selection.cohort, familyId: family.family_id, name: family.name, shareCode: family.representative_share_code,
    items: rows.map(row => ({ day: new Date(row.day).toISOString().slice(0,10), ...resultStatistics(row), players: Number(row.players), totalLegendAttacks: Number(row.total_legend_attacks) })) }
})
export const queryAdminFamilies = (query: URLSearchParams, now = new Date()) => Effect.gen(function* () {
  const paging = yield* parseFamilyPaging(query)
  const search = query.get("search")?.trim() ?? "", named = query.get("named") ?? "all"
  if (search.length > 8192 || !["all", "named", "unnamed"].includes(named)) return yield* new InvalidRequest({ message: "Invalid family search" })
  const publicQuery = new URLSearchParams(query)
  for (const key of ["search", "named", "page", "limit"]) publicQuery.delete(key)
  if (!publicQuery.has("time[after]") && !publicQuery.has("time[before]")) {
    const w = yield* aggregateWindow(new URLSearchParams(), now, 30, 1)
    publicQuery.set("time[after]", w.firstDay); publicQuery.set("time[before]", w.lastDay)
  }
  const options = yield* parseArmySearchQuery(publicQuery, now)
  const rows = yield* familyRead({ ...options, limit: paging.limit }, { admin: true, page: paging.page, search, named })
  return { ...paging, hasMore: rows.length > paging.limit, items: rows.slice(0,paging.limit).map(row => ({ ...familyIdentity(row),
    statistics: { ...resultStatistics(row), totalLegendAttacks: Number(row.total_legend_attacks) } })) }
})
export const parseFamilyPaging = (query: URLSearchParams) => Effect.try({ try: () => {
  for (const key of query.keys()) if (query.getAll(key).length > 1) throw new InvalidRequest({ message: `${key} may be supplied only once` })
  const read = (key: string, fallback: number, maximum: number) => {
    const raw = query.get(key)
    if (raw === null) return fallback
    if (query.getAll(key).length !== 1 || !/^[1-9][0-9]*$/u.test(raw) || Number(raw)>maximum) throw new InvalidRequest({ message: `Invalid ${key}` })
    return Number(raw)
  }
  return { page: read("page",1,1_000_000), limit: read("limit",100,200) }
}, catch: cause => cause instanceof InvalidRequest ? cause : new InvalidRequest({ message: "Invalid pagination" }) })

export const queryAdminFamilyMembers = (rawId: string, query: URLSearchParams, _now = new Date()) => Effect.gen(function* () {
  const id = yield* parseFamilyId(rawId), paging = yield* parseFamilyPaging(query)
  for (const key of query.keys()) if (key !== "page" && key !== "limit") return yield* new InvalidRequest({ message: `Unsupported query parameter: ${key}` })
  const sql = yield* SqlClient.SqlClient
  const family = yield* sql.unsafe<{ family_id: string }>("SELECT family_id::text FROM army_families WHERE family_id=$1::bigint", [id])
  if (!family[0]) return yield* new NotFound({ message: "Army family not found" })
  const rows = yield* sql.unsafe<{ share_code: string }>(`SELECT share_code FROM army_family_members
    WHERE family_id=$1::bigint ORDER BY share_code LIMIT $2 OFFSET $3`, [id,paging.limit+1,(paging.page-1)*paging.limit])
  return { familyId: id, ...paging, hasMore: rows.length > paging.limit, items: rows.slice(0,paging.limit).map(row => ({
    shareCode: row.share_code,
  })) }
})
