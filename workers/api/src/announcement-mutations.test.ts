import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { dispatchAnnouncementMutations } from "./announcement-mutations.js"
import { AuthIdentity } from "./auth.js"
import { Unauthenticated } from "./errors.js"

const id = "019f5400-1111-7111-8111-123456789abc"
const row = { id, title: "Title", subtitle: "Subtitle", body: "", status: "draft", target: "all",
  banner_image_url: null, html_object_key: null, html_url: null, min_app_version: null,
  starts_at: new Date("2026-09-01T00:00:00Z"), ends_at: null,
  created_at: new Date("2026-09-01T00:00:00Z"), updated_at: new Date("2026-09-01T00:00:00Z") }
const body = { title: " Title ", subtitle: " Subtitle " }
function fixture(rows: ReadonlyArray<typeof row> = [row]) {
  const query = vi.fn((_statement: string, _values: ReadonlyArray<unknown>) => Effect.succeed(rows))
  const sql = ((parts: TemplateStringsArray, ...values: ReadonlyArray<unknown>) => query(parts.join("?"), values)) as unknown as SqlClient.SqlClient
  const requireBot = vi.fn((request: Request) => request.headers.get("authorization") === "Bearer bot-test-only"
    ? Effect.succeed({ kind: "bot" as const }) : Effect.fail(new Unauthenticated({ message: "Bot token required" })))
  const layer = Layer.mergeAll(Layer.succeed(SqlClient.SqlClient, sql), Layer.succeed(AuthIdentity, {
    requireBot, requireUser: () => Effect.die("User auth is not allowed"), requireUserOrBot: () => Effect.die("Mixed auth is not allowed"),
  }))
  const run = (method: string, payload: unknown = body, path = method === "POST" ? "" : `/${id}`, headers: Record<string, string> = {}) =>
    Effect.runPromise(dispatchAnnouncementMutations(new Request(`https://api.clashk.ing/v2/app/announcements${path}`, {
      method, headers: { authorization: "Bearer bot-test-only", "content-type": "application/json", ...headers },
      ...(method === "DELETE" || method === "GET" ? {} : { body: JSON.stringify(payload) }),
    })).pipe(Effect.provide(layer)))
  return { query, requireBot, run }
}
describe("Bot announcement mutations", () => {
  it("does not capture read routes", async () => {
    const f = fixture()
    expect(await f.run("GET", undefined, "")).toBeUndefined()
    expect(f.requireBot).not.toHaveBeenCalled()
  })
  it("authorizes Bot before body validation or SQL, with no user-token fallback", async () => {
    const f = fixture()
    await expect(f.run("POST", {}, "", { authorization: "Bearer user-token" })).rejects.toMatchObject({ _tag: "Unauthenticated" })
    expect(f.query).not.toHaveBeenCalled()
  })
  it("creates in the authoritative table with defaults, trimmed metadata and a decoded response", async () => {
    const f = fixture()
    const response = await f.run("POST", { ...body, html_url: " https://posts.example.test/a.html ", html_object_key: " a.html " })
    expect(response?.status).toBe(200)
    expect(response?.headers.get("cache-control")).toBe("no-store")
    expect(await response?.json()).toEqual({ id, title: "Title", subtitle: "Subtitle", status: "draft", target: "all",
      starts_at: "2026-09-01T00:00:00.000Z", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" })
    expect(f.query.mock.calls[0]?.[0]).toContain("INSERT INTO app_announcements")
    expect(f.query.mock.calls[0]?.[1]).toEqual(["Title", "Subtitle", "", "draft", "all", null, "a.html", "https://posts.example.test/a.html", null, null, null])
  })
  it("replaces update fields while preserving omitted starts_at and clearing omitted ends_at", async () => {
    const f = fixture()
    await f.run("PUT")
    expect(f.query.mock.calls[0]?.[0]).toContain("starts_at = COALESCE(?::timestamptz, starts_at)")
    expect(f.query.mock.calls[0]?.[1]).toEqual(["Title", "Subtitle", "", "draft", "all", null, null, null, null, null, null, id])
  })
  it("archives instead of deleting, returns the row and reports missing rows", async () => {
    const f = fixture([{ ...row, status: "archived" }])
    expect(await (await f.run("DELETE"))?.json()).toMatchObject({ status: "archived" })
    expect(f.query.mock.calls[0]?.[0]).toContain("SET status = 'archived'")
    expect(f.query.mock.calls[0]?.[1]).toEqual([id])
    for (const method of ["PUT", "DELETE"]) await expect(fixture([]).run(method)).rejects.toMatchObject({ _tag: "NotFound" })
  })
  it("rejects invalid identifiers, enums, timestamps, blank fields and media types before SQL", async () => {
    const f = fixture()
    for (const value of [{ title: " ", subtitle: "ok" }, { ...body, unexpected: "no" }, { ...body, status: "invalid" }, { ...body, target: "windows" }, { ...body, starts_at: "tomorrow" }, { ...body, ends_at: "2026-09-01" }, { ...body, starts_at: "2026-02-30T00:00:00Z" }]) {
      await expect(f.run("POST", value)).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
    for (const path of ["/invalid", "/%FF", "/019f5400111171118111123456789abc"]) {
      await expect(f.run("PUT", body, path)).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
    await expect(f.run("POST", body, "", { "content-type": "text/plain" })).rejects.toMatchObject({ _tag: "InvalidRequest", status: 415 })
    expect(f.query).not.toHaveBeenCalled()
  })
  it("accepts a real leap day and preserves its RFC3339 offset as SQL input", async () => {
    const f = fixture()
    await f.run("POST", { ...body, starts_at: "2028-02-29T12:00:00-05:00" })
    expect(f.query.mock.calls[0]?.[1]).toContain("2028-02-29T12:00:00-05:00")
  })
  it("caps undeclared streamed bodies before SQL", async () => {
    const f = fixture()
    await expect(f.run("POST", { ...body, body: "x".repeat(1024 * 1024) })).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
    expect(f.query).not.toHaveBeenCalled()
  })
})
