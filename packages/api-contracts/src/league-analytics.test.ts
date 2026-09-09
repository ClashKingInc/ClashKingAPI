import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  ArmyHash,
  ArmySearchEndpoint,
  LeagueTierStatisticsEndpoint,
  LegendBattlelogResponse,
  LegendDaysEndpoint,
  PlayerBattlelogHistoryEndpoint,
  RankedBattlelogResponse,
  RankedGroupEndpoint,
} from "./league-analytics.js"

const realBattle = { time: "2026-09-07T06:00:00Z", townHallLevel: 18,
  opponent: { tag: "#P0Y", name: "Unknown", townHallLevel: 18 }, stars: 3, destructionPercentage: 100,
  duration: 120, lootedResources: { gold: 1, elixir: 2, darkElixir: 3 }, shareCode: "u1x1",
  armyHash: "ab".repeat(32), trophies: 40 }

describe("league analytics contracts", () => {
  it("accepts only lowercase exact army hashes", () => {
    expect(Schema.decodeUnknownSync(ArmyHash)("ab".repeat(32))).toBe("ab".repeat(32))
    expect(() => Schema.decodeUnknownSync(ArmyHash)("AB".repeat(32))).toThrow()
  })

  it("publishes the finalized GET paths", () => {
    expect([PlayerBattlelogHistoryEndpoint, RankedGroupEndpoint, ArmySearchEndpoint, LeagueTierStatisticsEndpoint, LegendDaysEndpoint]
      .map((endpoint) => [endpoint.method, endpoint.path])).toEqual([
      ["GET", "/v2/player/:playerTag/battlelog/history"],
      ["GET", "/v2/ranked/:seasonId/groups/:leagueGroupId"],
      ["GET", "/v2/stats/armies"],
      ["GET", "/v2/stats/league/tournaments/:seasonId/tiers/:leagueTierId"],
      ["GET", "/v2/stats/legend/days"],
    ])
  })

  it("keeps Ranked and Legend battlelog responses free of collection state", () => {
    const ranked = Schema.decodeUnknownSync(RankedBattlelogResponse)({ tag: "#P0Y", seasonId: "1788739200", leagueGroupId: "#P",
      league: { id: 105000034, name: "Legend League" }, maxBattles: 4, registeredAttacks: 1, registeredDefenses: 1,
      attackTrophies: 40, defenseTrophies: 20, trophies: 60, attacks: [realBattle], defenses: [{ trophies: 20, automatic: true }] })
    expect(ranked).not.toHaveProperty("attacksComplete")
    expect(ranked).not.toHaveProperty("lootedResources")
    const legend = Schema.decodeUnknownSync(LegendBattlelogResponse)({ tag: "#P0Y", day: "2026-09-07",
      attackTrophies: 40, defenseTrophies: -20, trophies: 20, attacks: [realBattle], defenses: [] })
    expect(legend).not.toHaveProperty("startsAt")
    expect(legend).not.toHaveProperty("closed")
  })

  it("does not expose Town Hall, mode, cursor, or raw item query aliases for families", () => {
    const query = Schema.decodeUnknownSync(ArmySearchEndpoint.query)({ heroIds: "28000000", equipmentIds: "90000000",
      minimumAttacks: 10, minimumPlayers: 2, minimumTripleRate: 0.4, sort: "usage", direction: "desc", limit: 10 })
    expect(query).not.toHaveProperty("townHalls")
    expect(query).not.toHaveProperty("mode")
    expect(query).not.toHaveProperty("cursor")
  })
})
