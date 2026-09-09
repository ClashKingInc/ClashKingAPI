import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { beforeEach, describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import type { VerifiedRuntimeInteraction } from "../../src/runtime-interaction.js"
import { TicketApprovalResolver, advanceTicketApproval, prepareTicketApproval } from "../../src/ticket-approval-runtime.js"
import { runTicketOperation } from "../../src/ticket-effects.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const guild = "1134567890123456789", actor = "2134567890123456789", applicant = "3134567890123456789"
const channel = "4134567890123456789", message = "5134567890123456789", staffRole = "6134567890123456789"
let counter = 8000000000000000000n, resolverCalls = 0
let beforeResolution: (() => Promise<void>) | undefined
const sends: Array<Record<string, unknown>> = []
const database = databaseLayer({ HYPERDRIVE: { connectionString: process.env.TEST_DATABASE_URL } } as WorkerBindings)
const discord = Layer.succeed(DiscordApi, {
  request: (path, options) => {
    if (path === `/guilds/${guild}`) return Effect.succeed({ id: guild, owner_id: applicant })
    if (path === `/channels/${channel}/messages` && options?.method === "POST") {
      sends.push(options.body as Record<string, unknown>); return Effect.succeed({ id: String(counter++) })
    }
    return Effect.die(`Unexpected Discord request ${path}`)
  }, token: () => Effect.die("Unexpected OAuth"),
})
const resolver = Layer.succeed(TicketApprovalResolver, { resolve: () => Effect.gen(function* () {
  resolverCalls++
  if (beforeResolution) yield* Effect.promise(beforeResolution)
  return { builtins: { user_name: "Applicant {custom}", user_mention: `<@${applicant}>` }, userMentions: [applicant] }
}) })
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | DiscordApi | TicketApprovalResolver>) => Effect.runPromise(
  effect.pipe(Effect.provide(Layer.mergeAll(database, discord, resolver)), Effect.scoped))
const proof = (type: 3 | 5, data: VerifiedRuntimeInteraction["data"], overrides: Partial<VerifiedRuntimeInteraction> = {}): VerifiedRuntimeInteraction => ({
  type, data, id: String(counter++), actorId: actor, actorLabel: "Staff", actorRoleIds: [], guildId: guild, channelId: channel,
  messageId: message, permissions: "32", requestHash: crypto.randomUUID().replaceAll("-", "").repeat(2), signedAt: Date.now(), ...overrides,
})
const button = (ticket: string, overrides: Partial<VerifiedRuntimeInteraction> = {}) => proof(3, { component_type: 2, custom_id: `ck:ticket:approve:${ticket}` }, overrides)
const select = (operation: string, index: string) => proof(3, { component_type: 3, custom_id: `ck:ticket:select:${operation}`, values: [index] })
const modal = (operation: string, page: number, count: number, answer = "answer") => proof(5, {
  custom_id: `ck:ticket:answers:${operation}:${page}`, components: Array.from({ length: count }, (_, index) => ({
    type: 1, components: [{ type: 4, custom_id: `approval-field:${page * 5 + index}`, value: answer }],
  })),
})
const fixture = (templates = [{ name: "Welcome", message: "Hello {user_name} {custom}" }]) => run(Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO servers(id,name) VALUES(${guild},'Approval fixture') ON CONFLICT DO NOTHING`
  yield* sql`DELETE FROM ticket_runtime_effects WHERE operation_id IN (SELECT id FROM ticket_runtime_operations WHERE server_id=${guild})`
  yield* sql`DELETE FROM ticket_runtime_operations WHERE server_id=${guild}`
  yield* sql`DELETE FROM tickets WHERE server_id=${guild}`
  const panel = crypto.randomUUID(), ticket = crypto.randomUUID(), opening = crypto.randomUUID(), buttonId = crypto.randomUUID()
  const settings = { questions: [], mod_role: [staffRole], no_ping_mod_role: [], private_thread: false, th_min: 0, num_apply: 25,
    naming: "{ticket_status}-{user}", account_apply: false, player_info: false, apply_clans: [], roles_to_add: [], roles_to_remove: [], townhall_requirements: {} }
  yield* sql`INSERT INTO ticket_panels(id,server_id,name,components,data) VALUES(${panel}::uuid,${guild},${panel},'[]',
    ${JSON.stringify({ approve_messages: templates, [`ck:ticket:open:${panel}:${buttonId}_settings`]: settings })}::jsonb)`
  const number = (yield* sql<{ number: number }>`SELECT nextval('tickets_number_seq')::int AS number`)[0]!.number
  yield* sql`INSERT INTO tickets(id,server_id,channel_id,panel_id,number,status_id,is_thread,applicant_user_id,status,naming_convention)
    VALUES(${ticket}::uuid,${guild},${channel},${panel}::uuid,${number},0,false,${applicant},'open','ticket')`
  const identity = String(counter++)
  yield* sql`INSERT INTO ticket_runtime_operations(id,interaction_id,action,ticket_id,ticket_number,server_id,actor_user_id,panel_id,button_id,
    origin_channel_id,origin_message_id,context,request,request_hash,state,submission_interaction_id,submitted_request,submitted_request_hash)
    VALUES(${opening}::uuid,${identity},'open',${ticket}::uuid,${number},${guild},${applicant},${panel}::uuid,${buttonId}::uuid,
      ${channel},${message},'{}','{}',${"a".repeat(64)},'completed',${identity},'{}',${"a".repeat(64)})`
  yield* sql`INSERT INTO ticket_runtime_effects(operation_id,effect_key,ordinal,effect_type,request,state,result)
    VALUES(${opening}::uuid,'application:0',0,'send_message','{}','succeeded',${JSON.stringify({ id: message, channelId: channel })}::jsonb)`
  return { panel, ticket }
}))

beforeEach(() => { sends.length = 0; resolverCalls = 0; beforeResolution = undefined })
describe("ticket approval durable preparation and submission", () => {
  it("prepares once under concurrent replay, includes all 25 names and binds actor/channel/source/hash", async () => {
    const { ticket } = await fixture(Array.from({ length: 25 }, (_, index) => ({ name: `Message_${index}`, message: `Body ${index}` })))
    const interaction = button(ticket)
    const [one, two] = await Promise.all([run(prepareTicketApproval(interaction)), run(prepareTicketApproval(interaction))])
    expect(one.operationId).toBe(two.operationId)
    expect(one.outcome === "ready" && one.form.kind === "string_select" && one.form.options).toHaveLength(25)
    expect(await run(prepareTicketApproval({ ...interaction, signedAt: 0 }))).toEqual(one)
    await expect(run(prepareTicketApproval({ ...interaction, actorId: applicant }))).rejects.toMatchObject({ _tag: "Forbidden" })
    await expect(run(prepareTicketApproval({ ...interaction, requestHash: "f".repeat(64) }))).rejects.toMatchObject({ _tag: "Conflict" })
    await expect(run(prepareTicketApproval(button(ticket, { messageId: "123" })))).rejects.toMatchObject({ _tag: "Forbidden" })
    expect(sends).toHaveLength(0); expect(resolverCalls).toBe(0)
  })
  it("sends a completed multi-page template exactly once and replays committed proofs after expiry", async () => {
    const { ticket } = await fixture([{ name: "Approval_with_underscores", message: "{user_name} {a}{b}{c}{d}{e}{f}{g}" }])
    const prepared = await run(prepareTicketApproval(button(ticket))), id = prepared.operationId
    const selected = select(id, "0")
    expect((await run(advanceTicketApproval(id, selected)))?.outcome).toBe("ready")
    await run(advanceTicketApproval(id, modal(id, 0, 5)))
    await run(advanceTicketApproval(id, proof(3, { component_type: 2, custom_id: `ck:ticket:continue:${id}:1` })))
    const last = modal(id, 1, 2)
    const [one, two] = await Promise.all([run(advanceTicketApproval(id, last)), run(advanceTicketApproval(id, last))])
    expect(one).toEqual(two); expect(one?.outcome).toBe("accepted")
    expect(sends).toHaveLength(0)
    expect(await run(runTicketOperation(id))).toBe("completed")
    expect(sends).toHaveLength(1)
    expect(sends[0]?.content).toBe("Applicant {custom} answeransweransweransweransweransweranswer")
    expect(sends[0]?.allowed_mentions).toEqual({ parse: [], users: [applicant] })
    expect((await run(advanceTicketApproval(id, { ...last, signedAt: 0 })))?.outcome).toBe("complete")
    expect((await run(advanceTicketApproval(id, { ...selected, signedAt: 0 })))?.outcome).toBe("complete")
    expect(await run(runTicketOperation(id))).toBe("completed"); expect(sends).toHaveLength(1)
    await expect(run(advanceTicketApproval(id, { ...last, requestHash: "f".repeat(64) }))).rejects.toMatchObject({ _tag: "Conflict" })
  })
  it("rejects unoffered templates, foreign actors, stale pages, changed panel versions and revoked staff", async () => {
    const { ticket, panel } = await fixture(), prepared = await run(prepareTicketApproval(button(ticket))), id = prepared.operationId
    await expect(run(advanceTicketApproval(id, select(id, "24")))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(run(advanceTicketApproval(id, { ...select(id, "0"), actorId: applicant }))).rejects.toMatchObject({ _tag: "Forbidden" })
    await expect(run(advanceTicketApproval(id, { ...select(id, "0"), permissions: "0" }))).rejects.toMatchObject({ _tag: "Forbidden" })
    await run(advanceTicketApproval(id, select(id, "0")))
    await expect(run(advanceTicketApproval(id, select(id, "0")))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE ticket_panels SET updated_at=updated_at+interval '1 microsecond' WHERE id=${panel}::uuid`
    }))
    await expect(run(advanceTicketApproval(id, modal(id, 0, 1)))).rejects.toMatchObject({ _tag: "Conflict" })
    expect(sends).toHaveLength(0); expect(resolverCalls).toBe(0)
  })
  it("rechecks panel revision after provider reads and leaves no submitted effects on a stale snapshot", async () => {
    const { ticket, panel } = await fixture([{ name: "Plain", message: "{user_name}" }])
    const prepared = await run(prepareTicketApproval(button(ticket))), id = prepared.operationId
    beforeResolution = () => run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE ticket_panels SET updated_at=updated_at+interval '1 microsecond' WHERE id=${panel}::uuid`
    }))
    await expect(run(advanceTicketApproval(id, select(id, "0")))).rejects.toMatchObject({ _tag: "Conflict" })
    const stored = await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      return { operation: (yield* sql`SELECT state,version FROM ticket_runtime_operations WHERE id=${id}::uuid`)[0],
        effects: yield* sql`SELECT effect_key FROM ticket_runtime_effects WHERE operation_id=${id}::uuid` }
    }))
    expect(stored.operation).toMatchObject({ state: "preparing", version: 0 }); expect(stored.effects).toHaveLength(0)
  })
  it("rejects ticket reassignment to a different panel with the same revision before and during provider resolution", async () => {
    for (const duringResolution of [false, true]) {
      const { ticket, panel } = await fixture([{ name: "Original", message: "{user_name}" }])
      const prepared = await run(prepareTicketApproval(button(ticket))), id = prepared.operationId
      const replacement = crypto.randomUUID()
      await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
        yield* sql`INSERT INTO ticket_panels(id,server_id,name,components,data,updated_at)
          SELECT ${replacement}::uuid,server_id,${replacement},components,
            ${JSON.stringify({ approve_messages: [{ name: "Other", message: "Different source" }] })}::jsonb,updated_at
          FROM ticket_panels WHERE id=${panel}::uuid`
      }))
      const reassign = () => run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
        yield* sql`UPDATE tickets SET panel_id=${replacement}::uuid WHERE id=${ticket}::uuid`
      }))
      resolverCalls = 0
      if (duringResolution) beforeResolution = reassign
      else await reassign()
      await expect(run(advanceTicketApproval(id, select(id, "0")))).rejects.toMatchObject({ _tag: "Conflict" })
      expect(resolverCalls).toBe(duringResolution ? 1 : 0)
      const effects = await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
        return yield* sql`SELECT effect_key FROM ticket_runtime_effects WHERE operation_id=${id}::uuid`
      }))
      expect(effects).toHaveLength(0); expect(sends).toHaveLength(0)
      beforeResolution = undefined
    }
  })
  it("persists every large Unicode answer beyond the former 32KiB limit and queues bounded messages", async () => {
    const names = Array.from({ length: 600 }, (_, index) => String.fromCharCode(0x4e00 + index))
    const { ticket } = await fixture([{ name: "Large", message: names.map(name => `{${name}}`).join("") }])
    const prepared = await run(prepareTicketApproval(button(ticket))), id = prepared.operationId
    await run(advanceTicketApproval(id, select(id, "0")))
    for (let page = 0; page < 120; page++) {
      if (page) await run(advanceTicketApproval(id, proof(3, { component_type: 2, custom_id: `ck:ticket:continue:${id}:${page}` })))
      await run(advanceTicketApproval(id, modal(id, page, 5, "界".repeat(75))))
    }
    const stored = await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      return { operation: (yield* sql<{ state: string; answers: number; bytes: number }>`SELECT state,jsonb_array_length(progress->'answers') AS answers,
        octet_length(progress::text) AS bytes FROM ticket_runtime_operations WHERE id=${id}::uuid`)[0]!,
      messages: yield* sql<{ request: { content: string; nonce: string } }>`SELECT request FROM ticket_runtime_effects WHERE operation_id=${id}::uuid ORDER BY ordinal` }
    }))
    expect(stored.operation.state).toBe("submitted"); expect(stored.operation.answers).toBe(600); expect(stored.operation.bytes).toBeGreaterThan(32768)
    expect(stored.messages.map(row => row.request.content).join("")).toBe("界".repeat(45_000))
    expect(stored.messages.every(row => row.request.content.length <= 2000 && row.request.nonce.length <= 25)).toBe(true)
    expect(new Set(stored.messages.map(row => row.request.nonce)).size).toBe(stored.messages.length)
    expect(sends).toHaveLength(0)
  }, 60_000)
})
