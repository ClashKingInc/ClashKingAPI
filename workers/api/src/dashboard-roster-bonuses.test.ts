import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { dispatchDashboardRosterBonuses } from "./dashboard-roster-bonuses.js"
import { ServerAuthorization } from "./server-authorization.js"
import { Forbidden } from "./errors.js"

// Boundary stub: validation must finish before any SQL property is accessed.
const unusedSql = new Proxy({} as SqlClient.SqlClient, { get: () => { throw new Error("Invalid input must not access SQL") } })
const unusedServices = Layer.merge(Layer.succeed(SqlClient.SqlClient, unusedSql),
  Layer.succeed(ServerAuthorization, {
    require: () => Effect.die("Invalid input must not reach authorization"),
    resolve: () => Effect.die("Invalid input must not reach authorization"),
  }))

describe("CWL bonus recipient replacement", () => {
  it.each(["2026-02-30", "2025-02-29", "1999-12", "2026-13", "2026-1", "2026-09-31"])("rejects invalid season %s before authorization or persistence", async (season) => {
    const request = new Request(`https://api.clashk.ing/v2/server/123/cwl/%23PQL/bonus-recipients?season=${season}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipients: [] }),
    })
    const error = await Effect.runPromise(dispatchDashboardRosterBonuses(request).pipe(Effect.flip, Effect.provide(unusedServices), Effect.scoped))
    expect(error).toMatchObject({ _tag: "InvalidRequest" })
  })

  it("denies a settings viewer before any persistence", async () => {
    const request = new Request("https://api.clashk.ing/v2/server/123/cwl/%23PQL/bonus-recipients?season=2026-09", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipients: [] }),
    })
    const error = await Effect.runPromise(dispatchDashboardRosterBonuses(request).pipe(
      Effect.provideService(ServerAuthorization, {
        resolve: () => Effect.die("Unexpected resolve"),
        require: (_request, serverId, requirement) => {
          expect(serverId).toBe("123")
          expect(requirement).toEqual({ section: "settings", write: true })
          return Effect.fail(new Forbidden({ message: "View-only access" }))
        },
      }),
      Effect.provideService(SqlClient.SqlClient, unusedSql), Effect.flip,
    ))
    expect(error).toMatchObject({ _tag: "Forbidden" })
  })

  it.each([null, {}, { recipients: [{ playerTag: "#PQL", medalCount: "100" }] }])("rejects malformed contract bodies before authorization", async (body) => {
    const request = new Request("https://api.clashk.ing/v2/server/123/cwl/%23PQL/bonus-recipients?season=2026-09", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    })
    const error = await Effect.runPromise(dispatchDashboardRosterBonuses(request).pipe(Effect.flip, Effect.provide(unusedServices), Effect.scoped))
    expect(error).toMatchObject({ _tag: "InvalidRequest" })
  })
})
