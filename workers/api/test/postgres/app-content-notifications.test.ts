import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { dispatchAppContentNotifications } from "../../src/app-content-notifications.js"
import { AuthIdentity } from "../../src/auth.js"
import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { decryptPushToken } from "../../src/push-secrets.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run this suite through clashking_schemas/scripts/with-test-timescale.sh")
}
const database = databaseLayer({ HYPERDRIVE: { connectionString: databaseUrl } } as WorkerBindings)
const request = (path: string, method = "GET", body?: unknown) => new Request(`https://api.clashk.ing${path}`, {
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
})

describe("App content and notifications against authoritative Goose migrations", () => {
  it("localizes published JSON content and filters drafts and other platforms", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const id = crypto.randomUUID()
      yield* sql`INSERT INTO admin_posts (id,slug,title,summary,body_blocks,translations,status,published_at,platforms)
        VALUES (${id},${id},'English title','English summary','[{"type":"paragraph","text":"English"}]'::jsonb,
          '{"es":{"title":"Titulo","summary":"Resumen","body_blocks":[{"type":"paragraph","text":"Hola"}]}}'::jsonb,
          'live',now(),'{ios}'::text[])`
      const auth = AuthIdentity.of({ requireUser: () => Effect.die("Public route authenticated"),
        requireBot: () => Effect.die("Public route authenticated"), requireUserOrBot: () => Effect.die("Public route authenticated") })
      const run = (path: string) => dispatchAppContentNotifications(request(path), {} as WorkerBindings)
        .pipe(Effect.provideService(AuthIdentity, auth))
      const active = yield* run("/v2/app/announcements/active?target=ios&locale=es")
      expect(yield* Effect.promise(() => active!.json())).toMatchObject({ items: [
        { id, title: "Titulo", subtitle: "Resumen", body_blocks: [{ type: "paragraph", text: "Hola" }] },
      ] })
      const android = yield* run("/v2/app/posts?target=android&limit=10&offset=0")
      expect(yield* Effect.promise(() => android!.json())).toMatchObject({ items: [] })
      yield* sql`UPDATE admin_posts SET status='draft' WHERE id=${id}`
      const hidden = yield* Effect.exit(run(`/v2/app/announcements/${id}`))
      expect(hidden._tag).toBe("Failure")
    }).pipe(Effect.provide(database), Effect.scoped))
  })

  it("stores encrypted tokens, persists raid arrays, and unregisters only one environment", async () => {
    const userId = `18446744073709551615-${crypto.randomUUID()}`
    const deviceId = crypto.randomUUID()
    const bindings = {
      DATA_ENCRYPTION_KEY: "integration-secret",
    } as unknown as WorkerBindings
    const principal = { kind: "user" as const, userId, deviceId }
    const auth = AuthIdentity.of({ requireUser: () => Effect.succeed(principal),
      requireBot: () => Effect.succeed({ kind: "bot" }), requireUserOrBot: () => Effect.succeed(principal) })
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO auth_users (user_id,provider) VALUES (${userId},'discord')`
      const run = (path: string, method = "GET", body?: unknown) =>
        dispatchAppContentNotifications(request(path, method, body), bindings).pipe(Effect.provideService(AuthIdentity, auth))
      for (const environment of ["sandbox", "production"]) {
        yield* run("/v2/notifications/devices", "POST", { device_id: deviceId, platform: "ios", provider: "fcm",
          environment, token: `integration-token-${environment}-${deviceId}`, authorization_status: "authorized", enabled: true })
      }
      const tokens = yield* sql<{ token_ciphertext: string }>`SELECT token_ciphertext FROM mobile_push_devices
        WHERE user_id=${userId} AND environment='sandbox'`
      expect(yield* decryptPushToken(tokens[0]!.token_ciphertext, bindings.DATA_ENCRYPTION_KEY))
        .toBe(`integration-token-sandbox-${deviceId}`)
      const preferences = { warAttacksEnabled: true, warStateEnabled: false, warRemindersEnabled: true,
        raidRemindersEnabled: true, eventsEnabled: false, announcementsEnabled: true,
        monthlySupportEnabled: false, legendDefensesEnabled: true,
        reminderTimings: [60, 60, 180], raidReminderTimings: [15, 4320] }
      yield* run("/v2/notifications/preferences", "PUT", preferences)
      const response = yield* run("/v2/notifications/preferences")
      expect(yield* Effect.promise(() => response!.json())).toMatchObject({
        raidRemindersEnabled: true, legendDefensesEnabled: true,
        raidReminderTimings: [15, 4320], reminderTimings: [60, 180], accounts: [],
      })
      yield* run(`/v2/notifications/devices?device_id=${deviceId}&environment=sandbox`, "DELETE")
      const remaining = yield* sql`SELECT environment FROM mobile_push_devices WHERE user_id=${userId}`
      expect(remaining).toEqual([{ environment: "production" }])
    }).pipe(Effect.provide(database), Effect.scoped))
  })
})
