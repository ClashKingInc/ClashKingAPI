import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted, Scope } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Reactivity } from "effect/unstable/reactivity"

import type { WorkerBindings } from "./environment.js"
import { DatabaseFailure } from "./errors.js"

/** Capture one request scope, but acquire its pool only when a query executes.
 * No sockets or request-owned promises escape into global state. */
export const lazyDatabaseLayer = (acquire: ReturnType<typeof PgClient.make>) => Layer.effect(SqlClient.SqlClient,
  Effect.gen(function* () {
    const scope = yield* Scope.Scope
    const reactivity = yield* Reactivity.Reactivity
    const client = yield* Effect.cached(acquire.pipe(
      Effect.provideService(Scope.Scope, scope), Effect.provideService(Reactivity.Reactivity, reactivity),
    ))
    return yield* SqlClient.make({
      acquirer: client.pipe(Effect.flatMap((value) => value.reserve)),
      compiler: PgClient.makeCompiler(), spanAttributes: [["db.system", "postgresql"]],
    })
  }),
).pipe(Layer.provide(Reactivity.layer))

export const databaseLayer = (bindings: WorkerBindings) => lazyDatabaseLayer(
  PgClient.make({
    url: Redacted.make(bindings.HYPERDRIVE.connectionString),
    applicationName: "clashking-api-worker",
    connectTimeout: "10 seconds",
    idleTimeout: "30 seconds",
    maxConnections: 5,
  }),
)

export const refreshMaterializedViews = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`REFRESH MATERIALIZED VIEW CONCURRENTLY api_global_counts`
  yield* sql`REFRESH MATERIALIZED VIEW CONCURRENTLY api_league_tier_counts`
  return "refreshed" as const
}).pipe(
  Effect.mapError(
    (cause) => new DatabaseFailure({ cause, message: "Materialized view refresh failed" }),
  ),
  Effect.withSpan("Database.refreshMaterializedViews"),
)
