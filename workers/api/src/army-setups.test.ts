import { describe, expect, it } from "vitest"
import { parseSetupQuery, setupStatistics, setupComparisons, setupBenchmarks } from "./army-setups.js"
import { parseParticipationQuery, participationResponse } from "./cwl-participation.js"

describe("daily army observations", () => {
  it("supports only the agreed cohorts and useful sorts", () => {
    expect(parseSetupQuery(new URLSearchParams())).toMatchObject({ leagueTierId: 105000036, rankLimit: null, sort: "usage" })
    expect(parseSetupQuery(new URLSearchParams("rankLimit=200&sort=tripleRate"))).toMatchObject({ cohort: "top_200" })
    for (const input of ["rankLimit=100", "sort=averageDuration", "minimumPlayers=3", "limit=0", "rankLimit=200&rankLimit=1000", "leagueTierId=105000034", "variantKey=x", "groupKey=x&variantKey=y"])
      expect(() => parseSetupQuery(new URLSearchParams(input))).toThrow()
    expect(() => parseSetupQuery(new URLSearchParams(), new Date(), true)).toThrow()
  })
  it("uses all attacks as denominator and never returns generated names or player counts", () => {
    const result = setupStatistics({ day: "2026-09-20", group_key: "[4000080]", variant_key: "", core_troops: [4000080],
      conditions: [], representative_share_code: "u10x80", attack_count: 80, zero_star_count: 0, one_star_count: 0,
      two_star_count: 20, three_star_count: 60, destruction_percentage_sum: 7800, observed_days: 1,
      siege_usage_days: [[{ id: 4000051, attacks: 40 }, { id: 4000052, attacks: 20 }],
        [{ id: 4000051, attacks: 10 }, { id: 4000053, attacks: 5 }, { id: 4000054, attacks: 1 }]] }, 100)
    expect(result).toMatchObject({ usageRate: .8, threeStarRate: .75, observedDays: 1 })
    expect(result.sieges).toEqual([
      { id: 4000051, attacks: 50, usageRate: .625 },
      { id: 4000052, attacks: 20, usageRate: .25 },
      { id: 4000053, attacks: 5, usageRate: .0625 },
    ])
    expect(result).not.toHaveProperty("name")
    expect(result).not.toHaveProperty("players")
  })
  it("compares usage against each whole cohort and benchmarks league hit rates", () => {
    const row = { day: "2026-09-20", group_key: "[1]", variant_key: "", core_troops: [1], conditions: [],
      representative_share_code: "u10x1", attack_count: 50, zero_star_count: 0, one_star_count: 0,
      two_star_count: 20, three_star_count: 30, destruction_percentage_sum: 4500, observed_days: 1 }
    const totals = [
      { day: "2026-09-20", cohort: "legend_i", attack_count: 100, three_star_count: 60, classified_army_attacks: 90 },
      { day: "2026-09-20", cohort: "top_1000", attack_count: 40, three_star_count: 28, classified_army_attacks: 35 },
      { day: "2026-09-20", cohort: "top_200", attack_count: 10, three_star_count: 8, classified_army_attacks: 9 },
    ]
    const comparisons = setupComparisons(row, [
      { group_key: "[1]", variant_key: "", cohort: "legend_i", attack_count: 50, three_star_count: 30 },
      { group_key: "[1]", variant_key: "", cohort: "top_1000", attack_count: 20, three_star_count: 14 },
    ], totals)
    expect(comparisons).toEqual([
      { rankLimit: null, attacks: 50, totalAttacks: 100, usageRate: .5, threeStarRate: .6 },
      { rankLimit: 1000, attacks: 20, totalAttacks: 40, usageRate: .5, threeStarRate: .7 },
      { rankLimit: 200, attacks: 0, totalAttacks: 10, usageRate: null, threeStarRate: null },
    ])
    expect(setupBenchmarks(totals)).toEqual([
      { rankLimit: null, points: [{ day: "2026-09-20", attacks: 100, threeStarRate: .6 }] },
      { rankLimit: 1000, points: [{ day: "2026-09-20", attacks: 40, threeStarRate: .7 }] },
      { rankLimit: 200, points: [{ day: "2026-09-20", attacks: 10, threeStarRate: .8 }] },
    ])
  })
})
describe("manual CWL participation contract", () => {
  it("uses one season and rejects the retired attack-level filters", () => {
    expect(parseParticipationQuery(new URLSearchParams())).toBeNull()
    expect(parseParticipationQuery(new URLSearchParams("season=2026-09"))).toBe("2026-09")
    for (const input of ["season=2026-13", "season=2026-09&season=2026-08", "seasons=2026-09", "equalTownHalls=false"])
      expect(() => parseParticipationQuery(new URLSearchParams(input))).toThrow()
  })
  it("derives season totals and keeps unavailable hit rates null", () => {
    const base = { season: "2026-09", cwl_league_id: 48000022, war_size: 15, group_count: 1,
      clan_count: 8, registered_player_count: 320, townhall_counts: [{ level: 18, count: 320 }],
      same_th_hitrates: null, finalized_wars: 28, archived_wars: 0, refreshed_at: "2026-09-22T00:00:00Z" }
    const result = participationResponse([base, { ...base, cwl_league_id: 48000021,
      same_th_hitrates: [{ level: 18, attacks: 100, three_stars: 70 }], archived_wars: 5 }], null,
    [{ season: "2026-09", clan_count: 16, registered_player_count: 640, group_count: 2 }])
    expect(result).toMatchObject({ season: "2026-09", clanCount: 16, registeredPlayerCount: 640, groupCount: 2 })
    expect(result.availableSeasons).toEqual(["2026-09"])
    expect(result.history).toEqual([{ season: "2026-09", clanCount: 16, registeredPlayerCount: 640, groupCount: 2 }])
    expect(result.items[0]?.sameTownHallHitRates).toBeNull()
    expect(result.items[1]?.sameTownHallHitRates?.[0]?.threeStarRate).toBe(.7)
    expect(participationResponse([], null)).toMatchObject({ season: null, items: [] })
  })
})
