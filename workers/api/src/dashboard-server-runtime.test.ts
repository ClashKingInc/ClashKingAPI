import { Effect, Layer } from "effect"
import { dashboardEndpoints, botEndpoints } from "@clashking/api-contracts"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { AuthIdentity } from "./auth.js"
import {
  DashboardServerOperations,
  dashboardServerRuntimeRoutes,
  dispatchDashboardServer,
} from "./dashboard-server-runtime.js"
import type { WorkerBindings } from "./environment.js"
import { ServerAuthorization } from "./server-authorization.js"
import { Forbidden, Unauthenticated } from "./errors.js"

const bindings = {} as WorkerBindings
const largeServerId = "123456789012345678"

describe("Dashboard server runtime dispatcher", () => {
  it("authorizes accepted multipart once before a single body read and execution", async () => {
    const events: string[] = []
    const form = new FormData(); form.set("file",new File(["image-content"],"base.png"))
    const request = new Request(`https://api.clashk.ing${dashboardEndpoints.uploadDashboardBaseImage.path.replace(":serverId",largeServerId)}`,{method:"POST",body:form})
    const getReader = request.body!.getReader.bind(request.body!)
    const read = vi.spyOn(request.body!,"getReader").mockImplementation((...args: [])=>{events.push("read");return getReader(...args)})
    const authorize = vi.fn(()=>{events.push("authorize");return Effect.succeed(access)})
    const execute = vi.fn((input: DashboardServerOperationsInput)=>Effect.gen(function*(){
      events.push("execute")
      const file = (input.body as FormData).get("file") as File
      expect(yield* Effect.promise(()=>file.text())).toBe("image-content")
      return {url:"https://api.clashk.ing/v2/media/base_test.png",filename:"base_test.png"}
    }))
    expect((await run(request,{authorize,execute}))?.status).toBe(200)
    expect(events).toEqual(["authorize","read","execute"])
    expect(authorize).toHaveBeenCalledOnce();expect(read).toHaveBeenCalledOnce();expect(execute).toHaveBeenCalledOnce()
  })
  it("rejects unauthenticated and wrong-guild uploads before reading their bodies", async () => {
    for (const rejection of [new Unauthenticated({message:"Sign in required"}),new Forbidden({message:"Wrong guild"})]) {
      for (const [method,path] of [
        ["POST",dashboardEndpoints.uploadDashboardBaseImage.path.replace(":serverId",largeServerId)],
        ["POST",`/v2/server/${largeServerId}/giveaways`],
        ["PUT",`/v2/server/${largeServerId}/giveaways/test-giveaway`],
      ]) {
        const execute = vi.fn(() => Effect.die("No authorized operation"))
        let reads = 0
        const body = new ReadableStream({pull(){reads++;throw new Error("Unauthorized body must never be read")}}, {highWaterMark:0})
        const authorize = vi.fn(()=>Effect.fail(rejection))
        const request = new Request(`https://api.clashk.ing${path}`,{method:method!,body,duplex:"half",headers:{
          "content-type":"multipart/form-data; boundary=test",
        }} as RequestInit)
        await expect(run(request,{authorize,execute})).rejects.toMatchObject({_tag:rejection._tag})
        expect(authorize).toHaveBeenCalledOnce()
        expect(reads).toBe(0)
        expect(request.bodyUsed).toBe(false)
        expect(execute).not.toHaveBeenCalled()
      }
    }
  })
  it("publishes a unique literal route inventory and ignores routes outside its slice", async () => {
    expect(dashboardServerRuntimeRoutes).toHaveLength(86)
    expect(new Set(dashboardServerRuntimeRoutes.map(({ method, path }) => `${method} ${path}`)).size).toBe(86)
    const shared = new Set([...Object.values(dashboardEndpoints), ...Object.values(botEndpoints)].map(({ method, path }) => `${method} ${path}`))
    expect(dashboardServerRuntimeRoutes.every(({ method, path }) => shared.has(`${method} ${path}`))).toBe(true)
    await expect(run(new Request("https://api.clashk.ing/v2/counts"))).resolves.toBeUndefined()
  })

  it("preserves Discord snowflakes above Number.MAX_SAFE_INTEGER", async () => {
    const authorize = vi.fn(() => Effect.succeed(access))
    const execute = vi.fn((_input: DashboardServerOperationsInput) => Effect.succeed({
      status: "success",
      message: "Discord API access working",
      bot_token_present: true,
      guild_name: "ClashKing",
      status_code: "200",
    }))
    const response = await run(
      new Request(`https://api.clashk.ing/v2/server/${largeServerId}/discord-test`),
      { authorize, execute },
    )

    expect(response?.status).toBe(200)
    expect(authorize).toHaveBeenCalledWith(expect.any(Request), largeServerId, expect.objectContaining({ section: "settings" }))
    expect(execute.mock.calls[0]?.[0].path).toEqual({ serverId: largeServerId })
  })

  it("does not retain the removed compatibility routes", async () => {
    await expect(run(
      new Request("https://api.clashk.ing/v2/server/123/clan/%232PP", { method: "DELETE" }),
    )).resolves.toBeUndefined()
    await expect(run(new Request("https://api.clashk.ing/v2/server/123/discord-channels"))).resolves.toBeUndefined()
  })

  it("validates JSON bodies with the endpoint contract before executing", async () => {
    const execute = vi.fn((_input: DashboardServerOperationsInput) => Effect.succeed({
      category: { id: "019c95ab-f582-79a6-a309-6ea9202878cd", serverId: "123", name: "Competitive", position: 0, clanCount: 0 },
    }))
    const response = await run(new Request(
      "https://api.clashk.ing/v2/server/123/clan-categories",
      {
        body: JSON.stringify({ name: "Competitive" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ), { execute })

    expect(response?.status).toBe(201)
    expect(execute.mock.calls[0]?.[0].body).toEqual({ name: "Competitive" })
  })

  it("rejects non-decimal Discord identifiers before authorization or execution", async () => {
    const authorize = vi.fn(() => Effect.succeed(access))
    const execute = vi.fn(() => Effect.die("must not execute"))
    const exit = await Effect.runPromiseExit(
      dispatchDashboardServer(
        new Request("https://api.clashk.ing/v2/server/12.5/settings"),
        bindings,
      ).pipe(Effect.provide(testLayer({ authorize, execute }))),
    )

    expect(exit._tag).toBe("Failure")
    expect(authorize).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it("rejects malformed percent encoding on a matched route rather than claiming it is unmatched", async () => {
    await expect(run(new Request("https://api.clashk.ing/v2/server/%ZZ/settings"))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })

  it("rejects malformed successful output at the shared response boundary", async () => {
    await expect(run(new Request("https://api.clashk.ing/v2/server/123/channels"), { execute: () => Effect.succeed([{ id: 123, name: "General", type: "text" }]) })).rejects.toBeDefined()
  })

  it("preserves the413 oversized-body failure before executing", async () => {
    await expect(run(new Request("https://api.clashk.ing/v2/server/123/clan-categories", { method: "POST", headers: { "content-type": "application/json", "content-length": "1048577" }, body: "{}" }))).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
  })
})

type DashboardServerOperationsInput = Parameters<DashboardServerOperations["Service"]["execute"]>[0]
const access = { manager: true, principal: { kind: "user" as const, userId: "999" }, sections: {} }

function run(
  request: Request,
  overrides: {
    readonly authorize?: ServerAuthorization["Service"]["require"]
    readonly execute?: DashboardServerOperations["Service"]["execute"]
  } = {},
): Promise<Response | undefined> {
  return Effect.runPromise(
    dispatchDashboardServer(request, bindings).pipe(Effect.provide(testLayer(overrides))),
  )
}

function testLayer(overrides: {
  readonly authorize?: ServerAuthorization["Service"]["require"]
  readonly execute?: DashboardServerOperations["Service"]["execute"]
}) {
  return Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, {} as SqlClient.SqlClient),
    Layer.succeed(AuthIdentity, AuthIdentity.of({
      requireBot: () => Effect.succeed({ kind: "bot" as const }),
      requireUser: () => Effect.succeed({ kind: "user" as const, userId: "999" }),
      requireUserOrBot: () => Effect.succeed({ kind: "user" as const, userId: "999" }),
    })),
    Layer.succeed(ServerAuthorization, ServerAuthorization.of({
      resolve: () => Effect.succeed(access),
      require: overrides.authorize ?? (() => Effect.succeed(access)),
    })),
    Layer.succeed(DashboardServerOperations, DashboardServerOperations.of({
      execute: overrides.execute ?? (() => Effect.die("Unexpected dashboard server operation")),
    })),
  )
}
