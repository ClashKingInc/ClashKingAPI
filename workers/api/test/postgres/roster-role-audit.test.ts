import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { DiscordApi } from "../../src/discord-api.js"
import { enqueueRosterEffects } from "../../src/roster-interaction-effects.js"
import { claimRosterEffect, enqueueRosterRoleAudits, pendingRosterRoleRepairs } from "../../src/roster-interaction-effect-store.js"
import { executeRosterRoleClaim } from "../../src/roster-interaction-delivery.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== '1') throw new Error('Use schema-owned disposable Timescale')
const db = PgClient.layer({ url: Redacted.make(databaseUrl) })

it('repairs a provider write after the old worker dies without any callback or queued repair', async () => {
  const serverId = '6834567890123464201', actorId = '7834567890123464201', roleId = '4834567890123464201'
  let remoteRole = false
  const discord = Layer.succeed(DiscordApi, { request: (_path, options) => Effect.sync(() => {
    if (options?.method === 'PUT') { remoteRole = true; return undefined }
    if (options?.method === 'DELETE') { remoteRole = false; return undefined }
    return { user: { id: actorId }, roles: remoteRole ? [roleId] : [] }
  }), token: () => Effect.die('Unexpected OAuth') })
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Lost callback audit')`
    const rosterId = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_role_id)
      VALUES (${serverId}, 'Audit', ${roleId}) RETURNING id::text`)[0]!.id
    const operation = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, state, channel_id, initial_interaction_id, stage, accepted_snapshot, submitted_at)
      VALUES (${rosterId}::uuid, ${serverId}, ${actorId}, 'publish', 'completed', '8834567890123464201',
        '1834567890123464201', 'done', '{}'::jsonb, now()) RETURNING id::text`)[0]!.id
    const evidence = yield* sql`SELECT xmin::text FROM roster_runtime_operations WHERE id = ${operation}::uuid`
    yield* sql.withTransaction(enqueueRosterEffects(sql, serverId, operation, [
      { kind: 'role', scopeKey: `role:${serverId}:${actorId}:${roleId}`, payload: { actorUserId: actorId, roleId } },
    ]))
    const effectId = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE operation_id = ${operation}::uuid`)[0]!.id
    // The lost worker issued a PUT that the provider has not applied yet. No
    // executor/fiber/callback remains alive to report its eventual completion.
    const lost = (yield* claimRosterEffect(effectId))!
    yield* sql`UPDATE roster_runtime_effects SET lease_expires_at = now() - interval '1 second' WHERE id = ${lost.id}::uuid`
    const replacement = (yield* claimRosterEffect(effectId))!
    expect(yield* executeRosterRoleClaim(replacement)).toBe(true)
    expect(remoteRole).toBe(false)
    // The delayed provider mutation applies after replacement verification.
    remoteRole = true
    expect((yield* pendingRosterRoleRepairs()).jobs.some(job => job.operation_id === operation)).toBe(false)
    expect((yield* enqueueRosterRoleAudits()).effectIds).not.toContain(effectId)
    expect((yield* pendingRosterRoleRepairs()).jobs.some(job => job.operation_id === operation)).toBe(false)
    const clock = Date.now() + 16 * 60_000
    const first = yield* enqueueRosterRoleAudits('', clock)
    const queued = (yield* pendingRosterRoleRepairs()).jobs.filter(job => job.operation_id === operation)
    expect(queued).toHaveLength(1)
    expect(first.effectIds).toContain(queued[0]!.id)
    expect((yield* enqueueRosterRoleAudits('', clock)).effectIds).not.toContain(queued[0]!.id)
    const repair = (yield* claimRosterEffect(queued[0]!.id))!
    expect(yield* executeRosterRoleClaim(repair)).toBe(true)
    expect(remoteRole).toBe(false)
    expect(yield* sql`SELECT xmin::text FROM roster_runtime_operations WHERE id = ${operation}::uuid`).toEqual(evidence)
  }).pipe(Effect.provide(Layer.merge(db, discord)), Effect.scoped))
})
