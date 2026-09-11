import { AuthDeleteEndpoint, AuthExportEndpoint, type EndpointResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, Unauthenticated } from "./errors.js"

type JsonObject = EndpointResponse<typeof AuthExportEndpoint>["account"]

// Explicit projections keep credentials, email hashes, and notification tokens out
// of the export. These are SQL literals, never request-controlled identifiers.
const exportQueries = {
  player_links: "SELECT tag, source, order_index, is_verified, added_at, verified_at, updated_at FROM player_links WHERE user_id = $1 ORDER BY order_index, tag",
  bookmarks: "SELECT entity_type, tag, order_index, created_at FROM user_bookmarks WHERE user_id = $1 ORDER BY order_index, tag",
  recent_searches: "SELECT entity_type, tag, created_at FROM user_recent_searches WHERE user_id = $1 ORDER BY created_at DESC",
  legacy_search_settings: "SELECT search, updated_at FROM user_settings WHERE user_id = $1",
  discord_sessions: "SELECT device_id, expires_at, created_at, updated_at FROM auth_discord_tokens WHERE user_id = $1 ORDER BY updated_at DESC",
  notification_accounts: "SELECT player_tag, enabled, created_at, updated_at FROM mobile_notification_accounts WHERE user_id = $1 ORDER BY player_tag",
  notification_devices: "SELECT device_id, provider, platform, environment, app_version, locale, authorization_status, enabled, last_seen_at FROM mobile_push_devices WHERE user_id = $1",
  notification_preferences: "SELECT war_attacks_enabled, war_state_enabled, war_reminders_enabled, raid_reminders_enabled, events_enabled, announcements_enabled, monthly_support_enabled, legend_defenses_enabled, reminder_timings, raid_reminder_timings, updated_at FROM mobile_notification_preferences WHERE user_id = $1",
  saved_bases: "SELECT base_id::text, saved_at FROM user_saved_bases WHERE user_id = $1 ORDER BY saved_at DESC, base_id DESC",
  base_slots: "SELECT player_tag, slot_kind, slot_number, base_id::text, assigned_at FROM user_base_slots WHERE user_id = $1 ORDER BY player_tag, slot_kind, slot_number",
  billing_subscription: "SELECT provider, provider_subscription_id, provider_price_id, status, current_period_end, cancel_at_period_end, created_at, updated_at FROM billing_subscriptions WHERE user_id = $1",
  subscription_entitlements: "SELECT active, bookmark_notifications_limit, roster_assistant_monthly_credit_usd, updated_at FROM subscription_entitlements WHERE user_id = $1",
} as const

const deleteQueries = {
  user_base_slots: "DELETE FROM user_base_slots WHERE user_id = $1",
  user_saved_bases: "DELETE FROM user_saved_bases WHERE user_id = $1",
  mobile_notification_accounts: "DELETE FROM mobile_notification_accounts WHERE user_id = $1",
  mobile_push_devices: "DELETE FROM mobile_push_devices WHERE user_id = $1",
  mobile_notification_preferences: "DELETE FROM mobile_notification_preferences WHERE user_id = $1",
  billing_webhook_events: "DELETE FROM billing_webhook_events events USING billing_customers customers WHERE customers.user_id = $1 AND events.payload #>> '{data,object,customer}' = customers.stripe_customer_id",
  subscription_entitlements: "DELETE FROM subscription_entitlements WHERE user_id = $1",
  billing_subscriptions: "DELETE FROM billing_subscriptions WHERE user_id = $1",
  billing_customers: "DELETE FROM billing_customers WHERE user_id = $1",
  user_recent_searches: "DELETE FROM user_recent_searches WHERE user_id = $1",
  user_bookmarks: "DELETE FROM user_bookmarks WHERE user_id = $1",
  user_settings: "DELETE FROM user_settings WHERE user_id = $1",
  player_links: "DELETE FROM player_links WHERE user_id = $1",
  auth_discord_tokens: "DELETE FROM auth_discord_tokens WHERE user_id = $1",
  auth_refresh_tokens: "DELETE FROM auth_refresh_tokens WHERE user_id = $1",
  auth_password_reset_tokens: "DELETE FROM auth_password_reset_tokens WHERE user_id = $1",
  auth_users: "DELETE FROM auth_users WHERE user_id = $1",
} as const

const database = <A, E, R>(operation: Effect.Effect<A, E, R>) => operation.pipe(Effect.mapError((cause) =>
  cause instanceof Unauthenticated ? cause : new DatabaseFailure({ cause, message: "Account data operation failed" })))

/** One snapshot across every export section; no optional-table compatibility fallback. */
export const exportAccount = (userId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    yield* sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`
    const account = yield* sql<{ data: JsonObject }>`SELECT jsonb_strip_nulls(jsonb_build_object(
      'user_id', user_id, 'provider', provider, 'auth_methods', jsonb_build_array(provider),
      'username', username, 'created_at', created_at, 'updated_at', updated_at)) AS data
      FROM auth_users WHERE user_id = ${userId}`
    if (account[0] === undefined) return yield* new Unauthenticated({ message: "User session is no longer valid" })
    const section = (name: keyof typeof exportQueries) => sql.unsafe<{ data: JsonObject }>(
      `SELECT row_to_json(export_row) AS data FROM (${exportQueries[name]}) AS export_row`, [userId],
    ).pipe(Effect.map((rows) => rows.map((row) => row.data)))
    return {
      account: account[0].data,
      player_links: yield* section("player_links"), bookmarks: yield* section("bookmarks"),
      recent_searches: yield* section("recent_searches"), legacy_search_settings: yield* section("legacy_search_settings"),
      discord_sessions: yield* section("discord_sessions"), notification_accounts: yield* section("notification_accounts"),
      notification_devices: yield* section("notification_devices"), notification_preferences: yield* section("notification_preferences"),
      saved_bases: yield* section("saved_bases"), base_slots: yield* section("base_slots"),
      billing_subscription: yield* section("billing_subscription"),
      subscription_entitlements: yield* section("subscription_entitlements"),
    } satisfies EndpointResponse<typeof AuthExportEndpoint>
  })))
})

export const deleteAccount = (userId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    const rows = yield* sql<{ email_hash: string | null }>`SELECT email_hash FROM auth_users WHERE user_id = ${userId} FOR UPDATE`
    if (rows.length === 0) return yield* new Unauthenticated({ message: "User session is no longer valid" })
    const deleted: Record<string, number> = {}
    // Verification rows have no auth FK; they contain a password hash and must
    // be removed using the exact authenticated account hash, never caller input.
    const verification = yield* sql<{ count: number }>`WITH deleted AS (DELETE FROM auth_email_verifications
      WHERE email_hash = ${rows[0]!.email_hash} RETURNING 1) SELECT count(*)::integer AS count FROM deleted`
    deleted.auth_email_verifications = verification[0]?.count ?? 0
    for (const [name, query] of Object.entries(deleteQueries)) {
      const counts = yield* sql.unsafe<{ count: number }>(`WITH deleted AS (${query} RETURNING 1) SELECT count(*)::integer AS count FROM deleted`, [userId])
      deleted[name] = counts[0]?.count ?? 0
    }
    return { ok: true, message: "Account and linked personal data deleted or unlinked where present.", deleted } satisfies EndpointResponse<typeof AuthDeleteEndpoint>
  })))
})

export const accountMutationRuntimeRoutes = [
  { method: "GET", path: "/v2/auth/export" },
  { method: "DELETE", path: "/v2/auth/me" },
] as const

export const dispatchAccountMutations = (request: Request) => Effect.gen(function* () {
  const path = new URL(request.url).pathname
  const exporting = request.method === "GET" && path === AuthExportEndpoint.path
  const deleting = request.method === "DELETE" && path === AuthDeleteEndpoint.path
  if (!exporting && !deleting) return undefined
  const auth = yield* AuthIdentity
  const principal = yield* auth.requireUser(request)
  const encoded = exporting
    ? yield* Schema.encodeUnknownEffect(AuthExportEndpoint.response)(yield* exportAccount(principal.userId)).pipe(Effect.orDie)
    : yield* Schema.encodeUnknownEffect(AuthDeleteEndpoint.response)(yield* deleteAccount(principal.userId)).pipe(Effect.orDie)
  return Response.json(encoded, { headers: { "cache-control": "no-store" } })
})
