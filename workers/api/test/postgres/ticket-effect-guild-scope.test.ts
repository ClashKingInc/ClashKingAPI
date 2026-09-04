import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { runTicketOperation } from "../../src/ticket-effects.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const guild = "1864567890123456789", foreignGuild = "2864567890123456789", actor = "3864567890123456789"
const foreignChannel = "4864567890123456789", foreignCategory = "5864567890123456789"
const database = databaseLayer({ HYPERDRIVE: { connectionString: process.env.TEST_DATABASE_URL } } as WorkerBindings)
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => Effect.runPromise(effect.pipe(Effect.provide(database), Effect.scoped))
const runDiscord = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | DiscordApi>, discord: typeof DiscordApi.Service) =>
  Effect.runPromise(effect.pipe(Effect.provide(Layer.mergeAll(database, Layer.succeed(DiscordApi, discord))), Effect.scoped))
const settings = { questions: [], mod_role: [], no_ping_mod_role: [], private_thread: false, th_min: 0, num_apply: 25,
  naming: "{ticket_count}-{user}", account_apply: false, player_info: false, apply_clans: [], roles_to_add: [], roles_to_remove: [],
  townhall_requirements: {}, new_message: null }

const cases = [
  { suffix: "01", type: "send_message", request: { channelId: foreignChannel, content: "Private ticket status", nonce: "scope-01", userMentions: [] } },
  { suffix: "02", type: "edit_channel", request: { channelId: foreignChannel, body: { name: "closed-ticket" } } },
  { suffix: "03", type: "set_channel_permission", request: { channelId: foreignChannel, userId: actor, allow: "1024", deny: "0" } },
  { suffix: "04", type: "delete_channel", request: { channelId: foreignChannel } },
  { suffix: "05", type: "edit_channel", request: { body: { parent_id: foreignCategory } } },
  { suffix: "06", type: "send_message", request: { channelId: "6864567890123456706", content: "Private ticket status", nonce: "scope-06", userMentions: [] } },
] as const

describe("ticket effect guild scope", () => {
  it.each(cases)("enforces the operation's guild for $type ($suffix)", async ({ suffix, type, request }) => {
    const panelId = `84000000-0000-4000-8000-0000000000${suffix}`, buttonId = `85000000-0000-4000-8000-0000000000${suffix}`
    const operationId = `86000000-0000-4000-8000-0000000000${suffix}`, ticketId = `87000000-0000-4000-8000-0000000000${suffix}`
    const ownChannel = `68645678901234567${suffix}`, interactionId = `7${suffix}4567890123456789`, hash = suffix.repeat(32)
    const customId = `ck:ticket:open:${panelId}:${buttonId}`
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers(id,name) VALUES(${guild},'Ticket guild scope fixture') ON CONFLICT DO NOTHING`
      yield* sql`INSERT INTO ticket_panels(id,server_id,name,components,data) VALUES(${panelId}::uuid,${guild},${`Scope ${suffix}`},
        ${JSON.stringify([{ id: buttonId, type: 2, custom_id: customId, style: 1, label: "Apply" }])}::jsonb,
        ${JSON.stringify({ [`${customId}_settings`]: settings })}::jsonb)`
      yield* sql`INSERT INTO ticket_runtime_operations(id,interaction_id,action,ticket_id,ticket_number,server_id,actor_user_id,panel_id,button_id,
        origin_channel_id,origin_message_id,context,request,request_hash,progress,submission_interaction_id,submitted_request,submitted_request_hash,state)
        VALUES(${operationId}::uuid,${interactionId},'open',${ticketId}::uuid,${600 + Number(suffix)},${guild},${actor},${panelId}::uuid,${buttonId}::uuid,
        '7864567890123456789','8864567890123456789',${JSON.stringify({ actorLabel: "Applicant", settings })}::jsonb,
        '{}'::jsonb,${hash},'{"accounts":[]}'::jsonb,${String(BigInt(interactionId) + 1n)},'{}'::jsonb,${hash},'submitted')`
      yield* sql`INSERT INTO ticket_runtime_effects(operation_id,effect_key,ordinal,effect_type,request,state,result)
        VALUES(${operationId}::uuid,'channel',0,'create_channel','{}'::jsonb,'succeeded',${JSON.stringify({ id: ownChannel })}::jsonb)`
      yield* sql`INSERT INTO ticket_runtime_effects(operation_id,effect_key,ordinal,effect_type,request,state)
        VALUES(${operationId}::uuid,'scoped-effect',1,${type},${JSON.stringify(request)}::jsonb,'pending')`
    }))
    const mutations: string[] = []
    const discord = {
      request: (path: string, options?: { method?: string }) => {
        if (options?.method && options.method !== "GET") {
          mutations.push(`${options.method} ${path}`)
          return Effect.succeed({ id: path.includes("/messages") ? "9864567890123456789" : path.split("/")[2] })
        }
        if (path === `/channels/${foreignChannel}`) return Effect.succeed({ id: foreignChannel, guild_id: foreignGuild, type: 0 })
        if (path === `/channels/${foreignCategory}`) return Effect.succeed({ id: foreignCategory, guild_id: foreignGuild, type: 4 })
        if (path === `/channels/${ownChannel}`) return Effect.succeed({ id: ownChannel, guild_id: guild, type: 0 })
        return Effect.die(`Unexpected Discord lookup ${path}`)
      }, token: () => Effect.die("Unexpected OAuth"),
    }
    const outcome = await runDiscord(runTicketOperation(operationId), discord)
    const allowed = suffix === "06"
    expect(mutations).toEqual(allowed ? [`POST /channels/${ownChannel}/messages`] : [])
    expect(outcome).toBe(allowed ? "completed" : "failed")
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      expect((yield* sql<{ state: string }>`SELECT state FROM ticket_runtime_effects WHERE operation_id=${operationId}::uuid AND effect_key='scoped-effect'`)[0]?.state).toBe(allowed ? "succeeded" : "failed")
    }))
  })
})
