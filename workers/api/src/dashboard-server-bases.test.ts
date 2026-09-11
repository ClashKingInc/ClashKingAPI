import { BaseEndpoint, BaseDownloaderEndpoint, BasesEndpoint, CreateBaseEndpoint, DeleteBaseEndpoint, UpdateBaseEndpoint, UploadBaseImageEndpoint, type AnyEndpoint } from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DashboardBaseFailure, encodeDashboardBaseFailure, executeDashboardServerBases, validateBaseCreate } from "./dashboard-server-bases.js"
import { DiscordApi } from "./discord-api.js"
import { Forbidden, InvalidRequest, NotFound, RateLimited, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { AuthIdentity } from "./auth.js"
import { DashboardServerOperations, dispatchDashboardServer } from "./dashboard-server-runtime.js"
import { ServerAuthorization } from "./server-authorization.js"

const serverId = "1234567890123456789", channelId = "2234567890123456789", messageId = "3234567890123456789", userId = "4234567890123456789"
const baseId = "9007199254740993"
const body = { channelId, baseLink: "https://link.clashofclans.com/en?action=OpenLayout&id=TH17", images: ["https://api.clashk.ing/v2/media/base_test.png"], description: "A base" }
const row = { id: baseId, server_id: serverId, channel_id: channelId, message_id: messageId, base_link: body.baseLink,
  images: body.images, description: body.description, downloaders: [userId], download_count: 1, upvote_count: 1, downvote_count: 0,
  created_at: new Date("2026-09-01T00:00:00Z") }
type Rows = ReadonlyArray<Readonly<Record<string, unknown>>>
const sqlFailure = { cause: { code: "23514", message: "constraint rejected" } }
function fixture(options: {
  query?: (statement: string, values: ReadonlyArray<unknown>) => Effect.Effect<Rows, unknown>
  discord?: DiscordApi["Service"]["request"]
} = {}) {
  const events: string[] = []
  const query = vi.fn((statement: string, values: ReadonlyArray<unknown>) => {
    events.push(statement.trim().split(/\s/u)[0]!)
    if (statement.includes("nextval")) return Effect.succeed([{ id: baseId }])
    return options.query?.(statement, values) ?? Effect.succeed(statement.includes("count(*)::int AS count") ? [{ count: 1 }] : [row])
  })
  const tagged = (parts: TemplateStringsArray, ...values: ReadonlyArray<unknown>) => query(parts.join("?"), values)
  const sql = Object.assign(tagged, {
    unsafe: (statement: string, values: ReadonlyArray<unknown> = []) => query(statement, values),
    withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  }) as unknown as SqlClient.SqlClient
  const discord = vi.fn((path: string, optionsArg?: Parameters<DiscordApi["Service"]["request"]>[1]) => {
    events.push(optionsArg?.method ?? "GET Discord")
    return options.discord?.(path, optionsArg) ?? Effect.succeed(path.endsWith("/messages") ? { id: messageId } : { id: channelId, guild_id: serverId, type: 0 })
  })
  const layer = Layer.mergeAll(Layer.succeed(SqlClient.SqlClient, sql), Layer.succeed(DiscordApi, { request: discord, token: () => Effect.die("Unexpected OAuth") }))
  const put = vi.fn(async () => ({ key: "test" }) as R2Object)
  const bindings = Object.assign({} as WorkerBindings, { MEDIA: { put } })
  const run = (endpoint: AnyEndpoint, overrides: { body?: unknown; path?: Readonly<Record<string, unknown>>; query?: Readonly<Record<string, unknown>> } = {}) => Effect.runPromise(executeDashboardServerBases({
    endpoint, bindings, body, path: { serverId, baseId, userId }, query: {}, principal: { kind: "bot" }, request: new Request("https://api.clashk.ing/"), ...overrides,
  }).pipe(Effect.provide(layer)))
  return { run, query, discord, events, put }
}
afterEach(() => vi.unstubAllGlobals())

describe("base dispatcher status and authorization", () => {
  it("preserves the custom error status/body instead of encoding it as201", async () => {
    const custom = new DashboardBaseFailure({ kind: "create", status: 502, body: {
      code: "upstream_unavailable", message: "Discord lacks access", databaseInserted: false,
      discordMessageCreated: false, discordMessageCleanup: "notNeeded", retryable: false,
    } })
    const requireAccess = vi.fn(() => Effect.succeed({ manager: true, principal: { kind: "bot" as const }, sections: {} }))
    const unusedAuth = () => Effect.die("Unexpected direct authentication")
    const layer = Layer.mergeAll(
      Layer.succeed(DashboardServerOperations, { execute: () => Effect.succeed(custom) }),
      Layer.succeed(ServerAuthorization, { require: requireAccess, resolve: () => Effect.die("Unexpected resolve") }),
      Layer.succeed(AuthIdentity, { requireBot: unusedAuth, requireUser: unusedAuth, requireUserOrBot: unusedAuth }),
      Layer.succeed(SqlClient.SqlClient, {} as SqlClient.SqlClient),
    )
    const request = new Request(`https://api.clashk.ing/v2/server/${serverId}/bases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const response = await Effect.runPromise(dispatchDashboardServer(request, {} as WorkerBindings).pipe(Effect.provide(layer)))
    expect(response?.status).toBe(502)
    expect(await response?.json()).toEqual(custom.body)
    expect(requireAccess).toHaveBeenCalledWith(request, serverId, { managerOnly: true, write: true, section: "bases" })
  })
})

describe("server base reads", () => {
  it("lists only server-owned rows with exact string IDs and bounded pagination", async () => {
    const f = fixture()
    const result = Schema.decodeUnknownSync(BasesEndpoint.response)(await f.run(BasesEndpoint, { query: { limit: 999, offset: -1 } }))
    expect(result).toMatchObject({ limit: 100, offset: 0, total: 1 })
    expect(result.items[0]).toMatchObject({ id: baseId, serverId, channelId, messageId, downloaders: [userId], downloadCount: 1, upvotes: 1,
      discordMessageUrl: `https://discord.com/channels/${serverId}/${channelId}/${messageId}` })
    expect(f.query.mock.calls[1]?.[1]).toEqual([serverId, 100, 0])
    expect(f.query.mock.calls.every(([statement]) => statement.includes("channel_id IS NOT NULL"))).toBe(true)
    expect(f.discord).not.toHaveBeenCalled()
  })
  it("preserves decimal bigint IDs and defaults invalid pagination", async () => {
    const f = fixture()
    await f.run(BaseEndpoint, { path: { serverId, baseId } })
    expect(f.query.mock.calls[0]?.[1]).toEqual([baseId, serverId])
    expect(await f.run(BasesEndpoint, { query: { limit: 0 } })).toMatchObject({ limit: 50 })
    await expect(f.run(BaseEndpoint, { path: { serverId, baseId: "bad" } })).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
  it("does not expose a base absent from the authorized server", async () => {
    const f = fixture({ query: () => Effect.succeed([]) })
    await expect(f.run(BaseEndpoint)).rejects.toMatchObject({ _tag: "NotFound" })
    await expect(f.run(DeleteBaseEndpoint)).rejects.toMatchObject({ _tag: "NotFound" })
    expect(f.discord).not.toHaveBeenCalled()
  })
  it("proves downloader membership before resolving Discord, preserving nullable failure profile", async () => {
    const missing = fixture({ query: () => Effect.succeed([{ exists: false }]) })
    await expect(missing.run(BaseDownloaderEndpoint)).rejects.toMatchObject({ _tag: "NotFound" })
    expect(missing.discord).not.toHaveBeenCalled()
    const unavailable = fixture({ query: () => Effect.succeed([{ exists: true }]), discord: () => Effect.fail(new NotFound({ message: "No member" })) })
    expect(await unavailable.run(BaseDownloaderEndpoint)).toEqual({ userId, displayName: null, avatarUrl: null })
    expect(unavailable.query.mock.calls[0]?.[1]).toEqual([baseId, serverId, userId])
  })
  it("returns the effective downloader name and guild avatar", async () => {
    const f = fixture({ query: () => Effect.succeed([{ exists: true }]), discord: () => Effect.succeed({ user: { id: userId, username: "user", discriminator: "0" }, nick: " Nick ", avatar: "a_guild", roles: [] }) })
    expect(await f.run(BaseDownloaderEndpoint)).toEqual({ userId, displayName: "Nick", avatarUrl: `https://cdn.discordapp.com/guilds/${serverId}/users/${userId}/avatars/a_guild.gif` })
  })
})

describe("managed base updates", () => {
  const editable = { baseLink: body.baseLink, images: body.images, description: "Updated base" }

  it("replaces the editable fields and image rows in one transaction", async () => {
    const f = fixture()
    const value = await f.run(UpdateBaseEndpoint, { body: editable })
    expect(Schema.decodeUnknownSync(UpdateBaseEndpoint.response)(value)).toMatchObject({ id: baseId, serverId })
    expect(f.events).toEqual(["UPDATE", "DELETE", "INSERT", "SELECT"])
    expect(f.query.mock.calls[0]?.[1]).toEqual([body.baseLink, editable.description, baseId, serverId])
    expect(f.discord).not.toHaveBeenCalled()
  })

  it("rejects non-canonical links, duplicate images, and unknown server-owned rows", async () => {
    const f = fixture()
    await expect(f.run(UpdateBaseEndpoint, { body: { ...editable, baseLink: "https://example.com/layout" } })).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(f.run(UpdateBaseEndpoint, { body: { ...editable, images: [body.images[0]!, body.images[0]!] } })).rejects.toMatchObject({ _tag: "InvalidRequest" })
    const missing = fixture({ query: (statement) => Effect.succeed(statement.startsWith("UPDATE") ? [] : [row]) })
    await expect(missing.run(UpdateBaseEndpoint, { body: editable })).rejects.toMatchObject({ _tag: "NotFound" })
  })
})

describe("immutable base creation", () => {
  it("validates Unicode length, CDN URLs and exact IDs before any I/O", async () => {
    expect(await Effect.runPromise(validateBaseCreate({ ...body, description: "🐉".repeat(1000), channelId: ` ${channelId} ` }))).toMatchObject({ channelId })
    const f = fixture()
    for (const invalid of [{ ...body, channelId: 123 }, { ...body, baseLink: "http://example.com" }, { ...body, images: ["https://cdn.clashk.ing.evil.test/a.png"] }, { ...body, images: Array(5).fill(body.images[0]) }, { ...body, description: "🐉".repeat(1001) }]) {
      await expect(f.run(CreateBaseEndpoint, { body: invalid })).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
    expect(f.discord).not.toHaveBeenCalled()
    expect(f.query).not.toHaveBeenCalled()
  })
  it("posts the Go embed and persists its returned message ID", async () => {
    const f = fixture()
    const value = await f.run(CreateBaseEndpoint)
    expect(Schema.decodeUnknownSync(CreateBaseEndpoint.response)(value)).toMatchObject({ messageId, serverId })
    expect(f.events).toEqual(["GET Discord", "SELECT", "POST", "INSERT", "INSERT", "SELECT"])
    expect(f.discord.mock.calls[1]).toEqual([`/channels/${channelId}/messages`, { method: "POST", body: { embeds: [{ title: "ClashKing Base Layout", url: body.baseLink, description: body.description,
      fields: [{ name: "Layout Link", value: `[Open in Clash of Clans](${body.baseLink})` }], image: { url: body.images[0] } }], components: [{ type: 1, components: [
        { type: 2, style: 1, label: "Open Layout", custom_id: `base:link:${baseId}` },
        { type: 2, style: 2, label: "Upvote", custom_id: `base:upvote:${baseId}` },
        { type: 2, style: 2, label: "Downvote", custom_id: `base:downvote:${baseId}` },
      ] }] } }])
    expect(f.query.mock.calls[1]?.[1]?.slice(0, 4)).toEqual([baseId, serverId, channelId, messageId])
  })
  it.each([{ id: channelId, guild_id: "999999999999999999", type: 0 }, { id: channelId, guild_id: serverId, type: 4 }])("rejects wrong-guild/non-message channels", async (channel) => {
    const f = fixture({ discord: () => Effect.succeed(channel) })
    expect(await f.run(CreateBaseEndpoint)).toMatchObject({ status: 409, body: { code: "conflict", discordMessageCreated: false, retryable: false } })
    expect(f.query).not.toHaveBeenCalled()
    expect(f.discord).toHaveBeenCalledOnce()
  })
  it.each<[ApiFailure, number, boolean]>([
    [new NotFound({ message: "unknown channel" }), 409, false], [new Forbidden({ message: "no access" }), 502, false],
    [new InvalidRequest({ message: "bad" }), 502, false], [new RateLimited({ message: "rate", retryAfterSeconds: 1 }), 503, true],
  ])("classifies Discord failures without attempting SQL", async (error, status, retryable) => {
    const f = fixture({ discord: () => Effect.fail(error) })
    expect(await f.run(CreateBaseEndpoint)).toMatchObject({ status, body: { databaseInserted: false, retryable } })
    expect(f.query).not.toHaveBeenCalled()
  })
  it("does not save or retry a created message without a valid exact ID", async () => {
    const f = fixture({ discord: (path) => Effect.succeed(path.endsWith("messages") ? { id: 123 } : { id: channelId, guild_id: serverId, type: 0 }) })
    expect(await f.run(CreateBaseEndpoint)).toMatchObject({ status: 502, body: { discordMessageCreated: true, discordMessageCleanup: "failed", retryable: false } })
    expect(f.query).toHaveBeenCalledTimes(1)
  })
  it("does not claim no Discord message was created after a lost POST acknowledgement", async () => {
    const f = fixture({ discord: (path) => path.endsWith("messages") ? Effect.fail(new UpstreamUnavailable({ cause: "connection lost", message: "unavailable" })) : Effect.succeed({ id: channelId, guild_id: serverId, type: 0 }) })
    await expect(f.run(CreateBaseEndpoint)).rejects.toMatchObject({ _tag: "UpstreamUnavailable", message: expect.stringContaining("Do not retry automatically") })
    expect(f.query).toHaveBeenCalledTimes(1)
  })
  it("reconciles a lost INSERT acknowledgement to persisted success without deleting Discord", async () => {
    const f = fixture({ query: (statement) => statement.startsWith("INSERT") ? Effect.fail(new Error("connection lost")) : Effect.succeed([row]) })
    expect(await f.run(CreateBaseEndpoint)).toMatchObject({ id: baseId })
    expect(f.events).toEqual(["GET Discord", "SELECT", "POST", "INSERT", "SELECT"])
  })
  it("retains the created message after a proven rejected statement and encodes the custom failure", async () => {
    const f = fixture({ query: (statement) => statement.startsWith("INSERT") ? Effect.fail(sqlFailure) : Effect.succeed([]) })
    const value = await f.run(CreateBaseEndpoint)
    expect(value).toBeInstanceOf(DashboardBaseFailure)
    expect(value).toMatchObject({ status: 500, body: { databaseInserted: false, discordMessageId: messageId, discordMessageCleanup: "failed", retryable: false } })
    expect(f.events).toEqual(["GET Discord", "SELECT", "POST", "INSERT", "SELECT"])
    const response = await Effect.runPromise(encodeDashboardBaseFailure(value)!)
    expect(response.status).toBe(500)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toMatchObject({ discordMessageId: messageId, retryable: false })
  })
  it.each([false, true])("never fabricates databaseInserted:false or compensates when commit is uncertain (verification fails=%s)", async (verificationFails) => {
    const f = fixture({ query: (statement) => statement.startsWith("INSERT") || verificationFails ? Effect.fail(new Error("connection lost")) : Effect.succeed([]) })
    await expect(f.run(CreateBaseEndpoint)).rejects.toMatchObject({ _tag: "DatabaseFailure", message: expect.stringContaining("Do not retry automatically") })
    expect(f.discord.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false)
  })
})

describe("managed base deletion", () => {
  it.each([false, true])("cleans Discord first and treats missing messages as success (%s)", async (missing) => {
    const f = fixture({ discord: () => missing ? Effect.fail(new NotFound({ message: "missing" })) : Effect.succeed(undefined) })
    expect(await f.run(DeleteBaseEndpoint)).toEqual({ baseId, databaseDeleted: true, discordMessageCleanup: missing ? "alreadyMissing" : "deleted" })
    expect(f.events).toEqual(["SELECT", "DELETE", "DELETE"])
    expect(f.discord).toHaveBeenCalledWith(`/channels/${channelId}/messages/${messageId}`, { method: "DELETE" })
  })
  it("retains the DB row after a Discord permission failure", async () => {
    const f = fixture({ discord: () => Effect.fail(new Forbidden({ message: "no access" })) })
    expect(await f.run(DeleteBaseEndpoint)).toMatchObject({ status: 502, body: { databaseDeleted: false, retryable: false } })
    expect(f.query).toHaveBeenCalledOnce()
  })
  it("reports definite rejected DB deletion with completed message cleanup", async () => {
    const f = fixture({ query: (statement) => statement.startsWith("DELETE") ? Effect.fail(sqlFailure) : Effect.succeed([row]) })
    expect(await f.run(DeleteBaseEndpoint)).toMatchObject({ status: 500, body: { databaseDeleted: false, discordMessageCleanup: "deleted", retryable: true } })
  })
  it("reconciles committed deletion after lost acknowledgement", async () => {
    const f = fixture({ query: (statement) => statement.startsWith("DELETE") ? Effect.fail(new Error("connection lost")) : statement.startsWith("SELECT id") ? Effect.succeed([]) : Effect.succeed([row]) })
    expect(await f.run(DeleteBaseEndpoint)).toMatchObject({ databaseDeleted: true })
  })
  it("does not claim databaseDeleted:false while deletion remains uncertain", async () => {
    const f = fixture({ query: (statement) => statement.startsWith("DELETE") ? Effect.fail(new Error("connection lost")) : Effect.succeed([row]) })
    await expect(f.run(DeleteBaseEndpoint)).rejects.toMatchObject({ _tag: "DatabaseFailure", message: expect.stringContaining("Do not retry automatically") })
  })
})

describe("R2 base image upload", () => {
  it("writes public R2 media and returns the canonical read URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    const form = new FormData(); form.set("file", new File(["image"], "BASE.PNG", { type: "image/png" }))
    const f = fixture()
    const result = await f.run(UploadBaseImageEndpoint, { body: form })
    expect(result).toMatchObject({ url: expect.stringMatching(/^https:\/\/api\.clashk\.ing\/v2\/media\/base_.*\.png$/u), filename: expect.stringMatching(/^base_.*\.png$/u) })
    expect(f.put).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("rejects missing/unsupported files before network access", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock)
    const f = fixture()
    await expect(f.run(UploadBaseImageEndpoint, { body: new FormData() })).rejects.toMatchObject({ _tag: "InvalidRequest" })
    const form = new FormData(); form.set("file", new File(["image"], "file.svg"))
    await expect(f.run(UploadBaseImageEndpoint, { body: form })).rejects.toMatchObject({ _tag: "InvalidRequest", status: 415 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("rejects an image above 25 MiB before network access", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock)
    const form = new FormData(); form.set("file", new File([new Uint8Array(25 * 1024 * 1024 + 1)], "large.png"))
    await expect(fixture().run(UploadBaseImageEndpoint, { body: form })).rejects.toMatchObject({ _tag: "PayloadTooLarge" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
