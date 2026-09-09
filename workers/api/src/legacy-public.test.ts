import { legacyPublicEndpoints, LegacyWar } from "@clashking/api-contracts"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { fixLegacyTag, legacyWar, normalizeLegacySeason } from "./legacy-public.js"
import type { ArchivedWar } from "./war-archive-model.js"

const war: ArchivedWar = {
  type: "cwl", state: "ended", teamSize: 1, attacksPerMember: 1, warTag: "#WAR",
  preparationStartTime: "2026-06-01T00:00:00Z", startTime: "2026-06-02T00:00:00Z", endTime: "2026-06-03T00:00:00Z",
  clan: { tag: "#A", name: "Alpha", badgeToken: "badge.png", clanLevel: 20, attacks: 1, stars: 3, destructionPercentage: 100,
    members: [{ tag: "#P", name: "Player", townhallLevel: 17, mapPosition: 1, attacks: [{ defenderTag: "#Q", stars: 3, destructionPercentage: 100, order: 1, duration: 120 }] }] },
  opponent: { tag: "#B", name: "Beta", clanLevel: 19, attacks: 0, stars: 0, destructionPercentage: 0,
    members: [{ tag: "#Q", name: "Opponent", townhallLevel: 17, mapPosition: 1, attacks: [] }] },
}

describe("legacy public compatibility", () => {
  it("advertises exactly the seven retained pre-rewrite routes", () => {
    expect(Object.values(legacyPublicEndpoints).map(({ method, path }) => `${method} ${path}`).sort()).toEqual([
      "GET /clan/:clan_tag/join-leave",
      "GET /cwl/:clan_tag/:season",
      "GET /cwl/:clan_tag/group",
      "GET /player/:player_tag/join-leave",
      "GET /player/:player_tag/warhits",
      "GET /war/:clan_tag/previous",
      "GET /war/:clan_tag/previous/:end_time",
    ])
  })

  it("preserves legacy war names, timestamps, orientation, and optional fields", () => {
    const result = Schema.decodeUnknownSync(LegacyWar)(legacyWar(war, true))
    expect(result).toMatchObject({ state: "warEnded", tag: "#WAR", clan: { tag: "#A" }, opponent: { tag: "#B" } })
    expect(result.startTime).toBe("20260602T000000.000Z")
    expect(result.warStartTime).toBe(result.startTime)
    expect(result.attacksPerMember).toBeUndefined()
    expect(result.type).toBeUndefined()
    expect(result.clan.members?.[0]).toMatchObject({ opponentAttacks: 0, attacks: [{ attackerTag: "#P" }] })
  })

  it("retains legacy tag and season normalization", () => {
    expect(fixLegacyTag("%23goO-2")).toBe("#G002")
    expect(normalizeLegacySeason("2026-05-17")).toBe("2026-05")
    expect(normalizeLegacySeason("2026-06")).toBe("2026-06")
    expect(normalizeLegacySeason("2026-06-14")).toBe("2026-06-14")
  })
})
