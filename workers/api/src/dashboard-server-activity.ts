import { BotServerDonationsLeaderboardEndpoint, BotServerLegendsLeaderboardEndpoint, BotServerWarLeaderboardEndpoint, DecimalSnowflake, type EndpointResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { WorkerEnvironment } from "./environment.js"
import { DatabaseFailure, InvalidRequest, NotFound, type ApiFailure } from "./errors.js"
import { trophySeason } from "./public-history.js"
import { forEachPlayerWar } from "./war-archive.js"
import { archiveAttackFacts } from "./war-archive-model.js"

// The separately requested CWL recipient mutation remains approval-blocked.
export const dashboardServerActivityOperationIds = ["botServerWarLeaderboard", "botServerDonationsLeaderboard", "botServerLegendsLeaderboard", "botServerClanGamesLeaderboard"] as const
const decode = <A>(schema: Schema.Codec<A, unknown, never, never>, raw: unknown) => Schema.decodeUnknownEffect(schema)(raw).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid server activity request" })))
const database = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Server activity database operation failed" })))
const limitOf = (value: number | undefined) => Math.max(1, Math.min(value === undefined || !Number.isSafeInteger(value) ? 100 : value, 500))
const monthEnd = (year: number, month: number) => {
  const date = new Date(0)
  date.setUTCFullYear(year, month, 0)
  date.setUTCHours(5, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  return date
}
/** Mirrors clashy.GetSeasonByID, including the 2025 transition and non-padded input. */
export const serverActivitySeason = (raw: string | undefined, now = new Date()) => {
  const season = raw === undefined || raw === "" ? trophySeason(now).season : raw
  const match = /^([+]?\d+)-([+]?\d+)$/u.exec(season)
  const year = Number(match?.[1]), month = Number(match?.[2])
  if (!match || !Number.isSafeInteger(year) || month < 1 || month > 12 || year > 9999) return Effect.fail(new InvalidRequest({ message: "invalid season" }))
  if (season === "2025-09") return Effect.succeed({ season, start: new Date("2025-08-25T05:00:00Z"), end: new Date("2025-10-06T05:00:00Z") })
  const count = year * 12 + month - 1 - (2025 * 12 + 9)
  if (count >= 0) {
    const start = new Date(Date.parse("2025-10-06T05:00:00Z") + count * 28 * 86_400_000)
    return Effect.succeed({ season, start, end: new Date(start.getTime() + 28 * 86_400_000) })
  }
  return Effect.succeed({ season, start: monthEnd(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1), end: monthEnd(year, month) })
}
interface Player { readonly tag: string; readonly name: string; readonly clan_tag: string | null; readonly townhall_level: number; readonly trophies: number; readonly league_id: number | null }
const population = (serverId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const clans = yield* database(sql<{ tag: string; name: string }>`SELECT sc.tag, clan.name FROM server_clans sc JOIN basic_clan clan ON clan.tag = sc.tag WHERE sc.server_id = ${serverId} ORDER BY clan.name, sc.tag`)
  const tags = clans.map((clan) => clan.tag)
  const players = tags.length === 0 ? [] : yield* database(sql<Player>`SELECT tag, clan_tag, name, townhall_level, trophies, league_id FROM basic_player WHERE clan_tag = ANY(${tags}::text[])`)
  return { players, names: new Map(clans.map((clan) => [clan.tag, clan.name])) }
})
const identity = (player: Player, names: Map<string, string>) => ({ player_tag: player.tag, player_name: player.name || "Unknown", townhall_level: player.townhall_level,
  clan_tag: player.clan_tag ?? "", clan_name: names.get(player.clan_tag ?? "") ?? "" })
const round = (value: number) => Math.round(value * 100) / 100
const warLeaderboard = (serverId: string, limit: number, operation: DashboardServerOperationInput) => Effect.gen(function* () {
  const { players, names } = yield* population(serverId)
  const wanted = new Set(players.map((player) => player.tag))
  const totals = new Map<string, { attacks: number; stars: number; destruction: number; triples: number }>()
  // Complete keyset scan retains one war at a time, not the lifetime archive.
  yield* forEachPlayerWar([...wanted], new Date(0), new Date(), (id, war) => Effect.sync(() => {
    if (war.type === "friendly") return
    for (const attack of archiveAttackFacts(id, war)) {
      if (!wanted.has(attack.attackerTag)) continue
      const total = totals.get(attack.attackerTag) ?? { attacks: 0, stars: 0, destruction: 0, triples: 0 }
      total.attacks++; total.stars += attack.stars; total.destruction += Math.trunc(attack.destructionPercentage)
      if (attack.stars === 3) total.triples++
      totals.set(attack.attackerTag, total)
    }
  })).pipe(Effect.provideService(WorkerEnvironment, operation.bindings))
  const info = new Map(players.map((player) => [player.tag, player]))
  const items: EndpointResponse<typeof BotServerWarLeaderboardEndpoint>["items"][number][] = [...totals]
    .sort((a, b) => b[1].stars - a[1].stars || b[1].attacks - a[1].attacks).slice(0, limit)
    .map(([tag, total], index) => ({ ...identity(info.get(tag)!, names), rank: index + 1, total_attacks: total.attacks, total_stars: total.stars,
      average_stars: round(total.stars / total.attacks), average_destruction: round(total.destruction / total.attacks),
      destruction_percentage: round(total.destruction / total.attacks), three_star_attacks: total.triples, three_star_rate: round(total.triples * 100 / total.attacks) }))
  return { server_id: serverId, items, total: items.length }
})
const seasonLeaderboard = (serverId: string, season: string | undefined, limit: number, kind: "donations" | "clan_games") => Effect.gen(function* () {
  const window = yield* serverActivitySeason(season)
  const { players, names } = yield* population(serverId)
  const sql = yield* SqlClient.SqlClient
  const tags = players.map((player) => player.tag), info = new Map(players.map((player) => [player.tag, player]))
  // Only statistic counts, never Discord IDs, are converted from PG bigint strings.
  if (kind === "donations") {
    const rows = yield* database(sql<{ player_tag: string; donated: string | number; received: string | number }>`SELECT player_tag,
      COALESCE(sum(delta) FILTER (WHERE stat_type = 'donated'), 0)::bigint AS donated,
      COALESCE(sum(delta) FILTER (WHERE stat_type = 'received'), 0)::bigint AS received
      FROM player_stat_changes WHERE player_tag = ANY(${tags}::text[]) AND stat_type IN ('donated','received')
      AND event_time >= ${window.start} AND event_time < ${window.end}
      GROUP BY player_tag ORDER BY donated DESC, received DESC, player_tag LIMIT ${limit}`)
    const items = rows.map((row, index) => ({ ...identity(info.get(row.player_tag)!, names), rank: index + 1, donated: Number(row.donated), received: Number(row.received), score: Number(row.donated) }))
    return { server_id: serverId, season: window.season, type: kind, items, total: items.length }
  }
  const rows = yield* database(sql<{ player_tag: string; clan_games: string | number }>`SELECT player_tag, sum(delta)::bigint AS clan_games FROM player_stat_changes
    WHERE player_tag = ANY(${tags}::text[]) AND stat_type = 'clan_games' AND event_time >= ${window.start} AND event_time < ${window.end}
    GROUP BY player_tag ORDER BY clan_games DESC, player_tag LIMIT ${limit}`)
  const items = rows.map((row, index) => ({ ...identity(info.get(row.player_tag)!, names), rank: index + 1, clan_games: Number(row.clan_games), score: Number(row.clan_games) }))
  return { server_id: serverId, season: window.season, type: kind, items, total: items.length }
})
export const executeDashboardServerActivity = (operation: DashboardServerOperationInput): Effect.Effect<unknown, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  const serverId = yield* decode(DecimalSnowflake, operation.path.serverId)
  if (operation.endpoint.operationId === "botServerWarLeaderboard") {
    const query = yield* decode(BotServerWarLeaderboardEndpoint.query, operation.query)
    return yield* warLeaderboard(serverId, limitOf(query.limit), operation)
  }
  if (operation.endpoint.operationId === "botServerDonationsLeaderboard" || operation.endpoint.operationId === "botServerClanGamesLeaderboard") {
    const query = yield* decode(BotServerDonationsLeaderboardEndpoint.query, operation.query)
    return yield* seasonLeaderboard(serverId, query.season, limitOf(query.limit), operation.endpoint.operationId === "botServerDonationsLeaderboard" ? "donations" : "clan_games")
  }
  if (operation.endpoint.operationId === "botServerLegendsLeaderboard") {
    const query = yield* decode(BotServerLegendsLeaderboardEndpoint.query, operation.query)
    const { players, names } = yield* population(serverId)
    const items = players.filter((player) => player.league_id === 29000022).sort((a, b) => b.trophies - a.trophies)
      .slice(0, limitOf(query.limit)).map((player) => ({ ...identity(player, names), trophies: player.trophies }))
    return { server_id: serverId, items, total: items.length }
  }
  return yield* new NotFound({ message: "Server activity operation not found" })
})
