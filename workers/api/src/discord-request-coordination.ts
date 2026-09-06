import { Effect } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { discordScopeHash } from "./discord-access-cache.js"
import { RateLimited, UpstreamUnavailable } from "./errors.js"

/** Discord major resource IDs remain in the route key; minor IDs share a bucket.
 * Credentials and provider origins are hashed, never persisted as plain text. */
export const discordRateRoute = (request: Request): string => {
  const url = new URL(request.url)
  const segments = url.pathname.replace(/^\/api\/v\d+/u, "").split("/")
  return `${request.method} ${segments.map((part, i) => /^\d+$/u.test(part) &&
    !(i === 2 && ["guilds", "channels", "webhooks"].includes(segments[1] ?? "")) ? ":id" : part).join("/")}`
}

export const makeDiscordRequestCoordination = (sql: SqlClient.SqlClient | undefined) => (request: Request) => {
  const budgetEnd = Date.now() + 15_000
  const scope = [new URL(request.url).origin, request.headers.get("authorization") ?? ""]
  const globalKey = discordScopeHash(["discord-rate:v1", ...scope, "global"])
  const routeKey = discordScopeHash(["discord-rate:v1", ...scope, discordRateRoute(request)])
  const guard = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(Effect.timeout("500 millis"),
    Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Discord request coordination unavailable" })))
  const wait = (milliseconds: number) => Effect.gen(function* () {
    const delay = Math.max(0, Math.ceil(milliseconds))
    if (Date.now() + delay >= budgetEnd) return yield* new RateLimited({ message: "Discord API is rate limited", retryAfterSeconds: Math.max(1, Math.ceil(delay / 1_000)) })
    if (delay > 0) yield* Effect.sleep(delay)
  })
  const reserve = (key: string, spacing: number) => Effect.gen(function* () {
    if (sql === undefined) return
    const rows = yield* guard(sql<{ delay: number }>`
      WITH expired AS (DELETE FROM discord_cache.request_limits WHERE cache_key IN (
        SELECT cache_key FROM discord_cache.request_limits WHERE next_at < clock_timestamp() - interval '1 day'
          AND blocked_until < clock_timestamp() - interval '1 day' AND cache_key <> ${key} LIMIT 32
      )) INSERT INTO discord_cache.request_limits (cache_key, next_at)
      VALUES (${key}, clock_timestamp() + ${spacing} * interval '1 millisecond')
      ON CONFLICT (cache_key) DO UPDATE SET next_at =
        greatest(clock_timestamp(), request_limits.next_at, request_limits.blocked_until) + ${spacing} * interval '1 millisecond'
      RETURNING greatest(0, extract(epoch FROM (next_at - ${spacing} * interval '1 millisecond' - clock_timestamp())) * 1000)::float8 AS delay
    `)
    yield* wait(rows[0]?.delay ?? 0)
  })
  return {
    before: Effect.gen(function* () {
      if (sql === undefined) return
      const route = yield* routeKey, global = yield* globalKey
      // Match the old extra OAuth pacing; bot routes retain useful concurrency.
      yield* reserve(route, request.headers.get("authorization")?.startsWith("Bearer ") ? 500 : 50)
      yield* reserve(global, 25)
      // A concurrent response can extend a cooldown after our reservation.
      while (true) {
        const rows = yield* guard(sql<{ delay: number }>`SELECT greatest(0,
          extract(epoch FROM (max(blocked_until) - clock_timestamp())) * 1000)::float8 AS delay
          FROM discord_cache.request_limits WHERE cache_key = ANY(${[route, global]}::text[])`)
        const delay = rows[0]?.delay ?? 0
        if (delay <= 0) return
        yield* wait(delay)
      }
    }),
    cooldown: (milliseconds: number, global: boolean) => Effect.gen(function* () {
      if (sql === undefined || !Number.isFinite(milliseconds) || milliseconds <= 0) return
      const key = yield* global ? globalKey : routeKey
      // Discord delays are bounded to24h to keep corrupt provider headers from
      // permanently poisoning a scope. A later call still receives Retry-After.
      const delay = Math.min(milliseconds, 86_400_000)
      yield* guard(sql`INSERT INTO discord_cache.request_limits (cache_key, blocked_until)
        VALUES (${key}, clock_timestamp() + ${delay} * interval '1 millisecond')
        ON CONFLICT (cache_key) DO UPDATE SET blocked_until = greatest(request_limits.blocked_until, EXCLUDED.blocked_until)`)
    }),
  }
}
