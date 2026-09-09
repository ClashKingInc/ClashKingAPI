import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { BotAdjacentStore } from "../../src/bot-adjacent-runtime.js"
import { databaseLayer } from "../../src/database.js"
import { DiscordApi } from "../../src/discord-api.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run through clashking_schemas/scripts/with-test-timescale.sh")
}

const bindings = { HYPERDRIVE: { connectionString: databaseUrl } } as unknown as WorkerBindings
const dependencies = Layer.mergeAll(
  databaseLayer(bindings),
  WorkerEnvironment.layer(bindings),
  Layer.succeed(DiscordApi, {
    request: () => Effect.die("Unexpected Discord request"),
    token: () => Effect.die("Unexpected Discord token request"),
  }),
)
const layer = Layer.merge(dependencies, BotAdjacentStore.layer.pipe(Layer.provide(dependencies)))

describe("linked-account activity against authoritative Goose migrations", () => {
  it("updates every verified link for the user and leaves unverified links untouched", async () => {
    const userId = "7534567890123456791"
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const store = yield* BotAdjacentStore
      yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified) VALUES
        ('#PA0Y', ${userId}, 'fixture', true),
        ('#PA0L', ${userId}, 'fixture', true),
        ('#PA0G', ${userId}, 'fixture', false)`

      const result = yield* store.updateLinkLastLogin(userId)
      expect(result.updated_count).toBe(2)
      expect(result.timestamp).toEqual(expect.any(String))

      const rows = yield* sql<{ tag: string; last_login: string | null }>`
        SELECT tag, last_login::text FROM player_links WHERE user_id = ${userId} ORDER BY tag`
      expect(rows).toEqual([
        { tag: "#PA0G", last_login: null },
        { tag: "#PA0L", last_login: expect.any(String) },
        { tag: "#PA0Y", last_login: expect.any(String) },
      ])
      expect(rows[1]?.last_login).toBe(rows[2]?.last_login)
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
