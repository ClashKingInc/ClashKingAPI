import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import {
  attackTrophies,
  legendDefenseTrophies,
  queryArmySearch,
  queryHitRateHistory,
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
  army_hash: "ab".repeat(32), share_code: "u1x1" }

describe("league analytics calculations", () => {
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
      { ...battle, direction: "attack", stars: 3 },
      { ...battle, direction: "defense", stars: 2 },
      { ...battle, direction: "defense", battle_time: "2026-09-07T07:00:00Z", stars: 1, destruction_percentage: 91 },
    ]], []))
    expect(complete).not.toHaveProperty("automaticDefensesDerived")
    expect(complete.defenses).toEqual([expect.objectContaining({ trophies: 9 }), expect.objectContaining({ trophies: 25 }),
      { trophies: 17, automatic: true }, { trophies: 17, automatic: true }])
    const incomplete = await run(queryRankedBattlelog("#2", "1788739200"), sql([[roster], [
      { ...battle, direction: "defense", stars: 2 },
    ]], []))
    expect(incomplete.defenses).toHaveLength(1)
  })

  it("reads only the finalized daily/season hit-rate table", async () => {
    const calls: Array<{ query: string; params: ReadonlyArray<unknown> }> = []
    const result = await run(queryHitRateHistory(new URLSearchParams("mode=legend&time%5Bafter%5D=2026-09-01&time%5Bbefore%5D=2026-09-08")), sql([[
      { period_kind: "legend_day", period_start: "2026-09-07T05:00:00Z", league_tier_id: 105000034, town_hall: 18,
        attacks: 10, zero: 1, one: 2, two: 3, three: 4 },
    ]], calls))
    expect(calls[0]?.query).toContain("FROM league_hitrate_stats")
    expect(calls[0]?.query).not.toContain("battles_ranked")
    expect(result.items[0]).toEqual({ mode: "legend", day: "2026-09-07", league: expect.objectContaining({ id: 105000034 }),
      townHallLevel: 18, attacks: 10, starCounts: { zero: 1, one: 2, two: 3, three: 4 } })
  })

  it("reads compact player history only from farming battles", async () => {
    const calls: Array<{ query: string; params: ReadonlyArray<unknown> }> = []
    const result = await run(queryPlayerBattlelogHistory("#2", new URLSearchParams(
      "time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-07",
    ), new Date("2026-09-08T00:00:00Z")), sql([[
      { battle_time: "2026-09-07T09:00:00Z", stars: 3, destruction_percentage: 100,
        duration_seconds: 90, looted_resources: { gold: 10 }, share_code: "u1x1" },
    ]], calls))
    expect(calls[0]?.query).toContain("FROM battles_farming")
    expect(calls[0]?.query).not.toContain("battles_ranked")
    expect(calls[0]?.query).not.toContain("UNION")
    expect(result.items).toEqual([expect.objectContaining({ battleTime: "2026-09-07T09:00:00.000Z", stars: 3 })])
  })

  it("discovers immutable family anchors from daily family statistics", async () => {
    const calls: Array<{ query: string; params: ReadonlyArray<unknown> }> = []
    const result = await run(queryArmySearch(new URLSearchParams("time%5Bafter%5D=2026-09-08&time%5Bbefore%5D=2026-09-08&heroIds=28000000&equipmentIds=90000000&minimumPlayers=2"), new Date("2026-09-08T12:00:00Z")), sql([[
      { army_hash: "ab".repeat(32), family_name: "Hydra", representative_share_code: "u1x1", attacks: 10, players: 3,
        zero: 1, one: 2, two: 3, three: 4, destruction: 850, duration: 1200 },
    ]], calls))
    expect(calls[0]?.query).toContain("FROM army_family_daily_stats")
    expect(calls[0]?.query).toContain("JOIN army_families")
    expect(calls[0]?.query).toContain("c.heroes @>")
    expect(result.items[0]).toEqual({ armyHash: "ab".repeat(32), name: "Hydra", shareCode: "u1x1", attacks: 10, players: 3,
      starCounts: { zero: 1, one: 2, two: 3, three: 4 }, averageDuration: 120, averageDestruction: 85 })
  })

  it("refines multi-day family players with exact distinct battle authors", async () => {
    const calls: Array<{ query: string; params: ReadonlyArray<unknown> }> = []
    const result = await run(queryArmySearch(new URLSearchParams(
      "time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-08&minimumPlayers=2",
    )), sql([[
      { army_hash: "ab".repeat(32), family_name: "Hydra", representative_share_code: "u1x1", attacks: 10,
        players: 4, zero: 1, one: 2, two: 3, three: 4, destruction: 850, duration: 1200 },
    ], [{ army_hash: "ab".repeat(32), players: 2 }]], calls))
    expect(calls[1]?.query).toContain("count(DISTINCT b.player_tag)")
    expect(calls[1]?.query).toContain("b.battle_mode='legend'")
    expect(result.items[0]?.players).toBe(2)
  })
})
