import { LeaderboardHistoryResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { publicHistoryOptions, isoTimestamp, parseHistoryTime } from "./public-player.js"
import { publicTag } from "./public-war.js"
import { badgeUrls } from "./war-archive-model.js"
import { lookupStaticItem } from "./static-metadata.js"
import type { WorkerBindings } from "./environment.js"
import { readBoundedJson } from "./request-body.js"
import locations from "./data/search-locations.json"

const failure = (cause: unknown) => new DatabaseFailure({ cause, message: "Leaderboard history query failed" })
const kinds = {
  player_home_trophies: { table: "leaderboard_history_player_home", points: "trophies", field: "trophies" },
  player_builder_base_trophies: { table: "leaderboard_history_player_builder_base", points: "builder_base_trophies", field: "builderBaseTrophies" },
  clan_home_points: { table: "leaderboard_history_clan_home", points: "clan_points", field: "clanPoints" },
  clan_builder_base_points: { table: "leaderboard_history_clan_builder_base", points: "builder_base_points", field: "builderBasePoints" },
  clan_capital_points: { table: "leaderboard_history_clan_capital", points: "capital_points", field: "capitalPoints" },
} as const
type HistoryKind = keyof typeof kinds
export const historyKind = (raw: string | null, clanOnly = false) => {
  if (!raw || !Object.hasOwn(kinds, raw) || clanOnly && !raw.startsWith("clan_")) return Effect.fail(new InvalidRequest({ message: "Invalid leaderboard type" }))
  return Effect.succeed(raw as HistoryKind)
}
interface HistoryRow {
  date: Date | string; location_id: string; rank: number; previous_rank: number | null;
  player_tag?: string; player_name?: string; exp_level?: number; trophies?: number; attack_wins?: number; defense_wins?: number;
  builder_base_trophies?: number; builder_base_battle_wins?: number | null; league_id?: number | null;
  clan_tag: string | null; clan_name: string | null; clan_badge_token: string | null; clan_level?: number;
  clan_points?: number; builder_base_points?: number; capital_points?: number; members?: number; clan_location_id?: number | null;
}
const league = (category: string, id: number) => {
  const item = lookupStaticItem(category, id)
  return { id, ...(item ? { name: item.name, ...(item.iconUrls ? { iconUrls: item.iconUrls } : {}) } : {}) }
}
const OfficialLeague = Schema.Struct({ id: Schema.Number, name: Schema.String, iconUrls: Schema.optionalKey(Schema.Struct({ tiny: Schema.optionalKey(Schema.String), small: Schema.optionalKey(Schema.String), medium: Schema.optionalKey(Schema.String) })) })
export const historicalHomeLeagues = (bindings: WorkerBindings) => Effect.gen(function* () {
  const response = yield* Effect.tryPromise({ try: (signal) => bindings.CLASH_PROXY.fetch(new Request("https://clash-proxy.internal/v1/leagues", { signal, redirect: "error" })), catch: (cause) => cause })
  if (!response.ok) { yield* Effect.promise(() => response.body?.cancel() ?? Promise.resolve()); return new Map<number, typeof OfficialLeague.Type>() }
  const payload = yield* readBoundedJson(response)
  const value = yield* Schema.decodeUnknownEffect(Schema.Struct({ items: Schema.Array(OfficialLeague) }))(payload)
  return new Map(value.items.map((item) => [item.id, item]))
}).pipe(Effect.timeout("15 seconds"), Effect.catch(() => Effect.succeed(new Map<number, typeof OfficialLeague.Type>())))
export const leaderboardHistoryItem = (row: HistoryRow, type: HistoryKind, homeLeagues: ReadonlyMap<number, typeof OfficialLeague.Type> = new Map()) => {
  const common = { rank: row.rank, ...(row.previous_rank === null ? {} : { previousRank: row.previous_rank }) }
  if (type.startsWith("player_")) {
    const clan = row.clan_tag !== null && row.clan_name !== null && row.clan_badge_token !== null
      ? { clan: { tag: row.clan_tag, name: row.clan_name, badgeUrls: badgeUrls(row.clan_badge_token) } } : {}
    const leagueId = row.league_id
    const leagueInfo = leagueId == null ? {} : type === "player_builder_base_trophies" ? { builderBaseLeague: league("builder_leagues", leagueId) }
      : leagueId >= 105_000_000 && leagueId < 106_000_000 ? { leagueTier: league("league_tiers", leagueId) }
      : leagueId >= 29_000_000 && leagueId < 30_000_000 ? { league: homeLeagues.get(leagueId) ?? { id: leagueId } } : {}
    return { name: row.player_name, tag: row.player_tag, expLevel: row.exp_level, ...common, ...clan, ...leagueInfo,
      ...(type === "player_home_trophies" ? { trophies: row.trophies, attackWins: row.attack_wins, defenseWins: row.defense_wins }
        : { builderBaseTrophies: row.builder_base_trophies, ...(row.builder_base_battle_wins == null ? {} : { builderBaseBattleWins: row.builder_base_battle_wins }) }),
    }
  }
  const location = row.clan_location_id == null ? undefined : locations.find((entry) => entry.id === row.clan_location_id) ?? { id: row.clan_location_id, isCountry: false }
  const config = kinds[type]
  const points = type === "clan_home_points" ? row.clan_points : type === "clan_builder_base_points" ? row.builder_base_points : row.capital_points
  return { name: row.clan_name, tag: row.clan_tag, badgeUrls: badgeUrls(row.clan_badge_token), clanLevel: row.clan_level,
    members: row.members, ...common, [config.field]: points, ...(location ? { location } : {}),
  }
}
export const queryLeaderboardHistory = (rawType: string, locationId: string, rawDate: string, bindings?: WorkerBindings) => Effect.gen(function* () {
  const type = yield* historyKind(rawType)
  if (!/^(global|\d+)$/u.test(locationId)) return yield* new InvalidRequest({ message: "Invalid location identifier" })
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(rawDate)) return yield* new InvalidRequest({ message: "Invalid leaderboard date" })
  yield* parseHistoryTime(rawDate, new Date(0))
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<HistoryRow>`SELECT * FROM ${sql(kinds[type].table)} WHERE location_id = ${locationId} AND date = ${rawDate}::date ORDER BY rank`.pipe(Effect.mapError(failure))
  const leagues = bindings && type === "player_home_trophies" && rows.some((row) => row.league_id != null && row.league_id >= 29_000_000 && row.league_id < 30_000_000)
    ? yield* historicalHomeLeagues(bindings) : undefined
  return yield* Schema.decodeUnknownEffect(LeaderboardHistoryResponse)({ type, locationId, date: rawDate, items: rows.map((row) => leaderboardHistoryItem(row, type, leagues)) }).pipe(Effect.mapError(failure))
})

// Mirrors clashy.go trophy season calendar, including the 2025 transition.
const cutoffStart = Date.parse("2025-08-25T05:00:00Z"), cutoffEnd = Date.parse("2025-10-06T05:00:00Z"), seasonDuration = 28 * 86_400_000
const lastMonday = (year: number, month: number) => {
  const date = new Date(Date.UTC(year, month + 1, 0, 5))
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  return date
}
export const trophySeason = (raw: Date | string) => {
  const time = new Date(raw)
  if (time.getTime() >= cutoffStart && time.getTime() < cutoffEnd) return { season: "2025-09", start: new Date(cutoffStart), end: new Date(cutoffEnd) }
  if (time.getTime() >= cutoffEnd) {
    const count = Math.floor((time.getTime() - cutoffEnd) / seasonDuration)
    return { season: new Date(Date.UTC(2025, 9 + count, 1)).toISOString().slice(0, 7), start: new Date(cutoffEnd + count * seasonDuration), end: new Date(cutoffEnd + (count + 1) * seasonDuration) }
  }
  let end = lastMonday(time.getUTCFullYear(), time.getUTCMonth())
  if (time >= end) end = lastMonday(time.getUTCFullYear(), time.getUTCMonth() + 1)
  return { season: end.toISOString().slice(0, 7), start: lastMonday(end.getUTCFullYear(), end.getUTCMonth() - 1), end }
}
export const queryClanLeaderboardHistory = (rawTag: string, query: URLSearchParams, summary: boolean) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), type = yield* historyKind(query.get("type"), true)
  const sql = yield* SqlClient.SqlClient, config = kinds[type]
  if (summary) {
    const rows = yield* sql<{ date: Date | string; best_rank: number; peak_points: number }>`SELECT date, MIN(rank) AS best_rank, MAX(${sql(config.points)}) AS peak_points
      FROM ${sql(config.table)} WHERE clan_tag = ${tag} GROUP BY date ORDER BY date DESC`.pipe(Effect.mapError(failure))
    const seasons = new Map<string, { season: string; after: string; before: string; daysInTop200: number; bestRank: number; peakPoints: number }>()
    for (const row of rows) {
      const window = trophySeason(row.date)
      const previous = seasons.get(window.season)
      if (previous) { previous.daysInTop200++; previous.bestRank = Math.min(previous.bestRank, row.best_rank); previous.peakPoints = Math.max(previous.peakPoints, row.peak_points) }
      else seasons.set(window.season, { season: window.season, after: `${window.start.toISOString().slice(0, 10)}T00:00:00Z`,
        before: `${new Date(Date.parse(window.end.toISOString().slice(0, 10)) - 1).toISOString().slice(0, 19)}.999999999Z`,
        daysInTop200: 1, bestRank: row.best_rank, peakPoints: row.peak_points })
    }
    return { seasons: [...seasons.values()] }
  }
  const options = yield* publicHistoryOptions(query)
  if (options.limit > 250) return yield* new InvalidRequest({ message: "Limit must be between 1 and 250" })
  const rows = yield* sql<HistoryRow>`SELECT * FROM ${sql(config.table)} WHERE clan_tag = ${tag} AND date >= ${options.start} AND date <= ${options.end}
    ORDER BY date DESC, location_id, rank LIMIT ${options.limit}`.pipe(Effect.mapError(failure))
  return { items: rows.map((row) => {
    const detail = leaderboardHistoryItem(row, type)
    const points = type === "clan_home_points" ? row.clan_points : type === "clan_builder_base_points" ? row.builder_base_points : row.capital_points
    return { date: isoTimestamp(row.date).slice(0, 10), rank: row.rank, members: row.members, [config.field]: points, ...("location" in detail ? { location: detail.location } : {}) }
  }) }
})

interface LegendRow { season: string; player_tag: string; player_name: string; trophies: number; attack_wins: number; defense_wins: number; rank: number }
const legendItem = (row: LegendRow) => ({ season: row.season, tag: row.player_tag, name: row.player_name, trophies: row.trophies, attackWins: row.attack_wins, defenseWins: row.defense_wins, rank: row.rank })
export const queryClanLegendHistory = (rawTag: string, query: URLSearchParams, summary: boolean) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), sql = yield* SqlClient.SqlClient
  const seasonTime = sql`CASE
    WHEN season ~ '^v2-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?Z$'
      AND pg_input_is_valid(substring(season FROM 4), 'timestamp with time zone') THEN substring(season FROM 4)::timestamptz
    WHEN season ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN (season || '-01')::timestamptz ELSE NULL END`
  if (summary) {
    const top = query.has("top") ? Number(query.get("top")) : 10
    if (!Number.isInteger(top) || top < 1 || top > 50) return yield* new InvalidRequest({ message: "Top must be between 1 and 50" })
    const seasons = yield* sql<{ season: string; season_time: Date | string; count: string }>`SELECT season, season_time, COUNT(*)::text AS count
      FROM (SELECT season, ${seasonTime} AS season_time FROM legend_history WHERE clan_tag = ${tag}) history
      WHERE season_time IS NOT NULL GROUP BY season, season_time ORDER BY season_time DESC`.pipe(Effect.mapError(failure))
    const topRows = yield* sql<LegendRow>`SELECT season, player_tag, player_name, trophies, attack_wins, defense_wins, rank
      FROM legend_history WHERE clan_tag = ${tag} ORDER BY rank, trophies DESC, season DESC LIMIT ${top}`.pipe(Effect.mapError(failure))
    return { seasons: seasons.map((row) => ({ season: row.season, after: isoTimestamp(row.season_time), before: isoTimestamp(row.season_time), playerCount: Number(row.count) })), topFinishes: topRows.map(legendItem) }
  }
  const options = yield* publicHistoryOptions(query)
  if (options.limit > 250) return yield* new InvalidRequest({ message: "Limit must be between 1 and 250" })
  const rows = yield* sql<LegendRow>`SELECT season, player_tag, player_name, trophies, attack_wins, defense_wins, rank
    FROM (SELECT *, ${seasonTime} AS season_time FROM legend_history WHERE clan_tag = ${tag}) history
    WHERE season_time >= ${options.start} AND season_time <= ${options.end} ORDER BY season_time DESC, rank LIMIT ${options.limit}`.pipe(Effect.mapError(failure))
  return { items: rows.map(legendItem) }
})
