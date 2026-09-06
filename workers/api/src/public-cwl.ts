import { PlayerCwlHistoryResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { publicTag } from "./public-war.js"
import { lookupStaticItem } from "./static-metadata.js"
import { badgeUrls } from "./war-archive-model.js"
import { readArchiveWar } from "./war-archive.js"

const failure = (cause: unknown) => new DatabaseFailure({ cause, message: "CWL history query failed" })
const unranked = 48_000_000
export interface CwlGroup {
  cwl_id: string; season: string; state: string; rounds: readonly (readonly string[])[];
  cwl_league_id: number | null; war_size: number | null; clan_tags: readonly string[]
}
export interface CwlWar {
  war_id: string; war_tag: string; state: string; size: number; end_time: Date | string;
  clan_tag: string; opponent_tag: string; clan_stars: number; opponent_stars: number;
  clan_destruction_percentage: number; opponent_destruction_percentage: number
}
export const StoredCwlRounds = Schema.Array(Schema.Struct({ warTags: Schema.Array(Schema.String) }))
const validTag = (tag: string) => tag !== "" && tag !== "#0"
const finished = (state: string) => ["warended", "ended"].includes(state.trim().toLowerCase())
const month = (season: string) => /^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/u.test(season) && !Number.isNaN(Date.parse(season)) ? season.slice(0, 7) : ""
const warLeague = (id: number | null) => id && id > 0 ? { id, name: lookupStaticItem("war_leagues", id)?.name ?? (id === unranked ? "Unranked" : "") } : null
const historyLimit = (query: URLSearchParams, fallback: number) => {
  const limit = query.has("limit") ? Number(query.get("limit")) : fallback
  return Number.isSafeInteger(limit) && limit > 0 ? Effect.succeed(limit) : Effect.fail(new InvalidRequest({ message: "Limit must be a positive integer" }))
}
export const loadCwlGroups = (clanTag: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<Omit<CwlGroup, "rounds"> & { rounds: unknown }>`SELECT g.cwl_id, g.season, g.state, g.rounds, g.cwl_league_id, g.war_size,
    array_agg(all_clans.clan_tag ORDER BY all_clans.clan_tag) AS clan_tags
    FROM cwl_groups g JOIN cwl_group_clans requested ON requested.cwl_id = g.cwl_id
    JOIN cwl_group_clans all_clans ON all_clans.cwl_id = g.cwl_id WHERE requested.clan_tag = ${clanTag}
    GROUP BY g.cwl_id, g.season, g.state, g.rounds, g.cwl_league_id, g.war_size
    ORDER BY CASE WHEN length(g.season) = 7 THEN g.season || '-01' ELSE g.season END, g.cwl_id`.pipe(Effect.mapError(failure))
  return yield* Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(StoredCwlRounds)(row.rounds).pipe(Effect.map((rounds): CwlGroup => ({ ...row, rounds: rounds.map(round => round.warTags) })), Effect.mapError(failure)))
})
export const loadCwlWars = (groups: readonly CwlGroup[]) => Effect.gen(function* () {
  const tags = [...new Set(groups.flatMap((group) => group.rounds.flat().filter(validTag)))]
  if (!tags.length) return new Map<string, CwlWar>()
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<CwlWar>`SELECT war_id::text, war_tag, state, size, end_time, clan_tag, opponent_tag, clan_stars, opponent_stars,
    clan_destruction_percentage::float8, opponent_destruction_percentage::float8 FROM wars
    WHERE war_type = 'cwl' AND war_tag = ANY(${tags}::text[])`.pipe(Effect.mapError(failure))
  return new Map(rows.map((war) => [war.war_tag, war]))
})

export const cwlStandings = (group: CwlGroup, wars: ReadonlyMap<string, CwlWar>) => {
  const blank = (tag: string) => ({ tag, stars: 0, destruction: 0, wins: 0, ties: 0, losses: 0, warsFinished: 0, rank: 0 })
  const standings = new Map(group.clan_tags.map((tag) => [tag, blank(tag)]))
  const expected = new Set(group.rounds.flat().filter(validTag))
  let complete = group.state === "ended" && expected.size > 0
  for (const tag of expected) {
    const war = wars.get(tag)
    if (!war || !finished(war.state)) { complete = false; continue }
    const outcome = Math.sign(war.clan_stars - war.opponent_stars || war.clan_destruction_percentage - war.opponent_destruction_percentage)
    for (const [tag, stars, destruction, result] of [
      [war.clan_tag, war.clan_stars, war.clan_destruction_percentage, outcome],
      [war.opponent_tag, war.opponent_stars, war.opponent_destruction_percentage, -outcome],
    ] as const) {
      const item = standings.get(tag) ?? blank(tag)
      item.stars += stars + (result > 0 ? 10 : 0)
      item.destruction += destruction
      item.warsFinished++
      if (result > 0) item.wins++
      else if (result < 0) item.losses++
      else item.ties++
      standings.set(tag, item)
    }
  }
  const items = [...standings.values()].sort((a, b) => b.stars - a.stars || b.destruction - a.destruction || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
  let rank = 0
  items.forEach((item, index) => {
    const previous = items[index - 1]
    if (!previous || item.stars !== previous.stars || item.destruction !== previous.destruction) rank = index + 1
    item.rank = rank
  })
  return { items, complete }
}
export const cwlSummary = (group: CwlGroup, wars: ReadonlyMap<string, CwlWar>, tag: string) => {
  const standing = cwlStandings(group, wars).items.find((item) => item.tag === tag && item.warsFinished > 0)
  return standing ? { rank: standing.rank, stars: standing.stars, destruction: Math.round(standing.destruction / standing.warsFinished * 100) / 100,
    rounds: { won: standing.wins, tied: standing.ties, lost: standing.losses } } : undefined
}

/** Promotion rules are historical data, matching cwl_league_backfill.go. */
export const nextCwlLeague = (id: number, rank: number, size: number, season: string) => {
  const level = id - unranked
  if (level < 1 || level > 22 || rank < 1 || size < 1) return unranked
  let promotion: number, demotion: number
  if (season >= "2026-05") {
    promotion = level <= 3 ? 3 : level <= 14 ? 2 : level <= 21 ? 1 : 0
    const count = level === 1 ? 0 : level <= 4 ? 1 : 2
    demotion = count === 0 ? 0 : size - count + 1
  } else {
    promotion = level <= 3 ? 3 : level <= 11 ? 2 : level === 18 || level === 22 ? 0 : 1
    demotion = level === 1 ? 9 : level <= 4 ? 8 : level === 18 ? 6 : 7
  }
  if (season >= "2026-05" && season <= "2026-08") {
    if (level >= 15 && level <= 17) promotion = 2
    if (level >= 18 && level <= 21) promotion = 4
    if (level >= 18 && level <= 22) demotion = size
  }
  if (promotion > 0 && rank <= promotion) return Math.min(unranked + 22, id + 1)
  if (demotion > 0 && rank >= demotion) return Math.max(unranked + 1, id - 1)
  return id
}

/** Existing GET read-repair is scoped to missing league/size columns only. */
export const ensureCwlLeagueIds = (tag: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const missing = yield* sql<{ league: boolean; size: boolean }>`SELECT COALESCE(bool_or(g.cwl_league_id IS NULL AND left(g.season, 7) < '2026-09'), false) AS league,
    COALESCE(bool_or(g.war_size IS NULL), false) AS size FROM cwl_groups g JOIN cwl_group_clans c ON c.cwl_id = g.cwl_id WHERE c.clan_tag = ${tag}`.pipe(Effect.mapError(failure))
  if (!missing[0]?.league && !missing[0]?.size) return
  const groups = yield* loadCwlGroups(tag)
  if (!groups.length) return
  const peers = [...new Set(groups.flatMap((group) => group.clan_tags))]
  const rows = yield* sql<{ clan_tag: string; seasons: unknown }>`SELECT clan_tag, seasons FROM cwl_league_history WHERE clan_tag = ANY(${peers}::text[])`.pipe(Effect.mapError(failure))
  const histories = new Map<string, Readonly<Record<string, number>>>()
  for (const row of rows) histories.set(row.clan_tag, yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Int))(row.seasons).pipe(Effect.mapError(failure)))
  const history = histories.get(tag)
  const hasHistory = !!missing[0]?.league && history !== undefined
  const assignments = new Map<string, number>()
  for (const group of groups) {
    if (group.cwl_league_id || !month(group.season)) continue
    const votes = group.clan_tags.map((clan) => histories.get(clan)?.[month(group.season)] ?? 0).filter((id) => id >= unranked && id <= unranked + 22)
    const counts = new Map<number, number>()
    for (const id of votes) {
      const count = (counts.get(id) ?? 0) + 1
      counts.set(id, count)
      if (count > votes.length / 2) { group.cwl_league_id = id; assignments.set(group.cwl_id, id); break }
    }
  }
  const wars = yield* loadCwlWars(groups)
  if (hasHistory || assignments.size > 0) {
    for (const [index, group] of groups.entries()) {
      const season = month(group.season)
      if (group.cwl_league_id || !season || season >= "2026-09") continue
      let id = season <= "2025-08" ? history?.[season] ?? 0 : 0
      const previous = groups[index - 1]
      if (!id && previous && Date.parse(group.season) > Date.parse(previous.season) && previous.cwl_league_id) {
        const rank = cwlStandings(previous, wars)
        if (rank.complete) id = nextCwlLeague(previous.cwl_league_id, rank.items.find((item) => item.tag === tag)?.rank ?? 0, previous.clan_tags.length, month(previous.season))
      }
      if (!id && season <= "2025-08" && hasHistory) id = unranked
      if (id) { group.cwl_league_id = id; assignments.set(group.cwl_id, id) }
    }
  }
  const sizes = new Map<string, number>()
  for (const group of groups) if (!group.war_size) {
    const values = new Set(group.rounds.flat().map((war) => wars.get(war)?.size ?? 0).filter((size) => size > 0))
    if (values.size === 1) sizes.set(group.cwl_id, [...values][0]!)
  }
  if (!assignments.size && !sizes.size && !hasHistory) return
  yield* sql.withTransaction(Effect.gen(function* () {
    for (const [id, league] of assignments) yield* sql`UPDATE cwl_groups SET cwl_league_id = ${league} WHERE cwl_id = ${id} AND cwl_league_id IS NULL`
    for (const [id, size] of sizes) yield* sql`UPDATE cwl_groups SET war_size = ${size} WHERE cwl_id = ${id} AND war_size IS NULL`
    if (hasHistory) {
      const remaining = yield* sql<{ count: string }>`SELECT count(*)::text AS count FROM cwl_groups g JOIN cwl_group_clans c ON c.cwl_id = g.cwl_id
        WHERE c.clan_tag = ${tag} AND g.cwl_league_id IS NULL AND left(g.season, 7) < '2026-09'`
      if (remaining[0]?.count === "0") yield* sql`DELETE FROM cwl_league_history WHERE clan_tag = ${tag}`
    }
  })).pipe(Effect.mapError(failure))
})

export const queryClanCwlSeasons = (rawTag: string, query: URLSearchParams) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), limit = yield* historyLimit(query, 12)
  yield* ensureCwlLeagueIds(tag)
  const groups = yield* loadCwlGroups(tag), selected: CwlGroup[] = [], seen = new Set<string>()
  for (const group of [...groups].reverse()) {
    if (group.state !== "ended" || seen.has(group.season)) continue
    seen.add(group.season); selected.push(group)
    if (selected.length === limit) break
  }
  const wars = yield* loadCwlWars(selected)
  return { items: selected.map((group) => ({ season: group.season, state: group.state, warSize: group.war_size && group.war_size > 0 ? group.war_size : null,
    warLeague: warLeague(group.cwl_league_id), rank: null, stars: null, destruction: null, rounds: null, ...cwlSummary(group, wars, tag) })) }
})

interface PlayerSeed {
  cwl_id: string; season: string; town_hall: number; cwl_league_id: number | null; war_size: number | null;
  clan_tag: string; name: string; badge_token: string; stars: number | null; wins: number | null; losses: number | null; ties: number | null;
  group_rank: number | null; global_rank: number | null
}
const playerSeeds = (tag: string, limit: number) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql<PlayerSeed>`SELECT g.cwl_id, g.season, pm.town_hall, g.cwl_league_id, COALESCE(g.war_size, s.war_size) AS war_size,
    gc.clan_tag, gc.name, gc.badge_token, s.stars, s.wins, s.losses, s.ties, s.group_rank, s.global_rank
    FROM cwl_group_members pm JOIN cwl_groups g ON g.cwl_id = pm.cwl_id
    JOIN cwl_group_clans gc ON gc.cwl_id = pm.cwl_id AND gc.clan_tag = pm.clan_tag
    LEFT JOIN cwl_standings s ON s.cwl_id = pm.cwl_id AND s.clan_tag = pm.clan_tag
    WHERE pm.tag = ${tag} ORDER BY g.season DESC, g.cwl_id DESC, gc.clan_tag LIMIT ${limit}`.pipe(Effect.mapError(failure))
})
type PlayerItem = typeof PlayerCwlHistoryResponse.Type.items[number]
export const queryPlayerCwlHistory = (rawTag: string, query: URLSearchParams) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), limit = yield* historyLimit(query, 6)
  let seeds = yield* playerSeeds(tag, limit)
  const missing = new Set(seeds.filter((seed) => !seed.cwl_league_id).map((seed) => seed.clan_tag))
  for (const clan of missing) yield* ensureCwlLeagueIds(clan)
  if (missing.size) seeds = yield* playerSeeds(tag, limit)
  const items: PlayerItem[] = []
  const clanGroups = new Map<string, CwlGroup[]>()
  for (const seed of seeds) {
    let groups = clanGroups.get(seed.clan_tag)
    if (!groups) { groups = yield* loadCwlGroups(seed.clan_tag); clanGroups.set(seed.clan_tag, groups) }
    const group = groups.find((entry) => entry.cwl_id === seed.cwl_id)
    if (!group) return yield* failure(new Error("CWL group disappeared during history read"))
    const wars = yield* loadCwlWars([group])
    const completed = [...wars.values()].filter((war) => finished(war.state))
    const rounds = new Map(group.rounds.flatMap((tags, index) => tags.filter(validTag).map((tag) => [tag, index + 1] as const)))
    const attacks: PlayerItem["attacks"][number][] = []
    const scores = new Map<string, { clan: string; player: string; stars: number }>()
    const sizes = new Set<number>()
    let missedAttacks = 0
    // Retain one archive at a time; group placement requires only scalar scores.
    for (const row of completed) {
      const entry = yield* readArchiveWar(row.war_id, row.end_time)
      if (!entry) continue
      const war = entry.war
      for (const clan of [war.clan, war.opponent]) for (const member of clan.members) {
        const key = `${clan.tag}\0${member.tag}`
        const score = scores.get(key) ?? { clan: clan.tag, player: member.tag, stars: 0 }
        score.stars += (member.attacks ?? []).reduce((sum, attack) => sum + attack.stars, 0)
        scores.set(key, score)
      }
      const own = war.clan.tag === seed.clan_tag ? war.clan : war.opponent.tag === seed.clan_tag ? war.opponent : undefined
      const opponent = own === war.clan ? war.opponent : war.clan
      const member = own?.members.find((member) => member.tag === tag)
      if (!member) continue
      sizes.add(war.teamSize)
      missedAttacks += Math.max(0, war.attacksPerMember - (member.attacks?.length ?? 0))
      for (const attack of member.attacks ?? []) {
        const defender = opponent.members.find((member) => member.tag === attack.defenderTag)
        attacks.push({ warTag: war.warTag ?? "", round: rounds.get(row.war_tag) ?? 0,
          opponent: { tag: opponent.tag, name: opponent.name ?? "" },
          defender: { tag: defender?.tag ?? "", name: defender?.name ?? "", townHallLevel: defender?.townhallLevel ?? 0, mapPosition: defender?.mapPosition ?? 0 },
          stars: attack.stars, destructionPercentage: attack.destructionPercentage, order: attack.order, duration: attack.duration })
      }
    }
    attacks.sort((a, b) => a.round - b.round || a.order - b.order)
    const summary = cwlSummary(group, wars, seed.clan_tag)
    const hasStanding = seed.stars !== null && seed.wins !== null && seed.losses !== null && seed.ties !== null
    const target = scores.get(`${seed.clan_tag}\0${tag}`)
    const placementAvailable = group.state.toLowerCase() === "ended" && completed.length === group.rounds.flat().filter(validTag).length
    const placement = placementAvailable && target ? {
      clan: 1 + [...scores.values()].filter((score) => score.clan === seed.clan_tag && score.stars > target.stars).length,
      group: 1 + [...scores.values()].filter((score) => score.stars > target.stars).length,
    } : null
    items.push({ season: seed.season, townHallLevel: seed.town_hall, teamSize: seed.war_size ?? (sizes.size === 1 ? [...sizes][0]! : null),
      clan: { name: seed.name, tag: seed.clan_tag, badgeUrls: badgeUrls(seed.badge_token), warLeague: warLeague(seed.cwl_league_id),
        totalStars: summary?.stars ?? (hasStanding ? seed.stars : null),
        wars: summary ? { won: summary.rounds.won, lost: summary.rounds.lost, tied: summary.rounds.tied }
          : hasStanding ? { won: seed.wins!, lost: seed.losses!, tied: seed.ties! } : null,
        placement: summary || seed.group_rank !== null || seed.global_rank !== null ? { group: summary?.rank ?? seed.group_rank, global: seed.global_rank } : null },
      attacks, placement, missedAttacks })
  }
  return { items }
})
