import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { decryptStoredFernet, encryptStoredFernet } from "./fernet.js"
import { normalizeSearch, searchSources, type SearchBindings } from "./public-search.js"

const key = Buffer.alloc(32, 7).toString("base64url")
const query = () => new URLSearchParams({ query: "Test", limit: "1" })
const make = () => {
  const calls: Array<{ path: string; method: string; body: unknown; authorization: string | null }> = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init), url = new URL(request.url)
    const body = request.body ? await request.json() as unknown : undefined
    calls.push({ path: url.pathname, method: request.method, body, authorization: request.headers.get("authorization") })
    if (url.pathname.endsWith("/_pit")) return Response.json({ id: "pit-one" })
    if (request.method === "DELETE") return Response.json({ succeeded: true })
    const cursor = body as { search_after?: unknown }
    return Response.json({ pit_id: "pit-two", hits: { hits: cursor.search_after ? [] : [
      { _source: { name: "Test", tag: "#P0Y", townhall_level: 18 }, sort: [1, "#P0Y"] },
      { _source: { name: "Test second", tag: "#P0L", townhall_level: 17 }, sort: [0.5, "#P0L"] },
    ] } })
  })
  const bindings = { ELASTICSEARCH: { fetch }, ELASTICSEARCH_API_KEY: "test-search-key", ELASTICSEARCH_PLAYERS_ALIAS: "players", ELASTICSEARCH_CLANS_ALIAS: "clans", DATA_ENCRYPTION_KEY: key } as unknown as SearchBindings
  return { bindings, calls, fetch }
}
describe("public search PIT cursors", () => {
  it("uses private ApiKey transport, signs query-bound cursors, and closes exhausted PITs", async () => {
    const { bindings, calls } = make()
    const first = await Effect.runPromise(searchSources(bindings, "player", query()))
    expect(first.sources).toHaveLength(1)
    expect(first.pagination.hasMore).toBe(true)
    expect(calls.every((call) => call.authorization === "ApiKey test-search-key")).toBe(true)
    const cursor = JSON.parse(await decryptStoredFernet(first.pagination.nextCursor!, key)) as Record<string, unknown>
    expect(cursor).toMatchObject({ entity: "player", pit_id: "pit-two", search_after: [1, "#P0Y"], v: 1 })
    const next = query(); next.set("cursor", first.pagination.nextCursor!)
    expect((await Effect.runPromise(searchSources(bindings, "player", next))).pagination).toEqual({ limit: 1, hasMore: false, nextCursor: null })
    expect(calls.at(-1)).toMatchObject({ path: "/_pit", method: "DELETE", body: { id: "pit-two" } })
    expect(calls.filter((call) => call.path === "/players/_pit")).toHaveLength(1)
  })
  it("rejects tampered, mismatched, and expired cursors before additional Elasticsearch calls", async () => {
    const { bindings, calls } = make()
    const first = await Effect.runPromise(searchSources(bindings, "player", query()))
    const original = first.pagination.nextCursor!, saved = JSON.parse(await decryptStoredFernet(original, key)) as Record<string, unknown>
    const expired = await encryptStoredFernet(JSON.stringify({ ...saved, expires_at: 1 }), key)
    const before = calls.length
    for (const [text, cursor] of [["Other", original], ["Test", "invalid"], ["Test", expired]]) {
      await expect(Effect.runPromise(searchSources(bindings, "player", new URLSearchParams({ query: text!, cursor: cursor!, limit: "1" })))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
    expect(calls).toHaveLength(before)
  })
  it("rejects unknown filter ranges and out-of-bounds limits", async () => {
    for (const value of ["query=x", "query=test&limit=201", "query=test&townhallLevels=101", "query=test&clanTags=bad!"]) {
      await expect(Effect.runPromise(normalizeSearch("player", new URLSearchParams(value)))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
    await expect(Effect.runPromise(normalizeSearch("clan", new URLSearchParams("query=test&members[min]=40&members[max]=20")))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
})
