import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import type { ApiPrincipal } from "./auth.js"
import { AuthIdentity } from "./auth.js"
import { DiscordApi } from "./discord-api.js"
import { DiscordCredentials } from "./discord-credentials.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"

import { discordGuildManager, resolveListedGuildAccess, serverAccessAllows, ServerAuthorization } from "./server-authorization.js"

describe("server authorization decisions", () => {
  const authorization = (rows: ReadonlyArray<Record<string, unknown>>, discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.die("Unexpected Discord request"))) => {
    const query = vi.fn((_statement: string, _params: ReadonlyArray<unknown>) => Effect.succeed(rows))
    const sql = Object.assign((parts: TemplateStringsArray, ...params: ReadonlyArray<unknown>) => query(parts.join("?"), params), {
      unsafe: query,
      withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    }) as unknown as SqlClient.SqlClient
    const principal = { kind: "user" as const, userId: "100", deviceId: "device" }
    const bindings = { DISCORD_CLIENT_ID: "999", DISCORD_API_ORIGIN: "https://discord.example.test", DISCORD_BOT_TOKEN: "bot" } as WorkerBindings
    const dependencies = Layer.mergeAll(
      Layer.succeed(SqlClient.SqlClient, sql), WorkerEnvironment.layer(bindings),
      Layer.succeed(AuthIdentity, { requireUser: () => Effect.succeed(principal), requireUserOrBot: () => Effect.succeed(principal), requireBot: () => Effect.die("Unexpected bot") }),
      Layer.succeed(DiscordCredentials, { accessToken: () => Effect.succeed("oauth") }),
      Layer.succeed(DiscordApi, { request: discord, token: () => Effect.die("Unexpected token") }),
    )
    const layer = ServerAuthorization.layer.pipe(Layer.provideMerge(dependencies))
    const require = (freshOauthManager = false) => Effect.runPromise(Effect.gen(function* () {
      const service = yield* ServerAuthorization
      return yield* service.require(new Request("https://api.example.test/v2/server/200/settings"), "200", { managerOnly: true, freshOauthManager })
    }).pipe(Effect.provide(layer)))
    return { discord, query, require }
  }

  it("uses a healthy current Gateway owner without Discord HTTP", async () => {
    const test = authorization([{ guild_id: "200", guild_data: { owner_id: "100" }, members_complete: false, member_roles: [], role_permissions: [] }])
    await expect(test.require()).resolves.toMatchObject({ manager: true })
    expect(test.discord).not.toHaveBeenCalled()
  })

  it("returns retryable unavailable when current Gateway metadata is absent", async () => {
    const test = authorization([])
    await expect(test.require()).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(test.discord).not.toHaveBeenCalled()
  })

  it("uses fresh OAuth manager evidence only for bootstrap after metadata readiness", async () => {
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.succeed([{ id: "200", owner: true, permissions: "0" }]))
    const test = authorization([{ guild_id: "200", guild_data: { owner_id: "999" }, members_complete: false, member_roles: [], role_permissions: [] }], discord)
    await expect(test.require(true)).resolves.toMatchObject({ manager: true })
    expect(discord).toHaveBeenCalledExactlyOnceWith("/users/@me/guilds?limit=200&with_counts=true", { oauthAccessToken: "oauth" })
  })

  it("batches listed guild grants and checks only members with configured candidate grants", async () => {
    const principal = { kind: "user", userId: "100", deviceId: "device" } as ApiPrincipal
    let calls = 0
    const query = vi.fn(() => Effect.succeed(calls++ === 0 ? [
      { guild_id: "100", guild_data: { owner_id: "100" }, members_complete: false, member_roles: [], role_permissions: [] },
      { guild_id: "200", guild_data: { owner_id: "999" }, members_complete: true, member_roles: ["900", "901"], role_permissions: [] },
      { guild_id: "300", guild_data: { owner_id: "999" }, members_complete: false, member_roles: [], role_permissions: [] },
    ] : [
      { server_id: "200", role_id: "900", section: "links", access_level: "view" },
      { server_id: "200", role_id: "901", section: "links", access_level: "manage" },
      { server_id: "200", role_id: "902", section: "settings", access_level: "manage" },
    ]))
    const result = await Effect.runPromise(resolveListedGuildAccess(principal, "999", [
      { id: "100", owner: true, permissions: "0" },
      { id: "200", owner: false, permissions: "0" },
      { id: "300", owner: false, permissions: "0" },
    ]).pipe(Effect.provide(Layer.mergeAll(
      Layer.succeed(SqlClient.SqlClient, query as unknown as SqlClient.SqlClient),
    ))))
    expect(query).toHaveBeenCalledTimes(2)
    expect(result.get("100")).toMatchObject({ manager: true })
    expect(result.get("200")).toMatchObject({ manager: false, sections: { links: "manage" } })
    expect(result.get("300")).toMatchObject({ manager: false, sections: {} })
  })

  it("still refuses delegated access when configured grants require an incomplete member cache", async () => {
    let calls = 0
    const query = vi.fn(() => Effect.succeed(calls++ === 0 ? [
      { guild_id: "200", guild_data: { owner_id: "999" }, members_complete: false, member_roles: ["900"], role_permissions: [] },
    ] : [{ server_id: "200", role_id: "900", section: "links", access_level: "manage" }]))
    await expect(Effect.runPromise(resolveListedGuildAccess(
      { kind: "user", userId: "100", deviceId: "device" }, "999",
      [{ id: "200", owner: false, permissions: "0" }],
    ).pipe(Effect.provideService(SqlClient.SqlClient, query as unknown as SqlClient.SqlClient))))
      .rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })

  it("requires manage for writes while allowing a delegated view for reads", () => {
    const access = { manager: false, sections: { links: "view" as const } }
    expect(serverAccessAllows(access, { section: "links" })).toBe(true)
    expect(serverAccessAllows(access, { section: "links", write: true })).toBe(false)
    expect(serverAccessAllows(access, { section: "settings" })).toBe(false)
    expect(serverAccessAllows(access, { managerOnly: true })).toBe(false)
  })

  it("allows delegated manage and full Discord managers", () => {
    expect(serverAccessAllows({ manager: false, sections: { links: "manage" } }, { section: "links", write: true })).toBe(true)
    expect(serverAccessAllows({ manager: true, sections: {} }, { managerOnly: true, write: true })).toBe(true)
  })

  it("evaluates Discord permissions with bigint without truncating high bits", () => {
    expect(discordGuildManager({ owner: false, permissions: "9007199254741024" })).toBe(true)
    expect(discordGuildManager({ owner: false, permissions: "9007199254740992" })).toBe(false)
    expect(discordGuildManager({ owner: false, permissions: "8" })).toBe(true)
    expect(discordGuildManager({ owner: true, permissions: "0" })).toBe(true)
    expect(discordGuildManager({ owner: false, permissions: "invalid" })).toBe(false)
  })
})
