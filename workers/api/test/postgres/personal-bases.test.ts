import { PersonalBasesState } from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { AuthIdentity } from "../../src/auth.js"
import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { dispatchMobilePersistence } from "../../src/mobile-persistence.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Run through clashking_schemas/scripts/with-test-timescale.sh")
const bindings = { HYPERDRIVE: { connectionString: databaseUrl } } as WorkerBindings
const userId = "7540000000000000001"
const layer = Layer.merge(databaseLayer(bindings), Layer.succeed(AuthIdentity, {
  requireUser: () => Effect.succeed({ kind: "user" as const, userId }), requireUserOrBot: () => Effect.succeed({ kind: "user" as const, userId }),
  requireBot: () => Effect.die("Unexpected bot authentication"),
}))
const request = (path: string, method = "GET", body?: unknown) => new Request(`https://api.clashk.ing${path}`, {
  method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
})
const execute = (path: string, method = "GET", body?: unknown) => Effect.gen(function* () {
  const response = yield* dispatchMobilePersistence(request(path, method, body), bindings)
  if (response === undefined) return yield* Effect.die(new Error("Personal base route was not claimed"))
  return Schema.decodeUnknownSync(PersonalBasesState)(yield* Effect.promise(() => response.json()))
})

describe("personal bases against authoritative Goose migrations", () => {
  it("saves and relabels bases, preserves download history, and removes only old saved rows", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO auth_users(user_id,provider) VALUES (${userId},'discord')`
      const bases = yield* sql<{ id: string }>`INSERT INTO bases(base_link,message_id,server_id,channel_id,description,downloads) VALUES
        ('https://link.clashofclans.com/en?action=OpenLayout&id=TH17','7540000000000000011','7540000000000000012','7540000000000000013','First',${JSON.stringify({ [userId]: "2026-09-01T00:00:00.000Z" })}::jsonb),
        ('https://link.clashofclans.com/en?action=OpenLayout&id=TH18','7540000000000000014','7540000000000000012','7540000000000000013','Second','{}'::jsonb),
        ('https://link.clashofclans.com/en?action=OpenLayout&id=TH19','7540000000000000015','7540000000000000012','7540000000000000013','Old','{}'::jsonb) RETURNING id::text`
      const [first, second, old] = bases.map((row) => row.id)
      yield* sql`UPDATE bases SET images=ARRAY['https://api.clashk.ing/v2/media/first.png'] WHERE id=${first}::bigint`
      expect(yield* execute("/v2/bases/personal")).toEqual({ items: [expect.objectContaining({ id: first, kind: null, saved: false,
        savedAt: null, downloadedAt: "2026-09-01T00:00:00.000Z", downloadCount: 1 })] })
      const saved = yield* execute(`/v2/bases/personal/${first}`, "PUT", { kind: "war" })
      expect(saved.items[0]).toMatchObject({ id: first, kind: "war", saved: true, savedAt: expect.any(String), downloadedAt: "2026-09-01T00:00:00.000Z" })
      const savedAt = saved.items[0]!.savedAt
      expect((yield* execute(`/v2/bases/personal/${first}`, "PUT", { kind: "legend" })).items[0]).toMatchObject({ kind: "legend", savedAt })
      expect((yield* execute(`/v2/bases/personal/${second}`, "PUT", { kind: null })).items.find((base) => base.id === second)).toMatchObject({ kind: null, saved: true })
      yield* sql`INSERT INTO user_saved_bases(user_id,base_id,kind,saved_at) VALUES (${userId},${old}::bigint,'war',now()-interval '91 days')`
      const cleaned = yield* execute("/v2/bases/personal/older-than-90-days", "DELETE")
      expect(cleaned.items.some((base) => base.id === old)).toBe(false)
      expect(cleaned.items.find((base) => base.id === first)).toMatchObject({ saved: true, kind: "legend" })
      expect((yield* execute(`/v2/bases/personal/${first}`, "DELETE")).items.find((base) => base.id === first)).toMatchObject({ saved: false, kind: null, savedAt: null, downloadedAt: "2026-09-01T00:00:00.000Z" })
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
