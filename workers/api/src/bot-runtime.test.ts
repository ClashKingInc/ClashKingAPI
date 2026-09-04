import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { AuthIdentity } from "./auth.js"
import {
  BotModerationStore,
  botRuntimeRoutes,
  dispatchBotRuntime,
} from "./bot-runtime.js"
import type { WorkerBindings } from "./environment.js"
import { ServerAuthorization, serverAccessAllows } from "./server-authorization.js"
import { Forbidden } from "./errors.js"

const bindings = {} as WorkerBindings
const largeServerId = "123456789012345678"

describe("Bot runtime dispatcher", () => {
  it("publishes an exact route inventory and ignores routes outside its slice", async () => {
    expect(botRuntimeRoutes).toHaveLength(7)
    expect(new Set(botRuntimeRoutes.map(({ method, path }) => `${method} ${path}`)).size).toBe(7)
    await expect(run(
      new Request("https://api.clashk.ing/v2/counts"),
      {},
    )).resolves.toBeUndefined()
  })

  it("authenticates and contract-encodes the server ban list", async () => {
    const requireBot = vi.fn(() => Effect.succeed({ kind: "bot" as const }))
    const listBans = vi.fn(() => Effect.succeed({
      count: 1,
      items: [{
        DateCreated: "2026-09-03 18:00:00",
        Notes: "test",
        VillageName: "Player",
        VillageTag: "#P0Y",
        added_by: "123",
        edited_by: [],
        server: largeServerId,
      }],
    }))
    const response = await run(
      new Request(`https://api.clashk.ing/v2/server/${largeServerId}/bans`, {
        headers: { authorization: "Bearer bot-secret" },
      }),
      { listBans, requireBot },
    )

    expect(response?.status).toBe(200)
    await expect(response?.json()).resolves.toEqual({
      count: 1,
      items: [{
        DateCreated: "2026-09-03 18:00:00",
        Notes: "test",
        VillageName: "Player",
        VillageTag: "#P0Y",
        added_by: "123",
        edited_by: [],
        server: largeServerId,
      }],
    })
    expect(requireBot).toHaveBeenCalledOnce()
    expect(listBans).toHaveBeenCalledWith(largeServerId)
  })

  it("normalizes a ban tag and decodes the contract body before mutation", async () => {
    const saveBan = vi.fn((_serverId: string, tag: string) => Effect.succeed({
      status: "created",
      player_tag: tag,
      player_name: "Player",
      server_id: largeServerId,
    }))
    const response = await run(
      new Request(`https://api.clashk.ing/v2/server/${largeServerId}/bans/%23poy`, {
        body: JSON.stringify({ added_by: "123", image: "", reason: "test" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      { saveBan },
    )

    expect(response?.status).toBe(200)
    expect(saveBan).toHaveBeenCalledWith(largeServerId, "#P0Y", {
      added_by: "123",
      image: "",
      reason: "test",
    })
  })

  it("rejects an invalid strike body before the store is called", async () => {
    const addStrike = vi.fn(() => Effect.succeed({
      status: "created",
      strike_id: "STRIKE",
      player_tag: "#P0Y",
      server_id: largeServerId,
    }))
    const result = await Effect.runPromiseExit(
      dispatchBotRuntime(
        new Request(`https://api.clashk.ing/v2/server/${largeServerId}/strikes/%23P0Y`, {
          body: JSON.stringify({
            added_by: "123",
            image: "",
            reason: "test",
            rollover_days: 0,
            strike_weight: 0,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        bindings,
      ).pipe(Effect.provide(testLayer({ addStrike }))),
    )

    expect(result._tag).toBe("Failure")
    expect(addStrike).not.toHaveBeenCalled()
  })

  it("uses moderation view for reads and manage for every mutation before reading the body", async () => {
    const access = { manager: false, principal: { kind: "bot" as const }, sections: { moderation: "view" as const } }
    const authorize = vi.fn((_request: Request, serverId: string, requirement: Parameters<ServerAuthorization["Service"]["require"]>[2]) => {
      expect(serverId).toBe(largeServerId)
      return serverAccessAllows(access, requirement) ? Effect.succeed(access) : Effect.fail(new Forbidden({message:"No moderation write access"}))
    })
    expect((await run(new Request(`https://api.clashk.ing/v2/server/${largeServerId}/bans`), { authorize }))?.status).toBe(200)
    for (const [method, resource] of [["POST","bans/%23P0Y"],["DELETE","bans/%23P0Y"],["POST","strikes/%23P0Y"],["DELETE","strikes/strike-id"]] as const) {
      const request = new Request(`https://api.clashk.ing/v2/server/${largeServerId}/${resource}`, {
        method, ...(method === "POST" ? {body:"unreadable JSON",headers:{"content-type":"application/json"}} : {}),
      })
      await expect(run(request, { authorize })).rejects.toMatchObject({_tag:"Forbidden"})
      expect(request.bodyUsed).toBe(false)
    }
    expect(authorize.mock.calls.map(call=>call[2])).toEqual([
      {section:"moderation",write:false},...Array.from({length:4},()=>({section:"moderation",write:true})),
    ])
  })
})

function run(
  request: Request,
  overrides: Parameters<typeof testLayer>[0],
): Promise<Response | undefined> {
  return Effect.runPromise(
    dispatchBotRuntime(request, bindings).pipe(Effect.provide(testLayer(overrides))),
  )
}

function testLayer(overrides: Partial<BotModerationStore["Service"]> & {
  readonly requireBot?: AuthIdentity["Service"]["requireBot"]
  readonly authorize?: ServerAuthorization["Service"]["require"]
} = {}) {
  const emptyList = () => Effect.succeed({ count: 0, items: [] })
  const notUsed = () => Effect.die("Unexpected Bot moderation store call")
  return Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, {} as SqlClient.SqlClient),
    Layer.succeed(ServerAuthorization, {
      require: overrides.authorize ?? (() => (overrides.requireBot?.(new Request("https://fixture.test")) ?? Effect.succeed({kind:"bot" as const})).pipe(
        Effect.map(principal=>({principal,manager:true,sections:{}})))),
      resolve: () => Effect.die("Unexpected access resolution"),
    }),
    Layer.succeed(AuthIdentity, AuthIdentity.of({
      requireBot: overrides.requireBot ?? (() => Effect.succeed({ kind: "bot" as const })),
      requireUser: () => Effect.die("Unexpected user authentication"),
      requireUserOrBot: () => Effect.die("Unexpected user-or-bot authentication"),
    })),
    Layer.succeed(BotModerationStore, BotModerationStore.of({
      addStrike: overrides.addStrike ?? notUsed,
      deleteBan: overrides.deleteBan ?? notUsed,
      deleteStrike: overrides.deleteStrike ?? notUsed,
      listBans: overrides.listBans ?? emptyList,
      listStrikes: overrides.listStrikes ?? emptyList,
      saveBan: overrides.saveBan ?? notUsed,
      strikeSummary: overrides.strikeSummary ?? notUsed,
    })),
  )
}
