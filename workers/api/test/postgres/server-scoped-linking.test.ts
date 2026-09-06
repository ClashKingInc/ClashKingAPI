import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { addServerScopedLink, loadServerLinkTokenPolicy } from "../../src/server-scoped-linking.js"

if (!process.env.TEST_DATABASE_URL || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run through the disposable Goose Timescale harness")
}
const database = PgClient.layer({ url: Redacted.make(process.env.TEST_DATABASE_URL), maxConnections: 3 })
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(database), Effect.scoped))
const TokenBody = Schema.Struct({ token: Schema.String })

const fixture = (suffix: number) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const userId = String(944000000000000000n + BigInt(suffix))
  const playerTag = `#PQP${suffix}`
  yield* sql`INSERT INTO player_links (tag,user_id,source,is_verified,hidden,added_at,verified_at,updated_at)
    VALUES (${playerTag},${userId},'clashking',true,true,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z')`
  yield* sql`INSERT INTO player_upgrades (player_tag,data) VALUES (${playerTag},'{"private":"keep"}')`
  const snapshot = () => Effect.gen(function* () {
    return {
      links: yield* sql`SELECT to_jsonb(link) AS value,xmin::text AS row_version FROM player_links link WHERE tag=${playerTag}`,
      upgrades: yield* sql`SELECT data,xmin::text AS row_version FROM player_upgrades WHERE player_tag=${playerTag}`,
      subjectLocks: yield* sql`SELECT subject_id FROM subject_mutation_locks WHERE subject_id=${userId}`,
    }
  })
  const requests: Array<{ method: string; path: string; token?: string }> = []
  let linkQueryCount = 0
  const observedSql = new Proxy(sql, {
    apply(target, thisArg, args) {
      linkQueryCount += 1
      return Reflect.apply(target, thisArg, args)
    },
  })
  const proxy = { fetch: vi.fn(async (input: RequestInfo | URL) => {
    const request = new Request(input), path = new URL(request.url).pathname
    const playerPath = `/v1/players/${encodeURIComponent(playerTag)}`
    if (path === `${playerPath}/verifytoken`) {
      const body = Schema.decodeUnknownSync(TokenBody)(await request.json())
      requests.push({ method: request.method, path, token: body.token })
      return Response.json({ status: body.token === "valid" ? "ok" : "invalid" })
    }
    expect(path).toBe(playerPath)
    requests.push({ method: request.method, path })
    return Response.json({ tag: playerTag, name: "Already verified", townHallLevel: 18 })
  }) }
  const attempt = (requireApiTokenWhenLinking: boolean, api_token?: string) => addServerScopedLink({
    requireApiTokenWhenLinking, principal: { kind: "bot" }, userId,
    input: { player_tag: playerTag, ...(api_token === undefined ? {} : { api_token }) },
    bindings: { CLASH_PROXY: proxy },
  }).pipe(Effect.provideService(SqlClient.SqlClient, observedSql))
  return { sql, playerTag, userId, requests, proxy, snapshot, attempt, linkQueryCount: () => linkQueryCount }
})

describe("server-scoped linking through the real canonical linker", () => {
  it("loads the default-off canonical policy, explicit enablement, and rejects an unknown server", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, serverId = "944000000000000100"
    yield* sql`INSERT INTO servers (id,name) VALUES (${serverId},'Link policy fixture')`
    expect(yield* sql.withTransaction(loadServerLinkTokenPolicy(serverId))).toBe(false)
    yield* sql`UPDATE servers SET require_api_token_when_linking=true WHERE id=${serverId}`
    expect(yield* sql.withTransaction(loadServerLinkTokenPolicy(serverId))).toBe(true)
    expect(yield* sql.withTransaction(loadServerLinkTokenPolicy("944000000000000101")).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
  })))

  it.each([undefined, "", " ", "\n\t"])("rejects missing proof %j for an already-verified owner without HTTP or persisted mutation", (token) => run(Effect.gen(function* () {
    const current = yield* fixture([undefined, "", " ", "\n\t"].indexOf(token) + 1)
    const before = yield* current.snapshot()
    expect(yield* current.attempt(true, token).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(current.proxy.fetch).not.toHaveBeenCalled()
    expect(current.linkQueryCount()).toBe(0)
    expect(yield* current.snapshot()).toEqual(before)
  })))

  it("rejects supplied invalid proof despite verified same-owner status, without persisted mutation", () => run(Effect.gen(function* () {
    const current = yield* fixture(5), before = yield* current.snapshot()
    expect(yield* current.attempt(true, "invalid").pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(current.requests).toEqual([
      { method: "GET", path: `/v1/players/${encodeURIComponent(current.playerTag)}` },
      { method: "POST", path: `/v1/players/${encodeURIComponent(current.playerTag)}/verifytoken`, token: "invalid" },
    ])
    expect(current.linkQueryCount()).toBe(0)
    expect(yield* current.snapshot()).toEqual(before)
  })))

  it("verifies valid proof on every new enabled attempt even for an already-verified owner", () => run(Effect.gen(function* () {
    const current = yield* fixture(6)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(yield* current.attempt(true, " valid ")).toMatchObject({ account: { tag: current.playerTag, is_verified: true, hidden: true } })
    }
    expect(current.requests.filter((request) => request.path.endsWith("/verifytoken"))).toEqual([
      { method: "POST", path: `/v1/players/${encodeURIComponent(current.playerTag)}/verifytoken`, token: "valid" },
      { method: "POST", path: `/v1/players/${encodeURIComponent(current.playerTag)}/verifytoken`, token: "valid" },
    ])
    expect(current.linkQueryCount()).toBeGreaterThan(0)
    expect(yield* current.sql`SELECT user_id,is_verified,hidden,verified_at::text FROM player_links WHERE tag=${current.playerTag}`)
      .toEqual([{ user_id: current.userId, is_verified: true, hidden: true, verified_at: "2026-09-01 00:00:00+00" }])
    expect(yield* current.sql`SELECT data FROM player_upgrades WHERE player_tag=${current.playerTag}`).toEqual([{ data: { private: "keep" } }])
  })))

  it("preserves canonical same-owner linking without token when the explicit policy is off", () => run(Effect.gen(function* () {
    const current = yield* fixture(7)
    expect(yield* current.attempt(false)).toMatchObject({ account: { tag: current.playerTag, is_verified: true, hidden: true } })
    expect(current.requests).toEqual([{ method: "GET", path: `/v1/players/${encodeURIComponent(current.playerTag)}` }])
  })))
})
