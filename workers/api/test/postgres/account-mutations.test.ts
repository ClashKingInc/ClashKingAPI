import { AuthDeleteEndpoint, AuthExportEndpoint } from "@clashking/api-contracts"
import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { AuthIdentity } from "../../src/auth.js"
import { deleteAccount, dispatchAccountMutations, exportAccount } from "../../src/account-mutations.js"
import { Unauthenticated } from "../../src/errors.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Run through clashking_schemas/scripts/with-test-timescale.sh")
const database = PgClient.layer({ url: Redacted.make(databaseUrl), maxConnections: 5 })
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => Effect.runPromise(effect.pipe(Effect.provide(database), Effect.scoped))

describe("account export/deletion against authoritative Goose migrations", () => {
  it("exports only safe projections and deletes owned data atomically without touching another account", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, id = "936000000000000001", other = "936000000000000002"
    yield* sql`INSERT INTO auth_users (user_id,provider,email_hash,username,password_hash) VALUES
      (${id},'email','privacy-email-hash','Private User','private-password-hash'),(${other},'email','other-email-hash','Other User','other-password-hash')`
    yield* sql`INSERT INTO auth_email_verifications (email_hash,verification_code_hash,expires_at,username,password_hash,device_id) VALUES
      ('privacy-email-hash','private-code',now()+interval '1 hour','Private User','private-password-hash','private-device'),
      ('other-email-hash','other-code',now()+interval '1 hour','Other User','other-password-hash','other-device')`
    yield* sql`INSERT INTO auth_discord_tokens (user_id,device_id,access_token_ciphertext,refresh_token_ciphertext) VALUES
      (${id},'private-device','private-access-token','private-refresh-token')`
    yield* sql`INSERT INTO auth_refresh_tokens (token_hash,user_id,device_id,expires_at) VALUES ('private-session-token',${id},'private-device',now()+interval '1 hour')`
    yield* sql`INSERT INTO auth_password_reset_tokens (email_hash,reset_code_hash,user_id,expires_at) VALUES ('privacy-email-hash','private-reset-code',${id},now()+interval '1 hour')`
    yield* sql`INSERT INTO player_links (tag,user_id,source,is_verified) VALUES ('#QPV',${id},'clashking',true),('#QPU',${other},'clashking',true)`
    yield* sql`INSERT INTO user_bookmarks (user_id,entity_type,tag) VALUES (${id},'player','#QPU'),(${other},'player','#QPV')`
    yield* sql`INSERT INTO mobile_notification_deliveries (user_id,notification_key) VALUES (${id},'private-notification'),(${other},'other-notification')`
    yield* sql`INSERT INTO billing_customers (user_id,stripe_customer_id) VALUES (${id},'cus_private'),(${other},'cus_other')`
    yield* sql`INSERT INTO billing_subscriptions (user_id,provider_subscription_id,status,raw) VALUES (${id},'sub_private','active','{"secret":"private-provider-data"}')`
    yield* sql`INSERT INTO billing_webhook_events (provider,event_id,event_type,payload) VALUES
      ('stripe','evt_private','test','{"data":{"object":{"customer":"cus_private"}}}'),('stripe','evt_other','test','{"data":{"object":{"customer":"cus_other"}}}')`
    const exported = Schema.decodeUnknownSync(AuthExportEndpoint.response)(yield* exportAccount(id))
    expect(exported.account).toMatchObject({ user_id: id, provider: "email", auth_methods: ["email"], username: "Private User" })
    expect(exported.player_links).toHaveLength(1)
    expect(exported.discord_sessions).toHaveLength(1)
    expect(exported.billing_subscription).toHaveLength(1)
    for (const secret of ["privacy-email-hash", "private-password-hash", "private-access-token", "private-refresh-token", "private-session-token", "private-reset-code", "private-provider-data", "other-email-hash"]) expect(JSON.stringify(exported)).not.toContain(secret)
    const deleted = Schema.decodeUnknownSync(AuthDeleteEndpoint.response)(yield* deleteAccount(id))
    expect(deleted).toMatchObject({ ok: true, deleted: { auth_users: 1, player_links: 1, auth_email_verifications: 1, mobile_notification_deliveries: 1, billing_webhook_events: 1 } })
    expect(yield* sql`SELECT user_id FROM auth_users WHERE user_id IN (${id},${other})`).toEqual([{ user_id: other }])
    expect(yield* sql`SELECT email_hash FROM auth_email_verifications WHERE email_hash IN ('privacy-email-hash','other-email-hash')`).toEqual([{ email_hash: "other-email-hash" }])
    expect(yield* sql`SELECT event_id FROM billing_webhook_events WHERE event_id IN ('evt_private','evt_other')`).toEqual([{ event_id: "evt_other" }])
    expect(yield* sql`SELECT user_id FROM user_bookmarks WHERE user_id IN (${id},${other})`).toEqual([{ user_id: other }])
    expect(yield* exportAccount(id).pipe(Effect.flip)).toMatchObject({ _tag: "Unauthenticated" })
    expect(yield* deleteAccount(id).pipe(Effect.flip)).toMatchObject({ _tag: "Unauthenticated" })
  })))

  it("rolls back earlier deletion statements if a later statement fails", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, id = "937000000000000001"
    yield* sql`INSERT INTO auth_users (user_id,provider) VALUES (${id},'discord')`
    yield* sql`INSERT INTO user_bookmarks (user_id,entity_type,tag) VALUES (${id},'player','#QPT')`
    // A disposable fixture FK injects a failure at the final auth delete. It is
    // test data, not a schema migration or a production database connection.
    yield* sql`CREATE TABLE account_delete_test_guard (user_id text REFERENCES auth_users(user_id))`
    yield* sql`INSERT INTO account_delete_test_guard (user_id) VALUES (${id})`
    expect(yield* deleteAccount(id).pipe(Effect.flip)).toMatchObject({ _tag: "DatabaseFailure" })
    expect(yield* sql`SELECT tag FROM user_bookmarks WHERE user_id = ${id}`).toEqual([{ tag: "#QPT" }])
    expect(yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${id}`).toHaveLength(1)
    yield* sql`DROP TABLE account_delete_test_guard`
    yield* deleteAccount(id)
  })))

  it("keeps dispatch user-only and leaves unrelated routes unclaimed", () => run(Effect.gen(function* () {
    const denied = Layer.succeed(AuthIdentity, {
      requireUser: () => Effect.fail(new Unauthenticated({ message: "User token required" })),
      requireUserOrBot: () => Effect.succeed({ kind: "bot" as const }), requireBot: () => Effect.succeed({ kind: "bot" as const }),
    })
    for (const [method, path] of [["GET", "/v2/auth/export"], ["DELETE", "/v2/auth/me"]] as const) {
      expect(yield* dispatchAccountMutations(new Request(`https://api.clashk.ing${path}`, { method })).pipe(Effect.provide(denied), Effect.flip)).toMatchObject({ _tag: "Unauthenticated" })
    }
    expect(yield* dispatchAccountMutations(new Request("https://api.clashk.ing/v2/auth/me")).pipe(Effect.provide(denied))).toBeUndefined()
  })))
})
