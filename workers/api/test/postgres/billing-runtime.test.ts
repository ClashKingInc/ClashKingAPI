import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import Stripe from "stripe"
import { dispatchBillingMutations, ensureBillingCustomer, makeBillingGateway, projectBillingEvent, type BillingGateway } from "../../src/billing-runtime.js"
import { AuthIdentity } from "../../src/auth.js"
import { ServerAuthorization } from "../../src/server-authorization.js"
import { lockRosterAIBudget } from "../../src/dashboard-roster-ai-accounting.js"
import { dispatchDashboardRosterAIUsage } from "../../src/dashboard-roster-ai-usage.js"
import { Forbidden, InvalidRequest, Unauthenticated, UpstreamUnavailable } from "../../src/errors.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
beforeEach(() => vi.stubGlobal("fetch", () => { throw new Error("Real provider calls forbidden") }))
afterEach(() => vi.unstubAllGlobals())
const serverA = "6934567890123456701", serverB = "6934567890123456702"
const bindings = { STRIPE_RESTRICTED_KEY: "unused-fake-adapter", STRIPE_WEBHOOK_SECRET: "unused-fake-adapter", STRIPE_MONTHLY_PRICE_ID: "price_support",
  STRIPE_CHECKOUT_SUCCESS_URL: "https://dashboard.example.test/success", STRIPE_CHECKOUT_CANCEL_URL: "https://dashboard.example.test/cancel",
  STRIPE_PORTAL_RETURN_URL: "https://dashboard.example.test/account" }
function fixture(userId: string, overrides: Partial<BillingGateway> = {}, connectionUrl = databaseUrl!) {
  const gateway: BillingGateway = {
    live: false, verify: () => Effect.fail(new InvalidRequest({ message: "No fake signature supplied" })),
    createCustomer: (user, operation) => Effect.succeed({ id: `cus_${user}`, livemode: false, metadata: { clashking_user_id: user, clashking_operation_id: operation } }),
    recoverCustomer: () => Effect.fail(new UpstreamUnavailable({ cause: "fixture", message: "Unresolved" })),
    subscriptions: () => Effect.succeed([]), checkout: () => Effect.succeed("https://checkout.stripe.com/c/pay/test"),
    portal: () => Effect.succeed("https://billing.stripe.com/session/test"), ...overrides,
  }
  const layer = Layer.mergeAll(PgClient.layer({ url: Redacted.make(connectionUrl) }), Layer.succeed(AuthIdentity, {
    requireUser: (request) => request.headers.get("authorization") === "Bearer user-fixture"
      ? Effect.succeed({ kind: "user" as const, userId }) : Effect.fail(new Unauthenticated({ message: "User token required" })),
    requireBot: () => Effect.die("Bot not allowed"), requireUserOrBot: () => Effect.die("Mixed auth not allowed"),
  }), Layer.succeed(ServerAuthorization, {
    resolve: () => Effect.die("Unused"), require: (_request, id) => [serverA, serverB].includes(id)
      ? Effect.succeed({ principal: { kind: "user" as const, userId }, manager: false, sections: { settings: "view" as const } })
      : Effect.fail(new Forbidden({ message: "No server access" })),
  }))
  const request = (path: string, method: string, body?: unknown, auth = "user-fixture") => dispatchBillingMutations(new Request(`https://api.example.test/v2/billing/${path}`, {
    method, headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), bindings, gateway)
  return { layer, gateway, request }
}
const seed = (user: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${user}, 'discord')`
  yield* sql`INSERT INTO servers (id, name) VALUES (${serverA}, 'Billing A'), (${serverB}, 'Billing B') ON CONFLICT DO NOTHING`
})
const subscription = (user: string) => ({ id: `sub_${user}`, customer: `cus_${user}`, livemode: false, created: 100,
  status: "active", cancel_at_period_end: false, metadata: { clashking_server_id: serverA },
  items: { has_more: false, data: [{ price: { id: "price_support" }, current_period_end: 1900000000 }] } })
const event = (id: string, user: string, type = "customer.subscription.updated") => ({ id, type, livemode: false,
  data: { object: { id: `sub_${user}`, customer: `cus_${user}`, client_reference_id: user, status: "active" } } })

it("persists the customer operation across lost acknowledgements and serializes concurrent retry", async () => {
  const user = "billing_retry"
  const calls: string[] = []
  const f = fixture(user, { createCustomer: (_user, operation) => {
    calls.push(operation)
    return calls.length === 1 ? Effect.fail(new UpstreamUnavailable({ cause: "fixture", message: "Lost Stripe acknowledgement" }))
      : Effect.succeed({ id: `cus_${user}`, livemode: false, metadata: {} })
  } })
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* seed(user)
    expect(yield* ensureBillingCustomer(user, f.gateway).pipe(Effect.flip)).toMatchObject({ _tag: "UpstreamUnavailable" })
    const operations = yield* sql<{ operation_id: string }>`SELECT operation_id::text FROM billing_customer_operations WHERE user_id = ${user}`
    expect(operations).toHaveLength(1)
    expect(yield* sql`SELECT * FROM billing_customers WHERE user_id = ${user}`).toEqual([])
    expect(yield* Effect.all([ensureBillingCustomer(user, f.gateway), ensureBillingCustomer(user, f.gateway)], { concurrency: 2 }))
      .toEqual([`cus_${user}`, `cus_${user}`])
    expect(calls).toEqual([operations[0]!.operation_id, operations[0]!.operation_id])
    expect(yield* sql`SELECT stripe_customer_id FROM billing_customer_operations WHERE user_id = ${user}`).toEqual([{ stripe_customer_id: `cus_${user}` }])
  }).pipe(Effect.provide(f.layer), Effect.scoped))
})

it("uses read-only recovery after the retry window and retains unresolved operations", async () => {
  const user = "billing_recover", unresolved = "billing_unresolved"
  const create = vi.fn(() => Effect.die("Expired operation must never POST"))
  const recovery = vi.fn((who: string) => who === user ? Effect.succeed({ id: `cus_${user}`, livemode: false, metadata: {} })
    : Effect.fail(new UpstreamUnavailable({ cause: "fixture", message: "Manual reconciliation required" })))
  const f = fixture(user, { createCustomer: create, recoverCustomer: recovery })
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* seed(user); yield* seed(unresolved)
    yield* sql`INSERT INTO billing_customer_operations (user_id, created_at) VALUES (${user}, now() - interval '25 hours'), (${unresolved}, now() - interval '25 hours')`
    expect(yield* ensureBillingCustomer(user, f.gateway)).toBe(`cus_${user}`)
    expect(yield* ensureBillingCustomer(unresolved, f.gateway).pipe(Effect.flip)).toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(yield* sql`SELECT stripe_customer_id FROM billing_customer_operations WHERE user_id = ${unresolved}`).toEqual([{ stripe_customer_id: null }])
    expect(create).not.toHaveBeenCalled()
    expect(recovery).toHaveBeenCalledTimes(2)
  }).pipe(Effect.provide(f.layer), Effect.scoped))
})

it("reconciles duplicates and out-of-order events without overwriting or resurrecting explicit assignments", async () => {
  const user = "billing_events"
  let current = [subscription(user)]
  const reads = vi.fn(() => Effect.succeed(current))
  const f = fixture(user, { subscriptions: reads })
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* seed(user)
    yield* sql`INSERT INTO billing_customers (user_id, stripe_customer_id) VALUES (${user}, ${`cus_${user}`})`
    yield* sql`INSERT INTO mobile_notification_accounts (user_id, player_tag, source, active) VALUES (${user}, '#PQY', 'verified', true)`
    const first = event("evt_billing_first", user)
    yield* Effect.all([projectBillingEvent(first, f.gateway, "price_support"), projectBillingEvent(first, f.gateway, "price_support")], { concurrency: 2 })
    expect(reads).toHaveBeenCalledOnce()
    expect(yield* sql`SELECT active, bookmark_notifications_limit, roster_assistant_monthly_credit_usd::float8 AS credit FROM subscription_entitlements WHERE user_id = ${user}`)
      .toEqual([{ active: true, bookmark_notifications_limit: 10, credit: 5 }])
    expect(yield* sql`SELECT server_id FROM subscription_roster_assignments WHERE user_id = ${user}`).toEqual([{ server_id: serverA }])
    expect((yield* f.request("subscription/assignment", "PUT", { serverId: serverB }))?.status).toBe(204)
    current = [{ ...subscription(user), id: "sub_old", created: 1, status: "canceled" }, { ...subscription(user), id: "sub_new", created: 200 }]
    yield* projectBillingEvent(event("evt_old_delete", user, "customer.subscription.deleted"), f.gateway, "price_support")
    expect(yield* sql`SELECT provider_subscription_id FROM billing_subscriptions WHERE user_id = ${user}`).toEqual([{ provider_subscription_id: "sub_new" }])
    expect(yield* sql`SELECT server_id FROM subscription_roster_assignments WHERE user_id = ${user}`).toEqual([{ server_id: serverB }])
    expect((yield* f.request("subscription/assignment", "PUT", { serverId: null }))?.status).toBe(204)
    yield* projectBillingEvent(event("evt_after_clear", user), f.gateway, "price_support")
    expect(yield* sql`SELECT server_id FROM subscription_roster_assignments WHERE user_id = ${user}`).toEqual([])
    const racing = yield* Effect.all([
      f.request("subscription/assignment", "PUT", { serverId: serverB }),
      f.request("subscription/assignment", "PUT", { serverId: null }),
      projectBillingEvent(event("evt_assignment_race", user), f.gateway, "price_support"),
    ], { concurrency: 3 })
    expect(racing.slice(0, 2).map((response) => response?.status)).toEqual([204, 204])
    const afterRace = yield* sql<{ server_id: string }>`SELECT server_id FROM subscription_roster_assignments WHERE user_id = ${user}`
    expect(afterRace.length).toBeLessThanOrEqual(1)
    if (afterRace[0]) expect(afterRace[0].server_id).toBe(serverB)
    yield* projectBillingEvent(event("evt_after_assignment_race", user), f.gateway, "price_support")
    expect(yield* sql`SELECT server_id FROM subscription_roster_assignments WHERE user_id = ${user}`).toEqual(afterRace)
    current = [{ ...subscription(user), status: "canceled" }]
    yield* projectBillingEvent(event("evt_stale_active", user), f.gateway, "price_support")
    expect(yield* sql`SELECT active FROM subscription_entitlements WHERE user_id = ${user}`).toEqual([{ active: false }])
    expect(yield* f.request("subscription/assignment", "PUT", { serverId: serverA }).pipe(Effect.flip)).toMatchObject({ _tag: "Conflict" })
    expect(yield* sql`SELECT active FROM mobile_notification_accounts WHERE user_id = ${user}`).toEqual([{ active: true }])
    expect(yield* projectBillingEvent({ ...event("evt_wrong_mode", user), livemode: true }, f.gateway, "price_support").pipe(Effect.flip)).toMatchObject({ _tag: "InvalidRequest" })
    expect(yield* sql`SELECT event_id FROM billing_webhook_events WHERE event_id = 'evt_wrong_mode'`).toEqual([])
  }).pipe(Effect.provide(f.layer), Effect.scoped))
})

it("rolls back failed webhook reconciliation and rejects cross-account checkout identity", async () => {
  const user = "billing_failure"
  let fail = true
  const f = fixture(user, { subscriptions: () => fail ? Effect.fail(new UpstreamUnavailable({ cause: "fixture", message: "Unavailable" })) : Effect.succeed([subscription(user)]) })
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* seed(user)
    yield* sql`INSERT INTO billing_customers (user_id, stripe_customer_id) VALUES (${user}, ${`cus_${user}`})`
    const pending = event("evt_retryable", user)
    expect(yield* projectBillingEvent(pending, f.gateway, "price_support").pipe(Effect.flip)).toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(yield* sql`SELECT event_id FROM billing_webhook_events WHERE event_id = ${pending.id}`).toEqual([])
    fail = false
    yield* projectBillingEvent(pending, f.gateway, "price_support")
    const wrong = event("evt_wrong_identity", user, "checkout.session.completed")
    wrong.data.object.client_reference_id = "another_user"
    expect(yield* projectBillingEvent(wrong, f.gateway, "price_support").pipe(Effect.flip)).toMatchObject({ _tag: "InvalidRequest" })
    expect(yield* sql`SELECT event_id FROM billing_webhook_events WHERE event_id = ${wrong.id}`).toEqual([])
    yield* projectBillingEvent(event("evt_wrong_price", user), f.gateway, "price_other")
    expect(yield* sql`SELECT active FROM subscription_entitlements WHERE user_id = ${user}`).toEqual([{ active: false }])
  }).pipe(Effect.provide(f.layer), Effect.scoped))
})

it("gates checkout on user/server access and feature flag before creating a customer, and scopes portal ownership", async () => {
  const user = "billing_checkout"
  const create = vi.fn((who: string, operation: string) => Effect.succeed({ id: `cus_${who}`, livemode: false, metadata: { clashking_operation_id: operation } }))
  const checkout = vi.fn(() => Effect.succeed("https://checkout.stripe.com/c/pay/test"))
  const portal = vi.fn(() => Effect.succeed("https://billing.stripe.com/session/test"))
  const f = fixture(user, { createCustomer: create, checkout, portal })
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* seed(user)
    expect(yield* f.request("stripe/checkout", "POST", {}, "bot-fixture").pipe(Effect.flip)).toMatchObject({ _tag: "Unauthenticated" })
    expect(yield* f.request("stripe/checkout", "POST", { serverId: "8934567890123456703" }).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(yield* f.request("stripe/checkout", "POST", { serverId: serverA }).pipe(Effect.flip)).toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(create).not.toHaveBeenCalled()
    expect(yield* f.request("stripe/portal", "POST").pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
    yield* sql`INSERT INTO admin_feature_flags (flag_key, name, enabled, rollout_percentage, platforms, public_exposure)
      VALUES ('subscription_support', 'Support', true, 100, ARRAY['web'], 'safe')
      ON CONFLICT (flag_key) DO UPDATE SET enabled = true, rollout_percentage = 100, platforms = ARRAY['web'], public_exposure = 'safe'`
    const response = yield* f.request("stripe/checkout", "POST", { serverId: serverA })
    expect(response?.status).toBe(200)
    expect(checkout).toHaveBeenCalledWith(`cus_${user}`, user, serverA)
    expect((yield* f.request("stripe/portal", "POST"))?.status).toBe(200)
    expect(portal).toHaveBeenCalledWith(`cus_${user}`)
  }).pipe(Effect.provide(f.layer), Effect.scoped))
})

it("accepts a signed Go-model subscription snapshot without relying on its old period/item layout", async () => {
  const user = "billing_inherited_snapshot"
  const signing = { ...bindings, STRIPE_RESTRICTED_KEY: ["rk", "test", "local_fixture_only"].join("_"), STRIPE_WEBHOOK_SECRET: "local-snapshot-signature-fixture" }
  const realVerification = makeBillingGateway(signing).verify
  const reads = vi.fn(() => Effect.succeed([subscription(user)]))
  const f = fixture(user, { verify: realVerification, subscriptions: reads })
  // The inherited Go SDK v85.2.0 pins 2026-05-27.dahlia. The Go billing model
  // has top-level current_period_end and item.price.id, not per-item periods.
  // This is source-model compatibility evidence, not a production webhook export.
  const payload = JSON.stringify({ ...event("evt_inherited_snapshot", user), object: "event", api_version: "2026-05-27.dahlia", created: 1700000000,
    data: { object: { id: `sub_${user}`, customer: `cus_${user}`, status: "canceled", current_period_end: 1800000000,
      cancel_at_period_end: true, metadata: { clashking_server_id: serverB }, items: { data: [{ price: { id: "price_old" } }] } } },
  })
  const signature = await new Stripe(signing.STRIPE_RESTRICTED_KEY).webhooks.generateTestHeaderStringAsync({ payload,
    secret: signing.STRIPE_WEBHOOK_SECRET, cryptoProvider: Stripe.createSubtleCryptoProvider() })
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* seed(user)
    yield* sql`INSERT INTO billing_customers (user_id, stripe_customer_id) VALUES (${user}, ${`cus_${user}`})`
    const response = yield* dispatchBillingMutations(new Request("https://api.example.test/v2/billing/stripe/webhook", {
      method: "POST", headers: { "stripe-signature": signature }, body: payload,
    }), signing, f.gateway)
    expect(response?.status).toBe(200)
    expect(reads).toHaveBeenCalledWith(`cus_${user}`)
    expect(yield* sql`SELECT status, provider_price_id FROM billing_subscriptions WHERE user_id = ${user}`)
      .toEqual([{ status: "active", provider_price_id: "price_support" }])
    expect(yield* sql`SELECT payload->>'api_version' AS version, payload->>'created' AS created FROM billing_webhook_events WHERE event_id = 'evt_inherited_snapshot'`)
      .toEqual([{ version: "2026-05-27.dahlia", created: "1700000000" }])
  }).pipe(Effect.provide(f.layer), Effect.scoped))
})

it.each(["assignment", "webhook"] as const)("%s writes wait for the shared AI accounting mutex and roll back on timeout", async (kind) => {
  const user = `billing_mutex_${kind}`
  const boundedUrl = new URL(databaseUrl!)
  boundedUrl.searchParams.set("options", "-c lock_timeout=100ms")
  const providerReads = vi.fn(() => Effect.succeed([{ ...subscription(user), status: "canceled" }]))
  const f = fixture(user, {
    subscriptions: providerReads,
    verify: () => Effect.succeed(event(`evt_mutex_${kind}`, user)),
  }, boundedUrl.toString())
  const mutation = () => kind === "assignment"
    ? f.request("subscription/assignment", "PUT", { serverId: serverB })
    : f.request("stripe/webhook", "POST", { signedByFakeAdapter: true })
  const holder = PgClient.layer({ url: Redacted.make(databaseUrl!) })
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* seed(user)
    yield* sql`INSERT INTO billing_customers (user_id, stripe_customer_id) VALUES (${user}, ${`cus_${user}`})`
    yield* sql`INSERT INTO subscription_entitlements (user_id, active, bookmark_notifications_limit, roster_assistant_monthly_credit_usd)
      VALUES (${user}, true, 10, 5)`
    yield* sql`INSERT INTO subscription_roster_assignments (user_id, server_id) VALUES (${user}, ${serverA})`
    yield* sql.withTransaction(Effect.gen(function* () {
      yield* lockRosterAIBudget(sql)
      // A separately provided Pg layer guarantees a second physical connection.
      // No sleep or scheduler guess: PostgreSQL's own lock timeout proves contention.
      const failure = yield* mutation().pipe(Effect.provide(f.layer), Effect.flip)
      expect(failure._tag).toBe("DatabaseFailure")
      if (failure._tag !== "DatabaseFailure") throw new Error("Expected a database lock failure")
      expect(failure.cause).toMatchObject({ reason: { cause: { code: "55P03" } } })
      // The webhook's provider read already completed while another connection
      // held the global mutex, so it cannot be running inside that mutex.
      expect(providerReads).toHaveBeenCalledTimes(kind === "webhook" ? 1 : 0)
      expect(yield* sql`SELECT active FROM subscription_entitlements WHERE user_id = ${user}`).toEqual([{ active: true }])
      expect(yield* sql`SELECT server_id FROM subscription_roster_assignments WHERE user_id = ${user}`).toEqual([{ server_id: serverA }])
      expect(yield* sql`SELECT event_id FROM billing_webhook_events WHERE event_id = ${`evt_mutex_${kind}`}`).toEqual([])
    }))
    expect((yield* mutation().pipe(Effect.provide(f.layer)))?.status).toBe(kind === "assignment" ? 204 : 200)
    expect(yield* sql`SELECT active FROM subscription_entitlements WHERE user_id = ${user}`).toEqual([{ active: kind === "assignment" }])
  }).pipe(Effect.provide(holder), Effect.scoped))
})

it("races real AI settlement with billing webhook retries and assignment writes without applying credit twice", async () => {
  const user = "billing_ai_settlement_race"
  let providerFails = true
  const providerReads = vi.fn(() => providerFails
    ? Effect.fail(new UpstreamUnavailable({ cause: "fixture", message: "Lost provider read" }))
    : Effect.succeed([subscription(user)]))
  const f = fixture(user, { subscriptions: providerReads, verify: () => Effect.succeed(event("evt_ai_settlement_race", user)) })
  const webhook = () => f.request("stripe/webhook", "POST", { verifiedByFakeAdapter: true })
  // Exact existing Luna long-context rate: 6.25M input tokens costs $2.50.
  const usage = { inputTokens: 6250000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 }
  const settle = (requestId: string) => dispatchDashboardRosterAIUsage(new Request("https://api.example.test/v2/roster/ai/usage", {
    method: "POST", headers: { "content-type": "application/json", "X-ClashKing-AI-Metering": "local-metering-fixture" },
    body: JSON.stringify({ requestId, model: "gpt-5.6-luna", usage, steps: [usage] }),
  }), "local-metering-fixture")
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* seed(user)
    yield* sql`INSERT INTO billing_customers (user_id, stripe_customer_id) VALUES (${user}, ${`cus_${user}`})`
    yield* sql`INSERT INTO billing_subscriptions (user_id, provider_subscription_id, provider_price_id, status, initial_assignment_applied)
      VALUES (${user}, ${`sub_${user}`}, 'price_support', 'active', true)`
    yield* sql`INSERT INTO subscription_entitlements (user_id, active, bookmark_notifications_limit, roster_assistant_monthly_credit_usd)
      VALUES (${user}, true, 10, 5)`
    yield* sql`INSERT INTO subscription_roster_assignments (user_id, server_id) VALUES (${user}, ${serverA})`
    const ids: string[] = []
    for (let index = 0; index < 3; index++) {
      const id = (yield* sql<{ id: string }>`INSERT INTO roster_ai_usage (server_id, discord_user_id, operation, provider, model)
        VALUES (${serverA}, ${user}, 'view_or_membership_proposal', 'openai', 'gpt-5.6-luna') RETURNING id::text`)[0]!.id
      ids.push(id)
      yield* sql`INSERT INTO roster_ai_usage_sponsors (usage_id, user_id, position) VALUES (${id}, ${user}, 0)`
    }
    expect(yield* webhook().pipe(Effect.flip)).toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(yield* sql`SELECT event_id FROM billing_webhook_events WHERE event_id = 'evt_ai_settlement_race'`).toEqual([])
    expect(yield* sql`SELECT status FROM billing_subscriptions WHERE user_id = ${user}`).toEqual([{ status: "active" }])
    providerFails = false
    const results = yield* Effect.all([
      settle(ids[0]!), settle(ids[1]!), settle(ids[2]!), settle(ids[0]!),
      webhook(), webhook(), f.request("subscription/assignment", "PUT", { serverId: serverB }),
    ], { concurrency: 7 })
    expect(results.map((response) => response?.status)).toEqual([204, 204, 204, 204, 200, 200, 204])
    expect(yield* sql`SELECT sum(amount_usd)::text AS credited, count(*)::integer AS allocations
      FROM roster_ai_usage_credits WHERE user_id = ${user}`).toEqual([{ credited: '5.00000000', allocations: 2 }])
    expect(yield* sql`SELECT sum(total_cost_usd)::text AS cost, count(*)::integer AS requests
      FROM roster_ai_usage WHERE discord_user_id = ${user}`).toEqual([{ cost: '7.50000000', requests: 3 }])
    expect(yield* sql`SELECT server_id FROM subscription_roster_assignments WHERE user_id = ${user}`).toEqual([{ server_id: serverB }])
    expect(yield* sql`SELECT count(*)::integer AS events FROM billing_webhook_events WHERE event_id = 'evt_ai_settlement_race'`).toEqual([{ events: 1 }])
    expect(providerReads).toHaveBeenCalledTimes(2) // one failed delivery, one successful retry; duplicate is skipped
    yield* Effect.all([...ids.map(settle), webhook()], { concurrency: 4 })
    expect(yield* sql`SELECT sum(amount_usd)::text AS credited, count(*)::integer AS allocations
      FROM roster_ai_usage_credits WHERE user_id = ${user}`).toEqual([{ credited: '5.00000000', allocations: 2 }])
    expect(providerReads).toHaveBeenCalledTimes(2)
  }).pipe(Effect.provide(f.layer), Effect.scoped))
})
