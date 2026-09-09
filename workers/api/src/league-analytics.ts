import {
  ArmyDetailResponse,
  ArmySearchResponse,
  ArmyTimelineResponse,
  LeagueHitRateHistoryResponse,
  LegendBattlelogResponse,
  LegendDaysResponse,
  PlayerBattlelogHistoryResponse,
  PlayerLeagueHistoryResponse,
  RankedBattlelogResponse,
  RankedGroupResponse,
  LeagueTierStatisticsResponse,
} from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import {
  parseArmySearchQuery,
  parseLeagueHitRateQuery,
  parseLegendDaysQuery,
  parsePlayerHistoryWindow,
  type AnalyticsWindow,
} from "./league-analytics-query.js"
import { parseArmyLinkQuery } from "./army-link.js"
import { hasStaticItemId, lookupStaticItem } from "./static-metadata.js"

const database = <A>(message: string, effect: Effect.Effect<A, unknown, SqlClient.SqlClient>) => effect.pipe(
  Effect.mapError((cause) => cause instanceof InvalidRequest || cause instanceof NotFound
    ? cause
    : new DatabaseFailure({ cause, message })),
)
const number = (value: number | string | null): number => value === null ? 0 : Number(value)
const iso = (value: Date | string): string => new Date(value).toISOString()
const day = (value: Date | string): string => iso(value).slice(0, 10)
const average = (sum: number | string | null, count: number): number | null => count === 0 ? null : number(sum) / count
const league = (id: number | string) => {
  const leagueId = number(id)
  return { id: leagueId, name: lookupStaticItem("league_tiers", leagueId)?.name ?? "Unknown" }
}
const parseJson = <A>(value: A | string): A => typeof value === "string" ? JSON.parse(value) as A : value
const starCounts = (row: { zero: number | string; one: number | string; two: number | string; three: number | string }) =>
  ({ zero: number(row.zero), one: number(row.one), two: number(row.two), three: number(row.three) })

export const normalizeClashTag = (raw: string): Effect.Effect<string, InvalidRequest> => Effect.try({
  try: () => {
    const tag = `#${raw.trim().toUpperCase().replace(/^[#!]+/u, "").replaceAll("O", "0")}`
    if (!/^#[0289PYLQGRJCUV]{1,15}$/u.test(tag)) throw new InvalidRequest({ message: "Invalid Clash tag" })
    return tag
  },
  catch: (cause) => cause instanceof InvalidRequest ? cause : new InvalidRequest({ message: "Invalid Clash tag" }),
})
const positiveId = (raw: string, label: string): Effect.Effect<string, InvalidRequest> => Effect.try({
  try: () => {
    if (!/^\d+$/u.test(raw) || BigInt(raw) < 1n) throw new InvalidRequest({ message: `Invalid ${label}` })
    return raw
  },
  catch: (cause) => cause instanceof InvalidRequest ? cause : new InvalidRequest({ message: `Invalid ${label}` }),
})
const normalizedLoot = (value: unknown) => {
  const raw = parseJson<Record<string, unknown>>(value as Record<string, unknown> | string)
  return { gold: number(raw.gold as number ?? 0), elixir: number(raw.elixir as number ?? 0), darkElixir: number(raw.darkElixir as number ?? 0) }
}

export const attackTrophies = (stars: number, destruction: number): number => {
  const bounded = Math.max(0, Math.min(100, Math.trunc(destruction)))
  if (stars >= 3) return 40
  if (stars === 2) return 16 + Math.min(16, Math.max(0, Math.floor((bounded - 50) / 3)))
  if (stars === 1) return 5 + Math.min(10, Math.max(0, Math.floor((bounded - 1) / 9)))
  return Math.min(4, Math.floor(bounded / 10))
}
export const rankedDefenseTrophies = (stars: number, destruction: number): number => 40 - attackTrophies(stars, destruction)
export const legendDefenseTrophies = (stars: number, destruction: number): number => -attackTrophies(stars, destruction)

interface BattleRow {
  battle_time: Date | string
  direction: "attack" | "defense"
  player_town_hall: number
  opponent_tag: string
  opponent_name: string | null
  opponent_town_hall: number
  stars: number
  destruction_percentage: number | string
  duration_seconds: number | null
  looted_resources: unknown
  share_code: string | null
}
const battle = (row: BattleRow, mode: "ranked" | "legend") => {
  const stars = number(row.stars), destruction = number(row.destruction_percentage)
  const trophies = row.direction === "attack" ? attackTrophies(stars, destruction)
    : mode === "ranked" ? rankedDefenseTrophies(stars, destruction) : legendDefenseTrophies(stars, destruction)
  return { time: iso(row.battle_time), townHallLevel: number(row.player_town_hall),
    opponent: { tag: row.opponent_tag, name: row.opponent_name?.trim() || "Unknown", townHallLevel: number(row.opponent_town_hall) },
    stars, destructionPercentage: destruction, duration: row.duration_seconds === null ? null : number(row.duration_seconds),
    lootedResources: normalizedLoot(row.looted_resources), shareCode: row.share_code, trophies }
}
const battleSql = `SELECT b.battle_time,b.direction,b.player_town_hall,b.opponent_tag,p.name AS opponent_name,
  b.opponent_town_hall,b.stars,b.destruction_percentage,b.duration_seconds,b.looted_resources,b.share_code
  FROM battles_ranked b LEFT JOIN basic_player p ON p.tag=b.opponent_tag`

interface RankedMemberRow {
  season_id: number | string
  group_tag: string
  league_tier_id: number
  player_tag: string
  player_name: string
  town_hall: number | null
  maximum_battle_count: number
  attack_win_count: number
  attack_loss_count: number
  attack_star_count: number
  defense_win_count: number
  defense_loss_count: number
  defense_star_count: number
  league_trophies: number
  placement: number
}
const registeredAttacks = (row: RankedMemberRow) => number(row.attack_win_count) + number(row.attack_loss_count)
const registeredDefenses = (row: RankedMemberRow) => number(row.defense_win_count) + number(row.defense_loss_count)
const member = (row: RankedMemberRow) => ({ tag: row.player_tag, name: row.player_name, townHallLevel: row.town_hall === null ? null : number(row.town_hall),
  attackLosses: number(row.attack_loss_count), attackStars: number(row.attack_star_count), attackWins: number(row.attack_win_count),
  defenseLosses: number(row.defense_loss_count), defenseStars: number(row.defense_star_count), defenseWins: number(row.defense_win_count),
  leagueTrophies: number(row.league_trophies), placement: number(row.placement) })
const rankedMemberSql = `SELECT season_id,group_tag,league_tier_id,player_tag,player_name,town_hall,maximum_battle_count,
  attack_win_count,attack_loss_count,attack_star_count,defense_win_count,defense_loss_count,defense_star_count,league_trophies,placement
  FROM ranked_league_group_members`

export const queryRankedBattlelog = (rawTag: string, rawSeason: string) => database("Ranked battlelog query failed", Effect.gen(function* () {
  const season = yield* positiveId(rawSeason, "Ranked season"), tag = yield* normalizeClashTag(rawTag), sql = yield* SqlClient.SqlClient
  const members = yield* sql.unsafe<RankedMemberRow>(`${rankedMemberSql} WHERE player_tag=$1 AND season_id=$2::bigint LIMIT 1`, [tag, season])
  const roster = members[0]
  if (roster === undefined) return yield* new NotFound({ message: "Ranked tournament entry not found" })
  const rows = yield* sql.unsafe<BattleRow>(`${battleSql} WHERE b.player_tag=$1 AND b.battle_mode='ranked'
    AND b.battle_time >= to_timestamp($2::bigint) AND b.battle_time < to_timestamp($2::bigint)+interval '7 days'
    ORDER BY b.battle_time,b.direction,b.opponent_tag`, [tag, season])
  const values = rows.map((row) => battle(row, "ranked"))
  const attacks = values.filter((_, index) => rows[index]?.direction === "attack")
  const realDefenses = values.filter((_, index) => rows[index]?.direction === "defense")
  const registered = registeredDefenses(roster)
  const automaticCount = realDefenses.length === registered ? Math.max(0, number(roster.maximum_battle_count) - registered) : 0
  const automaticTrophies = realDefenses.length === 0 ? undefined
    : Math.floor(realDefenses.reduce((sum, item) => sum + item.trophies, 0) / realDefenses.length)
  const defenses = [...realDefenses, ...(automaticTrophies === undefined ? []
    : Array.from({ length: automaticCount }, () => ({ trophies: automaticTrophies, automatic: true as const })))]
  const attackTotal = attacks.reduce((sum, item) => sum + item.trophies, 0)
  const defenseTotal = defenses.reduce((sum, item) => sum + item.trophies, 0)
  return { tag, seasonId: season, leagueGroupId: roster.group_tag, league: league(roster.league_tier_id),
    maxBattles: number(roster.maximum_battle_count), registeredAttacks: registeredAttacks(roster), registeredDefenses: registered,
    attackTrophies: attackTotal, defenseTrophies: defenseTotal, trophies: attackTotal + defenseTotal, attacks, defenses }
}))

const legendWindow = (raw: string): { start: Date; end: Date } | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(raw)) return undefined
  const start = new Date(`${raw}T05:00:00.000Z`)
  if (Number.isNaN(start.valueOf()) || start.toISOString().slice(0, 10) !== raw) return undefined
  return { start, end: new Date(start.valueOf() + 86_400_000) }
}
export const queryLegendBattlelog = (rawTag: string, rawDay: string, now = new Date()) => database("Legend battlelog query failed", Effect.gen(function* () {
  const window = legendWindow(rawDay)
  if (window === undefined) return yield* new InvalidRequest({ message: "Invalid Legend day" })
  const tag = yield* normalizeClashTag(rawTag), sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<BattleRow>(`${battleSql} WHERE b.player_tag=$1 AND b.battle_mode='legend'
    AND b.battle_time >= $2 AND b.battle_time < $3 ORDER BY b.battle_time,b.direction,b.opponent_tag`, [tag, window.start, window.end])
  const values = rows.map((row) => battle(row, "legend"))
  const attacks = values.filter((_, index) => rows[index]?.direction === "attack")
  const realDefenses = values.filter((_, index) => rows[index]?.direction === "defense")
  let automaticTrophies: number | undefined
  if (now >= window.end && realDefenses.length < 8) {
    const previous = yield* sql.unsafe<Pick<BattleRow, "stars" | "destruction_percentage">>(`SELECT stars,destruction_percentage
      FROM battles_ranked WHERE player_tag=$1 AND battle_mode='legend' AND direction='defense' AND battle_time >= $2 AND battle_time < $3`,
    [tag, new Date(window.start.valueOf() - 2 * 86_400_000), window.start])
    if (previous.length > 0) automaticTrophies = Math.floor(previous.reduce((sum, row) =>
      sum + legendDefenseTrophies(number(row.stars), number(row.destruction_percentage)), 0) / previous.length)
  }
  const defenses = [...realDefenses, ...(automaticTrophies === undefined ? []
    : Array.from({ length: 8 - realDefenses.length }, () => ({ trophies: automaticTrophies, automatic: true as const })))]
  const attackTotal = attacks.reduce((sum, item) => sum + item.trophies, 0)
  const defenseTotal = defenses.reduce((sum, item) => sum + item.trophies, 0)
  return { tag, day: rawDay, attackTrophies: attackTotal, defenseTrophies: defenseTotal,
    trophies: attackTotal + defenseTotal, attacks, defenses }
}))

export const queryPlayerBattlelogHistory = (rawTag: string, query: URLSearchParams, now = new Date()) => database("Player battle history query failed", Effect.gen(function* () {
  const tag = yield* normalizeClashTag(rawTag), window = yield* parsePlayerHistoryWindow(query, now), sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<{ battle_time: Date | string; stars: number; destruction_percentage: number; duration_seconds: number | null; looted_resources: unknown; share_code: string | null }>(`
    SELECT battle_time,stars,destruction_percentage,duration_seconds,looted_resources,share_code FROM battles_farming
      WHERE player_tag=$1 AND battle_time BETWEEN $2 AND $3
    ORDER BY battle_time DESC`, [tag, window.start, window.end])
  return { items: rows.map((row) => ({ battleTime: iso(row.battle_time), stars: number(row.stars),
    destructionPercentage: number(row.destruction_percentage), duration: row.duration_seconds === null ? null : number(row.duration_seconds),
    lootedResources: normalizedLoot(row.looted_resources), shareCode: row.share_code })) }
}))

export const queryRankedGroup = (rawSeason: string, rawGroup: string) => database("Ranked group query failed", Effect.gen(function* () {
  const season = yield* positiveId(rawSeason, "Ranked season"), groupTag = yield* normalizeClashTag(rawGroup), sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<RankedMemberRow>(`${rankedMemberSql} WHERE season_id=$1::bigint AND group_tag=$2 ORDER BY placement,player_tag`, [season, groupTag])
  const first = rows[0]
  if (first === undefined) return yield* new NotFound({ message: "Ranked league group not found" })
  return { leagueGroupId: groupTag, seasonId: season, league: league(first.league_tier_id),
    maxBattles: Math.max(...rows.map((row) => number(row.maximum_battle_count))), members: rows.map(member) }
}))

interface LegendHistoryRow { season: string; league_tier_id: number | null; trophies: number; attack_wins: number; defense_wins: number; rank: number }
export const queryPlayerLeagueHistory = (rawTag: string, query: URLSearchParams, now = new Date()) => database("Player league history query failed", Effect.gen(function* () {
  const tag = yield* normalizeClashTag(rawTag), window = yield* parsePlayerHistoryWindow(query, now), sql = yield* SqlClient.SqlClient
  const ranked = yield* sql.unsafe<RankedMemberRow>(`${rankedMemberSql} WHERE player_tag=$1
    AND to_timestamp(season_id) BETWEEN $2 AND $3 ORDER BY season_id DESC`, [tag, window.start, window.end])
  const legends = yield* sql.unsafe<LegendHistoryRow>(`SELECT season,league_tier_id,trophies,attack_wins,defense_wins,rank
    FROM legend_history WHERE player_tag=$1 AND to_date(season||'-01','YYYY-MM-DD') BETWEEN $2::date AND $3::date
    ORDER BY season DESC`, [tag, window.start, window.end])
  const items = [
    ...ranked.map((row) => ({ mode: "ranked" as const, seasonId: String(row.season_id), leagueGroupId: row.group_tag,
      league: league(row.league_tier_id), maxBattles: number(row.maximum_battle_count), ...member(row) })),
    ...legends.map((row) => ({ mode: "legend" as const, season: row.season,
      league: row.league_tier_id === null ? null : league(row.league_tier_id), trophies: number(row.trophies),
      attackWins: number(row.attack_wins), defenseWins: number(row.defense_wins), rank: number(row.rank) })),
  ].sort((left, right) => {
    const a = left.mode === "ranked" ? Number(left.seasonId) * 1000 : Date.parse(`${left.season}-01T00:00:00Z`)
    const b = right.mode === "ranked" ? Number(right.seasonId) * 1000 : Date.parse(`${right.season}-01T00:00:00Z`)
    return b - a
  })
  return { items }
}))

interface FamilyRow {
  army_hash: string; family_name: string; representative_share_code: string
  attacks: number | string; players: number | string; zero: number | string; one: number | string; two: number | string; three: number | string
  destruction: number | string | null; duration: number | string | null
}
const familyStatistics = (row: FamilyRow) => {
  const attacks = number(row.attacks)
  return { armyHash: row.army_hash, name: row.family_name, shareCode: row.representative_share_code, attacks,
    players: number(row.players), starCounts: starCounts(row), averageDuration: average(row.duration, attacks),
    averageDestruction: average(row.destruction, attacks) }
}
const familyFilters = (heroIds: readonly number[], equipmentIds: readonly number[], values: Array<unknown>) => {
  const filters: string[] = []
  if (heroIds.length > 0) { values.push(heroIds); filters.push(`c.heroes @> $${values.length}::integer[]`) }
  if (equipmentIds.length > 0) {
    values.push(equipmentIds)
    filters.push(`NOT EXISTS (SELECT 1 FROM unnest($${values.length}::integer[]) requested(id)
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.equipment) item WHERE (item->>'equipmentId')::integer=requested.id))`)
  }
  return filters
}
export const queryArmySearch = (query: URLSearchParams, now = new Date()) => database("Army family search failed", Effect.gen(function* () {
  const options = yield* parseArmySearchQuery(query, now), sql = yield* SqlClient.SqlClient
  const values: Array<unknown> = [options.window.firstDay, options.window.lastDay]
  const filters = familyFilters(options.heroIds, options.equipmentIds, values)
  values.push(options.minimumAttacks, options.window.calendarDays === 1 ? options.minimumPlayers : 0,
    options.minimumTripleRate, options.limit)
  const order = ({ usage: "attacks", tripleRate: "triple_rate", zeroStarRate: "zero_star_rate",
    averageDuration: "average_duration", averageDestruction: "average_destruction" } as const)[options.sort]
  const rows = yield* sql.unsafe<FamilyRow>(`WITH totals AS (
    SELECT s.anchor_army_hash,sum(s.attack_count)::bigint attacks,sum(s.distinct_player_count)::bigint players,
      sum(s.zero_star_count)::bigint zero,sum(s.one_star_count)::bigint one,sum(s.two_star_count)::bigint two,
      sum(s.three_star_count)::bigint three,sum(s.destruction_percentage_sum)::bigint destruction,sum(s.duration_seconds_sum)::bigint duration
    FROM army_family_daily_stats s WHERE s.day BETWEEN $1::date AND $2::date GROUP BY s.anchor_army_hash
  ), measured AS (SELECT *,three::float8/NULLIF(attacks,0) triple_rate,zero::float8/NULLIF(attacks,0) zero_star_rate,
      duration::float8/NULLIF(attacks,0) average_duration,destruction::float8/NULLIF(attacks,0) average_destruction FROM totals)
  SELECT encode(f.anchor_army_hash,'hex') army_hash,f.family_name,f.representative_share_code,m.*
  FROM measured m JOIN army_families f ON f.anchor_army_hash=m.anchor_army_hash
  JOIN army_compositions c ON c.army_hash=f.anchor_army_hash
  WHERE m.attacks >= $${values.length - 3} AND m.players >= $${values.length - 2} AND m.triple_rate >= $${values.length - 1}
    ${filters.length === 0 ? "" : `AND ${filters.join(" AND ")}`}
  ORDER BY ${order} ${options.direction.toUpperCase()},f.anchor_army_hash LIMIT $${values.length}`, values)
  if (options.window.calendarDays === 1 || rows.length === 0) return { items: rows.map(familyStatistics) }
  const counts = yield* sql.unsafe<{ army_hash: string; players: number | string }>(`SELECT
    encode(COALESCE(m.anchor_army_hash,b.army_hash),'hex') army_hash,count(DISTINCT b.player_tag)::bigint players
    FROM battles_ranked b LEFT JOIN army_family_members m ON m.army_hash=b.army_hash
    JOIN army_families f ON f.anchor_army_hash=COALESCE(m.anchor_army_hash,b.army_hash)
    WHERE b.battle_mode='legend' AND b.direction='attack' AND b.battle_time BETWEEN $1 AND $2
      AND encode(f.anchor_army_hash,'hex')=ANY($3::text[])
    GROUP BY COALESCE(m.anchor_army_hash,b.army_hash)`,
  [options.window.start, options.window.end, rows.map((row) => row.army_hash)])
  const players = new Map(counts.map((row) => [row.army_hash, number(row.players)]))
  return { items: rows.map((row) => ({ ...familyStatistics(row), players: players.get(row.army_hash) ?? 0 }))
    .filter((row) => row.players >= options.minimumPlayers) }
}))

const resolveFamily = (shareCode: string) => database("Army family lookup failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<{ army_hash: string; family_name: string; representative_share_code: string }>(`
    SELECT encode(f.anchor_army_hash,'hex') army_hash,f.family_name,f.representative_share_code
    FROM army_compositions c
    LEFT JOIN army_family_members m ON m.army_hash=c.army_hash
    JOIN army_families f ON f.anchor_army_hash=COALESCE(m.anchor_army_hash,c.army_hash)
    WHERE c.normalized_share_code=$1 LIMIT 1`, [shareCode])
  const family = rows[0]
  if (family === undefined) return yield* new NotFound({ message: "Army family not found" })
  return family
}))
const aggregateFamily = (family: { army_hash: string; family_name: string; representative_share_code: string }, window: AnalyticsWindow) =>
  database("Army family statistics query failed", Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql.unsafe<FamilyRow>(`SELECT $1 army_hash,$2 family_name,$3 representative_share_code,
      COALESCE(sum(attack_count),0)::bigint attacks,COALESCE(sum(distinct_player_count),0)::bigint players,
      COALESCE(sum(zero_star_count),0)::bigint zero,COALESCE(sum(one_star_count),0)::bigint one,
      COALESCE(sum(two_star_count),0)::bigint two,COALESCE(sum(three_star_count),0)::bigint three,
      COALESCE(sum(destruction_percentage_sum),0)::bigint destruction,COALESCE(sum(duration_seconds_sum),0)::bigint duration
      FROM army_family_daily_stats WHERE anchor_army_hash=decode($1,'hex') AND day BETWEEN $4::date AND $5::date`,
    [family.army_hash, family.family_name, family.representative_share_code, window.firstDay, window.lastDay])
    const result = familyStatistics(rows[0]!)
    if (window.calendarDays === 1) return result
    const counts = yield* sql.unsafe<{ players: number | string }>(`SELECT count(DISTINCT b.player_tag)::bigint players
      FROM battles_ranked b LEFT JOIN army_family_members m ON m.army_hash=b.army_hash
      WHERE b.battle_mode='legend' AND b.direction='attack' AND b.battle_time BETWEEN $1 AND $2
        AND COALESCE(m.anchor_army_hash,b.army_hash)=decode($3,'hex')`, [window.start, window.end, family.army_hash])
    return { ...result, players: number(counts[0]?.players ?? 0) }
  }))
export const queryArmyDetail = (query: URLSearchParams, now = new Date()) => Effect.gen(function* () {
  const { shareCode, timeQuery } = yield* parseArmyLinkQuery(query)
  const window = yield* parsePlayerHistoryWindow(timeQuery, now, 90)
  return yield* aggregateFamily(yield* resolveFamily(shareCode), window)
})
export const queryArmyTimeline = (query: URLSearchParams, now = new Date()) => database("Army family timeline query failed", Effect.gen(function* () {
  const { shareCode, timeQuery } = yield* parseArmyLinkQuery(query)
  const window = yield* parsePlayerHistoryWindow(timeQuery, now, 365), family = yield* resolveFamily(shareCode), sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<{ day: Date | string; attacks: number | string; players: number | string; zero: number | string; one: number | string; two: number | string; three: number | string; destruction: number | string; duration: number | string }>(`
    SELECT day,attack_count attacks,distinct_player_count players,zero_star_count zero,one_star_count one,two_star_count two,
      three_star_count three,destruction_percentage_sum destruction,duration_seconds_sum duration
    FROM army_family_daily_stats WHERE anchor_army_hash=decode($1,'hex') AND day BETWEEN $2::date AND $3::date ORDER BY day`,
  [family.army_hash, window.firstDay, window.lastDay])
  return { armyHash: family.army_hash, name: family.family_name, shareCode: family.representative_share_code,
    items: rows.map((row) => { const attacks = number(row.attacks); return { day: day(row.day), attacks, players: number(row.players),
      starCounts: starCounts(row), averageDuration: average(row.duration, attacks), averageDestruction: average(row.destruction, attacks) } }) }
}))

interface HitRateRow { period_kind: "ranked_season" | "legend_day"; period_start: Date | string; league_tier_id: number; town_hall: number; attacks: number | string; zero: number | string; one: number | string; two: number | string; three: number | string }
export const queryHitRateHistory = (query: URLSearchParams, now = new Date()) => database("League hit-rate query failed", Effect.gen(function* () {
  const options = yield* parseLeagueHitRateQuery(query, now), sql = yield* SqlClient.SqlClient, values: Array<unknown> = [options.window.start, options.window.end]
  const filters = ["period_start BETWEEN $1 AND $2"]
  if (options.mode !== undefined) { values.push(options.mode === "ranked" ? "ranked_season" : "legend_day"); filters.push(`period_kind=$${values.length}`) }
  if (options.leagueTierId !== undefined) { values.push(options.leagueTierId); filters.push(`league_tier_id=$${values.length}`) }
  if (options.townHallLevel !== undefined) { values.push(options.townHallLevel); filters.push(`town_hall=$${values.length}`) }
  const rows = yield* sql.unsafe<HitRateRow>(`SELECT period_kind,period_start,league_tier_id,town_hall,attack_count attacks,
    zero_star_count zero,one_star_count one,two_star_count two,three_star_count three FROM league_hitrate_stats
    WHERE ${filters.join(" AND ")} ORDER BY period_start DESC,period_kind,league_tier_id,town_hall`, values)
  return { items: rows.map((row) => { const common = { league: league(row.league_tier_id), townHallLevel: number(row.town_hall),
    attacks: number(row.attacks), starCounts: starCounts(row) }
    return row.period_kind === "ranked_season"
      ? { mode: "ranked" as const, seasonId: String(Math.floor(new Date(row.period_start).valueOf() / 1000)), ...common }
      : { mode: "legend" as const, day: day(row.period_start), ...common }
  }) }
}))

interface TierRow { season_id: number | string; league_tier_id: number; group_count: number | string; distinct_player_count: number | string; participating_player_count: number | string; trophy_p10: number | null; trophy_p25: number | null; trophy_p50: number | null; trophy_p75: number | null; trophy_p90: number | null; town_halls: unknown; average_group_first_last_trophy_range: number | string | null; average_first_second_trophy_gap: number | string | null }
export const queryTierStatistics = (rawSeason: string, rawTier: string) => database("Tournament statistics query failed", Effect.gen(function* () {
  const season = yield* positiveId(rawSeason, "Ranked season"), tier = yield* positiveId(rawTier, "league tier"), sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<TierRow>(`SELECT * FROM ranked_league_tier_stats WHERE season_id=$1::bigint AND league_tier_id=$2::integer`, [season, tier])
  const row = rows[0]
  if (row === undefined) return yield* new NotFound({ message: "Ranked tier statistics not found" })
  return { seasonId: season, league: league(row.league_tier_id), groupCount: number(row.group_count), playerCount: number(row.distinct_player_count),
    participatingPlayers: number(row.participating_player_count), trophyPercentiles: { p10: row.trophy_p10, p25: row.trophy_p25,
      p50: row.trophy_p50, p75: row.trophy_p75, p90: row.trophy_p90 },
    townHallDistribution: parseJson<Array<{ level: number; count: number }>>(row.town_halls as Array<{ level: number; count: number }> | string),
    groupCompetitiveness: { averageTrophyRange: row.average_group_first_last_trophy_range === null ? null : number(row.average_group_first_last_trophy_range),
      averageFirstPlaceGap: row.average_first_second_trophy_gap === null ? null : number(row.average_first_second_trophy_gap) } }
}))

interface LegendDayRow { day: Date | string; league_tier_id: number; town_hall: number; attacks: number | string; players: number | string; perfect_days: number | string; zero: number | string; one: number | string; two: number | string; three: number | string; destruction: number | string; duration: number | string; hero_stats: unknown; pet_stats: unknown; equipment_stats: unknown; pet_hero_assignments: unknown }
type Use = { id: number; uses: number; triples: number }
type Assignment = { petId: number; heroId: number; uses: number; triples?: number }
const currentUses = (value: unknown, category: "heroes" | "pets" | "equipment"): Use[] =>
  parseJson<Use[]>(value as Use[] | string).filter((item) => hasStaticItemId(category, item.id))
const currentAssignments = (value: unknown): Array<{ petId: number; heroId: number; uses: number }> =>
  parseJson<Assignment[]>(value as Assignment[] | string).filter((item) => hasStaticItemId("pets", item.petId) && hasStaticItemId("heroes", item.heroId))
    .map(({ petId, heroId, uses }) => ({ petId, heroId, uses }))
export const queryLegendDays = (query: URLSearchParams, now = new Date()) => database("Legend-day statistics query failed", Effect.gen(function* () {
  const options = yield* parseLegendDaysQuery(query, now), sql = yield* SqlClient.SqlClient, values: Array<unknown> = [options.window.firstDay, options.window.lastDay]
  const tier = options.leagueTierId === undefined ? "" : (values.push(options.leagueTierId), ` AND league_tier_id=$${values.length}`)
  const rows = yield* sql.unsafe<LegendDayRow>(`SELECT day,league_tier_id,town_hall,attack_count attacks,distinct_player_count players,
    perfect_320_player_count perfect_days,zero_star_count zero,one_star_count one,two_star_count two,three_star_count three,
    destruction_percentage_sum destruction,duration_seconds_sum duration,hero_stats,pet_stats,equipment_stats,pet_hero_assignments
    FROM legend_daily_stats WHERE day BETWEEN $1::date AND $2::date${tier} ORDER BY day DESC,league_tier_id,town_hall`, values)
  return { items: rows.map((row) => { const attacks = number(row.attacks); return { day: day(row.day), league: league(row.league_tier_id),
    townHallLevel: number(row.town_hall), attacks, players: number(row.players), perfectDays: number(row.perfect_days), starCounts: starCounts(row),
    averageDuration: average(row.duration, attacks), averageDestruction: average(row.destruction, attacks),
    heroes: currentUses(row.hero_stats, "heroes"), pets: currentUses(row.pet_stats, "pets"), equipment: currentUses(row.equipment_stats, "equipment"),
    petAssignments: currentAssignments(row.pet_hero_assignments) } }) }
}))

const response = <A>(schema: Schema.Codec<A, unknown, never, never>, value: A) => Schema.encodeUnknownEffect(schema)(value).pipe(
  Effect.map((encoded) => Response.json(encoded)),
  Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Stored league analytics do not match the public contract" })),
)
const decodedParts = (parts: readonly string[], indexes: readonly number[]) => Effect.try({
  try: () => indexes.map((index) => decodeURIComponent(parts[index] ?? "")),
  catch: () => new InvalidRequest({ message: "Malformed path encoding" }),
})
export const dispatchLeagueAnalytics = (request: Request) => Effect.gen(function* () {
  if (request.method !== "GET") return undefined
  const url = new URL(request.url), parts = url.pathname.split("/")
  if (url.pathname.match(/^\/v2\/player\/[^/]+\/battlelog\/history$/u)) {
    const [tag = ""] = yield* decodedParts(parts, [3])
    return yield* response(PlayerBattlelogHistoryResponse, yield* queryPlayerBattlelogHistory(tag, url.searchParams))
  }
  if (parts.length === 7 && parts[1] === "v2" && parts[2] === "player" && parts[4] === "ranked" && parts[6] === "battlelog") {
    if (url.search !== "") return yield* new InvalidRequest({ message: "Ranked battlelog does not accept query parameters" })
    const [tag = "", season = ""] = yield* decodedParts(parts, [3, 5])
    return yield* response(RankedBattlelogResponse, yield* queryRankedBattlelog(tag, season))
  }
  if (parts.length === 7 && parts[1] === "v2" && parts[2] === "player" && parts[4] === "legend" && parts[6] === "battlelog") {
    if (url.search !== "") return yield* new InvalidRequest({ message: "Legend battlelog does not accept query parameters" })
    const [tag = "", requestedDay = ""] = yield* decodedParts(parts, [3, 5])
    return yield* response(LegendBattlelogResponse, yield* queryLegendBattlelog(tag, requestedDay))
  }
  if (parts.length === 6 && parts[1] === "v2" && parts[2] === "ranked" && parts[4] === "groups") {
    if (url.search !== "") return yield* new InvalidRequest({ message: "Ranked group does not accept query parameters" })
    const [season = "", group = ""] = yield* decodedParts(parts, [3, 5])
    return yield* response(RankedGroupResponse, yield* queryRankedGroup(season, group))
  }
  if (parts.length === 6 && parts[1] === "v2" && parts[2] === "player" && parts[4] === "league" && parts[5] === "history") {
    const [tag = ""] = yield* decodedParts(parts, [3])
    return yield* response(PlayerLeagueHistoryResponse, yield* queryPlayerLeagueHistory(tag, url.searchParams))
  }
  if (url.pathname === "/v2/stats/armies") return yield* response(ArmySearchResponse, yield* queryArmySearch(url.searchParams))
  if (url.pathname === "/v2/stats/armies/detail") return yield* response(ArmyDetailResponse, yield* queryArmyDetail(url.searchParams))
  if (url.pathname === "/v2/stats/armies/timeline") return yield* response(ArmyTimelineResponse, yield* queryArmyTimeline(url.searchParams))
  if (url.pathname === "/v2/stats/league/hit-rates") return yield* response(LeagueHitRateHistoryResponse, yield* queryHitRateHistory(url.searchParams))
  if (parts.length === 8 && parts[1] === "v2" && parts[2] === "stats" && parts[3] === "league" && parts[4] === "tournaments" && parts[6] === "tiers") {
    if (url.search !== "") return yield* new InvalidRequest({ message: "Ranked tier statistics do not accept query parameters" })
    const [season = "", tier = ""] = yield* decodedParts(parts, [5, 7])
    return yield* response(LeagueTierStatisticsResponse, yield* queryTierStatistics(season, tier))
  }
  if (url.pathname === "/v2/stats/legend/days") return yield* response(LegendDaysResponse, yield* queryLegendDays(url.searchParams))
  return undefined
})
