import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure } from "./errors.js"

/** Schema migration 023 owns this permanent mutex. Every authorization and
 * settlement takes it before reading usage/sponsors, inside its transaction.
 * This serializes accounting; zero-cost authorizations do not reserve spend. */
export const lockRosterAIBudget = (sql: SqlClient.SqlClient) => Effect.gen(function* () {
  const locked = yield* sql`SELECT scope FROM roster_ai_budget_locks WHERE scope = 'global-monthly' FOR UPDATE`
  if (locked.length !== 1) return yield* new DatabaseFailure({ cause: "AI budget mutex missing", message: "Roster AI accounting is unavailable" })
})
