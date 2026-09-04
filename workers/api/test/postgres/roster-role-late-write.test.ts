import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { DiscordApi } from "../../src/discord-api.js"
import { enqueueRosterEffects } from "../../src/roster-interaction-effects.js"
import { claimRosterEffect, pendingRosterRoleRepairs } from "../../src/roster-interaction-effect-store.js"
import { executeRosterRoleClaim } from "../../src/roster-interaction-delivery.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const db = PgClient.layer({ url: Redacted.make(process.env.TEST_DATABASE_URL) })
const runSql = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => Effect.runPromise(effect.pipe(Effect.provide(db), Effect.scoped))

it("durably recovers a late stale role PUT even after the original operation completed", async () => {
  const serverId = "6834567890123457091", actorId = "7834567890123457091", roleId = "4834567890123457091"
  const scopeKey = `role:${serverId}:${actorId}:${roleId}`
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let rolePresent = false, heldPut = false
  const discord = Layer.succeed(DiscordApi, {
    request: (path, options) => Effect.promise(async () => {
      if (path === `/guilds/${serverId}/members/${actorId}/roles/${roleId}`) {
        if (options?.method === "PUT") {
          if (!heldPut) { heldPut = true; started.resolve(); await release.promise }
          rolePresent = true
        } else if (options?.method === "DELETE") rolePresent = false
        else throw new Error("Unexpected role request method")
        return undefined
      }
      if (path === `/guilds/${serverId}/members/${actorId}`) return { user: { id: actorId }, roles: rolePresent ? [roleId] : [] }
      throw new Error("Unexpected fixture Discord request")
    }),
    token: () => Effect.die("Unexpected OAuth"),
  })
  const runDelivery = (effect: ReturnType<typeof executeRosterRoleClaim>) =>
    Effect.runPromise(effect.pipe(Effect.provide(Layer.merge(db, discord)), Effect.scoped))
  const fixture = await runSql(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id,name) VALUES (${serverId},'Late role write')`
    const rosterId = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id,alias,roster_role_id)
      VALUES (${serverId},'Late role',${roleId}) RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO player_links (tag,user_id,source,is_verified) VALUES ('#9LATE',${actorId},'bot',false)`
    yield* sql`INSERT INTO roster_members (roster_id,tag,name,townhall) VALUES (${rosterId}::uuid,'#9LATE','Fixture',17)`
    const publisherId = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id,server_id,actor_user_id,action,state,channel_id,initial_interaction_id,stage,accepted_snapshot,submitted_at)
      VALUES (${rosterId}::uuid,${serverId},${actorId},'publish','completed','8834567890123457091',
        '1834567890123457090','done','{}',now()) RETURNING id::text`)[0]!.id
    const publicationId = (yield* sql<{ id: string }>`INSERT INTO roster_publications
      (roster_id,server_id,channel_id,message_id,mode,creator_operation_id)
      VALUES (${rosterId}::uuid,${serverId},'8834567890123457091','2834567890123457091','signup',${publisherId}::uuid)
      RETURNING id::text`)[0]!.id
    const operationId = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id,server_id,actor_user_id,action,state,source_publication_id,channel_id,initial_interaction_id,stage,accepted_snapshot,submitted_at)
      VALUES (${rosterId}::uuid,${serverId},${actorId},'signup','submitted',${publicationId}::uuid,'8834567890123457091',
        '1834567890123457091','done','{}',now()) RETURNING id::text`)[0]!.id
    yield* sql.withTransaction(enqueueRosterEffects(sql,serverId,operationId,[{ kind: "role",scopeKey,payload: { actorUserId: actorId,roleId } }]))
    const effectId = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE operation_id=${operationId}::uuid`)[0]!.id
    return { rosterId,effectId,operationId }
  }))
  const original = (await runSql(claimRosterEffect(fixture.effectId)))!
  // Disable the one-shot inline repair to prove persisted recovery survives
  // independently of the late caller continuing to run.
  const late = runDelivery(executeRosterRoleClaim(original, false))
  let completedEvidence: ReadonlyArray<{ xmin: string }> = []
  try {
    await started.promise
    await runSql(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`DELETE FROM roster_members WHERE roster_id=${fixture.rosterId}::uuid`
      yield* sql`UPDATE roster_runtime_effects SET lease_expires_at=now()-interval '1 second' WHERE id=${fixture.effectId}::uuid`
    }))
    const replacement = (await runSql(claimRosterEffect(fixture.effectId)))!
    expect(replacement.generation).not.toBe(original.generation)
    await runDelivery(executeRosterRoleClaim(replacement))
    expect(rolePresent).toBe(false)
    completedEvidence = await runSql(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE roster_runtime_operations SET state='completed' WHERE id=${fixture.operationId}::uuid`
      return yield* sql<{ xmin: string }>`SELECT xmin::text FROM roster_runtime_operations WHERE id=${fixture.operationId}::uuid`
    }))
  } finally {
    release.resolve()
    await late
  }
  const pending = await runSql(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects
      WHERE scope_key=${scopeKey} AND state IN ('pending','executing','uncertain') ORDER BY ordinal`
  }))
  expect(rolePresent).toBe(true)
  expect(pending, "A late stale write must leave durable repair even after operation completion").toHaveLength(1)
  const recovery = await runSql(pendingRosterRoleRepairs())
  expect(recovery.jobs.some(job => job.id === pending[0]!.id && job.operation_id === fixture.operationId)).toBe(true)
  await runSql(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    expect(yield* sql<{ xmin: string }>`SELECT xmin::text FROM roster_runtime_operations WHERE id=${fixture.operationId}::uuid`)
      .toEqual(completedEvidence)
  }))
  for (const row of pending) {
    await runSql(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE roster_runtime_effects SET next_attempt_at=now()-interval '1 second' WHERE id=${row.id}::uuid`
    }))
    const repair = await runSql(claimRosterEffect(row.id))
    if (repair !== undefined) await runDelivery(executeRosterRoleClaim(repair))
  }
  expect(rolePresent).toBe(false)
})
