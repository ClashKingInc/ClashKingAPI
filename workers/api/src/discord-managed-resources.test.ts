import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { DiscordApi } from "./discord-api.js"
import { cleanupManagedDiscordResource, compensateCreatedDiscordResource, createCountdownChannel, recordCreatedDiscordResource } from "./discord-managed-resources.js"
import { NotFound } from "./errors.js"

const serverId = "1234567890123456789", resourceId = "2234567890123456789"
const fixture = (options: { readonly owned?: boolean; readonly referencedTable?: string; readonly discord?: DiscordApi["Service"]["request"] } = {}) => {
  const query = vi.fn((statement: string, _params: ReadonlyArray<unknown>): Effect.Effect<ReadonlyArray<Readonly<Record<string, unknown>>>, unknown> => Effect.succeed(statement.includes("SELECT resource_id FROM discord_managed_resources") ? options.owned === false ? [] : [{ resource_id: resourceId }] : statement.includes("SELECT EXISTS") ? [{ used: options.referencedTable !== undefined && statement.includes(`FROM ${options.referencedTable} AS config`) }] : []))
  const sql = Object.assign((parts: TemplateStringsArray, ...params: ReadonlyArray<unknown>) => query(parts.join("?"), params), { unsafe: query, withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect }) as SqlClient.SqlClient & { readonly unsafe: typeof query }
  const discord = vi.fn<DiscordApi["Service"]["request"]>(options.discord ?? ((_path, options) => Effect.succeed(options?.method === "DELETE" ? undefined : { id: resourceId, guild_id: serverId, type: 2 })))
  return { query, discord, layer: Layer.mergeAll(Layer.succeed(SqlClient.SqlClient, sql), Layer.succeed(DiscordApi, { request: discord, token: () => Effect.die("Unexpected OAuth") })) }
}
const cleanup = (test: ReturnType<typeof fixture>, writersSerialized = true) => Effect.runPromise(cleanupManagedDiscordResource({ serverId, id: resourceId, type: "channel", writersSerialized }).pipe(Effect.provide(test.layer)))

describe("managed Discord resources", () => {
  it("preserves stored/pre-existing IDs that have no creation ledger entry", async () => {
    const test = fixture({ owned: false })
    await expect(cleanup(test)).resolves.toBe("preserved")
    expect(test.discord).not.toHaveBeenCalled()
    expect(test.query).toHaveBeenCalledOnce()
  })
  it("does not delete until all writers participate in serialization", async () => {
    const test = fixture()
    await expect(cleanup(test, false)).resolves.toBe("preserved")
    expect(test.query).not.toHaveBeenCalled()
    expect(test.discord).not.toHaveBeenCalled()
  })
  it("preserves an owned resource used by another feature, including opaque ticket data", async () => {
    for (const referencedTable of ["rosters", "reminders", "ticket_panels", "server_custom_embeds"]) {
      const test = fixture({ referencedTable })
      await expect(cleanup(test)).resolves.toBe("preserved")
      expect(test.discord).not.toHaveBeenCalled()
    }
  })
  it("preserves foreign-guild resources despite a stale ledger row", async () => {
    const test = fixture({ discord: () => Effect.succeed({ id: resourceId, guild_id: "999", type: 2 }) })
    await expect(cleanup(test)).resolves.toBe("preserved")
    expect(test.discord).toHaveBeenCalledOnce()
    expect(test.query.mock.calls.some(([query]) => query.startsWith("DELETE"))).toBe(false)
  })
  it("deletes only ledger-proven unused resources after matching Discord metadata", async () => {
    const test = fixture()
    await expect(cleanup(test)).resolves.toBe("deleted")
    expect(test.discord.mock.calls).toEqual([[`/channels/${resourceId}`], [`/channels/${resourceId}`, { method: "DELETE" }]])
    expect(test.query.mock.calls.at(-1)?.[0]).toContain("DELETE FROM discord_managed_resources")
    expect(test.query.mock.calls[0]?.[1]).toEqual(["channel", resourceId, serverId, "server_countdown"])
  })
  it("removes a proven missing resource ledger row without issuing another delete", async () => {
    const test = fixture({ discord: () => Effect.fail(new NotFound({ message: "gone" })) })
    await expect(cleanup(test)).resolves.toBe("deleted")
    expect(test.discord).toHaveBeenCalledOnce()
    expect(test.query.mock.calls.at(-1)?.[0]).toContain("DELETE FROM discord_managed_resources")
  })
  it("records provenance only from a verified creation and preserves >2^53 IDs", async () => {
    const test = fixture()
    await Effect.runPromise(Effect.gen(function* () {
      const proof = yield* createCountdownChannel(serverId, "CWL Loading...")
      yield* recordCreatedDiscordResource(proof)
    }).pipe(Effect.provide(test.layer)))
    expect(test.discord.mock.calls[0]?.[1]?.body).toEqual({ name: "CWL Loading...", type: 2, permission_overwrites: [{ id: serverId, type: 0, allow: "1024", deny: "1048576" }] })
    expect(test.query.mock.calls[0]?.[1]).toEqual(["channel", resourceId, serverId, "server_countdown"])
  })
  it("preserves a newly created resource when a failed commit acknowledgement leaves persistence uncertain", async () => {
    const test = fixture()
    await Effect.runPromise(Effect.gen(function* () { yield* compensateCreatedDiscordResource(yield* createCountdownChannel(serverId, "CWL")) }).pipe(Effect.provide(test.layer)))
    expect(test.discord.mock.calls.map(([path, options]) => [path, options?.method ?? "GET"])).toEqual([[`/guilds/${serverId}/channels`, "POST"]])
    expect(test.query).not.toHaveBeenCalled()
  })
})
