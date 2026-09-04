import { Effect, Layer } from "effect"
import { describe, expect, it, vi } from "vitest"
import { publicMetadataEndpoints } from "@clashking/api-contracts"
import { GuildActivityStore, dispatchPublicMetadata, publicMetadataRuntimeRoutes, summarizeGuildActivity } from "./public-metadata-runtime.js"
import { InvalidRequest, NotFound } from "./errors.js"

const guildId = "123456789012345678"
const empty = summarizeGuildActivity(guildId, [], new Map(), 100)
const run = (path: string, store: Partial<GuildActivityStore["Service"]> = {}) => Effect.runPromise(
  dispatchPublicMetadata(new Request(`https://api.clashk.ing${path}`), { SENTRY_DSN_MOBILE: "public-dsn" })
    .pipe(Effect.provide(Layer.mock(GuildActivityStore, store))),
)

describe("public metadata runtime", () => {
  it("matches all canonical descriptors and leaves aliases unmatched", async () => {
    expect(publicMetadataRuntimeRoutes.map(({ path }) => path).sort())
      .toEqual(Object.values(publicMetadataEndpoints).map(({ path }) => path).sort())
    expect(await run("/v2/public")).toBeUndefined()
    expect(await run("/v2/guild-summary")).toBeUndefined()
  })

  it("returns distinct configuration fields without leaking other environment values", async () => {
    expect(await (await run("/v2/config/public"))?.json()).toEqual({ sentry_dsn_mobile: "public-dsn" })
    expect(await (await run("/v2/public-config"))?.json()).toEqual({ sentry_dsn: "public-dsn" })
  })

  it("returns catalog-specific counts without requiring storage", async () => {
    for (const [path, count] of [["role-types", 9], ["role-modes", 3], ["log-types", 26], ["countdown-types", 7]] as const) {
      const body = await (await run(`/v2/enums/${path}`))?.json()
      expect(body).toMatchObject({ count, values: expect.any(Array) })
    }
  })

  it("preserves threshold fallback and the exact snowflake through the dispatcher", async () => {
    const summarize = vi.fn(() => Effect.succeed(empty))
    const response = await run(`/v2/activity/guild-summary?guild_id=${guildId}&inactive_threshold_days=invalid`, { summarize })
    expect(summarize).toHaveBeenCalledWith(guildId, 7)
    expect(await response?.json()).toEqual(empty)
  })

  it("rejects malformed guild IDs before querying and preserves missing-server errors", async () => {
    for (const query of ["", "?guild_id=0", "?guild_id=abc"]) {
      await expect(run(`/v2/activity/guild-summary${query}`)).rejects.toBeInstanceOf(InvalidRequest)
    }
    await expect(run(`/v2/activity/guild-summary?guild_id=${guildId}`, {
      summarize: () => Effect.fail(new NotFound({ message: "Server not found" })),
    })).rejects.toBeInstanceOf(NotFound)
  })

  it("computes weighted totals, strict cutoff, missing activity, and empty clans", () => {
    const result = summarizeGuildActivity(guildId, [
      { tag: "#P0Y", name: "One", members: [
        { tag: "#A", trophies: 100, donations: 10, donationsReceived: 4 },
        { tag: "#B", trophies: 200, donations: 20, donationsReceived: 6 },
      ] },
      { tag: "#P0Q", name: "Two", members: [{ tag: "#C", trophies: 300 }] },
      { tag: "#P0G", name: "Empty", members: [] },
    ], new Map([["#A", 101], ["#B", 100]]), 100)
    expect(result).toMatchObject({
      guild_id: guildId, total_clans: 3, total_members: 3, total_active_members: 1,
      total_inactive_members: 2, overall_activity_rate: expect.closeTo(100 / 3),
      total_donations_sent: 30, total_donations_received: 10,
    })
    expect(result.clans[0]).toMatchObject({ activity_rate: 50, average_trophies: 150, average_donations_sent: 15 })
    expect(result.clans[2]).toMatchObject({ activity_rate: 0, average_trophies: 0, total_members: 0 })
    expect(empty.clans).toEqual([])
    expect(empty.overall_activity_rate).toBe(0)
  })
})
