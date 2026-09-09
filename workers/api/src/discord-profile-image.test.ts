import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { discordWebhookAvatar, validateDiscordProfileImage } from "./discord-profile-image.js"
afterEach(() => vi.unstubAllGlobals())
describe("Discord profile image boundaries", () => {
  it("validates actual base64 content and decoded size", async () => {
    await expect(Effect.runPromise(validateDiscordProfileImage("data:image/png;base64,YQ==", "avatar"))).resolves.toBe("data:image/png;base64,YQ==")
    for (const value of ["data:image/png;base64,", "data:image/png;base64,A===", "data:image/png;base64,AAA", `data:image/png;base64,${btoa("a".repeat(10 * 1024 * 1024 + 1))}`]) await expect(Effect.runPromise(validateDiscordProfileImage(value, "avatar"))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
  it("downloads only an allowed Discord CDN image and produces a webhook data URI", async () => {
    const fetch = vi.fn(async () => new Response("a", { headers: { "content-type": "image/png" } })); vi.stubGlobal("fetch", fetch)
    expect(await Effect.runPromise(discordWebhookAvatar("https://cdn.discordapp.com/avatars/123/image.png"))).toBe("data:image/png;base64,YQ==")
    await expect(Effect.runPromise(discordWebhookAvatar("https://example.com/image.png"))).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(fetch).toHaveBeenCalledOnce()
  })
})
