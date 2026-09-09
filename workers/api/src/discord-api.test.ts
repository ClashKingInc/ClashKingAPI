import { Effect, Layer } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DiscordApi } from "./discord-api.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"

const layer = DiscordApi.layer.pipe(Layer.provide(WorkerEnvironment.layer({
  DISCORD_API_ORIGIN: "https://discord.com/api/v10",
  DISCORD_BOT_TOKEN: "bot-secret",
} as WorkerBindings)))

const run = (path: string, options?: Parameters<DiscordApi["Service"]["request"]>[1]) =>
  Effect.runPromise(Effect.gen(function* () {
    const discord = yield* DiscordApi
    return yield* discord.request(path, options)
  }).pipe(Effect.provide(layer)))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("Discord API service", () => {
  it.each([
    [400, "InvalidRequest"], [401, "Forbidden"], [403, "Forbidden"],
    [404, "NotFound"], [500, "UpstreamUnavailable"], [503, "UpstreamUnavailable"],
  ] as const)("releases an unread HTTP %s body before returning %s", async (status, tag) => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 })
    const fetcher = vi.fn().mockResolvedValue(new Response(body, { status }))
    vi.stubGlobal("fetch", fetcher)
    await expect(run("/users/@me")).rejects.toMatchObject({ _tag: tag })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("preserves the typed provider error if cancelling its body also fails", async () => {
    const cancel = vi.fn(async () => { throw new Error("Response cleanup failed") })
    const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 403 })))
    await expect(run("/users/@me")).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it("keeps high snowflakes lossless and uses bot authentication", async () => {
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.url).toBe("https://discord.com/api/v10/guilds/123456789012345678/roles")
      expect(request.headers.get("authorization")).toBe("Bot bot-secret")
      return Response.json([{ id: "123456789012345679" }])
    })
    vi.stubGlobal("fetch", fetcher)
    await expect(run("/guilds/123456789012345678/roles")).resolves.toEqual([{ id: "123456789012345679" }])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("uses OAuth bearer credentials only when explicitly supplied", async () => {
    vi.stubGlobal("fetch", vi.fn(async (request: Request) => {
      expect(request.headers.get("authorization")).toBe("Bearer user-token")
      return Response.json({ id: "123456789012345678" })
    }))
    await expect(run("/users/@me", { oauthAccessToken: "user-token" })).resolves.toEqual({ id: "123456789012345678" })
  })

  it("retries a rate limit only once and preserves the request body", async () => {
    const bodies: string[] = []
    const fetcher = vi.fn(async (request: Request) => {
      bodies.push(await request.text())
      return bodies.length === 1
        ? new Response(null, { status: 429, headers: { "retry-after": "0" } })
        : Response.json({ id: "123456789012345678" })
    })
    vi.stubGlobal("fetch", fetcher)
    await run("/guilds/123456789012345678/channels", { method: "POST", body: { name: "Stats", type: 2 } })
    expect(bodies).toEqual(['{"name":"Stats","type":2}', '{"name":"Stats","type":2}'])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("rejects absolute or protocol-relative paths before a network request", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    await expect(run("https://example.com/")).rejects.toThrow()
    await expect(run("//example.com/")).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("does not retry before Discord's full Retry-After delay", async () => {
    vi.useFakeTimers()
    const first = Response.json({ retry_after: 3 }, { status: 429, headers: { "retry-after": "3" } })
    const fetcher = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(Response.json({ ok: true }))
    vi.stubGlobal("fetch", fetcher)
    const pending = run("/users/@me")
    await vi.advanceTimersByTimeAsync(0)
    expect(first.bodyUsed).toBe(true)
    await vi.advanceTimersByTimeAsync(2_999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toEqual({ ok: true })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("returns a typed rate limit when the delay exceeds the request budget", async () => {
    const first = Response.json({ retry_after: 60 }, { status: 429, headers: { "retry-after": "60" } })
    const fetcher = vi.fn().mockResolvedValue(first)
    vi.stubGlobal("fetch", fetcher)
    await expect(run("/users/@me")).rejects.toMatchObject({ _tag: "RateLimited", retryAfterSeconds: 60 })
    expect(first.bodyUsed).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
