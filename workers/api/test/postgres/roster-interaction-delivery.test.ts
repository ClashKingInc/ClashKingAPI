import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { DiscordApi } from "../../src/discord-api.js"
import { enqueueRosterEffects } from "../../src/roster-interaction-effects.js"
import { claimRosterEffect } from "../../src/roster-interaction-effect-store.js"
import { executeRosterRoleClaim } from "../../src/roster-interaction-delivery.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use schema-owned disposable Timescale")
const db = PgClient.layer({ url: Redacted.make(databaseUrl) })
const scenarios = ['canonical owner', 'transferred before delivery', 'ownership changes during write', 'expired claim', 'provider state mismatch', 'shared roster role', 'retained group role']
it.each(scenarios)(
  'reconciles roster role delivery: %s', async (scenario) => {
  const index = scenarios.indexOf(scenario)
  const serverId = String(6834567890123457031n + BigInt(index)), actorId = String(7834567890123457031n + BigInt(index)), roleId = '4834567890123457031'
  const tag = `#9RA${index}`
  const fixture = await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Roster role delivery')`
    const rosterId = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_role_id)
      VALUES (${serverId}, 'Role source', ${roleId}) RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES (${tag}, ${scenario === 'transferred before delivery' ? '7834567890123457099' : actorId}, 'bot')`
    yield* sql`INSERT INTO roster_members (roster_id, tag, name, discord_user_id)
      VALUES (${rosterId}::uuid, ${tag}, 'Canonical owner wins', ${scenario === 'transferred before delivery' ? actorId : '7834567890123457099'})`
    if (scenario === 'shared roster role' || scenario === 'retained group role') {
      const otherRoster = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_role_id)
        VALUES (${serverId}, 'Other role source', ${scenario === 'shared roster role' ? roleId : null}) RETURNING id::text`)[0]!.id
      let groupId: string | null = null
      if (scenario === 'retained group role') {
        groupId = (yield* sql<{ id: string }>`INSERT INTO roster_member_groups (server_id, name)
          VALUES (${serverId}, 'Retained group') RETURNING id::text`)[0]!.id
        yield* sql`INSERT INTO roster_member_group_settings (roster_id, server_id, member_group_id, role_id, signup_enabled)
          VALUES (${otherRoster}::uuid, ${serverId}, ${groupId}::uuid, ${roleId}, false)`
      }
      yield* sql`INSERT INTO roster_members (roster_id, tag, name, member_group_id)
        VALUES (${otherRoster}::uuid, ${tag}, 'Still owns the role', ${groupId}::uuid)`
      yield* sql`DELETE FROM roster_members WHERE roster_id = ${rosterId}::uuid`
    }
    const operationId = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, state, channel_id, initial_interaction_id, stage, accepted_snapshot, submitted_at)
      VALUES (${rosterId}::uuid, ${serverId}, ${actorId}, 'publish', 'submitted', '8834567890123457031',
        ${serverId}, 'done', '{}'::jsonb, now()) RETURNING id::text`)[0]!.id
    yield* sql.withTransaction(enqueueRosterEffects(sql, serverId, operationId, [
      { kind: 'role', scopeKey: `role:${serverId}:${actorId}:${roleId}`, payload: { actorUserId: actorId, roleId } },
    ]))
    const id = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE operation_id = ${operationId}::uuid`)[0]!.id
    const claim = (yield* claimRosterEffect(id))!
    if (scenario === 'expired claim') yield* sql`UPDATE roster_runtime_effects SET lease_expires_at = now() - interval '1 second' WHERE id = ${id}::uuid`
    return { rosterId, claim }
  }).pipe(Effect.provide(db), Effect.scoped))
  let hasRole = scenario === 'transferred before delivery'
  const requests: Array<{ path: string; method: string }> = []
  const discord = Layer.succeed(DiscordApi, { request: (path, options) => Effect.promise(async () => {
    requests.push({ path, method: options?.method ?? 'GET' })
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.withTransaction(sql`SELECT id FROM rosters WHERE id = ${fixture.rosterId}::uuid FOR UPDATE NOWAIT`)
      if (options?.method === 'PUT' && scenario === 'ownership changes during write') {
        yield* sql`UPDATE player_links SET user_id = '7834567890123457099' WHERE tag = ${tag}`
      }
    }).pipe(Effect.provide(db), Effect.scoped))
    if (options?.method === 'PUT') { hasRole = scenario !== 'provider state mismatch'; return undefined }
    if (options?.method === 'DELETE') { hasRole = false; return undefined }
    return { user: { id: actorId }, roles: hasRole ? [roleId] : [] }
  }), token: () => Effect.die('Unexpected OAuth') })
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (scenario === 'expired claim') {
      expect(yield* executeRosterRoleClaim(fixture.claim)).toBe(false)
      expect(requests).toEqual([])
      return
    }
    expect(yield* executeRosterRoleClaim(fixture.claim)).toBe(true)
    expect(requests).toEqual([
      { path: `/guilds/${serverId}/members/${actorId}/roles/${roleId}`, method: scenario === 'transferred before delivery' ? 'DELETE' : 'PUT' },
      { path: `/guilds/${serverId}/members/${actorId}`, method: 'GET' },
    ])
    if (scenario === 'ownership changes during write' || scenario === 'provider state mismatch') {
      expect(yield* sql`SELECT state, result FROM roster_runtime_effects WHERE id = ${fixture.claim.id}::uuid`).toEqual([{ state: 'pending', result: null }])
      if (scenario === 'provider state mismatch') return
      yield* sql`UPDATE roster_runtime_effects SET next_attempt_at = now() WHERE id = ${fixture.claim.id}::uuid`
      const retry = (yield* claimRosterEffect(fixture.claim.id))!
      expect(yield* executeRosterRoleClaim(retry)).toBe(true)
      expect(requests.slice(2)).toEqual([
        { path: `/guilds/${serverId}/members/${actorId}/roles/${roleId}`, method: 'DELETE' },
        { path: `/guilds/${serverId}/members/${actorId}`, method: 'GET' },
      ])
    }
    expect(yield* sql`SELECT state, result FROM roster_runtime_effects WHERE id = ${fixture.claim.id}::uuid`)
      .toEqual([{ state: 'succeeded', result: { present: ['canonical owner', 'shared roster role', 'retained group role'].includes(scenario), roleId, actorUserId: actorId } }])
  }).pipe(Effect.provide(Layer.merge(db, discord)), Effect.scoped))
})
