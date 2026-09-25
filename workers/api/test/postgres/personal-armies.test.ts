import { PersonalArmiesState } from "@clashking/api-contracts"
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
const userId = "7540000000000000201"
const layer = Layer.merge(databaseLayer(bindings), Layer.succeed(AuthIdentity, {
  requireUser: () => Effect.succeed({ kind: "user" as const, userId }),
  requireUserOrBot: () => Effect.succeed({ kind: "user" as const, userId }),
  requireBot: () => Effect.die("Unexpected bot authentication"),
}))
const execute = (path: string, method = "GET") => Effect.gen(function* () {
  const response = yield* dispatchMobilePersistence(new Request(`https://api.clashk.ing${path}`, { method }), bindings)
  if (response === undefined) return yield* Effect.die(new Error("Personal army route was not claimed"))
  return Schema.decodeUnknownSync(PersonalArmiesState)(yield* Effect.promise(() => response.json()))
})

describe("personal armies against authoritative Goose migrations", () => {
  it("saves known immutable compositions and deletes only the user's reference", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO auth_users(user_id,provider) VALUES (${userId},'discord')`
      yield* sql`INSERT INTO army_compositions(share_code,main_troops,clan_castle_troops,spells,heroes,equipment,pet_assignments,siege_machine_id)
        VALUES ('u1x0','[{"id":0,"quantity":1}]','[]','[{"id":1,"quantity":2,"clanCastle":false}]',ARRAY[28000000],
          '[{"equipmentId":90000000,"heroId":28000000}]','[{"petId":73000000,"heroId":28000000}]',70000000)`
      expect(yield* execute("/v2/armies/personal")).toEqual({ items: [] })
      const saved = yield* execute("/v2/armies/personal/u1x0", "PUT")
      expect(saved.items).toEqual([{ shareCode: "u1x0",
        armyLink: "https://link.clashofclans.com/en?action=CopyArmy&army=u1x0",
        mainTroops: [{ id: 0, quantity: 1 }], clanCastleTroops: [],
        spells: [{ id: 1, quantity: 2, clanCastle: false }], heroes: [28_000_000],
        equipment: [{ equipmentId: 90_000_000, heroId: 28_000_000 }],
        petAssignments: [{ petId: 73_000_000, heroId: 28_000_000 }], siegeMachineId: 70_000_000,
        savedAt: expect.any(String) }])
      const savedAt = saved.items[0]!.savedAt
      expect((yield* execute("/v2/armies/personal/u1x0", "PUT")).items[0]?.savedAt).toBe(savedAt)
      expect(yield* execute("/v2/armies/personal/u1x0", "DELETE")).toEqual({ items: [] })
      expect(yield* sql`SELECT share_code FROM army_compositions WHERE share_code='u1x0'`).toEqual([{ share_code: "u1x0" }])
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
