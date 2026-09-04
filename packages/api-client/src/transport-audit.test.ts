import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createApiClient, serviceBindingTransport, withUnauthorizedRefresh } from "./index.js"

const endpoint = defineEndpoint({
  auth: "user", body: NoBody, bodyMode: "none", method: "POST", operationId: "auditMutation",
  path: "/v2/audit-mutation", pathParams: NoPathParams, query: NoQuery,
  response: Schema.Struct({ value: Schema.String }), responseMode: "json", successStatus: 200,
  summary: "Independent transport audit fixture",
  errors: [{ status: 409, body: Schema.Struct({ reason: Schema.String }) }],
})
const input = { path: {}, query: {}, body: {} }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe("independent transport audit", () => {
  it("does not replay when refresh rejects without a rejection value", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 401 }))
    const client = createApiClient({ transport: withUnauthorizedRefresh({
      transport: serviceBindingTransport({ fetch }), refresh: () => Promise.reject(),
    }) })
    await expect(Effect.runPromise(client.execute(endpoint, input))).rejects.toMatchObject({ _tag: "TransportError" })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("never retries an unsafe mutation after a network failure or server error", async () => {
    for (const failure of ["network", "server"] as const) {
      const fetch = vi.fn(async () => {
        if (failure === "network") throw new Error("lost response after commit")
        return Response.json({ error: "server" }, { status: 503 })
      })
      const refresh = vi.fn(async () => undefined)
      const client = createApiClient({ transport: withUnauthorizedRefresh({ transport: serviceBindingTransport({ fetch }), refresh }) })
      await expect(Effect.runPromise(client.execute(endpoint, input))).rejects.toMatchObject({
        _tag: failure === "network" ? "TransportError" : "ApiResponseError",
      })
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(refresh).not.toHaveBeenCalled()
    }
  })

  it("keeps concurrent refreshes and replay tokens isolated between clients", async () => {
    const seen: Record<string, (string | null)[]> = { alice: [], bob: [] }
    const clients = ["alice", "bob"].map((user) => {
      let fresh = false
      return createApiClient({ auth: { bearerToken: `${user}-old` }, transport: withUnauthorizedRefresh({
        transport: serviceBindingTransport({ fetch: async (request) => {
          seen[user]!.push(request.headers.get("authorization"))
          return fresh ? Response.json({ value: user }) : new Response(null, { status: 401 })
        } }),
        refresh: async () => { await Promise.resolve(); fresh = true },
        authorizeReplay: (request) => {
          const headers = new Headers(request.headers)
          headers.set("authorization", `Bearer ${user}-new`)
          return new Request(request, { headers })
        },
      }) })
    })
    const results = await Promise.all(clients.map((client) => Effect.runPromise(client.execute(endpoint, input))))
    expect(results).toEqual([{ value: "alice" }, { value: "bob" }])
    expect(seen).toEqual({ alice: ["Bearer alice-old", "Bearer alice-new"], bob: ["Bearer bob-old", "Bearer bob-new"] })
  })

  it("preserves a status-specific failure after a single authorized replay", async () => {
    let count = 0
    const client = createApiClient({ transport: withUnauthorizedRefresh({
      transport: serviceBindingTransport({ fetch: async () => ++count === 1
        ? new Response(null, { status: 401 })
        : Response.json({ reason: "conflict" }, { status: 409, headers: { "x-request-id": "audit-id" } }),
      }), refresh: async () => undefined,
    }) })
    expect(await Effect.runPromise(client.executeStatus(endpoint, input)))
      .toEqual({ ok: false, status: 409, body: { reason: "conflict" }, requestId: "audit-id" })
    expect(count).toBe(2)
  })

  it.each(["timeout", "caller"] as const)("settles %s cancellation while shared refresh is still pending", async (kind) => {
    vi.useFakeTimers()
    let release!: () => void
    let started!: () => void
    const refreshStarted = new Promise<void>((resolve) => { started = resolve })
    const refreshPending = new Promise<void>((resolve) => { release = resolve })
    const caller = new AbortController()
    let settled = false
    const fetch = vi.fn(async () => new Response(null, { status: 401 }))
    const client = createApiClient({ transport: withUnauthorizedRefresh({
      transport: serviceBindingTransport({ fetch }),
      refresh: async () => { started(); await refreshPending },
    }) })
    const pending = Effect.runPromise(client.execute(endpoint, input, {
      signal: caller.signal, ...(kind === "timeout" ? { timeoutMs: 25 } : {}),
    })).then(() => { settled = true }, () => { settled = true })
    await refreshStarted
    try {
      if (kind === "caller") caller.abort(new Error("Caller canceled"))
      await vi.advanceTimersByTimeAsync(30)
      expect(settled).toBe(true)
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      release()
      await pending
    }
  })
})
