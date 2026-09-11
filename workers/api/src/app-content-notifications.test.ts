import { expoEndpoints } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { AuthIdentity, type UserPrincipal } from "./auth.js"
import {
  appContentNotificationInternals,
  appContentNotificationRuntimeRoutes,
  dispatchAppContentNotifications,
  type AppContentNotificationBindings,
} from "./app-content-notifications.js"
import { decryptPushToken, encryptPushToken, hashPushToken } from "./push-secrets.js"

const now = "2026-09-03T00:00:00.000Z"
const userId = "18446744073709551615"
const principal: UserPrincipal = { kind: "user", userId, deviceId: "device-one" }
const announcement = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  version: now,
  title: "New season",
  subtitle: "The season is live.",
  banner_image_url: null,
  body_blocks: [{ type: "paragraph", text: "Welcome." }],
  presentation_type: "article",
  story_url: null,
  show_on_home: true,
  pinned_on_home: false,
  target_route: null,
  status: "live",
  published_at: now,
  starts_at: null,
  ends_at: null,
}

interface Statement {
  readonly query: string
  readonly parameters: ReadonlyArray<unknown>
}

const harness = (reply: (statement: Statement) => ReadonlyArray<unknown> = () => [], identity = principal) => {
  const statements: Array<Statement> = []
  const events: Array<string> = []
  let transactions = 0
  const sql = Object.assign(() => Effect.succeed([]), {
    unsafe: (query: string, parameters: ReadonlyArray<unknown> = []) => {
      const statement = { query, parameters }
      statements.push(statement)
      return Effect.succeed(reply(statement))
    },
    withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => {
      transactions += 1
      return effect.pipe(Effect.tap(() => Effect.sync(() => { events.push("committed") })))
    },
  }) as unknown as SqlClient.SqlClient
  const auth = AuthIdentity.of({
    requireUser: () => Effect.succeed(identity),
    requireBot: () => Effect.succeed({ kind: "bot" }),
    requireUserOrBot: () => Effect.succeed(identity),
  })
  const run = (request: Request) => Effect.runPromise(dispatchAppContentNotifications(request, {
    DATA_ENCRYPTION_KEY: "local-test-key",
  } as AppContentNotificationBindings).pipe(
    Effect.provideService(SqlClient.SqlClient, sql),
    Effect.provideService(AuthIdentity, auth),
  ))
  return { run, statements, events, transactions: () => transactions }
}

const request = (path: string, method = "GET", body?: unknown) => new Request(`https://api.clashk.ing${path}`, {
  method,
  ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
})

describe("public app content handlers", () => {
  it("owns exactly the eight shared content and notification descriptors", () => {
    const expected = [expoEndpoints.posts, expoEndpoints.activeAnnouncements, expoEndpoints.announcement,
      expoEndpoints.notificationDeviceRegister, expoEndpoints.notificationDeviceDelete,
      expoEndpoints.notificationPreferencesGet, expoEndpoints.notificationPreferencesPut,
      expoEndpoints.notificationAccountPut].map(({ method, path }) => ({ method, path }))
    expect(appContentNotificationRuntimeRoutes).toEqual(expected)
  })

  it("returns active content through the concrete contract and scopes SQL to published visible posts", async () => {
    const test = harness(() => [announcement])
    const response = await test.run(request("/v2/app/announcements/active?target=ios&locale=es_MX"))
    expect(response?.status).toBe(200)
    expect(await response?.json()).toMatchObject({
      item: { id: announcement.id, title: "New season", body_blocks: announcement.body_blocks },
      items: [{ id: announcement.id }],
    })
    expect(test.statements[0]?.query).toContain("status='live' AND published_at IS NOT NULL")
    expect(test.statements[0]?.query).toContain("show_on_home=true")
    expect(test.statements[0]?.query).toContain("pinned_on_home DESC, priority DESC")
    expect(test.statements[0]?.parameters).toEqual(["ios", "es"])
  })

  it("uses limit-plus-one pagination without exposing draft or archived posts", async () => {
    const test = harness(() => [announcement, { ...announcement, id: "123e4567-e89b-12d3-a456-426614174001" }])
    const response = await test.run(request("/v2/app/posts?target=all&locale=en&limit=1&offset=4"))
    expect(await response?.json()).toMatchObject({ items: [{ id: announcement.id }], has_more: true, next_offset: 5 })
    expect(test.statements[0]?.query).toContain("status IN ('live','expired') AND published_at IS NOT NULL")
    expect(test.statements[0]?.parameters).toEqual(["all", 2, 4, "en"])
  })

  it("rejects invalid pagination before a database query", async () => {
    const test = harness()
    await expect(test.run(request("/v2/app/posts?target=all&locale=en&limit=1.5&offset=0"))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(test.statements).toHaveLength(0)
  })

  it("returns a missing single announcement as typed NotFound", async () => {
    const test = harness()
    await expect(test.run(request(`/v2/app/announcements/${announcement.id}?locale=en`))).rejects.toMatchObject({ _tag: "NotFound" })
  })

  it("rejects malformed nested database content at egress", async () => {
    const test = harness(() => [{ ...announcement, body_blocks: [{ type: "paragraph", text: 42 }] }])
    await expect(test.run(request("/v2/app/announcements/active?target=all&locale=en"))).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })
})

const preferenceBody = {
  warAttacksEnabled: true, warStateEnabled: false, warRemindersEnabled: true,
  raidRemindersEnabled: true, eventsEnabled: false, announcementsEnabled: true,
  monthlySupportEnabled: false, legendDefensesEnabled: true,
  reminderTimings: [60, 60, 180], raidReminderTimings: [15, 30, 4320],
}

describe("notification SQL and authorization", () => {
  it("reads user-level preferences with every currently verified account", async () => {
    const test = harness(({ query }) => query.includes("FROM mobile_notification_preferences") ? [{
      war_attacks_enabled: true, war_state_enabled: false, war_reminders_enabled: true,
      raid_reminders_enabled: true, events_enabled: false, announcements_enabled: true,
      monthly_support_enabled: false, legend_defenses_enabled: true,
      reminder_timings: [60], raid_reminder_timings: [15, 4320],
    }] : [{ tag: "#P0Y", enabled: true }])
    const response = await test.run(request("/v2/notifications/preferences"))
    const body = await response?.json()
    expect(body).toMatchObject({
      raidRemindersEnabled: true, legendDefensesEnabled: true,
      raidReminderTimings: [15, 4320], accounts: [{ tag: "#P0Y", enabled: true }],
    })
    expect(body).not.toHaveProperty("legendAttacksEnabled")
    expect(body).not.toHaveProperty("notificationsEnabled")
    expect(test.statements[0]?.parameters).toEqual([userId])
  })

  it("returns disabled defaults before preferences are saved", async () => {
    const test = harness()
    const response = await test.run(request("/v2/notifications/preferences"))
    expect(await response?.json()).toMatchObject({ warAttacksEnabled: false, legendDefensesEnabled: false, accounts: [] })
  })

  it("encrypts registration tokens and atomically transfers duplicate ownership", async () => {
    const token = "example-fcm-token-with-more-than-twenty-characters"
    const test = harness(({ query }) => query.includes("INSERT INTO mobile_push_devices") ? [{
      device_id: "device-one", provider: "fcm", platform: "ios", environment: "sandbox",
      authorization_status: "authorized", enabled: true, last_seen_at: now,
    }] : [])
    const response = await test.run(request("/v2/notifications/devices", "POST", {
      token, device_id: "device-one", platform: "ios", environment: "sandbox",
      authorization_status: "authorized", enabled: false,
    }))
    expect(response?.status).toBe(200)
    expect(test.transactions()).toBe(1)
    const insert = test.statements.find(({ query }) => query.includes("INSERT INTO mobile_push_devices"))
    expect(insert?.parameters[0]).toBe(userId)
    expect(insert?.parameters[5]).not.toBe(token)
    expect(await Effect.runPromise(decryptPushToken(String(insert?.parameters[5]), "local-test-key"))).toBe(token)
    expect(insert?.parameters[6]).toBe(await Effect.runPromise(hashPushToken(token)))
    expect(insert?.parameters[10]).toBe(false)
    expect(test.statements[0]?.query).toContain("token_hash=$1")
    expect(JSON.stringify(await response?.json())).not.toContain(token)
  })

  it("rejects a device that does not match the authenticated session", async () => {
    const test = harness()
    await expect(test.run(request("/v2/notifications/devices?device_id=other&environment=sandbox", "DELETE")))
      .rejects.toMatchObject({ _tag: "Forbidden" })
    expect(test.statements).toHaveLength(0)
  })

  it("scopes deletion to the exact user, device, and environment", async () => {
    const test = harness()
    const response = await test.run(request("/v2/notifications/devices?device_id=device-one&environment=sandbox", "DELETE"))
    expect(await response?.json()).toEqual({ message: "Notification device unregistered" })
    expect(test.statements[0]?.parameters).toEqual([userId, "device-one", "sandbox"])
    expect(test.statements[0]?.query).toContain("user_id=$1 AND device_id=$2 AND environment=$3")
  })

  it("persists raid preferences and normalizes war timings without replacing account choices", async () => {
    const test = harness(({ query }) => query.includes("FROM player_links") ? [{ tag: "#P0Y", enabled: true }] : [])
    const response = await test.run(request("/v2/notifications/preferences", "PUT", preferenceBody))
    expect(await response?.json()).toMatchObject({
      raidRemindersEnabled: true, raidReminderTimings: [15, 30, 4320], reminderTimings: [60, 180],
      legendDefensesEnabled: true, accounts: [{ tag: "#P0Y", enabled: true }],
    })
    const update = test.statements[0]
    expect(update?.query).toContain("INSERT INTO mobile_notification_preferences")
    expect(update?.query).toContain("legend_defenses_enabled")
    expect(update?.parameters[0]).toBe(userId)
    expect(update?.parameters[8]).toBe(true)
    expect(update?.parameters[10]).toEqual([15, 30, 4320])
    expect(test.events).toEqual(["committed"])
  })

  it("rejects out-of-granularity raid timings before writing", async () => {
    const test = harness()
    await expect(test.run(request("/v2/notifications/preferences", "PUT", { ...preferenceBody, raidReminderTimings: [16] })))
      .rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(test.statements).toHaveLength(0)
  })

  it("does not enable notifications for another user's unverified account", async () => {
    const test = harness(() => [{ exists: false }])
    await expect(test.run(request("/v2/notifications/accounts/%23P0Y", "PUT", { enabled: true })))
      .rejects.toMatchObject({ _tag: "Forbidden" })
    expect(test.statements[0]?.parameters).toEqual([userId, "#P0Y"])
    expect(test.statements.some(({ query }) => query.startsWith("INSERT"))).toBe(false)
  })

  it("persists an explicit disabled state for a verified linked account", async () => {
    const test = harness(({ query }) => query.includes("SELECT EXISTS") ? [{ exists: true }] : [])
    const response = await test.run(request("/v2/notifications/accounts/%23P0Y", "PUT", { enabled: false }))
    expect(await response?.json()).toEqual({ tag: "#P0Y", enabled: false })
    expect(test.statements[1]?.query).toContain("enabled=excluded.enabled")
    expect(test.statements[1]?.parameters).toEqual([userId, "#P0Y", false])
  })
})

describe("push secret storage", () => {
  it("round-trips the existing v1 envelope and rejects a wrong key", async () => {
    const sealed = await Effect.runPromise(encryptPushToken("registered-device-token", "secret-one"))
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+$/u)
    expect(await Effect.runPromise(decryptPushToken(sealed, "secret-one"))).toBe("registered-device-token")
    await expect(Effect.runPromise(decryptPushToken(sealed, "secret-two"))).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })

  it("keeps locale normalization and reminder bounds explicit", async () => {
    expect(appContentNotificationInternals.localeFor("ES_mx")).toBe("es")
    expect(appContentNotificationInternals.localeFor("invalid")).toBe("en")
    await expect(Effect.runPromise(appContentNotificationInternals.normalizeTimings([1, 2, 3, 4], 2820, 1)))
      .rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
})
