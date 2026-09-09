import {
  BotPlayerRankingsEndpoint, BotPlayerLegendHistoryEndpoint, BotLegendSeasonEndpoint,
  BotPlayerWarAttacksEndpoint, BotClanCapitalLeaderboardEndpoint,
  publicPlayerExtraEndpoints, type AnyEndpoint,
} from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { publicTag } from "./public-war.js"
import { publicHistoryOptions, isoTimestamp } from "./public-player.js"
import { leaderboardHistoryItem, historicalHomeLeagues } from "./public-history.js"
import { leaderboardLimit } from "./public-leaderboards.js"
import { correctedJoinLeaveEvents, type JoinLeaveRow } from "./public-join-leave.js"
import { forEachNewestPlayerWar } from "./war-archive.js"
import { lookupStaticItem } from "./static-metadata.js"
import { badgeUrls, archiveAttackFacts, clashTime, type ArchiveAttackFact } from "./war-archive-model.js"
import locations from "./data/search-locations.json"

const failure = (cause: unknown) => new DatabaseFailure({ cause, message: "Player public data query failed" })
const uniqueTags = (rawTags: readonly string[]) => Effect.all([...new Set(rawTags)].map(publicTag)).pipe(Effect.map((tags) => [...new Set(tags)]))
interface RankingRow { player_tag: string; ranking_type: "home" | "builder_base"; location_id: string; rank: number | null; points: number | null }
type PlayerRankings = typeof BotPlayerRankingsEndpoint.response.Type
type RankingCategory = { trophies: number | null; globalRank: number | null; localRank: number | null }
const rankingRows = (tags: readonly string[]) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  if (!tags.length) return [] as readonly RankingRow[]
  return yield* sql<RankingRow>`SELECT player_tag, ranking_type, location_id, rank, points FROM player_rankings_current
    WHERE player_tag = ANY(${[...tags]}::text[]) ORDER BY player_tag, CASE ranking_type WHEN 'home' THEN 1 ELSE 2 END,
    CASE WHEN location_id = 'global' THEN 0 ELSE 1 END, location_id`.pipe(Effect.mapError(failure))
})
export const queryPlayerRankingsBatch = (rawTags: readonly string[]) => Effect.gen(function* () {
  const tags = yield* uniqueTags(rawTags), rows = yield* rankingRows(tags)
  const result = new Map<string, PlayerRankings>(tags.map((tag) => [tag, { tag }]))
  for (const row of rows) {
    const value = result.get(row.player_tag)!
    const key = row.ranking_type === "home" ? "homeVillage" : "builderBase"
    const category: RankingCategory = { trophies: null, globalRank: null, localRank: null, ...value[key] }
    if (row.location_id === "global") {
      if (row.rank !== null || row.points !== null) result.set(row.player_tag, { ...value, [key]: { ...category, globalRank: row.rank, trophies: row.points } })
      continue
    }
    const id = Number(row.location_id)
    const location = value.location ?? locations.find((entry) => entry.id === id) ?? { id, isCountry: false }
    result.set(row.player_tag, { ...value, location,
      ...(row.rank !== null || row.points !== null ? { [key]: { ...category, localRank: row.rank, trophies: category.trophies ?? row.points } } : {}) })
  }
  return result
})
export const queryPlayerRankings = (rawTag: string) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), result = (yield* queryPlayerRankingsBatch([tag])).get(tag)!
  if (!result.homeVillage && !result.builderBase && !result.location) return yield* new NotFound({ message: "No player ranking history found" })
  return result
})

type MobileRankingCategory = { globalRank: number | null; localRank: number | null; points: number | null; locationId: string | null; locationName: string | null; countryCode: string | null }
const emptyMobileRanking = (): MobileRankingCategory => ({ globalRank: null, localRank: null, points: null, locationId: null, locationName: null, countryCode: null })
export const queryMobilePlayerRankingsBatch = (rawTags: readonly string[]) => Effect.gen(function* () {
  const tags = yield* uniqueTags(rawTags), rows = yield* rankingRows(tags)
  const result = new Map(tags.map((tag) => [tag, { tag, homeVillage: emptyMobileRanking(), builderBase: emptyMobileRanking() }]))
  for (const row of rows) {
    const entry = result.get(row.player_tag)!, category = entry[row.ranking_type === "home" ? "homeVillage" : "builderBase"]
    if (row.location_id === "global") { category.globalRank = row.rank; category.points = row.points; continue }
    category.locationId = row.location_id; category.localRank = row.rank; category.points ??= row.points
    const location = locations.find((entry) => String(entry.id) === row.location_id)
    if (location) { category.locationName = location.name; category.countryCode = "countryCode" in location ? location.countryCode ?? null : null }
  }
  return result
})

interface LegendRow {
  season: string; player_tag: string; player_name: string; exp_level: number; trophies: number; attack_wins: number; defense_wins: number; rank: number;
  clan_tag: string | null; clan_name: string | null; clan_badge_token: string | null; league_tier_id: number | null;
}
const legendItem = (row: LegendRow): typeof BotPlayerLegendHistoryEndpoint.response.Type.items[number] => {
  const tier = row.league_tier_id === null ? undefined : lookupStaticItem("league_tiers", row.league_tier_id)
  return { name: row.player_name, tag: row.player_tag, season: row.season, expLevel: row.exp_level, trophies: row.trophies,
    attackWins: row.attack_wins, defenseWins: row.defense_wins, rank: row.rank,
    ...(row.clan_tag !== null || row.clan_name !== null || row.clan_badge_token !== null ? { clan: {
      ...(row.clan_name ? { name: row.clan_name } : {}), ...(row.clan_tag ? { tag: row.clan_tag } : {}),
      ...(row.clan_badge_token ? { badgeUrls: badgeUrls(row.clan_badge_token) } : {}),
    } } : {}),
    ...(row.league_tier_id === null ? {} : { leagueTier: { id: row.league_tier_id, ...(tier ? { name: tier.name, ...(tier.iconUrls ? { iconUrls: tier.iconUrls } : {}) } : {}) } }),
  }
}
export const queryPlayerLegendHistoryBatch = (rawTags: readonly string[], limit = 10) => Effect.gen(function* () {
  const tags = yield* uniqueTags(rawTags), sql = yield* SqlClient.SqlClient
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) return yield* new InvalidRequest({ message: "Invalid Legend history limit" })
  const result = new Map<string, Array<ReturnType<typeof legendItem>>>(tags.map((tag) => [tag, []]))
  if (!tags.length) return result
  const rows = yield* sql<LegendRow>`SELECT history.* FROM unnest(${tags}::text[]) requested(tag)
    CROSS JOIN LATERAL (SELECT * FROM legend_history WHERE player_tag = requested.tag ORDER BY season DESC LIMIT ${limit}) history
    ORDER BY history.player_tag, history.season DESC`.pipe(Effect.mapError(failure))
  for (const row of rows) result.get(row.player_tag)!.push(legendItem(row))
  return result
})
export const queryPlayerLegendHistory = (rawTag: string) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), sql = yield* SqlClient.SqlClient
  const rows = yield* sql<LegendRow>`SELECT * FROM legend_history WHERE player_tag = ${tag} ORDER BY season DESC`.pipe(Effect.mapError(failure))
  return { items: rows.map(legendItem) }
})
export const queryLegendSeasonHistory = (season: string, query: URLSearchParams) => Effect.gen(function* () {
  if (!season.trim() || new TextEncoder().encode(season).length > 128) return yield* new InvalidRequest({ message: "Invalid season" })
  const limit = query.has("limit") ? Number(query.get("limit")) : 25
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return yield* new InvalidRequest({ message: "Limit must be between 1 and 200" })
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<LegendRow>`SELECT * FROM legend_history WHERE season = ${season} ORDER BY rank LIMIT ${limit}`.pipe(Effect.mapError(failure))
  return { items: rows.map(legendItem) }
})

const integerPath = (raw: string, label: string) => /^-?\d+$/u.test(raw) && Number.isSafeInteger(Number(raw))
  ? Effect.succeed(Number(raw)) : Effect.fail(new InvalidRequest({ message: `Invalid ${label}` }))
const safeNumber = (raw: string | number) => Effect.try({ try: () => {
  const number = Number(raw)
  if (!Number.isSafeInteger(number)) throw new Error("Stored integer exceeds the JSON contract's exact numeric range")
  return number
}, catch: failure })
interface RankedRow {
  player_tag: string; player_name: string; placement: number; league_trophies: number; group_tag: string; league_tier_id: number;
  town_hall: number; maximum_battle_count: number;
}
const rankedMember = ({ player_tag, player_name, group_tag, league_tier_id, ...row }: RankedRow, includeGroup: boolean) => ({
  name: player_name, tag: player_tag, ...row,
  ...(includeGroup ? { group_tag, league_tier_id } : {}),
})
export const queryPlayerRankedGroup = (rawTag: string, rawSeason: string) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), season = yield* integerPath(rawSeason, "season"), sql = yield* SqlClient.SqlClient
  const rows = yield* sql<RankedRow>`SELECT player_tag, player_name, placement, league_trophies,
    group_tag, league_tier_id, town_hall, maximum_battle_count
    FROM ranked_league_group_members WHERE season_id = ${String(season)}::bigint AND player_tag = ${tag}`.pipe(Effect.mapError(failure))
  const row = rows[0]
  if (!row) return { tag, season, group: null, members: [] }
  const member = rankedMember(row, true)
  const members = yield* sql<RankedRow>`SELECT player_tag, player_name, placement, league_trophies,
    group_tag, league_tier_id, town_hall, maximum_battle_count
    FROM ranked_league_group_members WHERE season_id = ${String(season)}::bigint AND group_tag = ${row.group_tag}
    ORDER BY placement, player_tag`.pipe(Effect.mapError(failure))
  return { season, group_tag: row.group_tag, league_tier_id: row.league_tier_id, player: member, members: members.map((item) => rankedMember(item, false)), count: members.length }
})

export const queryPlayerTypedLeaderboardHistory = (rawTag: string, type: string) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag)
  if (type !== "player_home_trophies" && type !== "player_builder_base_trophies") return yield* new InvalidRequest({ message: "Invalid player leaderboard type" })
  const sql = yield* SqlClient.SqlClient
  const table = type === "player_home_trophies" ? "leaderboard_history_player_home" : "leaderboard_history_player_builder_base"
  const rows = yield* sql<Parameters<typeof leaderboardHistoryItem>[0]>`SELECT * FROM ${sql(table)} WHERE player_tag = ${tag} ORDER BY date DESC, location_id, rank`.pipe(Effect.mapError(failure))
  const leagues = type === "player_home_trophies" && rows.some((row) => row.league_id != null && row.league_id >= 29_000_000 && row.league_id < 30_000_000)
    ? yield* historicalHomeLeagues(yield* WorkerEnvironment) : undefined
  return { type, playerTag: tag, items: rows.map((row) => ({ date: isoTimestamp(row.date).slice(0, 10), locationId: row.location_id,
    name: row.player_name, rank: row.rank, details: leaderboardHistoryItem(row, type, leagues) })) }
})

export const queryPlayerStatHistory = (rawTag: string, query: URLSearchParams, now = new Date()) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), type = query.get("type")?.trim() ?? ""
  if (!["donated", "received", "clan_games", "capital_gold_donated"].includes(type)) return yield* new InvalidRequest({ message: "Invalid stat type" })
  const options = yield* publicHistoryOptions(query)
  if (!query.get("time[after]")?.trim() && !query.get("time[before]")?.trim()) { options.start = new Date(now.getTime() - 30 * 86400000); options.end = now }
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ event_time: Date | string; clan_tag: string | null; stat_type: string; previous_value: string; current_value: string; delta: string }>`
    SELECT event_time, clan_tag, stat_type, previous_value::text, current_value::text, delta::text FROM player_stat_changes
    WHERE player_tag = ${tag} AND stat_type = ${type} AND event_time >= ${options.start} AND event_time <= ${options.end}
    ORDER BY event_time DESC LIMIT ${options.limit}`.pipe(Effect.mapError(failure))
  const items = []
  for (const row of rows) items.push({ eventTime: isoTimestamp(row.event_time), clanTag: row.clan_tag, statType: row.stat_type,
    previousValue: yield* safeNumber(row.previous_value), currentValue: yield* safeNumber(row.current_value), delta: yield* safeNumber(row.delta) })
  return { items }
})

export const queryCapitalGoldLeaderboard = (rawLocation: string, query: URLSearchParams) => Effect.gen(function* () {
  const location = yield* integerPath(rawLocation, "location identifier"), sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ tag: string; name: string; location_id: number; badge_token: string; value: string; war_win_streak: number; rank: string }>`
    SELECT c.tag, c.name, c.location_id, c.badge_token, c.capital_gold_total::text AS value, c.war_win_streak, l.location_capital_gold_rank::text AS rank
    FROM clan_leaderboards l JOIN basic_clan c ON c.tag = l.tag WHERE c.location_id = ${location}
    ORDER BY l.location_capital_gold_rank LIMIT ${leaderboardLimit(query)}`.pipe(Effect.mapError(failure))
  const items = []
  for (const row of rows) { const badges = badgeUrls(row.badge_token)
    items.push({ name: row.name, tag: row.tag, badgeUrls: badges, badge_url: badges.large, location_id: row.location_id,
      capital_gold_total: yield* safeNumber(row.value), war_win_streak: row.war_win_streak, rank: yield* safeNumber(row.rank) }) }
  return { location_id: location, kind: "capital_gold_total", items, count: items.length }
})
export const queryTrophyBuckets = (rawLeague: string) => Effect.gen(function* () {
  const league = yield* integerPath(rawLeague, "league identifier"), sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ bucket: number; players: number; trophies: string }>`SELECT width_bucket(trophies,0,7000,14) AS bucket,
    count(*)::integer AS players, COALESCE(sum(trophies),0)::text AS trophies FROM basic_player WHERE league_id = ${league} GROUP BY bucket ORDER BY bucket`.pipe(Effect.mapError(failure))
  const items = []
  for (const row of rows) items.push({ ...row, trophies: yield* safeNumber(row.trophies) })
  return { league_tier_id: league, items, count: items.length }
})

type ClanInterval = { tag: string; name: string; start: number; end: number }
const clanIntervals = (events: readonly JoinLeaveRow[], now: Date): ClanInterval[] => {
  const intervals: ClanInterval[] = []
  let active: JoinLeaveRow | undefined
  const append = (event: JoinLeaveRow, end: Date | string) => {
    const startTime = new Date(event.time).getTime(), endTime = new Date(end).getTime()
    if (event.clan_tag && endTime > startTime) intervals.push({ tag: event.clan_tag, name: event.clan_name ?? "", start: startTime, end: endTime })
  }
  for (const event of correctedJoinLeaveEvents(events)) {
    if (event.type === "join") { if (active) append(active, event.time); active = event }
    else if (event.type === "leave" && active?.clan_tag === event.clan_tag) { append(active, event.time); active = undefined }
  }
  if (active) append(active, now)
  return intervals
}
export const sharedClanTotals = (left: readonly JoinLeaveRow[], right: readonly JoinLeaveRow[], now = new Date()) => {
  const a = clanIntervals(left, now), b = clanIntervals(right, now), totals = new Map<string, { clan: { name: string; tag: string }; minutes: number }>()
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    const first = a[i]!, second = b[j]!, overlap = Math.min(first.end, second.end) - Math.max(first.start, second.start)
    if (first.tag === second.tag && overlap > 0) {
      const total = totals.get(first.tag) ?? { clan: { name: first.name || second.name, tag: first.tag }, minutes: 0 }
      total.clan.name ||= first.name || second.name; total.minutes += Math.trunc(overlap / 60000); totals.set(first.tag, total)
    }
    if (first.end <= second.end) i++; else j++
  }
  return [...totals.values()].sort((a, b) => b.minutes - a.minutes || a.clan.tag.localeCompare(b.clan.tag))
}
export const queryPlayerJoinLeaveShared = (rawTag: string, otherTag: string, now = new Date()) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), other = yield* publicTag(otherTag), sql = yield* SqlClient.SqlClient
  const rows = yield* sql<JoinLeaveRow>`SELECT jl."time", jl."type", jl.clan_tag, jl.player_tag, jl.player_name, jl.townhall_level, c.name AS clan_name
    FROM join_leave_history jl LEFT JOIN basic_clan c ON c.tag = jl.clan_tag
    WHERE jl.player_tag = ANY(${[tag, other]}::text[]) AND jl."time" >= ${new Date(0)} AND jl."time" <= ${new Date(9_999_999_999_000)}
    ORDER BY jl."time", jl.clan_tag, jl."type"`.pipe(Effect.mapError(failure))
  return { items: sharedClanTotals(rows.filter((row) => row.player_tag === tag), rows.filter((row) => row.player_tag === other), now) }
})

export const queryPlayerWarAttacks = (rawTag: string, query: URLSearchParams) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), options = yield* publicHistoryOptions(query), type = query.get("type")?.trim().toLowerCase() ?? ""
  if (type && !["random", "friendly", "cwl"].includes(type)) return yield* new InvalidRequest({ message: "Invalid war type" })
  const attacks: ArchiveAttackFact[] = []
  const order = (a: ArchiveAttackFact, b: ArchiveAttackFact) => b.warEndTime.getTime() - a.warEndTime.getTime() || b.attackOrder - a.attackOrder || Number(b.warId) - Number(a.warId)
  yield* forEachNewestPlayerWar([tag], options.start, options.end, type ? [type] : [], Math.max(8, options.limit * 2), (id, war) => Effect.sync(() => {
    for (const attack of archiveAttackFacts(id, war)) if (attack.attackerTag === tag || attack.defenderTag === tag) {
      attacks.push(attack); attacks.sort(order); if (attacks.length > options.limit) attacks.pop()
    }
    return attacks.length >= options.limit
  }))
  return { items: attacks.map(({ warId, warEndTime, ...attack }) => ({ ...attack, war_id: warId, warEndTime: clashTime(warEndTime), side: attack.attackerTag === tag ? "attack" : "defense" })) }
})

export const publicPlayerExtraRuntimeRoutes = [
  { method: "GET", path: "/v2/player/:tag/rankings" },
  { method: "GET", path: "/v2/player/:tag/legend-history" },
  { method: "GET", path: "/v2/player/:playerTag/ranked/:season/group" },
  { method: "GET", path: "/v2/player/:playerTag/leaderboard-history/:leaderboardType" },
  { method: "GET", path: "/v2/player/:playerTag/join-leave/shared" },
  { method: "GET", path: "/v2/player/:tag/war/attacks" },
  { method: "GET", path: "/v2/player/:playerTag/history/stats" },
  { method: "GET", path: "/v2/legends/history/:season" },
  { method: "GET", path: "/v2/leaderboard/:locationId/clan/capital-gold" },
  { method: "GET", path: "/v2/leaderboard/:leagueTierId/trophy-buckets" },
] as const
const extraEndpoints: readonly AnyEndpoint[] = [BotPlayerRankingsEndpoint, BotPlayerLegendHistoryEndpoint, BotPlayerWarAttacksEndpoint, BotLegendSeasonEndpoint, BotClanCapitalLeaderboardEndpoint, ...Object.values(publicPlayerExtraEndpoints)]
const execute = (operation: string, path: Record<string, string>, query: URLSearchParams): Effect.Effect<unknown, ApiFailure, SqlClient.SqlClient | WorkerEnvironment> => {
  switch (operation) {
    case "botPlayerRankings": return queryPlayerRankings(path.tag!)
    case "botPlayerLegendHistory": return queryPlayerLegendHistory(path.tag!)
    case "botPlayerWarAttacks": return queryPlayerWarAttacks(path.tag!, query)
    case "botLegendSeason": return queryLegendSeasonHistory(path.season!, query)
    case "botClanCapitalLeaderboard": return queryCapitalGoldLeaderboard(path.locationId!, query)
    case "getPlayerRankedGroup": return queryPlayerRankedGroup(path.playerTag!, path.season!)
    case "getPlayerTypedLeaderboardHistory": return queryPlayerTypedLeaderboardHistory(path.playerTag!, path.leaderboardType!)
    case "getPlayerJoinLeaveShared": return queryPlayerJoinLeaveShared(path.playerTag!, query.get("tag") ?? "")
    case "getPlayerStatHistory": return queryPlayerStatHistory(path.playerTag!, query)
    case "getTrophyBuckets": return queryTrophyBuckets(path.leagueTierId!)
    default: return Effect.fail(new NotFound({ message: "Public player operation not found" }))
  }
}
export const dispatchPublicPlayerExtra = (request: Request, bindings: WorkerBindings): Effect.Effect<Response | undefined, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  if (request.method !== "GET") return undefined
  const url = new URL(request.url), actual = url.pathname.split("/")
  for (const endpoint of extraEndpoints) {
    const expected = endpoint.path.split("/")
    if (expected.length !== actual.length || expected.some((part, i) => !part.startsWith(":") && part !== actual[i])) continue
    const path = yield* Effect.try({ try: () => Object.fromEntries(expected.flatMap((part, i) => part.startsWith(":") ? [[part.slice(1), decodeURIComponent(actual[i]!)]] : [])), catch: () => new InvalidRequest({ message: "Malformed path encoding" }) })
    const value = yield* execute(endpoint.operationId, path, url.searchParams).pipe(Effect.provideService(WorkerEnvironment, bindings))
    const encoded = yield* Schema.encodeUnknownEffect(endpoint.response)(value).pipe(Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Stored player data does not match the response contract" })))
    return Response.json(encoded)
  }
  return undefined
})
