import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure } from "./errors.js"
import { enqueueRosterEffects } from "./roster-interaction-effects.js"
import type { RosterEffectClaim } from "./roster-interaction-effect-store.js"

/** Must hold the scope row lock. Repairs copy the newest persisted requested
 * snapshot, never a fresh roster read. Otherwise periodic recovery would
 * silently refresh boards that nobody requested to refresh. */
const queueLatestSnapshot = (sql: SqlClient.SqlClient, scopeKey: string, serverId: string, cutoff?: string) => Effect.gen(function* () {
  const pending = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE scope_key = ${scopeKey}
    AND server_id = ${serverId} AND kind = 'board' AND state = 'pending' ORDER BY ordinal LIMIT 1`)[0]
  if (pending !== undefined) return cutoff === undefined ? pending.id : undefined
  if (cutoff !== undefined) {
    const active = yield* sql`SELECT id FROM roster_runtime_effects WHERE scope_key = ${scopeKey}
      AND server_id = ${serverId} AND state IN ('executing', 'uncertain') LIMIT 1`
    if (active.length) return undefined
  }
  const desired = (yield* sql<{ operation_id: string; payload: Readonly<Record<string, unknown>>; due: boolean }>`
    SELECT operation_id::text, payload, (${cutoff ?? null}::timestamptz IS NULL OR updated_at <= ${cutoff ?? null}::timestamptz) AS due
    FROM roster_runtime_effects WHERE scope_key = ${scopeKey} AND server_id = ${serverId}
      AND kind = 'board' AND payload ? 'snapshot' ORDER BY ordinal DESC LIMIT 1`)[0]
  if (desired?.due !== true) return undefined
  yield* enqueueRosterEffects(sql, serverId, desired.operation_id, [{ kind: 'board', scopeKey, payload: desired.payload }])
  return (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE scope_key = ${scopeKey}
    AND server_id = ${serverId} AND state = 'pending' ORDER BY ordinal LIMIT 1`)[0]?.id
})
const failure = (cause: unknown) => new DatabaseFailure({ cause, message: 'Unable to recover roster board delivery' })

export const queueRosterBoardRepair = (claim: RosterEffectClaim) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql`SELECT scope_key FROM roster_runtime_effect_scopes WHERE scope_key = ${claim.scopeKey}
      AND server_id = ${claim.serverId} FOR UPDATE`
    const original = yield* sql`SELECT id FROM roster_runtime_effects WHERE id = ${claim.id}::uuid
      AND operation_id = ${claim.operationId}::uuid AND server_id = ${claim.serverId} AND scope_key = ${claim.scopeKey} AND kind = 'board'`
    if (!original.length) return undefined
    return yield* queueLatestSnapshot(sql, claim.scopeKey, claim.serverId)
  }))
}).pipe(Effect.catchTag('SqlError', cause => Effect.fail(failure(cause))))

export const enqueueRosterBoardAudits = (afterScopeKey = '', now = Date.now()) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ scope_key: string; server_id: string }>`SELECT scope.scope_key, scope.server_id
    FROM roster_runtime_effect_scopes scope JOIN roster_publications publication
      ON scope.scope_key = 'board:' || publication.id::text AND scope.server_id = publication.server_id
    WHERE publication.state = 'active' AND scope.scope_key > ${afterScopeKey} ORDER BY scope.scope_key LIMIT 101`
  const page = rows.slice(0, 100), effectIds: string[] = []
  for (const scope of page) {
    const id = yield* sql.withTransaction(Effect.gen(function* () {
      yield* sql`SELECT scope_key FROM roster_runtime_effect_scopes WHERE scope_key = ${scope.scope_key}
        AND server_id = ${scope.server_id} FOR UPDATE`
      return yield* queueLatestSnapshot(sql, scope.scope_key, scope.server_id, new Date(now - 15 * 60_000).toISOString())
    }))
    if (id !== undefined) effectIds.push(id)
  }
  return { effectIds, nextScopeKey: rows.length > 100 ? page.at(-1)?.scope_key : undefined }
}).pipe(Effect.catchTag('SqlError', cause => Effect.fail(failure(cause))))

export const pendingRosterBoardRepairs = (afterOrdinal = '0') => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ id: string; operation_id: string; server_id: string; roster_id: string; ordinal: string }>`
    SELECT effect.id::text, effect.operation_id::text, effect.server_id, operation.roster_id::text, effect.ordinal::text
    FROM roster_runtime_effects effect JOIN roster_runtime_operations operation ON operation.id = effect.operation_id
    WHERE effect.kind = 'board' AND operation.state IN ('completed', 'failed') AND effect.state IN ('pending', 'executing', 'uncertain')
      AND effect.ordinal > ${afterOrdinal}::bigint ORDER BY effect.ordinal LIMIT 101`
  const jobs = rows.slice(0, 100)
  return { jobs, nextOrdinal: rows.length > 100 ? jobs.at(-1)?.ordinal : undefined }
}).pipe(Effect.catchTag('SqlError', cause => Effect.fail(failure(cause))))
