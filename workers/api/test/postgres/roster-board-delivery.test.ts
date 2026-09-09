import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { DiscordApi } from "../../src/discord-api.js"
import { executeRosterBoardClaim } from "../../src/roster-interaction-board-delivery.js"
import { RosterBoardMessageSchema } from "../../src/roster-interaction-board-message.js"
import { enqueueRosterBoardAudits, pendingRosterBoardRepairs } from "../../src/roster-interaction-board-recovery.js"
import { claimRosterEffect } from "../../src/roster-interaction-effect-store.js"
import { enqueueRosterEffects } from "../../src/roster-interaction-effects.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== '1') throw new Error('Use schema-owned disposable Timescale')
const db = PgClient.layer({ url: Redacted.make(databaseUrl) })
const scenarios = ['verified edit', 'unrequested later roster change', 'provider mismatch', 'archived board', 'expired delivery', 'foreign guild', 'held stale PATCH']

it.each(scenarios)('delivers persisted roster board snapshots: %s', async scenario => {
  const serverId = String(6834567890123464301n + BigInt(scenarios.indexOf(scenario)))
  const channelId = '8834567890123464301', messageId = serverId
  const calls: Array<{ path: string; method: string }> = []
  let remote: typeof RosterBoardMessageSchema.Type | undefined
  let rosterId = ''
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  let held = false
  const discord = Layer.succeed(DiscordApi, { request: (path, options) => Effect.gen(function* () {
    calls.push({ path, method: options?.method ?? 'GET' })
    // A distinct connection can take the parent lock during external I/O.
    yield* Effect.promise(() => Effect.runPromise(Effect.gen(function* () {
      const independent = yield* SqlClient.SqlClient
      yield* independent.withTransaction(independent`SELECT id FROM rosters WHERE id = ${rosterId}::uuid FOR UPDATE NOWAIT`)
    }).pipe(Effect.provide(db), Effect.scoped)))
    if (path === `/channels/${channelId}`) return { id: channelId,
      guild_id: scenario === 'foreign guild' ? '6834567890123464399' : serverId }
    if (options?.method === 'PATCH') {
      if (scenario === 'held stale PATCH' && !held) {
        held = true
        started.resolve()
        yield* Effect.promise(() => release.promise)
      }
      remote = Schema.decodeUnknownSync(RosterBoardMessageSchema)(options.body)
      return { id: messageId }
    }
    if (options?.method !== undefined && options.method !== 'GET') throw new Error('Unexpected outbound creation/deletion')
    return { id: messageId, channel_id: channelId, ...remote,
      embeds: remote!.embeds.map(embed => ({ ...embed, type: 'rich', ...(scenario === 'provider mismatch' ? { description: 'Wrong remote board' } : {}) })),
    }
  }), token: () => Effect.die('Unexpected OAuth') })
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Board delivery')`
    rosterId = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, revision)
      VALUES (${serverId}, 'Requested Snapshot', 7) RETURNING id::text`)[0]!.id
    const operation = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, state, channel_id, initial_interaction_id, stage, accepted_snapshot, submitted_at)
      VALUES (${rosterId}::uuid, ${serverId}, '7834567890123464301', 'publish', 'completed', ${channelId},
        ${serverId}, 'done', '{}'::jsonb, now()) RETURNING id::text`)[0]!.id
    const publication = (yield* sql<{ id: string }>`INSERT INTO roster_publications
      (roster_id, server_id, channel_id, message_id, mode, creator_operation_id)
      VALUES (${rosterId}::uuid, ${serverId}, ${channelId}, ${messageId}, 'signup', ${operation}::uuid) RETURNING id::text`)[0]!.id
    const evidence = yield* sql`SELECT xmin::text FROM roster_runtime_operations WHERE id = ${operation}::uuid`
    const scopeKey = `board:${publication}`
    yield* sql.withTransaction(enqueueRosterEffects(sql, serverId, operation, [{ kind: 'board', scopeKey, payload: { publicationId: publication } }]))
    const prepareId = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE operation_id = ${operation}::uuid`)[0]!.id
    const preparation = (yield* claimRosterEffect(prepareId))!
    expect(yield* executeRosterBoardClaim(preparation)).toBe(true)
    expect(calls).toEqual([])
    const child = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE operation_id = ${operation}::uuid AND state = 'pending'`)[0]!
    if (scenario === 'unrequested later roster change') yield* sql`UPDATE rosters SET alias = 'Unrequested New Data', revision = 8 WHERE id = ${rosterId}::uuid`
    if (scenario === 'archived board') yield* sql`UPDATE roster_publications SET state = 'archived' WHERE id = ${publication}::uuid`
    const delivery = (yield* claimRosterEffect(child.id))!
    if (scenario === 'expired delivery') yield* sql`UPDATE roster_runtime_effects SET lease_expires_at = now() - interval '1 second' WHERE id = ${child.id}::uuid`
    if (scenario === 'held stale PATCH') {
      const late = Effect.runPromise(executeRosterBoardClaim(delivery, false).pipe(Effect.provide(Layer.merge(db, discord)), Effect.scoped))
      try {
        yield* Effect.promise(() => started.promise)
        yield* sql`UPDATE roster_runtime_effects SET lease_expires_at = now() - interval '1 second' WHERE id = ${child.id}::uuid`
        const replacement = (yield* claimRosterEffect(child.id))!
        expect(yield* executeRosterBoardClaim(replacement)).toBe(true)
        yield* sql`UPDATE rosters SET alias = 'New Requested Snapshot', revision = 8 WHERE id = ${rosterId}::uuid`
        yield* sql.withTransaction(enqueueRosterEffects(sql, serverId, operation, [{ kind: 'board', scopeKey, payload: { publicationId: publication } }]))
        const nextPrepare = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE scope_key = ${scopeKey} AND state = 'pending'`)[0]!
        expect(yield* executeRosterBoardClaim((yield* claimRosterEffect(nextPrepare.id))!)).toBe(true)
        const nextDelivery = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE scope_key = ${scopeKey} AND state = 'pending'`)[0]!
        expect(yield* executeRosterBoardClaim((yield* claimRosterEffect(nextDelivery.id))!)).toBe(true)
        expect(remote!.embeds[0]!.title).toBe('New Requested Snapshot')
      } finally {
        release.resolve()
        yield* Effect.promise(() => late)
      }
      expect(remote!.embeds[0]!.title).toBe('Requested Snapshot')
      const repairs = (yield* pendingRosterBoardRepairs()).jobs.filter(job => job.operation_id === operation)
      expect(repairs).toHaveLength(1)
      expect(yield* executeRosterBoardClaim((yield* claimRosterEffect(repairs[0]!.id))!)).toBe(true)
      expect(remote!.embeds[0]!.title).toBe('New Requested Snapshot')
      return
    }
    expect(yield* executeRosterBoardClaim(delivery)).toBe(scenario !== 'expired delivery')
    if (scenario === 'archived board' || scenario === 'expired delivery') {
      expect(calls).toEqual([])
      return
    }
    if (scenario === 'foreign guild') {
      expect(calls).toEqual([{ path: `/channels/${channelId}`, method: 'GET' }])
      expect(remote).toBeUndefined()
      expect(yield* sql`SELECT state, failure_code FROM roster_runtime_effects WHERE id = ${child.id}::uuid`)
        .toEqual([{ state: 'failed', failure_code: 'discord_board_forbidden' }])
      return
    }
    expect(calls).toEqual([{ path: `/channels/${channelId}`, method: 'GET' }, { path: `/channels/${channelId}/messages/${messageId}`, method: 'PATCH' },
      { path: `/channels/${channelId}/messages/${messageId}`, method: 'GET' }])
    expect(remote!.embeds[0]!.title).toBe('Requested Snapshot')
    const states = yield* sql`SELECT state FROM roster_runtime_effects WHERE id = ${child.id}::uuid`
    expect(states).toEqual([{ state: scenario === 'provider mismatch' ? 'pending' : 'succeeded' }])
    if (scenario !== 'unrequested later roster change') return
    // The old worker is gone. A delayed provider PATCH corrupts the message
    // after verification, so no callback can enqueue immediate repair.
    remote = { ...remote!, embeds: [{ ...remote!.embeds[0]!, title: 'Delayed Old Provider Write' }] }
    expect((yield* pendingRosterBoardRepairs()).jobs.some(job => job.operation_id === operation)).toBe(false)
    yield* enqueueRosterBoardAudits('', Date.now() + 16 * 60_000)
    const queued = (yield* pendingRosterBoardRepairs()).jobs.filter(job => job.operation_id === operation)
    expect(queued).toHaveLength(1)
    const repair = (yield* claimRosterEffect(queued[0]!.id))!
    expect(yield* executeRosterBoardClaim(repair)).toBe(true)
    expect(remote!.embeds[0]!.title).toBe('Requested Snapshot')
    expect(JSON.stringify(remote)).not.toContain('Unrequested New Data')
    expect(yield* sql`SELECT xmin::text FROM roster_runtime_operations WHERE id = ${operation}::uuid`).toEqual(evidence)
  }).pipe(Effect.provide(Layer.merge(db, discord)), Effect.scoped))
})

it('pages board audits and terminal repair discovery beyond 100 publications without duplication', async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, serverId = '6834567890123464401'
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Board recovery pagination')`
    const rosterId = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias)
      VALUES (${serverId}, 'Paged boards') RETURNING id::text`)[0]!.id
    const message = { content: '', embeds: [{ description: 'Requested page snapshot', color: 0x2b2d31 }],
      components: [], allowed_mentions: { parse: [] } }
    const operations = yield* sql<{ id: string; initial_interaction_id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, state, channel_id, initial_interaction_id, stage, accepted_snapshot, submitted_at)
      SELECT ${rosterId}::uuid, ${serverId}, '7834567890123464401', 'publish', 'completed', '8834567890123464401',
        (1834567890123464401::bigint + sequence)::text, 'done', '{}'::jsonb, now() FROM generate_series(1, 102) AS sequence
      RETURNING id::text, initial_interaction_id`
    for (const operation of operations) {
      const publication = (yield* sql<{ id: string }>`INSERT INTO roster_publications
        (roster_id, server_id, channel_id, message_id, mode, creator_operation_id)
        VALUES (${rosterId}::uuid, ${serverId}, '8834567890123464401', ${operation.initial_interaction_id}, 'post', ${operation.id}::uuid) RETURNING id::text`)[0]!.id
      const scope = `board:${publication}`
      yield* sql`INSERT INTO roster_runtime_effect_scopes (scope_key, server_id) VALUES (${scope}, ${serverId})`
      yield* sql`INSERT INTO roster_runtime_effects (operation_id, server_id, scope_key, kind, state, payload, result, updated_at)
        VALUES (${operation.id}::uuid, ${serverId}, ${scope}, 'board', 'succeeded',
          ${JSON.stringify({ publicationId: publication, snapshot: { revision: '1', message } })}::jsonb,
          '{}'::jsonb, now() - interval '16 minutes')`
    }
    const queued = new Set<string>()
    let cursor: string | undefined = '', pages = 0
    while (cursor !== undefined) {
      const page: Effect.Success<ReturnType<typeof enqueueRosterBoardAudits>> = yield* enqueueRosterBoardAudits(cursor)
      expect(page.effectIds.length).toBeLessThanOrEqual(100)
      for (const id of page.effectIds) { expect(queued.has(id)).toBe(false); queued.add(id) }
      cursor = page.nextScopeKey
      expect(++pages).toBeLessThan(10)
    }
    expect(queued.size).toBe(102)
    expect(pages).toBeGreaterThan(1)
    let after: string | undefined = '0'
    const recovered: string[] = []
    while (after !== undefined) {
      const page: Effect.Success<ReturnType<typeof pendingRosterBoardRepairs>> = yield* pendingRosterBoardRepairs(after)
      recovered.push(...page.jobs.filter(job => job.server_id === serverId).map(job => job.id))
      after = page.nextOrdinal
    }
    expect(recovered).toHaveLength(102)
    expect(new Set(recovered)).toEqual(queued)
  }).pipe(Effect.provide(db), Effect.scoped))
})
