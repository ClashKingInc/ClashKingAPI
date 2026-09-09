import { BaseEndpoint, BaseDownloaderEndpoint, BasesEndpoint, CreateBaseEndpoint, DeleteBaseEndpoint, UploadBaseImageEndpoint, type AnyEndpoint } from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { afterEach, describe, expect, it, vi } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { executeDashboardServerBases } from "../../src/dashboard-server-bases.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1" || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname)) throw new Error("Run against local disposable Timescale using the schema repository harness")
const serverId = "6334567890123456789", channelId = "7334567890123456789", messageId = "8334567890123456789", userId = "5334567890123456789"
const discord = vi.fn((path: string) => Effect.succeed(path === `/channels/${channelId}` ? { id: channelId, guild_id: serverId, type: 0 }
  : path.endsWith("/messages") ? { id: messageId }
  : path.includes("/members/") ? { user: { id: userId, username: "Fixture user", discriminator: "0" }, roles: [], nick: null, avatar: null }
  : undefined))
const put = vi.fn(async () => ({ key: "test" }) as R2Object)
const bindings = Object.assign({} as WorkerBindings, { HYPERDRIVE: { connectionString: databaseUrl }, MEDIA: { put } })
const layer = Layer.mergeAll(databaseLayer(bindings), Layer.succeed(DiscordApi, { request: discord, token: () => Effect.die("Unexpected OAuth") }))
const execute = (endpoint: AnyEndpoint, body: unknown = {}, path: Readonly<Record<string, string>> = { serverId }) => executeDashboardServerBases({ endpoint, bindings, body, path, query: {}, principal: { kind: "bot" }, request: new Request("https://api.clashk.ing/") })
afterEach(() => vi.unstubAllGlobals())

describe("base SQL against disposable authoritative Goose schema", () => {
  it("round-trips all six operations with exact IDs, server ownership and visible downloader history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const form = new FormData(); form.set("file", new File(["mock image"], "layout.png"))
      const uploaded = Schema.decodeUnknownSync(UploadBaseImageEndpoint.response)(yield* execute(UploadBaseImageEndpoint, form))
      expect(uploaded.url).toMatch(/^https:\/\/api\.clashk\.ing\/v2\/media\/base_.*\.png$/u)
      const created = Schema.decodeUnknownSync(CreateBaseEndpoint.response)(yield* execute(CreateBaseEndpoint, { channelId, baseLink: "https://link.clashofclans.com/en?action=OpenLayout", images: [uploaded.url], description: "Fixture base" }))
      expect(created).toMatchObject({ serverId, channelId, messageId, downloadCount: 0, images: [uploaded.url] })
      const path = { serverId, baseId: created.id }
      const listed = Schema.decodeUnknownSync(BasesEndpoint.response)(yield* execute(BasesEndpoint))
      expect(listed.items.map((base) => base.id)).toContain(created.id)
      const fetched = Schema.decodeUnknownSync(BaseEndpoint.response)(yield* execute(BaseEndpoint, {}, path))
      expect(fetched.messageId).toBe(messageId)
      const missing = yield* execute(BaseEndpoint, {}, { serverId: "6334567890123456788", baseId: created.id }).pipe(Effect.result)
      expect(missing._tag).toBe("Failure")
      yield* sql`UPDATE bases SET downloaders = ${[userId]}::text[], upvoter_ids = ${[userId]}::text[] WHERE id = ${created.id}::uuid`
      const profile = Schema.decodeUnknownSync(BaseDownloaderEndpoint.response)(yield* execute(BaseDownloaderEndpoint, {}, { ...path, userId }))
      expect(profile).toMatchObject({ userId, displayName: "Fixture user" })
      const updated = Schema.decodeUnknownSync(BaseEndpoint.response)(yield* execute(BaseEndpoint, {}, path))
      expect(updated).toMatchObject({ downloadCount: 1, upvotes: 1, downloaders: [userId] })
      const deleted = Schema.decodeUnknownSync(DeleteBaseEndpoint.response)(yield* execute(DeleteBaseEndpoint, {}, path))
      expect(deleted).toEqual({ baseId: created.id, databaseDeleted: true, discordMessageCleanup: "deleted" })
      const rows = yield* sql`SELECT id FROM bases WHERE id = ${created.id}::uuid`
      expect(rows).toHaveLength(0)
    }).pipe(Effect.provide(layer), Effect.scoped))
    expect(put).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
