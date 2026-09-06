import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { createDashboardServerLink } from "../../src/bot-adjacent-runtime.js"
import { DiscordApi } from "../../src/discord-api.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run through the disposable Goose Timescale harness")
}
const database = PgClient.layer({ url: Redacted.make(process.env.TEST_DATABASE_URL), maxConnections: 4 })
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(database), Effect.scoped))
const TokenBody = Schema.Struct({ token: Schema.String })
type ProviderStage = "discord" | "player" | "verify"

const race = (suffix: number, stage: ProviderStage, initialPolicy: boolean, nextPolicy: boolean, token?: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const serverId = String(958000000000000000n + BigInt(suffix)), userId = String(959000000000000000n + BigInt(suffix))
  const tag = ["#QGP", "#QGY", "#QGG", "#QGR", "#QGJ"][suffix - 1]!
  yield* sql`INSERT INTO servers (id,name,require_api_token_when_linking)
    VALUES (${serverId},'Concurrent link policy',${initialPolicy})`
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const seen: ProviderStage[] = []
  const provider = async (current: ProviderStage) => {
    seen.push(current)
    if (current === stage) { started.resolve(); await release.promise }
  }
  const discord = Layer.mock(DiscordApi, { request: (path) => Effect.promise(async () => {
    expect(path).toBe(`/guilds/${serverId}/members/${userId}`)
    await provider("discord")
    return { user: { id: userId } }
  }) })
  const proxy = { fetch: async (input: RequestInfo | URL) => {
    const request = new Request(input), path = new URL(request.url).pathname
    if (path.endsWith("/verifytoken")) {
      expect(Schema.decodeUnknownSync(TokenBody)(await request.json())).toEqual({ token: "valid" })
      await provider("verify")
      return Response.json({ status: "ok" })
    }
    expect(path).toBe(`/v1/players/${encodeURIComponent(tag)}`)
    await provider("player")
    return Response.json({ tag, name: "Concurrency fixture", townHallLevel: 18 })
  } }
  const creation = createDashboardServerLink({ CLASH_PROXY: proxy }, serverId, tag, userId, token).pipe(
    Effect.provide(discord),
    Effect.match({ onSuccess: (value) => ({ ok: true as const, value }), onFailure: (error) => ({ ok: false as const, error }) }),
    // If creation unexpectedly fails before the requested provider stage, let
    // the second branch finish; the explicit stage assertion will fail below.
    Effect.ensuring(Effect.sync(() => started.resolve())),
  )
  const policyUpdate = Effect.promise(() => started.promise).pipe(Effect.flatMap(() => sql.withTransaction(Effect.gen(function* () {
    // This separate connection must update the server while the provider is
    // still paused. A held policy row lock fails promptly instead of hanging.
    yield* sql.unsafe("SET LOCAL lock_timeout = '500ms'")
    expect(yield* sql`SELECT subject_id FROM subject_mutation_locks WHERE subject_id=${userId}`).toEqual([])
    yield* sql`UPDATE servers SET require_api_token_when_linking=${nextPolicy},name='Updated during provider wait' WHERE id=${serverId}`
  }))), Effect.match({ onSuccess: () => ({ ok: true as const }), onFailure: (error) => ({ ok: false as const, error }) }),
  Effect.ensuring(Effect.sync(() => release.resolve())))
  const [created, updated] = yield* Effect.all([creation, policyUpdate], { concurrency: 2 })
  expect(seen).toContain(stage)
  expect(updated.ok, `${stage} provider wait must not hold the server row lock`).toBe(true)
  return { sql, tag, userId, serverId, created, seen }
})

describe("Dashboard server linking keeps provider waits outside the final transaction", () => {
  it.each(["discord", "player", "verify"] as const)("does not hold a server row lock while %s is pending", (stage) => run(Effect.gen(function* () {
    const current = yield* race(["discord", "player", "verify"].indexOf(stage) + 1, stage, true, true, "valid")
    expect(current.created).toMatchObject({ ok: true, value: { user_id: current.userId, player_tag: current.tag } })
    expect(yield* current.sql`SELECT user_id,is_verified FROM player_links WHERE tag=${current.tag}`)
      .toEqual([{ user_id: current.userId, is_verified: true }])
  })))

  it("rejects a tokenless attempt when policy changes OFF to ON during the player lookup", () => run(Effect.gen(function* () {
    const current = yield* race(4, "player", false, true)
    expect(current.created).toMatchObject({ ok: false, error: { _tag: "Forbidden" } })
    expect(current.seen).not.toContain("verify")
    expect(yield* current.sql`SELECT require_api_token_when_linking FROM servers WHERE id=${current.serverId}`)
      .toEqual([{ require_api_token_when_linking: true }])
    expect(yield* current.sql`SELECT tag FROM player_links WHERE tag=${current.tag}`).toEqual([])
    expect(yield* current.sql`SELECT subject_id FROM subject_mutation_locks WHERE subject_id=${current.userId}`).toEqual([])
  })))

  it("accepts valid supplied proof when policy changes OFF to ON during verification", () => run(Effect.gen(function* () {
    const current = yield* race(5, "verify", false, true, "valid")
    expect(current.created).toMatchObject({ ok: true })
    expect(current.seen.filter((stage) => stage === "verify")).toHaveLength(1)
    expect(yield* current.sql`SELECT user_id,is_verified FROM player_links WHERE tag=${current.tag}`)
      .toEqual([{ user_id: current.userId, is_verified: true }])
  })))
})
