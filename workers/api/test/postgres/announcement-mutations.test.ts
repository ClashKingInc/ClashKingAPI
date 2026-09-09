import { PgClient } from "@effect/sql-pg"
import { ManagedAppAnnouncement } from "@clashking/api-contracts"
import { Effect, Layer, Redacted, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { dispatchAnnouncementMutations } from "../../src/announcement-mutations.js"
import { AuthIdentity } from "../../src/auth.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const layer = Layer.merge(PgClient.layer({ url: Redacted.make(databaseUrl) }), Layer.succeed(AuthIdentity, {
  requireBot: () => Effect.succeed({ kind: "bot" as const }),
  requireUser: () => Effect.die("No user auth"), requireUserOrBot: () => Effect.die("No mixed auth"),
}))
const mutate = (method: string, id = "", body?: unknown) => dispatchAnnouncementMutations(new Request(
  `https://api.clashk.ing/v2/app/announcements${id ? `/${id}` : ""}`, {
    method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  },
))
const decode = (response: Response | undefined) => Effect.promise(async () => {
  expect(response?.status).toBe(200)
  return Schema.decodeUnknownSync(ManagedAppAnnouncement)(await response!.json())
})

it("creates, replaces, archives and preserves managed records in the authoritative Goose schema", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const initialAdminPosts = yield* sql`SELECT id FROM admin_posts`
    const created = yield* decode(yield* mutate("POST", "", {
      title: " Initial ", subtitle: " Summary ", body: " Original body ", status: "published", target: "ios",
      html_url: " https://posts.example.test/story.html ", html_object_key: " story.html ",
      starts_at: "2026-09-03T12:00:00-05:00", ends_at: "2026-09-10T12:00:00-05:00",
    }))
    expect(created).toMatchObject({ title: "Initial", subtitle: "Summary", body: " Original body ",
      html_url: "https://posts.example.test/story.html", html_object_key: "story.html",
      starts_at: "2026-09-03T17:00:00.000Z", ends_at: "2026-09-10T17:00:00.000Z" })
    const updated = yield* decode(yield* mutate("PUT", created.id, { title: "Replacement", subtitle: "Next" }))
    expect(updated).toMatchObject({ id: created.id, title: "Replacement", status: "draft", target: "all", starts_at: created.starts_at })
    expect(updated).not.toHaveProperty("ends_at")
    expect(updated).not.toHaveProperty("html_url")
    expect(updated).not.toHaveProperty("body")
    expect(yield* sql`SELECT body, ends_at, html_url, html_object_key FROM app_announcements WHERE id = ${created.id}`)
      .toEqual([{ body: "", ends_at: null, html_url: null, html_object_key: null }])
    const archived = yield* decode(yield* mutate("DELETE", created.id))
    expect(archived).toMatchObject({ id: created.id, status: "archived", title: "Replacement" })
    expect(yield* sql`SELECT id::text FROM app_announcements WHERE id = ${created.id}`).toEqual([{ id: created.id }])
    const defaults = yield* decode(yield* mutate("POST", "", { title: "Default", subtitle: "Timing" }))
    expect(Math.abs(Date.now() - Date.parse(defaults.starts_at))).toBeLessThan(60_000)
    for (const method of ["PUT", "DELETE"]) {
      expect(yield* mutate(method, "019f5400-1111-7111-8111-123456789abc", method === "PUT" ? { title: "Missing", subtitle: "Missing" } : undefined)
        .pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
    }
    expect(yield* sql`SELECT id FROM admin_posts`).toEqual(initialAdminPosts)
  }).pipe(Effect.provide(layer), Effect.scoped))
})
