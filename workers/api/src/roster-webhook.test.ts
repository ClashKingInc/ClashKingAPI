import { describe, expect, it } from "vitest"
import { Effect, Layer } from "effect"
import { DiscordApi } from "./discord-api.js"
import { rosterWebhook } from "./roster-webhook.js"

const hook = { id: "400", type: 1, application_id: "100", guild_id: "200", channel_id: "300", name: "ClashKing Rosters", token: "secret" }
const run = (responses: Record<string, unknown>, webhookId?: string, channelId = "300") => {
  responses = { "GET /users/@me": { id: "100", username: "ClashKing Beta", avatar: "global" }, "GET /guilds/200/members/100": { nick: "Server Bot", avatar: "guild" }, ...responses }
  const calls: string[] = []
  const layer = Layer.succeed(DiscordApi, {
    request: (path, options) => { const key = `${options?.method ?? "GET"} ${path}`; calls.push(key); return Effect.succeed(responses[key]) },
    token: () => Effect.die("Unexpected OAuth"),
  })
  return { calls, result: Effect.runPromise(rosterWebhook("100", "200", channelId, webhookId).pipe(Effect.provide(layer))) }
}
const channel = { guild_id: "200", type: 0 }
describe("roster webhook ownership", () => {
  it("reuses an application-owned channel webhook", async () => {
    const test = run({ "GET /channels/300": channel, "GET /channels/300/webhooks": [hook] })
    expect(await test.result).toMatchObject({ id: "400", path: "/webhooks/400/secret", query: "with_components=true", identity: { username: "Server Bot", avatar_url: "https://cdn.discordapp.com/guilds/200/users/100/avatars/guild.png?size=512" } })
    expect(test.calls).toHaveLength(4)
  })
  it("creates its own webhook rather than adopting another application's", async () => {
    const test = run({ "GET /channels/300": channel, "GET /channels/300/webhooks": [{ ...hook, application_id: "999" }], "POST /channels/300/webhooks": hook })
    expect((await test.result).id).toBe("400")
    expect(test.calls).toContain("POST /channels/300/webhooks")
  })
  it("routes thread messages through their parent webhook", async () => {
    const test = run({ "GET /channels/301": { ...channel, type: 11, parent_id: "300" }, "GET /webhooks/400": hook }, "400", "301")
    expect((await test.result).query).toBe("with_components=true&thread_id=301")
  })
  it("rejects saved webhooks moved to another channel without exposing tokens", async () => {
    const test = run({ "GET /channels/300": channel, "GET /webhooks/400": { ...hook, channel_id: "999" } }, "400")
    await expect(test.result).rejects.toThrow("Roster webhook must belong to this application and channel")
  })
  it("rejects channels outside the authorized server", async () => {
    const test = run({ "GET /channels/300": { ...channel, guild_id: "999" } })
    await expect(test.result).rejects.toThrow("Select a text channel in this server")
    expect(test.calls).toHaveLength(1)
  })
})
