import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { DiscordApi } from "../../src/discord-api.js"
import { DiscordCredentials } from "../../src/discord-credentials.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { StoredTokenCipher } from "../../src/fernet.js"
import { databaseLayer } from "../../src/database.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run this suite through clashking_schemas/scripts/with-test-timescale.sh")
}

describe("Discord credential row-lock integration", () => {
  it("refreshes an expired user/device once across simultaneous transactions", async () => {
    let refreshCalls = 0
    const mocks = Layer.mergeAll(
      WorkerEnvironment.layer({ DISCORD_CLIENT_ID: "123456789012345678", DISCORD_CLIENT_SECRET: "test" } as WorkerBindings),
      Layer.succeed(StoredTokenCipher, {
        decrypt: (value) => Effect.succeed(value),
        encrypt: (value) => Effect.succeed(value),
      }),
      Layer.succeed(DiscordApi, {
        request: () => Effect.die("Unexpected Discord resource request"),
        token: () => Effect.gen(function* () {
          refreshCalls += 1
          yield* Effect.sleep("50 millis")
          return { access_token: "fresh-access", refresh_token: "rotated-refresh", expires_in: 3_600 }
        }),
      }),
    )
    const layer = Layer.mergeAll(
      DiscordCredentials.layer.pipe(Layer.provideMerge(mocks)),
      databaseLayer({ HYPERDRIVE: { connectionString: databaseUrl } } as WorkerBindings),
    )
    const tokens = await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const userId = crypto.randomUUID()
      yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${userId}, 'discord')`
      yield* sql`INSERT INTO auth_discord_tokens
        (user_id, device_id, access_token_ciphertext, refresh_token_ciphertext, expires_at)
        VALUES (${userId}, 'device', 'old-access', 'old-refresh', now() - interval '1 minute')`
      const credentials = yield* DiscordCredentials
      const values = yield* Effect.all([
        credentials.accessToken(userId, "device"),
        credentials.accessToken(userId, "device"),
      ], { concurrency: "unbounded" })
      const stored = yield* sql<{ access_token_ciphertext: string; refresh_token_ciphertext: string }>`
        SELECT access_token_ciphertext, refresh_token_ciphertext FROM auth_discord_tokens WHERE user_id = ${userId}
      `
      expect(stored[0]).toEqual({ access_token_ciphertext: "fresh-access", refresh_token_ciphertext: "rotated-refresh" })
      return values
    }).pipe(Effect.provide(layer), Effect.scoped))
    expect(tokens).toEqual(["fresh-access", "fresh-access"])
    expect(refreshCalls).toBe(1)
  })
})
