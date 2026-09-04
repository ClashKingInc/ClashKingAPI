import { Effect } from "effect"
import type { SqlClient } from "effect/unstable/sql"

interface RosterEffectIntent {
  readonly scopeKey: string
  readonly kind: "role" | "board" | "publish"
  readonly payload: Readonly<Record<string, unknown>>
}

/** Enqueue under the same scope-row lock used by the delivery claim path.
 * Allocate the ordinal only after locking, so older uncommitted effects cannot
 * be invisible to a competing claimant. Called inside the membership transaction. */
export const enqueueRosterEffects = (sql: SqlClient.SqlClient, serverId: string, operationId: string,
  intents: readonly RosterEffectIntent[]) => Effect.gen(function* () {
  for (const intent of [...intents].sort((left, right) => left.scopeKey.localeCompare(right.scopeKey))) {
    yield* sql`INSERT INTO roster_runtime_effect_scopes (scope_key, server_id)
      VALUES (${intent.scopeKey}, ${serverId}) ON CONFLICT (scope_key) DO NOTHING`
    yield* sql`SELECT scope_key FROM roster_runtime_effect_scopes
      WHERE scope_key = ${intent.scopeKey} AND server_id = ${serverId} FOR UPDATE`
    yield* sql`INSERT INTO roster_runtime_effects (operation_id, server_id, scope_key, kind, payload)
      VALUES (${operationId}::uuid, ${serverId}, ${intent.scopeKey}, ${intent.kind}, ${JSON.stringify(intent.payload)}::jsonb)`
  }
})
