import { dashboardEndpoints } from "@clashking/api-contracts"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthIdentity } from "../../src/auth.js"
import { databaseLayer } from "../../src/database.js"
import { cachedDiscordAccess, seedDiscordAccess } from "../../src/discord-access-cache.js"
import { DiscordApi } from "../../src/discord-api.js"
import { DiscordCredentials } from "../../src/discord-credentials.js"
import { makeDiscordRequestCoordination } from "../../src/discord-request-coordination.js"
import { executeDashboardServerCore } from "../../src/dashboard-server-core.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { UpstreamUnavailable } from "../../src/errors.js"
import { ServerAuthorization } from "../../src/server-authorization.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the disposable schema harness")
const bindings = { HYPERDRIVE: { connectionString: process.env.TEST_DATABASE_URL }, DISCORD_API_ORIGIN: "https://discord.example.test/api/v10",
  DISCORD_CLIENT_ID: "application", DISCORD_BOT_TOKEN: "fixture-bot" } as WorkerBindings
const db = databaseLayer(bindings)
const principal = { kind: "user" as const, userId: "100", deviceId: "fixture-device" }
const guild = { id: "200", name: "Family", owner: true, permissions: "8", features: [] }
const claims = { manager: true, roles: [] }
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => Effect.runPromise(effect.pipe(Effect.provide(db), Effect.scoped))
const request = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.succeed([guild]))
const deps = Layer.mergeAll(WorkerEnvironment.layer(bindings),
  Layer.succeed(AuthIdentity, { requireUser: () => Effect.succeed(principal), requireUserOrBot: () => Effect.succeed(principal), requireBot: () => Effect.die("Not a bot") }),
  Layer.succeed(DiscordCredentials, { accessToken: () => Effect.succeed("fixture-oauth") }),
  Layer.succeed(DiscordApi, { request, token: () => Effect.die("Unexpected token grant") }))
const accessLayer = ServerAuthorization.layer.pipe(Layer.provideMerge(deps))
const authorize = (method = "GET", write = false) => run(Effect.gen(function* () {
  const access = yield* ServerAuthorization
  return yield* access.require(new Request("https://api.example.test/v2/server/200/settings", { method }), "200", { section: "settings", write })
}).pipe(Effect.provide(accessLayer)))

beforeEach(async () => {
  request.mockReset().mockImplementation(() => Effect.succeed([guild]))
  await run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`TRUNCATE discord_cache.dashboard_access, discord_cache.request_limits`
  }))
})

describe("shared Discord coordination against authoritative migrations", () => {
  it("reuses a successful read across requests during a Discord outage", async () => {
    expect((await authorize()).manager).toBe(true)
    request.mockImplementation(() => Effect.fail(new UpstreamUnavailable({ cause: "offline", message: "offline" })))
    expect((await authorize()).manager).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each(["POST", "PATCH", "PUT", "DELETE"])("checks %s writes live even with a successful read cache", async (method) => {
    await authorize()
    request.mockImplementation(() => Effect.fail(new UpstreamUnavailable({ cause: "offline", message: "offline" })))
    await expect(authorize(method)).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it("does not treat a GET marked write as a cacheable permission check", async () => {
    await authorize()
    request.mockImplementation(() => Effect.fail(new UpstreamUnavailable({ cause: "offline", message: "offline" })))
    await expect(authorize("GET", true)).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })

  it("rejects a write after live Discord removes management and replaces the old positive cache", async () => {
    await authorize()
    request.mockImplementation(() => Effect.succeed([{ ...guild, owner: false, permissions: "0" }]))
    await expect(authorize("PATCH")).rejects.toMatchObject({ _tag: "Forbidden" })
    await expect(authorize()).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it("reads delegated grants fresh even while Discord role claims are cached", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers (id, name) VALUES ('200', 'Family') ON CONFLICT DO NOTHING`
      yield* sql`INSERT INTO dashboard_role_grants (server_id, role_id, section, access_level)
        VALUES ('200', '300', 'settings', 'view') ON CONFLICT DO NOTHING`
      yield* seedDiscordAccess(bindings, principal, [{ serverId: "200", claims: { manager: false, roles: ["300"] } }])
    }))
    expect((await authorize()).sections.settings).toBe("view")
    await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`DELETE FROM dashboard_role_grants WHERE server_id = '200' AND role_id = '300'`
    }))
    await expect(authorize()).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(request).not.toHaveBeenCalled()
  })

  it("coalesces simultaneous permission lookups from separate request layers", async () => {
    request.mockImplementation(() => Effect.sleep("100 millis").pipe(Effect.as([guild])))
    const results = await Promise.all(Array.from({ length: 8 }, () => authorize()))
    expect(results.every((result) => result.manager)).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it("seeds read authorization from the real guild-list operation", async () => {
    request.mockImplementation((path) => Effect.succeed(path.startsWith("/users/@me") ? [guild] : guild))
    await run(executeDashboardServerCore({ bindings, endpoint: dashboardEndpoints.dashboardGuilds, principal,
      request: new Request("https://api.example.test/v2/guilds"), path: {}, query: {}, body: {},
    }).pipe(Effect.provide(accessLayer)))
    expect(request).toHaveBeenCalledTimes(2)
    request.mockImplementation(() => Effect.fail(new UpstreamUnavailable({ cause: "offline", message: "offline" })))
    expect((await authorize()).manager).toBe(true)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it("rejects expired claims and never falls back to them on a provider error", async () => {
    await authorize()
    await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE discord_cache.dashboard_access SET observed_at = clock_timestamp() - interval '61 seconds', expires_at = clock_timestamp() - interval '1 second'`
    }))
    request.mockImplementation(() => Effect.fail(new UpstreamUnavailable({ cause: "offline", message: "offline" })))
    await expect(authorize()).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })

  it("isolates devices and providers and discards malformed cached claims", async () => {
    const live = vi.fn(() => Effect.succeed(claims))
    await run(cachedDiscordAccess(bindings, principal, "200", Effect.suspend(live), false))
    await run(cachedDiscordAccess(bindings, { ...principal, deviceId: "other" }, "200", Effect.suspend(live), false))
    await run(cachedDiscordAccess({ ...bindings, DISCORD_BOT_TOKEN: "different-bot" }, principal, "200", Effect.suspend(live), false))
    expect(live).toHaveBeenCalledTimes(3)
    await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE discord_cache.dashboard_access SET claims = '{"manager":"yes","roles":[]}'::jsonb`
    }))
    await run(cachedDiscordAccess(bindings, principal, "200", Effect.suspend(live), false))
    expect(live).toHaveBeenCalledTimes(4)
  })

  it("does not allow an older in-flight lookup to overwrite a newer seeded observation", async () => {
    let entered!: () => void
    const ready = new Promise<void>((resolve) => { entered = resolve })
    let finish!: () => void
    const released = new Promise<void>((resolve) => { finish = resolve })
    const first = run(cachedDiscordAccess(bindings, principal, "200", Effect.promise(async () => { entered(); await released; return claims }), false))
    await ready
    await run(seedDiscordAccess(bindings, principal, [{ serverId: "200", claims: { manager: false, roles: [] } }]))
    finish()
    await first
    expect(await run(cachedDiscordAccess(bindings, principal, "200", Effect.die("Must use newer claims"), false))).toEqual({ manager: false, roles: [] })
  })

  it("reserves spaced OAuth calls across independent request coordinators", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const make = () => makeDiscordRequestCoordination(sql)(new Request("https://discord.example.test/api/v10/users/@me/guilds", { headers: { authorization: "Bearer fixture" } }))
    const times = yield* Effect.forEach([make(), make(), make()], (item) => item.before.pipe(Effect.map(() => Date.now())), { concurrency: 3 })
    const ordered = [...times].sort((a, b) => a - b)
    expect(ordered[1]! - ordered[0]!).toBeGreaterThanOrEqual(400)
    expect(ordered[2]! - ordered[1]!).toBeGreaterThanOrEqual(400)
  })))

  it("shares a global429 cooldown across routes but not different credentials", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const make = (path: string, credential = "Bot fixture") => makeDiscordRequestCoordination(sql)(new Request(`https://discord.example.test/api/v10${path}`, { headers: { authorization: credential } }))
    yield* make("/guilds/200").cooldown(60_000, true)
    const failed = yield* make("/guilds/300/roles").before.pipe(Effect.result)
    expect(failed._tag).toBe("Failure")
    if (failed._tag === "Failure") expect(failed.failure._tag).toBe("RateLimited")
    yield* make("/guilds/300/roles", "Bot different").before
  })))
})
