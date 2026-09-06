import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { AuthIdentity } from "./auth.js"
import { BotAdjacentStore, botAdjacentRuntimeRoutes, dispatchBotAdjacentRuntime, refreshTrackingTargets } from "./bot-adjacent-runtime.js"
import type { WorkerBindings } from "./environment.js"
import { Forbidden, UpstreamUnavailable } from "./errors.js"
import { ServerAuthorization } from "./server-authorization.js"
import { DiscordApi } from "./discord-api.js"
import { WorkerEnvironment } from "./environment.js"
import { SharedLinksLimiter } from "./shared-links-limiter.js"

const bindings = {} as WorkerBindings
const serverId = "123456789012345678"
const userId = "987654321098765432"
const baseId = "019c95ab-f582-79a6-a309-6ea9202878cd"
const manyTags = Array.from({ length: 201 }, (_, index) => `#P${index.toString(4).padStart(4, "0").replace(/[123]/gu, (digit) => ({ "1": "2", "2": "8", "3": "9" })[digit]!)}`)
const unusedSql = new Proxy(() => { throw new Error("Unexpected SQL call in dispatcher test") }, {
  get: () => { throw new Error("Unexpected SQL access in dispatcher test") },
}) as unknown as SqlClient.SqlClient

const testLayer = (store: Partial<BotAdjacentStore["Service"]> = {}, require = vi.fn(() => Effect.succeed({
  manager: true, principal: { kind: "bot" as const }, sections: {},
}))) => Layer.mergeAll(
  Layer.mock(BotAdjacentStore, store),
  Layer.mock(AuthIdentity, {
    requireBot: () => Effect.succeed({ kind: "bot" as const }),
    requireUser: () => Effect.succeed({ kind: "user" as const, userId }),
    requireUserOrBot: () => Effect.succeed({ kind: "user" as const, userId }),
  }),
  Layer.mock(ServerAuthorization, { require }),
  Layer.succeed(SqlClient.SqlClient, unusedSql),
)

describe("Bot-adjacent runtime", () => {
  it.each([false, true])("cancels an oversized shared lookup body before the store (declared: %s)", async (declared) => {
    const cancel = vi.fn()
    const sharedLinksLookup = vi.fn(() => Effect.succeed({ items: [] }))
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(16_385)) }, cancel,
    })
    const request = new Request("https://api.clashk.ing/v2/links/shared", {
      method: "POST", body, duplex: "half",
      headers: { "content-type": "application/json", ...(declared ? { "content-length": "16385" } : {}) },
    } as RequestInit)
    await expect(Effect.runPromise(dispatchBotAdjacentRuntime(request, bindings).pipe(
      Effect.provide(testLayer({ sharedLinksLookup })),
    ))).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
    expect(cancel).toHaveBeenCalledOnce()
    expect(sharedLinksLookup).not.toHaveBeenCalled()
  })

  it("lists nine canonical operations and does not revive the old clan-list alias", async () => {
    expect(botAdjacentRuntimeRoutes).toHaveLength(9)
    expect(new Set(botAdjacentRuntimeRoutes.map(({ method, path }) => `${method} ${path}`)).size).toBe(9)
    const response = await Effect.runPromise(dispatchBotAdjacentRuntime(
      new Request(`https://api.clashk.ing/v2/link/server/${serverId}/clan/list`), bindings,
    ).pipe(Effect.provide(testLayer())))
    expect(response).toBeUndefined()
  })

  it("authorizes the links section and preserves high Discord IDs in server-link creation", async () => {
    const createServerLink = vi.fn((_serverId: string, tag: string, actor: string) => Effect.succeed({
      message: "Link added successfully", player_tag: tag, user_id: actor,
    }))
    const require = vi.fn(() => Effect.succeed({ manager: true, principal: { kind: "bot" as const }, sections: {} }))
    const request = new Request(`https://api.clashk.ing/v2/links/server/${serverId}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerTag: "poy", userID: userId }),
    })
    const response = await Effect.runPromise(dispatchBotAdjacentRuntime(request, bindings).pipe(Effect.provide(testLayer({ createServerLink }, require))))
    expect(require).toHaveBeenCalledWith(request, serverId, { section: "links", write: true })
    expect(createServerLink).toHaveBeenCalledWith(serverId, "#P0Y", userId, undefined)
    await expect(response?.json()).resolves.toMatchObject({ user_id: userId })
  })

  it("forwards the supplied player token after server links authorization", async () => {
    const createServerLink = vi.fn(() => Effect.succeed({ message: "Linked", player_tag: "#P0Y", user_id: userId }))
    const request = new Request(`https://api.clashk.ing/v2/links/server/${serverId}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ playerTag: "poy", userID: userId, api_token: " valid " }),
    })
    await Effect.runPromise(dispatchBotAdjacentRuntime(request, bindings).pipe(Effect.provide(testLayer({ createServerLink }))))
    expect(createServerLink).toHaveBeenCalledWith(serverId, "#P0Y", userId, " valid ")
  })

  it.each([null, 123, "x".repeat(129)])("rejects malformed server-link token transport before the store", async (api_token) => {
    const createServerLink = vi.fn(() => Effect.die("Invalid token reached the store"))
    const request = new Request(`https://api.clashk.ing/v2/links/server/${serverId}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ playerTag: "poy", userID: userId, api_token }),
    })
    await expect(Effect.runPromise(dispatchBotAdjacentRuntime(request, bindings).pipe(Effect.provide(testLayer({ createServerLink })))))
      .rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(createServerLink).not.toHaveBeenCalled()
  })

  it("rejects a login update for another user before mutation", async () => {
    const updateLinkLastLogin = vi.fn(() => Effect.succeed({ timestamp: "2026-09-03T00:00:00.000Z", updated_count: 0 }))
    const error = await Effect.runPromise(dispatchBotAdjacentRuntime(
      new Request("https://api.clashk.ing/v2/links/someone-else/last-login", { method: "PATCH" }), bindings,
    ).pipe(Effect.provide(testLayer({ updateLinkLastLogin })), Effect.flip))
    expect(error).toBeInstanceOf(Forbidden)
    expect(updateLinkLastLogin).not.toHaveBeenCalled()
  })

  it("records a base vote without converting the voter ID to a number", async () => {
    const upsertBaseVote = vi.fn((id: string, voterId: string, direction: "up" | "down") => Effect.succeed({ baseId: id, voterId, direction }))
    const response = await Effect.runPromise(dispatchBotAdjacentRuntime(new Request(
      `https://api.clashk.ing/v2/bases/${baseId}/votes/${userId}`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ direction: "up" }),
      },
    ), bindings).pipe(Effect.provide(testLayer({ upsertBaseVote }))))
    expect(upsertBaseVote).toHaveBeenCalledWith(baseId, userId, "up")
    await expect(response?.json()).resolves.toEqual({ baseId, voterId: userId, direction: "up" })
  })

  it("normalizes and deduplicates verified tags before the owned-account store check", async () => {
    const refreshVerifiedPlayerTracking = vi.fn((_userId: string, tags: readonly string[]) => Effect.succeed({ player_tags: tags, expires_at: "2026-09-10T00:00:00.000Z" }))
    await Effect.runPromise(dispatchBotAdjacentRuntime(new Request("https://api.clashk.ing/v2/tracking/verified-players", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ player_tags: ["poy", "#P0Y"] }),
    }), bindings).pipe(Effect.provide(testLayer({ refreshVerifiedPlayerTracking }))))
    expect(refreshVerifiedPlayerTracking).toHaveBeenCalledWith(userId, ["#P0Y"])
  })

  it("uses the exact authenticated Tracking contract and propagates cache failure", async () => {
    const fetch = vi.fn(async (_request: Request) => Response.json({ player_tags: ["#P0Y"], expires_at: "2026-09-10T00:00:00.000Z" }))
    const trackingBindings = { API_BOT_TOKEN: "secret", TRACKING: { fetch } } as unknown as WorkerBindings
    await expect(Effect.runPromise(refreshTrackingTargets(trackingBindings, ["#P0Y"]))).resolves.toEqual({
      player_tags: ["#P0Y"], expires_at: "2026-09-10T00:00:00.000Z",
    })
    const request = fetch.mock.calls[0]?.[0]
    expect(request?.url).toBe("http://tracking.internal/internal/verified-players/refresh")
    expect(request?.headers.get("authorization")).toBe("Bearer secret")
    await expect(request?.json()).resolves.toEqual({ player_tags: ["#P0Y"] })
    fetch.mockResolvedValueOnce(new Response(null, { status: 503 }))
    const error = await Effect.runPromise(refreshTrackingTargets(trackingBindings, ["#P0Y"]).pipe(Effect.flip))
    expect(error).toBeInstanceOf(UpstreamUnavailable)
  })

  it("allows more than 100 requested tags through the owned-account dispatcher", async () => {
    const refreshVerifiedPlayerTracking = vi.fn((_userId: string, tags: readonly string[]) => Effect.succeed({ player_tags: tags, expires_at: "2026-09-10T00:00:00.000Z" }))
    const response = await Effect.runPromise(dispatchBotAdjacentRuntime(new Request("https://api.clashk.ing/v2/tracking/verified-players", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ player_tags: manyTags }),
    }), bindings).pipe(Effect.provide(testLayer({ refreshVerifiedPlayerTracking }))))
    expect(response?.status).toBe(200)
    expect(refreshVerifiedPlayerTracking).toHaveBeenCalledWith(userId, manyTags)
  })

  it("batches all targets in order and reports the earliest acknowledged expiry", async () => {
    const batches: string[][] = []
    const fetch = vi.fn(async (request: Request) => {
      const body = await request.json() as { player_tags: string[] }
      batches.push(body.player_tags)
      return Response.json({ ...body, expires_at: ["2026-09-11T00:00:00Z", "2026-09-10T00:00:00Z", "2026-09-12T00:00:00Z"][batches.length - 1] })
    })
    await expect(Effect.runPromise(refreshTrackingTargets({ API_BOT_TOKEN: "secret", TRACKING: { fetch } } as unknown as WorkerBindings, manyTags)))
      .resolves.toEqual({ player_tags: manyTags, expires_at: "2026-09-10T00:00:00.000Z" })
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 1])
    expect(batches.flat()).toEqual(manyTags)
  })

  it.each([false, true])("keeps the SQL ownership check and allows every returned verified account (explicit: %s)", async (explicit) => {
    const unsafe = vi.fn((_query: string, _parameters: readonly unknown[]) => Effect.succeed(manyTags.map((tag) => ({ tag }))))
    const sql = Object.assign(() => Effect.die("Unexpected query"), { unsafe }) as unknown as SqlClient.SqlClient
    const fetch = vi.fn(async (request: Request) => Response.json({ ...await request.json() as object, expires_at: "2026-09-11T00:00:00Z" }))
    const dependencies = Layer.mergeAll(
      Layer.succeed(SqlClient.SqlClient, sql),
      Layer.succeed(WorkerEnvironment, { API_BOT_TOKEN: "secret", TRACKING: { fetch } } as unknown as WorkerBindings),
      Layer.mock(DiscordApi, {}), Layer.mock(SharedLinksLimiter, {}),
    )
    const tags = explicit ? manyTags : []
    const response = await Effect.runPromise(Effect.flatMap(BotAdjacentStore, (store) => store.refreshVerifiedPlayerTracking(userId, tags)).pipe(
      Effect.provide(BotAdjacentStore.layer.pipe(Layer.provide(dependencies))),
    ))
    expect(response.player_tags).toEqual(manyTags)
    expect(unsafe).toHaveBeenCalledWith(expect.stringContaining("user_id = $1 AND is_verified = true"), [userId, tags])
    expect(unsafe.mock.calls[0]?.[0]).toContain("ORDER BY tag")
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it("rejects an unowned requested tag before any private cache write", async () => {
    const sql = Object.assign(() => Effect.die("Unexpected query"), { unsafe: () => Effect.succeed([]) }) as unknown as SqlClient.SqlClient
    const fetch = vi.fn()
    const dependencies = Layer.mergeAll(
      Layer.succeed(SqlClient.SqlClient, sql),
      Layer.succeed(WorkerEnvironment, { API_BOT_TOKEN: "secret", TRACKING: { fetch } } as unknown as WorkerBindings),
      Layer.mock(DiscordApi, {}), Layer.mock(SharedLinksLimiter, {}),
    )
    await expect(Effect.runPromise(Effect.flatMap(BotAdjacentStore, (store) => store.refreshVerifiedPlayerTracking(userId, ["#P0Y"])).pipe(
      Effect.provide(BotAdjacentStore.layer.pipe(Layer.provide(dependencies))),
    ))).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(["status", "wrong order", "missing tag", "invalid expiry", "invalid JSON"])("fails the whole refresh without a third batch when the second has %s", async (failure) => {
    let calls = 0
    const fetch = vi.fn(async (request: Request) => {
      const body = await request.json() as { player_tags: string[] }
      calls++
      if (calls === 2) {
        if (failure === "status") return new Response(null, { status: 503 })
        if (failure === "invalid JSON") return new Response("broken")
        if (failure === "wrong order") body.player_tags.reverse()
        if (failure === "missing tag") body.player_tags.pop()
      }
      return Response.json({ ...body, expires_at: calls === 2 && failure === "invalid expiry" ? "invalid" : "2026-09-11T00:00:00Z" })
    })
    await expect(Effect.runPromise(refreshTrackingTargets({ API_BOT_TOKEN: "secret", TRACKING: { fetch } } as unknown as WorkerBindings, manyTags)))
      .rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("does not call or require the private service for an empty refresh", async () => {
    const started = Date.now()
    const fetch = vi.fn()
    const response = await Effect.runPromise(refreshTrackingTargets({ TRACKING: { fetch } } as unknown as WorkerBindings, []))
    expect(response.player_tags).toEqual([])
    expect(Date.parse(response.expires_at)).toBeGreaterThanOrEqual(started + 7 * 86_400_000)
    expect(Date.parse(response.expires_at)).toBeLessThanOrEqual(Date.now() + 7 * 86_400_000)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("bounds a hung private batch and aborts its request without claiming success", async () => {
    let signal: AbortSignal | undefined
    const fetch = vi.fn((request: Request) => { signal = request.signal; return new Promise<Response>(() => {}) })
    await expect(Effect.runPromise(refreshTrackingTargets({ API_BOT_TOKEN: "secret", TRACKING: { fetch } } as unknown as WorkerBindings, manyTags)))
      .rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(fetch).toHaveBeenCalledOnce()
    expect(signal?.aborted).toBe(true)
  })
})
