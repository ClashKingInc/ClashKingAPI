import { Effect, Schema } from "effect"
import { expect, it } from "vitest"
import { initializationProxy } from "./initialization.js"
import type { WorkerBindings } from "./environment.js"
import { ProxyWarlogResponse, ProxyClanResponse, ProxyCurrentWarResponse, ProxyPlayerRankingsEndpoint } from "../../../packages/api-contracts/src/proxy.js"

const bindings = (fetch: (request: Request) => Promise<Response>) => ({ CLASH_PROXY: { fetch } }) as unknown as WorkerBindings
const schema = Schema.Struct({ tag: Schema.String })
it("accepts empty clan placeholders only for a no-war response", () => {
  expect(Schema.decodeUnknownSync(ProxyCurrentWarResponse)({ state: "notInWar", clan: {}, opponent: {} })).toEqual({ state: "notInWar" })
  expect(() => Schema.decodeUnknownSync(ProxyCurrentWarResponse)({ state: "inWar", clan: {}, opponent: {} })).toThrow()
})
it("accepts leaderboard clan identities without a clan level", () => {
  const item = { tag: "#PLAYER", name: "Player", expLevel: 200, rank: 1, previousRank: 2, trophies: 5000,
    clan: { tag: "#CLAN", name: "Clan", badgeUrls: { small: "", medium: "", large: "" } } }
  expect(Schema.decodeUnknownSync(ProxyPlayerRankingsEndpoint.response)({ items: [item] })).toEqual({ items: [item] })
})
it("accepts an undeveloped Clan Capital without hall level or districts", () => {
  expect(Schema.decodeUnknownSync(ProxyClanResponse.fields.clanCapital)({ clanGoldSinkTotal: 0 })).toEqual({ clanGoldSinkTotal: 0 })
})
it("accepts an official war-log opponent without an attack count", async () => {
  const side = { tag: "#TEST", name: "Test", badgeUrls: { small: "", medium: "", large: "" }, clanLevel: 1, stars: 3, destructionPercentage: 100 }
  const payload = { items: [{ result: "win", endTime: "20260905T000000.000Z", teamSize: 5, attacksPerMember: 2, clan: { ...side, attacks: 10 }, opponent: side }] }
  expect(await Effect.runPromise(initializationProxy(bindings(async () => Response.json(payload)), "clans/test/warlog", ProxyWarlogResponse))).toEqual(payload)
})
it("uses a Worker-supported redirect policy and returns live data", async () => {
  const env = bindings(async request => {
    expect(request.redirect).toBe("manual")
    return Response.json({ tag: "#TEST" })
  })
  expect(await Effect.runPromise(initializationProxy(env, "players/test", schema))).toEqual({ tag: "#TEST" })
})
it("accepts a deleted war-log opponent and a CWL summary without attacksPerMember", () => {
  const opponent = { badgeUrls: { small: "", medium: "", large: "" }, clanLevel: 1, stars: 0, destructionPercentage: 0 }
  const item = { result: null, endTime: "20260905T000000.000Z", teamSize: 15, clan: { ...opponent, tag: "#TEST", name: "Test" }, opponent }
  expect(Schema.decodeUnknownSync(ProxyWarlogResponse)({ items: [item] })).toEqual({ items: [item] })
})
it("does not follow an upstream redirect", async () => {
  expect(await Effect.runPromise(initializationProxy(bindings(async () => new Response(null, { status: 302, headers: { location: "https://example.com" } })), "players/test", schema))).toBeUndefined()
})
it("omits a failed live lookup when the provider connection rejects", async () => {
  expect(await Effect.runPromise(initializationProxy(bindings(async () => { throw new Error("connection reset") }), "players/test", schema))).toBeUndefined()
})
it("still rejects malformed successful provider data", async () => {
  await expect(Effect.runPromise(initializationProxy(bindings(async () => Response.json({ tag: 123 })), "players/test", schema)))
    .rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
})
