import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { SignJWT } from "jose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { WorkerBindings } from "../src/environment.js"

const state = vi.hoisted(() => ({ query: vi.fn(), observe: vi.fn() }))
vi.mock("../src/database.js", () => ({
  databaseLayer: () => Layer.succeed(SqlClient.SqlClient, state.query as unknown as SqlClient.SqlClient),
}))
vi.mock("../src/proxy-search-observer.js", () => ({ observeProxySearch: state.observe }))
vi.mock("../src/materialized-view-refresher.js", () => ({ MaterializedViewRefresher: class {} }))
vi.mock("../src/shared-links-rate-limiter.js", () => ({ SharedLinksRateLimiter: class {} }))
import worker from "../src/index.js"

const bindings = {
  ACCESS_TEAM_DOMAIN: "fixture.cloudflareaccess.com", ACCESS_AUDIENCE: "fixture-audience",
  JWT_ACCESS_SECRET: "fixture-access-secret", JWT_REFRESH_SECRET: "fixture-refresh-secret", API_BOT_TOKEN: "fixture-bot-token",
  DISCORD_API_ORIGIN: "https://discord.example.test/api/v10",
  TENOR_ALLOWED_HOSTS: "tenor.example.test", TENOR_MEDIA_ALLOWED_HOSTS: "media.example.test",
  NATIVE_TOKEN_AUDIENCE: "native", WEB_TOKEN_AUDIENCE: "web",
  ADMIN_ALLOWED_ORIGINS: "https://admin.example.test", WEB_ALLOWED_ORIGINS: "https://app.example.test",
} as WorkerBindings

const userToken = (audience: string) => new SignJWT({ device: "fixture-device" })
  .setProtectedHeader({ alg: "HS256" }).setSubject("fixture-user").setAudience(audience)
  .setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode(bindings.JWT_ACCESS_SECRET))

const call = async (authorization: string | undefined) => {
  const upstream = vi.fn(async (_request: Request) => new Response("upstream payload", {
    status: 200, headers: { "content-type": "text/plain", etag: '"fixture-etag"' },
  }))
  const tasks: Promise<unknown>[] = []
  const request = new Request("https://api.example.test/proxy/v1/players/%23P0Y?fixture=1", {
    headers: { "x-request-id": "proxy-fixture", ...(authorization === undefined ? {} : { authorization }) },
  })
  const response = await worker.fetch(request, {
    ...bindings, CLASH_PROXY: { fetch: upstream },
  } as unknown as WorkerBindings, {
    waitUntil: (task: Promise<unknown>) => { tasks.push(task) },
    passThroughOnException: () => undefined,
  } as ExecutionContext)
  await Promise.all(tasks)
  return { response, upstream, request, tasks }
}

beforeEach(() => {
  state.query.mockImplementation((strings: TemplateStringsArray) => {
    if (!/SELECT EXISTS\(SELECT 1 FROM auth_users WHERE user_id =/u.test(strings.join("?"))) {
      throw new Error("Unexpected SQL in proxy authentication test")
    }
    return Effect.succeed([{ exists: true }])
  })
  state.observe.mockReturnValue(Effect.void)
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected external provider call"))
  vi.spyOn(console, "log").mockImplementation(() => undefined)
})
afterEach(() => { vi.resetAllMocks(); vi.restoreAllMocks() })

describe("actual proxy entrypoint preserves user authentication", () => {
  it.each(["native", "web"])("forwards a verified %s user and keeps the search observation", async (audience) => {
    const result = await call(`Bearer ${await userToken(audience)}`)
    expect(result.response.status).toBe(200)
    expect(await result.response.text()).toBe("upstream payload")
    expect(result.response.headers.get("etag")).toBe('"fixture-etag"')
    expect(state.query).toHaveBeenCalledTimes(1)
    expect(state.query.mock.calls[0]?.slice(1)).toEqual(["fixture-user"])
    expect(result.upstream).toHaveBeenCalledOnce()
    const forwarded = result.upstream.mock.calls[0]![0]
    expect(forwarded.url).toBe("https://clash-proxy.internal/v1/players/%23P0Y?fixture=1")
    expect(forwarded.headers.has("authorization")).toBe(false)
    expect(state.observe).toHaveBeenCalledExactlyOnceWith(
      { kind: "user", userId: "fixture-user", deviceId: "fixture-device" }, result.request, expect.any(Response),
    )
    // One entrypoint cleanup task plus the retained search observation.
    expect(result.tasks).toHaveLength(2)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it.each([undefined, "Bearer fixture-bot-token", "Bearer invalid-token"])("rejects %s before SQL, upstream or observations", async (authorization) => {
    const result = await call(authorization)
    expect(result.response.status).toBe(401)
    expect(await result.response.json()).toMatchObject({ code: "unauthenticated", request_id: "proxy-fixture" })
    expect(state.query).not.toHaveBeenCalled()
    expect(result.upstream).not.toHaveBeenCalled()
    expect(state.observe).not.toHaveBeenCalled()
    expect(result.tasks).toHaveLength(1)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("rejects a removed user before upstream work", async () => {
    state.query.mockReturnValue(Effect.succeed([{ exists: false }]))
    const result = await call(`Bearer ${await userToken("web")}`)
    expect(result.response.status).toBe(401)
    expect(result.upstream).not.toHaveBeenCalled()
    expect(state.observe).not.toHaveBeenCalled()
  })
})
