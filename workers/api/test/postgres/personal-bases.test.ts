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
const userId = "7540000000000000001", otherUserId = "7540000000000000002", playerTag = "#V0Y"
const layer = Layer.merge(databaseLayer(bindings), Layer.succeed(AuthIdentity, {
  requireUser: () => Effect.succeed({ kind: "user" as const, userId }),
  requireUserOrBot: () => Effect.succeed({ kind: "user" as const, userId }),
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
  it("saves shared rows, preserves download provenance, manages bounded verified-account slots, and cascades unsave", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO auth_users(user_id,provider) VALUES (${userId},'discord'),(${otherUserId},'discord')`
      yield* sql`INSERT INTO player_links(tag,user_id,source,is_verified) VALUES (${playerTag},${userId},'discord',true),('#V0L',${userId},'discord',false)`
      const bases = yield* sql<{ id: string }>`INSERT INTO bases(base_link,message_id,server_id,channel_id,description) VALUES
        ('https://link.clashofclans.com/en?action=OpenLayout&id=TH17','7540000000000000011','7540000000000000012','7540000000000000013','First'),
        ('https://link.clashofclans.com/en?action=OpenLayout&id=TH18','7540000000000000014','7540000000000000012','7540000000000000013','Second') RETURNING id::text`
      const [first, second] = bases.map((row) => row.id)
      yield* sql`INSERT INTO base_images(base_id,position,image_url) VALUES (${first}::bigint,1,'https://api.clashk.ing/v2/media/first.png')`
      expect(yield* execute("/v2/bases/personal")).toEqual({ items: [], slots: [] })
      const saved = yield* execute(`/v2/bases/personal/${first}`, "PUT")
      expect(saved.items[0]).toMatchObject({ id: first, description: "First", saved: true, savedAt: expect.any(String), downloadedAt: null, images: ["https://api.clashk.ing/v2/media/first.png"] })
      yield* sql`INSERT INTO base_downloaders(base_id,user_id) VALUES (${first}::bigint,${userId})`
      expect((yield* execute("/v2/bases/personal")).items[0]?.downloadedAt).toEqual(expect.any(String))
      const assigned = yield* execute(`/v2/bases/personal/slots/${encodeURIComponent(playerTag)}/war/1`, "PUT", { baseId: first })
      expect(assigned.slots).toMatchObject([{ playerTag, kind: "war", number: 1, baseId: first }])
      yield* execute(`/v2/bases/personal/${second}`, "PUT")
      const reassigned = yield* execute(`/v2/bases/personal/slots/${encodeURIComponent(playerTag)}/war/1`, "PUT", { baseId: second })
      expect(reassigned.slots[0]?.baseId).toBe(second)
      expect(yield* execute(`/v2/bases/personal/slots/${encodeURIComponent(playerTag)}/war/2`, "PUT", { baseId: second }).pipe(Effect.flip)).toMatchObject({ _tag: "Conflict" })
      expect(yield* execute(`/v2/bases/personal/slots/%23V0L/legend/1`, "PUT", { baseId: first }).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
      expect((yield* execute(`/v2/bases/personal/${second}`, "DELETE")).slots).toEqual([])
      const unsavedDownloaded = yield* execute(`/v2/bases/personal/${first}`, "DELETE")
      expect(unsavedDownloaded.items).toMatchObject([{ id: first, saved: false, savedAt: null, downloadedAt: expect.any(String) }])
      expect((yield* execute(`/v2/bases/personal/${first}`, "PUT")).items[0]).toMatchObject({ id: first, saved: true, downloadedAt: expect.any(String) })
      expect((yield* execute(`/v2/bases/personal/slots/${encodeURIComponent(playerTag)}/war/1`, "DELETE")).slots).toEqual([])
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
