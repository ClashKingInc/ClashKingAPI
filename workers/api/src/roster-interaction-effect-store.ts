import { RuntimeUUID } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, type ApiFailure } from "./errors.js"
import { enqueueRosterEffects } from "./roster-interaction-effects.js"

export interface RosterEffectClaim {
  readonly id: string; readonly operationId: string; readonly serverId: string; readonly scopeKey: string
  readonly kind: "role" | "board" | "publish"; readonly payload: unknown
  readonly token: string; readonly generation: string
}
interface EffectRow {
  readonly id: string; readonly operation_id: string; readonly server_id: string; readonly scope_key: string
  readonly kind: RosterEffectClaim["kind"]; readonly state: string; readonly payload: unknown
  readonly claim_token: string | null; readonly claim_generation: string | null
  readonly lease_active: boolean; readonly delayed: boolean
}
export type RosterEffectSettlement =
  | { readonly outcome: "succeeded"; readonly result: Readonly<Record<string, unknown>> }
  | { readonly outcome: "retry"; readonly code: string; readonly retryAfterMs: number }
  | { readonly outcome: "failed" | "uncertain"; readonly code: string }
const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "Unable to persist roster delivery" })
const isUUID = Schema.is(RuntimeUUID)

/** Lost workers cannot report a late provider write. Revisit the durable set
 * of roster-owned role scopes every 15 minutes, including settled scopes. The
 * scheduler must page this sweep and drain the resulting effects. Repeating
 * it is intentional: provider ordering has no reliable final timeout bound. */
export const enqueueRosterRoleAudits = (afterScopeKey = "", now = Date.now()) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const cutoff = new Date(now - 15 * 60_000).toISOString()
  const scopes = yield* sql<{ scope_key: string; server_id: string }>`SELECT scope_key, server_id
    FROM roster_runtime_effect_scopes WHERE scope_key LIKE 'role:%' AND scope_key > ${afterScopeKey}
    ORDER BY scope_key LIMIT 101`
  const page = scopes.slice(0, 100), effectIds: string[] = []
  for (const scope of page) {
    const id = yield* sql.withTransaction(Effect.gen(function* () {
      yield* sql`SELECT scope_key FROM roster_runtime_effect_scopes
        WHERE scope_key = ${scope.scope_key} AND server_id = ${scope.server_id} FOR UPDATE`
      const unfinished = yield* sql`SELECT id FROM roster_runtime_effects WHERE scope_key = ${scope.scope_key}
        AND server_id = ${scope.server_id} AND state IN ('pending', 'executing', 'uncertain') LIMIT 1`
      if (unfinished.length !== 0) return undefined
      const previous = (yield* sql<{ operation_id: string; payload: Readonly<Record<string, unknown>>; due: boolean }>`
        SELECT operation_id::text, payload, updated_at <= ${cutoff}::timestamptz AS due FROM roster_runtime_effects
        WHERE scope_key = ${scope.scope_key} AND server_id = ${scope.server_id} AND kind = 'role'
        ORDER BY ordinal DESC LIMIT 1`)[0]
      if (previous?.due !== true) return undefined
      yield* enqueueRosterEffects(sql, scope.server_id, previous.operation_id, [{
        kind: 'role', scopeKey: scope.scope_key, payload: previous.payload,
      }])
      return (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE scope_key = ${scope.scope_key}
        AND server_id = ${scope.server_id} AND state = 'pending' ORDER BY ordinal LIMIT 1`)[0]?.id
    }))
    if (id !== undefined) effectIds.push(id)
  }
  return { effectIds, nextScopeKey: scopes.length > 100 ? page.at(-1)?.scope_key : undefined }
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(databaseFailure(cause))))

/** A late external write can outlive SQL ownership. Persist a new reconciliation
 * effect after that write, even when the original operation is already terminal.
 * Terminal operation evidence stays immutable; recovery also scans these effects. */
export const queueRosterRoleRepair = (claim: RosterEffectClaim): Effect.Effect<string | undefined, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    const original = (yield* sql<{ payload: Readonly<Record<string, unknown>> }>`SELECT payload FROM roster_runtime_effects
      WHERE id = ${claim.id}::uuid AND operation_id = ${claim.operationId}::uuid AND server_id = ${claim.serverId}
        AND scope_key = ${claim.scopeKey} AND kind = 'role'`)[0]
    if (original === undefined) return undefined
    yield* sql`SELECT scope_key FROM roster_runtime_effect_scopes WHERE scope_key = ${claim.scopeKey} AND server_id = ${claim.serverId} FOR UPDATE`
    const pending = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects
      WHERE scope_key = ${claim.scopeKey} AND server_id = ${claim.serverId} AND kind = 'role' AND state = 'pending' ORDER BY ordinal LIMIT 1`)[0]
    if (pending !== undefined) return pending.id
    yield* enqueueRosterEffects(sql, claim.serverId, claim.operationId, [{ kind: "role", scopeKey: claim.scopeKey, payload: original.payload }])
    return (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE scope_key = ${claim.scopeKey}
      AND server_id = ${claim.serverId} AND state = 'pending' ORDER BY ordinal LIMIT 1`)[0]?.id
  }))
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(databaseFailure(cause))))

/** Additional recovery feed for repairs appended after immutable operation
 * completion. The scheduler must drain these alongside pending operations. */
export const pendingRosterRoleRepairs = (afterOrdinal = "0") => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ id: string; operation_id: string; server_id: string; roster_id: string; ordinal: string }>`
    SELECT effect.id::text, effect.operation_id::text, effect.server_id, operation.roster_id::text, effect.ordinal::text
    FROM roster_runtime_effects effect JOIN roster_runtime_operations operation ON operation.id = effect.operation_id
    WHERE effect.kind = 'role' AND operation.state IN ('completed', 'failed') AND effect.state IN ('pending', 'executing', 'uncertain')
      AND effect.ordinal > ${afterOrdinal}::bigint ORDER BY effect.ordinal LIMIT 101`
  const jobs = rows.slice(0, 100)
  return { jobs, nextOrdinal: rows.length > 100 ? jobs.at(-1)?.ordinal : undefined }
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(databaseFailure(cause))))

export const isRosterEffectClaimCurrent = (claim: RosterEffectClaim): Effect.Effect<boolean, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql<{ current: boolean }>`SELECT EXISTS (SELECT 1 FROM roster_runtime_effects effect
    JOIN roster_runtime_effect_scopes scope ON scope.scope_key = effect.scope_key AND scope.server_id = effect.server_id
    WHERE effect.id = ${claim.id}::uuid AND effect.server_id = ${claim.serverId} AND effect.scope_key = ${claim.scopeKey}
      AND effect.state = 'executing' AND effect.claim_token = ${claim.token}::uuid AND effect.claim_generation = ${claim.generation}::bigint
      AND effect.lease_expires_at > clock_timestamp() AND scope.active_effect_id = effect.id AND scope.generation = effect.claim_generation) AS current`)[0]
  return row?.current === true
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(databaseFailure(cause))))

/** Scope locks match enqueueRosterEffects; the oldest unfinished ordinal owns
 * the scope until settled. Tokens plus monotonic generations fence late work. */
export const claimRosterEffect = (effectId: string): Effect.Effect<RosterEffectClaim | undefined, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  if (!isUUID(effectId)) return undefined
  const sql = yield* SqlClient.SqlClient
  const reference = (yield* sql<{ scope_key: string; server_id: string }>`SELECT scope_key, server_id FROM roster_runtime_effects WHERE id = ${effectId}::uuid`)[0]
  if (reference === undefined) return undefined
  return yield* sql.withTransaction(Effect.gen(function* () {
    const scope = (yield* sql<{ active_effect_id: string | null }>`SELECT active_effect_id::text FROM roster_runtime_effect_scopes
      WHERE scope_key = ${reference.scope_key} AND server_id = ${reference.server_id} FOR UPDATE`)[0]
    if (scope === undefined) return undefined
    const head = (yield* sql<EffectRow>`SELECT id::text, operation_id::text, server_id, scope_key, kind, state, payload,
      claim_token::text, claim_generation::text, COALESCE(lease_expires_at > clock_timestamp(), false) AS lease_active,
      next_attempt_at > clock_timestamp() AS delayed FROM roster_runtime_effects
      WHERE scope_key = ${reference.scope_key} AND server_id = ${reference.server_id} AND state IN ('pending', 'executing', 'uncertain')
      ORDER BY ordinal LIMIT 1 FOR UPDATE`)[0]
    if (head === undefined || head.id !== effectId || head.delayed || head.state === "executing" && head.lease_active) return undefined
    if (scope.active_effect_id !== null && scope.active_effect_id !== head.id) return undefined
    // A timed-out message creation might have succeeded remotely. Keep its
    // ownership/evidence until positive reconciliation; never blindly resend.
    if (head.kind === "publish" && head.state !== "pending") {
      if (head.state === "executing") yield* sql`UPDATE roster_runtime_effects SET state = 'uncertain',
        failure_code = 'delivery_unconfirmed', updated_at = clock_timestamp() WHERE id = ${head.id}::uuid`
      return undefined
    }
    const token = crypto.randomUUID()
    const generation = (yield* sql<{ generation: string }>`UPDATE roster_runtime_effect_scopes SET generation = generation + 1,
      active_effect_id = ${head.id}::uuid WHERE scope_key = ${head.scope_key} AND server_id = ${head.server_id} RETURNING generation::text`)[0]!.generation
    yield* sql`UPDATE roster_runtime_effects SET state = 'executing', claim_token = ${token}::uuid,
      claim_generation = ${generation}::bigint, lease_expires_at = clock_timestamp() + interval '60 seconds',
      attempts = attempts + 1, updated_at = clock_timestamp() WHERE id = ${head.id}::uuid`
    return { id: head.id, operationId: head.operation_id, serverId: head.server_id, scopeKey: head.scope_key,
      kind: head.kind, payload: head.payload, token, generation }
  }))
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(databaseFailure(cause))))

/** A stale token/generation cannot settle or release a newer owner's scope. */
export const settleRosterEffect = (claim: RosterEffectClaim, settlement: RosterEffectSettlement):
  Effect.Effect<boolean, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    const scope = (yield* sql<{ active_effect_id: string | null; generation: string }>`SELECT active_effect_id::text, generation::text
      FROM roster_runtime_effect_scopes WHERE scope_key = ${claim.scopeKey} AND server_id = ${claim.serverId} FOR UPDATE`)[0]
    if (scope?.active_effect_id !== claim.id || scope.generation !== claim.generation) return false
    const effect = (yield* sql<{ state: string; kind: string; claim_token: string | null; claim_generation: string | null; lease_active: boolean }>`
      SELECT state, kind, claim_token::text, claim_generation::text, lease_expires_at > clock_timestamp() AS lease_active FROM roster_runtime_effects
      WHERE id = ${claim.id}::uuid AND scope_key = ${claim.scopeKey} AND server_id = ${claim.serverId} FOR UPDATE`)[0]
    if (effect === undefined || !["executing", "uncertain"].includes(effect.state)
      || effect.claim_token !== claim.token || effect.claim_generation !== claim.generation
      || effect.kind !== "publish" && !effect.lease_active) return false
    if (settlement.outcome === "succeeded") {
      yield* sql`UPDATE roster_runtime_effects SET state = 'succeeded', result = ${JSON.stringify(settlement.result)}::jsonb,
        failure_code = NULL, updated_at = clock_timestamp() WHERE id = ${claim.id}::uuid`
    } else if (settlement.outcome === "uncertain" || settlement.outcome === "retry" && effect.kind === "publish") {
      yield* sql`UPDATE roster_runtime_effects SET state = 'uncertain', failure_code = ${settlement.code.slice(0, 256)},
        updated_at = clock_timestamp() WHERE id = ${claim.id}::uuid`
      return true
    } else if (settlement.outcome === "retry") {
      const delay = Number.isFinite(settlement.retryAfterMs) ? Math.max(0, Math.min(3_600_000, Math.ceil(settlement.retryAfterMs))) : 60_000
      yield* sql`UPDATE roster_runtime_effects SET state = 'pending', failure_code = ${settlement.code.slice(0, 256)},
        claim_token = NULL, claim_generation = NULL, lease_expires_at = NULL,
        next_attempt_at = clock_timestamp() + ${delay} * interval '1 millisecond', updated_at = clock_timestamp() WHERE id = ${claim.id}::uuid`
    } else {
      yield* sql`UPDATE roster_runtime_effects SET state = 'failed', failure_code = ${settlement.code.slice(0, 256)},
        updated_at = clock_timestamp() WHERE id = ${claim.id}::uuid`
    }
    yield* sql`UPDATE roster_runtime_effect_scopes SET active_effect_id = NULL
      WHERE scope_key = ${claim.scopeKey} AND server_id = ${claim.serverId} AND active_effect_id = ${claim.id}::uuid AND generation = ${claim.generation}::bigint`
    return true
  }))
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(databaseFailure(cause))))
