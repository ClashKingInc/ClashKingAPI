import { Effect } from "effect"
import Stripe from "stripe"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeBillingGateway, readStripeBody } from "./billing-runtime.js"

const bindings = { STRIPE_RESTRICTED_KEY: ["rk", "test", "local_fixture_only"].join("_"), STRIPE_WEBHOOK_SECRET: "local-signature-fixture",
  STRIPE_MONTHLY_PRICE_ID: "price_monthly", STRIPE_CHECKOUT_SUCCESS_URL: "https://dashboard.example.test/success",
  STRIPE_CHECKOUT_CANCEL_URL: "https://dashboard.example.test/cancel", STRIPE_PORTAL_RETURN_URL: "https://dashboard.example.test/account" }
const operationId = "019f5400-1111-7111-8111-123456789abc"
const customer = { id: "cus_fixture", livemode: false, metadata: { clashking_user_id: "user", clashking_operation_id: operationId } }
const subscription = { id: "sub_fixture", customer: customer.id, livemode: false, created: 100, status: "active", cancel_at_period_end: false,
  metadata: {}, items: { has_more: false, data: [{ price: { id: "price_monthly" }, current_period_end: 1900000000 }] } }
beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real provider calls forbidden") })))
afterEach(() => vi.unstubAllGlobals())
const respond = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } })

describe("Stripe signature and raw-body boundary", () => {
  it("verifies the exact signed payload and rejects modified, stale, missing, wrong-mode and BOM-prefixed bytes", async () => {
    const gateway = makeBillingGateway(bindings)
    const stripe = new Stripe(bindings.STRIPE_RESTRICTED_KEY)
    const payload = JSON.stringify({ id: "evt_test", type: "customer.subscription.updated", livemode: false, data: { object: subscription } })
    const header = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: bindings.STRIPE_WEBHOOK_SECRET,
      cryptoProvider: Stripe.createSubtleCryptoProvider() })
    const encode = (value: string) => new TextEncoder().encode(value)
    expect(await Effect.runPromise(gateway.verify(encode(payload), header))).toMatchObject({ id: "evt_test", livemode: false })
    for (const raw of [encode(`${payload} `), encode(`\uFEFF${payload}`), new Uint8Array([0xff, ...encode(payload)])]) {
      await expect(Effect.runPromise(gateway.verify(raw, header))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
    await expect(Effect.runPromise(gateway.verify(encode(payload), ""))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    const stale = await stripe.webhooks.generateTestHeaderStringAsync({ payload, secret: bindings.STRIPE_WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 600, cryptoProvider: Stripe.createSubtleCryptoProvider() })
    await expect(Effect.runPromise(gateway.verify(encode(payload), stale))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    const livePayload = payload.replace('"livemode":false', '"livemode":true')
    const liveHeader = await stripe.webhooks.generateTestHeaderStringAsync({ payload: livePayload, secret: bindings.STRIPE_WEBHOOK_SECRET,
      cryptoProvider: Stripe.createSubtleCryptoProvider() })
    await expect(Effect.runPromise(gateway.verify(encode(livePayload), liveHeader))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(fetch).not.toHaveBeenCalled()
  })
  it("retains byte identity while capping undeclared streamed bodies", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])
    const request = new Request("https://api.example.test", { method: "POST", body: bytes })
    expect(await Effect.runPromise(readStripeBody(request))).toEqual(bytes)
    const cancel = vi.fn()
    const tooLarge = new Request("https://api.example.test", { method: "POST", duplex: "half", body: new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)) }, cancel,
    }) } as RequestInit)
    await expect(Effect.runPromise(readStripeBody(tooLarge))).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
    expect(cancel).toHaveBeenCalledOnce()
  })
})

describe("Worker Stripe adapter with fake HTTP only", () => {
  it("creates customers using durable operation metadata and a stable Stripe idempotency key", async () => {
    const requests: Request[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { requests.push(new Request(input, init)); return respond(customer) }))
    const result = await Effect.runPromise(makeBillingGateway(bindings).createCustomer("user", operationId))
    expect(result.id).toBe(customer.id)
    expect(requests[0]?.headers.get("idempotency-key")).toBe(`clashking-customer-${operationId}`)
    expect(new URLSearchParams(await requests[0]!.text()).get("metadata[clashking_operation_id]")).toBe(operationId)
    expect(requests[0]?.headers.get("stripe-version")).toBe("2026-08-26.dahlia")
  })
  it("refuses ambiguous recovery without creating another customer", async () => {
    for (const data of [[], [customer, { ...customer, id: "cus_other" }]]) {
      const network = vi.fn((_input: RequestInfo | URL) => Promise.resolve(respond({ data, has_more: false })))
      vi.stubGlobal("fetch", network)
      await expect(Effect.runPromise(makeBillingGateway(bindings).recoverCustomer("user", operationId))).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
      expect(network).toHaveBeenCalledOnce()
      expect(String(network.mock.calls[0]?.[0])).toContain("/customers/search")
    }
  })
  it("rejects mismatched customer ownership or mode", async () => {
    for (const value of [{ ...customer, livemode: true }, { ...customer, metadata: {} }]) {
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(respond(value))))
      await expect(Effect.runPromise(makeBillingGateway(bindings).createCustomer("user", operationId))).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    }
  })
  it("uses Checkout subscriptions and server-controlled price/return URLs without fixing payment methods", async () => {
    let request: Request | undefined
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      request = new Request(input, init); return respond({ url: "https://checkout.stripe.com/c/pay/test", livemode: false })
    }))
    await Effect.runPromise(makeBillingGateway(bindings).checkout(customer.id, "user", "123456789012345678"))
    const form = new URLSearchParams(await request!.text())
    expect(form.get("mode")).toBe("subscription")
    expect(form.get("line_items[0][price]")).toBe(bindings.STRIPE_MONTHLY_PRICE_ID)
    expect(form.get("client_reference_id")).toBe("user")
    expect(form.get("subscription_data[metadata][clashking_server_id]")).toBe("123456789012345678")
    expect(form.get("integration_identifier")).toMatch(/^clashking-dashboard-[a-z]{8}$/u)
    expect([...form.keys()].some((key) => key.startsWith("payment_method_types") || key.startsWith("automatic_tax"))).toBe(false)
  })
  it("fully paginates current subscriptions and fails on incomplete items or wrong customer", async () => {
    const urls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input)); return respond({ data: [{ ...subscription, id: urls.length === 1 ? "sub_first" : "sub_second" }], has_more: urls.length === 1 })
    }))
    expect(await Effect.runPromise(makeBillingGateway(bindings).subscriptions(customer.id))).toHaveLength(2)
    expect(urls[1]).toContain("starting_after=sub_first")
    for (const value of [{ ...subscription, customer: "cus_other" }, { ...subscription, items: { ...subscription.items, has_more: true } }]) {
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(respond({ data: [value], has_more: false }))))
      await expect(Effect.runPromise(makeBillingGateway(bindings).subscriptions(customer.id))).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    }
  })
})
