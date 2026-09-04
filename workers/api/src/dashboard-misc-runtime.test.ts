import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AuthIdentity } from "./auth.js"
import {
  DashboardMiscExternal, DashboardMiscReads, DashboardPersonalLinks,
  dashboardMiscRuntimeRoutes, dispatchDashboardMisc, resolveCheckoutFlag,
} from "./dashboard-misc-runtime.js"
import type { WorkerBindings } from "./environment.js"
import { ServerAuthorization } from "./server-authorization.js"

const bindings = {} as WorkerBindings
const snowflake = "123456789012345678"
const principal = { kind: "user" as const, userId: snowflake }
const access = { principal, manager: true, sections: {} }
const emptySubscription = {
  provider: "stripe" as const, status: "none", active: false, checkoutEnabled: false,
  bookmarkNotificationsLimit: 0, rosterAssistantMonthlyCreditUsd: 0, assignedServerId: null,
  rosterAssistantSpentUsd: 0, rosterAssistantRemainingUsd: 0,
}
const emptyUsage = {
  serverId: snowflake, serverSpentUsd: 0, serverLimitUsd: 0.05, userSpentUsd: 0, userLimitUsd: 0,
  globalFreeAvailable: true, subscriptionActive: false, assignedSubscriberCount: 0,
  paidLimitUsd: 0, paidSpentUsd: 0, paidRemainingUsd: 0, resetsAt: "2026-10-01T00:00:00.000Z",
}
const defaults = {
  subscription: () => Effect.succeed(emptySubscription), usage: () => Effect.succeed(emptyUsage),
  recipients: () => Effect.succeed([]), announcements: () => Effect.succeed([]),
} satisfies DashboardMiscReads["Service"]

function layer(options: {
  readonly reads?: Partial<DashboardMiscReads["Service"]>
  readonly external?: Partial<DashboardMiscExternal["Service"]>
  readonly list?: DashboardPersonalLinks["Service"]["list"]
  readonly authorize?: ServerAuthorization["Service"]["require"]
  readonly bot?: boolean
} = {}) {
  return Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, {} as SqlClient.SqlClient),
    Layer.succeed(AuthIdentity, AuthIdentity.of({
      requireUser: () => Effect.succeed(principal), requireBot: () => Effect.succeed({ kind: "bot" as const }),
      requireUserOrBot: () => Effect.succeed(options.bot ? { kind: "bot" as const } : principal),
    })),
    Layer.succeed(ServerAuthorization, ServerAuthorization.of({ resolve: () => Effect.succeed(access), require: options.authorize ?? (() => Effect.succeed(access)) })),
    Layer.succeed(DashboardMiscReads, DashboardMiscReads.of({ ...defaults, ...options.reads })),
    Layer.succeed(DashboardPersonalLinks, DashboardPersonalLinks.of({ list: options.list ?? (() => Effect.succeed([])) })),
    Layer.succeed(DashboardMiscExternal, DashboardMiscExternal.of({
      searchClans: () => Effect.succeed({ items: [], pagination: { limit: 25, hasMore: false, nextCursor: null } }),
      staticNames: () => Effect.succeed([]), staticMaxLevel: () => Effect.succeed({ name: "Barbarian", max_level: 12 }),
      discohook: () => Effect.succeed({ payload: { embeds: [] } }), ...options.external,
    })),
  )
}
const run = (path: string, options: Parameters<typeof layer>[0] = {}, method = "GET") => Effect.runPromise(
  dispatchDashboardMisc(new Request(`https://api.clashk.ing${path}`, { method }), bindings).pipe(Effect.provide(layer(options))),
)

afterEach(() => vi.useRealTimers())

describe("Dashboard miscellaneous GET dispatcher", () => {
  it("has a unique GET-only inventory and leaves paused mutations unmatched", async () => {
    expect(dashboardMiscRuntimeRoutes).toHaveLength(14)
    expect(new Set(dashboardMiscRuntimeRoutes.map(({ method, path }) => `${method} ${path}`)).size).toBe(14)
    expect(dashboardMiscRuntimeRoutes.every(({ method }) => method === "GET")).toBe(true)
    for (const [method, path] of [["POST", `/v2/links/${snowflake}`], ["DELETE", `/v2/links/${snowflake}/%232PP`], ["PUT", "/v2/billing/subscription/assignment"], ["DELETE", "/v2/app/announcements/announcement-id"], ["GET", "/v2/counts"]]) {
      await expect(run(path!, {}, method)).resolves.toBeUndefined()
    }
  })

  it("rejects a malformed matched path instead of returning unmatched", async () => {
    await expect(run("/v2/links/%ZZ")).rejects.toThrow("Invalid percent encoding")
  })

  it("isolates personal links while allowing bot subjects", async () => {
    const list = vi.fn(() => Effect.succeed([]))
    await expect(run("/v2/links/another-user", { list })).rejects.toThrow("another user's")
    expect(list).not.toHaveBeenCalled()
    expect((await run("/v2/links/opaque-auth-subject", { list, bot: true }))?.status).toBe(200)
    expect(list).toHaveBeenCalledWith("opaque-auth-subject")
  })

  it("preserves large Discord strings through both permission checks and reads", async () => {
    const authorize = vi.fn(() => Effect.succeed(access))
    const usage = vi.fn(() => Effect.succeed(emptyUsage))
    const recipients = vi.fn(() => Effect.succeed([]))
    await run(`/v2/billing/usage?serverId=${snowflake}`, { authorize, reads: { usage } })
    await run(`/v2/server/${snowflake}/cwl/%23poy/bonus-recipients?season=2026-09`, { authorize, reads: { recipients } })
    expect(usage).toHaveBeenCalledWith(snowflake, snowflake)
    expect(recipients).toHaveBeenCalledWith(snowflake, "#P0Y", "2026-09")
    expect(authorize).toHaveBeenLastCalledWith(expect.any(Request), snowflake, { section: "settings" })
  })

  it.each(["1e18", "12.3", "NaN"])("rejects invalid server ID %s before authorization", async (id) => {
    const authorize = vi.fn(() => Effect.succeed(access))
    await expect(run(`/v2/billing/usage?serverId=${id}`, { authorize })).rejects.toThrow("Invalid request")
    expect(authorize).not.toHaveBeenCalled()
  })

  it.each(["2026-02-30", "1999-12", "2026-13", "2026-1"])("rejects invalid CWL season %s", async (season) => {
    const recipients = vi.fn(() => Effect.succeed([]))
    await expect(run(`/v2/server/${snowflake}/cwl/%232PP/bonus-recipients?season=${season}`, { reads: { recipients } })).rejects.toThrow("valid CWL season")
    expect(recipients).not.toHaveBeenCalled()
  })

  it("decodes nested responses instead of trusting service annotations", async () => {
    const malformed = { items: [{ name: 1 }], pagination: { limit: 25, hasMore: false, nextCursor: null } }
    const searchClans = () => Effect.succeed(malformed as never)
    await expect(run("/v2/clan/search?query=Clash", { external: { searchClans } })).rejects.toThrow("response failed its contract")
  })

  it("normalizes canonical search arrays and rejects invalid ranges", async () => {
    const searchClans = vi.fn(() => Effect.succeed({ items: [], pagination: { limit: 25, hasMore: false, nextCursor: null } }))
    await run("/v2/clan/search?query=Clash&locationIds=4&locationIds=2&locationIds=4", { external: { searchClans } })
    expect(searchClans).toHaveBeenCalledWith({ query: "Clash", limit: 25, locationIds: [2, 4] })
    await expect(run("/v2/clan/search?query=Clash&members[min]=51")).rejects.toThrow("Invalid search filter range")
  })

  it("validates static categories and locales before consulting the catalog", async () => {
    await expect(run("/v2/static/unknown/names")).rejects.toThrow("category not found")
    await expect(run("/v2/static/troops/names?locale=XX")).rejects.toThrow("locale")
    await expect(run("/v2/static/skins/Barbarian/max-level")).rejects.toThrow("does not support levels")
  })

  it("only sends normalized allowlisted Discohook share URLs to its service", async () => {
    const discohook = vi.fn(() => Effect.succeed({ payload: { embeds: [] } }))
    await run(`/v2/app/discohook-resolve?url=${encodeURIComponent("https://discohook.app/?share=abc_123")}`, { external: { discohook } })
    expect(discohook).toHaveBeenCalledWith("https://discohook.app/api/v1/share/abc_123")
    for (const url of ["https://example.com/", "http://discohook.app/?share=a", "https://user:secret@discohook.app/?share=a", "https://discohook.app/?share=../private"]) {
      await expect(run(`/v2/app/discohook-resolve?url=${encodeURIComponent(url)}`)).rejects.toThrow()
    }
  })

  it("filters the existing management announcement list without owning Expo detail routes", async () => {
    const announcements = vi.fn(() => Effect.succeed([]))
    await run("/v2/app/announcements?status=Published", { reads: { announcements } })
    expect(announcements).toHaveBeenCalledWith("published")
    await expect(run("/v2/app/announcements?status=deleted")).rejects.toThrow("Invalid announcement status")
    await expect(run("/v2/app/announcements/active")).resolves.toBeUndefined()
  })
})

describe("Go date parity", () => {
  it("preserves Friday 07:00 and legend 05:00 UTC boundaries", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-09-04T04:59:59Z"))
    expect(await (await run("/v2/dates/current"))?.json()).toEqual({ season: "2026-09", raid: "2026-08-28", legend: "2026-09-03", "clan-games": "2026-09" })
    vi.setSystemTime(new Date("2026-09-04T07:00:00Z"))
    expect(await (await run("/v2/dates/raid-weekends?number_of_weeks=2"))?.json()).toEqual({ items: ["2026-09-04", "2026-08-28", "2026-08-21"] })
  })

  it("preserves Go month overflow and text formatting", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-03-31T12:00:00Z"))
    expect(await (await run("/v2/dates/seasons?number_of_seasons=3"))?.json()).toEqual({ items: ["2026-03", "2026-03", "2026-01"] })
    expect(await (await run("/v2/dates/seasons?as_text=true"))?.json()).toEqual({ items: ["March 2026"] })
  })

  it("uses existing calendar-first season bounds and four-day raid offset", async () => {
    expect(await (await run("/v2/dates/season-start-end?season=2026-09"))?.json()).toEqual({ season_start: "2026-08-01T05:00:00Z", season_end: "2026-09-01T05:00:00Z" })
    expect(await (await run("/v2/dates/season-start-end?season=2026-09&gold_pass_season=true"))?.json()).toEqual({ season_start: "2026-09-01T00:00:00Z", season_end: "2026-10-01T00:00:00Z" })
    expect(await (await run("/v2/dates/season-raid-dates?season=2026-09"))?.json()).toEqual({ items: ["2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26"] })
  })

  it.each(["-1", "1.5", "1001", "abc"])("bounds resource usage for count %s", async (count) => {
    await expect(run(`/v2/dates/seasons?number_of_seasons=${count}`)).rejects.toThrow()
  })
})

describe("read-only SQL services", () => {
  const sqlFixture = (responses: ReadonlyArray<ReadonlyArray<unknown>>) => {
    const calls: Array<{ text: string; values: ReadonlyArray<unknown> }> = []
    const sql = ((parts: TemplateStringsArray, ...values: ReadonlyArray<unknown>) => {
      calls.push({ text: parts.join("?"), values })
      return Effect.succeed(responses[calls.length - 1] ?? [])
    }) as unknown as SqlClient.SqlClient
    return { calls, sql }
  }

  it("reads entitlements with safe rollout defaults and clamps overspend", async () => {
    const fixture = sqlFixture([[], [{ status: "active", active: true, bookmark_limit: 10, credit: 5, server_id: snowflake, spent: 6 }]])
    const response = await Effect.runPromise(Effect.gen(function* () { return yield* (yield* DashboardMiscReads).subscription(snowflake) }).pipe(
      Effect.provide(DashboardMiscReads.layer), Effect.provideService(SqlClient.SqlClient, fixture.sql),
    ))
    expect(response).toMatchObject({ checkoutEnabled: false, assignedServerId: snowflake, rosterAssistantRemainingUsd: 0 })
    expect(fixture.calls[1]?.values).toContain(snowflake)
    expect(fixture.calls.every((call) => !/\b(?:INSERT|UPDATE|DELETE)\b/u.test(call.text))).toBe(true)
  })

  it("requires configured server-clan membership before querying recipients", async () => {
    const fixture = sqlFixture([[{ exists: false }]])
    await expect(Effect.runPromise(Effect.gen(function* () { return yield* (yield* DashboardMiscReads).recipients(snowflake, "#2PP", "2026-09") }).pipe(
      Effect.provide(DashboardMiscReads.layer), Effect.provideService(SqlClient.SqlClient, fixture.sql),
    ))).rejects.toThrow("not configured")
    expect(fixture.calls).toHaveLength(1)
  })

  it("never substitutes opaque auth subjects for a Discord identity in usage", async () => {
    const fixture = sqlFixture([[]])
    await expect(Effect.runPromise(Effect.gen(function* () { return yield* (yield* DashboardMiscReads).usage("opaque-id", snowflake) }).pipe(
      Effect.provide(DashboardMiscReads.layer), Effect.provideService(SqlClient.SqlClient, fixture.sql),
    ))).rejects.toThrow("Discord identity")
    expect(fixture.calls).toHaveLength(1)
    expect(fixture.calls[0]?.text).toContain("provider = 'discord'")
  })

  it("computes usage from credits without changing Discord strings or exceeding paid remaining credit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-12-31T23:59:59Z"))
    const fixture = sqlFixture([[{ user_id: snowflake }], [{ server: 0.03, global: 10, user: 1.5 }], [{ active: true, credit: 5 }], [{ count: 2, credit: 10, spent: 12 }]])
    const result = await Effect.runPromise(Effect.gen(function* () { return yield* (yield* DashboardMiscReads).usage(snowflake, snowflake) }).pipe(
      Effect.provide(DashboardMiscReads.layer), Effect.provideService(SqlClient.SqlClient, fixture.sql),
    ))
    expect(result).toMatchObject({ serverId: snowflake, globalFreeAvailable: false, paidRemainingUsd: 0, assignedSubscriberCount: 2, resetsAt: "2027-01-01T00:00:00.000Z" })
    expect(fixture.calls[1]?.values).toEqual([snowflake, snowflake])
    expect(fixture.calls.every((call) => !/\b(?:INSERT|UPDATE|DELETE)\b/u.test(call.text))).toBe(true)
  })

  it("maps announcement timestamps and omits absent optional content", async () => {
    const date = new Date("2026-09-01T00:00:00Z")
    const fixture = sqlFixture([[{ id: "announcement", title: "Title", subtitle: "Subtitle", body: "", status: "draft", target: "all", banner_image_url: null, html_object_key: null, html_url: null, min_app_version: null, starts_at: date, ends_at: null, created_at: date, updated_at: date }]])
    const result = await Effect.runPromise(Effect.gen(function* () { return yield* (yield* DashboardMiscReads).announcements("draft") }).pipe(
      Effect.provide(DashboardMiscReads.layer), Effect.provideService(SqlClient.SqlClient, fixture.sql),
    ))
    expect(result).toEqual([{ id: "announcement", title: "Title", subtitle: "Subtitle", status: "draft", target: "all", starts_at: date.toISOString(), created_at: date.toISOString(), updated_at: date.toISOString() }])
    expect(fixture.calls[0]?.values).toEqual(["draft", "draft"])
    expect(fixture.calls[0]?.text).toContain("LIMIT 100")
  })

  it("fails with a typed database error instead of swallowing a failed read", async () => {
    const sql = (() => Effect.fail(new Error("fixture database unavailable"))) as unknown as SqlClient.SqlClient
    await expect(Effect.runPromise(Effect.gen(function* () { return yield* (yield* DashboardMiscReads).announcements("") }).pipe(
      Effect.provide(DashboardMiscReads.layer), Effect.provideService(SqlClient.SqlClient, sql),
    ))).rejects.toMatchObject({ _tag: "DatabaseFailure", cause: expect.any(Error) })
  })

  it("returns ordered linked accounts with nullable timestamps normalized", async () => {
    const fixture = sqlFixture([[{ user_id: snowflake, tag: "#2PP", order_index: 0, is_verified: true, hidden: false, added_at: new Date("2026-09-01T00:00:00Z"), verified_at: null, last_login: null }]])
    const result = await Effect.runPromise(Effect.gen(function* () { return yield* (yield* DashboardPersonalLinks).list(snowflake) }).pipe(
      Effect.provide(DashboardPersonalLinks.layer), Effect.provideService(SqlClient.SqlClient, fixture.sql),
    ))
    expect(result).toEqual([{ user_id: snowflake, player_tag: "#2PP", order_index: 0, is_verified: true, hidden: false, added_at: "2026-09-01T00:00:00.000Z" }])
    expect(fixture.calls[0]?.text).toContain("ORDER BY order_index, added_at")
  })

  it("matches the safe feature flag time/platform and deterministic rollout rules", async () => {
    const flag = { enabled: true, rollout_percentage: 100, platforms: [" Web "], starts_at: null, ends_at: "2026-09-01T00:00:00Z" }
    await expect(Effect.runPromise(resolveCheckoutFlag(flag, snowflake, new Date("2026-09-01T00:00:00Z")))).resolves.toBe(false)
    await expect(Effect.runPromise(resolveCheckoutFlag({ ...flag, ends_at: null }, snowflake, new Date()))).resolves.toBe(true)
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`subscription_support:${snowflake}`))
    const bucket = Number(new DataView(digest).getBigUint64(0, false) % 100n)
    await expect(Effect.runPromise(resolveCheckoutFlag({ ...flag, ends_at: null, rollout_percentage: bucket + 1 }, snowflake, new Date()))).resolves.toBe(true)
    await expect(Effect.runPromise(resolveCheckoutFlag({ ...flag, ends_at: null, rollout_percentage: bucket }, snowflake, new Date()))).resolves.toBe(false)
  })
})
