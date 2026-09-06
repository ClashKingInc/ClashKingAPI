import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { DiscordApi } from "./discord-api.js"
import type { ApiPrincipal } from "./auth.js"

import { discordGuildManager, resolveListedGuildAccess, serverAccessAllows } from "./server-authorization.js"

describe("server authorization decisions", () => {
  it("batches listed guild grants and checks only members with configured candidate grants", async () => {
    const principal = { kind: "user", userId: "100", deviceId: "device" } as ApiPrincipal
    const query = vi.fn(() => Effect.succeed([
      { server_id: "200", role_id: "900", section: "links", access_level: "view" },
      { server_id: "200", role_id: "901", section: "links", access_level: "manage" },
      { server_id: "200", role_id: "902", section: "settings", access_level: "manage" },
    ]))
    const request = vi.fn(() => Effect.succeed({ roles: ["900", "901"] }))
    const result = await Effect.runPromise(resolveListedGuildAccess(principal, [
      { id: "100", owner: true, permissions: "0" },
      { id: "200", owner: false, permissions: "0" },
      { id: "300", owner: false, permissions: "0" },
    ]).pipe(Effect.provide(Layer.mergeAll(
      Layer.succeed(SqlClient.SqlClient, query as unknown as SqlClient.SqlClient),
      Layer.succeed(DiscordApi, { request, token: () => Effect.die("Unexpected token request") }),
    ))))
    expect(query).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledExactlyOnceWith("/guilds/200/members/100")
    expect(result.get("100")).toMatchObject({ manager: true })
    expect(result.get("200")).toMatchObject({ manager: false, sections: { links: "manage" } })
    expect(result.get("300")).toMatchObject({ manager: false, sections: {} })
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
