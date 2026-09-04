import { adminEndpoints } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { dispatchAdmin, adminRuntimeRoutes, matchAdminRoute, requiredAdminRole } from "./admin.js"
import { executeAdminOperation, type AdminOperationInput, type AdminWorkerBindings } from "./admin-operations.js"
import { AccessIdentity } from "./access.js"

const provideUnusedAdminServices = <A, E>(effect: Effect.Effect<A, E, AccessIdentity | SqlClient.SqlClient>) =>
  effect.pipe(
    Effect.provideService(AccessIdentity, {} as AccessIdentity["Service"]),
    Effect.provideService(SqlClient.SqlClient, {} as SqlClient.SqlClient),
  )

describe("admin runtime routes", () => {
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

  it("requires owner for mutations and every notification lab route", () => {
    expect(requiredAdminRole(adminEndpoints.dashboard)).toBe("admin")
    expect(requiredAdminRole(adminEndpoints.listPosts)).toBe("admin")
    expect(requiredAdminRole(adminEndpoints.createPost)).toBe("owner")
    expect(requiredAdminRole(adminEndpoints.labStatus)).toBe("owner")
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
      username: "owner",
      display_name: "Owner",
      role: "owner" as const,
      active: true,
      created_at: "2026-09-03T00:00:00.000Z",
      updated_at: "2026-09-03T00:00:00.000Z",
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
