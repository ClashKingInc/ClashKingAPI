import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { ApiPrincipal } from "./auth.js"
import type { WorkerBindings } from "./environment.js"
import { UpstreamUnavailable, type ApiFailure } from "./errors.js"

export const DiscordAccessClaims = Schema.Struct({ manager: Schema.Boolean,
  roles: Schema.Array(Schema.String.check(Schema.isPattern(/^\d+$/u))).check(Schema.isMaxLength(250)) })
export type DiscordAccessClaims = typeof DiscordAccessClaims.Type
export const discordScopeHash = (parts: ReadonlyArray<string>) => Effect.promise(async () => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parts)))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")
})
const scopeKey = (bindings: WorkerBindings, principal: ApiPrincipal, serverId: string) => discordScopeHash([
  "dashboard-access:v1", bindings.DISCORD_API_ORIGIN, bindings.DISCORD_CLIENT_ID, bindings.DISCORD_BOT_TOKEN,
  principal.kind === "user" ? principal.userId : "bot", principal.kind === "user" ? principal.deviceId ?? "" : "", serverId,
])

/** Seed all discovered claims in one query. Dashboard grants deliberately stay
 * in SQL, so revoking a delegated grant takes effect even during the 60s cache. */
export const seedDiscordAccess = (bindings: WorkerBindings, principal: ApiPrincipal,
  values: ReadonlyArray<{ readonly serverId: string; readonly claims: DiscordAccessClaims }>, observedAt = new Date()) => Effect.gen(function* () {
  if (values.length === 0) return
  const sql = yield* SqlClient.SqlClient
  const rows = yield* Effect.forEach(values, (value) => scopeKey(bindings, principal, value.serverId).pipe(
    Effect.map((key) => ({ key, claims: value.claims }))))
  yield* sql`WITH expired AS (DELETE FROM discord_cache.dashboard_access WHERE cache_key IN (
      SELECT cache_key FROM discord_cache.dashboard_access WHERE coalesce(expires_at, lease_until) < clock_timestamp() - interval '1 day'
        AND (lease_until IS NULL OR lease_until < clock_timestamp())
        AND cache_key <> ALL(${rows.map((row) => row.key)}::text[]) LIMIT 256
    )) INSERT INTO discord_cache.dashboard_access (cache_key, claims, observed_at, expires_at)
    SELECT item.key, item.claims, ${observedAt}::timestamptz, ${observedAt}::timestamptz + interval '60 seconds'
    FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS item(key text, claims jsonb)
    ON CONFLICT (cache_key) DO UPDATE SET claims = EXCLUDED.claims, observed_at = EXCLUDED.observed_at,
      expires_at = EXCLUDED.expires_at, lease_token = NULL, lease_until = NULL
    WHERE dashboard_access.observed_at <= EXCLUDED.observed_at`
}).pipe(Effect.catch(() => Effect.void))

/** No stale fallback: a successful read is reusable for at most 60 seconds.
 * Expiring SQL leases coalesce requests across isolates without holding sockets
 * or database transactions open while Discord responds. */
export const cachedDiscordAccess = <R>(bindings: WorkerBindings, principal: ApiPrincipal, serverId: string,
  live: Effect.Effect<DiscordAccessClaims, ApiFailure, R>, forceLive: boolean) => Effect.gen(function* () {
  const startedAt = new Date()
  if (forceLive) {
    const claims = yield* live
    yield* seedDiscordAccess(bindings, principal, [{ serverId, claims }], startedAt)
    return claims
  }
  const sql = yield* SqlClient.SqlClient
  const key = yield* scopeKey(bindings, principal, serverId)
  const lease = crypto.randomUUID()
  const deadline = Date.now() + 35_000
  while (true) {
    const result = yield* sql<{ claims: unknown }>`SELECT claims FROM discord_cache.dashboard_access
      WHERE cache_key = ${key} AND observed_at <= clock_timestamp() AND expires_at > clock_timestamp()
      AND expires_at <= observed_at + interval '60 seconds'`.pipe(Effect.result)
    if (result._tag === "Failure") return yield* live
    if (result.success[0] !== undefined) {
      const decoded = Schema.decodeUnknownOption(DiscordAccessClaims)(result.success[0].claims)
      if (decoded._tag === "Some") return decoded.value
      // Corrupt claims cannot confer access or prevent a fresh lookup.
      yield* sql`UPDATE discord_cache.dashboard_access SET claims = NULL, expires_at = NULL WHERE cache_key = ${key}`
        .pipe(Effect.catch(() => Effect.void))
    }
    const acquired = yield* sql<{ cache_key: string }>`INSERT INTO discord_cache.dashboard_access
      (cache_key, observed_at, expires_at, lease_token, lease_until)
      VALUES (${key}, ${startedAt}::timestamptz, NULL, ${lease}::uuid, clock_timestamp() + interval '45 seconds')
      ON CONFLICT (cache_key) DO UPDATE SET lease_token = EXCLUDED.lease_token, lease_until = EXCLUDED.lease_until
      WHERE (dashboard_access.lease_until IS NULL OR dashboard_access.lease_until <= clock_timestamp())
        AND (dashboard_access.expires_at IS NULL OR dashboard_access.expires_at <= clock_timestamp())
      RETURNING cache_key`.pipe(Effect.result)
    if (acquired._tag === "Failure") return yield* live
    if (acquired.success.length > 0) {
      return yield* Effect.gen(function* () {
        const claims = yield* live
        yield* sql`UPDATE discord_cache.dashboard_access SET claims = ${JSON.stringify(claims)}::jsonb,
          observed_at = ${startedAt}::timestamptz, expires_at = ${startedAt}::timestamptz + interval '60 seconds',
          lease_token = NULL, lease_until = NULL
          WHERE cache_key = ${key} AND lease_token = ${lease}::uuid`
          .pipe(Effect.catch(() => Effect.void))
        return claims
      }).pipe(Effect.ensuring(sql`UPDATE discord_cache.dashboard_access SET lease_token = NULL, lease_until = NULL
        WHERE cache_key = ${key} AND lease_token = ${lease}::uuid`.pipe(Effect.catch(() => Effect.void))))
    }
    if (Date.now() >= deadline) return yield* new UpstreamUnavailable({ cause: "Discord access lookup is busy", message: "Discord authorization is temporarily busy" })
    yield* Effect.sleep("100 millis")
  }
})
