import { describe, expect, it } from "vitest"
import { approvalBuiltinValues, approvalEmojiName, approvalHeroText, type ApprovalPlayer } from "./ticket-approval-values.js"
import { ticketApprovalTokens } from "./ticket-approval-template.js"

const player: ApprovalPlayer = { name: "Applicant", townHallLevel: 8,
  heroes: [{ name: "Barbarian King", level: 20, village: "home" }, { name: "Battle Machine", level: 20, village: "builderBase" }],
  heroEquipment: [{ name: "Rage Vial", level: 4, maxLevel: 18 }, { name: "Barbarian Puppet", level: 18, maxLevel: 18 },
    { name: "Archer Puppet", level: 1, maxLevel: 18 }],
}
const emojis = new Map(["blank", "barbarian_king", "gold_20", "barbarian_puppet", "gold_18", "rage_vial", "blue_4"].map(name => [name, `<:${name}:123>`]))
describe("retained ticket approval builtin values", () => {
  it("renders all 22 tokens, literal account names, linked leader and retained blank badge", () => {
    const result = approvalBuiltinValues({ ticket: { number: 12, status: "sleep", channelId: "123", applicantUserId: "234" },
      applicantName: "User {custom}", guild: { name: "Guild", memberCount: 42 }, player,
      clan: { name: "Clan", tag: "#PQL", clanLevel: 20, members: 50, location: { name: "International" },
        warLeague: { name: "Champion League I" }, capitalLeague: { name: "Titan League I" },
        memberList: [{ name: "Leader", tag: "#PYL", role: "leader" }] }, leaderUserId: "345", emojis })
    expect(Object.keys(result).sort()).toEqual([...ticketApprovalTokens].sort())
    expect(result).toMatchObject({ ticket_count: "12", ticket_emoji_status: "💤", ticket_channel_mention: "<#123>",
      user_name: "User {custom}", user_mention: "<@234>", server_name: "Guild", server_member_count: "42",
      account_name: "Applicant", account_th: "8", clan_badge_emoji: "<:blank:123>", clan_name: "Clan", clan_level: "20",
      clan_link: "https://link.clashofclans.com/en?action=OpenClanProfile&tag=%23PQL", clan_location: "International",
      clan_member_count: "50", clan_leader: "Leader", clan_leader_mention: "<@345>", clan_tag: "#PQL",
      clan_war_league: "Champion League I", clan_capital_league: "Titan League I" })
  })
  it("includes all owned equipment in static order and excludes builder heroes", () => {
    expect(approvalHeroText(player, emojis)).toBe("<:barbarian_king:123><:gold_20:123> | <:barbarian_puppet:123><:gold_18:123><:rage_vial:123><:blue_4:123>\n")
    expect(approvalHeroText({ ...player, heroes: [] }, emojis)).toBe("None")
    expect(approvalHeroText({ ...player, heroEquipment: [] }, new Map())).toBe("\n")
  })
  it("keeps absent account/clan values empty and follows canonical emoji normalization", () => {
    const values = approvalBuiltinValues({ ticket: { number: 1, status: "open", channelId: "123", applicantUserId: null },
      applicantName: "", guild: { name: "G", memberCount: 0 }, player: undefined, clan: undefined, leaderUserId: undefined, emojis })
    for (const key of ticketApprovalTokens.filter(token => token.startsWith("account_") || token.startsWith("clan_"))) expect(values[key]).toBe("")
    expect(values.user_mention).toBe(""); expect(values.server_member_count).toBe("0")
    expect(approvalEmojiName(" Électro---Boots ")).toBe("electro_boots")
    expect(approvalEmojiName("🌍")).toBe("ck_emoji")
    expect(approvalEmojiName("x".repeat(80))).toHaveLength(32)
  })
})
