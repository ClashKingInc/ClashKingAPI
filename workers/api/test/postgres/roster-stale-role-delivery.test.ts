import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { DiscordApi } from "../../src/discord-api.js"
import { claimRosterEffect } from "../../src/roster-interaction-effect-store.js"
import { executeRosterRoleClaim } from "../../src/roster-interaction-delivery.js"
import { enqueueRosterEffects } from "../../src/roster-interaction-effects.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const db = PgClient.layer({ url: Redacted.make(process.env.TEST_DATABASE_URL) })
const run = <A,E>(effect: Effect.Effect<A,E,SqlClient.SqlClient>) => Effect.runPromise(effect.pipe(Effect.provide(db),Effect.scoped))
const serverId="684000000000000501",actorId="784000000000000501",roleId="484000000000000501"

it("retains repair work when an expired role PUT lands after its replacement has completed",async()=>{
  const fixture=await run(Effect.gen(function*(){
    const sql=yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers(id,name) VALUES(${serverId},'Late role write')`
    const rosterId=(yield* sql<{id:string}>`INSERT INTO rosters(server_id,alias,roster_role_id)
      VALUES(${serverId},'Late role source',${roleId}) RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO player_links(tag,user_id,source) VALUES('#9STALE',${actorId},'bot')`
    yield* sql`INSERT INTO roster_members(roster_id,tag,name) VALUES(${rosterId}::uuid,'#9STALE','Owned')`
    const operationId=(yield* sql<{id:string}>`INSERT INTO roster_runtime_operations
      (roster_id,server_id,actor_user_id,action,state,channel_id,initial_interaction_id,stage,accepted_snapshot,submitted_at)
      VALUES(${rosterId}::uuid,${serverId},${actorId},'publish','submitted','884000000000000501',
        '184000000000000501','done','{}',now()) RETURNING id::text`)[0]!.id
    yield* sql.withTransaction(enqueueRosterEffects(sql,serverId,operationId,[{
      kind:'role',scopeKey:`role:${serverId}:${actorId}:${roleId}`,payload:{actorUserId:actorId,roleId},
    }]))
    const effectId=(yield* sql<{id:string}>`SELECT id::text FROM roster_runtime_effects WHERE operation_id=${operationId}::uuid`)[0]!.id
    return {rosterId,operationId,effectId,claim:(yield* claimRosterEffect(effectId))!}
  }))
  let hasRole=false
  const started=Promise.withResolvers<void>(),release=Promise.withResolvers<void>()
  const discord=Layer.succeed(DiscordApi,{request:(_path,options)=>Effect.promise(async()=>{
    if(options?.method==='PUT'){
      started.resolve()
      await release.promise
      hasRole=true
      return undefined
    }
    if(options?.method==='DELETE'){hasRole=false;return undefined}
    return {user:{id:actorId},roles:hasRole?[roleId]:[]}
  }),token:()=>Effect.die('Unexpected OAuth')})
  const deliver=(claim:typeof fixture.claim)=>Effect.runPromise(executeRosterRoleClaim(claim).pipe(Effect.provide(Layer.merge(db,discord)),Effect.scoped))
  const oldDelivery=deliver(fixture.claim)
  try {
    await started.promise
    const replacement=await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      yield* sql`DELETE FROM roster_members WHERE roster_id=${fixture.rosterId}::uuid`
      yield* sql`UPDATE roster_runtime_effects SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=${fixture.effectId}::uuid`
      return yield* claimRosterEffect(fixture.effectId)
    }))
    expect(replacement).toBeDefined()
    expect(await deliver(replacement!)).toBe(true)
    expect(hasRole).toBe(false)
    release.resolve()
    await oldDelivery
    const pending=await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient
      return yield* sql`SELECT id FROM roster_runtime_effects WHERE server_id=${serverId} AND state IN ('pending','executing','uncertain')`
    }))
    // Either repaired immediately, or durable work must remain to restore the
    // canonical absent role. A succeeded stale snapshot alone cannot do that.
    expect({incorrectRole:hasRole,repairQueued:pending.length>0}).not.toEqual({incorrectRole:true,repairQueued:false})
  } finally {
    release.resolve()
    await oldDelivery
  }
})
