import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { LinksResponse } from "./expo-links.js"
import { PlayerTimersResponse } from "./expo-player.js"
import { ProxyBattlelogResponse } from "./proxy.js"
import { WarResponse } from "./expo-war.js"

const rejects = (schema: Parameters<typeof Schema.decodeUnknownSync>[0], value: unknown) =>
  expect(() => Schema.decodeUnknownSync(schema)(value)).toThrow()

describe("Expo contract response decoding", () => {
  it("rejects malformed linked-account fields", () => {
    rejects(LinksResponse, {
      items: [{ user_id: "1", player_tag: "#P", order_index: 0, is_verified: "yes", hidden: false, added_at: "2026-09-03T00:00:00Z", last_login: null }],
    })
  })

  it("rejects malformed nested timer and proxy battlelog fields", () => {
    rejects(PlayerTimersResponse, { items: [{ type: "war", expiresAt: "2026-09-03T00:00:00Z", clans: [17] }] })
    rejects(ProxyBattlelogResponse, {
      items: [{ battleType: "ranked", attack: true, opponentPlayerTag: "#D", opponentName: "Defender", opponentTownHallLevel: 16, stars: 3, destructionPercentage: 100, lootedResources: [{ name: "gold", amount: "1000" }], armyShareCode: "", battleTimestamp: "20260903T000000.000Z", battleTime: 120 }],
    })
  })

  it("rejects malformed nested war attacks", () => {
    const side = {
      tag: "#C", name: "Clan", badgeUrls: { small: "s", medium: "m", large: "l" },
      clanLevel: 1, attacks: 1, stars: 3, destructionPercentage: 100,
      members: [{ tag: "#P", name: "Player", townhallLevel: 16, mapPosition: 1, attacks: [{ attackerTag: "#P", defenderTag: "#D", stars: "three", destructionPercentage: 100, order: 1, duration: 120 }] }],
    }
    rejects(WarResponse, { state: "warEnded", teamSize: 1, preparationStartTime: "20260902T000000.000Z", endTime: "20260903T000000.000Z", clan: side, opponent: { ...side, tag: "#O" } })
  })
})
