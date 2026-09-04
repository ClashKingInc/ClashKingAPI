import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"

import type { WorkerBindings } from "./environment.js"
import { DatabaseFailure } from "./errors.js"

export const databaseLayer = (bindings: WorkerBindings) =>
  PgClient.layer({
    url: Redacted.make(bindings.HYPERDRIVE.connectionString),
    applicationName: "clashking-api-worker",
    connectTimeout: "10 seconds",
    idleTimeout: "30 seconds",
    maxConnections: 5,
  })

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
