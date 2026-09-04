import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { UpstreamUnavailable } from "../../src/errors.js"
import { runTicketOperation } from "../../src/ticket-effects.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Disposable Goose Timescale required")
}
const guild = "1844567890123456789", actor = "2844567890123456789"
const category = "3844567890123456789"
const database = databaseLayer({ HYPERDRIVE: { connectionString: process.env.TEST_DATABASE_URL } } as WorkerBindings)
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(database), Effect.scoped))
const runDiscord = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | DiscordApi>, discord: typeof DiscordApi.Service) =>
  Effect.runPromise(effect.pipe(Effect.provide(Layer.mergeAll(database, Layer.succeed(DiscordApi, discord))), Effect.scoped))

describe("ticket category preflight retry", () => {
  it.each(["unavailable", "malformed"] as const)("retries %s category lookup without treating an unattempted create as uncertain", async (failure) => {
    const suffix = failure === "unavailable" ? "01" : "02"
    const channel = `48445678901234567${suffix}`
    const panelId = `74000000-0000-4000-8000-0000000000${suffix}`
    const buttonId = `75000000-0000-4000-8000-0000000000${suffix}`
    const operationId = `76000000-0000-4000-8000-0000000000${suffix}`
    const ticketId = `77000000-0000-4000-8000-0000000000${suffix}`
    const customId = `ck:ticket:open:${panelId}:${buttonId}`
    const interactionId = `9${suffix}4567890123456789`
    const hash = suffix.repeat(32)
    const settings = { questions: [], mod_role: [], no_ping_mod_role: [], private_thread: false, th_min: 0, num_apply: 25,
      naming: "{ticket_count}-{user}", account_apply: false, player_info: false, apply_clans: [], roles_to_add: [], roles_to_remove: [],
      townhall_requirements: {}, new_message: null }
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers(id,name) VALUES(${guild},'Category retry fixture') ON CONFLICT DO NOTHING`
      yield* sql`INSERT INTO ticket_panels(id,server_id,name,components,data) VALUES(${panelId}::uuid,${guild},${failure},
        ${JSON.stringify([{ id: buttonId, type: 2, custom_id: customId, style: 1, label: "Apply" }])}::jsonb,
        ${JSON.stringify({ [`${customId}_settings`]: settings })}::jsonb)`
      yield* sql`INSERT INTO ticket_runtime_operations(id,interaction_id,action,ticket_id,ticket_number,server_id,actor_user_id,panel_id,button_id,
        origin_channel_id,origin_message_id,context,request,request_hash,progress,submission_interaction_id,submitted_request,submitted_request_hash,state)
        VALUES(${operationId}::uuid,${interactionId},'open',${ticketId}::uuid,${500 + Number(suffix)},${guild},${actor},${panelId}::uuid,${buttonId}::uuid,
        '5844567890123456789','6844567890123456789',${JSON.stringify({ actorLabel: "Applicant", settings })}::jsonb,
        '{}'::jsonb,${hash},'{"accounts":[]}'::jsonb,${String(BigInt(interactionId) + 1n)},'{}'::jsonb,${hash},'submitted')`
      yield* sql`INSERT INTO ticket_runtime_effects(operation_id,effect_key,ordinal,effect_type,request,state)
        VALUES(${operationId}::uuid,'channel',0,'create_channel',${JSON.stringify({ serverId: guild, ticketId, name: `${failure}-Applicant`,
          applicantUserId: actor, moderatorRoleIds: [], parentId: category })}::jsonb,'pending')`
    }))
    let healthy = false, posts = 0, lookups = 0
    const discord = {
      request: (path: string, options?: { method?: string; body?: unknown }) => {
        if (path === `/channels/${category}` && !options?.method) {
          lookups++
          if (!healthy) return failure === "unavailable"
            ? Effect.fail(new UpstreamUnavailable({ cause: undefined, message: "Category lookup unavailable" }))
            : Effect.succeed({ id: category, guild_id: guild, type: "invalid" })
          return Effect.succeed({ id: category, guild_id: guild, type: 4 })
        }
        if (path === `/guilds/${guild}/channels` && options?.method === "POST") {
          posts++
          expect(options.body).toMatchObject({ parent_id: category })
          return Effect.succeed({ id: channel })
        }
        return Effect.die(`Unexpected Discord call ${options?.method ?? "GET"} ${path}`)
      },
      token: () => Effect.die("Unexpected OAuth"),
    }
    expect(await runDiscord(runTicketOperation(operationId), discord)).toBe("waiting")
    expect(posts).toBe(0)
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      expect((yield* sql<{ state: string }>`SELECT state FROM ticket_runtime_effects WHERE operation_id=${operationId}::uuid`)[0]?.state).toBe("pending")
      yield* sql`UPDATE ticket_runtime_effects SET next_attempt_at=now()-interval '1 second' WHERE operation_id=${operationId}::uuid`
    }))
    healthy = true
    expect(await runDiscord(runTicketOperation(operationId), discord)).toBe("completed")
    expect(lookups).toBe(2)
    expect(posts).toBe(1)
    expect(await runDiscord(runTicketOperation(operationId), discord)).toBe("completed")
    expect(lookups).toBe(2)
    expect(posts).toBe(1)
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      expect((yield* sql<{ channel_id: string }>`SELECT channel_id FROM tickets WHERE id=${ticketId}::uuid`)[0]?.channel_id).toBe(channel)
    }))
  })
})
