import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { ProxyCapitalRaidSeasonsResponse } from "./proxy.js"

describe("official capital raid sides", () => {
  it("preserves defender identity on attacks and attacker identity on defenses", () => {
    const identity = { tag: "#P0Y", name: "Raid clan", level: 19, badgeUrls: { small: "small", medium: "medium", large: "large" } }
    const log = { attackCount: 3, districtCount: 1, districtsDestroyed: 1, districts: [{
      id: 70000000, name: "Capital Peak", districtHallLevel: 8, destructionPercent: 100, stars: 0, attackCount: 3, totalLooted: 10751,
      attacks: [{ attacker: { tag: "#Q0Y", name: "Player" }, destructionPercent: 100, stars: 3 }],
    }] }
    const payload = { items: [{ state: "ended", startTime: "20230526T070000.000Z", endTime: "20230529T070000.000Z", capitalTotalLoot: 572136,
      raidsCompleted: 10, totalAttacks: 213, enemyDistrictsDestroyed: 68, offensiveReward: 147, defensiveReward: 300, members: [],
      attackLog: [{ defender: identity, ...log }], defenseLog: [{ attacker: identity, ...log }],
    }] }
    const result = Schema.decodeUnknownSync(ProxyCapitalRaidSeasonsResponse)(payload)
    expect(result.items[0]?.attackLog[0]?.defender).toEqual(identity)
    expect(result.items[0]?.defenseLog[0]?.attacker).toEqual(identity)
    const { attacks: _attacks, ...untouched } = log.districts[0]!
    expect(() => Schema.decodeUnknownSync(ProxyCapitalRaidSeasonsResponse)({ items: [{ ...payload.items[0], attackLog: [{ defender: identity, ...log, districts: [untouched] }] }] })).not.toThrow()
    const { members: _members, ...olderSeason } = payload.items[0]!
    expect(() => Schema.decodeUnknownSync(ProxyCapitalRaidSeasonsResponse)({ items: [olderSeason] })).not.toThrow()
    expect(() => Schema.decodeUnknownSync(ProxyCapitalRaidSeasonsResponse)({ items: [{ ...payload.items[0], defenseLog: [{ defender: identity, ...log }] }] })).toThrow()
  })
})
