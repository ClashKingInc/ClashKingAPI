import { adminEndpoints } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { dispatchAdmin, adminRuntimeRoutes, matchAdminRoute } from "./admin.js"
import { executeAdminOperation, type AdminOperationInput, type AdminWorkerBindings } from "./admin-operations.js"
import { AccessIdentity } from "./access.js"
import { Forbidden } from "./errors.js"

const provideUnusedAdminServices = <A, E>(effect: Effect.Effect<A, E, AccessIdentity | SqlClient.SqlClient>) =>
  effect.pipe(
    Effect.provideService(AccessIdentity, {} as AccessIdentity["Service"]),
    Effect.provideService(SqlClient.SqlClient, {} as SqlClient.SqlClient),
  )

describe("admin runtime routes", () => {
  it.each(["POST", "PATCH"])("rejects retired/unknown developer fields before SQL for %s, like current Admin main", async method => {
    const path = method === "POST" ? "" : "/123e4567-e89b-42d3-a456-426614174000"
    const principal = { id: "fixture", email: "admin@example.test", username: "admin@example.test", display_name: "Admin", role: "admin" as const, active: true }
    const url = `https://api.clashk.ing/v2/admin/developer-applications${path}`
    const headers = { "content-type": "application/json" }
    const body = JSON.stringify({ developer_name: "Developer", connect_url: "https://retired.example.test" })
    const request = method === "POST" ? new Request(url, { method: "POST", headers, body })
      : new Request(url, { method: "PATCH", headers, body })
    await expect(Effect.runPromise(dispatchAdmin(request, {} as AdminWorkerBindings).pipe(
      Effect.provideService(AccessIdentity, { requireAdmin: () => Effect.succeed(principal) }),
      // Any SQL use fails; input rejection must happen before the operation.
      Effect.provideService(SqlClient.SqlClient, {} as SqlClient.SqlClient),
    ))).rejects.toMatchObject({ _tag: "InvalidRequest", message: "Request body failed schema validation" })
  })
  it("exposes every shared admin contract exactly once", () => {
    const contracts = Object.values(adminEndpoints).map(({ method, path }) => ({ method, path }))
    expect(adminRuntimeRoutes).toHaveLength(39)
    expect(new Set(adminRuntimeRoutes.map(({ method, path }) => `${method} ${path}`)).size).toBe(39)
    expect(adminRuntimeRoutes).toEqual(contracts)
  })

  it("matches and decodes dynamic route parameters", () => {
    const request = new Request("https://api.clashk.ing/v2/admin/posts/123e4567-e89b-12d3-a456-426614174000/revisions/7/restore", {
      method: "POST",
    })
    const match = matchAdminRoute(request)
    expect(match?.endpoint.operationId).toBe("adminRestorePostRevision")
    expect(match?.path).toEqual({ id: "123e4567-e89b-12d3-a456-426614174000", revision: 7 })
  })

  it.each(Object.values(adminEndpoints))("uses the same Access admission check for $operationId", async (endpoint) => {
    const request = new Request(`https://api.clashk.ing${endpoint.path.replace(/:[^/]+/gu, "1")}`, { method: endpoint.method, headers: { "x-requested-with": "XMLHttpRequest" } })
    const requireAdmin = vi.fn(() => Effect.fail(new Forbidden({ message: "Access denied" })))
    await expect(Effect.runPromise(dispatchAdmin(request, {} as AdminWorkerBindings).pipe(
      Effect.provideService(AccessIdentity, { requireAdmin }),
      Effect.provideService(SqlClient.SqlClient, {} as SqlClient.SqlClient),
    ))).rejects.toMatchObject({ _tag: "Forbidden", message: "Access denied" })
    expect(requireAdmin).toHaveBeenCalledExactlyOnceWith(request)
  })

  it("leaves requests outside the admin surface unhandled", async () => {
    const response = await Effect.runPromise(provideUnusedAdminServices(dispatchAdmin(
      new Request("https://api.clashk.ing/v2/player/%23ABC"),
      {} as AdminWorkerBindings,
    )))
    expect(response).toBeUndefined()
  })

  it("preserves identifiers above JavaScript's safe integer range as strings", async () => {
    const snowflake = "18446744073709551615"
    const principal = {
      id: snowflake,
      email: "owner@example.com",
      username: "owner@example.com",
      display_name: "Owner",
      role: "owner" as const,
      active: true,
    }
    const result = await Effect.runPromise(Effect.provideService(executeAdminOperation("adminMe", {
      bindings: {} as AdminWorkerBindings,
      body: {},
      path: {},
      principal,
      query: {},
      request: new Request("https://api.clashk.ing/v2/admin/me"),
    } satisfies AdminOperationInput), SqlClient.SqlClient, {} as SqlClient.SqlClient))
    expect(result).toMatchObject({ id: snowflake })
  })
})
