import {
  LeagueHitRateHistoryResponse,
  LegendBattlelogResponse,
  LegendPlayerDailySeriesResponse,
  LegendPlayerSeasonResponse,
  LegendPlayerComparisonsResponse,
  LegendDaysResponse,
  LegendDayPerformanceResponse,
  PlayerBattlelogHistoryResponse,
  PlayerLeagueHistoryResponse,
  RankedBattlelogResponse,
  RankedGroupResponse,
  LeagueTierStatisticsResponse,
} from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"

import { DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import {
  parseLeagueHitRateQuery,
  parseLegendDaysQuery,
  parseLegendPlayerSeriesQuery,
  parsePlayerHistoryWindow,
} from "./league-analytics-query.js"
import { queryLegendDayPerformance } from "./legend-day-performance.js"
import { rankedPeriodPredicate } from "./ranked-period.js"
import * as families from "./army-family-analytics.js"
import { hasStaticItemId, lookupStaticItem, lookupArmyStaticItem, prepareStaticMetadata } from "./static-metadata.js"
import { WorkerEnvironment } from "./environment.js"
import { legendSeasonFinish, legendSeasonWindow } from "./legend-season.js"

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
  direction: 1 | 2
  player_town_hall: number
  opponent_tag: string
  opponent_name: string | null
  opponent_town_hall: number
  stars: number
  destruction_percentage: number | string
  duration_seconds: number
  looted_resources: unknown
  share_code: string | null
  family_id: string | null
}
const battle = (row: BattleRow, mode: "ranked" | "legend") => {
  const stars = number(row.stars), destruction = number(row.destruction_percentage)
  const trophies = row.direction === 1 ? attackTrophies(stars, destruction)
    : mode === "ranked" ? rankedDefenseTrophies(stars, destruction) : legendDefenseTrophies(stars, destruction)
  return { time: iso(row.battle_time), townHallLevel: number(row.player_town_hall),
    opponent: { tag: row.opponent_tag, name: row.opponent_name?.trim() || "Unknown", townHallLevel: number(row.opponent_town_hall) },
    stars, destructionPercentage: destruction, duration: number(row.duration_seconds),
    shareCode: row.share_code, familyId: row.family_id, trophies }
}
const battleSql = `SELECT b.battle_time,b.direction,b.player_town_hall,b.opponent_tag,p.name AS opponent_name,
  b.opponent_town_hall,b.stars,b.destruction_percentage,b.duration_seconds,b.looted_resources,b.share_code,
  family.family_id::text family_id
  FROM battles_ranked b LEFT JOIN basic_player p ON p.tag=b.opponent_tag
  LEFT JOIN army_family_members family ON family.share_code=b.share_code`

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
  const rows = yield* sql.unsafe<BattleRow>(`${battleSql} WHERE b.player_tag=$1 AND b.battle_mode=1
    AND ${rankedPeriodPredicate("b.battle_time", "$2::bigint")}
    ORDER BY b.battle_time,b.direction,b.opponent_tag`, [tag, season])
  const values = rows.map((row) => battle(row, "ranked"))
  const attacks = values.filter((_, index) => rows[index]?.direction === 1)
  const realDefenses = values.filter((_, index) => rows[index]?.direction === 2)
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
const mainArmyTroops = (rows: ReadonlyArray<{ id: number; quantity: number }>) => rows.flatMap(row => {
  const item = lookupArmyStaticItem("troops", row.id)
  return item && !item.siegeMachine ? [{ ...row, name: item.name, housing: row.quantity * item.housingSpace }] : []
}).sort((a, b) => b.housing - a.housing || a.id - b.id)
const armyCore = (rows: ReadonlyArray<{ id: number; quantity: number }>, storedName: string | null) => {
  const core = mainArmyTroops(rows).slice(0, 3)
  return core.length ? { key: storedName ?? core.map(item => item.id).sort((a, b) => a - b).join("/"),
    name: storedName ?? core.map(item => item.name).join(" / ") } : undefined
}
export const queryLegendBattlelog = (rawTag: string, rawDay: string, now = new Date()) => database("Legend battlelog query failed", Effect.gen(function* () {
  const window = legendWindow(rawDay)
  if (window === undefined) return yield* new InvalidRequest({ message: "Invalid Legend day" })
  const tag = yield* normalizeClashTag(rawTag), sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<BattleRow>(`${battleSql} WHERE b.player_tag=$1 AND b.battle_mode=2
    AND b.battle_time >= $2 AND b.battle_time < $3 ORDER BY b.battle_time,b.direction,b.opponent_tag`, [tag, window.start, window.end])
  const values = rows.map((row) => battle(row, "legend"))
  const attacks = values.filter((_, index) => rows[index]?.direction === 1)
  const realDefenses = values.filter((_, index) => rows[index]?.direction === 2)
  const compositions = yield* sql.unsafe<{ share_code: string; main_troops: Array<{ id: number; quantity: number }>; name: string | null }>(`
    SELECT c.share_code,c.main_troops,f.name FROM army_compositions c
    LEFT JOIN army_family_members m USING(share_code) LEFT JOIN army_families f USING(family_id)
    WHERE c.share_code=ANY($1::text[])`, [[...new Set(attacks.flatMap(item => item.shareCode ? [item.shareCode] : []))]])
  const byCode = new Map(compositions.map(item => [item.share_code, item]))
  const groups = new Map<string, { name: string; attacks: number; triples: number }>()
  // Only these day-window attacks contribute. Never borrow a season winner
  // when the selected day has no stored composition.
  for (const attack of attacks) {
    const composition = attack.shareCode ? byCode.get(attack.shareCode) : undefined
    const core = composition ? armyCore(composition.main_troops, composition.name) : undefined
    if (!core) continue
    const group = groups.get(core.key) ?? { name: core.name, attacks: 0, triples: 0 }
    group.attacks++; group.triples += attack.stars === 3 ? 1 : 0; groups.set(core.key, group)
  }
  const topArmy = [...groups.values()].sort((a, b) => b.attacks - a.attacks || b.triples - a.triples || a.name.localeCompare(b.name))[0]
  let automaticTrophies: number | undefined
  if (now >= window.end && realDefenses.length < 8) {
    const previous = yield* sql.unsafe<Pick<BattleRow, "stars" | "destruction_percentage">>(`SELECT stars,destruction_percentage
      FROM battles_ranked WHERE player_tag=$1 AND battle_mode=2 AND direction=2 AND battle_time >= $2 AND battle_time < $3`,
    [tag, new Date(window.start.valueOf() - 2 * 86_400_000), window.start])
    if (previous.length > 0) automaticTrophies = Math.floor(previous.reduce((sum, row) =>
      sum + legendDefenseTrophies(number(row.stars), number(row.destruction_percentage)), 0) / previous.length)
  }
  const defenses = [...realDefenses, ...(automaticTrophies === undefined ? []
    : Array.from({ length: 8 - realDefenses.length }, () => ({ trophies: automaticTrophies, automatic: true as const })))]
  const attackTotal = attacks.reduce((sum, item) => sum + item.trophies, 0)
  const defenseTotal = defenses.reduce((sum, item) => sum + item.trophies, 0)
  return { tag, day: rawDay, ...(topArmy ? { topArmy } : {}), attackTrophies: attackTotal, defenseTrophies: defenseTotal,
    trophies: attackTotal + defenseTotal, attacks, defenses }
}))

interface LegendTrophyRow {
  battle_time: Date | string
  direction: 1 | 2
  stars: number
  destruction_percentage: number | string
}
export const queryLegendPlayerSeason = (rawTag: string, now = new Date()) => database("Player Legend season query failed", Effect.gen(function* () {
  const tag = yield* normalizeClashTag(rawTag), sql = yield* SqlClient.SqlClient
  const anchors = yield* sql.unsafe<{ season: string }>(`SELECT season FROM legend_history WHERE season LIKE 'v2-%' ORDER BY season DESC LIMIT 1`, [])
  if (!anchors[0]) return yield* new NotFound({ message: "Official Legend season calendar is not loaded" })
  const season = legendSeasonWindow(now, anchors[0].season)
  const rows = yield* sql.unsafe<LegendTrophyRow & { share_code: string | null }>(`SELECT battle_time,direction,stars,destruction_percentage,share_code
    FROM battles_ranked WHERE player_tag=$1 AND battle_mode=2 AND battle_time >= $2 AND battle_time < $3
    ORDER BY battle_time`, [tag, season.start, new Date(Math.min(now.valueOf(), season.end.valueOf()))])
  const attacks = rows.filter(row => row.direction === 1), defenses = rows.filter(row => row.direction === 2)
  const compositions = yield* sql.unsafe<{ share_code: string; main_troops: Array<{ id: number; quantity: number }>; name: string | null;
    spells: Array<{ id: number; quantity: number; clanCastle?: boolean }>; heroes: number[];
    equipment: Array<{ equipmentId: number }>; pet_assignments: Array<{ petId: number }>; siege_machine_id: number | null }>(`
    SELECT c.share_code,c.main_troops,c.spells,c.heroes,c.equipment,c.pet_assignments,c.siege_machine_id,f.name FROM army_compositions c
    LEFT JOIN army_family_members m USING(share_code) LEFT JOIN army_families f USING(family_id)
    WHERE c.share_code=ANY($1::text[])`, [[...new Set(attacks.flatMap(row => row.share_code ? [row.share_code] : []))]])
  const byCode = new Map(compositions.map(row => [row.share_code, row]))
  const favorites = new Map<number, { id: number; name: string; attacks: number; triples: number; housing: number }>()
  type FavoriteCategory = "spell" | "hero" | "equipment" | "pet" | "siege"
  const otherFavorites = new Map<FavoriteCategory, Map<number, { category: FavoriteCategory; id: number; name: string; attacks: number; weight: number }>>()
  const groups = new Map<string, { name: string; attacks: number; triples: number }>()
  for (const attack of attacks) {
    const composition = attack.share_code ? byCode.get(attack.share_code) : undefined
    if (!composition) continue
    const record = (category: FavoriteCategory, section: string, items: Array<{ id: number; weight: number }>) => {
      const entries = otherFavorites.get(category) ?? new Map()
      // Count a selected item once per attack, even if malformed source rows
      // repeat it. Spell weighting uses main-army housing, never donated spells.
      for (const id of new Set(items.map(item => item.id))) {
        const item = lookupStaticItem(section, id)
        if (!item) continue
        const entry = entries.get(id) ?? { category, id, name: item.name, attacks: 0, weight: 0 }
        entry.attacks++; entry.weight += items.filter(value => value.id === id).reduce((sum, value) => sum + value.weight, 0)
        entries.set(id, entry)
      }
      otherFavorites.set(category, entries)
    }
    record("spell", "spells", composition.spells.filter(item => !item.clanCastle).map(item => ({ id: item.id,
      weight: item.quantity * (lookupArmyStaticItem("spells", item.id)?.housingSpace || 1) })))
    record("hero", "heroes", composition.heroes.map(id => ({ id, weight: 1 })))
    record("equipment", "equipment", composition.equipment.map(item => ({ id: item.equipmentId, weight: 1 })))
    record("pet", "pets", composition.pet_assignments.map(item => ({ id: item.petId, weight: 1 })))
    if (composition.siege_machine_id !== null) record("siege", "troops", [{ id: composition.siege_machine_id, weight: 1 }])
    const troops = mainArmyTroops(composition.main_troops)
    for (const troop of troops) {
      const entry = favorites.get(troop.id) ?? { id: troop.id, name: troop.name, attacks: 0, triples: 0, housing: 0 }
      entry.attacks++; entry.triples += number(attack.stars) === 3 ? 1 : 0; entry.housing += troop.housing
      favorites.set(troop.id, entry)
    }
    // Describe the dominant main-army troops; do not invent a named strategy.
    // Housing weight keeps cleanup units from displacing the actual army core.
    const core = armyCore(composition.main_troops, composition.name)
    if (!core) continue
    const entry = groups.get(core.key) ?? { name: core.name, attacks: 0, triples: 0 }
    entry.attacks++; entry.triples += number(attack.stars) === 3 ? 1 : 0; groups.set(core.key, entry)
  }
  const population = yield* sql.unsafe<{ count: number }>(`SELECT count(*)::int count FROM legend_rankings_current`, [])
  const topTroops = [...favorites.values()].sort((a, b) => b.housing - a.housing || b.attacks - a.attacks || a.id - b.id)
  const topOthers = [...otherFavorites.values()].flatMap(entries => [...entries.values()]
    .sort((a, b) => b.weight - a.weight || b.attacks - a.attacks || a.id - b.id).slice(0, 1)
    .map(({ weight: _weight, ...item }) => item))
  return { seasonStart: season.start.toISOString(), seasonEnd: season.end.toISOString(),
    rankPopulation: population[0]?.count ?? 0,
    favorites: [...topTroops.slice(0, 1).map(item => ({ category: "troop" as const, id: item.id, name: item.name, attacks: item.attacks })), ...topOthers],
    // Rank by deployed housing, not token cleanup troops present in every army.
    // The accompanying counts remain attacks using that troop, not unit totals.
    favoriteTroops: topTroops.slice(0, 3)
      .map(({ housing: _housing, ...item }) => item),
    armyGroups: [...groups.values()].sort((a, b) => b.attacks - a.attacks).slice(0, 3),
    armyShareCodes: attacks.flatMap(row => row.share_code ? [row.share_code] : []),
    stats: { attacks: attacks.length, defenses: defenses.length,
      attackTriples: attacks.filter(row => number(row.stars) === 3).length,
      defenseTriples: defenses.filter(row => number(row.stars) === 3).length,
      offenseStars: { zero: attacks.filter(row => number(row.stars) === 0).length, one: attacks.filter(row => number(row.stars) === 1).length,
        two: attacks.filter(row => number(row.stars) === 2).length, three: attacks.filter(row => number(row.stars) === 3).length },
      defenseStars: { zero: defenses.filter(row => number(row.stars) === 0).length, one: defenses.filter(row => number(row.stars) === 1).length,
        two: defenses.filter(row => number(row.stars) === 2).length, three: defenses.filter(row => number(row.stars) === 3).length },
      averageOffense: average(attacks.reduce((sum, row) => sum + attackTrophies(number(row.stars), number(row.destruction_percentage)), 0), attacks.length),
      averageDefense: average(defenses.reduce((sum, row) => sum + legendDefenseTrophies(number(row.stars), number(row.destruction_percentage)), 0), defenses.length),
    } }
}))
export const queryLegendPlayerComparisons = (rawTag: string, now = new Date()) => database("Player Legend comparison query failed", Effect.gen(function* () {
  const tag = yield* normalizeClashTag(rawTag), sql = yield* SqlClient.SqlClient
  const anchors = yield* sql.unsafe<{ season: string }>(`SELECT season FROM legend_history WHERE season LIKE 'v2-%' ORDER BY season DESC LIMIT 1`, [])
  if (!anchors[0]) return { items: [] }
  const season = legendSeasonWindow(now, anchors[0].season)
  type ComparisonRow = { cohort: "legend_i" | "top_1000" | "top_200"; days: number; attacks: string; triples: string; player_attacks: string; player_triples: string }
  const rows = yield* sql.unsafe<ComparisonRow>(`
    WITH covered AS (
      SELECT day,cohort,attack_count,three_star_count FROM legend_daily_stats
      WHERE day >= ($2::timestamptz AT TIME ZONE 'UTC')::date AND day < (($3::timestamptz AT TIME ZONE 'UTC') - INTERVAL '5 hours')::date
        AND cohort IN ('legend_i','top_1000','top_200') AND attack_count > 0
    ), personal AS (
      SELECT (battle_time AT TIME ZONE 'UTC' - INTERVAL '5 hours')::date AS day,
        count(*) attacks, count(*) FILTER (WHERE stars=3) triples
      FROM battles_ranked WHERE player_tag=$1 AND battle_mode=2 AND direction=1 AND battle_time >= $2::timestamptz AND battle_time < $3::timestamptz
      GROUP BY 1
    ) SELECT c.cohort,count(*)::int days,sum(c.attack_count)::text attacks,sum(c.three_star_count)::text triples,
      coalesce(sum(p.attacks),0)::text player_attacks,coalesce(sum(p.triples),0)::text player_triples
      FROM covered c LEFT JOIN personal p USING(day) GROUP BY c.cohort ORDER BY c.cohort`, [tag, season.start, now])
  const mapComparison = (row: ComparisonRow) => ({ cohort: row.cohort, days: number(row.days), attacks: number(row.attacks), triples: number(row.triples),
    playerAttacks: number(row.player_attacks), playerTriples: number(row.player_triples) })
  return { items: rows.map(mapComparison) }
}))
export const queryLegendPlayerDailySeries = (rawTag: string, query: URLSearchParams, now = new Date()) =>
  database("Player Legend series query failed", Effect.gen(function* () {
    const tag = yield* normalizeClashTag(rawTag)
    const window = yield* parseLegendPlayerSeriesQuery(query, now)
    const sql = yield* SqlClient.SqlClient
    const dayMilliseconds = 86_400_000
    const rows = yield* sql.unsafe<LegendTrophyRow>(`SELECT battle_time,direction,stars,destruction_percentage
      FROM battles_ranked WHERE player_tag=$1 AND battle_mode=2
      AND battle_time >= $2 AND battle_time < $3 ORDER BY battle_time,direction`,
    [tag, new Date(window.start.valueOf() - 2 * dayMilliseconds), window.end])
    const rowDay = (row: LegendTrophyRow) => new Date(new Date(row.battle_time).valueOf() - (5 * 60) * 60_000)
      .toISOString().slice(0, 10)
    const ranks = yield* sql.unsafe<{ day: string; trophies: number; global_rank: number }>(
      `SELECT day::text, trophies, global_rank FROM legend_rankings_history WHERE tag=$1 AND day >= $2::date AND day <= $3::date ORDER BY day`,
      [tag, window.start.toISOString().slice(0, 10), window.end.toISOString().slice(0, 10)])
    const ranksByDay = new Map(ranks.map(rank => [rank.day, rank]))
    const items = Array.from({ length: window.calendarDays }, (_, index) => {
      const start = new Date(window.start.valueOf() + index * dayMilliseconds)
      const end = new Date(start.valueOf() + dayMilliseconds)
      const label = start.toISOString().slice(0, 10)
      const selected = rows.filter((row) => rowDay(row) === label)
      const attacks = selected.filter((row) => row.direction === 1)
      const defenses = selected.filter((row) => row.direction === 2)
      const attackTotal = attacks.reduce((sum, row) => sum + attackTrophies(number(row.stars), number(row.destruction_percentage)), 0)
      let defenseTotal = defenses.reduce((sum, row) => sum + legendDefenseTrophies(number(row.stars), number(row.destruction_percentage)), 0)
      let automaticDefenses = 0
      if (now >= end && defenses.length < 8) {
        const priorStart = start.valueOf() - 2 * dayMilliseconds
        const previous = rows.filter((row) => row.direction === 2 && new Date(row.battle_time).valueOf() >= priorStart
          && new Date(row.battle_time).valueOf() < start.valueOf())
        if (previous.length > 0) {
          const automatic = Math.floor(previous.reduce((sum, row) => sum
            + legendDefenseTrophies(number(row.stars), number(row.destruction_percentage)), 0) / previous.length)
          defenseTotal += automatic * (8 - defenses.length)
          automaticDefenses = 8 - defenses.length
        }
      }
      const rank = ranksByDay.get(label)
      return { day: label, attackTrophies: attackTotal, defenseTrophies: defenseTotal, trophies: attackTotal + defenseTotal,
        attacks: attacks.length, defenses: defenses.length + automaticDefenses, recordedDefenses: defenses.length, automaticDefenses,
        closingTrophies: rank ? number(rank.trophies) : null, globalRank: rank ? number(rank.global_rank) : null }
    })
    return { tag, items }
  }))

export const queryPlayerBattlelogHistory = (rawTag: string, query: URLSearchParams, now = new Date()) => database("Player battle history query failed", Effect.gen(function* () {
  const tag = yield* normalizeClashTag(rawTag), window = yield* parsePlayerHistoryWindow(query, now), sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<{ battle_mode: "farming" | "ranked" | "legend"; battle_time: Date | string; stars: number; destruction_percentage: number; duration_seconds: number; looted_resources: unknown; share_code: string | null; family_id: string | null }>(`
    SELECT battle_mode,battle_time,stars,destruction_percentage,duration_seconds,looted_resources,share_code,family_id FROM (
      SELECT 'farming'::text battle_mode,battle.battle_time,battle.stars,battle.destruction_percentage,battle.duration_seconds,
        battle.looted_resources,battle.share_code,family.family_id::text family_id,0 source_order FROM battles_farming battle
        LEFT JOIN army_family_members family ON family.share_code=battle.share_code
        WHERE battle.player_tag=$1 AND battle.battle_time BETWEEN $2 AND $3
      UNION ALL
      SELECT CASE battle.battle_mode WHEN 1 THEN 'ranked'::text ELSE 'legend'::text END,
        battle.battle_time,battle.stars,battle.destruction_percentage,battle.duration_seconds,battle.looted_resources,
        battle.share_code,family.family_id::text family_id,1 source_order FROM battles_ranked battle
        LEFT JOIN army_family_members family ON family.share_code=battle.share_code
        WHERE battle.player_tag=$1 AND battle.direction=1 AND battle.battle_time BETWEEN $2 AND $3
    ) history ORDER BY battle_time DESC,source_order`, [tag, window.start, window.end])
  return { items: rows.map((row) => ({ battleMode: row.battle_mode, battleTime: iso(row.battle_time), stars: number(row.stars),
    destructionPercentage: number(row.destruction_percentage), duration: number(row.duration_seconds),
    lootedResources: normalizedLoot(row.looted_resources), shareCode: row.share_code, familyId: row.family_id })) }
}))

export const queryRankedGroup = (rawSeason: string, rawGroup: string) => database("Ranked group query failed", Effect.gen(function* () {
  const season = yield* positiveId(rawSeason, "Ranked season"), groupTag = yield* normalizeClashTag(rawGroup), sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<RankedMemberRow>(`${rankedMemberSql} WHERE season_id=$1::bigint AND group_tag=$2 ORDER BY placement,player_tag`, [season, groupTag])
  const first = rows[0]
  if (first === undefined) return yield* new NotFound({ message: "Ranked league group not found" })
  return { leagueGroupId: groupTag, seasonId: season, league: league(first.league_tier_id),
    maxBattles: Math.max(...rows.map((row) => number(row.maximum_battle_count))), members: rows.map(member) }
}))

interface LegendHistoryRow { season: string; league_tier_id: number | null; trophies: number; attack_wins: number; defense_wins: number; rank: number; population: string | null }
export const queryPlayerLeagueHistory = (rawTag: string, query: URLSearchParams, now = new Date()) => database("Player league history query failed", Effect.gen(function* () {
  const tag = yield* normalizeClashTag(rawTag), window = yield* parsePlayerHistoryWindow(query, now), sql = yield* SqlClient.SqlClient
  const bounded = query.has("time[after]") || query.has("time[before]")
  const ranked = yield* sql.unsafe<RankedMemberRow>(`${rankedMemberSql} WHERE player_tag=$1
    ${bounded ? "AND to_timestamp(season_id) BETWEEN $2 AND $3" : ""} ORDER BY season_id DESC`,
    bounded ? [tag, window.start, window.end] : [tag])
  const legends = yield* sql.unsafe<LegendHistoryRow>(`WITH requested AS (
      SELECT season,league_tier_id,trophies,attack_wins,defense_wins,rank FROM legend_history WHERE player_tag=$1
    ), populations AS (
      SELECT history.season,max(history.rank)::text population FROM legend_history history
      JOIN (SELECT DISTINCT season FROM requested) requested_seasons USING(season)
      GROUP BY history.season HAVING max(history.rank) > 0
    ) SELECT requested.*,populations.population FROM requested LEFT JOIN populations USING(season)
      ORDER BY requested.season DESC`, [tag])
  // History without a range means all retained finishes, not only the default 30-day battle window.
  const finishes = legends.filter(row => {
    const end = legendSeasonFinish(row.season)
    return Number.isFinite(end) && end <= now.valueOf() &&
      ((!query.has("time[after]") && !query.has("time[before]")) || (end >= window.start.valueOf() && end <= window.end.valueOf()))
  })
  const items = [
    ...ranked.map((row) => ({ mode: "ranked" as const, seasonId: String(row.season_id), leagueGroupId: row.group_tag,
      league: league(row.league_tier_id), maxBattles: number(row.maximum_battle_count), ...member(row) })),
    ...finishes.map((row) => ({ mode: "legend" as const, season: row.season,
      league: row.league_tier_id === null ? null : league(row.league_tier_id), trophies: number(row.trophies),
      attackWins: number(row.attack_wins), defenseWins: number(row.defense_wins), rank: number(row.rank),
      ...(row.population == null ? {} : { population: number(row.population) }) })),
  ].sort((left, right) => {
    const a = left.mode === "ranked" ? Number(left.seasonId) * 1000 : legendSeasonFinish(left.season)
    const b = right.mode === "ranked" ? Number(right.seasonId) * 1000 : legendSeasonFinish(right.season)
    return b - a
  })
  return { items }
}))


interface HitRateRow { period_start: Date | string; league_tier_id: number; town_hall: number; attacks: number | string; zero: number | string; one: number | string; two: number | string; three: number | string }
export const queryHitRateHistory = (query: URLSearchParams, now = new Date()) => database("League hit-rate query failed", Effect.gen(function* () {
  const options = yield* parseLeagueHitRateQuery(query, now), sql = yield* SqlClient.SqlClient
  if (options.mode !== "ranked" && (options.leagueTierId !== undefined || options.townHallLevel !== undefined))
    return yield* new InvalidRequest({ message: "leagueTierId and townHallLevel require mode=ranked; Legend totals have no tier or town hall dimension" })
  const ranked: Array<{ mode: "ranked"; seasonId: string; league: ReturnType<typeof league>; townHallLevel: number; attacks: number; starCounts: ReturnType<typeof starCounts> }> = []
  if (options.mode !== "legend") {
    const values: unknown[] = [options.window.start, options.window.end], filters = ["period_start BETWEEN $1 AND $2", "period_kind='ranked_season'"]
    if (options.leagueTierId !== undefined) { values.push(options.leagueTierId); filters.push(`league_tier_id=$${values.length}`) }
    if (options.townHallLevel !== undefined) { values.push(options.townHallLevel); filters.push(`town_hall=$${values.length}`) }
    const rows = yield* sql.unsafe<HitRateRow>(`SELECT period_start,league_tier_id,town_hall,attack_count attacks,
      zero_star_count zero,one_star_count one,two_star_count two,three_star_count three FROM league_hitrate_stats
      WHERE ${filters.join(" AND ")} ORDER BY period_start DESC,league_tier_id,town_hall`, values)
    ranked.push(...rows.map(row => ({ mode: "ranked" as const, seasonId: String(Math.floor(new Date(row.period_start).valueOf()/1000)),
      league: league(row.league_tier_id), townHallLevel: number(row.town_hall), attacks: number(row.attacks), starCounts: starCounts(row) })))
  }
  if (options.mode === "ranked") return { items: ranked }
  const time = new URLSearchParams(query); time.delete("mode")
  const window = yield* families.aggregateWindow(time, now)
  const rows = yield* sql.unsafe<HitRateRow & { day: Date | string }>(`SELECT day,attack_count attacks,
    zero_star_count zero,one_star_count one,two_star_count two,three_star_count three FROM legend_daily_stats
    WHERE day BETWEEN $1::date AND $2::date AND cohort='legend_i' ORDER BY day DESC`, [window.firstDay,window.lastDay])
  const items = [...ranked, ...rows.map(row => ({ mode: "legend" as const, day: day(row.day), attacks: number(row.attacks), starCounts: starCounts(row) }))]
  return { items: items.sort((a,b) => (b.mode === "ranked" ? Number(b.seasonId)*1000 : Date.parse(b.day)) - (a.mode === "ranked" ? Number(a.seasonId)*1000 : Date.parse(a.day))) }
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

interface LegendDayRow { day: Date | string; attacks: number | string; players: number | string; zero: number | string; one: number | string; two: number | string; three: number | string; destruction: number | string; duration: number | string; air_attack_count: number | string | null; ground_attack_count: number | string | null; mixed_attack_count: number | string | null; unknown_attack_count: number | string | null; hero_stats: unknown; pet_stats: unknown; equipment_stats: unknown; pet_hero_assignments: unknown; troop_stats: unknown; spell_stats: unknown; siege_stats: unknown; equipment_pair_stats: unknown; pet_combo_stats: unknown }
type Use = { id: number; uses: number; triples: number }
type Assignment = { petId: number; heroId: number; uses: number; triples: number }
type EquipmentPair = { heroId: number; equipmentIds: [number, number]; uses: number; triples: number }
type PetCombo = { petIds: ReadonlyArray<number>; uses: number; triples: number }
const currentUses = (value: unknown, category: "heroes" | "pets" | "equipment" | "troops" | "spells"): Use[] =>
  parseJson<Use[]>(value as Use[] | string).filter((item) => hasStaticItemId(category, item.id))
const currentAssignments = (value: unknown): Assignment[] =>
  parseJson<Assignment[]>(value as Assignment[] | string).filter((item) => hasStaticItemId("pets", item.petId) && hasStaticItemId("heroes", item.heroId))
    .map(({ petId, heroId, uses, triples }) => ({ petId, heroId, uses, triples }))
const currentEquipmentPairs = (value: unknown): EquipmentPair[] =>
  parseJson<EquipmentPair[]>(value as EquipmentPair[] | string).filter((item) => hasStaticItemId("heroes", item.heroId)
    && item.equipmentIds.length === 2 && item.equipmentIds.every((id) => hasStaticItemId("equipment", id)))
    .map(({ heroId, equipmentIds, uses, triples }) => ({ heroId, equipmentIds, uses, triples }))
const currentPetCombos = (value: unknown): PetCombo[] =>
  parseJson<PetCombo[]>(value as PetCombo[] | string).filter((item) => item.petIds.length > 0
    && item.petIds.every((id, index) => hasStaticItemId("pets", id) && (index === 0 || item.petIds[index - 1]! < id)))
    .map(({ petIds, uses, triples }) => ({ petIds, uses, triples }))
export const queryLegendDays = (query: URLSearchParams, now = new Date()) => database("Legend-day statistics query failed", Effect.gen(function* () {
  const options = yield* parseLegendDaysQuery(query, now), sql = yield* SqlClient.SqlClient, values: Array<unknown> = [options.window.firstDay, options.window.lastDay]
  const rows = yield* sql.unsafe<LegendDayRow>(`SELECT daily.day,daily.attack_count attacks,daily.distinct_player_count players,
    daily.zero_star_count zero,daily.one_star_count one,daily.two_star_count two,daily.three_star_count three,
    daily.destruction_percentage_sum destruction,daily.duration_seconds_sum duration,
    daily.air_attack_count,daily.ground_attack_count,daily.mixed_attack_count,daily.unknown_attack_count,
    daily.hero_stats,daily.pet_stats,
    daily.equipment_stats,daily.pet_hero_assignments,daily.troop_stats,daily.spell_stats,daily.siege_stats,daily.equipment_pair_stats,daily.pet_combo_stats
    FROM legend_daily_stats daily WHERE daily.day BETWEEN $1::date AND $2::date AND daily.cohort=$3 ORDER BY daily.day DESC`, [...values, options.cohort])
  return { cohort: options.cohort, items: rows.map((row) => { const attacks = number(row.attacks); return { day: day(row.day), attacks, players: number(row.players), starCounts: starCounts(row),
    averageDuration: average(row.duration, attacks), averageDestruction: average(row.destruction, attacks),
    heroes: currentUses(row.hero_stats, "heroes"), pets: currentUses(row.pet_stats, "pets"), equipment: currentUses(row.equipment_stats, "equipment"),
    petAssignments: currentAssignments(row.pet_hero_assignments),
    troops: currentUses(row.troop_stats, "troops"), spells: currentUses(row.spell_stats, "spells"), sieges: currentUses(row.siege_stats, "troops"),
    equipmentPairs: currentEquipmentPairs(row.equipment_pair_stats), petCombos: currentPetCombos(row.pet_combo_stats),
    ...(row.air_attack_count != null && row.ground_attack_count != null && row.mixed_attack_count != null && row.unknown_attack_count != null
      ? { attackTypes: { air: number(row.air_attack_count), ground: number(row.ground_attack_count),
        mixed: number(row.mixed_attack_count), unknown: number(row.unknown_attack_count) } }
      : {}) } }) }
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
    yield* prepareStaticMetadata(yield* WorkerEnvironment, ["troops", "buildings"])
    return yield* response(LegendBattlelogResponse, yield* queryLegendBattlelog(tag, requestedDay))
  }
  if (parts.length === 6 && parts[1] === "v2" && parts[2] === "player" && parts[4] === "legend" && parts[5] === "series") {
    const [tag = ""] = yield* decodedParts(parts, [3])
    return yield* response(LegendPlayerDailySeriesResponse, yield* queryLegendPlayerDailySeries(tag, url.searchParams))
  }
  if (parts.length === 6 && parts[1] === "v2" && parts[2] === "player" && parts[4] === "legend" && parts[5] === "season") {
    if (url.search !== "") return yield* new InvalidRequest({ message: "Current Legend season does not accept query parameters" })
    const [tag = ""] = yield* decodedParts(parts, [3])
    yield* prepareStaticMetadata(yield* WorkerEnvironment, ["troops", "buildings", "spells", "heroes", "equipment", "pets"])
    return yield* response(LegendPlayerSeasonResponse, yield* queryLegendPlayerSeason(tag))
  }
  if (parts.length === 6 && parts[1] === "v2" && parts[2] === "player" && parts[4] === "legend" && parts[5] === "comparisons") {
    if (url.search !== "") return yield* new InvalidRequest({ message: "Legend comparisons do not accept query parameters" })
    const [tag = ""] = yield* decodedParts(parts, [3])
    return yield* response(LegendPlayerComparisonsResponse, yield* queryLegendPlayerComparisons(tag))
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
  if (["/v2/stats/armies", "/v2/stats/armies/detail", "/v2/stats/armies/timeline"].includes(url.pathname)) {
    return yield* new NotFound({ message: "Legacy army-family statistics are retired; use /v2/stats/army-setups" })
  }
  if (url.pathname === "/v2/stats/league/hit-rates") return yield* response(LeagueHitRateHistoryResponse, yield* queryHitRateHistory(url.searchParams))
  if (parts.length === 8 && parts[1] === "v2" && parts[2] === "stats" && parts[3] === "league" && parts[4] === "tournaments" && parts[6] === "tiers") {
    if (url.search !== "") return yield* new InvalidRequest({ message: "Ranked tier statistics do not accept query parameters" })
    const [season = "", tier = ""] = yield* decodedParts(parts, [5, 7])
    return yield* response(LeagueTierStatisticsResponse, yield* queryTierStatistics(season, tier))
  }
  if (url.pathname === "/v2/stats/legend/performance") return yield* response(LegendDayPerformanceResponse, yield* queryLegendDayPerformance(url.searchParams))
  if (url.pathname === "/v2/stats/legend/days") return yield* response(LegendDaysResponse, yield* queryLegendDays(url.searchParams))
  return undefined
})
