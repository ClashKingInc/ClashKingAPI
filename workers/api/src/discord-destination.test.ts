import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { DiscordApi } from "./discord-api.js"
import { validateDiscordDestination } from "./discord-destination.js"
import { NotFound, RateLimited } from "./errors.js"

const server = "1234567890123456789", channel = "2234567890123456789", thread = "3234567890123456789"
const run = (request: DiscordApi["Service"]["request"], threadId: string | null = null) => Effect.runPromise(validateDiscordDestination(server, channel, threadId).pipe(Effect.provideService(DiscordApi, { request, token: () => Effect.die("Unexpected token operation") })))

describe("Discord destination validation", () => {
  it("preserves >2^53 IDs across parent and child lookups", async () => {
    const request = vi.fn<DiscordApi["Service"]["request"]>((path) => Effect.succeed(path === `/channels/${channel}` ? { id: channel, type: 15, guild_id: server } : { id: thread, type: 11, guild_id: server, parent_id: channel }))
    await expect(run(request, thread)).resolves.toBeUndefined()
    expect(request.mock.calls.map(([path]) => path)).toEqual([`/channels/${channel}`, `/channels/${thread}`])
  })
  it("rejects a channel from a different guild", async () => {
    await expect(run(() => Effect.succeed({ id: channel, type: 0, guild_id: "999" }))).rejects.toMatchObject({ _tag: "InvalidRequest", details: [{ field: "channel_id", message: "must belong to the requested server" }] })
  })
  it("requires a child post for a forum destination", async () => {
    await expect(run(() => Effect.succeed({ id: channel, type: 15, guild_id: server }))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
  it("rejects a thread attached to a different parent", async () => {
    await expect(run((path) => Effect.succeed(path === `/channels/${channel}` ? { id: channel, type: 0, guild_id: server } : { id: thread, type: 11, guild_id: server, parent_id: "777" }), thread)).rejects.toMatchObject({ _tag: "InvalidRequest", details: [{ field: "thread_id", message: "must belong to channel_id" }] })
  })
  it("turns missing resources into validation errors but preserves rate limiting", async () => {
    await expect(run(() => Effect.fail(new NotFound({ message: "gone" })))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(run(() => Effect.fail(new RateLimited({ message: "limited", retryAfterSeconds: 3 })))).rejects.toMatchObject({ _tag: "RateLimited" })
  })
})
