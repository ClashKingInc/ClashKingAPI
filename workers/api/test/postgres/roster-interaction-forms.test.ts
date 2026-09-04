import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { advanceRosterDraft } from "../../src/roster-interaction-store.js"
import { createRosterForm } from "../../src/roster-interaction-forms.js"
import { verifyRosterInteraction } from "../../src/roster-interaction-identity.js"
import { readRosterPreparationConfiguration } from "../../src/roster-interaction-configuration.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const layer = PgClient.layer({ url: Redacted.make(databaseUrl) })
const serverId = "6834567890123456781", actorId = "7834567890123456781", channelId = "8834567890123456781"
const hex = (value: ArrayBuffer) => [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("")

it("persists signed form progress once under concurrent replay and returns the immutable receipt", async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair
  const configuration = { DISCORD_PUBLIC_KEY: hex(await crypto.subtle.exportKey("raw", keys.publicKey)), DISCORD_APPLICATION_ID: "9834567890123456781" }
  const sign = async (operationId: string, id: string, actor = actorId, timestamp = String(Math.floor(Date.now() / 1000))) => {
    const rawBody = JSON.stringify({ id, application_id: configuration.DISCORD_APPLICATION_ID, type: 3,
      guild_id: serverId, channel_id: channelId, member: { user: { id: actor } }, message: { id: "1834567890123456781" },
      data: { component_type: 3, custom_id: `ck:roster:accounts:${operationId}:1`, values: ["#2PP"] }, token: "not-a-stored-value" })
    return { interaction: { rawBody, timestamp,
      signature: hex(await crypto.subtle.sign("Ed25519", keys.privateKey, new TextEncoder().encode(timestamp + rawBody))) } }
  }
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Roster form receipts')`
    const roster = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias) VALUES (${serverId}, 'Roster') RETURNING id::text`)[0]!.id
    const publisher = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, state, channel_id, initial_interaction_id, stage, accepted_snapshot, submitted_at)
      VALUES (${roster}::uuid, ${serverId}, ${actorId}, 'publish', 'completed', ${channelId}, '2834567890123456781', 'done', '{}'::jsonb, now()) RETURNING id::text`)[0]!.id
    const publication = (yield* sql<{ id: string }>`INSERT INTO roster_publications
      (roster_id, server_id, channel_id, message_id, mode, creator_operation_id)
      VALUES (${roster}::uuid, ${serverId}, ${channelId}, '3834567890123456781', 'signup', ${publisher}::uuid) RETURNING id::text`)[0]!.id
    const initial = yield* createRosterForm({ accounts: [{ tag: '#2PP', label: 'Player' }], groups: [], questions: [] })
    yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES ('#2PP', ${actorId}, 'bot')`
    const configurationState = yield* readRosterPreparationConfiguration(sql, serverId, roster)
    const operationId = (yield* sql<{ id: string }>`INSERT INTO roster_runtime_operations
      (roster_id, server_id, actor_user_id, action, source_publication_id, channel_id, initial_interaction_id, draft)
      VALUES (${roster}::uuid, ${serverId}, ${actorId}, 'signup', ${publication}::uuid, ${channelId}, '4834567890123456781', ${JSON.stringify({ ...initial.draft, configurationFingerprint: configurationState.fingerprint })}::jsonb) RETURNING id::text`)[0]!.id
    const proof = yield* Effect.promise(() => sign(operationId, '5834567890123456781'))
    const verified = yield* verifyRosterInteraction(proof, configuration)
    const responses = yield* Effect.all([advanceRosterDraft(operationId, verified.interaction), advanceRosterDraft(operationId, verified.interaction)], { concurrency: 2 })
    expect(responses[0]).toEqual(responses[1])
    expect(responses[0]).toMatchObject({ outcome: 'ready', operationId, rosterId: roster, form: { kind: 'string_select', customId: `ck:roster:group:${operationId}:2` } })
    expect(yield* sql`SELECT version, stage FROM roster_runtime_operations WHERE id = ${operationId}::uuid`).toEqual([{ version: 2, stage: 'group' }])
    const receipts = yield* sql<{ response: unknown }>`SELECT response FROM roster_runtime_receipts WHERE operation_id = ${operationId}::uuid`
    expect(receipts).toHaveLength(1)
    expect(JSON.stringify(receipts)).not.toContain('not-a-stored-value')
    const oldProof = yield* Effect.promise(() => sign(operationId, '5834567890123456781', actorId, '1'))
    const old = yield* verifyRosterInteraction(oldProof, configuration)
    expect(yield* advanceRosterDraft(operationId, old.interaction)).toEqual(responses[0])
    const stale = yield* verifyRosterInteraction(yield* Effect.promise(() => sign(operationId, '5834567890123456782')), configuration)
    expect(yield* advanceRosterDraft(operationId, stale.interaction).pipe(Effect.flip)).toMatchObject({ _tag: 'Conflict' })
    const foreign = yield* verifyRosterInteraction(yield* Effect.promise(() => sign(operationId, '5834567890123456783', '7834567890123456782')), configuration)
    expect(yield* advanceRosterDraft(operationId, foreign.interaction).pipe(Effect.flip)).toMatchObject({ _tag: 'Forbidden' })
    const conflicting = yield* verifyRosterInteraction(yield* Effect.promise(() => sign(operationId, '5834567890123456781', '7834567890123456782')), configuration)
    expect(yield* advanceRosterDraft(operationId, conflicting.interaction).pipe(Effect.flip)).toMatchObject({ _tag: 'Conflict' })
    const expired = yield* verifyRosterInteraction(yield* Effect.promise(() => sign(operationId, '5834567890123456784', actorId, '1')), configuration)
    expect(yield* advanceRosterDraft(operationId, expired.interaction).pipe(Effect.flip)).toMatchObject({ _tag: 'Unauthenticated' })
    yield* sql`UPDATE roster_publications SET state = 'archived' WHERE id = ${publication}::uuid`
    expect(yield* advanceRosterDraft(operationId, stale.interaction).pipe(Effect.flip)).toMatchObject({ _tag: 'Conflict' })
    expect(yield* advanceRosterDraft(operationId, old.interaction)).toEqual(responses[0])
    expect(yield* sql`SELECT count(*)::integer AS count FROM roster_runtime_receipts WHERE operation_id = ${operationId}::uuid`)
      .toEqual([{ count: 1 }])
  }).pipe(Effect.provide(layer), Effect.scoped))
})
