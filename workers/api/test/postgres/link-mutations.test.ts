import { AccountConflictErrorResponse, LinksAddEndpoint, LinksVisibilityEndpoint } from "@clashking/api-contracts"
import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { AuthIdentity, type ApiPrincipal } from "../../src/auth.js"
import { deleteAccount } from "../../src/account-mutations.js"
import { Unauthenticated } from "../../src/errors.js"
import { commitPreparedLink,dispatchLinkMutations,prepareLink,type PreparedLink } from "../../src/link-mutations.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Run through clashking_schemas/scripts/with-test-timescale.sh")
const database = PgClient.layer({ url: Redacted.make(databaseUrl), maxConnections: 8 })
const identity = (principal: ApiPrincipal) => Layer.succeed(AuthIdentity, {
  requireUserOrBot: () => Effect.succeed(principal),
  requireUser: () => principal.kind === "user" ? Effect.succeed(principal) : Effect.fail(new Unauthenticated({ message: "User required" })),
  requireBot: () => principal.kind === "bot" ? Effect.succeed(principal) : Effect.fail(new Unauthenticated({ message: "Bot required" })),
})
const user = (userId: string): ApiPrincipal => ({ kind: "user", userId })
const proxy = { fetch: vi.fn(async (input: RequestInfo | URL) => {
  const request = new Request(input), pathname = new URL(request.url).pathname
  if (pathname.endsWith("/verifytoken")) {
    const body = await request.json() as { token: string }
    return Response.json({ status: body.token === "valid" ? "ok" : "invalid" })
  }
  return Response.json({ tag: decodeURIComponent(pathname.split("/")[3]!), name: "Player", townHallLevel: 18 })
}) }
const request = (path: string, method: string, body?: unknown) => new Request(`https://api.clashk.ing/v2${path}`, {
  method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
})
const dispatch = (principal: ApiPrincipal, path: string, method: string, body?: unknown) => dispatchLinkMutations(request(path, method, body), { CLASH_PROXY: proxy }).pipe(Effect.provide(identity(principal)))
const json = (principal: ApiPrincipal, path: string, method: string, body?: unknown) => dispatch(principal, path, method, body).pipe(Effect.flatMap((response) =>
  response === undefined ? Effect.die("Unmatched link route") : Effect.promise(() => response.json() as Promise<unknown>)))
const setupUser = (id: string) => Effect.gen(function* () { const sql = yield* SqlClient.SqlClient; yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${id}, 'discord')` })
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => Effect.runPromise(effect.pipe(Effect.provide(database), Effect.scoped))

describe("link mutations against authoritative Goose migrations", () => {
  it("separates provider proof from mutation, rejects wire-forged proof and identifies both transfer subjects",()=>run(Effect.gen(function* () {
    const sql=yield* SqlClient.SqlClient,oldOwner="935000000000000901",newOwner="935000000000000902",tag="#QQPU"
    const proof=yield* prepareLink({kind:"bot"},newOwner,{player_tag:tag,api_token:"valid"},{CLASH_PROXY:proxy})
    expect(Object.isFrozen(proof)).toBe(true);expect(Object.isFrozen(proof.player)).toBe(true)
    expect(JSON.stringify(proof)).not.toContain('"valid"')
    expect((yield* sql`SELECT 1 FROM player_links WHERE tag=${tag}`).length).toBe(0)
    const forged=JSON.parse(JSON.stringify(proof)) as PreparedLink
    expect(yield* commitPreparedLink(forged).pipe(Effect.flip)).toMatchObject({_tag:"InvalidRequest"})
    yield* sql`INSERT INTO player_links(tag,user_id,source,is_verified) VALUES(${tag},${oldOwner},'fixture',true)`
    const linked=yield* commitPreparedLink(proof)
    expect(linked.response.account).toMatchObject({tag,is_verified:true})
    expect(linked.affectedSubjectIds).toEqual([oldOwner,newOwner])
    expect((yield* sql<{user_id:string}>`SELECT user_id FROM player_links WHERE tag=${tag}`)[0]?.user_id).toBe(newOwner)
  })))
  it("rejects malformed HTTP input and upstream failures without creating links", () => run(Effect.gen(function* () {
    const principal = user("930000000000000001")
    const execute = (input: Request) => dispatchLinkMutations(input, { CLASH_PROXY: proxy }).pipe(Effect.provide(identity(principal)))
    expect(yield* execute(new Request("https://api.clashk.ing/v2/links/930000000000000001", { method: "POST", body: "{}" })).pipe(Effect.flip)).toMatchObject({ _tag: "InvalidRequest", status: 415 })
    expect(yield* execute(new Request("https://api.clashk.ing/v2/links/930000000000000001", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })).pipe(Effect.flip)).toMatchObject({ _tag: "InvalidRequest" })
    expect(yield* execute(request("/links/930000000000000001", "POST", { player_tag: "#QPL", api_token: "x".repeat(1024 * 1024) })).pipe(Effect.flip)).toMatchObject({ _tag: "PayloadTooLarge" })
    expect(yield* execute(request("/links/930000000000000001/%ZZ", "DELETE")).pipe(Effect.flip)).toMatchObject({ _tag: "InvalidRequest" })
    expect(yield* execute(request("/links/930000000000000001/last-login", "PATCH", {}))).toBeUndefined()
    expect(yield* execute(request("/auth/me", "GET"))).toBeUndefined()
    for (const [response, expected] of [[new Response(null, { status: 404 }), "NotFound"], [new Response(null, { status: 503 }), "UpstreamUnavailable"], [Response.json({ tag: "#WRONG", name: "Wrong", townHallLevel: 18 }), "UpstreamUnavailable"]] as const) {
      const result = yield* dispatchLinkMutations(request("/links/930000000000000001", "POST", { player_tag: "#QPL" }), { CLASH_PROXY: { fetch: async () => response } }).pipe(Effect.provide(identity(principal)), Effect.flip)
      expect(result).toMatchObject({ _tag: expected })
    }
  })))

  it("enforces subject ownership, JSON schemas, normalized tags and verification before writes", () => run(Effect.gen(function* () {
    const principal = user("931000000000000001")
    proxy.fetch.mockClear()
    expect(yield* json(principal, "/links/other", "POST", { player_tag: "#QPL" }).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    expect(proxy.fetch).not.toHaveBeenCalled()
    for (const ordered_tags of [[], ["qpl", "#QPL"]]) {
      expect(yield* json(principal, "/links/931000000000000001/order", "PUT", { ordered_tags }).pipe(Effect.flip)).toMatchObject({ _tag: "InvalidRequest" })
    }
    expect(yield* json(principal, "/links/931000000000000001/%23QPL", "PATCH", {}).pipe(Effect.flip)).toMatchObject({ _tag: "InvalidRequest" })
    expect(yield* json(principal, "/links/931000000000000001", "POST", { player_tag: "##" }).pipe(Effect.flip)).toMatchObject({ _tag: "InvalidRequest" })
    expect(yield* json(principal, "/links/931000000000000001", "POST", { player_tag: "#QPL", api_token: "wrong" }).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
  })))

  it("claims an absent player once under concurrent bot claims and emits the canonical conflict snapshot", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const responses = yield* Effect.all(["932000000000000001", "932000000000000002"].map((id) => dispatch({ kind: "bot" }, `/links/${id}`, "POST", { player_tag: "qpy" })), { concurrency: 2 })
    expect(responses.map((response) => response?.status).sort()).toEqual([200, 409])
    const conflict = responses.find((response) => response?.status === 409)!
    const body = Schema.decodeUnknownSync(AccountConflictErrorResponse)(yield* Effect.promise(() => conflict.json()))
    expect(body.account).toEqual({ tag: "#QPY", name: "Player", townHallLevel: 18, hidden: false, is_verified: false })
    expect(conflict.headers.get("cache-control")).toBe("no-store")
    expect(yield* sql`SELECT tag FROM player_links WHERE tag = '#QPY'`).toHaveLength(1)
    expect(yield* sql`SELECT user_id FROM auth_users WHERE user_id IN ('932000000000000001','932000000000000002')`).toEqual([])
  })))

  it("preserves same-owner verification/visibility and resets previous-owner private data on verified transfer", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, a = "933000000000000001", b = "933000000000000002"
    yield* setupUser(a); yield* setupUser(b)
    const added = Schema.decodeUnknownSync(LinksAddEndpoint.response)(yield* json(user(a), `/links/${a}`, "POST", { player_tag: "#QPQ", api_token: "valid" }))
    expect(added.account.is_verified).toBe(true)
    yield* json(user(a), `/links/${a}/%23QPQ`, "PATCH", { hidden: true })
    expect(yield* json(user(a), `/links/${a}`, "POST", { player_tag: "#QPQ" })).toMatchObject({ account: { is_verified: true, hidden: true } })
    yield* sql`INSERT INTO player_upgrades (player_tag, data) VALUES ('#QPQ','{"private":true}')`
    yield* sql`INSERT INTO player_upgrade_preferences (player_tag, preferences) VALUES ('#QPQ','{"private":true}')`
    yield* sql`INSERT INTO mobile_notification_accounts (user_id, player_tag, source) VALUES (${a}, '#QPQ','verified')`
    yield* sql`INSERT INTO user_bookmarks (user_id,entity_type,tag) VALUES (${b},'player','#QPQ')`
    expect(yield* json(user(b), `/links/${b}`, "POST", { player_tag: "#QPQ", api_token: "valid" })).toMatchObject({ account: { is_verified: true, hidden: false } })
    expect(yield* sql`SELECT user_id FROM player_links WHERE tag = '#QPQ'`).toEqual([{ user_id: b }])
    expect(yield* sql`SELECT player_tag FROM player_upgrades WHERE player_tag = '#QPQ'`).toEqual([])
    expect(yield* sql`SELECT player_tag FROM player_upgrade_preferences WHERE player_tag = '#QPQ'`).toEqual([])
    expect(yield* sql`SELECT player_tag FROM mobile_notification_accounts WHERE player_tag = '#QPQ'`).toEqual([])
    expect(yield* sql`SELECT tag FROM user_bookmarks WHERE user_id = ${b}`).toEqual([])
  })))

  it("serializes additions, checks verified hiding/final verified removal and compacts order", () => run(Effect.gen(function* () {
    const id = "934000000000000001", principal = user(id), sql = yield* SqlClient.SqlClient
    yield* setupUser(id)
    yield* Effect.all(["#QPR", "#QPC", "#QPG"].map((player_tag) => json(principal, `/links/${id}`, "POST", { player_tag })), { concurrency: 3 })
    expect((yield* sql<{ order_index: number }>`SELECT order_index FROM player_links WHERE user_id = ${id} ORDER BY order_index`).map((row) => row.order_index)).toEqual([0, 1, 2])
    expect(yield* json(principal, `/links/${id}/%23QPR`, "PATCH", { hidden: true }).pipe(Effect.flip)).toMatchObject({ _tag: "Forbidden" })
    yield* json(principal, `/links/${id}`, "POST", { player_tag: "#QPR", api_token: "valid" })
    const hidden = Schema.decodeUnknownSync(LinksVisibilityEndpoint.response)(yield* json(principal, `/links/${id}/%23QPR`, "PATCH", { hidden: true }))
    expect(hidden).toMatchObject({ player_tag: "#QPR", hidden: true, verified_at: expect.any(String), last_login: null })
    expect(yield* json(principal, `/links/${id}/%23QPR`, "DELETE").pipe(Effect.flip)).toMatchObject({ _tag: "Conflict" })
    expect(yield* json(principal, `/links/${id}/order`, "PUT", { ordered_tags: ["#FOREIGN"] }).pipe(Effect.flip)).toMatchObject({ _tag: "InvalidRequest" })
    yield* json(principal, `/links/${id}/order`, "PUT", { ordered_tags: ["#QPC", "#QPG", "#QPR"] })
    yield* json(principal, `/links/${id}/%23QPC`, "DELETE")
    expect(yield* sql`SELECT tag,order_index FROM player_links WHERE user_id = ${id} ORDER BY order_index`).toEqual([{ tag: "#QPG", order_index: 0 }, { tag: "#QPR", order_index: 1 }])
    yield* json(principal, `/links/${id}/%23QPG`, "DELETE")
    yield* json(principal, `/links/${id}/%23QPR`, "DELETE")
    expect(yield* json(principal, `/links/${id}/%23QPR`, "DELETE").pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
  })))

  it("does not recreate links when a user mutation races account deletion", () => run(Effect.gen(function* () {
    const id = "935000000000000001", principal = user(id), sql = yield* SqlClient.SqlClient
    yield* setupUser(id)
    yield* json(principal, `/links/${id}`, "POST", { player_tag: "#QPJ", api_token: "valid" })
    const mutations = yield* Effect.all([
      deleteAccount(id).pipe(Effect.match({ onSuccess: () => "deleted", onFailure: (e) => e._tag })),
      json(principal, `/links/${id}`, "POST", { player_tag: "#QPJ", api_token: "valid" }).pipe(Effect.match({ onSuccess: () => "linked", onFailure: (e) => e._tag })),
      json(principal, `/links/${id}/%23QPJ`, "DELETE").pipe(Effect.match({ onSuccess: () => "unlinked", onFailure: (e) => e._tag })),
    ], { concurrency: 3 })
    expect(mutations[0]).toBe("deleted")
    expect(["linked", "Unauthenticated"]).toContain(mutations[1])
    expect(["unlinked", "Unauthenticated"]).toContain(mutations[2])
    expect(yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${id}`).toEqual([])
    expect(yield* sql`SELECT tag FROM player_links WHERE user_id = ${id}`).toEqual([])
  })))

  it("rechecks authenticated identity after an in-flight Clash lookup completes following account deletion", () => run(Effect.gen(function* () {
    const id = "938000000000000001", sql = yield* SqlClient.SqlClient
    yield* setupUser(id)
    const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
    const delayed = { CLASH_PROXY: { fetch: async () => {
      started.resolve()
      await release.promise
      return Response.json({ tag: "#QPX", name: "Delayed", townHallLevel: 18 })
    } } }
    const results = yield* Effect.all([
      dispatchLinkMutations(request(`/links/${id}`, "POST", { player_tag: "#QPX" }), delayed).pipe(Effect.provide(identity(user(id))), Effect.flip),
      Effect.promise(() => started.promise).pipe(Effect.flatMap(() => deleteAccount(id)), Effect.ensuring(Effect.sync(() => release.resolve()))),
    ], { concurrency: 2 })
    expect(results[0]).toMatchObject({ _tag: "Unauthenticated" })
    expect(yield* sql`SELECT tag FROM player_links WHERE user_id = ${id}`).toEqual([])
  })))
})
