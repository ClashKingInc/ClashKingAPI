import { GiveawayPublicationClaimEndpoint, GiveawayPublicationPrepareEndpoint } from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { claimGiveawayPublication, completeGiveawayPublication, enqueueGiveawayPublication, pendingGiveawayPublications, prepareGiveawayPublication } from "../../src/giveaway-publications.js"
import { resolveEndingGiveaway } from "../../src/giveaway-outcomes.js"
import { NotFound, UpstreamUnavailable } from "../../src/errors.js"
import { executeDashboardGiveaways } from "../../src/dashboard-server-giveaways.js"
import { dashboardEndpoints } from "@clashking/api-contracts"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const guild = "1534567890123456789", channel = "2534567890123456789", message = "3534567890123456789"
const database = databaseLayer({ HYPERDRIVE: { connectionString: process.env.TEST_DATABASE_URL } } as WorkerBindings)
const members = (roles: readonly string[] = []) => Layer.succeed(DiscordApi, {
  request: (path: string) => Effect.succeed({ user: { id: path.split("/").at(-1) }, roles }), token: () => Effect.die("Unexpected OAuth"),
})
const run = <A,E>(effect: Effect.Effect<A,E,SqlClient.SqlClient | DiscordApi>, discord = members()) =>
  Effect.runPromise(effect.pipe(Effect.provide(Layer.mergeAll(database,discord)),Effect.scoped))
const fixture = (id: string, ended = false, count = 0, winners = 1) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO servers(id,name) VALUES(${guild},'Publication fixture') ON CONFLICT DO NOTHING`
  const entries = Array.from({ length:count },(_,index) => String(4534567890123456789n+BigInt(index)))
  yield* sql`INSERT INTO giveaways(id,server_id,prize,channel_id,message_id,status,start_time,end_time,winners,entries)
    VALUES(${id},${guild},'Prize',${channel},${ended ? message : null},${ended ? "ended" : "ongoing"},now()-interval '1 day',
      ${ended ? new Date(Date.now()-1000).toISOString() : new Date(Date.now()+86400000).toISOString()}::timestamptz,
      ${winners},${JSON.stringify(entries)}::jsonb)`
  return entries
})
const prepare = async (id: string,kind: "start" | "end" | "update") => {
  const result = Schema.decodeUnknownSync(GiveawayPublicationPrepareEndpoint.response)(await run(prepareGiveawayPublication(id,kind)))
  if (result.outcome !== "ready") throw new Error("Expected ready publication")
  return result.effectId
}
const claim = async (id: string,effectId: string) => {
  const result = Schema.decodeUnknownSync(GiveawayPublicationClaimEndpoint.response)(await run(claimGiveawayPublication(id,effectId)))
  if (result.outcome !== "claimed") throw new Error(`Expected claim, got ${result.outcome}`)
  return result
}

describe("giveaway publication journals and ending outcomes", () => {
  it("prepares normalized payload, fences simultaneous claims, persists Discord ID once and keeps concurrent dirty entries", async () => {
    const id = crypto.randomUUID()
    await run(fixture(id))
    const effectId = await prepare(id,"start")
    expect(await prepare(id,"start")).toBe(effectId)
    const results = await Promise.all(Array.from({ length:5 },() => run(claimGiveawayPublication(id,effectId))))
    const accepted = results.find((result) => result.outcome === "claimed")
    if (!accepted || accepted.outcome !== "claimed") throw new Error("No claim")
    expect(results.filter((result) => result.outcome === "claimed")).toHaveLength(1)
    expect(accepted.effect.payload).toMatchObject({ version:1,giveaway:{ id,entry_count:0,message_id:null,image_url:null },winner_ids:[] })
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE giveaways SET updated=true,updated_at=clock_timestamp() WHERE id=${id}`
    }))
    const body = { claimToken:accepted.claimToken,outcome:"succeeded" as const,messageId:message }
    expect(await run(completeGiveawayPublication(id,effectId,body))).toEqual({ outcome:"succeeded" })
    expect(await run(completeGiveawayPublication(id,effectId,body))).toEqual({ outcome:"succeeded" })
    expect(await prepare(id,"start")).toBe(effectId)
    expect(await run(claimGiveawayPublication(id,effectId))).toEqual({ outcome:"complete" })
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      expect((yield* sql<{ message_id:string;updated:boolean }>`SELECT message_id,updated FROM giveaways WHERE id=${id}`)[0]).toEqual({ message_id:message,updated:true })
    }))
  })
  it("turns expired create claims ambiguous and preserves late resource evidence even after deletion", async () => {
    const id = crypto.randomUUID()
    await run(fixture(id))
    const effectId = await prepare(id,"start"), accepted = await claim(id,effectId)
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE giveaway_publication_effects SET lease_expires_at=now()-interval '1 second' WHERE effect_id=${effectId}`
      yield* sql`DELETE FROM giveaways WHERE id=${id}`
    }))
    expect((await run(pendingGiveawayPublications())).items).toContainEqual({ giveawayId:id,effectId })
    expect(await run(claimGiveawayPublication(id,effectId))).toEqual({ outcome:"ambiguous" })
    expect(await run(completeGiveawayPublication(id,effectId,{ claimToken:accepted.claimToken,outcome:"succeeded",messageId:message }))).toEqual({ outcome:"ambiguous" })
    expect(await run(claimGiveawayPublication(id,effectId))).toEqual({ outcome:"ambiguous" })
    expect(await run(completeGiveawayPublication(id,effectId,{ claimToken:crypto.randomUUID(),outcome:"succeeded",messageId:message }).pipe(Effect.flip))).toMatchObject({ _tag:"Conflict" })
  })
  it("rejects changed identity before HTTP and reclaims only safe expired updates", async () => {
    const id = crypto.randomUUID()
    await run(fixture(id))
    const start = await prepare(id,"start"), first = await claim(id,start)
    await run(completeGiveawayPublication(id,start,{ claimToken:first.claimToken,outcome:"succeeded",messageId:message }))
    const update = await prepare(id,"update"), original = await claim(id,update)
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE giveaway_publication_effects SET lease_expires_at=now()-interval '1 second' WHERE effect_id=${update}`
    }))
    const resumed = await claim(id,update)
    expect(resumed.claimToken).not.toBe(original.claimToken)
    expect(await run(completeGiveawayPublication(id,update,{ claimToken:original.claimToken,outcome:"succeeded",messageId:message }).pipe(Effect.flip))).toMatchObject({ _tag:"Conflict" })
    await run(completeGiveawayPublication(id,update,{ claimToken:resumed.claimToken,outcome:"succeeded",messageId:message }))
  })
  it("requeues only explicitly safe retries with a bounded delay and fences the old claim", async () => {
    const id = crypto.randomUUID()
    await run(fixture(id))
    const start = await prepare(id,"start"), first = await claim(id,start)
    await run(completeGiveawayPublication(id,start,{ claimToken:first.claimToken,outcome:"succeeded",messageId:message }))
    const update = await prepare(id,"update"), attempt = await claim(id,update)
    expect(await run(completeGiveawayPublication(id,update,{ claimToken:attempt.claimToken,outcome:"retry",failureReason:"source_update_uncertain",retryAfterSeconds:30 }))).toEqual({ outcome:"pending" })
    expect((await run(pendingGiveawayPublications())).items.some((item) => item.effectId === update)).toBe(false)
    expect(await run(claimGiveawayPublication(id,update))).toEqual({ outcome:"pending" })
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE giveaway_publication_effects SET next_attempt_at=now()-interval '1 second' WHERE effect_id=${update}`
    }))
    const resumed = await claim(id,update)
    expect(resumed.claimToken).not.toBe(attempt.claimToken)
    expect(await run(completeGiveawayPublication(id,update,{ claimToken:attempt.claimToken,outcome:"failed",failureReason:"http_rejected" }).pipe(Effect.flip))).toMatchObject({ _tag:"Conflict" })
    expect(await run(completeGiveawayPublication(id,update,{ claimToken:resumed.claimToken,outcome:"retry",failureReason:"transport_uncertain" }).pipe(Effect.flip))).toMatchObject({ _tag:"InvalidRequest" })
  })
  it("resumes 21 participants in bounded pages, persists unique winners once, and publishes that exact outcome", async () => {
    const id = crypto.randomUUID()
    const entrants = await run(fixture(id,true,21,2))
    expect(await run(resolveEndingGiveaway(id))).toBe(false)
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      expect((yield* sql<{ cursor:string; entry_count:string }>`SELECT cursor::text,entry_count::text FROM giveaway_outcome_runs WHERE giveaway_id=${id}`)[0]).toEqual({ cursor:"10",entry_count:"21" })
    }))
    expect(await run(resolveEndingGiveaway(id))).toBe(false)
    expect(await run(resolveEndingGiveaway(id))).toBe(true)
    const effectId = await prepare(id,"end"), accepted = await claim(id,effectId)
    expect(new Set(accepted.effect.payload.winner_ids).size).toBe(2)
    expect(accepted.effect.payload.winner_ids.every((winner) => entrants.includes(winner))).toBe(true)
    expect(await run(resolveEndingGiveaway(id))).toBe(true)
    expect(await prepare(id,"end")).toBe(effectId)
    const reroll = () => executeDashboardGiveaways({ endpoint:dashboardEndpoints.rerollGiveaway,
      body:{ user_ids_to_replace:[accepted.effect.payload.winner_ids[0]!] },path:{ serverId:guild,giveawayId:id },query:{},
      bindings:{} as WorkerBindings,principal:{ kind:"user" as const,userId:"7534567890123456789" },request:new Request("https://api.test") })
    expect(await run(reroll().pipe(Effect.flip))).toMatchObject({ _tag:"InvalidRequest" })
    const announcement = "8534567890123456789"
    await run(completeGiveawayPublication(id,effectId,{ claimToken:accepted.claimToken,outcome:"succeeded",messageId:announcement }))
    expect(await run(reroll())).toMatchObject({ newWinners:expect.any(Array) })
    const pending = await run(pendingGiveawayPublications())
    expect(pending.items.some((item) => item.giveawayId === id && item.effectId !== effectId)).toBe(true)
  })
  it("fences imported winners behind their end publication even without an outcome run", async () => {
    const imported = crypto.randomUUID()
    const [winner,replacement] = await run(fixture(imported,true,2,1))
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE giveaways SET winners_list=${JSON.stringify([{ user_id:winner!,status:"winner" }])}::jsonb WHERE id=${imported}`
    }))
    const effectId = await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql.withTransaction(enqueueGiveawayPublication(imported,"end"))
    }))
    const reroll = () => executeDashboardGiveaways({ endpoint:dashboardEndpoints.rerollGiveaway,
      body:{ user_ids_to_replace:[winner!] },path:{ serverId:guild,giveawayId:imported },query:{},
      bindings:{} as WorkerBindings,principal:{ kind:"user" as const,userId:"7534567890123456789" },request:new Request("https://api.test") })
    expect(await run(reroll().pipe(Effect.flip))).toMatchObject({ _tag:"InvalidRequest" })
    const accepted = await claim(imported,effectId)
    expect(await run(reroll().pipe(Effect.flip))).toMatchObject({ _tag:"InvalidRequest" })
    await run(completeGiveawayPublication(imported,effectId,{ claimToken:accepted.claimToken,outcome:"succeeded",messageId:message }))
    expect(await run(reroll())).toMatchObject({ newWinners:[replacement] })

    const ambiguous = crypto.randomUUID()
    const [ambiguousWinner] = await run(fixture(ambiguous,true,2,1))
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE giveaways SET winners_list=${JSON.stringify([{ user_id:ambiguousWinner!,status:"winner" }])}::jsonb WHERE id=${ambiguous}`
    }))
    const ambiguousEffect = await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql.withTransaction(enqueueGiveawayPublication(ambiguous,"end"))
    }))
    await claim(ambiguous,ambiguousEffect)
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE giveaway_publication_effects SET lease_expires_at=now()-interval '1 second' WHERE effect_id=${ambiguousEffect}`
    }))
    expect(await run(claimGiveawayPublication(ambiguous,ambiguousEffect))).toEqual({ outcome:"ambiguous" })
    const ambiguousReroll = executeDashboardGiveaways({ endpoint:dashboardEndpoints.rerollGiveaway,
      body:{ user_ids_to_replace:[ambiguousWinner!] },path:{ serverId:guild,giveawayId:ambiguous },query:{},
      bindings:{} as WorkerBindings,principal:{ kind:"user" as const,userId:"7534567890123456789" },request:new Request("https://api.test") })
    expect(await run(ambiguousReroll.pipe(Effect.flip))).toMatchObject({ _tag:"InvalidRequest" })
  })
  it("keeps missing members eligible, preserves zero-weight all-win, and fails impossible competitive draws", async () => {
    const missing = Layer.succeed(DiscordApi,{ request:() => Effect.fail(new NotFound({ message:"Fixture missing" })),token:() => Effect.die("Unexpected OAuth") })
    const id = crypto.randomUUID()
    await run(fixture(id,true,3,2))
    expect(await run(resolveEndingGiveaway(id),missing)).toBe(true)
    for (const allWin of [true,false]) {
      const other = crypto.randomUUID()
      await run(fixture(other,true,3,allWin ? 3 : 2))
      await run(Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        yield* sql`UPDATE giveaways SET boosters='[{"value":0,"roles":["1"]}]'::jsonb WHERE id=${other}`
      }))
      expect(await run(resolveEndingGiveaway(other),members(["1"]))).toBe(allWin)
      if (!allWin) expect(await run(resolveEndingGiveaway(other).pipe(Effect.flip),members(["1"]))).toMatchObject({ _tag:"Conflict" })
    }
  })
  it("does not commit partial scores on transient member failure", async () => {
    const id = crypto.randomUUID()
    await run(fixture(id,true,3,1))
    const failed = Layer.succeed(DiscordApi,{ request:() => Effect.fail(new UpstreamUnavailable({ cause:undefined,message:"Fixture unavailable" })),token:() => Effect.die("Unexpected OAuth") })
    expect(await run(resolveEndingGiveaway(id).pipe(Effect.flip),failed)).toMatchObject({ _tag:"UpstreamUnavailable" })
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      expect((yield* sql<{ cursor:string }>`SELECT cursor::text FROM giveaway_outcome_runs WHERE giveaway_id=${id}`)[0]?.cursor).toBe("0")
    }))
    expect(await run(resolveEndingGiveaway(id))).toBe(true)
  })
})
