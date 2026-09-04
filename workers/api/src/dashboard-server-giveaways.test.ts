import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { giveawayEntrants, giveawayWinnerValue, parseGiveawayForm } from "./dashboard-server-giveaways.js"
import { DiscordApi } from "./discord-api.js"
import { NotFound, RateLimited } from "./errors.js"
const form = () => { const value = new FormData(); for (const [key, item] of Object.entries({ prize: "Gold Pass", channel_id: "1334567890123456789", winners: "2", now: "true", end_time: "2026-10-01T12:00:00" })) value.set(key,item); return value }
describe("Giveaway validation and weighted entry reporting", () => {
  it("keeps snowflakes exact and parses timezone-less ISO dates as UTC", async () => {
    const value = await Effect.runPromise(parseGiveawayForm(form(), new Date("2026-09-03T00:00:00Z")))
    expect(value.channelId).toBe("1334567890123456789")
    expect(value.end.toISOString()).toBe("2026-10-01T12:00:00.000Z")
  })
  it("rejects fractional winners, malformed JSON and numeric snowflakes in lists", async () => {
    for (const [key,value] of [["winners","1.5"],["roles_json","[1234567890123456789]"],["mentions_json","oops"],["end_time","2020-01-01T00:00:00Z"]]) {
      const input = form(); input.set(key!,value!)
      await expect(Effect.runPromise(parseGiveawayForm(input,new Date("2026-09-03T00:00:00Z")))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
  })
  it("counts weighted duplicate entries in first-seen order", () => {
    expect(giveawayEntrants(["1334567890123456789", { user_id: "2334567890123456789" }, "1334567890123456789"])).toEqual({ totalEntries: 3, uniqueUsers: 2, entrants: [{ userId: "1334567890123456789", entries: 2, winChance: 66.67 }, { userId: "2334567890123456789", entries: 1, winChance: 33.33 }] })
  })
  it("resolves winner identity without rounding IDs and matches the pinned Go avatar behavior", async () => {
    const userId = "1334567890123456789"
    const value = await Effect.runPromise(giveawayWinnerValue("2334567890123456789", { user_id: userId, status: "winner" }).pipe(Effect.provideService(DiscordApi, { request: () => Effect.succeed({ nick: "Captain", user: { id: userId, username: "captain", discriminator: "1000" } }), token: () => Effect.die("Unexpected token") })))
    expect(value).toMatchObject({ userId, username: "Captain", avatarUrl: `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(userId) >> 22n) % 6n)}.png`, inServer: true })
  })
  it("marks only missing members absent and preserves upstream rate limiting", async () => {
    const run = (failure: NotFound | RateLimited) => Effect.runPromise(giveawayWinnerValue("2334567890123456789", { user_id: "1334567890123456789", username: "Previous winner" }).pipe(Effect.provideService(DiscordApi, { request: () => Effect.fail(failure), token: () => Effect.die("Unexpected token") })))
    expect(await run(new NotFound({ message: "Missing" }))).toMatchObject({ username: "Previous winner", inServer: false })
    await expect(run(new RateLimited({ message: "Wait", retryAfterSeconds: 5 }))).rejects.toMatchObject({ _tag: "RateLimited" })
  })
})
