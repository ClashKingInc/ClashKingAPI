import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { enterGiveaway } from "../../src/giveaway-runtime.js"
import type { VerifiedRuntimeInteraction } from "../../src/runtime-interaction.js"
import { NotFound } from "../../src/errors.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const guild = "1434567890123456789", actor = "2434567890123456789", channel = "3434567890123456789", message = "4434567890123456789"
const database = databaseLayer({ HYPERDRIVE: { connectionString: process.env.TEST_DATABASE_URL } } as WorkerBindings)
const proof = (giveaway: string, id = "5434567890123456789", userId = actor): VerifiedRuntimeInteraction => ({
  id, guildId: guild, actorId: userId, actorLabel:userId, actorRoleIds:[],permissions:"0", channelId: channel, messageId: message, type: 3,
  data: { custom_id: `ck:giveaway:enter:${giveaway}`, component_type: 2 }, signedAt: Date.now(), requestHash: "a".repeat(64),
})
const memberLayer = (roles: readonly string[] = [], avatar: string | null = "custom", missing = false) => Layer.succeed(DiscordApi, {
  request: (path: string) => missing ? Effect.fail(new NotFound({ message: "Fixture missing" })) : Effect.succeed({ user: { id: path.split("/").at(-1), avatar }, roles }),
  token: () => Effect.die("Unexpected OAuth"),
})
const fixture = (id: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO servers(id,name) VALUES(${guild},'Runtime fixture') ON CONFLICT DO NOTHING`
  yield* sql`INSERT INTO giveaways(id,server_id,prize,channel_id,message_id,status,start_time,end_time,winners)
    VALUES(${id},${guild},'Prize',${channel},${message},'ongoing',now()-interval '1 day',now()+interval '1 day',1)`
})
const run = <A, E>(effect: Effect.Effect<A,E,SqlClient.SqlClient | DiscordApi>, discord = memberLayer()) =>
  Effect.runPromise(effect.pipe(Effect.provide(Layer.mergeAll(database, discord)), Effect.scoped))

describe("persistent giveaway entry with authoritative migrations", () => {
  it("atomically deduplicates simultaneous retries, saves count-dirty and replays original result after end/deletion", async () => {
    const id = crypto.randomUUID()
    await run(fixture(id))
    const interaction = proof(id)
    const results = await Promise.all(Array.from({ length: 12 }, () => run(enterGiveaway(id, interaction))))
    expect(results.every((result) => result.outcome === "entered" && result.entryCount === 1)).toBe(true)
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{ entries: string[]; updated: boolean }>`SELECT entries,updated FROM giveaways WHERE id=${id}`
      expect(rows[0]).toEqual({ entries: [actor], updated: true })
      yield* sql`UPDATE giveaways SET status='ended',end_time=now()-interval '1 second' WHERE id=${id}`
      const replay = { ...interaction, signedAt: Date.now() - 600_000 }
      expect(yield* enterGiveaway(id,replay)).toEqual(results[0])
      yield* sql`DELETE FROM giveaways WHERE id=${id}`
      expect(yield* enterGiveaway(id,replay)).toEqual(results[0])
    }))
  })
  it("deduplicates distinct interaction IDs for the same actor while other actors enter independently", async () => {
    const id = crypto.randomUUID()
    await run(fixture(id))
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => run(enterGiveaway(id, proof(id, String(6434567890123456789n + BigInt(index)))))))
    expect(results.filter((result) => result.outcome === "entered")).toHaveLength(1)
    const next = await run(enterGiveaway(id,proof(id,"7434567890123456789","8434567890123456789")))
    expect(next.entryCount).toBe(2)
  })
  it("checks current roles, global avatar and linked-account state before committing", async () => {
    const id = crypto.randomUUID(), interaction = proof(id,"9434567890123456789")
    await run(fixture(id))
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE giveaways SET roles_mode='allow',roles=ARRAY['1'],profile_picture_required=true,coc_account_required=true WHERE id=${id}`
    }))
    expect(await run(enterGiveaway(id,interaction).pipe(Effect.flip))).toMatchObject({ _tag: "Forbidden", reason: "roles" })
    expect(await run(enterGiveaway(id,interaction).pipe(Effect.flip), memberLayer(["1"],null))).toMatchObject({ _tag: "Forbidden", reason: "avatar" })
    expect(await run(enterGiveaway(id,interaction).pipe(Effect.flip), memberLayer(["1"]))).toMatchObject({ _tag: "Forbidden", reason: "linked_account" })
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO player_links(tag,user_id,source) VALUES('#P0Y',${actor},'discord')`
    }))
    expect(await run(enterGiveaway(id,interaction),memberLayer(["1"]))).toMatchObject({ outcome: "entered" })
    expect(await run(enterGiveaway(id,{ ...interaction,id:"12434567890123456789" }),memberLayer([],null,true))).toMatchObject({ outcome: "already_entered",entryCount:1 })
  })
  it("rejects altered receipt scope/hash, expired first use, wrong message and non-members", async () => {
    const id = crypto.randomUUID(), interaction = proof(id,"10434567890123456789")
    await run(fixture(id))
    expect(await run(enterGiveaway(id,{ ...interaction, signedAt: Date.now()-600_000 }).pipe(Effect.flip))).toMatchObject({ _tag: "Unauthenticated" })
    expect(await run(enterGiveaway(id,{ ...interaction, messageId: "99" }).pipe(Effect.flip))).toMatchObject({ _tag: "Forbidden", reason: "wrong_message" })
    expect(await run(enterGiveaway(id,interaction).pipe(Effect.flip),memberLayer([],null,true))).toMatchObject({ _tag: "Forbidden", reason: "not_member" })
    await run(enterGiveaway(id,interaction))
    expect(await run(enterGiveaway(id,{ ...interaction, requestHash: "b".repeat(64) }).pipe(Effect.flip))).toMatchObject({ _tag: "Conflict" })
    expect(await run(enterGiveaway(id,{ ...interaction, actorId: "99" }).pipe(Effect.flip))).toMatchObject({ _tag: "Conflict" })
  })
  it("recognizes existing object entries and rolls back every write on receipt conflict", async () => {
    const id = crypto.randomUUID(), interaction = proof(id,"11434567890123456789")
    await run(fixture(id))
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE giveaways SET entries=${JSON.stringify([{ user_id: actor }])}::jsonb WHERE id=${id}`
      expect(yield* enterGiveaway(id,interaction)).toMatchObject({ outcome: "already_entered", entryCount: 1 })
      const rows = yield* sql<{ updated: boolean }>`SELECT updated FROM giveaways WHERE id=${id}`
      expect(rows[0]?.updated).toBe(false)
    }))
  })
})
