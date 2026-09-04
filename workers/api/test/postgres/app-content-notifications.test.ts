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

  it("stores encrypted tokens, persists raid arrays, publishes after commit, and unregisters only one environment", async () => {
    const userId = `18446744073709551615-${crypto.randomUUID()}`
    const deviceId = crypto.randomUUID()
    const publications: Array<unknown> = []
    const bindings = {
      DATA_ENCRYPTION_KEY: "integration-secret", API_BOT_TOKEN: "integration-private-token",
      TRACKING: { fetch: async (input: Request) => {
        expect(input.headers.get("authorization")).toBe("Bearer integration-private-token")
        publications.push(await input.json())
        // An independent connection must see committed preferences before acknowledgement.
        const stored = await Effect.runPromise(Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          return yield* sql`SELECT raid_reminder_timings FROM mobile_push_devices
            WHERE user_id=${userId} AND device_id=${deviceId} AND environment='sandbox'`
        }).pipe(Effect.provide(database), Effect.scoped))
        expect(stored[0]?.raid_reminder_timings).toEqual([15, 4320])
        return Response.json({ published: true })
      } },
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
          environment, token: `integration-token-${environment}-${deviceId}`, authorization_status: "authorized" })
      }
      const tokens = yield* sql<{ token_ciphertext: string }>`SELECT token_ciphertext FROM mobile_push_devices
        WHERE user_id=${userId} AND environment='sandbox'`
      expect(yield* decryptPushToken(tokens[0]!.token_ciphertext, bindings.DATA_ENCRYPTION_KEY))
        .toBe(`integration-token-sandbox-${deviceId}`)
      const preferences = { deviceId, environment: "sandbox", notificationsEnabled: true,
        warAttacksEnabled: true, warStateEnabled: false, warRemindersEnabled: true,
        raidRemindersEnabled: true, eventsEnabled: false, announcementsEnabled: true,
        monthlySupportEnabled: false, reminderTimings: [60, 60, 180], raidReminderTimings: [15, 4320] }
      yield* run("/v2/notifications/preferences", "PUT", preferences)
      const response = yield* run(`/v2/notifications/preferences?device_id=${deviceId}&environment=sandbox`)
      expect(yield* Effect.promise(() => response!.json())).toMatchObject({
        raidRemindersEnabled: true, raidReminderTimings: [15, 4320], reminderTimings: [60, 180], accounts: [],
      })
      yield* run(`/v2/notifications/devices?device_id=${deviceId}&environment=sandbox`, "DELETE")
      const remaining = yield* sql`SELECT environment FROM mobile_push_devices WHERE user_id=${userId}`
      expect(remaining).toEqual([{ environment: "production" }])
    }).pipe(Effect.provide(database), Effect.scoped))
    expect(publications).toEqual([{ user_id: userId }])
  })
})
