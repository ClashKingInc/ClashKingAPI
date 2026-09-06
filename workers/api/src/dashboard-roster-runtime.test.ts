import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { AuthIdentity } from "./auth.js"
import {
  DashboardRosterOperations,
  dashboardRosterRuntimeRoutes,
  dispatchDashboardRoster,
} from "./dashboard-roster-runtime.js"
import type { WorkerBindings } from "./environment.js"
import { Forbidden } from "./errors.js"
import { ServerAuthorization } from "./server-authorization.js"
import { DiscordApi } from "./discord-api.js"
import { botEndpoints, dashboardEndpoints } from "@clashking/api-contracts"

// Dispatcher tests do not decode archive frames; Workers' WASM import is covered
// by the archive owner's codec tests rather than Node's native WASM linker.
vi.mock("./war-archive-decoder.js", () => ({ decodeArchiveFrame: () => { throw new Error("Unexpected archive frame decoding") } }))

const serverId = "1234567890123456789"
const rosterId = "019fbb92-95e2-7781-9f22-e057c54de9ac"
const bindings = {} as WorkerBindings

const roster = {
  id: rosterId, server_id: serverId, alias: "CWL", roster_type: "clan", signup_scope: "clan-only",
  members: [], columns: [], sort: [], revision: 1,
  created_at: "2026-09-03T00:00:00.000Z", updated_at: "2026-09-03T00:00:00.000Z",
}

function testLayer(options: {
  readonly execute?: DashboardRosterOperations["Service"]["execute"]
  readonly require?: ServerAuthorization["Service"]["require"]
  readonly requireUserOrBot?: AuthIdentity["Service"]["requireUserOrBot"]
} = {}) {
  return Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, {} as SqlClient.SqlClient),
    Layer.succeed(DashboardRosterOperations, {
      execute: options.execute ?? (() => Effect.succeed(Response.json({ roster }))),
    }),
    Layer.succeed(ServerAuthorization, {
      require: options.require ?? (() => Effect.succeed({ principal: { kind: "bot" as const }, manager: true, sections: {} })),
      resolve: () => Effect.die("Unexpected authorization resolution"),
    }),
    Layer.succeed(AuthIdentity, {
      requireBot: () => Effect.die("Unexpected bot-only authentication"),
      requireUser: () => Effect.die("Unexpected user-only authentication"),
      requireUserOrBot: options.requireUserOrBot ?? (() => Effect.succeed({ kind: "bot" as const })),
    }),
  )
}

const run = (request: Request, options: Parameters<typeof testLayer>[0] = {}) => Effect.runPromise(
  dispatchDashboardRoster(request, bindings).pipe(Effect.provide(testLayer(options))),
)

describe("Dashboard roster dispatcher", () => {
  it("exports only implemented unique method/path pairs", () => {
    expect(dashboardRosterRuntimeRoutes).toHaveLength(43)
    expect(new Set(dashboardRosterRuntimeRoutes.map(({ method, path }) => `${method} ${path}`)).size).toBe(43)
    expect(dashboardRosterRuntimeRoutes).toContainEqual({ method: "PUT", path: "/v2/roster/questionnaire" })
    expect(dashboardRosterRuntimeRoutes).not.toContainEqual({ method: "POST", path: "/v2/roster/ai/context" })
  })

  it("has a shared descriptor for every registered route regardless of parameter spelling", () => {
    const shape = (path: string) => path.split("/").map((part) => part.startsWith(":") ? ":param" : part).join("/")
    const descriptors = Object.values({ ...botEndpoints, ...dashboardEndpoints })
    const missing = dashboardRosterRuntimeRoutes.filter((route) => !descriptors.some((endpoint) => endpoint.method === route.method && shape(endpoint.path) === shape(route.path)))
    expect(missing).toEqual([])
  })

  it("returns undefined without touching auth or operations for an unmatched route", async () => {
    const execute = vi.fn(() => Effect.die("Unexpected operation"))
    const require = vi.fn(() => Effect.die("Unexpected authorization"))
    expect(await run(new Request("https://api.clashk.ing/v2/not-rosters"), { execute, require })).toBeUndefined()
    expect(execute).not.toHaveBeenCalled()
    expect(require).not.toHaveBeenCalled()
  })

  it("returns a typed client failure for malformed path encoding", async () => {
    await expect(run(new Request(`https://api.clashk.ing/v2/roster/%ZZ?server_id=${serverId}`))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })

  it("keeps a Discord snowflake above 2^53 exact at authorization and operation boundaries", async () => {
    const require = vi.fn<ServerAuthorization["Service"]["require"]>(() => Effect.succeed({ principal: { kind: "bot" as const }, manager: true, sections: {} }))
    const execute = vi.fn<DashboardRosterOperations["Service"]["execute"]>(() => Effect.succeed(Response.json({ rosters: [roster], count: 1 })))
    const response = await run(new Request(`https://api.clashk.ing/v2/roster/${serverId}/list`), { require, execute })
    expect(require.mock.calls[0]?.[1]).toBe(serverId)
    expect(execute.mock.calls[0]?.[1].params.serverId).toBe(serverId)
    expect(await response?.json()).toEqual({ rosters: [roster], count: 1 })
  })

  it("rejects a body server that differs from the authorized query server", async () => {
    const execute = vi.fn(() => Effect.succeed(Response.json({ rows: [] })))
    const result = await Effect.runPromiseExit(dispatchDashboardRoster(new Request(
      `https://api.clashk.ing/v2/roster/members/query?server_id=${serverId}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverId: Number(serverId), rosterIds: [rosterId] }) },
    ), bindings).pipe(Effect.provide(testLayer({ execute }))))
    expect(result._tag).toBe("Failure")
    expect(execute).not.toHaveBeenCalled()
  })

  it("enforces roster manage permission before a mutation", async () => {
    const execute = vi.fn(() => Effect.succeed(Response.json({ message: "Members updated" })))
    const require = vi.fn<ServerAuthorization["Service"]["require"]>(() => Effect.fail(new Forbidden({ message: "No roster manage permission" })))
    const result = await Effect.runPromiseExit(dispatchDashboardRoster(new Request(
      `https://api.clashk.ing/v2/roster/${rosterId}/members?server_id=${serverId}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ members: [{ tag: "#P0Y" }] }) },
    ), bindings).pipe(Effect.provide(testLayer({ execute, require }))))
    expect(result._tag).toBe("Failure")
    expect(require.mock.calls[0]?.[2]).toEqual({ section: "rosters", write: true })
    expect(execute).not.toHaveBeenCalled()
  })

  it("rejects a malformed shared request before the store is called", async () => {
    const execute = vi.fn(() => Effect.succeed(Response.json({ message: "Roster created successfully" })))
    const result = await Effect.runPromiseExit(dispatchDashboardRoster(new Request(
      `https://api.clashk.ing/v2/roster?server_id=${serverId}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ alias: 123 }) },
    ), bindings).pipe(Effect.provide(testLayer({ execute }))))
    expect(result._tag).toBe("Failure")
    expect(execute).not.toHaveBeenCalled()
  })

  it("rejects malformed successful output instead of leaking an unchecked payload", async () => {
    const execute = () => Effect.succeed(Response.json({ roster: { ...roster, server_id: Number(serverId) } }))
    const result = await Effect.runPromiseExit(dispatchDashboardRoster(new Request(
      `https://api.clashk.ing/v2/roster/${rosterId}?server_id=${serverId}`,
    ), bindings).pipe(Effect.provide(testLayer({ execute }))))
    expect(result._tag).toBe("Failure")
  })

  it("does not authenticate a public roster and strips private fields using its response schema", async () => {
    const require = vi.fn(() => Effect.die("Public roster must not authorize"))
    const execute = () => Effect.succeed(Response.json({
      id: "public-id", name: "Public", updatedAt: "2026-09-03T00:00:00.000Z", members: [],
      webhook_id: serverId, discord_user_id: serverId,
    }))
    const response = await run(new Request("https://api.clashk.ing/v2/public/rosters/public-id"), { require, execute })
    expect(require).not.toHaveBeenCalled()
    expect(await response?.json()).toEqual({ id: "public-id", name: "Public", updatedAt: "2026-09-03T00:00:00.000Z", members: [] })
  })

  it("uses user-or-bot authentication without manager permission for the signup form", async () => {
    const requireUserOrBot = vi.fn(() => Effect.succeed({ kind: "bot" as const }))
    const require = vi.fn(() => Effect.die("Signup form does not require manager access"))
    const execute = () => Effect.succeed(Response.json({ accountSelector: { id: "account", type: "account", required: true }, questions: [] }))
    const response = await run(new Request(`https://api.clashk.ing/v2/server/${serverId}/rosters/${rosterId}/signup-form`), { execute, require, requireUserOrBot })
    expect(response?.status).toBe(200)
    expect(requireUserOrBot).toHaveBeenCalledOnce()
    expect(require).not.toHaveBeenCalled()
  })
})

describe("Dashboard roster SQL operations", () => {
  const operation = (name: string, request: Request, rows: readonly object[] | ((statement: string) => readonly object[])) => {
    const statements: string[] = []
    const values: unknown[][] = []
    const query = (strings: TemplateStringsArray, ...parameters: unknown[]) => {
      statements.push(strings.join("?"))
      values.push(parameters)
      const statement = strings.join("?")
      return Effect.succeed(statement.includes("SELECT id FROM servers") ? [{ id: serverId }] : typeof rows === "function" ? rows(statement) : rows)
    }
    const sql = Object.assign(query, { withTransaction: <A, E>(effect: Effect.Effect<A, E>) => effect }) as unknown as SqlClient.SqlClient
    const dependencies = Layer.mergeAll(
      Layer.succeed(SqlClient.SqlClient, sql),
      Layer.succeed(DiscordApi, { request: () => Effect.die("Unexpected Discord request"), token: () => Effect.die("Unexpected Discord token request") }),
    )
    const result = Effect.runPromise(Effect.gen(function* () {
      const operations = yield* DashboardRosterOperations
      return yield* operations.execute(name, { request, url: new URL(request.url), bindings, params: {} })
    }).pipe(Effect.provide(DashboardRosterOperations.layer.pipe(Layer.provide(dependencies)))))
    return { result, statements, values }
  }

  it("maps authoritative automation columns to wire active/options without converting IDs", async () => {
    const { result, statements, values } = operation("listAutomations", new Request(
      `https://api.clashk.ing/v2/roster-automation/list?server_id=${serverId}`,
    ), [{
      automation_id: "test-id", server_id: serverId, roster_id: null, group_id: null,
      action_type: "ping", trigger_type: "", scheduled_at: "2026-09-04T00:00:00Z", active: true,
      discord_channel_id: serverId, ping_type: "all", executed: false, executed_at: null,
      execution_status: null, last_missed_at: null, last_triggered_at: null,
      created_at: "2026-09-03T00:00:00Z", updated_at: "2026-09-03T00:00:00Z",
    }])
    expect(await (await result).json()).toMatchObject({
      server_id: serverId, rules: [{ active: true, options: { ping_type: "all" }, discord_channel_id: serverId }],
    })
    expect(statements[0]).toContain("ping_type, enabled AS active")
    expect(statements[0]).toContain("OR enabled")
    expect(statements[0]).not.toContain("discord_channel_id, options")
    expect(values[0]?.[0]).toBe(serverId)
  })

  it("rejects an invalid scheduled timestamp before inserting automation", async () => {
    const { result, statements } = operation("createAutomation", new Request(
      `https://api.clashk.ing/v2/roster-automation?server_id=${serverId}`,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action_type: "ping", scheduled_at: "tomorrow" }) },
    ), [])
    await expect(result).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain("SELECT id FROM servers")
    expect(statements[0]).toContain("FOR UPDATE")
  })

  it("rejects reserved questionnaire IDs before SQL mutation", async () => {
    const { result, statements } = operation("putQuestionnaire", new Request(
      `https://api.clashk.ing/v2/roster/questionnaire?server_id=${serverId}&roster_id=${rosterId}`,
      { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ questions: [
        { id: "account", label: "Account", type: "text", options: [], order: 0, required: false },
      ] }) },
    ), [])
    await expect(result).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(statements).toEqual([])
  })

  it("reads each normalized historical recipe once per roster preview", async () => {
    const { result, statements } = operation("previewView", new Request("https://api.clashk.ing/v2/roster/views/preview", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverId, rosterIds: [rosterId],
        name: "Repeated recipe", sourceCode: "Show trophy changes", sourceVersion: 1,
        columns: [
          { id: "weekly", label: "Week", metricId: "trophies.delta" },
          { id: "same_week", label: "Same week", metricId: "trophies.delta", parameters: { windowDays: 7, ignored: true } },
          { id: "monthly", label: "Month", metricId: "trophies.delta", parameters: { windowDays: 30 } },
        ], filters: [], sort: [], highlights: [], limit: null,
      }),
    }), (statement) => statement.includes("FROM rosters") ? [roster]
      : statement.includes("array_agg") ? [{ tag: "#P", value: 50 }] : [])
    expect((await result).status).toBe(200)
    expect(statements.filter((statement) => statement.includes("array_agg"))).toHaveLength(2)
  })
})
