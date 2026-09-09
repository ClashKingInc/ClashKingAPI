import { createHash } from "node:crypto"
import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { ticketAccountInteraction } from "../../src/ticket-account-runtime.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { VerifiedRuntimeInteraction } from "../../src/runtime-interaction.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const database = PgClient.layer({ url: Redacted.make(process.env.TEST_DATABASE_URL), maxConnections: 5 })
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | DiscordApi>) => Effect.runPromise(effect.pipe(
  Effect.provideService(DiscordApi, { request: () => Effect.succeed({ id: guild, owner_id: "943000000000009999" }), token: () => Effect.die("Unexpected OAuth") }),
  Effect.provide(database), Effect.scoped))
const guild = "943000000000000001", channel = "943000000000000002", message = "943000000000000003", actor = "943000000000000004"
let counter = 943000000000000100n
const proof = (customId: string, overrides: Partial<VerifiedRuntimeInteraction> = {}): VerifiedRuntimeInteraction => {
  const value = { id: String(counter++), actorId: actor, actorLabel: "Viewer", actorRoleIds: [], guildId: guild, channelId: channel,
    messageId: message, permissions: "0", type: 3 as const, data: { custom_id: customId, component_type: 2 }, signedAt: Date.now(), ...overrides }
  return { ...value, requestHash: createHash("sha256").update(JSON.stringify(value)).digest("hex") }
}
const fixture = (suffix: string, accounts = ["#PYL", "#PYC"]) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const channel = String(943000000000001000n + BigInt(suffix))
  const panelId = `94000000-0000-4000-8000-0000000000${suffix}`, ticketId = `95000000-0000-4000-8000-0000000000${suffix}`
  const operationId = `96000000-0000-4000-8000-0000000000${suffix}`, buttonId = `97000000-0000-4000-8000-0000000000${suffix}`
  const interactionId = String(counter++)
  yield* sql`INSERT INTO servers (id,name) VALUES (${guild},'Account viewer fixture') ON CONFLICT DO NOTHING`
  yield* sql`INSERT INTO ticket_panels (id,server_id,name,components,data) VALUES (${panelId}::uuid,${guild},${`Account viewer ${suffix}`},'[]','{}')`
  yield* sql`INSERT INTO tickets (id,server_id,channel_id,number,panel_id,applicant_user_id,applicant_accounts)
    VALUES (${ticketId}::uuid,${guild},${channel},${Number(suffix)},${panelId}::uuid,${actor},${accounts}::text[])`
  yield* sql`INSERT INTO ticket_runtime_operations (id,interaction_id,action,ticket_id,ticket_number,server_id,actor_user_id,panel_id,button_id,
    origin_channel_id,origin_message_id,context,request,request_hash,progress,submission_interaction_id,submitted_request,submitted_request_hash,state)
    VALUES (${operationId}::uuid,${interactionId},'open',${ticketId}::uuid,${Number(suffix)},${guild},${actor},${panelId}::uuid,${buttonId}::uuid,
      ${channel},${message},'{}','{}',${"a".repeat(64)},'{}',${String(counter++)},'{}',${"b".repeat(64)},'completed')`
  yield* sql`INSERT INTO ticket_runtime_effects (operation_id,effect_key,ordinal,effect_type,request,state,result)
    VALUES (${operationId}::uuid,'application:0',0,'send_message','{}','succeeded',${JSON.stringify({ id: message, channelId: channel })}::jsonb)`
  return { ticketId, panelId, operationId,
    proof: (customId: string, overrides: Partial<VerifiedRuntimeInteraction> = {}) => proof(customId, { channelId: channel, ...overrides }),
    select: (sessionId: string, tag: string, overrides: Partial<VerifiedRuntimeInteraction> = {}) => select(sessionId, tag, { channelId: channel, ...overrides }),
  }
})
const select = (sessionId: string, tag: string, overrides: Partial<VerifiedRuntimeInteraction> = {}) => proof(`ck:ticket:account-view:${sessionId}`, {
  messageId: "943000000000000099", data: { custom_id: `ck:ticket:account-view:${sessionId}`, component_type: 3, values: [tag] }, ...overrides,
})
const threadFixture = (suffix: string) => Effect.gen(function* () {
  const current = yield* fixture(suffix), sql = yield* SqlClient.SqlClient
  const threadId = String(943000000000002000n + BigInt(suffix)), threadMessage = String(943000000000003000n + BigInt(suffix))
  yield* sql`UPDATE tickets SET thread_id=${threadId} WHERE id=${current.ticketId}::uuid`
  yield* sql`INSERT INTO ticket_runtime_effects (operation_id,effect_key,ordinal,effect_type,request,state,result)
    VALUES (${current.operationId}::uuid,'thread-application:0',1,'send_message','{}','succeeded',${JSON.stringify({ id: threadMessage, channelId: threadId })}::jsonb)`
  return { ...current, threadId, threadMessage,
    threadProof: (overrides: Partial<VerifiedRuntimeInteraction> = {}) => current.proof(`ck:ticket:accounts-view:${current.ticketId}`,
      { channelId: threadId, messageId: threadMessage, permissions: "32", ...overrides }),
    threadSelect: (sessionId: string, overrides: Partial<VerifiedRuntimeInteraction> = {}) => current.select(sessionId, "#PYL",
      { channelId: threadId, permissions: "32", ...overrides }),
  }
})

describe("ticket account viewer durable scope", () => {
  it("uses current delegated staff grants and refuses a session after the grant is revoked", () => run(Effect.gen(function* () {
    const current = yield* threadFixture("10"), sql = yield* SqlClient.SqlClient, role = "943000000000008001"
    yield* sql`INSERT INTO dashboard_role_grants (server_id,role_id,section,access_level) VALUES (${guild},${role},'tickets','manage')`
    const roles = { permissions: "0", actorRoleIds: [role] }
    const prepared = yield* ticketAccountInteraction(current.threadProof(roles))
    if (prepared.outcome !== "accounts") throw new Error("Expected account viewer")
    expect(yield* ticketAccountInteraction(current.threadSelect(prepared.sessionId, roles))).toMatchObject({ outcome: "account" })
    yield* sql`DELETE FROM dashboard_role_grants WHERE server_id=${guild} AND role_id=${role} AND section='tickets'`
    expect(yield* ticketAccountInteraction(current.threadSelect(prepared.sessionId, roles)).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
  })))
  it("resolves guild ownership outside SQL locks and rejects a panel change during that lookup", async () => {
    const current = await run(threadFixture("11"))
    const discord = { request: () => Effect.tryPromise({ try: () => run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.withTransaction(Effect.gen(function* () {
        yield* sql`SET LOCAL lock_timeout='500ms'`
        yield* sql`UPDATE ticket_panels SET updated_at=updated_at+interval '1 microsecond' WHERE id=${current.panelId}::uuid`
      }))
      return { id: guild, owner_id: actor }
    })), catch: () => { throw new Error("Guild lookup held ticket or panel locks") } }), token: () => Effect.die("Unexpected OAuth") }
    await expect(run(ticketAccountInteraction(current.threadProof({ permissions: "0" })).pipe(
      Effect.provideService(DiscordApi, discord)))).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      return yield* sql`SELECT id FROM ticket_account_preparations WHERE ticket_id=${current.ticketId}::uuid`
    }))).toHaveLength(0)
  })
  it("binds a staff-thread viewer to its canonical message and rechecks staff on selections and replay", () => run(Effect.gen(function* () {
    const current = yield* threadFixture("08")
    const initial = current.threadProof()
    const prepared = yield* ticketAccountInteraction(initial)
    if (prepared.outcome !== "accounts") throw new Error("Expected account viewer")
    expect(yield* ticketAccountInteraction(initial)).toEqual(prepared)
    const chosen = current.threadSelect(prepared.sessionId)
    expect(yield* ticketAccountInteraction(chosen)).toMatchObject({ outcome: "account", account: { tag: "#PYL" } })
    expect(yield* ticketAccountInteraction({ ...chosen, permissions: "0" }).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(yield* ticketAccountInteraction(current.threadProof({ messageId: message })).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(yield* ticketAccountInteraction(current.select(prepared.sessionId, "#PYL")).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    // Being the original applicant is not staff-thread authorization.
    expect(yield* ticketAccountInteraction(current.threadProof({ permissions: "0" })).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
  })))
  it("rejects a replaced, deleted, or mismatched staff-thread source", () => run(Effect.gen(function* () {
    const current = yield* threadFixture("09"), sql = yield* SqlClient.SqlClient
    const prepared = yield* ticketAccountInteraction(current.threadProof())
    if (prepared.outcome !== "accounts") throw new Error("Expected account viewer")
    // Resource evidence is immutable; replacement of the ticket's thread must
    // not make the old message or an old viewer session valid in the new one.
    yield* sql`UPDATE tickets SET thread_id='943000000000003998' WHERE id=${current.ticketId}::uuid`
    expect(yield* ticketAccountInteraction(current.threadSelect(prepared.sessionId)).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
    expect(yield* ticketAccountInteraction(current.threadProof({ channelId: "943000000000003998" })).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
    expect(yield* ticketAccountInteraction(current.threadProof()).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
    yield* sql`UPDATE tickets SET thread_id=NULL WHERE id=${current.ticketId}::uuid`
    expect(yield* ticketAccountInteraction(current.threadProof()).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
  })))
  it("opens a single applicant account directly without a redundant selector", () => run(Effect.gen(function* () {
    const current = yield* fixture("06", ["#PYL"])
    const initial = current.proof(`ck:ticket:accounts-view:${current.ticketId}`)
    const result = yield* ticketAccountInteraction(initial)
    expect(result).toMatchObject({ outcome: "account", ticketId: current.ticketId, account: { tag: "#PYL" } })
    expect(result).not.toHaveProperty("select")
    expect(yield* ticketAccountInteraction(initial)).toEqual(result)
  })))
  it("prepares and selects only issued applicant accounts, replaying exact receipts without raw proofs", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, current = yield* fixture("01")
    const initial = current.proof(`ck:ticket:accounts-view:${current.ticketId}`)
    const prepared = yield* ticketAccountInteraction(initial)
    if (prepared.outcome !== "accounts") throw new Error("Expected account viewer")
    expect(prepared).toMatchObject({ ticketId: current.ticketId, accounts: [{ tag: "#PYL" }, { tag: "#PYC" }] })
    expect(prepared.select.customId).toBe(`ck:ticket:account-view:${prepared.sessionId}`)
    expect(yield* ticketAccountInteraction(initial)).toEqual(prepared)
    expect(yield* ticketAccountInteraction({ ...initial, requestHash: "d".repeat(64) }).pipe(Effect.flip)).toMatchObject({ _tag: "Conflict" })
    const selected = current.select(prepared.sessionId, "#PYL")
    const result = yield* ticketAccountInteraction(selected)
    expect(result).toMatchObject({ outcome: "account", ticketId: current.ticketId, account: { tag: "#PYL" } })
    expect(yield* ticketAccountInteraction(selected)).toEqual(result)
    expect(yield* sql`SELECT interaction_id FROM ticket_account_receipts WHERE preparation_id=${prepared.sessionId}::uuid`).toHaveLength(1)
    expect(JSON.stringify(yield* sql`SELECT context FROM ticket_account_preparations WHERE id=${prepared.sessionId}::uuid`)).not.toMatch(/rawBody|signature|api_token/u)
    expect(yield* ticketAccountInteraction(current.select(prepared.sessionId, "#FOREIGN")).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(yield* ticketAccountInteraction({ ...selected, requestHash: "c".repeat(64) }).pipe(Effect.flip)).toMatchObject({ _tag: "Conflict" })
  })))
  it("rejects fabricated sources and other actor, guild, or channel session reuse", () => run(Effect.gen(function* () {
    const current = yield* fixture("02")
    expect(yield* ticketAccountInteraction(current.proof(`ck:ticket:accounts-view:${current.ticketId}`, { messageId: "943000000000000098" })).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    const prepared = yield* ticketAccountInteraction(current.proof(`ck:ticket:accounts-view:${current.ticketId}`))
    if (prepared.outcome !== "accounts") throw new Error("Expected account viewer")
    for (const overrides of [{ actorId: "943000000000000097" }, { guildId: "943000000000000096" }, { channelId: "943000000000000095" }]) {
      expect(yield* ticketAccountInteraction(current.select(prepared.sessionId, "#PYL", overrides)).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    }
  })))
  it("rechecks current ticket accounts, deletion and source revision", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, current = yield* fixture("03")
    const initial = current.proof(`ck:ticket:accounts-view:${current.ticketId}`)
    const prepared = yield* ticketAccountInteraction(initial)
    if (prepared.outcome !== "accounts") throw new Error("Expected account viewer")
    yield* sql`UPDATE tickets SET applicant_accounts=ARRAY['#PYC']::text[] WHERE id=${current.ticketId}::uuid`
    expect(yield* ticketAccountInteraction(initial).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(yield* ticketAccountInteraction(current.select(prepared.sessionId, "#PYL")).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    yield* sql`UPDATE ticket_panels SET updated_at=updated_at+interval '1 microsecond' WHERE id=${current.panelId}::uuid`
    expect(yield* ticketAccountInteraction(current.select(prepared.sessionId, "#PYC")).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    yield* sql`UPDATE tickets SET status='delete' WHERE id=${current.ticketId}::uuid`
    expect(yield* ticketAccountInteraction(current.select(prepared.sessionId, "#PYC")).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
  })))
  it("serializes concurrent preparation and selection replay without duplicate receipts", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, current = yield* fixture("07")
    const initial = current.proof(`ck:ticket:accounts-view:${current.ticketId}`)
    const prepared = yield* Effect.all([ticketAccountInteraction(initial), ticketAccountInteraction(initial)], { concurrency: 2 })
    expect(prepared[0]).toEqual(prepared[1])
    expect(yield* sql`SELECT id FROM ticket_account_preparations WHERE interaction_id=${initial.id}`).toHaveLength(1)
    if (prepared[0].outcome !== "accounts") throw new Error("Expected account viewer")
    const selected = current.select(prepared[0].sessionId, "#PYL")
    const results = yield* Effect.all([ticketAccountInteraction(selected), ticketAccountInteraction(selected)], { concurrency: 2 })
    expect(results[0]).toEqual(results[1])
    expect(yield* sql`SELECT interaction_id FROM ticket_account_receipts WHERE interaction_id=${selected.id}`).toHaveLength(1)
    const other = yield* ticketAccountInteraction(current.proof(`ck:ticket:accounts-view:${current.ticketId}`))
    if (other.outcome !== "accounts") throw new Error("Expected account viewer")
    const collision = current.select(other.sessionId, "#PYC", { id: selected.id })
    expect(yield* ticketAccountInteraction(collision).pipe(Effect.flip)).toMatchObject({ _tag: "Conflict" })
    expect(yield* ticketAccountInteraction(current.proof(`ck:ticket:accounts-view:${current.ticketId}`, { signedAt: Date.now()-301_000 })).pipe(Effect.flip)).toMatchObject({ _tag: "Unauthenticated" })
  })))
  it("expires sessions and rejects tickets without applicant accounts", async () => {
    const current = await run(fixture("04"))
    const prepared = await run(ticketAccountInteraction(current.proof(`ck:ticket:accounts-view:${current.ticketId}`)))
    if (prepared.outcome !== "accounts") throw new Error("Expected account viewer")
    const clock = vi.spyOn(Date, "now").mockReturnValue(new Date(prepared.expiresAt).getTime() + 1)
    try { await expect(run(ticketAccountInteraction(current.select(prepared.sessionId, "#PYL")))).rejects.toMatchObject({ _tag: "Forbidden" }) }
    finally { clock.mockRestore() }
    const empty = await run(fixture("05", []))
    await expect(run(ticketAccountInteraction(empty.proof(`ck:ticket:accounts-view:${empty.ticketId}`)))).rejects.toMatchObject({ _tag: "NotFound" })
  })
})
