import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { prepareRosterAction } from "../../src/roster-interaction-prepare.js"
import { advanceRosterDraft } from "../../src/roster-interaction-store.js"
import { verifyRosterInteraction } from "../../src/roster-interaction-identity.js"
import { confirmRosterOperation } from "../../src/roster-interaction-confirm.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { addLink } from "../../src/link-mutations.js"
import { NotFound } from "../../src/errors.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const db = PgClient.layer({ url: Redacted.make(databaseUrl) })
const noDiscord = Layer.succeed(DiscordApi, { request: () => Effect.die("Removal must not call Discord"), token: () => Effect.die("Unexpected OAuth") })
const guild = "6834567890123456941", actor = "7834567890123456941", channel = "8834567890123456941", message = "1834567890123456941"
const hex = (value: ArrayBuffer) => [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, "0")).join("")

it("confirms signed own-entry removal exactly once and atomically journals role and clicked-board reconciliation", async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair
  const configuration = { DISCORD_PUBLIC_KEY: hex(await crypto.subtle.exportKey("raw", keys.publicKey)), DISCORD_APPLICATION_ID: "9834567890123456941" }
  let sequence = 2834567890123456941n
  const sign = async (customId: string, values?: string[], id = String(sequence++), timestamp = String(Math.floor(Date.now() / 1000))) => {
    const rawBody = JSON.stringify({ id, application_id: configuration.DISCORD_APPLICATION_ID, guild_id: guild,
      channel_id: channel, type: 3, member: { user: { id: actor } }, message: { id: message },
      data: { custom_id: customId, component_type: values ? 3 : 2, ...(values ? { values } : {}) }, token: "never-store-token" })
    return { interaction: { rawBody, timestamp, signature: hex(await crypto.subtle.sign("Ed25519", keys.privateKey,
      new TextEncoder().encode(timestamp + rawBody))) } }
  }
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${guild}, 'Signed confirmation')`
    const roster = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, min_townhall, capacity, roster_role_id)
      VALUES (${guild}, 'Overfull and ineligible', 19, 1, '4834567890123456941') RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified) VALUES ('#9RC', ${actor}, 'bot', false)`
    yield* sql`INSERT INTO roster_members (roster_id, tag, name, townhall) VALUES
      (${roster}::uuid, '#9RC', 'Owned', 2), (${roster}::uuid, '#9RD', 'Other', 2)`
    const publisher = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, state, channel_id, initial_interaction_id, stage, accepted_snapshot, submitted_at)
      VALUES (${roster}::uuid, ${guild}, ${actor}, 'publish', 'completed', ${channel}, '3834567890123456941', 'done', '{}'::jsonb, now()) RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_publications (roster_id, server_id, channel_id, message_id, mode, creator_operation_id)
      VALUES (${roster}::uuid, ${guild}, ${channel}, ${message}, 'signup', ${publisher}::uuid)`
    const prepared = yield* prepareRosterAction(yield* Effect.promise(() => sign(`ck:roster:remove:${roster}`)), configuration)
    const selected = yield* verifyRosterInteraction(yield* Effect.promise(() => sign(`ck:roster:accounts:${prepared.operationId}:1`, ['#9RC'])), configuration)
    const form = yield* advanceRosterDraft(prepared.operationId, selected.interaction)
    expect(form).toMatchObject({ form: { customId: `ck:roster:submit:${prepared.operationId}:2` } })
    const proof = yield* Effect.promise(() => sign(`ck:roster:submit:${prepared.operationId}:2`))
    const responses = yield* Effect.all([confirmRosterOperation(prepared.operationId, proof, configuration),
      confirmRosterOperation(prepared.operationId, proof, configuration)], { concurrency: 2 })
    expect(responses[0]).toEqual(responses[1])
    expect(responses[0]).toMatchObject({ outcome: 'accepted', state: 'submitted', action: 'remove', operationId: prepared.operationId })
    expect(yield* sql`SELECT tag FROM roster_members WHERE roster_id = ${roster}::uuid`).toEqual([{ tag: '#9RD' }])
    expect(yield* sql`SELECT revision::integer FROM rosters WHERE id = ${roster}::uuid`).toEqual([{ revision: 2 }])
    const effects = yield* sql<{ kind: string; state: string; payload: unknown }>`SELECT kind, state, payload FROM roster_runtime_effects
      WHERE operation_id = ${prepared.operationId}::uuid ORDER BY kind`
    expect(effects).toHaveLength(2)
    expect(effects.map(effect => [effect.kind, effect.state])).toEqual([['board', 'pending'], ['role', 'pending']])
    expect(JSON.stringify(effects)).not.toContain('never-store-token')
    const originalId = String(JSON.parse(proof.interaction.rawBody).id)
    const old = yield* Effect.promise(() => sign(`ck:roster:submit:${prepared.operationId}:2`, undefined, originalId, '1'))
    expect(yield* confirmRosterOperation(prepared.operationId, old, configuration)).toEqual(responses[0])
    expect(yield* confirmRosterOperation(prepared.operationId,
      { interaction: { ...old.interaction, signature: '00'.repeat(64) } }, configuration).pipe(Effect.flip)).toMatchObject({ _tag: 'Unauthenticated' })
  }).pipe(Effect.provide(Layer.merge(db, noDiscord)), Effect.scoped))
})

interface AdmissionCase {
  id: number; name: string; action: 'signup' | 'sub'; expected: 'accepted' | 'Conflict' | 'Forbidden'
  capacity?: number; perUser?: number; badSecondTownHall?: boolean; wrongClan?: boolean
  duringLookup?: 'transfer' | 'archive' | 'configuration' | 'missingGuild'
}
const admissionCases: AdmissionCase[] = [
  { id: 1, name: 'signup with selected group', action: 'signup', expected: 'accepted' },
  { id: 2, name: 'substitute in main group', action: 'sub', expected: 'accepted' },
  { id: 3, name: 'total capacity rollback', action: 'signup', expected: 'Conflict', capacity: 1 },
  { id: 4, name: 'per-user cap rollback', action: 'signup', expected: 'Conflict', perUser: 1 },
  { id: 5, name: 'second account TH rollback', action: 'signup', expected: 'Forbidden', badSecondTownHall: true },
  { id: 6, name: 'live clan mismatch', action: 'signup', expected: 'Forbidden', wrongClan: true },
  { id: 7, name: 'guild membership removed', action: 'signup', expected: 'Forbidden', duringLookup: 'missingGuild' },
  { id: 8, name: 'verified transfer during lookup', action: 'signup', expected: 'Forbidden', duringLookup: 'transfer' },
  { id: 9, name: 'board archived during lookup', action: 'signup', expected: 'Conflict', duringLookup: 'archive' },
  { id: 10, name: 'rules changed during lookup', action: 'signup', expected: 'Conflict', duringLookup: 'configuration' },
]
it.each(admissionCases)("confirms signed admission atomically: $name", async scenario => {
  const { action } = scenario
  const guildId = String(6834567890123456950n + BigInt(scenario.id))
  const userId = String(7834567890123456950n + BigInt(scenario.id))
  const tags = [`#9S${scenario.id}A`, `#9S${scenario.id}B`]
  const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair
  const configuration = { DISCORD_PUBLIC_KEY: hex(await crypto.subtle.exportKey('raw', keys.publicKey)), DISCORD_APPLICATION_ID: '9834567890123456951' }
  let sequence = 2834567890123456950n + BigInt(scenario.id) * 100n
  const sign = async (customId: string, values?: string[]) => {
    const timestamp = String(Math.floor(Date.now() / 1000)), rawBody = JSON.stringify({ id: String(sequence++),
      application_id: configuration.DISCORD_APPLICATION_ID, guild_id: guildId, channel_id: channel, type: 3,
      member: { user: { id: userId } }, message: { id: guildId },
      data: { custom_id: customId, component_type: values ? 3 : 2, ...(values ? { values } : {}) } })
    return { interaction: { rawBody, timestamp, signature: hex(await crypto.subtle.sign('Ed25519', keys.privateKey,
      new TextEncoder().encode(timestamp + rawBody))) } }
  }
  const fixture = await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${guildId}, 'Signed admission')`
    const roster = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, clan_tag, min_townhall, max_townhall,
      capacity, max_accounts_per_user, roster_role_id) VALUES (${guildId}, 'Admission', '#9SC', 16, 18,
        ${scenario.capacity ?? 2}, ${scenario.perUser ?? 2}, '4834567890123456951') RETURNING id::text`)[0]!.id
    const groupId = (yield* sql<{ id: string }>`INSERT INTO roster_member_groups (server_id, name) VALUES (${guildId}, 'War team') RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_member_group_settings (roster_id, server_id, member_group_id, role_id)
      VALUES (${roster}::uuid, ${guildId}, ${groupId}::uuid, '4834567890123456952')`
    for (const tag of tags) yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified) VALUES (${tag}, ${userId}, 'bot', false)`
    const publisher = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, state, channel_id, initial_interaction_id, stage, accepted_snapshot, submitted_at)
      VALUES (${roster}::uuid, ${guildId}, ${userId}, 'publish', 'completed', ${channel}, ${guildId}, 'done', '{}'::jsonb, now()) RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_publications (roster_id, server_id, channel_id, message_id, mode, creator_operation_id)
      VALUES (${roster}::uuid, ${guildId}, ${channel}, ${guildId}, 'signup', ${publisher}::uuid)`
    return { roster, groupId }
  }).pipe(Effect.provide(db), Effect.scoped))
  const discord = Layer.succeed(DiscordApi, { request: () => Effect.gen(function* () {
    if (scenario.duringLookup === 'missingGuild') return yield* new NotFound({ message: 'Guild member missing' })
    yield* Effect.promise(() => Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.withTransaction(sql`SELECT id FROM rosters WHERE id = ${fixture.roster}::uuid FOR UPDATE NOWAIT`)
      if (scenario.duringLookup === 'archive') yield* sql`UPDATE roster_publications SET state = 'archived' WHERE roster_id = ${fixture.roster}::uuid`
      if (scenario.duringLookup === 'configuration') yield* sql`UPDATE rosters SET min_townhall = 18 WHERE id = ${fixture.roster}::uuid`
      if (scenario.duringLookup === 'transfer') yield* addLink({ kind: 'bot' }, '7834567890123456999', {
        player_tag: tags[1]!, api_token: 'valid-local-fixture-token',
      }, { CLASH_PROXY: { fetch: async (request: Request) => request.url.endsWith('/verifytoken')
        ? Response.json({ status: 'ok' }) : Response.json({ tag: tags[1], name: 'Transferred', townHallLevel: 17 }) } })
    }).pipe(Effect.provide(db), Effect.scoped)))
    return { user: { id: userId, username: 'Signed guild member', avatar: null } }
  }), token: () => Effect.die('Unexpected OAuth') })
  const bindings = { CLASH_PROXY: { fetch: async (request: Request) => {
    const tag = decodeURIComponent(new URL(request.url).pathname.split('/').at(-1)!)
    return Response.json({ tag, name: 'Fresh player', townHallLevel: scenario.badSecondTownHall && tag === tags[1] ? 2 : 17,
      trophies: 5000, clan: { tag: scenario.wrongClan ? '#9SX' : '#9SC', name: 'Live clan' }, troops: [], spells: [], heroes: [] })
  } } } as Pick<WorkerBindings, 'CLASH_PROXY'>
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const prepared = yield* prepareRosterAction(yield* Effect.promise(() => sign(`ck:roster:${action}:${fixture.roster}`)), configuration)
    const selection = yield* verifyRosterInteraction(yield* Effect.promise(() => sign(`ck:roster:accounts:${prepared.operationId}:1`, tags)), configuration)
    yield* advanceRosterDraft(prepared.operationId, selection.interaction)
    if (action === 'signup') {
      const group = yield* verifyRosterInteraction(yield* Effect.promise(() => sign(`ck:roster:group:${prepared.operationId}:2`, [fixture.groupId])), configuration)
      yield* advanceRosterDraft(prepared.operationId, group.interaction)
    }
    const proof = yield* Effect.promise(() => sign(`ck:roster:submit:${prepared.operationId}:${action === 'signup' ? 3 : 2}`))
    if (scenario.expected !== 'accepted') {
      expect(yield* confirmRosterOperation(prepared.operationId, proof, configuration, bindings).pipe(Effect.flip)).toMatchObject({ _tag: scenario.expected })
      expect(yield* sql`SELECT tag FROM roster_members WHERE roster_id = ${fixture.roster}::uuid`).toEqual([])
      expect(yield* sql`SELECT revision::integer FROM rosters WHERE id = ${fixture.roster}::uuid`).toEqual([{ revision: 1 }])
      expect(yield* sql`SELECT state, accepted_snapshot FROM roster_runtime_operations WHERE id = ${prepared.operationId}::uuid`)
        .toEqual([{ state: 'preparing', accepted_snapshot: null }])
      expect(yield* sql`SELECT id FROM roster_runtime_effects WHERE operation_id = ${prepared.operationId}::uuid`).toEqual([])
      expect(yield* sql`SELECT interaction_id FROM roster_runtime_receipts WHERE interaction_id = ${String(JSON.parse(proof.interaction.rawBody).id)}`).toEqual([])
      if (scenario.duringLookup === 'transfer') expect(yield* sql`SELECT user_id, is_verified FROM player_links WHERE tag = ${tags[1]!}`)
        .toEqual([{ user_id: '7834567890123456999', is_verified: true }])
      return
    }
    expect(yield* confirmRosterOperation(prepared.operationId, proof, configuration, bindings)).toMatchObject({ outcome: 'accepted', action, state: 'submitted' })
    expect(yield* sql`SELECT tag, member_group_id::text, is_substitute, townhall, discord_user_id FROM roster_members
      WHERE roster_id = ${fixture.roster}::uuid ORDER BY tag`).toEqual(tags.map(tag => ({ tag, member_group_id: action === 'signup' ? fixture.groupId : null,
      is_substitute: action === 'sub', townhall: 17, discord_user_id: userId })))
    expect(yield* sql`SELECT count(*)::integer AS count FROM roster_runtime_effects WHERE operation_id = ${prepared.operationId}::uuid`)
      .toEqual([{ count: action === 'signup' ? 3 : 2 }])
    expect(yield* sql`SELECT revision::integer FROM rosters WHERE id = ${fixture.roster}::uuid`).toEqual([{ revision: 2 }])
  }).pipe(Effect.provide(Layer.merge(db, discord)), Effect.scoped))
})
