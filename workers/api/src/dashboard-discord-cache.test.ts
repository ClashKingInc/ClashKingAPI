import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dashboardDiscordParentMaxAgeMs, dashboardThreadParentNames, readDashboardThreadParentNames } from "./dashboard-discord-cache.js"
import type { WorkerBindings } from "./environment.js"

const guildId = "1234567890123456789"
const id = "2234567890123456789"
const anotherId = "3234567890123456789"
const now = Date.parse("2026-09-04T14:00:00.000Z")
const item = () => ({ id, guild_id: guildId, updated_at: new Date(now - 1_000), data: { id, name: "general", type: 0 } })
const fixture = (result: Effect.Effect<ReadonlyArray<unknown>, unknown> = Effect.succeed([item()])) => {
  const query = vi.fn(() => result)
  const sql = { unsafe: query } as unknown as SqlClient.SqlClient
  return { query, layer: Layer.succeed(SqlClient.SqlClient, sql) }
}
const read = (f: ReturnType<typeof fixture>, parents = [id]) => Effect.runPromise(
  readDashboardThreadParentNames(guildId, parents).pipe(Effect.provide(f.layer)),
)

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(now) })
afterEach(() => { vi.restoreAllMocks() })

describe("Dashboard live-thread parent-name cache", () => {
  it("reuses a freshly observed live fallback even when unchanged Gateway rows are old", async () => {
    const stored = new Map<string, unknown>()
    const get = vi.fn(async (key: string) => stored.get(key) ?? null)
    const put = vi.fn(async (key: string, value: string) => { stored.set(key, JSON.parse(value)) })
    const bindings = { DISCORD_CLIENT_ID: "bot-one", API_CACHE: { get, put } } as unknown as WorkerBindings
    const f = fixture(Effect.succeed([{ ...item(), updated_at: new Date(now - 86400_000) }]))
    const live = vi.fn(() => Effect.succeed(new Map([[id, "general"]])))
    const names = () => Effect.runPromise(dashboardThreadParentNames(bindings, guildId, [id], live).pipe(Effect.provide(f.layer)))
    expect(await names()).toEqual(new Map([[id, "general"]]))
    expect(await names()).toEqual(new Map([[id, "general"]]))
    expect(f.query).toHaveBeenCalledTimes(1)
    expect(live).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith(`dashboard:thread-parent-names:v1:bot-one:${guildId}`, expect.any(String), { expirationTtl: 60 })
    vi.spyOn(Date, "now").mockReturnValue(now + 60_000)
    await names()
    expect(live).toHaveBeenCalledTimes(2)
  })

  it("does not reuse display snapshots from another configured bot", async () => {
    const get = vi.fn(async (_key: string) => null)
    const f = fixture()
    for (const bot of ["bot-one", "bot-two"]) {
      const bindings = { DISCORD_CLIENT_ID: bot, API_CACHE: { get } } as unknown as WorkerBindings
      await Effect.runPromise(dashboardThreadParentNames(bindings, guildId, [id], () => Effect.die("unexpected live call"))
        .pipe(Effect.provide(f.layer)))
    }
    expect(get.mock.calls.map(([key]) => key)).toEqual([
      `dashboard:thread-parent-names:v1:bot-one:${guildId}`, `dashboard:thread-parent-names:v1:bot-two:${guildId}`,
    ])
  })

  it("looks up only the requested parent IDs within the selected guild", async () => {
    const f = fixture()
    expect(await read(f)).toEqual(new Map([[id, "general"]]))
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining("FROM discord_cache.channels"), [guildId, [id]])
    expect(f.query).toHaveBeenCalledWith(expect.stringContaining("id = ANY($2::text[]) LIMIT 2001"), [guildId, [id]])
  })

  it("deduplicates known parents and skips SQL entirely when none are requested", async () => {
    const f = fixture()
    expect(await read(f, [id, id])).toEqual(new Map([[id, "general"]]))
    expect(f.query).toHaveBeenCalledWith(expect.any(String), [guildId, [id]])
    f.query.mockClear()
    expect(await read(f, [])).toEqual(new Map())
    expect(f.query).not.toHaveBeenCalled()
  })

  it.each([
    { rows: [] },
    { rows: [item(), item()] },
    { rows: [{ ...item(), id: anotherId }] },
  ])("does not treat missing, duplicate or unexpected rows as a complete answer %#", async ({ rows }) => {
    expect(await read(fixture(Effect.succeed(rows)))).toBeUndefined()
  })

  it("falls back for the whole name lookup when even one requested parent is missing", async () => {
    expect(await read(fixture(), [id, anotherId])).toBeUndefined()
  })

  it.each([now + 1, now - dashboardDiscordParentMaxAgeMs, NaN])("rejects future, expired or invalid row time %s", async (time) => {
    expect(await read(fixture(Effect.succeed([{ ...item(), updated_at: new Date(time) }])))).toBeUndefined()
  })

  it.each([
    { ...item(), guild_id: anotherId },
    { ...item(), updated_at: "invalid" },
    { ...item(), data: { ...item().data, id: anotherId } },
    { ...item(), data: { ...item().data, guild_id: anotherId } },
    { ...item(), data: { ...item().data, id: 123 } },
    { ...item(), data: { id } },
  ])("rejects foreign or malformed cache entries %#", async (value) => {
    expect(await read(fixture(Effect.succeed([value])))).toBeUndefined()
  })

  it("accepts the SQL driver's ISO timestamp representation", async () => {
    expect(await read(fixture(Effect.succeed([{ ...item(), updated_at: new Date(now).toISOString() }]))))
      .toEqual(new Map([[id, "general"]]))
  })

  it("bounds oversized and malformed input before querying", async () => {
    const f = fixture()
    expect(await read(f, Array.from({ length: 2001 }, (_, index) => String(BigInt(id) + BigInt(index))))).toBeUndefined()
    expect(await read(f, ["not-a-discord-id"])).toBeUndefined()
    expect(f.query).not.toHaveBeenCalled()
  })

  it("falls back on SQL failures and driver defects", async () => {
    expect(await read(fixture(Effect.fail(new Error("cache schema unavailable"))))).toBeUndefined()
    expect(await read(fixture(Effect.die(new Error("invalid cache driver value"))))).toBeUndefined()
  })

  it("bounds an unresponsive cache read", async () => {
    expect(await read(fixture(Effect.never))).toBeUndefined()
  })

  it("does not swallow request cancellation", async () => {
    const f = fixture(Effect.interrupt)
    const exit = await Effect.runPromiseExit(readDashboardThreadParentNames(guildId, [id]).pipe(Effect.provide(f.layer)))
    expect(exit._tag).toBe("Failure")
  })
})
