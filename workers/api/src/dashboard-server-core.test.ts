import { dashboardEndpoints, type AnyEndpoint } from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { executeDashboardServerCore, dashboardServerCoreOperationIds } from "./dashboard-server-core.js"
import { DashboardServerOperations, dispatchDashboardServer, type DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { AuthIdentity } from "./auth.js"
import { DiscordApi } from "./discord-api.js"
import { DiscordCredentials } from "./discord-credentials.js"
import { DatabaseFailure, RateLimited } from "./errors.js"
import { ServerAuthorization } from "./server-authorization.js"
import type { WorkerBindings } from "./environment.js"

const serverId = "1234567890123456789"
const channelId = "9876543210987654321"
const principal = { kind: "user" as const, userId: "1111111111111111111" }
const bindings = { DISCORD_BOT_TOKEN: "test-token", DISCORD_CLIENT_ID: "999" } as WorkerBindings
const input = (endpoint: AnyEndpoint, overrides: Partial<DashboardServerOperationInput> = {}): DashboardServerOperationInput => ({
  bindings, endpoint, path: { serverId }, body: {}, query: {}, principal,
  request: new Request(`https://api.clashk.ing/v2/server/${serverId}/settings`), ...overrides,
})

type Row = Readonly<Record<string, unknown>>
function dependencies(options: {
  readonly discord?: DiscordApi["Service"]["request"]
  readonly query?: (query: string, params: ReadonlyArray<unknown>) => Effect.Effect<ReadonlyArray<Row>, unknown>
} = {}) {
  const query = options.query ?? (() => Effect.die("Unexpected SQL"))
  const sql = Object.assign((parts: TemplateStringsArray, ...params: ReadonlyArray<unknown>) => query(parts.join("?"), params), {
    unsafe: query,
    withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  }) as SqlClient.SqlClient
  return Layer.mergeAll(
    Layer.succeed(SqlClient.SqlClient, sql),
    Layer.succeed(DiscordApi, { request: options.discord ?? (() => Effect.die("Unexpected Discord request")), token: () => Effect.die("Unexpected OAuth grant") }),
    Layer.succeed(DiscordCredentials, { accessToken: () => Effect.succeed("oauth-token") }),
    Layer.succeed(ServerAuthorization, { require: () => Effect.succeed({ principal, manager: true, sections: {} }), resolve: () => Effect.succeed({ principal, manager: true, sections: {} }) }),
    Layer.succeed(AuthIdentity, { requireUser: () => Effect.succeed(principal), requireUserOrBot: () => Effect.succeed(principal), requireBot: () => Effect.succeed({ kind: "bot" as const }) }),
  )
}
const run = (value: DashboardServerOperationInput, options: Parameters<typeof dependencies>[0] = {}) => Effect.runPromise(executeDashboardServerCore(value).pipe(Effect.provide(dependencies(options))))

describe("Dashboard server real operations", () => {
  it("returns a normal empty clan list for an existing server without clans", async () => {
    const query = vi.fn((statement: string) => Effect.succeed(statement.includes("SELECT id FROM servers") ? [{ id: serverId }] : []))
    expect(await run(input(dashboardEndpoints.serverClans), { query })).toEqual([])
    expect(query).toHaveBeenCalledTimes(2)
  })
  it("lists only bot-present cached guilds without probing or creating server rows", async () => {
    const guilds = Array.from({ length: 3 }, (_, index) => ({ id: String(1000 + index), name: `Guild ${index}`, owner: true, permissions: "8", features: [] }))
    const discord = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(path.startsWith("/users/@me/guilds") ? guilds : {}))
    const query = vi.fn((statement: string, _params: ReadonlyArray<unknown>) => Effect.succeed(statement.includes("gateway_shards")
      ? ["1000", "1002"].map((id) => ({ guild_id: id, guild_data: { owner_id: "999" }, members_complete: true, member_roles: [], role_permissions: [] }))
      : statement.includes("FROM discord_cache.guilds")
        ? [{ id: "1000", last_command_at: null }, { id: "1002", last_command_at: new Date() }]
        : []))
    const result = Schema.decodeUnknownSync(dashboardEndpoints.dashboardGuilds.response)(
      await run(input(dashboardEndpoints.dashboardGuilds, { path: {} }), { discord, query }),
    )
    expect(result.map(({ id, has_bot, inactive }) => ({ id, has_bot, inactive }))).toEqual([
      { id: "1000", has_bot: true, inactive: true },
      { id: "1002", has_bot: true, inactive: false },
    ])
    expect(discord.mock.calls.filter(([path]) => path.startsWith("/users/@me/guilds"))).toHaveLength(1)
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0]?.[0]).toContain("FROM discord_cache.guilds")
    expect(query.mock.calls[1]?.[0]).toContain("gateway_shards")
    expect(query.mock.calls.some(([statement]) => statement.includes("INSERT INTO servers"))).toBe(false)
    expect(discord).toHaveBeenCalledTimes(1)
  })

  it("only marks an installed guild inactive when it has command history older than 90 days", async () => {
    const guilds = [
      { id: "1000", name: "Old", owner: true, permissions: "8", features: [] },
      { id: "1001", name: "New", owner: true, permissions: "8", features: [] },
    ]
    const discord = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(path.startsWith("/users/@me/guilds") ? guilds : {}))
    const query = vi.fn((statement: string, _params: ReadonlyArray<unknown>) => Effect.succeed(statement.includes("gateway_shards")
      ? ["1000", "1001"].map((id) => ({ guild_id: id, guild_data: { owner_id: "999" }, members_complete: true, member_roles: [], role_permissions: [] }))
      : statement.includes("FROM discord_cache.guilds") ? [
        { id: "1000", last_command_at: new Date(Date.now() - 91 * 86_400_000) },
        { id: "1001", last_command_at: null },
      ] : []))
    const result = Schema.decodeUnknownSync(dashboardEndpoints.dashboardGuilds.response)(
      await run(input(dashboardEndpoints.dashboardGuilds, { path: {} }), { discord, query }),
    )
    expect(result.map(({ id, inactive, last_command_at }) => ({ id, inactive, last_command_at }))).toEqual([
      { id: "1000", inactive: true, last_command_at: expect.any(String) },
      { id: "1001", inactive: true, last_command_at: undefined },
    ])
  })

  it("creates or reactivates only a bot-present cached guild without a Discord REST call", async () => {
    const query = vi.fn(() => Effect.succeed([{ id: serverId }]))
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.die("Unexpected Discord request"))
    await expect(run(input(dashboardEndpoints.reactivateServer), { query, discord })).resolves.toEqual({ message: "Server tracking re-enabled" })
    expect(discord).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledWith(expect.stringContaining("JOIN discord_cache.gateway_shards"), [serverId, bindings.DISCORD_CLIENT_ID, 45])
    expect(query).toHaveBeenCalledWith(expect.stringContaining("left_at = NULL"), [serverId, bindings.DISCORD_CLIENT_ID, 45])
    expect(query).toHaveBeenCalledWith(expect.stringContaining("pg_notify"), ["clashking_tracking_wake_v1",
      JSON.stringify({ v: 1, kind: "guild_reactivated", serverId })])
  })

  it("rejects activation when the bot cache has no matching guild", async () => {
    const query = vi.fn(() => Effect.succeed([]))
    await expect(run(input(dashboardEndpoints.reactivateServer), { query })).rejects.toMatchObject({
      _tag: "UpstreamUnavailable", message: "Discord authorization cache is temporarily unavailable",
    })
  })

  it("returns detailed guild fields from healthy current Gateway metadata", async () => {
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.die("Unexpected Discord request"))
    const query = vi.fn(() => Effect.succeed([{ data: { id: serverId, name: "Family", owner_id: "111", icon: "a_icon", banner: "banner", description: "Details", features: [], premium_tier: 2, premium_subscription_count: 8, approximate_member_count: 25 } }]))
    expect(await run(input(dashboardEndpoints.dashboardGuild, { path: { guildId: serverId } }), { discord, query })).toEqual({
      id: serverId, name: "Family", owner_id: "111", icon: `https://cdn.discordapp.com/icons/${serverId}/a_icon.gif`,
      banner: `https://cdn.discordapp.com/banners/${serverId}/banner.png`, description: "Details", features: [], premium_tier: 2, boost_count: 8, member_count: 25,
    })
    expect(discord).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("gateway_shards"), [serverId, bindings.DISCORD_CLIENT_ID, 45])
  })
  it("implements the same 86 operations advertised by the dispatcher", () => {
    expect(dashboardServerCoreOperationIds).toHaveLength(86)
    expect(new Set(dashboardServerCoreOperationIds).size).toBe(86)
  })

  it("executes the live service layer and validates channel output without numeric snowflake coercion", async () => {
    const query = vi.fn(() => Effect.succeed([{items:[
      { id: channelId, name: "general", type: 0, parent_id: "2222222222222222222" },
      { id: "2222222222222222222", name: "Family", type: 4 },
      { id: "3333333333333333333", name: "voice", type: 2 },
    ]}]))
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.die("Unexpected Discord HTTP"))
    const layer = DashboardServerOperations.layer.pipe(Layer.provideMerge(dependencies({ query, discord })))
    const response = await Effect.runPromise(dispatchDashboardServer(new Request(`https://api.clashk.ing/v2/server/${serverId}/channels`), bindings).pipe(Effect.provide(layer)))
    expect(await response?.json()).toEqual([
      { id: "2222222222222222222", name: "Family", type: "category" },
      { id: channelId, name: "general", type: "text", parent_id: "2222222222222222222", parent_name: "Family" },
    ])
    expect(discord).not.toHaveBeenCalled()
  })

  it("rejects numeric Discord IDs returned by Discord instead of silently rounding", async () => {
    await expect(run(input(dashboardEndpoints.serverChannels), { query: () => Effect.succeed([{items:[{ id: 123, name: "general", type: 0 }]}]) })).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })

  it("loads whole channel lists from the complete Gateway snapshot", async () => {
    const query = vi.fn(() => Effect.succeed([{items:[{ id: channelId, name: "cached-general", type: 0 }]}]))
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.die("Unexpected Discord HTTP"))
    expect(await run(input(dashboardEndpoints.serverChannels), { query, discord })).toEqual([
      { id: channelId, name: "cached-general", type: "text" },
    ])
    expect(discord).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("guild.metadata_complete"), [serverId, bindings.DISCORD_CLIENT_ID, 45])
  })

  it("loads whole role lists from the complete snapshot and filters managed/everyone roles", async () => {
    const role = { id: channelId, name: "Member", color: 0, position: 2, managed: false, mentionable: true }
    const roles = [role, { ...role, id: serverId }, { ...role, id: "3333333333333333333", managed: true }]
    const query = vi.fn(() => Effect.succeed([{items:roles}]))
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.die("Unexpected Discord HTTP"))
    expect(await run(input(dashboardEndpoints.discordRoles), { query, discord })).toEqual({ server_id: serverId, roles: [role], count: 1 })
    expect(discord).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledOnce()
  })

  it("uses recent parent names only after live Discord supplies the active threads", async () => {
    const query = vi.fn(() => Effect.succeed([{
      id: channelId, guild_id: serverId, updated_at: new Date(), data: { id: channelId, name: "cached-parent" },
    }]))
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.succeed({ threads: [
      { id: "3333333333333333333", name: "Thread", type: 11, parent_id: channelId, thread_metadata: { archived: false } },
    ] }))
    expect(await run(input(dashboardEndpoints.serverThreads), { query, discord })).toEqual([
      { id: "3333333333333333333", name: "Thread", parent_channel_id: channelId, parent_channel_name: "cached-parent", archived: false },
    ])
    expect(discord).toHaveBeenCalledExactlyOnceWith(`/guilds/${serverId}/threads/active`)
  })

  it.each(["missing", "stale", "outage"])("falls back to live channel names on a %s cache", async (state) => {
    const query = () => state === "outage" ? Effect.fail(new Error("cache unavailable")) : Effect.succeed(state === "missing" ? [] : [{
      id: channelId, guild_id: serverId, updated_at: new Date(0), data: { id: channelId, name: "stale-parent" },
    }])
    const discord = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(path.endsWith("/threads/active")
      ? { threads: [{ id: "3333333333333333333", name: "Thread", type: 11, parent_id: channelId }] }
      : [{ id: channelId, name: "live-parent", type: 0 }]))
    expect(await run(input(dashboardEndpoints.serverThreads), { query, discord })).toMatchObject([
      { parent_channel_name: "live-parent" },
    ])
    expect(discord).toHaveBeenCalledTimes(2)
    expect(discord).toHaveBeenLastCalledWith(`/guilds/${serverId}/channels`)
  })

  it("does not let a cache hit hide a failed live thread request", async () => {
    const query = vi.fn(() => Effect.die("Do not query cache before active-thread verification"))
    const discord = () => Effect.fail(new RateLimited({ message: "limited", retryAfterSeconds: 2 }))
    await expect(run(input(dashboardEndpoints.serverThreads), { query, discord })).rejects.toMatchObject({ _tag: "RateLimited" })
    expect(query).not.toHaveBeenCalled()
  })

  it("never uses display cache for role-grant mutation validation", async () => {
    const query = vi.fn(() => Effect.die("Cache must not be read before live validation"))
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.fail(new RateLimited({ message: "live verification required", retryAfterSeconds: 2 })))
    await expect(run(input(dashboardEndpoints.updateDashboardAccess, { body: { grants: [] } }), { query, discord })).rejects.toMatchObject({ _tag: "RateLimited" })
    expect(discord).toHaveBeenCalledWith(`/guilds/${serverId}/roles`)
    expect(query).not.toHaveBeenCalled()
  })

  it("keeps the Discord connection test live even when cached data exists", async () => {
    const query = vi.fn(() => Effect.die("A connection test cannot use the cache"))
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.succeed({ id: serverId, name: "Live server" }))
    expect(await run(input(dashboardEndpoints.serverDiscordTest), { query, discord })).toMatchObject({ status: "success", guild_name: "Live server" })
    expect(discord).toHaveBeenCalledWith(`/guilds/${serverId}`)
    expect(query).not.toHaveBeenCalled()
  })

  it("preserves upstream rate limiting rather than reporting a database failure", async () => {
    await expect(run(input(dashboardEndpoints.botGuildProfile), { discord: () => Effect.fail(new RateLimited({ message: "limited", retryAfterSeconds: 2 })) })).rejects.toMatchObject({ _tag: "RateLimited", retryAfterSeconds: 2 })
  })

  it("returns all server countdown kinds with only stored channels enabled", async () => {
    const query = vi.fn((statement: string, _params: ReadonlyArray<unknown>) => Effect.succeed(statement.includes("FROM servers") ? [{ id: serverId }] : [{ type: "cwl_timer", channel_id: channelId }]))
    const value = await run(input(dashboardEndpoints.serverCountdowns), { query })
    expect(value).toMatchObject({ server_id: serverId, countdowns: expect.arrayContaining([{ type: "cwl_timer", name: "Show the Clan War League time.", enabled: true, channel_id: channelId }, { type: "season_day_timer", name: "Show the current season day.", enabled: false }]) })
    expect(query.mock.calls.every(([, params]) => params[0] === serverId)).toBe(true)
  })

  it("does not fabricate an empty countdown configuration for a missing server", async () => {
    await expect(run(input(dashboardEndpoints.serverCountdowns), { query: () => Effect.succeed([]) })).rejects.toMatchObject({ _tag: "NotFound" })
  })

  it("reads normalized welcome panel tables and preserves channel IDs", async () => {
    const value = await run(input(dashboardEndpoints.serverPanel), { query: (statement) => Effect.succeed(statement.includes("FROM server_welcome_panels") ? [{ embed_name: "Welcome", button_color: "Green", welcome_channel_id: channelId }] : [{ button_name: "Rules" }]) })
    expect(value).toEqual({ embed_name: "Welcome", button_color: "Green", welcome_channel: channelId, buttons: ["Rules"] })
  })

  it("uses the Go category limit of 64 Unicode characters before writing", async () => {
    const query = vi.fn(() => Effect.succeed([]))
    await expect(run(input(dashboardEndpoints.createClanCategory, { body: { name: "界".repeat(65) } }), { query })).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(query).not.toHaveBeenCalled()
  })

  it("surfaces SQL failures and never responds with fabricated settings", async () => {
    await expect(run(input(dashboardEndpoints.serverSettings), { query: () => Effect.fail(new DatabaseFailure({ cause: "offline", message: "Database unavailable" })) })).rejects.toMatchObject({ _tag: "DatabaseFailure", message: "Database unavailable" })
  })

  it("resolves saved log channel IDs through Discord and does not expose missing channels", async () => {
    const value = await run(input(dashboardEndpoints.serverLogs), {
      discord: () => Effect.succeed([{ id: "5555555555555555555", channel_id: channelId }]),
      query: () => Effect.succeed([{ clan_tag: null, type: "reddit_feed", webhook_id: "5555555555555555555", thread_id: null, disabled: true, disabled_reason: "Destination was deleted" }]),
    })
    expect(value).toEqual({ count: 1, logs: [{ type: "reddit_feed", webhook_id: "5555555555555555555", channel_id: channelId, thread_id: null, disabled: true, disabled_reason: "Destination was deleted" }] })
  })

  it("does not overwrite an existing embed when creating a duplicate", async () => {
    const query = vi.fn((_statement: string, _params: ReadonlyArray<unknown>) => Effect.succeed([]))
    await expect(run(input(dashboardEndpoints.createServerEmbed, { body: { name: "Welcome", data: { content: "Hello" } } }), { query })).rejects.toMatchObject({ _tag: "Conflict" })
    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0]?.[0]).toContain("DO NOTHING")
  })

  it("uses the path name for embed replacement and preserves arbitrary JSON payload precision", async () => {
    const query = vi.fn((_statement: string, _params: ReadonlyArray<unknown>) => Effect.succeed([]))
    await expect(run(input(dashboardEndpoints.updateServerEmbed, { path: { serverId, embedName: "Path name" }, body: { name: "Body name", data: { application_id: channelId, content: "Hello" } } }), { query })).resolves.toEqual({ message: "Embed updated successfully" })
    expect(query.mock.calls[0]?.[1]).toEqual([serverId, "Path name", JSON.stringify({ application_id: channelId, content: "Hello" })])
  })

  it("creates a countdown only after locking the server and stores its canonical configuration", async () => {
    const query = vi.fn((statement: string, _params: ReadonlyArray<unknown>) => Effect.succeed(statement.includes("FROM servers") ? [{ id: serverId }] : []))
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.succeed({ id: channelId, guild_id: serverId, type: 2 }))
    await expect(run(input(dashboardEndpoints.enableCountdown, { body: { countdown_type: "cwl_timer" } }), { query, discord })).resolves.toEqual({ message: "cwl_timer enabled", countdown_type: "cwl_timer", channel_id: channelId, channel_name: "CWL Loading..." })
    expect(query.mock.calls.map(([statement]) => statement)).toEqual([expect.stringContaining("FOR UPDATE"), expect.stringContaining("FROM server_countdowns"), expect.stringContaining("INSERT INTO server_countdowns")])
  })

  it("preserves an existing countdown channel when removing configuration before global writer audit", async () => {
    const query = vi.fn((statement: string, _params: ReadonlyArray<unknown>) => Effect.succeed(statement.includes("FROM servers") ? [{ id: serverId }] : statement.includes("SELECT channel_id") ? [{ channel_id: channelId }] : []))
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.die("Must not delete existing Discord resource"))
    await expect(run(input(dashboardEndpoints.disableCountdown, { body: { countdown_type: "cwl_timer" } }), { query, discord })).resolves.toEqual({ message: "cwl_timer disabled", countdown_type: "cwl_timer" })
    expect(discord).not.toHaveBeenCalled()
    expect(query.mock.calls.at(-1)?.[0]).toContain("DELETE FROM server_countdowns")
  })
})
