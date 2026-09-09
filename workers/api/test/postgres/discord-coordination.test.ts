import { dashboardEndpoints } from "@clashking/api-contracts"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthIdentity } from "../../src/auth.js"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import { DiscordCredentials } from "../../src/discord-credentials.js"
import { executeDashboardServerCore } from "../../src/dashboard-server-core.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { UpstreamUnavailable } from "../../src/errors.js"
import { ServerAuthorization } from "../../src/server-authorization.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the disposable schema harness")
const bindings = { HYPERDRIVE: { connectionString: process.env.TEST_DATABASE_URL }, DISCORD_API_ORIGIN: "https://discord.example.test/api/v10",
  DISCORD_CLIENT_ID: "999", DISCORD_BOT_TOKEN: "fixture-bot" } as WorkerBindings
const db = databaseLayer(bindings)
const principal = { kind: "user" as const, userId: "100", deviceId: "fixture-device" }
const guild = { id: "200", name: "Family", owner: true, permissions: "8", features: [] }
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => Effect.runPromise(effect.pipe(Effect.provide(db), Effect.scoped))
const request = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.succeed([guild]))
const deps = Layer.mergeAll(WorkerEnvironment.layer(bindings),
  Layer.succeed(AuthIdentity, { requireUser: () => Effect.succeed(principal), requireUserOrBot: () => Effect.succeed(principal), requireBot: () => Effect.die("Not a bot") }),
  Layer.succeed(DiscordCredentials, { accessToken: () => Effect.succeed("fixture-oauth") }),
  Layer.succeed(DiscordApi, { request, token: () => Effect.die("Unexpected token grant") }))
const accessLayer = ServerAuthorization.layer.pipe(Layer.provideMerge(deps))
const authorize = (method = "GET", write = false, freshOauthManager = false) => run(Effect.gen(function* () {
  const access = yield* ServerAuthorization
  return yield* access.require(new Request("https://api.example.test/v2/server/200/settings", { method }), "200", { section: "settings", write, freshOauthManager })
}).pipe(Effect.provide(accessLayer)))

const setGatewayAccess = (input: {
  readonly ownerId?: string
  readonly membersComplete?: boolean
  readonly roles?: ReadonlyArray<string>
  readonly rolePermissions?: ReadonlyArray<string>
  readonly generation?: string
}) => run(Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const generation = input.generation ?? "11111111-1111-4111-8111-111111111111"
  yield* sql`UPDATE discord_cache.gateway_shards SET generation = ${generation}::uuid, healthy = true, heartbeat_at = clock_timestamp()`
  yield* sql`UPDATE discord_cache.guilds SET data = ${JSON.stringify({ owner_id: input.ownerId ?? "100" })}::jsonb,
    generation = ${generation}::uuid, available = true, metadata_complete = true, members_complete = ${input.membersComplete ?? true}`
  yield* sql`DELETE FROM discord_cache.members WHERE guild_id = '200'`
  yield* sql`DELETE FROM discord_cache.roles WHERE guild_id = '200'`
  if ((input.roles?.length ?? 0) > 0) {
    yield* sql`INSERT INTO discord_cache.members (guild_id, user_id, data)
      VALUES ('200', '100', ${JSON.stringify({ roles: input.roles })}::jsonb)`
  }
  for (const [index, permissions] of (input.rolePermissions ?? []).entries()) {
    const roleId = input.roles?.[index] ?? `${300 + index}`
    yield* sql`INSERT INTO discord_cache.roles (guild_id, id, data)
      VALUES ('200', ${roleId}, ${JSON.stringify({ id: roleId, permissions })}::jsonb)`
  }
}))

beforeEach(async () => {
  request.mockReset().mockImplementation(() => Effect.succeed([guild]))
  await run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`TRUNCATE discord_cache.roles, discord_cache.members, discord_cache.guilds, discord_cache.gateway_shards`
    yield* sql`DELETE FROM dashboard_role_grants WHERE server_id = '200'`
    yield* sql`INSERT INTO servers (id, name) VALUES ('200', 'Family') ON CONFLICT DO NOTHING`
    yield* sql`INSERT INTO auth_users (user_id, provider) VALUES ('100', 'discord') ON CONFLICT DO NOTHING`
    yield* sql`INSERT INTO discord_cache.gateway_shards
      (application_id, shard_id, shard_count, generation, healthy, heartbeat_at, last_applied_sequence)
      VALUES ('999', 0, 1, '11111111-1111-4111-8111-111111111111', true, clock_timestamp(), 1)`
    yield* sql`INSERT INTO discord_cache.guilds
      (id, data, application_id, shard_id, generation, available, metadata_complete, members_complete)
      VALUES ('200', '{"owner_id":"100"}'::jsonb, '999', 0, '11111111-1111-4111-8111-111111111111', true, true, true)`
  }))
})

describe("shared Discord coordination against authoritative migrations", () => {
  it("authorizes a cached Gateway owner without calling Discord", async () => {
    expect((await authorize()).manager).toBe(true)
    request.mockImplementation(() => Effect.fail(new UpstreamUnavailable({ cause: "offline", message: "offline" })))
    expect((await authorize()).manager).toBe(true)
    expect(request).not.toHaveBeenCalled()
  })

  it.each(["POST", "PATCH", "PUT", "DELETE"])("authorizes %s writes from the current Gateway generation", async (method) => {
    request.mockImplementation(() => Effect.fail(new UpstreamUnavailable({ cause: "offline", message: "offline" })))
    expect((await authorize(method)).manager).toBe(true)
    expect(request).not.toHaveBeenCalled()
  })

  it("rejects stale Gateway heartbeats as unavailable", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE discord_cache.gateway_shards SET heartbeat_at = clock_timestamp() - interval '46 seconds'`
    }))
    await expect(authorize()).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })

  it("does not authorize guild rows from an old Gateway generation", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE discord_cache.gateway_shards SET generation = '22222222-2222-4222-8222-222222222222'`
    }))
    await expect(authorize()).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })

  it("rejects a current non-owner without a manager role", async () => {
    await setGatewayAccess({ ownerId: "999", membersComplete: true })
    await expect(authorize()).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(request).not.toHaveBeenCalled()
  })

  it("authorizes Discord administrator roles from the current Gateway cache", async () => {
    await setGatewayAccess({ ownerId: "999", roles: ["300"], rolePermissions: ["8"] })
    expect((await authorize()).manager).toBe(true)
    expect(request).not.toHaveBeenCalled()
  })

  it("reads delegated grants fresh while role membership comes from Gateway", async () => {
    await setGatewayAccess({ ownerId: "999", roles: ["300"], rolePermissions: ["0"] })
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO dashboard_role_grants (server_id, role_id, section, access_level)
        VALUES ('200', '300', 'settings', 'view') ON CONFLICT DO NOTHING`
    }))
    expect((await authorize()).sections.settings).toBe("view")
    await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`DELETE FROM dashboard_role_grants WHERE server_id = '200' AND role_id = '300'`
    }))
    await expect(authorize()).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(request).not.toHaveBeenCalled()
  })

  it("uses OAuth only when an operation explicitly requires a fresh manager check", async () => {
    expect((await authorize("PATCH", true, true)).manager).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    request.mockImplementation(() => Effect.fail(new UpstreamUnavailable({ cause: "offline", message: "offline" })))
    await expect(authorize("PATCH", true, true)).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })

  it("uses the real guild-list operation with Gateway authorization", async () => {
    request.mockImplementation((path) => Effect.succeed(path.startsWith("/users/@me") ? [guild] : guild))
    await run(executeDashboardServerCore({ bindings, endpoint: dashboardEndpoints.dashboardGuilds, principal,
      request: new Request("https://api.example.test/v2/guilds"), path: {}, query: {}, body: {},
    }).pipe(Effect.provide(accessLayer)))
    expect(request).toHaveBeenCalledTimes(1)
    request.mockImplementation(() => Effect.fail(new UpstreamUnavailable({ cause: "offline", message: "offline" })))
    expect((await authorize()).manager).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
  })

})
