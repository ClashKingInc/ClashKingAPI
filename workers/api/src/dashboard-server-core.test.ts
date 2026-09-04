import { dashboardEndpoints, type AnyEndpoint } from "@clashking/api-contracts"
import { Effect, Layer } from "effect"
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
const bindings = { DISCORD_BOT_TOKEN: "test-token" } as WorkerBindings
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
  it("implements the same 85 operations advertised by the dispatcher", () => {
    expect(dashboardServerCoreOperationIds).toHaveLength(85)
    expect(new Set(dashboardServerCoreOperationIds).size).toBe(85)
  })

  it("executes the live service layer and validates channel output without numeric snowflake coercion", async () => {
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.succeed([
      { id: channelId, name: "general", type: 0, parent_id: "2222222222222222222" },
      { id: "2222222222222222222", name: "Family", type: 4 },
      { id: "3333333333333333333", name: "voice", type: 2 },
    ]))
    const layer = DashboardServerOperations.layer.pipe(Layer.provideMerge(dependencies({ discord })))
    const response = await Effect.runPromise(dispatchDashboardServer(new Request(`https://api.clashk.ing/v2/server/${serverId}/channels`), bindings).pipe(Effect.provide(layer)))
    expect(await response?.json()).toEqual([
      { id: "2222222222222222222", name: "Family", type: "category" },
      { id: channelId, name: "general", type: "text", parent_id: "2222222222222222222", parent_name: "Family" },
    ])
    expect(discord).toHaveBeenCalledWith(`/guilds/${serverId}/channels`)
  })

  it("rejects numeric Discord IDs returned by Discord instead of silently rounding", async () => {
    await expect(run(input(dashboardEndpoints.serverChannels), { discord: () => Effect.succeed([{ id: 123, name: "general", type: 0 }]) })).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
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
      query: () => Effect.succeed([{ clan_tag: null, type: "reddit_feed", webhook_id: "5555555555555555555", thread_id: null, disabled: false }]),
    })
    expect(value).toEqual({ count: 1, logs: [{ type: "reddit_feed", webhook_id: "5555555555555555555", channel_id: channelId, thread_id: null, disabled: false }] })
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

  it("creates a countdown only after locking the server and records creation provenance", async () => {
    const query = vi.fn((statement: string, _params: ReadonlyArray<unknown>) => Effect.succeed(statement.includes("FROM servers") ? [{ id: serverId }] : []))
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.succeed({ id: channelId, guild_id: serverId, type: 2 }))
    await expect(run(input(dashboardEndpoints.enableCountdown, { body: { countdown_type: "cwl_timer" } }), { query, discord })).resolves.toEqual({ message: "cwl_timer enabled", countdown_type: "cwl_timer", channel_id: channelId, channel_name: "CWL Loading..." })
    expect(query.mock.calls.map(([statement]) => statement)).toEqual([expect.stringContaining("FOR UPDATE"), expect.stringContaining("FROM server_countdowns"), expect.stringContaining("INSERT INTO discord_managed_resources"), expect.stringContaining("INSERT INTO server_countdowns")])
  })

  it("preserves an existing countdown channel when removing configuration before global writer audit", async () => {
    const query = vi.fn((statement: string, _params: ReadonlyArray<unknown>) => Effect.succeed(statement.includes("FROM servers") ? [{ id: serverId }] : statement.includes("SELECT channel_id") ? [{ channel_id: channelId }] : []))
    const discord = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.die("Must not delete existing Discord resource"))
    await expect(run(input(dashboardEndpoints.disableCountdown, { body: { countdown_type: "cwl_timer" } }), { query, discord })).resolves.toEqual({ message: "cwl_timer disabled", countdown_type: "cwl_timer" })
    expect(discord).not.toHaveBeenCalled()
    expect(query.mock.calls.at(-1)?.[0]).toContain("DELETE FROM server_countdowns")
  })
})
