import { describe, expect, it } from "vitest"
import { rosterPublication, rosterPublications } from "./roster-publication.js"
describe("roster publication", () => {
  const input = { id: "roster", name: "CWL", members: Array.from({ length: 55 }, (_, n) => ({ townhall: 18, name: `Player${n}` })),
    emojis: [{ id: "123", name: "th18" }, { id: "456", name: "refresh" }], dashboardUrl: "https://dash.example/roster", mode: "signup",
    joinLabel: "Sign up", leaveLabel: "Remove signup", viewLabel: "Dashboard" }
  it("shows only 50 names, real Town Hall emojis and a full roster link", () => {
    const body = rosterPublication(input)
    expect(body.embeds[0]!.description).toContain("<:th18:123> Player49")
    expect(body.embeds[0]!.description).not.toContain("Player50")
    expect(body.embeds[0]!.description).toContain("… [Dashboard")
    expect(body.components[0]!.components).toHaveLength(4)
    expect(body.components[0]!.components[0]).toMatchObject({ emoji: { id: "456", name: "refresh" } })
    expect(body.components[0]!.components[1]).toMatchObject({ style: 3 })
    expect(body.components[0]!.components[2]).toMatchObject({ style: 4 })
    expect(body.components[0]!.components[3]).toMatchObject({ label: "Manage" })
    expect(body.components[0]!.components[3]).not.toHaveProperty("emoji")
    expect(body.allowed_mentions.parse).toEqual([])
  })
  it("packs static rosters by character count across at most five embed messages", () => {
    const members = Array.from({ length: 500 }, (_, n) => ({ townhall: 18, name: `Player${n}` }))
    const messages = rosterPublications({ ...input, mode: "static", description: "Event description", members })
    expect(messages.length).toBeGreaterThan(1)
    expect(messages.length).toBeLessThanOrEqual(5)
    for (const message of messages) {
      expect(message.embeds[0]!.description!.length).toBeLessThanOrEqual(4096)
      expect(message.embeds[0]!.description!.length + message.embeds[0]!.title.length + message.embeds[0]!.footer.text.length).toBeLessThanOrEqual(6000)
    }
    expect(messages[0]!.embeds[0]!.description).toContain("Player70")
    expect(messages[0]!.embeds[0]!.description).toContain("Event description")
  })
  it("keeps even long names bounded and includes the configured image", () => {
    const body = rosterPublication({ ...input, image: "https://api.example/v2/media/roster.png", members: input.members.map(m => ({ ...m, name: "@everyone".repeat(50) })) })
    expect(body.embeds[0]!.description!.length).toBeLessThanOrEqual(4096)
    expect(body.embeds[0]!.description).not.toContain("@everyone")
    expect(body.embeds[0]!.image?.url).toContain("roster.png")
    expect(rosterPublication({ ...input, mode: "static" }).components[0]!.components).toHaveLength(1)
  })
  it("uses the resolved embed color, including black", () => {
    expect(rosterPublication({ ...input, color: 0 }).embeds[0]!.color).toBe(0)
    expect(rosterPublication({ ...input, color: 0x123456 }).embeds[0]!.color).toBe(0x123456)
  })
})
