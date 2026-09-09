import {
  BillingStripeWebhookEndpoint, DashboardBillingAssignmentEndpoint, DashboardBillingCheckoutEndpoint,
  DashboardBillingPortalEndpoint, DecimalSnowflake,
} from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import Stripe from "stripe"
import { AuthIdentity } from "./auth.js"
import { resolveCheckoutFlag } from "./dashboard-misc-runtime.js"
import type { WorkerBindings } from "./environment.js"
import { Conflict, DatabaseFailure, InvalidRequest, NotFound, PayloadTooLarge, Unauthenticated, UpstreamUnavailable } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { ServerAuthorization } from "./server-authorization.js"

type BillingBindings = Pick<WorkerBindings, "STRIPE_RESTRICTED_KEY" | "STRIPE_WEBHOOK_SECRET" | "STRIPE_MONTHLY_PRICE_ID" |
  "STRIPE_CHECKOUT_SUCCESS_URL" | "STRIPE_CHECKOUT_CANCEL_URL" | "STRIPE_PORTAL_RETURN_URL">
const unavailable = (message: string) => new UpstreamUnavailable({ cause: "billing", message })
const provider = <A>(run: () => PromiseLike<A>) => Effect.tryPromise({ try: () => Promise.resolve(run()), catch: () => unavailable("Stripe request failed") })
const database = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.mapError((cause) =>
  cause instanceof Conflict || cause instanceof InvalidRequest || cause instanceof NotFound || cause instanceof Unauthenticated || cause instanceof UpstreamUnavailable
    ? cause : new DatabaseFailure({ cause, message: "Billing persistence failed" })))
const decode = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
  Effect.mapError(() => new InvalidRequest({ message: "Invalid billing request" })),
)
const readJson = (request: Request) => Effect.gen(function* () {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
  }
  return yield* readBoundedJson(request)
})
const https = (value: string) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password } catch { return false } }
const mode = (bindings: BillingBindings) => {
  if (!/^rk_(?:test|live)_\S+$/u.test(bindings.STRIPE_RESTRICTED_KEY)) throw unavailable("Stripe restricted key is not configured")
  return bindings.STRIPE_RESTRICTED_KEY.startsWith("rk_live_")
}
const Metadata = Schema.Record(Schema.String, Schema.String)
const Customer = Schema.Struct({ id: Schema.String, livemode: Schema.Boolean, metadata: Metadata })
const Subscription = Schema.Struct({
  id: Schema.String, customer: Schema.String, livemode: Schema.Boolean, created: Schema.Number,
  status: Schema.String, cancel_at_period_end: Schema.Boolean, metadata: Metadata,
  items: Schema.Struct({ has_more: Schema.Boolean, data: Schema.Array(Schema.Struct({
    price: Schema.Struct({ id: Schema.String }), current_period_end: Schema.Number,
  })) }),
})
const Event = Schema.Struct({ id: Schema.String, type: Schema.String, livemode: Schema.Boolean,
  data: Schema.Struct({ object: Schema.Record(Schema.String, Schema.Unknown) }) })
type SubscriptionData = typeof Subscription.Type
type CustomerData = typeof Customer.Type
export interface BillingGateway {
  readonly live: boolean
  readonly verify: (raw: Uint8Array, signature: string) => Effect.Effect<typeof Event.Type, InvalidRequest | UpstreamUnavailable>
  readonly createCustomer: (userId: string, operationId: string) => Effect.Effect<CustomerData, UpstreamUnavailable>
  readonly recoverCustomer: (userId: string, operationId: string) => Effect.Effect<CustomerData, UpstreamUnavailable>
  readonly subscriptions: (customerId: string) => Effect.Effect<ReadonlyArray<SubscriptionData>, UpstreamUnavailable>
  readonly checkout: (customerId: string, userId: string, serverId: string) => Effect.Effect<string, UpstreamUnavailable>
  readonly portal: (customerId: string) => Effect.Effect<string, UpstreamUnavailable>
}
const providerDecode = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(
  Effect.mapError(() => unavailable("Stripe response is incomplete")),
)

/** Per-request SDK instance uses Workers fetch and Web Crypto, with no global credentials. */
export const makeBillingGateway = (bindings: BillingBindings): BillingGateway => {
  const live = mode(bindings)
  const stripe = new Stripe(bindings.STRIPE_RESTRICTED_KEY, {
    apiVersion: "2026-08-26.dahlia", httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 0, timeout: 10_000,
  })
  const customer = (value: unknown, userId: string, operationId: string) => Effect.gen(function* () {
    const result = yield* providerDecode(Customer, value)
    if (!/^cus_\w+$/u.test(result.id) || result.livemode !== live || result.metadata.clashking_user_id !== userId ||
      result.metadata.clashking_operation_id !== operationId) return yield* unavailable("Stripe customer ownership could not be verified")
    return result
  })
  const sessionUrl = (url: string | null | undefined) => typeof url === "string" && https(url)
    ? Effect.succeed(url) : Effect.fail(unavailable("Stripe session URL is unavailable"))
  return {
    live,
    verify: (raw, signature) => Effect.gen(function* () {
      if (!bindings.STRIPE_WEBHOOK_SECRET.trim()) return yield* unavailable("Stripe webhook is not configured")
      const event = yield* Effect.tryPromise({
        // Fatal decoding rejects malformed UTF-8; ignoreBOM preserves a leading BOM
        // instead of silently removing bytes before signature verification.
        try: () => stripe.webhooks.constructEventAsync(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw),
          signature, bindings.STRIPE_WEBHOOK_SECRET, 300, Stripe.createSubtleCryptoProvider()),
        catch: () => new InvalidRequest({ message: "Invalid Stripe webhook signature" }),
      })
      const value = yield* providerDecode(Event, event)
      if (!value.id || value.livemode !== live) return yield* new InvalidRequest({ message: "Stripe webhook mode does not match this environment" })
      return { ...event, ...value }
    }),
    createCustomer: (userId, operationId) => Effect.gen(function* () {
      const value = yield* provider(() => stripe.customers.create({ metadata: { clashking_user_id: userId, clashking_operation_id: operationId } },
        { idempotencyKey: `clashking-customer-${operationId}` }))
      return yield* customer(value, userId, operationId)
    }),
    recoverCustomer: (userId, operationId) => Effect.gen(function* () {
      // operationId is a DB-generated UUID, never a user-controlled search expression.
      if (!/^[0-9a-f-]{36}$/u.test(operationId)) return yield* unavailable("Invalid billing operation identity")
      const found = yield* provider(() => stripe.customers.search({ query: `metadata['clashking_operation_id']:'${operationId}'`, limit: 2 }))
      if (found.has_more || found.data.length !== 1) return yield* unavailable("Stripe customer creation is unresolved; manual reconciliation is required")
      return yield* customer(found.data[0], userId, operationId)
    }),
    subscriptions: (customerId) => Effect.gen(function* () {
      const result: SubscriptionData[] = []
      let cursor: string | undefined
      for (let page = 0; page < 10; page++) {
        const listed = yield* provider(() => stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100,
          ...(cursor === undefined ? {} : { starting_after: cursor }) }))
        for (const raw of listed.data) {
          const value = yield* providerDecode(Subscription, raw)
          if (value.customer !== customerId || value.livemode !== live || value.items.has_more) return yield* unavailable("Stripe subscription ownership or item completeness is invalid")
          // Preserve the complete provider snapshot for the existing raw audit column.
          result.push({ ...raw, customer: value.customer })
        }
        if (!listed.has_more) return result
        const next = listed.data.at(-1)?.id
        if (!next || next === cursor) return yield* unavailable("Stripe subscription pagination is incomplete")
        cursor = next
      }
      return yield* unavailable("Stripe subscription reconciliation exceeded its bounded page limit")
    }),
    checkout: (customerId, userId, serverId) => Effect.gen(function* () {
      if (!bindings.STRIPE_MONTHLY_PRICE_ID.trim() || !https(bindings.STRIPE_CHECKOUT_SUCCESS_URL) || !https(bindings.STRIPE_CHECKOUT_CANCEL_URL)) {
        return yield* unavailable("Stripe Checkout is not configured")
      }
      const suffix = Array.from(crypto.getRandomValues(new Uint8Array(8)), (value) => String.fromCharCode(97 + value % 26)).join("")
      const session = yield* provider(() => stripe.checkout.sessions.create({ mode: "subscription", customer: customerId,
        client_reference_id: userId, line_items: [{ price: bindings.STRIPE_MONTHLY_PRICE_ID, quantity: 1 }],
        success_url: bindings.STRIPE_CHECKOUT_SUCCESS_URL, cancel_url: bindings.STRIPE_CHECKOUT_CANCEL_URL,
        allow_promotion_codes: true, subscription_data: { metadata: { clashking_server_id: serverId } },
        integration_identifier: `clashking-dashboard-${suffix}`,
      }, { idempotencyKey: crypto.randomUUID() }))
      if (session.livemode !== live) return yield* unavailable("Stripe Checkout mode does not match this environment")
      return yield* sessionUrl(session.url)
    }),
    portal: (customerId) => Effect.gen(function* () {
      if (!https(bindings.STRIPE_PORTAL_RETURN_URL)) return yield* unavailable("Stripe customer portal is not configured")
      const session = yield* provider(() => stripe.billingPortal.sessions.create({ customer: customerId, return_url: bindings.STRIPE_PORTAL_RETURN_URL }))
      return yield* sessionUrl(session.url)
    }),
  }
}

/** Preserve every signed byte, including a UTF-8 BOM; JSON readers must not precede verification. */
export const readStripeBody = (request: Request) => Effect.tryPromise({
  try: async (signal) => {
    const limit = 1024 * 1024
    if (Number(request.headers.get("content-length")) > limit) { await request.body?.cancel(); throw new PayloadTooLarge({ message: "Stripe webhook exceeds 1 MiB" }) }
    if (!request.body) throw new InvalidRequest({ message: "Stripe webhook body is missing" })
    const reader = request.body.getReader(), chunks: Uint8Array[] = []
    const abort = () => { void reader.cancel(signal.reason).catch(() => undefined) }
    signal.addEventListener("abort", abort, { once: true })
    let length = 0
    try {
      while (true) {
        signal.throwIfAborted()
        const { done, value } = await reader.read()
        signal.throwIfAborted()
        if (done) break
        length += value.byteLength
        if (length > limit) throw new PayloadTooLarge({ message: "Stripe webhook exceeds 1 MiB" })
        chunks.push(value)
      }
      const result = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
      return result
    } catch (cause) { await reader.cancel().catch(() => undefined); throw cause }
    finally { signal.removeEventListener("abort", abort); reader.releaseLock() }
  },
  catch: (cause) => cause instanceof PayloadTooLarge || cause instanceof InvalidRequest ? cause : new InvalidRequest({ message: "Stripe webhook body is invalid" }),
})

const lockUser = (userId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  if ((yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${userId} FOR UPDATE`).length === 0) {
    return yield* new Unauthenticated({ message: "User session is no longer valid" })
  }
})

export const ensureBillingCustomer = (userId: string, gateway: BillingGateway) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  // Commit the attempt before contacting Stripe so a crashed request cannot lose its idempotency identity.
  yield* database(sql.withTransaction(Effect.gen(function* () {
    yield* lockUser(userId)
    yield* sql`INSERT INTO billing_customer_operations (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`
  })))
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    yield* lockUser(userId)
    const existing = yield* sql<{ stripe_customer_id: string }>`SELECT stripe_customer_id FROM billing_customers WHERE user_id = ${userId} FOR UPDATE`
    if (existing[0]) return existing[0].stripe_customer_id
    const operations = yield* sql<{ operation_id: string; created_at: Date; stripe_customer_id: string | null }>`
      SELECT operation_id::text, created_at, stripe_customer_id FROM billing_customer_operations WHERE user_id = ${userId} FOR UPDATE`
    const operation = operations[0]
    if (!operation) return yield* unavailable("Billing customer operation is unavailable")
    const customerId = operation.stripe_customer_id ?? (yield* (
      Date.now() - new Date(operation.created_at).getTime() < 23 * 60 * 60 * 1000
        ? gateway.createCustomer(userId, operation.operation_id) : gateway.recoverCustomer(userId, operation.operation_id)
    )).id
    yield* sql`INSERT INTO billing_customers (user_id, stripe_customer_id) VALUES (${userId}, ${customerId})`
    yield* sql`UPDATE billing_customer_operations SET stripe_customer_id = ${customerId}, updated_at = now() WHERE user_id = ${userId}`
    return customerId
  })))
})

const active = (subscription: SubscriptionData, priceId: string) => ["active", "trialing"].includes(subscription.status) && subscription.items.data.some((item) => item.price.id === priceId)
/** Reconcile current provider state, not event timestamps (which do not totally order Stripe events). */
export const projectBillingEvent = (event: typeof Event.Type, gateway: BillingGateway, priceId: string) => Effect.gen(function* () {
  if (event.livemode !== gateway.live) return yield* new InvalidRequest({ message: "Stripe webhook mode does not match this environment" })
  const sql = yield* SqlClient.SqlClient
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    const known = yield* sql`SELECT event_id FROM billing_webhook_events WHERE provider = 'stripe' AND event_id = ${event.id}`
    if (known.length > 0) return
    const handled = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)
    if (handled) {
      const customerId = event.data.object.customer
      if (typeof customerId !== "string" || !/^cus_\w+$/u.test(customerId)) return yield* new InvalidRequest({ message: "Stripe event customer is missing" })
      const bindings = yield* sql<{ user_id: string }>`SELECT user_id FROM billing_customers WHERE stripe_customer_id = ${customerId}`
      const userId = bindings[0]?.user_id
      if (!userId) return yield* unavailable("Stripe customer is not linked to an account yet")
      yield* lockUser(userId)
      const locked = yield* sql`SELECT user_id FROM billing_customers WHERE user_id = ${userId} AND stripe_customer_id = ${customerId} FOR UPDATE`
      if (locked.length === 0) return yield* unavailable("Stripe customer ownership changed")
      if (event.type === "checkout.session.completed" && event.data.object.client_reference_id !== userId) {
        return yield* new InvalidRequest({ message: "Stripe checkout identity does not match its customer" })
      }
      if ((yield* sql`SELECT event_id FROM billing_webhook_events WHERE provider = 'stripe' AND event_id = ${event.id}`).length > 0) return
      const subscriptions = yield* gateway.subscriptions(customerId)
      const sorted = [...subscriptions].sort((a, b) => Number(active(b, priceId)) - Number(active(a, priceId)) || b.created - a.created || b.id.localeCompare(a.id))
      const current = sorted[0]
      const previous = yield* sql<{ initial_assignment_applied: boolean }>`SELECT initial_assignment_applied FROM billing_subscriptions WHERE user_id = ${userId}`
      const entitled = current !== undefined && active(current, priceId)
      if (current) {
        const item = current.items.data.find((item) => item.price.id === priceId) ?? current.items.data[0]
        const periodEnd = item && item.current_period_end > 0 ? new Date(item.current_period_end * 1000).toISOString() : null
        yield* sql`INSERT INTO billing_subscriptions (user_id, provider, provider_subscription_id, provider_price_id, status,
          current_period_end, cancel_at_period_end, raw, initial_assignment_applied)
          VALUES (${userId}, 'stripe', ${current.id}, ${item?.price.id ?? null}, ${current.status}, ${periodEnd}::timestamptz,
            ${current.cancel_at_period_end}, ${JSON.stringify(current)}::jsonb, false)
          ON CONFLICT (user_id) DO UPDATE SET provider_subscription_id = EXCLUDED.provider_subscription_id,
            provider_price_id = EXCLUDED.provider_price_id, status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
            cancel_at_period_end = EXCLUDED.cancel_at_period_end, raw = EXCLUDED.raw, updated_at = now()`
      } else {
        yield* sql`UPDATE billing_subscriptions SET status = 'none', updated_at = now() WHERE user_id = ${userId}`
      }
      yield* sql`INSERT INTO subscription_entitlements (user_id, active, bookmark_notifications_limit, roster_assistant_monthly_credit_usd)
        VALUES (${userId}, ${entitled}, 10, 5.00) ON CONFLICT (user_id) DO UPDATE SET active = EXCLUDED.active,
          bookmark_notifications_limit = 10, roster_assistant_monthly_credit_usd = 5.00, updated_at = now()`
      if (entitled && current && previous[0]?.initial_assignment_applied !== true) {
        const serverId = current.metadata.clashking_server_id
        if (serverId && Schema.is(DecimalSnowflake)(serverId)) {
          yield* sql`INSERT INTO subscription_roster_assignments (user_id, server_id)
            SELECT ${userId}, id FROM servers WHERE id = ${serverId} ON CONFLICT (user_id) DO NOTHING`
        }
        yield* sql`UPDATE billing_subscriptions SET initial_assignment_applied = true WHERE user_id = ${userId}`
      }
      yield* sql`WITH ranked AS (SELECT player_tag, row_number() OVER (ORDER BY created_at, player_tag) AS position
          FROM mobile_notification_accounts WHERE user_id = ${userId} AND source = 'bookmarked')
        UPDATE mobile_notification_accounts account SET active = ${entitled} AND ranked.position <= 10, updated_at = now()
        FROM ranked WHERE account.user_id = ${userId} AND account.player_tag = ranked.player_tag AND account.source = 'bookmarked'`
    }
    yield* sql`INSERT INTO billing_webhook_events (provider, event_id, event_type, payload)
      VALUES ('stripe', ${event.id}, ${event.type}, ${JSON.stringify(event)}::jsonb) ON CONFLICT DO NOTHING`
  })))
})

export const billingMutationRuntimeRoutes = [
  { method: "PUT", path: "/v2/billing/subscription/assignment" },
  { method: "POST", path: "/v2/billing/stripe/checkout" },
  { method: "POST", path: "/v2/billing/stripe/portal" },
  { method: "POST", path: "/v2/billing/stripe/webhook" },
] as const
export const dispatchBillingMutations = (request: Request, bindings: BillingBindings, adapter?: BillingGateway) => Effect.gen(function* () {
  const pathname = new URL(request.url).pathname
  if (!billingMutationRuntimeRoutes.some((route) => route.method === request.method && route.path === pathname)) return undefined
  if (pathname === BillingStripeWebhookEndpoint.path) {
    const gateway = adapter ?? (yield* Effect.try({ try: () => makeBillingGateway(bindings), catch: () => unavailable("Stripe is not configured") }))
    const raw = yield* readStripeBody(request)
    const event = yield* gateway.verify(raw, request.headers.get("stripe-signature") ?? "")
    if (!bindings.STRIPE_MONTHLY_PRICE_ID.trim()) return yield* unavailable("Stripe subscription price is not configured")
    yield* projectBillingEvent(event, gateway, bindings.STRIPE_MONTHLY_PRICE_ID)
    return new Response(null, { status: 200 })
  }
  const principal = yield* (yield* AuthIdentity).requireUser(request)
  const sql = yield* SqlClient.SqlClient
  if (pathname === DashboardBillingAssignmentEndpoint.path) {
    const input = yield* decode(DashboardBillingAssignmentEndpoint.body, yield* readJson(request))
    const serverId = input.serverId?.trim() || null
    if (serverId !== null) {
      yield* decode(DecimalSnowflake, serverId)
      yield* (yield* ServerAuthorization).require(request, serverId, {})
    }
    yield* database(sql.withTransaction(Effect.gen(function* () {
      yield* lockUser(principal.userId)
      if (serverId === null) yield* sql`DELETE FROM subscription_roster_assignments WHERE user_id = ${principal.userId}`
      else {
        const saved = yield* sql`INSERT INTO subscription_roster_assignments (user_id, server_id)
          SELECT user_id, ${serverId} FROM subscription_entitlements WHERE user_id = ${principal.userId} AND active = true
          ON CONFLICT (user_id) DO UPDATE SET server_id = EXCLUDED.server_id, updated_at = now() RETURNING user_id`
        if (saved.length === 0) return yield* new Conflict({ message: "An active subscription is required" })
      }
      yield* sql`UPDATE billing_subscriptions SET initial_assignment_applied = true WHERE user_id = ${principal.userId}`
    })))
    return new Response(null, { status: 204 })
  }
  const gateway = adapter ?? (yield* Effect.try({ try: () => makeBillingGateway(bindings), catch: () => unavailable("Stripe is not configured") }))
  let url: string
  if (pathname === DashboardBillingCheckoutEndpoint.path) {
    const input = yield* decode(DashboardBillingCheckoutEndpoint.body, yield* readJson(request))
    const serverId = yield* decode(DecimalSnowflake, input.serverId.trim())
    yield* (yield* ServerAuthorization).require(request, serverId, {})
    const flags = yield* database(sql<{ enabled: boolean; rollout_percentage: number; platforms: string[]; starts_at: Date | null; ends_at: Date | null }>`
      SELECT enabled, rollout_percentage, platforms, starts_at, ends_at FROM admin_feature_flags
      WHERE flag_key = 'subscription_support' AND public_exposure = 'safe'`)
    if (!(yield* resolveCheckoutFlag(flags[0], principal.userId, new Date()))) return yield* unavailable("Subscriptions are not available right now")
    if (!bindings.STRIPE_MONTHLY_PRICE_ID.trim() || !https(bindings.STRIPE_CHECKOUT_SUCCESS_URL) || !https(bindings.STRIPE_CHECKOUT_CANCEL_URL)) {
      return yield* unavailable("Stripe Checkout is not configured")
    }
    url = yield* gateway.checkout(yield* ensureBillingCustomer(principal.userId, gateway), principal.userId, serverId)
  } else {
    const customers = yield* database(sql<{ stripe_customer_id: string }>`SELECT stripe_customer_id FROM billing_customers WHERE user_id = ${principal.userId}`)
    if (!customers[0]) return yield* new NotFound({ message: "No Stripe customer exists for this account" })
    url = yield* gateway.portal(customers[0].stripe_customer_id)
  }
  const encoded = yield* Schema.encodeEffect(DashboardBillingPortalEndpoint.response)({ url }).pipe(Effect.orDie)
  return Response.json(encoded, { headers: { "cache-control": "no-store" } })
})
