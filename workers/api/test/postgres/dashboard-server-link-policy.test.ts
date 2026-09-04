import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { createDashboardServerLink, deleteDashboardServerLink } from "../../src/bot-adjacent-runtime.js"
import { DiscordApi } from "../../src/discord-api.js"
import { addLink } from "../../src/link-mutations.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run through the disposable Goose Timescale harness")
}
const database = PgClient.layer({ url: Redacted.make(process.env.TEST_DATABASE_URL), maxConnections: 5 })
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(database), Effect.scoped))
const Token = Schema.Struct({ token: Schema.String })
const fixture = (suffix: number, tag: string, enabled = true) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const serverId = String(955000000000000000n + BigInt(suffix)), userId = String(956000000000000000n + BigInt(suffix))
  yield* sql`INSERT INTO servers (id,name,require_api_token_when_linking) VALUES (${serverId},'Dashboard link policy',${enabled})`
  const requests: Array<{ method: string; path: string; token?: string }> = []
  const discordRequests: string[] = []
  let playerStatus = 200
  let beforePlayerResponse: (() => Promise<void>) | undefined
  const proxy = {
    connect: () => { throw new Error("Unexpected proxy socket") },
    fetch: async (input: RequestInfo | URL) => {
      const request = new Request(input), path = new URL(request.url).pathname
      if (path.endsWith("/verifytoken")) {
        const body = Schema.decodeUnknownSync(Token)(await request.json())
        requests.push({ method: request.method, path, token: body.token })
        return Response.json({ status: body.token === "valid" ? "ok" : "invalid" })
      }
      requests.push({ method: request.method, path })
      await beforePlayerResponse?.()
      return playerStatus === 200 ? Response.json({ tag, name: "Fixture", townHallLevel: 18 }) : new Response(null, { status: playerStatus })
    },
  }
  const services = Layer.mock(DiscordApi, { request: (path) => {
      discordRequests.push(path)
      expect(path).toBe(`/guilds/${serverId}/members/${userId}`)
      return Effect.succeed({ user: { id: userId } })
    } })
  const dispatch = (method: "POST" | "DELETE", token?: string) => Effect.gen(function* () {
    const body = yield* (method === "POST"
      ? createDashboardServerLink({ CLASH_PROXY: proxy }, serverId, tag, userId, token)
      : deleteDashboardServerLink({ CLASH_PROXY: proxy }, tag))
    return { status: 200, body }
  }).pipe(Effect.catchTag("OperationConflict", (error) => Effect.succeed({ status: 409, body: { message: error.message } })), Effect.provide(services))
  const snapshot = () => Effect.gen(function* () {
    return {
      links: yield* sql`SELECT to_jsonb(p) AS value,xmin::text AS version FROM player_links p WHERE tag=${tag}`,
      privateData: yield* sql`SELECT data,xmin::text AS version FROM player_upgrades WHERE player_tag=${tag}`,
      tagLocks: yield* sql`SELECT tag FROM player_link_mutation_locks WHERE tag=${tag}`,
      subjectLocks: yield* sql`SELECT subject_id FROM subject_mutation_locks WHERE subject_id=${userId}`,
    }
  })
  return { sql, tag, userId, serverId, requests, discordRequests, dispatch, snapshot,
    setPlayerStatus: (status: number) => { playerStatus = status },
    beforePlayerResponse: (callback: () => Promise<void>) => { beforePlayerResponse = callback },
  }
})

describe("Dashboard server-link policy through the real store and canonical linker", () => {
  it.each([undefined, "", " \n\t"])("denies required missing proof %j before Clash lookup or mutation", (token) => run(Effect.gen(function* () {
    const index = [undefined, "", " \n\t"].indexOf(token), current = yield* fixture(index + 1, ["#QQP", "#QQY", "#QQG"][index]!)
    const before = yield* current.snapshot()
    expect(yield* current.dispatch("POST", token).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(current.requests).toEqual([])
    expect(yield* current.snapshot()).toEqual(before)
  })))

  it("does not exempt an already-verified same-owner account from missing or invalid proof", () => run(Effect.gen(function* () {
    const current = yield* fixture(4, "#QQR")
    yield* current.sql`INSERT INTO player_links (tag,user_id,source,is_verified,hidden,verified_at)
      VALUES (${current.tag},${current.userId},'clashking',true,true,'2026-09-01T00:00:00Z')`
    yield* current.sql`INSERT INTO player_upgrades (player_tag,data) VALUES (${current.tag},'{"private":"keep"}')`
    const before = yield* current.snapshot()
    expect(yield* current.dispatch("POST").pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(current.requests).toEqual([])
    expect(yield* current.dispatch("POST", "invalid").pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(current.requests.map((request) => request.method)).toEqual(["GET", "POST"])
    expect(yield* current.snapshot()).toEqual(before)
  })))

  it("verifies every new valid same-owner attempt and preserves private data and visibility", () => run(Effect.gen(function* () {
    const current = yield* fixture(5, "#QQJ")
    yield* current.sql`INSERT INTO player_links (tag,user_id,source,is_verified,hidden,verified_at)
      VALUES (${current.tag},${current.userId},'clashking',true,true,'2026-09-01T00:00:00Z')`
    yield* current.sql`INSERT INTO player_upgrades (player_tag,data) VALUES (${current.tag},'{"private":"keep"}')`
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(yield* current.dispatch("POST", " valid ")).toMatchObject({ status: 200, body: { player_tag: current.tag, user_id: current.userId } })
    }
    expect(current.requests.filter((request) => request.path.endsWith("/verifytoken")).map((request) => request.token)).toEqual(["valid", "valid"])
    expect(yield* current.sql`SELECT is_verified,hidden,verified_at::text FROM player_links WHERE tag=${current.tag}`)
      .toEqual([{ is_verified: true, hidden: true, verified_at: "2026-09-01 00:00:00+00" }])
    expect(yield* current.sql`SELECT data FROM player_upgrades WHERE player_tag=${current.tag}`).toEqual([{ data: { private: "keep" } }])
  })))

  it("allows tokenless new linking when disabled but does not permit staff to take another owner's link", () => run(Effect.gen(function* () {
    const current = yield* fixture(6, "#QQC", false)
    expect(yield* current.dispatch("POST")).toMatchObject({ status: 200 })
    expect(yield* current.sql`SELECT user_id,is_verified FROM player_links WHERE tag=${current.tag}`)
      .toEqual([{ user_id: current.userId, is_verified: false }])
    yield* current.sql`UPDATE player_links SET user_id='957000000000000006' WHERE tag=${current.tag}`
    const before = yield* current.snapshot()
    expect(yield* current.dispatch("POST")).toMatchObject({ status: 409 })
    expect(yield* current.snapshot()).toEqual(before)
  })))

  it("allows a proven ownership transfer through canonical privacy cleanup", () => run(Effect.gen(function* () {
    const current = yield* fixture(7, "#QQV"), previous = "957000000000000007"
    yield* current.sql`INSERT INTO player_links (tag,user_id,source,is_verified) VALUES (${current.tag},${previous},'clashking',true)`
    yield* current.sql`INSERT INTO player_upgrades (player_tag,data) VALUES (${current.tag},'{"private":"old-owner"}')`
    expect(yield* current.dispatch("POST", "valid")).toMatchObject({ status: 200 })
    expect(yield* current.sql`SELECT user_id,is_verified FROM player_links WHERE tag=${current.tag}`)
      .toEqual([{ user_id: current.userId, is_verified: true }])
    expect(yield* current.sql`SELECT data FROM player_upgrades WHERE player_tag=${current.tag}`).toEqual([])
  })))

  it("deletes only after an authoritative Clash404 and uses durable tag and subject mutexes", () => run(Effect.gen(function* () {
    const current = yield* fixture(8, "#QQQ", false)
    yield* current.sql`INSERT INTO player_links (tag,user_id,source) VALUES (${current.tag},${current.userId},'clashking')`
    const before = yield* current.snapshot()
    expect(yield* current.dispatch("DELETE")).toMatchObject({ status: 409 })
    current.setPlayerStatus(503)
    expect(yield* current.dispatch("DELETE").pipe(Effect.flip)).toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(yield* current.snapshot()).toEqual(before)
    current.setPlayerStatus(404)
    expect(yield* current.dispatch("DELETE")).toMatchObject({ status: 200 })
    expect(yield* current.sql`SELECT tag FROM player_links WHERE tag=${current.tag}`).toEqual([])
    expect(yield* current.sql`SELECT tag FROM player_link_mutation_locks WHERE tag=${current.tag}`).toHaveLength(1)
    expect(yield* current.sql`SELECT subject_id FROM subject_mutation_locks WHERE subject_id=${current.userId}`).toHaveLength(1)
  })))

  it("does not delete a new owner's link when canonical transfer completes during the Clash404 lookup", () => run(Effect.gen(function* () {
    const current = yield* fixture(9, "#QQL", false), nextOwner = "957000000000000009"
    yield* current.sql`INSERT INTO player_links (tag,user_id,source) VALUES (${current.tag},${current.userId},'clashking')`
    const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
    current.setPlayerStatus(404)
    current.beforePlayerResponse(async () => { started.resolve(); await release.promise })
    const results = yield* Effect.all([
      current.dispatch("DELETE"),
      Effect.promise(() => started.promise).pipe(Effect.flatMap(() => addLink({ kind: "bot" }, nextOwner,
        { player_tag: current.tag, api_token: "valid" }, { CLASH_PROXY: { fetch: async (input) =>
          new URL(new Request(input).url).pathname.endsWith("/verifytoken") ? Response.json({ status: "ok" })
            : Response.json({ tag: current.tag, name: "New owner", townHallLevel: 18 }) } })),
      Effect.ensuring(Effect.sync(() => release.resolve()))),
    ], { concurrency: 2 })
    expect(results[0]).toMatchObject({ status: 409 })
    expect(yield* current.sql`SELECT user_id,is_verified FROM player_links WHERE tag=${current.tag}`)
      .toEqual([{ user_id: nextOwner, is_verified: true }])
  })))
})
