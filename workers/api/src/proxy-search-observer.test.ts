import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { afterEach, describe, expect, it, vi } from "vitest"

import { observeProxySearch } from "./proxy-search-observer.js"

const { record } = vi.hoisted(() => ({ record: vi.fn() }))
vi.mock("./mobile-persistence.js", () => ({ recordSuccessfulProxySearch: record }))

const principal = { kind: "user" as const, userId: "verified-jwt-user" }
const request = (path = "/proxy/v1/players/%23P0Y") => new Request(`https://api.test${path}`, { headers: { "x-ck-user-id": "spoofed-user" } })
const run = (response: Response, incoming = request()) => Effect.runPromise(observeProxySearch(principal, incoming, response).pipe(
  Effect.provideService(SqlClient.SqlClient, {} as unknown as SqlClient.SqlClient),
))
afterEach(() => { vi.resetAllMocks() })

describe("background proxy search observer", () => {
  it("records using the verified principal without consuming the outgoing response", async () => {
    record.mockReturnValue(Effect.void)
    const response = Response.json({ tag: "#P0Y", name: "Player" })
    const program = observeProxySearch(principal, request(), response)
    expect(await response.json()).toEqual({ tag: "#P0Y", name: "Player" })
    await Effect.runPromise(program.pipe(Effect.provideService(SqlClient.SqlClient, {} as unknown as SqlClient.SqlClient)))
    expect(record).toHaveBeenCalledWith(principal, "/v1/players/%23P0Y", 200, { tag: "#P0Y", name: "Player" })
  })
  it("does not clone or persist unsuccessful or non-profile requests", async () => {
    for (const [path, status] of [["/proxy/v1/clans/%23P0Y/members", 200], ["/proxy/v1/players/%23P0Y", 404]] as const) {
      const response = new Response("unchanged", { status })
      const clone = vi.spyOn(response, "clone")
      await run(response, request(path))
      expect(clone).not.toHaveBeenCalled()
      expect(await response.text()).toBe("unchanged")
    }
    expect(record).not.toHaveBeenCalled()
  })
  it("bounds snapshot reads while passing the original payload through unchanged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const raw = JSON.stringify({ data: "x".repeat(1024 * 1024) })
    const response = new Response(raw)
    const observation = run(response)
    expect(await response.text()).toBe(raw)
    await observation
    expect(record).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('{"event":"proxy_recent_search_not_saved"}')
    warn.mockRestore()
  })
})
