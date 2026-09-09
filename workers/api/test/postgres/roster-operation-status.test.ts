import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { pendingRosterOperations, resolveRosterOperationStatus } from "../../src/roster-operation-status.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const db = PgClient.layer({ url: Redacted.make(process.env.TEST_DATABASE_URL) })
const run = <A, E>(program: Effect.Effect<A, E, SqlClient.SqlClient>) => Effect.runPromise(program.pipe(Effect.provide(db), Effect.scoped))
const guild = "684000000000000001", actor = "784000000000000001", channel = "884000000000000001"
let sequence = 184000000000000001n
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("")
const signer = async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair
  const configuration = { DISCORD_PUBLIC_KEY: hex(await crypto.subtle.exportKey("raw", keys.publicKey)), DISCORD_APPLICATION_ID: "984000000000000001" }
  return { configuration, sign: async (operationId: string, options: {
    actor?: string; guild?: string; channel?: string; kind?: string; timestamp?: string;
  } = {}) => {
    const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000))
    const rawBody = JSON.stringify({ id: String(sequence++), application_id: configuration.DISCORD_APPLICATION_ID,
      guild_id: options.guild ?? guild, channel_id: options.channel ?? channel, member: { user: { id: options.actor ?? actor } },
      type: 3, data: { custom_id: `ck:roster:${options.kind ?? "status"}:${operationId}`, component_type: 2 }, token: "private-interaction-token" })
    return { interaction: { rawBody, timestamp, signature: hex(await crypto.subtle.sign("Ed25519", keys.privateKey,
      new TextEncoder().encode(timestamp + rawBody))) } }
  } }
}
const fixture = (state = "submitted", action = "signup", expired = false) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, rosterId = crypto.randomUUID(), operationId = crypto.randomUUID()
  const publisherId = crypto.randomUUID(), publicationId = crypto.randomUUID(), messageId = String(sequence++)
  yield* sql`INSERT INTO servers (id,name) VALUES (${guild},'Status fixture') ON CONFLICT DO NOTHING`
  yield* sql`INSERT INTO rosters (id,server_id,alias) VALUES (${rosterId}::uuid,${guild},${rosterId})`
  if (action !== "publish") {
    yield* sql`INSERT INTO roster_runtime_operations
      (id,roster_id,server_id,actor_user_id,action,state,channel_id,initial_interaction_id,stage,accepted_snapshot,submitted_at)
      VALUES (${publisherId}::uuid,${rosterId}::uuid,${guild},${actor},'publish','completed',${channel},${String(sequence++)},'done','{}',now())`
    yield* sql`INSERT INTO roster_publications (id,roster_id,server_id,channel_id,message_id,mode,creator_operation_id)
      VALUES (${publicationId}::uuid,${rosterId}::uuid,${guild},${channel},${messageId},'signup',${publisherId}::uuid)`
  }
  yield* sql`INSERT INTO roster_runtime_operations
    (id,roster_id,server_id,actor_user_id,action,state,source_publication_id,channel_id,initial_interaction_id,
      draft,accepted_snapshot,created_at,expires_at,submitted_at)
    VALUES (${operationId}::uuid,${rosterId}::uuid,${guild},${actor},${action},${state},${action === "publish" ? null : publicationId}::uuid,
      ${channel},${String(sequence++)},'{"answers":["private-answer"]}',${state === "preparing" ? null : '{"private":"accepted-secret"}'}::jsonb,
      now()-(${expired ? 20 : 0}*interval '1 minute'),now()+(${expired ? -10 : 10}*interval '1 minute'),
      CASE WHEN ${state}='preparing' THEN NULL ELSE now()-(${expired ? 20 : 0}*interval '1 minute') END)`
  return { operationId, rosterId, publicationId, messageId }
})

describe("signed roster operation status", () => {
  it("returns only the actor-scoped recorded board and leaves durable state unchanged", async () => {
    const current = await run(fixture()), { sign, configuration } = await signer()
    const before = await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT xmin::text FROM roster_runtime_operations WHERE id=${current.operationId}::uuid`
    }))
    const result = await run(resolveRosterOperationStatus(current.operationId, await sign(current.operationId), configuration))
    expect(result).toEqual({ response: { operationId: current.operationId, rosterId: current.rosterId, action: "signup",
      state: "submitted", channelId: channel, messageId: current.messageId }, serverId: guild, rosterId: current.rosterId, shouldWake: true })
    expect(JSON.stringify(result)).not.toMatch(/private-answer|accepted-secret|private-interaction-token/u)
    await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      expect(yield* sql`SELECT xmin::text FROM roster_runtime_operations WHERE id=${current.operationId}::uuid`).toEqual(before)
      expect(yield* sql`SELECT interaction_id FROM roster_runtime_receipts WHERE operation_id=${current.operationId}::uuid`).toHaveLength(0)
      expect(yield* sql`SELECT id FROM roster_runtime_effects WHERE operation_id=${current.operationId}::uuid`).toHaveLength(0)
    }))
  })
  it("rejects other actors, guilds, channels, controls and path operation IDs", async () => {
    const current = await run(fixture()), { sign, configuration } = await signer()
    for (const options of [{ actor: "784000000000000002" }, { guild: "684000000000000002" },
      { channel: "884000000000000002" }, { kind: "publication-status" }, { kind: "signup" }]) {
      await expect(run(resolveRosterOperationStatus(current.operationId, await sign(current.operationId, options), configuration)))
        .rejects.toMatchObject({ _tag: "Forbidden" })
    }
    await expect(run(resolveRosterOperationStatus(crypto.randomUUID(), await sign(current.operationId), configuration)))
      .rejects.toMatchObject({ _tag: "Forbidden" })
  })
  it("requires a fresh independently valid signature even for completed or expired operations", async () => {
    const current = await run(fixture("completed", "remove", true)), { sign, configuration } = await signer()
    const valid = await sign(current.operationId)
    expect((await run(resolveRosterOperationStatus(current.operationId, valid, configuration))).shouldWake).toBe(false)
    await expect(run(resolveRosterOperationStatus(current.operationId, { interaction: { ...valid.interaction, signature: "00".repeat(64) } }, configuration)))
      .rejects.toMatchObject({ _tag: "Unauthenticated" })
    await expect(run(resolveRosterOperationStatus(current.operationId, await sign(current.operationId, { timestamp: "1" }), configuration)))
      .rejects.toMatchObject({ _tag: "Unauthenticated" })
  })
  it("does not invent a publication message before confirmed creation and separates publication status controls", async () => {
    const current = await run(fixture("submitted", "publish")), { sign, configuration } = await signer()
    const proof = await sign(current.operationId, { kind: "publication-status" })
    expect((await run(resolveRosterOperationStatus(current.operationId, proof, configuration, "publication-status"))).response)
      .not.toHaveProperty("messageId")
    await expect(run(resolveRosterOperationStatus(current.operationId, await sign(current.operationId), configuration)))
      .rejects.toMatchObject({ _tag: "Forbidden" })
    await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO roster_publications (id,roster_id,server_id,channel_id,message_id,mode,creator_operation_id)
        VALUES (${current.publicationId}::uuid,${current.rosterId}::uuid,${guild},${channel},${current.messageId},'signup',${current.operationId}::uuid)`
      yield* sql`UPDATE roster_runtime_operations SET state='completed' WHERE id=${current.operationId}::uuid`
    }))
    expect(await run(resolveRosterOperationStatus(current.operationId, proof, configuration, "publication-status")))
      .toMatchObject({ response: { state: "completed", messageId: current.messageId }, shouldWake: false })
  })
  it("uses a fixed safe failure response and excludes terminal/preparing jobs from recovery", async () => {
    const { sign, configuration } = await signer()
    for (const state of ["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"]) {
      const current = await run(fixture(state))
      if (state === "failed") await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
        const scope = `board:${current.publicationId}`
        yield* sql`INSERT INTO roster_runtime_effect_scopes (scope_key,server_id) VALUES (${scope},${guild})`
        yield* sql`INSERT INTO roster_runtime_effects (operation_id,server_id,scope_key,kind,state,payload,failure_code)
          VALUES (${current.operationId}::uuid,${guild},${scope},'board','failed','{"secret":"provider-payload"}','private-provider-error')`
      }))
      const result = await run(resolveRosterOperationStatus(current.operationId, await sign(current.operationId), configuration))
      expect(result.shouldWake).toBe(["submitted", "provisioning", "reconciling"].includes(state))
      if (state === "failed") expect(result.response.failure).toBe("Roster synchronization failed")
      else expect(result.response).not.toHaveProperty("failure")
      expect(JSON.stringify(result)).not.toMatch(/provider-payload|private-provider-error/u)
      const { jobs: pending } = await run(pendingRosterOperations())
      expect(pending.some(row => row.id === current.operationId)).toBe(result.shouldWake)
      expect(pending.every(row => Object.keys(row).sort().join(",") === "id,roster_id,server_id")).toBe(true)
    }
  })
  it("pages past a hundred permanently pending operations without requiring a state change", async () => {
    const current = await run(fixture())
    const created = await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      return yield* sql<{ id: string; position: number }>`INSERT INTO roster_runtime_operations
        (roster_id,server_id,actor_user_id,action,state,source_publication_id,channel_id,initial_interaction_id,accepted_snapshot,submitted_at,updated_at)
        SELECT ${current.rosterId}::uuid,${guild},${actor},'signup','submitted',${current.publicationId}::uuid,${channel},
          (384000000000000000::bigint+position)::text,'{}',now(),'2000-01-01'::timestamptz+position*interval '1 second'
        FROM generate_series(1,105) AS position RETURNING id::text,(initial_interaction_id::bigint-384000000000000000)::integer AS position`
    }))
    const ordered = [...created].sort((left,right) => left.position-right.position)
    const first = await run(pendingRosterOperations())
    expect(first.jobs.map(row => row.id)).toEqual(ordered.slice(0,100).map(row => row.id))
    expect(first.nextCursor).toBeDefined()
    const second = await run(pendingRosterOperations(first.nextCursor))
    expect(second.jobs.slice(0,5).map(row => row.id)).toEqual(ordered.slice(100).map(row => row.id))
    expect(second.nextCursor).toBeUndefined()
    // Retries modified after the scan watermark are deferred to a fresh scan,
    // not reread indefinitely after the current cursor.
    await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE roster_runtime_operations SET updated_at=clock_timestamp() WHERE id=${ordered[0]!.id}::uuid`
    }))
    expect((await run(pendingRosterOperations(first.nextCursor))).jobs.some(row => row.id===ordered[0]!.id)).toBe(false)
    expect((await run(pendingRosterOperations())).jobs.map(row => row.id)).toEqual(ordered.slice(1,101).map(row => row.id))
    await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE roster_runtime_operations SET updated_at='2000-01-01 00:00:00.000001+00'
        WHERE id=ANY(${ordered.map(row=>row.id)}::uuid[])`
    }))
    const tiedIds = ordered.map(row=>row.id).sort(), tied = await run(pendingRosterOperations())
    expect(tied.jobs.map(row=>row.id)).toEqual(tiedIds.slice(0,100))
    expect(tied.nextCursor?.updatedAt).toContain(".000001")
    expect((await run(pendingRosterOperations(tied.nextCursor))).jobs.slice(0,5).map(row=>row.id)).toEqual(tiedIds.slice(100))
  })
  it("returns not found for a valid signed status on a nonexistent operation", async () => {
    const id = crypto.randomUUID(), { sign, configuration } = await signer()
    await expect(run(resolveRosterOperationStatus(id, await sign(id), configuration))).rejects.toMatchObject({ _tag: "NotFound" })
  })
})
