import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DiscordApi } from "./discord-api.js"
import { discordBotProfile } from "./discord-bot-profile.js"
import type { WorkerBindings } from "./environment.js"
import { RateLimited } from "./errors.js"

const serverId = "987654321098765432"
const botId = "123456789012345678"
const now = Date.UTC(2026, 8, 4, 12)
const application = {
  name: "ClashKing", description: "Global bot description",
  bot: { id: botId, username: "ClashKing", global_name: "ClashKing Global", avatar: "global-avatar", banner: "global-banner" },
}
const member = { nick: "ClashKing Beta", avatar: "guild-avatar", user: { id: botId }, bio: "Family bot" }
const completeMember = { ...member, banner: "guild-banner" }

function cacheBindings() {
  const values = new Map<string, unknown>()
  const get = vi.fn(async (key: string | string[]): Promise<unknown> => {
    if (typeof key !== "string") throw new Error("Unexpected bulk cache read")
    return values.get(key) ?? null
  })
  const put = vi.fn(async (key: string, value: Parameters<WorkerBindings["API_CACHE"]["put"]>[1], _options?: KVNamespacePutOptions) => {
    if (typeof value !== "string") throw new Error("Expected JSON cache value")
    values.set(key, JSON.parse(value))
  })
  const bindings = {
    API_CACHE: { get, put } as Pick<WorkerBindings["API_CACHE"], "get" | "put">, DISCORD_CLIENT_ID: botId,
    DISCORD_API_ORIGIN: "https://discord.com/api/v10", DISCORD_BOT_TOKEN: "must-not-appear-in-cache",
  }
  return { values, get, put, bindings }
}

const run = (
  bindings: Parameters<typeof discordBotProfile>[0],
  request: DiscordApi["Service"]["request"],
  payload: Readonly<Record<string, unknown>> = {},
  guildId = serverId,
) => Effect.runPromise(discordBotProfile(bindings, guildId, payload).pipe(Effect.provideService(DiscordApi, {
  request, token: () => Effect.die("Profile requests must not exchange OAuth tokens"),
})))

afterEach(() => vi.restoreAllMocks())

describe("Discord bot profile cache and Go response parity", () => {
  it("uses empty current-member PATCH, preserves guild fields, and inherits global banner", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now)
    const cache = cacheBindings()
    const request = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(
      path === "/oauth2/applications/@me" ? application : member,
    ))
    expect(await run(cache.bindings, request)).toEqual({
      name: "ClashKing Beta", bio: "Family bot",
      avatar_url: `https://cdn.discordapp.com/guilds/${serverId}/users/${botId}/avatars/guild-avatar.png?size=512`,
      banner_url: `https://cdn.discordapp.com/banners/${botId}/global-banner.png?size=1024`,
      name_inherited: false, avatar_inherited: false, banner_inherited: true, bio_inherited: false,
    })
    expect(request.mock.calls).toEqual([
      [`/guilds/${serverId}/members/@me`, { method: "PATCH", body: {} }],
      ["/oauth2/applications/@me"],
    ])
    expect(cache.put).toHaveBeenCalledWith(expect.stringContaining(`:${botId}`), JSON.stringify({
      observedAt: now, profile: application,
    }), { expirationTtl: 900 })
    expect(cache.put.mock.calls[0]?.[0]).not.toContain(cache.bindings.DISCORD_BOT_TOKEN)
  })

  it("shares the global fallback across guilds but keeps every editable guild read live", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now)
    const cache = cacheBindings()
    const request = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(
      path === "/oauth2/applications/@me" ? application : member,
    ))
    await run(cache.bindings, request)
    await run(cache.bindings, request)
    await run(cache.bindings, request, {}, "111111111111111111")
    expect(request.mock.calls.filter(([path]) => path === "/oauth2/applications/@me")).toHaveLength(1)
    expect(request.mock.calls.filter(([path]) => path.endsWith("/members/@me"))).toHaveLength(3)
    expect(cache.put).toHaveBeenCalledOnce()
    expect(cache.values.size).toBe(1)
  })

  it("does not need global fallback or cache when all guild profile fields are present", async () => {
    const cache = cacheBindings()
    const request = vi.fn<DiscordApi["Service"]["request"]>((path) => path.endsWith("/members/@me")
      ? Effect.succeed(completeMember) : Effect.die("Complete guild profile must not require global lookup"))
    const profile = await run(cache.bindings, request)
    expect(profile).toMatchObject({
      name: "ClashKing Beta", bio: "Family bot", name_inherited: false,
      avatar_inherited: false, banner_inherited: false, bio_inherited: false,
      banner_url: `https://cdn.discordapp.com/guilds/${serverId}/users/${botId}/banners/guild-banner.png?size=1024`,
    })
    expect(request).toHaveBeenCalledOnce()
    expect(cache.get).not.toHaveBeenCalled()
    expect(cache.put).not.toHaveBeenCalled()
  })

  it("returns edits directly and subsequent reads cannot get an old guild profile from KV", async () => {
    const cache = cacheBindings()
    let current = { ...completeMember }
    const request = vi.fn<DiscordApi["Service"]["request"]>((path, options) => {
      if (!path.endsWith("/members/@me")) return Effect.die("Unexpected global lookup")
      const body = options?.body
      if (typeof body === "object" && body !== null && "nick" in body && typeof body.nick === "string") {
        current = { ...current, nick: body.nick }
      }
      return Effect.succeed(current)
    })
    expect(await run(cache.bindings, request)).toMatchObject({ name: "ClashKing Beta" })
    expect(await run(cache.bindings, request, { nick: "Saved profile" })).toMatchObject({ name: "Saved profile" })
    expect(await run(cache.bindings, request)).toMatchObject({ name: "Saved profile" })
    expect(request.mock.calls.map(([, options]) => options)).toEqual([
      { method: "PATCH", body: {} }, { method: "PATCH", body: { nick: "Saved profile" } }, { method: "PATCH", body: {} },
    ])
    expect(cache.get).not.toHaveBeenCalled()
    expect(cache.put).not.toHaveBeenCalled()
  })

  it("clears guild overrides without inheriting an old guild profile", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now)
    const cache = cacheBindings()
    cache.get.mockResolvedValue({ observedAt: now, profile: application })
    const request = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.succeed({
      nick: null, bio: null, avatar: null, banner: null, user: { id: botId },
    }))
    expect(await run(cache.bindings, request, { nick: null, bio: null, avatar: null, banner: null })).toEqual({
      name: "ClashKing Global", bio: "Global bot description",
      avatar_url: `https://cdn.discordapp.com/avatars/${botId}/global-avatar.png?size=512`,
      banner_url: `https://cdn.discordapp.com/banners/${botId}/global-banner.png?size=1024`,
      name_inherited: true, bio_inherited: true, avatar_inherited: true, banner_inherited: true,
    })
    expect(request).toHaveBeenCalledOnce()
  })

  it.each([
    ["username", { ...application, bot: { ...application.bot, global_name: "   ", username: "Bot username" } }, "Bot username"],
    ["application name", { ...application, bot: { ...application.bot, global_name: "", username: "" } }, "ClashKing"],
  ])("uses the legacy %s fallback when the global display name is blank", async (_label, global, name) => {
    const cache = cacheBindings()
    const request: DiscordApi["Service"]["request"] = (path) => Effect.succeed(
      path === "/oauth2/applications/@me" ? global : { ...completeMember, nick: " ", bio: "\n" },
    )
    expect(await run(cache.bindings, request)).toMatchObject({
      name, name_inherited: true, bio: "Global bot description", bio_inherited: true,
    })
  })

  it("preserves Go's null-versus-present inheritance flags even for empty image hashes", async () => {
    const cache = cacheBindings()
    const request = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.succeed({
      ...completeMember, avatar: "", banner: "",
    }))
    expect(await run(cache.bindings, request)).toMatchObject({
      avatar_inherited: false, banner_inherited: false,
      avatar_url: `https://cdn.discordapp.com/guilds/${serverId}/users/${botId}/avatars/.png?size=512`,
      banner_url: `https://cdn.discordapp.com/guilds/${serverId}/users/${botId}/banners/.png?size=1024`,
    })
    expect(request).toHaveBeenCalledOnce()
  })

  it.each([
    ["missing", null],
    ["malformed", { invalid: true }],
    ["expired", { observedAt: now - 900_000, profile: application }],
    ["future", { observedAt: now + 1, profile: application }],
    ["fractional timestamp", { observedAt: now - 0.5, profile: application }],
    ["invalid profile", { observedAt: now, profile: { ...application, bot: { id: 123 } } }],
  ])("falls back to Discord for a %s cache entry", async (_label, cached) => {
    vi.spyOn(Date, "now").mockReturnValue(now)
    const cache = cacheBindings()
    cache.get.mockResolvedValue(cached)
    const request = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(
      path === "/oauth2/applications/@me" ? application : member,
    ))
    expect(await run(cache.bindings, request)).toMatchObject({ name: "ClashKing Beta" })
    expect(request).toHaveBeenCalledTimes(2)
    expect(cache.put).toHaveBeenCalledOnce()
  })

  it("expires cached global profiles at fifteen minutes without depending on KV eviction", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(now)
    const cache = cacheBindings()
    let global = application
    const request = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(
      path === "/oauth2/applications/@me" ? global : { ...member, bio: null },
    ))
    expect(await run(cache.bindings, request)).toMatchObject({ bio: "Global bot description" })
    global = { ...application, description: "Updated global description" }
    clock.mockReturnValue(now + 899_999)
    expect(await run(cache.bindings, request)).toMatchObject({ bio: "Global bot description" })
    clock.mockReturnValue(now + 900_000)
    expect(await run(cache.bindings, request)).toMatchObject({ bio: "Updated global description" })
    expect(request.mock.calls.filter(([path]) => path === "/oauth2/applications/@me")).toHaveLength(2)
  })

  it("does not fail a valid profile response when cache reads and writes fail", async () => {
    const cache = cacheBindings()
    cache.get.mockRejectedValue(new Error("KV unavailable"))
    cache.put.mockRejectedValue(new Error("KV unavailable"))
    const request: DiscordApi["Service"]["request"] = (path) => Effect.succeed(
      path === "/oauth2/applications/@me" ? application : member,
    )
    expect(await run(cache.bindings, request)).toMatchObject({ name: "ClashKing Beta" })
    expect(cache.get).toHaveBeenCalledOnce()
    expect(cache.put).toHaveBeenCalledOnce()
  })

  it.each(["read", "write"])("does not stall a valid profile when a cache %s never settles", async (operation) => {
    const cache = cacheBindings()
    if (operation === "read") cache.get.mockImplementation(() => new Promise(() => {}))
    else cache.put.mockImplementation(() => new Promise(() => {}))
    const request = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(
      path === "/oauth2/applications/@me" ? application : member,
    ))
    expect(await run(cache.bindings, request)).toMatchObject({ name: "ClashKing Beta" })
    expect(request).toHaveBeenCalledTimes(2)
    expect(cache.get).toHaveBeenCalledOnce()
    expect(cache.put).toHaveBeenCalledOnce()
  }, 2_000)

  it.each(["member", "global"])("preserves %s upstream failures and never caches them", async (failureAt) => {
    const cache = cacheBindings()
    const request: DiscordApi["Service"]["request"] = (path) => failureAt === "member" || path === "/oauth2/applications/@me"
      ? Effect.fail(new RateLimited({ message: "limited", retryAfterSeconds: 2 })) : Effect.succeed(member)
    await expect(run(cache.bindings, request)).rejects.toMatchObject({ _tag: "RateLimited", retryAfterSeconds: 2 })
    expect(cache.put).not.toHaveBeenCalled()
  })

  it("rejects an invalid live global response instead of caching it", async () => {
    const cache = cacheBindings()
    const request: DiscordApi["Service"]["request"] = (path) => Effect.succeed(
      path === "/oauth2/applications/@me" ? { ...application, bot: { id: 123 } } : member,
    )
    await expect(run(cache.bindings, request)).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(cache.put).not.toHaveBeenCalled()
  })

  it("ignores a well-formed cached profile belonging to another bot and refetches it", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now)
    const cache = cacheBindings()
    cache.get.mockResolvedValue({ observedAt: now, profile: {
      ...application, bot: { ...application.bot, id: "222222222222222222", global_name: "Wrong bot", avatar: "wrong-avatar" },
    } })
    const request = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(
      path === "/oauth2/applications/@me" ? application : { ...member, nick: null, avatar: null },
    ))
    expect(await run(cache.bindings, request)).toMatchObject({
      name: "ClashKing Global",
      avatar_url: `https://cdn.discordapp.com/avatars/${botId}/global-avatar.png?size=512`,
    })
    expect(request).toHaveBeenCalledWith("/oauth2/applications/@me")
    expect(cache.put).toHaveBeenCalledOnce()
  })

  it("rejects mismatched live application identity rather than returning or caching a mixed profile", async () => {
    const cache = cacheBindings()
    const request: DiscordApi["Service"]["request"] = (path) => Effect.succeed(
      path === "/oauth2/applications/@me"
        ? { ...application, bot: { ...application.bot, id: "222222222222222222" } } : member,
    )
    await expect(run(cache.bindings, request)).rejects.toMatchObject({
      _tag: "UpstreamUnavailable", message: "Discord bot profile identity mismatch",
    })
    expect(cache.put).not.toHaveBeenCalled()
  })

  it("isolates a changed live bot identity even when the configured OAuth application is unchanged", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now)
    const cache = cacheBindings()
    let currentBotId = botId
    const request = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(
      path === "/oauth2/applications/@me"
        ? { ...application, bot: { ...application.bot, id: currentBotId } }
        : { ...member, user: { id: currentBotId } },
    ))
    await run(cache.bindings, request)
    currentBotId = "222222222222222222"
    expect(await run(cache.bindings, request)).toMatchObject({
      banner_url: `https://cdn.discordapp.com/banners/${currentBotId}/global-banner.png?size=1024`,
    })
    expect(cache.values.size).toBe(2)
    expect(cache.put.mock.calls.map(([key]) => key.split(":").at(-1))).toEqual([botId, currentBotId])
    expect(request.mock.calls.filter(([path]) => path === "/oauth2/applications/@me")).toHaveLength(2)
  })

  it("isolates global cache keys by application and upstream origin", async () => {
    const cache = cacheBindings()
    const request = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(
      path === "/oauth2/applications/@me" ? application : member,
    ))
    await run(cache.bindings, request)
    await run({ ...cache.bindings, DISCORD_CLIENT_ID: "222222222222222222" }, request)
    await run({ ...cache.bindings, DISCORD_API_ORIGIN: "https://discord-test.internal/api/v10" }, request)
    expect(cache.values.size).toBe(3)
    expect(request.mock.calls.filter(([path]) => path === "/oauth2/applications/@me")).toHaveLength(3)
  })
})
