import { Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { WorkerBindings } from "../src/environment.js"

const state = vi.hoisted(() => ({ database: vi.fn() }))
vi.mock("../src/database.js", () => ({
  // Deliberately unusable SQL sentinel: liveness must not inspect or call it.
  databaseLayer: () => Layer.succeed(SqlClient.SqlClient, new Proxy({} as SqlClient.SqlClient, {
    get() { state.database(); throw new Error("Unexpected database access in liveness") },
  })),
}))
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

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected provider request in liveness"))
  vi.spyOn(console, "log").mockImplementation(() => undefined)
})
afterEach(() => { vi.restoreAllMocks(); state.database.mockReset() })

const call = async (method: string, authorization?: string, path = "/v2/health") => {
  const tasks: Promise<unknown>[] = []
  const response = await worker.fetch(new Request(`https://api.example.test${path}`, {
    method, headers: { "x-request-id": "health-fixture", ...(authorization === undefined ? {} : { authorization }) },
  }), bindings, {
    waitUntil: (task: Promise<unknown>) => { tasks.push(task) },
    passThroughOnException: () => undefined,
  } as ExecutionContext)
  await Promise.all(tasks)
  expect(state.database).not.toHaveBeenCalled()
  expect(globalThis.fetch).not.toHaveBeenCalled()
  return response
}

describe("public Worker liveness boundary", () => {
  it.each([undefined, "Bearer invalid-token", "Bearer fixture-bot-token"])("returns only the fixed liveness payload for %s without SQL/providers", async (authorization) => {
    const response = await call("GET", authorization)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8")
    expect(response.headers.get("x-request-id")).toBe("health-fixture")
    expect(await response.json()).toEqual({ status: "ok", runtime: "cloudflare-worker", version: "0.1.0-rc.4" })
  })

  it("does not add a POST compatibility route", async () => {
    const response = await call("POST")
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: "not_found" })
  })

  it("does not mount the replaced central Tenor proposal or contact providers", async () => {
    const response = await call("POST", "Bearer fixture-bot-token", "/v2/media/tenor/resolve")
    expect(response.status).toBe(404)
  })
})
