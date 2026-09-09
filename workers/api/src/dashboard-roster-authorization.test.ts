import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { AuthIdentity } from "./auth.js"
import { DashboardRosterOperations, dispatchDashboardRoster } from "./dashboard-roster-runtime.js"
import type { WorkerBindings } from "./environment.js"
import { Forbidden } from "./errors.js"
import { ServerAuthorization, serverAccessAllows } from "./server-authorization.js"

const serverId = "6934567890123456789", userId = "7934567890123456789"
const rosterId = "8a97a570-4ab0-4593-bcae-17a958460bba"
const now = "2026-09-03T00:00:00Z"
const bindings = {} as WorkerBindings
const view = { id: "view", shareId: "share", serverId, name: "Preview", sourceCode: "Show players", sourceVersion: 1, createdBy: userId, createdAt: now, updatedAt: now }
const fixture = (permission: "view" | "manage" | null = "view") => {
  const access = { manager: false, principal: { kind: "user" as const, userId }, sections: permission === null ? {} : { rosters: permission } }
  const require = vi.fn<ServerAuthorization["Service"]["require"]>((_request, id, requirement) => id === serverId && serverAccessAllows(access, requirement)
    ? Effect.succeed(access) : Effect.fail(new Forbidden({ message: "Read-only roster permission" })))
  const execute = vi.fn<DashboardRosterOperations["Service"]["execute"]>((operation) => Effect.succeed(Response.json(operation === "queryMetric"
    ? { metricId: "player.name", parameters: {}, rows: [], cached: false, evaluatedAt: now }
    : operation === "createView" ? view
    : { view, result: { viewId: "view", rosterIds: [rosterId], schemaVersion: 1, rows: [], cachedMetricIds: [], evaluatedAt: now } },
  { status: operation === "createView" ? 201 : 200 })))
  const layer = Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, {} as SqlClient.SqlClient),
    Layer.succeed(DashboardRosterOperations, { execute }),
    Layer.succeed(ServerAuthorization, { require, resolve: () => Effect.succeed(access) }),
    Layer.succeed(AuthIdentity, { requireUser: () => Effect.succeed(access.principal), requireUserOrBot: () => Effect.succeed(access.principal), requireBot: () => Effect.die("Unexpected bot auth") }),
  )
  return { require, execute, run: (path: string, body: unknown) => Effect.runPromise(dispatchDashboardRoster(new Request(`https://api.clashk.ing/v2${path}?server_id=${serverId}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), bindings).pipe(Effect.provide(layer))) }
}

describe("roster read-only POST authorization", () => {
  it.each([
    ["/roster/members/query", { rows: [] }],
    ["/roster/account-groups/query", { groups: [], note: "Linked accounts" }],
    ["/roster/membership-changes/validate", { type: "membershipProposal", changes: [], expectedRevisions: {}, generatedAt: now,
      counts: { add: 0, move: 0, remove: 0 }, items: [] }],
  ])("allows view-only access to the read-only POST %s", async (path, responseBody) => {
    const test = fixture()
    test.execute.mockImplementation(() => Effect.succeed(Response.json(responseBody)))
    const response = await test.run(path, { serverId, rosterIds: [rosterId], changes: [] })
    expect(response?.status).toBe(200)
    expect(test.require.mock.calls[0]?.[2]).toEqual({ section: "rosters", write: false })
  })

  it("allows a view-only member to query metrics without manage permission", async () => {
    const test = fixture()
    expect((await test.run("/roster/metrics/query", { rosterIds: [rosterId], metricId: "player.name", force: false }))?.status).toBe(200)
    expect(test.require.mock.calls[0]?.[1]).toBe(serverId)
    expect(test.require.mock.calls[0]?.[2]).toEqual({ section: "rosters", write: false })
    expect(test.execute).toHaveBeenCalledOnce()
  })

  it("allows a view-only member to preview a roster view without manage permission", async () => {
    const test = fixture()
    expect((await test.run("/roster/views/preview", { serverId, rosterIds: [rosterId], name: "Preview", sourceCode: "Show players", sourceVersion: 1,
      columns: [{ id: "name", label: "Name", metricId: "player.name" }], filters: [], sort: [], highlights: [], limit: null,
    }))?.status).toBe(200)
    expect(test.require.mock.calls[0]?.[2]).toEqual({ section: "rosters", write: false })
    expect(test.execute).toHaveBeenCalledOnce()
  })

  it("still denies a real write to a view-only member", async () => {
    const test = fixture()
    await expect(test.run("/roster/views", { name: "Saved view", sourceCode: "Show players", sourceVersion: 1 })).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(test.require.mock.calls[0]?.[2]).toEqual({ section: "rosters", write: true })
    expect(test.execute).not.toHaveBeenCalled()
  })

  it("denies a read-only POST to a member without roster access", async () => {
    const test = fixture(null)
    await expect(test.run("/roster/metrics/query", { rosterIds: [rosterId], metricId: "player.name", force: false })).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(test.require.mock.calls[0]?.[2]).toEqual({ section: "rosters", write: false })
    expect(test.execute).not.toHaveBeenCalled()
  })

  it("allows a member with rosters:manage to create a view without Discord manager access", async () => {
    const test = fixture("manage")
    const response = await test.run("/roster/views", { name: "Saved view", sourceCode: "Show players", sourceVersion: 1 })
    expect(response?.status).toBe(201)
    expect(await response?.json()).toEqual(view)
    expect(test.require.mock.calls[0]?.[2]).toEqual({ section: "rosters", write: true })
    expect(test.execute).toHaveBeenCalledOnce()
  })
})
