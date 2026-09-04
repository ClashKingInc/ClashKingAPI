import { AchievementsCheckEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import type { WorkerBindings } from "./environment.js"
import { DatabaseFailure, UpstreamUnavailable } from "./errors.js"
import { readBoundedJson } from "./request-body.js"

const PlayerAchievementFacts = Schema.Struct({
  tag: Schema.String,
  townHallLevel: Schema.Number,
  warStars: Schema.optionalKey(Schema.Number),
})
const definitions = [
  { id: "townhall_18", asset: "town-hall-18-achievement-badge.glb" },
  { id: "war_warrior", asset: "war-champion-achievement-badge.glb" },
  { id: "mr_legend", asset: "perfect-legends-day-achievement-badge.glb" },
  { id: "defense_doesnt_matter", asset: "bad-legends-achievement-badge.glb" },
] as const

const playerFacts = (bindings: WorkerBindings, tag: string) => Effect.gen(function* () {
  const response = yield* Effect.tryPromise({
    try: (signal) => bindings.CLASH_PROXY.fetch(new Request(`https://clash-proxy.internal/v1/players/${encodeURIComponent(tag)}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    })),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Achievement player lookup failed" }),
  })
  if (!response.ok) {
    yield* Effect.tryPromise({ try: () => response.body?.cancel() ?? Promise.resolve(), catch: (cause) => new UpstreamUnavailable({ cause, message: "Achievement response cancellation failed" }) })
    return yield* new UpstreamUnavailable({ cause: response.status, message: "Achievement player lookup failed" })
  }
  const value = yield* readBoundedJson(response).pipe(Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Achievement player JSON is invalid or too large" })))
  const player = yield* Schema.decodeUnknownEffect(PlayerAchievementFacts)(value).pipe(
    Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Achievement player response failed validation" })),
  )
  if (player.tag !== tag) return yield* new UpstreamUnavailable({ cause: player.tag, message: "Achievement player response does not match the requested tag" })
  return player
})

interface LinkedPlayer {
  readonly tag: string
  readonly order_index: number
  readonly added_at: string
}

/** Awards stay attached to verified players and are lifetime-idempotent. Legend
 * badges remain in the catalog, but the Go route has no evaluators for them. */
export const checkMobileAchievements = (
  userId: string,
  bindings: WorkerBindings,
): Effect.Effect<typeof AchievementsCheckEndpoint.response.Type, DatabaseFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  let cursor: LinkedPlayer | undefined
  while (true) {
    const links: readonly LinkedPlayer[] = yield* sql<LinkedPlayer>`
      SELECT tag, order_index, added_at::text AS added_at FROM player_links
      WHERE user_id = ${userId} AND is_verified = true
        AND (${cursor?.tag ?? null}::text IS NULL OR (order_index, added_at, tag) >
          (${cursor?.order_index ?? 0}, ${cursor?.added_at ?? null}::timestamptz, ${cursor?.tag ?? null}::text))
      ORDER BY order_index, added_at, tag LIMIT 128
    `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to load verified achievement players" })))
    yield* Effect.forEach(links, (link) => Effect.gen(function* () {
      // A failed Clash lookup is skipped exactly as in Go; SQL failures are not.
      const player = yield* playerFacts(bindings, link.tag).pipe(Effect.catchTag("UpstreamUnavailable", () => Effect.succeed(undefined)))
      if (player === undefined) return
      const earned: string[] = []
      if (player.townHallLevel >= 18) earned.push("townhall_18")
      if ((player.warStars ?? 0) >= 5000) earned.push("war_warrior")
      for (const id of earned) {
        // Lock and recheck after the network call so a revoked/transferred link
        // cannot be awarded from the earlier page's ownership snapshot.
        yield* sql`
          WITH owned AS (
            SELECT tag FROM player_links
            WHERE tag = ${link.tag} AND user_id = ${userId} AND is_verified = true FOR UPDATE
          ) INSERT INTO achievement_player_awards (achievement_id, player_tag, occurrence_key)
            SELECT ${id}, tag, 'lifetime' FROM owned ON CONFLICT DO NOTHING
        `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to award player achievement" })))
      }
    }), { concurrency: 4, discard: true })
    if (links.length < 128) break
    cursor = links[links.length - 1]
  }
  const counts = yield* sql<{ readonly achievement_id: string; readonly count: string }>`
    SELECT awards.achievement_id, count(*)::text AS count FROM achievement_player_awards awards
    JOIN player_links links ON links.tag = awards.player_tag
    WHERE links.user_id = ${userId} AND links.is_verified = true GROUP BY awards.achievement_id
  `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Unable to count verified player achievements" })))
  const byId = new Map(counts.map((row) => [row.achievement_id, Number(row.count)]))
  return { items: definitions.map(({ id, asset }) => ({ id, asset_url: `https://assets.clashk.ing/achievements/${asset}`, repeatable: true, earned_count: byId.get(id) ?? 0 })) }
})
