import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import {
  queryArmyDetail,
  queryArmySearch,
  queryArmyTimeline,
  queryHitRateHistory,
  queryLegendBattlelog,
  queryLegendDays,
  queryPlayerBattlelogHistory,
  queryRankedBattlelog,
  queryRankedGroup,
  queryTierStatistics,
} from "../../src/league-analytics.js"

const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const layer = databaseLayer({ HYPERDRIVE: { connectionString: url } } as WorkerBindings)
const anchor = "ab".repeat(32)
const memberHash = "cd".repeat(32)
const season = Math.floor(Date.parse("2026-09-07T05:00:00.000Z") / 1000)

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.scoped))

describe("league analytics against authoritative Goose migrations 008 and 009", () => {
  it("keeps exact battle modes separate and reads only the permanent family and league relations", async () => {
    await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO army_compositions
        (army_hash,normalized_share_code,main_troops,heroes,equipment)
        VALUES
        (decode(${anchor},'hex'),'u1x10','[{"id":1,"quantity":10}]'::jsonb,ARRAY[28000000],
          '[{"equipmentId":90000000,"heroId":28000000}]'::jsonb),
        (decode(${memberHash},'hex'),'u1x9-2x1','[{"id":1,"quantity":9},{"id":2,"quantity":1}]'::jsonb,
          ARRAY[28000000],'[{"equipmentId":90000000,"heroId":28000000}]'::jsonb)`
      yield* sql`INSERT INTO army_families
        (anchor_army_hash,representative_share_code,family_name,source)
        VALUES (decode(${anchor},'hex'),'u1x10','Fallback ab-ab','fallback')`
      yield* sql`INSERT INTO army_family_members
        (army_hash,anchor_army_hash,troop_housing_similarity,spell_capacity_similarity,heroes_exact,
          equipment_similarity,equipment_difference_count,matching_version)
        VALUES (decode(${memberHash},'hex'),decode(${anchor},'hex'),0.9,1,true,1,0,'v1')`
      yield* sql`INSERT INTO ranked_league_group_members
        (season_id,group_tag,league_tier_id,player_tag,player_name,placement,league_trophies,
          attack_win_count,attack_loss_count,defense_win_count,defense_loss_count,town_hall,
          maximum_battle_count,attack_star_count,defense_star_count)
        VALUES (${season},'#P',105000034,'#2','Player',1,100,1,0,1,1,18,4,3,3)`
      yield* sql`INSERT INTO battles_ranked
        (player_tag,opponent_tag,battle_time,battle_mode,direction,player_town_hall,opponent_town_hall,
          stars,destruction_percentage,duration_seconds,looted_resources,share_code,army_hash)
        VALUES
        ('#2','#P','2026-09-07T06:00:00Z','ranked','attack',18,18,3,100,120,
          '{"gold":10,"elixir":20,"darkElixir":3}'::jsonb,'u1x10',decode(${anchor},'hex')),
        ('#2','#P','2026-09-07T07:00:00Z','ranked','defense',18,18,2,97,110,
          '{}'::jsonb,'u1x10',decode(${anchor},'hex')),
        ('#2','#P','2026-09-07T08:00:00Z','legend','attack',18,18,1,80,100,
          '{}'::jsonb,'u1x9-2x1',decode(${memberHash},'hex')),
        ('#2','#P','2026-09-08T08:00:00Z','legend','attack',18,18,2,90,110,
          '{}'::jsonb,'u1x10',decode(${anchor},'hex'))`
      yield* sql`INSERT INTO battles_farming
        (player_tag,battle_time,stars,destruction_percentage,duration_seconds,looted_resources,share_code)
        VALUES ('#2','2026-09-07T09:00:00Z',3,100,90,
          '{"gold":30,"elixir":40,"darkElixir":5}'::jsonb,'u1x10')`
      yield* sql`INSERT INTO army_family_daily_stats
        (anchor_army_hash,day,attack_count,distinct_player_count,zero_star_count,one_star_count,
          two_star_count,three_star_count,destruction_percentage_sum,duration_seconds_sum)
        VALUES
          (decode(${anchor},'hex'),'2026-09-07',10,3,1,2,3,4,850,1200),
          (decode(${anchor},'hex'),'2026-09-08',5,2,0,1,2,2,450,550)`
      yield* sql`INSERT INTO league_hitrate_stats
        (period_kind,period_start,league_tier_id,town_hall,attack_count,zero_star_count,one_star_count,two_star_count,three_star_count)
        VALUES ('ranked_season',to_timestamp(${season}),105000034,18,10,1,2,3,4)`
      yield* sql`INSERT INTO ranked_league_tier_stats
        (season_id,league_tier_id,group_count,distinct_player_count,participating_player_count,
          trophy_p10,trophy_p25,trophy_p50,trophy_p75,trophy_p90,town_halls,
          average_group_first_last_trophy_range,average_first_second_trophy_gap)
        VALUES (${season},105000034,1,10,8,10,25,50,75,90,
          '[{"level":18,"count":10}]'::jsonb,80,5)`
      yield* sql`INSERT INTO legend_daily_stats
        (day,league_tier_id,town_hall,attack_count,distinct_player_count,perfect_320_player_count,
          zero_star_count,one_star_count,two_star_count,three_star_count,destruction_percentage_sum,
          duration_seconds_sum,hero_stats,pet_stats,equipment_stats,pet_hero_assignments)
        VALUES ('2026-09-07',105000034,18,4,1,0,0,1,1,2,350,440,
          '[{"id":28000000,"uses":4,"triples":2},{"id":99999999,"uses":1,"triples":0}]'::jsonb,
          '[]'::jsonb,'[]'::jsonb,'[]'::jsonb)`
    }))

    const detail = await run(queryRankedBattlelog("#2", String(season)))
    expect(detail).toMatchObject({ tag: "#2", registeredAttacks: 1, registeredDefenses: 2,
      attackTrophies: 40, attacks: [expect.objectContaining({ opponent: { tag: "#P", name: "Unknown", townHallLevel: 18 } })] })
    expect(detail.attacks).toHaveLength(1)
    expect(detail.defenses).toHaveLength(1)
    const legend = await run(queryLegendBattlelog("#2", "2026-09-07", new Date("2026-09-07T12:00:00Z")))
    expect(legend.attacks).toEqual([expect.objectContaining({ time: "2026-09-07T08:00:00.000Z" })])
    expect(legend.defenses).toEqual([])
    expect((await run(queryPlayerBattlelogHistory("#2", new URLSearchParams(
      "time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-07",
    )))).items).toEqual([expect.objectContaining({ battleTime: "2026-09-07T09:00:00.000Z", stars: 3 })])

    const group = await run(queryRankedGroup(String(season), "#P"))
    expect(group.members[0]).toMatchObject({ tag: "#2", attackWins: 1, defenseLosses: 1 })

    const family = await run(queryArmySearch(new URLSearchParams(
      "time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-07&heroIds=28000000&equipmentIds=90000000&minimumPlayers=2",
    )))
    expect(family.items).toEqual([expect.objectContaining({ armyHash: anchor, attacks: 10, players: 3 })])
    const multiDay = await run(queryArmySearch(new URLSearchParams(
      "time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-08&minimumPlayers=1",
    )))
    expect(multiDay.items).toEqual([expect.objectContaining({ armyHash: anchor, attacks: 15, players: 1 })])
    expect(await run(queryArmyDetail(memberHash, new URLSearchParams(
      "time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-07",
    )))).toMatchObject({ armyHash: anchor, name: "Fallback ab-ab" })
    expect((await run(queryArmyTimeline(memberHash, new URLSearchParams(
      "time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-07",
    )))).items).toHaveLength(1)

    const hitRates = await run(queryHitRateHistory(new URLSearchParams(
      "mode=ranked&time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-07",
    )))
    expect(hitRates.items[0]).toMatchObject({ mode: "ranked", attacks: 10, starCounts: { zero: 1, one: 2, two: 3, three: 4 } })
    const legendDays = await run(queryLegendDays(new URLSearchParams(
      "time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-07&leagueTierId=105000034",
    )))
    expect(legendDays.items[0]).toMatchObject({ attacks: 4, heroes: [{ id: 28000000, uses: 4, triples: 2 }] })
    expect(await run(queryTierStatistics(String(season), "105000034"))).toMatchObject({
      seasonId: String(season), groupCount: 1, playerCount: 10, participatingPlayers: 8,
      townHallDistribution: [{ level: 18, count: 10 }],
    })
  })
})
