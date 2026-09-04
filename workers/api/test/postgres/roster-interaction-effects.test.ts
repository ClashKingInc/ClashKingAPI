import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { enqueueRosterEffects } from "../../src/roster-interaction-effects.js"
import { claimRosterEffect, pendingRosterRoleRepairs, queueRosterRoleRepair, settleRosterEffect } from "../../src/roster-interaction-effect-store.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use schema-owned disposable Timescale")
const db = PgClient.layer({ url: Redacted.make(databaseUrl) })
const serverId = '6834567890123457011'

it('recovers late role repairs after terminal operation completion without changing its evidence', async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, guild = '6834567890123464011'
    yield* sql`INSERT INTO servers (id, name) VALUES (${guild}, 'Terminal role repair')`
    const roster = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias) VALUES (${guild}, 'Repair') RETURNING id::text`)[0]!.id
    const operation = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, state, channel_id, initial_interaction_id, stage, accepted_snapshot, submitted_at)
      VALUES (${roster}::uuid, ${guild}, '7834567890123457031', 'publish', 'completed', '8834567890123457031',
        '1834567890123457031', 'done', '{"accepted":true}'::jsonb, now()) RETURNING id::text`)[0]!.id
    const evidence = yield* sql`SELECT * FROM roster_runtime_operations WHERE id = ${operation}::uuid`
    const scopeKey = `role:${guild}:7834567890123457031:4834567890123457031`
    yield* sql.withTransaction(enqueueRosterEffects(sql, guild, operation, [
      { kind: 'role', scopeKey, payload: { actorUserId: '7834567890123457031', roleId: '4834567890123457031' } },
    ]))
    const originalId = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE operation_id = ${operation}::uuid`)[0]!.id
    const original = (yield* claimRosterEffect(originalId))!
    // A newer active request can prevent immediate repair; the pending repair
    // must survive that busy scope and remain visible outside active operations.
    const repairId = (yield* queueRosterRoleRepair(original))!
    expect(repairId).not.toBe(originalId)
    expect(yield* queueRosterRoleRepair(original)).toBe(repairId)
    expect(yield* claimRosterEffect(repairId)).toBeUndefined()
    const feed = yield* pendingRosterRoleRepairs()
    expect(feed.jobs).toEqual(expect.arrayContaining([expect.objectContaining({
      id: repairId, operation_id: operation, server_id: guild, roster_id: roster,
    })]))
    const repairOrdinal = feed.jobs.find(job => job.id === repairId)!.ordinal
    expect((yield* pendingRosterRoleRepairs(repairOrdinal)).jobs.some(job => job.id === repairId)).toBe(false)
    expect(yield* settleRosterEffect(original, { outcome: 'succeeded', result: { present: false } })).toBe(true)
    const repair = (yield* claimRosterEffect(repairId))!
    expect(repair.generation).toBe('2')
    expect(yield* settleRosterEffect(repair, { outcome: 'succeeded', result: { present: false } })).toBe(true)
    expect((yield* pendingRosterRoleRepairs()).jobs.some(job => job.operation_id === operation)).toBe(false)
    expect(yield* sql`SELECT * FROM roster_runtime_operations WHERE id = ${operation}::uuid`).toEqual(evidence)
  }).pipe(Effect.provide(db), Effect.scoped))
})

it('serializes effect claims by scope, fences expired workers, and preserves oldest-first delivery', async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Roster effect fencing')`
    const roster = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias) VALUES (${serverId}, 'Effects') RETURNING id::text`)[0]!.id
    const operation = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, state, channel_id, initial_interaction_id, stage, accepted_snapshot, submitted_at)
      VALUES (${roster}::uuid, ${serverId}, '7834567890123457011', 'publish', 'submitted', '8834567890123457011',
        '1834567890123457011', 'done', '{}'::jsonb, now()) RETURNING id::text`)[0]!.id
    const scopeKey = `role:${serverId}:7834567890123457011:4834567890123457011`
    yield* sql.withTransaction(enqueueRosterEffects(sql, serverId, operation, [
      { kind: 'role', scopeKey, payload: { actorUserId: '7834567890123457011', roleId: '4834567890123457011' } },
      { kind: 'role', scopeKey, payload: { actorUserId: '7834567890123457011', roleId: '4834567890123457011' } },
    ]))
    const rows = yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE operation_id = ${operation}::uuid ORDER BY ordinal`
    expect(yield* claimRosterEffect(rows[1]!.id)).toBeUndefined()
    const claims = yield* Effect.all([claimRosterEffect(rows[0]!.id), claimRosterEffect(rows[0]!.id)], { concurrency: 2 })
    const first = claims.find(claim => claim !== undefined)!
    expect(claims.filter(claim => claim !== undefined)).toHaveLength(1)
    expect(first.generation).toBe('1')
    yield* sql`UPDATE roster_runtime_effects SET lease_expires_at = now() - interval '1 second' WHERE id = ${first.id}::uuid`
    expect(yield* settleRosterEffect(first, { outcome: 'succeeded', result: { expired: true } })).toBe(false)
    const replacement = (yield* claimRosterEffect(first.id))!
    expect(replacement.generation).toBe('2')
    expect(replacement.token).not.toBe(first.token)
    expect(yield* settleRosterEffect(first, { outcome: 'succeeded', result: { stale: true } })).toBe(false)
    expect(yield* claimRosterEffect(rows[1]!.id)).toBeUndefined()
    expect(yield* settleRosterEffect(replacement, { outcome: 'succeeded', result: { reconciled: true } })).toBe(true)
    const second = (yield* claimRosterEffect(rows[1]!.id))!
    expect(second.generation).toBe('3')
    expect(yield* settleRosterEffect(second, { outcome: 'retry', code: 'discord_rate_limit', retryAfterMs: 0 })).toBe(true)
    const retry = (yield* claimRosterEffect(second.id))!
    expect(retry.generation).toBe('4')
    expect(yield* settleRosterEffect(retry, { outcome: 'succeeded', result: { reconciled: true } })).toBe(true)
    expect(yield* settleRosterEffect(retry, { outcome: 'succeeded', result: { changed: true } })).toBe(false)
    expect(yield* sql`SELECT state, attempts FROM roster_runtime_effects WHERE operation_id = ${operation}::uuid ORDER BY ordinal`)
      .toEqual([{ state: 'succeeded', attempts: 2 }, { state: 'succeeded', attempts: 2 }])
  }).pipe(Effect.provide(db), Effect.scoped))
})

it('keeps a timed-out publication uncertain until positive evidence and never claims it for a blind resend', async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, guild = '6834567890123457021'
    yield* sql`INSERT INTO servers (id, name) VALUES (${guild}, 'Publication uncertainty')`
    const roster = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias) VALUES (${guild}, 'Uncertain') RETURNING id::text`)[0]!.id
    const operation = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, state, channel_id, initial_interaction_id, stage, accepted_snapshot, submitted_at)
      VALUES (${roster}::uuid, ${guild}, '7834567890123457021', 'publish', 'submitted', '8834567890123457021',
        '1834567890123457021', 'done', '{}'::jsonb, now()) RETURNING id::text`)[0]!.id
    yield* sql.withTransaction(enqueueRosterEffects(sql, guild, operation, [
      { kind: 'publish', scopeKey: `publish:${operation}`, payload: { channelId: '8834567890123457021' } },
    ]))
    const id = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE operation_id = ${operation}::uuid`)[0]!.id
    const claim = (yield* claimRosterEffect(id))!
    yield* sql`UPDATE roster_runtime_effects SET lease_expires_at = now() - interval '1 second' WHERE id = ${id}::uuid`
    expect(yield* claimRosterEffect(id)).toBeUndefined()
    expect(yield* sql`SELECT state, attempts FROM roster_runtime_effects WHERE id = ${id}::uuid`).toEqual([{ state: 'uncertain', attempts: 1 }])
    expect(yield* settleRosterEffect(claim, { outcome: 'retry', code: 'unknown_result', retryAfterMs: 0 })).toBe(true)
    expect(yield* claimRosterEffect(id)).toBeUndefined()
    expect(yield* settleRosterEffect(claim, { outcome: 'succeeded', result: { messageId: '4834567890123457021' } })).toBe(true)
    expect(yield* sql`SELECT state, attempts, result FROM roster_runtime_effects WHERE id = ${id}::uuid`)
      .toEqual([{ state: 'succeeded', attempts: 1, result: { messageId: '4834567890123457021' } }])
  }).pipe(Effect.provide(db), Effect.scoped))
})
