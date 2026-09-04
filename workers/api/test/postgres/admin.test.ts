import { Campaign, CreatedDeveloperApplication, DeveloperApplication, Post } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { AccessIdentity, type AdminPrincipal } from "../../src/access.js"
import { dispatchAdmin } from "../../src/admin.js"
import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { Forbidden } from "../../src/errors.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run this suite through clashking_schemas/scripts/with-test-timescale.sh")
}
const layer = databaseLayer({ HYPERDRIVE: { connectionString: databaseUrl } } as WorkerBindings)
const principal: AdminPrincipal = { id: "18446744073709551615", email: "owner@example.test", username: "owner",
  display_name: "Owner", role: "owner", active: true, created_at: "2026-09-03T00:00:00.000Z", updated_at: "2026-09-03T00:00:00.000Z" }
const access = AccessIdentity.of({ requireAdmin: () => Effect.succeed(principal) })
const run = (path: string, method = "GET", body?: unknown) => dispatchAdmin(new Request(`https://api.clashk.ing/v2/admin${path}`, {
  method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
}), {} as WorkerBindings).pipe(Effect.provideService(AccessIdentity, access),
  Effect.flatMap((response) => response!.status === 204 ? Effect.succeed(undefined) : Effect.promise(() => response!.json())))

describe("Admin handlers against authoritative Goose migrations", () => {
  it("uses migration006 developer metadata for create/list/get/update/revoke with exact BIGINT usage", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const created = Schema.decodeUnknownSync(CreatedDeveloperApplication)(yield* run("/developer-applications", "POST", { developer_name: "Example Developer" }))
      expect(created.api_token).toMatch(/^ck_dev_/u)
      expect(created.api_request_count).toBe("0")
      const id = created.application_id
      yield* sql`UPDATE developer_applications SET api_request_count=9007199254740993, links_lookup_count=9223372036854775807
        WHERE application_id=${id}`
      const retrieved = Schema.decodeUnknownSync(DeveloperApplication)(yield* run(`/developer-applications/${id}`))
      expect(retrieved.api_request_count).toBe("9007199254740993")
      expect(retrieved.links_lookup_count).toBe("9223372036854775807")
      expect(retrieved).not.toHaveProperty("api_token")
      expect(retrieved).not.toHaveProperty("connect_url")
      expect(yield* run("/developer-applications")).toEqual(expect.arrayContaining([retrieved]))
      expect(yield* run(`/developer-applications/${id}`, "PATCH", { developer_name: "Renamed Developer" }))
        .toMatchObject({ developer_name: "Renamed Developer", api_request_count: "9007199254740993" })
      yield* run(`/developer-applications/${id}`, "DELETE")
      expect(yield* run(`/developer-applications/${id}`)).toMatchObject({ revoked_at: expect.any(String) })
      expect(yield* run(`/developer-applications/${id}`, "PATCH", { developer_name: "Cannot rename" }))
        .toMatchObject({ code: "conflict" })
      const audit = yield* sql`SELECT actor,action FROM admin_audit_events WHERE resource_id=${id} ORDER BY created_at`
      expect(audit).toEqual(["create", "update", "revoke"].map((action) => ({ actor: principal.id, action: `developer_application.${action}` })))
      const stored = yield* sql<{ token_hash: Uint8Array }>`SELECT token_hash FROM developer_applications WHERE application_id=${id}`
      expect(Buffer.from(stored[0]!.token_hash).toString("hex"))
        .toBe(Buffer.from(yield* Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(created.api_token)))).toString("hex"))
    }).pipe(Effect.provide(layer), Effect.scoped))
  })

  it("denies unauthorized developer creation and rolls developer plus audit writes back together", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const name = `rollback-${crypto.randomUUID()}`
      const denied = dispatchAdmin(new Request("https://api.clashk.ing/v2/admin/developer-applications", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ developer_name: name }),
      }), {} as WorkerBindings).pipe(Effect.provideService(AccessIdentity, {
        requireAdmin: () => Effect.fail(new Forbidden({ message: "Owner required" })),
      }))
      expect((yield* Effect.exit(denied))._tag).toBe("Failure")
      const rollback = yield* Effect.exit(sql.withTransaction(Effect.gen(function* () {
        yield* run("/developer-applications", "POST", { developer_name: name })
        return yield* Effect.fail("deliberate-test-rollback")
      })))
      expect(rollback._tag).toBe("Failure")
      expect(yield* sql`SELECT application_id FROM developer_applications WHERE developer_name=${name}`).toEqual([])
      expect(yield* sql`SELECT id FROM admin_audit_events WHERE summary=${`Created developer application ${name}`}`).toEqual([])
    }).pipe(Effect.provide(layer), Effect.scoped))
  })

  it("persists flags and campaign JSON with the stable audit actor", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const key = `integration-${crypto.randomUUID()}`
      const flag = yield* run("/feature-flags", "POST", { key, name: "Integration flag", platforms: ["ios"], rolloutPercentage: 35 })
      expect(flag).toMatchObject({ key, rolloutPercentage: 35, platforms: ["ios"] })
      expect(yield* run(`/feature-flags/${key}`, "PATCH", { enabled: true })).toMatchObject({ enabled: true, rolloutPercentage: 35 })
      const campaign = yield* run("/campaigns", "POST", { title: "Integration campaign", body: "Hello",
        trigger_type: "monthly", day_of_month: 1, send_time: "09:00", status: "scheduled",
        platforms: ["ios", "android"], translations: { es: { title: "Hola", body: "Mundo" } } })
      expect(campaign).toMatchObject({ created_by: principal.id, send_time: "09:00", translations: { es: { title: "Hola", body: "Mundo" } } })
      const audit = yield* sql`SELECT actor,action FROM admin_audit_events WHERE resource_id=${key} ORDER BY created_at`
      expect(audit).toEqual([{ actor: principal.id, action: "feature_flag.create" }, { actor: principal.id, action: "feature_flag.update" }])
    }).pipe(Effect.provide(layer), Effect.scoped))
  })

  it("serializes concurrent post edits into distinct revisions and restores the original snapshot", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const post = yield* run("/posts", "POST", { title: "Original title", summary: "Original summary",
        body_blocks: [{ type: "paragraph", text: "Original body" }], translations: { es: { title: "Original", summary: "Resumen" } } })
      const id = Schema.decodeUnknownSync(Post)(post).id
      yield* Effect.all([run(`/posts/${id}`, "PATCH", { title: "Updated title" }),
        run(`/posts/${id}`, "PATCH", { summary: "Updated summary" })], { concurrency: "unbounded" })
      expect(yield* run(`/posts/${id}`)).toMatchObject({ title: "Updated title", summary: "Updated summary", revision_number: 3 })
      const revisions = yield* sql`SELECT revision_number FROM admin_post_revisions WHERE post_id=${id} ORDER BY revision_number`
      expect(revisions).toEqual([{ revision_number: 1 }, { revision_number: 2 }])
      expect(yield* run(`/posts/${id}/revisions/1/restore`, "POST", {}))
        .toMatchObject({ title: "Original title", summary: "Original summary", revision_number: 4 })
    }).pipe(Effect.provide(layer), Effect.scoped))
  })

  it("retains disjoint concurrent feature-flag and campaign patches", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const key = `concurrent-${crypto.randomUUID()}`
      yield* run("/feature-flags", "POST", { key, name: "Original flag", enabled: false })
      yield* Effect.all([run(`/feature-flags/${key}`, "PATCH", { enabled: true }),
        run(`/feature-flags/${key}`, "PATCH", { name: "Renamed flag" })], { concurrency: "unbounded" })
      expect(yield* run("/feature-flags")).toEqual(expect.arrayContaining([
        expect.objectContaining({ key, name: "Renamed flag", enabled: true }),
      ]))
      const campaign = Schema.decodeUnknownSync(Campaign)(yield* run("/campaigns", "POST", { title: "Original campaign", body: "Original body" }))
      yield* Effect.all([run(`/campaigns/${campaign.id}`, "PATCH", { title: "Renamed campaign" }),
        run(`/campaigns/${campaign.id}`, "PATCH", { body: "Updated body" })], { concurrency: "unbounded" })
      expect(yield* run("/campaigns")).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: campaign.id, title: "Renamed campaign", body: "Updated body" }),
      ]))
    }).pipe(Effect.provide(layer), Effect.scoped))
  })

  it("serializes first channel activation before validating a concurrent downgrade", async () => {
    const runtime = crypto.randomUUID()
    let signalNewer: () => void = () => {}
    const newerStarted = new Promise<void>((resolve) => { signalNewer = resolve })
    const bindings = { APP_UPDATES: { get: async (key: string) => {
      const version = key.includes("2.0.1") ? "2.0.1" : "1.0.1"
      if (version === "2.0.1") signalNewer()
      await new Promise((resolve) => setTimeout(resolve, version === "2.0.1" ? 30 : 100))
      return { json: async () => ({ schemaVersion: 1, version, appVersion: version,
        track: "production", type: "ota", gitSha: "test", createdAt: "2026-09-03T00:00:00.000Z",
        platforms: { ios: { runtimeVersion: runtime, manifest: { id: version } } } }) }
    } } } as unknown as WorkerBindings
    const activate = (version: string) => dispatchAdmin(new Request(`https://api.clashk.ing/v2/admin/app-releases/channels/production/ios/${runtime}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
        activeVersion: version, rollbackTargetVersion: null, rolloutBasisPoints: 10_000, paused: false, schedule: null,
      }),
    }), bindings).pipe(Effect.provideService(AccessIdentity, access))
    await Effect.runPromise(Effect.gen(function* () {
      const responses = yield* Effect.all([activate("2.0.1"),
        Effect.promise(() => newerStarted).pipe(Effect.flatMap(() => activate("1.0.1")))], { concurrency: "unbounded" })
      expect(responses.map((response) => response?.status)).toEqual([200, 409])
      const sql = yield* SqlClient.SqlClient
      expect(yield* sql`SELECT active_version FROM app_update_channels WHERE runtime_version=${runtime}`)
        .toEqual([{ active_version: "2.0.1" }])
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
