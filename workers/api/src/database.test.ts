import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { lazyDatabaseLayer } from "./database.js"

it("does not acquire PostgreSQL for an unused SQL service, but does for a query", async () => {
  let acquired = 0
  const layer = lazyDatabaseLayer(Effect.sync(() => { acquired++; throw new Error("database unavailable") }))
  expect(await Effect.runPromise(Effect.succeed(204).pipe(Effect.provide(layer), Effect.scoped))).toBe(204)
  expect(acquired).toBe(0)
  await expect(Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql`SELECT 42`
  }).pipe(Effect.provide(layer), Effect.scoped))).rejects.toThrow("database unavailable")
  expect(acquired).toBe(1)
})
