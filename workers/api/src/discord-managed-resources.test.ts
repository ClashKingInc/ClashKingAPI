import { Effect, Layer } from "effect"
import { describe, expect, it, vi } from "vitest"
import { DiscordApi } from "./discord-api.js"
import { compensateCreatedDiscordResource, createCountdownChannel } from "./discord-managed-resources.js"

const serverId = "1234567890123456789", resourceId = "2234567890123456789"
const discord = () => {
  const request = vi.fn<DiscordApi["Service"]["request"]>(() => Effect.succeed({ id: resourceId, guild_id: serverId, type: 2 }))
  return { request, layer: Layer.succeed(DiscordApi, { request, token: () => Effect.die("Unexpected OAuth") }) }
}

describe("Discord resource creation", () => {
  it("creates countdown channels with exact snowflake IDs and permissions", async () => {
    const test = discord()
    await expect(Effect.runPromise(createCountdownChannel(serverId, "CWL Loading...").pipe(Effect.provide(test.layer)))).resolves.toMatchObject({ id: resourceId, serverId, type: "channel" })
    expect(test.request.mock.calls[0]?.[1]?.body).toEqual({ name: "CWL Loading...", type: 2, permission_overwrites: [{ id: serverId, type: 0, allow: "1024", deny: "1048576" }] })
  })

  it("preserves a newly created resource when a failed commit acknowledgement leaves persistence uncertain", async () => {
    const test = discord()
    await Effect.runPromise(Effect.gen(function* () { yield* compensateCreatedDiscordResource(yield* createCountdownChannel(serverId, "CWL")) }).pipe(Effect.provide(test.layer)))
    expect(test.request.mock.calls.map(([path, options]) => [path, options?.method ?? "GET"])).toEqual([[`/guilds/${serverId}/channels`, "POST"]])
  })
})
