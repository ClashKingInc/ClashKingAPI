import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { prepareRosterAction } from "../../src/roster-interaction-prepare.js"
import { advanceRosterDraft } from "../../src/roster-interaction-store.js"
import { verifyRosterInteraction } from "../../src/roster-interaction-identity.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const layer = PgClient.layer({ url: Redacted.make(databaseUrl) })
const serverId = "6834567890123456901", actorId = "7834567890123456901", channelId = "8834567890123456901"
const messageId = "1834567890123456901"
const hex = (value: ArrayBuffer) => [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, "0")).join("")

it("prepares a signed board click once, offers canonical unverified ownership, and preserves exact expired replay", async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair
  const configuration = { DISCORD_PUBLIC_KEY: hex(await crypto.subtle.exportKey("raw", keys.publicKey)), DISCORD_APPLICATION_ID: "9834567890123456901" }
  const sign = async (rosterId: string, id: string, timestamp = String(Math.floor(Date.now() / 1000)),
    overrides: { action?: string; message?: string; guild?: string; channel?: string; values?: string[]; customId?: string } = {}) => {
    const rawBody = JSON.stringify({ id, application_id: configuration.DISCORD_APPLICATION_ID, type: 3,
      guild_id: overrides.guild ?? serverId, channel_id: overrides.channel ?? channelId, member: { user: { id: actorId } }, message: { id: overrides.message ?? messageId },
      data: { component_type: overrides.values ? 3 : 2, custom_id: overrides.customId ?? `ck:roster:${overrides.action ?? 'signup'}:${rosterId}`,
        ...(overrides.values ? { values: overrides.values } : {}) }, token: "never-persist-this" })
    return { interaction: { rawBody, timestamp,
      signature: hex(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(timestamp + rawBody))) } }
  }
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Signed roster preparation')`
    const rosterId = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias) VALUES (${serverId}, 'Roster') RETURNING id::text`)[0]!.id
    const publisher = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, state, channel_id, initial_interaction_id, stage, accepted_snapshot, submitted_at)
      VALUES (${rosterId}::uuid, ${serverId}, ${actorId}, 'publish', 'completed', ${channelId}, '2834567890123456901', 'done', '{}'::jsonb, now()) RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_publications (roster_id, server_id, channel_id, message_id, mode, creator_operation_id)
      VALUES (${rosterId}::uuid, ${serverId}, ${channelId}, ${messageId}, 'signup', ${publisher}::uuid)`
    const configuredGroup = (yield* sql<{ id: string }>`INSERT INTO roster_member_groups (server_id, name)
      VALUES (${serverId}, 'War team') RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_member_group_settings (roster_id, member_group_id, server_id)
      VALUES (${rosterId}::uuid, ${configuredGroup}::uuid, ${serverId})`
    yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified) VALUES ('#9QP', ${actorId}, 'bot', false), ('#9QQ', '7834567890123456902', 'bot', true)`
    const proof = yield* Effect.promise(() => sign(rosterId, '3834567890123456901'))
    const results = yield* Effect.all([prepareRosterAction(proof, configuration), prepareRosterAction(proof, configuration)], { concurrency: 2 })
    expect(results[0]).toEqual(results[1])
    expect(results[0]).toMatchObject({ outcome: 'ready', rosterId, action: 'signup', form: {
      kind: 'account_select', options: [{ value: '#9QP', label: '#9QP' }],
    } })
    const old = yield* Effect.promise(() => sign(rosterId, '3834567890123456901', '1'))
    expect(yield* prepareRosterAction(old, configuration)).toEqual(results[0])
    const receipts = yield* sql`SELECT response FROM roster_runtime_receipts WHERE interaction_id = '3834567890123456901'`
    expect(receipts).toHaveLength(1)
    expect(JSON.stringify(receipts)).not.toContain('never-persist-this')
    expect(yield* sql`SELECT count(*)::integer AS count FROM roster_runtime_operations WHERE action = 'signup' AND roster_id = ${rosterId}::uuid`).toEqual([{ count: 1 }])
    const operationId = results[0]!.operationId
    const accountStep = yield* verifyRosterInteraction(yield* Effect.promise(() => sign(rosterId, '3834567890123456920', undefined,
      { customId: `ck:roster:accounts:${operationId}:1`, values: ['#9QP'] })), configuration)
    const groupForm = yield* advanceRosterDraft(operationId, accountStep.interaction)
    const groupStep = yield* verifyRosterInteraction(yield* Effect.promise(() => sign(rosterId, '3834567890123456921', undefined,
      { customId: `ck:roster:group:${operationId}:2`, values: ['main'] })), configuration)
    yield* sql`UPDATE player_links SET user_id = '7834567890123456902' WHERE tag = '#9QP'`
    expect(yield* advanceRosterDraft(operationId, groupStep.interaction).pipe(Effect.flip)).toMatchObject({ _tag: 'Conflict' })
    expect(yield* advanceRosterDraft(operationId, accountStep.interaction)).toEqual(groupForm)
    yield* sql`UPDATE player_links SET user_id = ${actorId} WHERE tag = '#9QP'`
    yield* sql`UPDATE rosters SET signup_questions = '[{"id":"ready","label":"Ready?","type":"boolean","required":true,"order":0,"options":[]}]'::jsonb WHERE id = ${rosterId}::uuid`
    expect(yield* advanceRosterDraft(operationId, groupStep.interaction).pipe(Effect.flip)).toMatchObject({ _tag: 'Conflict' })
    yield* sql`UPDATE rosters SET signup_questions = '[]'::jsonb, min_townhall = 18 WHERE id = ${rosterId}::uuid`
    expect(yield* advanceRosterDraft(operationId, groupStep.interaction).pipe(Effect.flip)).toMatchObject({ _tag: 'Conflict' })
    expect(yield* advanceRosterDraft(operationId, accountStep.interaction)).toEqual(groupForm)
    yield* sql`UPDATE rosters SET min_townhall = NULL WHERE id = ${rosterId}::uuid`
    yield* sql`UPDATE roster_member_group_settings SET signup_enabled = false WHERE roster_id = ${rosterId}::uuid AND member_group_id = ${configuredGroup}::uuid`
    expect(yield* advanceRosterDraft(operationId, groupStep.interaction).pipe(Effect.flip)).toMatchObject({ _tag: 'Conflict' })
    expect(yield* advanceRosterDraft(operationId, accountStep.interaction)).toEqual(groupForm)
    expect(yield* prepareRosterAction({ interaction: { ...proof.interaction, signature: '00'.repeat(64) } }, configuration).pipe(Effect.flip))
      .toMatchObject({ _tag: 'Unauthenticated' })
    const freshExpired = yield* Effect.promise(() => sign(rosterId, '3834567890123456902', '1'))
    expect(yield* prepareRosterAction(freshExpired, configuration).pipe(Effect.flip)).toMatchObject({ _tag: 'Unauthenticated' })
    for (const [index, overrides] of [{ message: '1834567890123456902' }, { channel: '8834567890123456902' }].entries()) {
      const wrongSource = yield* Effect.promise(() => sign(rosterId, String(3834567890123456910n + BigInt(index)), undefined, overrides))
      expect(yield* prepareRosterAction(wrongSource, configuration).pipe(Effect.flip)).toMatchObject({ _tag: 'Forbidden' })
    }
    // Removal uses current canonical ownership, not stored Discord identity or TH eligibility.
    yield* sql`UPDATE rosters SET min_townhall = 18 WHERE id = ${rosterId}::uuid`
    yield* sql`INSERT INTO roster_members (roster_id, tag, name, townhall, discord_user_id)
      VALUES (${rosterId}::uuid, '#9QP', 'Owned but no longer eligible', 2, '7834567890123456902'),
        (${rosterId}::uuid, '#9QQ', 'Foreign cached as actor', 18, ${actorId})`
    const removal = yield* prepareRosterAction(yield* Effect.promise(() => sign(rosterId, '3834567890123456903', undefined, { action: 'remove' })), configuration)
    expect(removal).toMatchObject({ action: 'remove', form: { kind: 'account_select', options: [{ value: '#9QP' }] } })
    yield* sql`UPDATE rosters SET min_townhall = 19, capacity = 1 WHERE id = ${rosterId}::uuid`
    const select = yield* verifyRosterInteraction(yield* Effect.promise(() => sign(rosterId, '3834567890123456904', undefined,
      { customId: `ck:roster:accounts:${removal.operationId}:1`, values: ['#9QP'] })), configuration)
    expect(yield* advanceRosterDraft(removal.operationId, select.interaction)).toMatchObject({ form: { kind: 'continue',
      customId: `ck:roster:submit:${removal.operationId}:2` } })
    yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES ('#9QR', ${actorId}, 'bot')`
    yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified) VALUES ('#9QS', ${actorId}, 'bot', false), ('#9QT', ${actorId}, 'bot', false)`
    yield* sql`INSERT INTO basic_player (tag, name, townhall_level) VALUES ('#9QS', 'Below minimum', 2), ('#9QT', 'Eligible', 19)`
    yield* sql`INSERT INTO player_profile_details (player_tag, townhall_level) VALUES ('#9QS', 2), ('#9QT', 19)`
    const filtered = yield* prepareRosterAction(yield* Effect.promise(() => sign(rosterId, '3834567890123456930')), configuration)
    expect(filtered).toMatchObject({ form: { options: [{ value: '#9QR' }, { value: '#9QT' }] } })
    yield* sql`UPDATE player_profile_details SET observed_at = now() - interval '16 minutes' WHERE player_tag = '#9QS'`
    const stale = yield* prepareRosterAction(yield* Effect.promise(() => sign(rosterId, '3834567890123456931')), configuration)
    expect(stale).toMatchObject({ form: { options: [{ value: '#9QR' }, { value: '#9QS' }, { value: '#9QT' }] } })
    const excessGroups = yield* sql<{ id: string }>`INSERT INTO roster_member_groups (server_id, name, position)
      SELECT ${serverId}, 'Group ' || number, number FROM generate_series(1, 25) number RETURNING id::text`
    for (const group of excessGroups) yield* sql`INSERT INTO roster_member_group_settings (roster_id, member_group_id, server_id)
      VALUES (${rosterId}::uuid, ${group.id}::uuid, ${serverId})`
    expect(yield* prepareRosterAction(yield* Effect.promise(() => sign(rosterId, '3834567890123456906')), configuration).pipe(Effect.flip))
      .toMatchObject({ _tag: 'Conflict', message: 'This roster has more than 24 enabled signup groups; repair its group configuration' })
    yield* sql`UPDATE roster_publications SET state = 'archived' WHERE message_id = ${messageId}`
    expect(yield* prepareRosterAction(yield* Effect.promise(() => sign(rosterId, '3834567890123456905')), configuration).pipe(Effect.flip))
      .toMatchObject({ _tag: 'Forbidden' })
    expect(yield* prepareRosterAction(old, configuration)).toEqual(results[0])
    expect(yield* sql`SELECT count(*)::integer AS count FROM roster_runtime_operations WHERE roster_id = ${rosterId}::uuid`).toEqual([{ count: 5 }])
  }).pipe(Effect.provide(layer), Effect.scoped))
})
