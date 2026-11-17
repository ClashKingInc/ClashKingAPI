import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DatabaseFailure, Forbidden, UpstreamUnavailable } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { ProxyClanResponse } from "../../../packages/api-contracts/src/proxy.js"
import { readBoundedJson } from "./request-body.js"
import { publicTag } from "./public-war.js"
import { isoTimestamp } from "./public-player.js"

export const queryClanMemberActivity = (rawTag: string, userId: string, bindings: WorkerBindings) => Effect.gen(function* () {
  const clanTag = yield* publicTag(rawTag)
  const sql = yield* SqlClient.SqlClient
  const dbError = (cause: unknown) => new DatabaseFailure({ cause, message: "Clan activity query failed" })
  const links = yield* sql<{ tag: string }>`SELECT tag FROM player_links WHERE user_id = ${userId} AND is_verified`.pipe(Effect.mapError(dbError))
  if (!links.length) return yield* new Forbidden({ message: "A verified account in this clan is required", reason: "linked_account" })
  const { tags } = yield* currentRoster(clanTag, bindings)
  if (!links.some(link => tags.includes(link.tag))) return yield* new Forbidden({ message: "A verified account in this clan is required", reason: "not_member" })
  const observedAt = new Date()
  const rows = yield* sql<{ tag: string; seen_at: Date | string | null; joined_at: Date | string | null }>`
    SELECT member.tag, observed.seen_at,
      CASE WHEN membership.type = 'join' THEN membership.time ELSE NULL END AS joined_at
    FROM unnest(${tags}::text[]) AS member(tag)
    LEFT JOIN LATERAL (
      SELECT seen_at FROM player_online_events
      WHERE tag = member.tag AND clan_tag = ${clanTag} AND seen_at <= ${observedAt}
      ORDER BY seen_at DESC LIMIT 1
    ) observed ON true
    LEFT JOIN LATERAL (
      SELECT time, type FROM join_leave_history
      WHERE player_tag = member.tag AND clan_tag = ${clanTag} AND time <= ${observedAt}
      ORDER BY time DESC, CASE WHEN type = 'leave' THEN 0 ELSE 1 END LIMIT 1
    ) membership ON true`.pipe(Effect.mapError(dbError))
  return { clanTag, observedAt: observedAt.toISOString(), items: rows.map(row => ({ tag: row.tag, lastObservedAt: row.seen_at ? isoTimestamp(row.seen_at) : null, joinedAt: row.joined_at ? isoTimestamp(row.joined_at) : null })) }
})


// Public join history never selects online observations. Keep the private
// activity query behind verified current membership, independently of joins.
const currentRoster = (clanTag: string, bindings: WorkerBindings) => Effect.gen(function* () {
  const response = yield* Effect.tryPromise({
    try: signal => bindings.CLASH_PROXY.fetch(new Request(`http://clash-proxy.internal/v1/clans/${encodeURIComponent(clanTag)}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), headers: { "cache-control": "no-cache" } })),
    catch: cause => new UpstreamUnavailable({ cause, message: "Current clan membership is unavailable" }),
  })
  if (!response.ok) {
    yield* Effect.promise(() => response.body?.cancel().catch(() => undefined) ?? Promise.resolve())
    return yield* new UpstreamUnavailable({ cause: response.status, message: "Current clan membership is unavailable" })
  }
  const roster = yield* readBoundedJson(response, 2 * 1024 * 1024).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ tag: ProxyClanResponse.fields.tag, memberList: ProxyClanResponse.fields.memberList }))),
    Effect.mapError(cause => new UpstreamUnavailable({ cause, message: "Current clan membership is unavailable" })),
  )
  // Never authorize from the app's bookmarks or a stale basic_player clan tag.
  // A missing roster is not evidence of membership and must fail closed.
  if (roster.tag !== clanTag || !roster.memberList) return yield* new UpstreamUnavailable({ cause: "incomplete_roster", message: "Current clan membership is unavailable" })
  const tags = roster.memberList.map(member => member.tag)
  return { clanTag, tags }

})

export const queryClanMemberJoins = (rawTag: string, bindings: WorkerBindings) => Effect.gen(function* () {
  const clanTag = yield* publicTag(rawTag)
  const { tags } = yield* currentRoster(clanTag, bindings)
  const sql = yield* SqlClient.SqlClient
  const observedAt = new Date()
  const rows = yield* sql<{ tag: string; joined_at: Date | string | null }>`
    SELECT member.tag,
      CASE WHEN membership.type = 'join' THEN membership.time ELSE NULL END AS joined_at
    FROM unnest(${tags}::text[]) AS member(tag)
    LEFT JOIN LATERAL (
      SELECT time, type FROM join_leave_history
      WHERE player_tag = member.tag AND clan_tag = ${clanTag} AND time <= ${observedAt}
      ORDER BY time DESC, CASE WHEN type = 'leave' THEN 0 ELSE 1 END LIMIT 1
    ) membership ON true`.pipe(Effect.mapError(cause => new DatabaseFailure({ cause, message: "Clan join history query failed" })))
  return { clanTag, observedAt: observedAt.toISOString(), items: rows.map(row => ({ tag: row.tag, joinedAt: row.joined_at ? isoTimestamp(row.joined_at) : null })) }
})
