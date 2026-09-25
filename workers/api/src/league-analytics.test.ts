import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import {
  attackTrophies,
  legendDefenseTrophies,
  queryArmySearch,
  queryHitRateHistory,
  queryLegendPlayerDailySeries,
  queryLegendPlayerSeason,
  queryLegendDays,
  queryPlayerLeagueHistory,
  queryPlayerBattlelogHistory,
  queryRankedBattlelog,
  rankedDefenseTrophies,
} from "./league-analytics.js"

const sql = (responses: ReadonlyArray<ReadonlyArray<unknown>>, calls: Array<{ query: string; params: ReadonlyArray<unknown> }>) => {
  let index = 0
  const query = (query: string, params: ReadonlyArray<unknown>) => { calls.push({ query, params }); return Effect.succeed(responses[index++] ?? []) }
  return Object.assign(query, { unsafe: query }) as unknown as SqlClient.SqlClient
}
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>, database: SqlClient.SqlClient) =>
  Effect.runPromise(effect.pipe(Effect.provideService(SqlClient.SqlClient, database)))
const roster = { season_id: 1788739200, group_tag: "#P", league_tier_id: 105000034, player_tag: "#2", player_name: "Player",
  town_hall: 18, maximum_battle_count: 4, attack_win_count: 1, attack_loss_count: 0, attack_star_count: 3,
  defense_win_count: 1, defense_loss_count: 1, defense_star_count: 3, league_trophies: 100, placement: 1 }
const battle = { battle_time: "2026-09-07T06:00:00Z", player_town_hall: 18, opponent_tag: "#P", opponent_name: null,
  opponent_town_hall: 18, destruction_percentage: 97, duration_seconds: 120, looted_resources: { gold: 1 },
  share_code: "u1x1", family_id: "1" }

describe("league analytics calculations", () => {
  it("queries additive Legend-day metadata for the top-100 cohort", async () => {
    const calls: Array<{ query: string; params: ReadonlyArray<unknown> }> = []
    const result = await run(queryLegendDays(new URLSearchParams("cohort=top_100"), new Date("2026-09-09T05:10:00Z")), sql([[
      { day: "2026-09-08", attacks: 1, players: 1, zero: 0, one: 0, two: 0, three: 1, destruction: 100, duration: 120,
        hero_stats: [], pet_stats: [], equipment_stats: [], pet_hero_assignments: [], troop_stats: [], spell_stats: [], siege_stats: [],
        equipment_pair_stats: [], pet_combo_stats: [] },
    ]], calls))
    expect(calls[0]?.query).toContain("daily.pet_combo_stats")
    expect(calls[0]?.params[2]).toBe("top_100")
    expect(result.items[0]).toMatchObject({ troops: [], spells: [], sieges: [], equipmentPairs: [], petCombos: [] })
  })

  it("returns all retained Legend finishes by default including v2 seasons", async () => {
    const calls: Array<{ query: string; params: ReadonlyArray<unknown> }> = []
    const finish = { league_tier_id: null, trophies: 5800, attack_wins: 100, defense_wins: 5, rank: 50 }
    const result = await run(queryPlayerLeagueHistory("#2", new URLSearchParams(), new Date("2026-09-21")), sql([[], [
      { ...finish, season: "2025-08", population: null }, { ...finish, season: "v2-2026-09-07T05:00:00Z", population: "11724" },
    ]], calls))
    expect(result.items.map(item => item.mode === "legend" ? item.season : item.seasonId)).toEqual(["v2-2026-09-07T05:00:00Z", "2025-08"])
    expect(result.items[0]).toMatchObject({ mode: "legend", population: 11724 })
    expect(result.items[1]).not.toHaveProperty("population")
    expect(calls[1]?.query).toContain("max(history.rank)")
    expect(calls[1]?.query).not.toContain("to_date")
  })
  it("summarizes the whole season from real battles and keeps repeated armies weighted", async () => {
    const result = await run(queryLegendPlayerSeason("#2", new Date("2026-09-21")), sql([[{season: "v2-2026-08-03T05:00:00Z"}], [
      { ...battle, direction: 1, stars: 3 }, { ...battle, direction: 1, stars: 2 },
      { ...battle, direction: 2, stars: 1, share_code: null },
    ]], []))
    expect(result.armyShareCodes).toEqual(["u1x1", "u1x1"])
    expect(result.stats).toMatchObject({ attacks: 2, defenses: 1, attackTriples: 1, defenseTriples: 0 })
    expect(result.seasonStart).toBe("2026-08-31T05:00:00.000Z")
    expect(result).not.toHaveProperty("playerTag")
  })
  it.each([[0, 10, 1], [1, 91, 15], [2, 98, 32], [3, 1, 40]])
  ("calculates %s-star %s%% as %s trophies", (stars, destruction, expected) => {
    expect(attackTrophies(stars, destruction)).toBe(expected)
  })

  it("uses complementary Ranked and negative Legend defense trophies", () => {
    expect(rankedDefenseTrophies(2, 97)).toBe(9)
    expect(legendDefenseTrophies(2, 97)).toBe(-31)
  })

  it("synthesizes Ranked automatic defenses only when all registered real defenses are stored", async () => {
    const complete = await run(queryRankedBattlelog("#2", "1788739200"), sql([[roster], [
      { ...battle, direction: 1, stars: 3 },
      { ...battle, direction: 2, stars: 2 },
      { ...battle, direction: 2, battle_time: "2026-09-07T07:00:00Z", stars: 1, destruction_percentage: 91 },
    ]], []))
    expect(complete).not.toHaveProperty("automaticDefensesDerived")
    expect(complete.attacks[0]).not.toHaveProperty("armyHash")
    expect(complete.defenses[0]).not.toHaveProperty("armyHash")
    expect(complete.defenses).toEqual([expect.objectContaining({ trophies: 9 }), expect.objectContaining({ trophies: 25 }),
      { trophies: 17, automatic: true }, { trophies: 17, automatic: true }])
    const incomplete = await run(queryRankedBattlelog("#2", "1788739200"), sql([[roster], [
      { ...battle, direction: 2, stars: 2 },
    ]], []))
    expect(incomplete.defenses).toHaveLength(1)
  })

  it("reads only the finalized daily/season hit-rate table", async () => {
    const calls: Array<{ query: string; params: ReadonlyArray<unknown> }> = []
    const result = await run(queryHitRateHistory(new URLSearchParams("mode=legend&time%5Bafter%5D=2026-09-01&time%5Bbefore%5D=2026-09-08")), sql([[
      { day: "2026-09-07", league_tier_id: 105000034, town_hall: 18,
        attacks: 10, zero: 1, one: 2, two: 3, three: 4 },
    ]], calls))
    expect(calls[0]?.query).toContain("FROM legend_daily_stats")
    expect(calls[0]?.query).toContain("cohort='legend_i'")
    expect(calls[0]?.query).not.toContain("battles_ranked")
    expect(result.items[0]).toEqual({ mode: "legend", day: "2026-09-07", attacks: 10, starCounts: { zero: 1, one: 2, two: 3, three: 4 } })
  })

  it("returns daily Legend trophies and ranking snapshots without inventing missing ranks", async () => {
    const calls: Array<{ query: string; params: ReadonlyArray<unknown> }> = []
    const result = await run(queryLegendPlayerDailySeries("#2", new URLSearchParams(
      "time%5Bafter%5D=2026-09-08&time%5Bbefore%5D=2026-09-08",
    ), new Date("2026-09-09T05:10:00Z")), sql([[
      { battle_time: "2026-09-07T06:00:00Z", direction: 2, stars: 2, destruction_percentage: 98 },
      { battle_time: "2026-09-08T06:00:00Z", direction: 1, stars: 3, destruction_percentage: 100 },
      { battle_time: "2026-09-08T07:00:00Z", direction: 2, stars: 1, destruction_percentage: 91 },
    ], []], calls))
    expect(calls).toHaveLength(2)
    expect(calls[0]?.query).toContain("FROM battles_ranked")
    expect(result).toEqual({ tag: "#2", items: [
      { day: "2026-09-08", attackTrophies: 40, defenseTrophies: -239, trophies: -199, closingTrophies: null, globalRank: null },
    ] })
  })

  it("reads compact general history across observed attack modes", async () => {
    const calls: Array<{ query: string; params: ReadonlyArray<unknown> }> = []
    const result = await run(queryPlayerBattlelogHistory("#2", new URLSearchParams(
      "time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-07",
    ), new Date("2026-09-08T00:00:00Z")), sql([[
      { battle_time: "2026-09-07T09:00:00Z", stars: 3, destruction_percentage: 100,
        duration_seconds: 90, looted_resources: { gold: 10 }, share_code: "u1x1" },
    ]], calls))
    expect(calls[0]?.query).toContain("FROM battles_farming")
    expect(calls[0]?.query).toContain("battles_ranked")
    expect(calls[0]?.query).toContain("UNION ALL")
    expect(result.items).toEqual([expect.objectContaining({ battleTime: "2026-09-07T09:00:00.000Z", stars: 3 })])
  })

  it("returns family identity, nullable names, and known-duration averages", async () => {
    const result = await run(queryArmySearch(new URLSearchParams("time%5Bafter%5D=2026-09-08&time%5Bbefore%5D=2026-09-08")), sql([[
      { items: [{ family_id: "9007199254740993", name: null, representative_share_code: "u1x1", hero_ids: [], equipment_ids: [], attacks: 10, players: 3,
        zero: 1, one: 2, two: 3, three: 4, destruction: 850, duration: 1200, total_legend_attacks: 100 }] },
    ]], []))
    expect(result.items[0]).toEqual({ familyId: "9007199254740993", name: null, shareCode: "u1x1", attacks: 10, players: 3,
      starCounts: { zero: 1, one: 2, two: 3, three: 4 }, averageDuration: 120, averageDestruction: 85, totalLegendAttacks: 100 })
  })

  it("rejects a player filter when retained population is unavailable", async () => {
    await expect(run(queryArmySearch(new URLSearchParams(
      "time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-08&minimumPlayers=2",
    )), sql([[{ complete: false, items: [] }]], []))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
})
