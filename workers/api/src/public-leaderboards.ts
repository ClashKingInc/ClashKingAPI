import { PlayerLeaderboardResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { InvalidRequest, DatabaseFailure, UpstreamUnavailable } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { badgeUrls } from "./war-archive-model.js"

const Snapshot = Schema.Struct({
  generated_at: Schema.String,
  items: Schema.Array(Schema.Struct({
    rank: Schema.Number, tag: Schema.String, name: Schema.String, townhall_level: Schema.Number, trophies: Schema.Number,
    league: Schema.Struct({ id: Schema.Number, name: Schema.String, badge: Schema.String }),
    clan: Schema.NullOr(Schema.Struct({ tag: Schema.String, name: Schema.NullOr(Schema.String), badge: Schema.String })),
  })),
})
const snapshotFailure = (cause: unknown) => new UpstreamUnavailable({ cause, message: "Player leaderboard is unavailable" })
export const leaderboardLimit = (query: URLSearchParams) => {
  const raw = Number(query.get("limit") ?? 500)
  return Math.max(1, Math.min(500, Number.isInteger(raw) ? raw : 500))
}
export const decodeLeaderboardSnapshot = (value: unknown, family: "townhall" | "league", id: number, limit: number) => Effect.gen(function* () {
  const snapshot = yield* Schema.decodeUnknownEffect(Snapshot)(value).pipe(Effect.mapError(snapshotFailure))
  const items = snapshot.items.slice(0, limit).map(({ clan, ...player }) => ({ ...player,
    ...(clan ? { clan: { tag: clan.tag, badge: clan.badge, ...(clan.name === null ? {} : { name: clan.name }) } } : {}),
  }))
  return yield* Schema.decodeUnknownEffect(PlayerLeaderboardResponse)({
    ...snapshot, items, count: items.length, ...(family === "townhall" ? { townhall_level: id } : { league_tier_id: id }),
  }).pipe(Effect.mapError(snapshotFailure))
})

export const queryPlayerLeaderboard = (bindings: Pick<WorkerBindings, "TRACKING" | "API_BOT_TOKEN">, family: "townhall" | "league", rawId: string, query: URLSearchParams) => Effect.gen(function* () {
  const id = Number(rawId)
  if (!/^\d+$/u.test(rawId) || !Number.isSafeInteger(id) || id < 1) return yield* new InvalidRequest({ message: "Invalid leaderboard identifier" })
  const value = yield* Effect.tryPromise({ try: async (signal) => {
    const response = await bindings.TRACKING.fetch(`http://tracking/internal/leaderboards/${family}/${id}`, {
      headers: { authorization: `Bearer ${bindings.API_BOT_TOKEN}` }, signal, redirect: "error",
    })
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error(`Snapshot reader returned ${response.status}`) }
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 4 * 1024 * 1024) throw new Error("Snapshot exceeds supported size")
        chunks.push(chunk.value)
      }
    } finally { await reader.cancel(); reader.releaseLock() }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  }, catch: snapshotFailure })
  return yield* decodeLeaderboardSnapshot(value, family, id, leaderboardLimit(query))
})

interface ClanLeaderboardRow {
  tag: string; name: string; location_id: number | null; badge_token: string; value: string; war_win_streak: number; rank: string | null;
}
export const queryClanLeaderboard = (kind: "donations" | "war_wins" | "win_streak", rawLocation: string, query: URLSearchParams) => Effect.gen(function* () {
  const location = Number(rawLocation)
  if (kind !== "win_streak" && (!/^-?\d+$/u.test(rawLocation) || !Number.isSafeInteger(location))) return yield* new InvalidRequest({ message: "Invalid location identifier" })
  const sql = yield* SqlClient.SqlClient
  const rank = kind === "win_streak" ? sql`l.war_win_streak_rank` : kind === "war_wins" ? sql`l.location_war_wins_rank` : sql`l.location_donated_rank`
  const value = kind === "donations" ? sql`c.troops_donated` : sql`c.war_wins`
  const rows = yield* sql<ClanLeaderboardRow>`SELECT c.tag, c.name, c.location_id, c.badge_token, ${value}::text AS value,
    c.war_win_streak, ${rank}::text AS rank FROM clan_leaderboards l JOIN basic_clan c ON c.tag = l.tag
    WHERE ${kind === "win_streak" ? sql`l.war_win_streak_rank IS NOT NULL` : sql`c.location_id = ${location}`}
    ORDER BY ${rank} LIMIT ${leaderboardLimit(query)}`.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Clan leaderboard query failed" })))
  const items = rows.map((row) => {
    const badge = badgeUrls(row.badge_token)
    return { tag: row.tag, name: row.name, badge_url: badge.large, badgeUrls: badge,
      ...(row.location_id === null ? {} : { location_id: row.location_id }),
      ...(kind === "win_streak" ? {} : { [kind]: Number(row.value) }), war_win_streak: row.war_win_streak,
      ...(row.rank === null ? {} : { rank: Number(row.rank) }),
    }
  })
  return { items, count: items.length, ...(kind === "win_streak" ? {} : { location_id: location, kind }) }
})
