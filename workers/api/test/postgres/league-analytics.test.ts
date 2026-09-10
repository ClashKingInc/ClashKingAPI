import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { queryArmyDetail, queryArmySearch, queryArmyTimeline, queryLegendBattlelog, queryPlayerBattlelogHistory, queryRankedBattlelog, queryLegendDays } from "../../src/league-analytics.js"
import { queryAdminFamilies, queryAdminFamilyMembers } from "../../src/army-family-analytics.js"
import { queryRankedStats } from "../../src/stats.js"

const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use schema-owned disposable Timescale")
const layer = databaseLayer({ HYPERDRIVE: { connectionString: url } } as WorkerBindings)
const run = <A,E>(effect: Effect.Effect<A,E,SqlClient.SqlClient>) => Effect.runPromise(effect.pipe(Effect.provide(layer),Effect.scoped))
const range = (before = "2026-09-08") => new URLSearchParams({ "time[after]": "2026-09-07", "time[before]": before })
let familyId: string

describe.sequential("code families against authoritative migrations through 015", () => {
  it("creates code-only fixtures with no composition dictionary", async () => {
    familyId = await run(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{ family_id: string }>`INSERT INTO army_families(representative_share_code,name,hero_ids,equipment_ids)
        VALUES ('u1x0',NULL,ARRAY[28000000],ARRAY[90000000]) RETURNING family_id::text`
      const id = rows[0]!.family_id
      yield* sql`INSERT INTO army_family_members(share_code,family_id,troop_similarity,spell_similarity,equipment_similarity)
        VALUES ('u1x0',${id}::bigint,1,1,1),('u2x0',${id}::bigint,.9,.9,.75)`
      yield* sql`INSERT INTO army_families(representative_share_code,name) VALUES ('u3x0','Inactive family')`
      yield* sql`INSERT INTO ranked_league_group_members(season_id,group_tag,league_tier_id,player_tag,player_name,placement,league_trophies,
        attack_win_count,attack_loss_count,defense_win_count,defense_loss_count,town_hall,maximum_battle_count,attack_star_count,defense_star_count)
        VALUES (1788757200,'#P',105000033,'#2','Player',1,100,1,0,1,0,18,4,3,0)`
      yield* sql`INSERT INTO battles_ranked(player_tag,opponent_tag,battle_time,battle_mode,direction,player_town_hall,opponent_town_hall,
        stars,destruction_percentage,duration_seconds,looted_resources,share_code) VALUES
        ('#2','#P','2026-09-07T05:09:59.999Z','legend','attack',18,17,3,100,100,'{"gold":7}',NULL),
        ('#2','#P','2026-09-07T05:10:00Z','legend','attack',18,17,3,100,100,'{"gold":17,"elixir":5,"darkElixir":2}','u1x0'),
        ('#2','#P','2026-09-07T06:00:00Z','legend','attack',18,18,2,90,NULL,'{}','u2x0'),
        ('#Q','#P','2026-09-07T07:00:00Z','legend','attack',17,18,1,50,60,'{}','u1x0'),
        ('#2','#P','2026-09-07T08:00:00Z','legend','defense',18,18,0,0,1,NULL,'u1x0'),
        ('#2','#P','2026-09-07T09:00:00Z','ranked','attack',18,18,3,100,90,'{"gold":50}','u1x0'),
        ('#2','#P','2026-09-07T10:00:00Z','ranked','defense',18,18,0,0,1,NULL,'u1x0'),
        ('#2','#P','2026-09-08T05:10:00Z','legend','attack',18,18,3,100,120,'{}','u2x0'),
        ('#2','#P','2026-09-08T06:00:00Z','legend','attack',18,18,3,100,NULL,'{}',NULL),
        ('#2','#P','2026-09-14T05:00:00Z','ranked','attack',18,18,0,0,1,'{}','u1x0')`
      yield* sql`INSERT INTO battles_farming(player_tag,battle_time,stars,destruction_percentage,duration_seconds,looted_resources,share_code)
        VALUES ('#2','2026-09-07T11:00:00Z',2,90,120,'{"gold":30}','u1x0')`
      yield* sql`INSERT INTO army_family_daily_stats_v2(family_id,day,attack_count,distinct_player_count,zero_star_count,one_star_count,two_star_count,three_star_count,destruction_percentage_sum,duration_seconds_sum,duration_count)
        VALUES (${id}::bigint,'2026-09-07',3,2,0,1,1,1,240,160,2),(${id}::bigint,'2026-09-08',1,1,0,0,0,1,100,120,1)`
      yield* sql`INSERT INTO legend_daily_stats_v2(day,attack_count,distinct_player_count,perfect_320_player_count,zero_star_count,one_star_count,two_star_count,three_star_count,destruction_percentage_sum,duration_seconds_sum,duration_count)
        VALUES ('2026-09-07',3,2,0,0,1,1,1,240,160,2),('2026-09-08',2,1,0,0,0,0,2,200,120,1),('2026-09-09',0,0,0,0,0,0,0,0,0,0)`
      return id
    }))
  })
  it("unions distinct players across variants/days with correct duration and global denominator", async () => {
    const q=range(); q.set("minimumPlayers","2");q.set("limit","1")
    const rows=await run(queryArmySearch(q))
    expect(rows.items[0]).toMatchObject({ familyId,name:null,attacks:4,players:2,averageDuration:280/3,totalLegendAttacks:5 })
    expect(rows.items[0]).not.toHaveProperty("armyHash")
    const detail=range();detail.set("armyLink","https://link.clashofclans.com/?action=CopyArmy&army=u1x0-1x0")
    expect(await run(queryArmyDetail(detail))).toEqual(rows.items[0])
    expect((await run(queryArmyTimeline(detail))).items.map(x=>x.players)).toEqual([2,1])
    const daily=await run(queryLegendDays(range("2026-09-07")))
    expect(daily.items[0]).toMatchObject({ attacks:3,players:2,averageDuration:80 })
    expect(daily.items[0]).not.toHaveProperty("townHallLevel")
  })
  it("keeps inactive families searchable and paginates exact members", async () => {
    const q=range();q.set("search","Inactive")
    const found=await run(queryAdminFamilies(q))
    expect(found.items[0]).toMatchObject({ name:"Inactive family",statistics:{attacks:0} })
    const members=range();members.set("limit","1");members.set("includeStats","true")
    const first=await run(queryAdminFamilyMembers(familyId,members))
    expect(first.hasMore).toBe(true)
    expect(first.items[0]).toMatchObject({ shareCode:"u1x0",statistics:{attacks:2,players:2,averageDuration:80} })
    members.set("page","2")
    expect((await run(queryAdminFamilyMembers(familyId,members))).items[0]?.shareCode).toBe("u2x0")
  })
  it("separates loot-free detail projections from all-mode compact attack history", async () => {
    const history=await run(queryPlayerBattlelogHistory("#2",range("2026-09-07")))
    expect(history.items.map(x=>x.battleMode)).toEqual(["farming","ranked","legend","legend","legend"])
    expect(history.items[1]?.lootedResources.gold).toBe(50)
    expect(history.items[3]?.lootedResources.gold).toBe(17)
    const legend=await run(queryLegendBattlelog("#2","2026-09-07",new Date("2026-09-07T12:00:00Z")))
    expect(legend.attacks).toHaveLength(2)
    for(const item of [...legend.attacks,...legend.defenses]) expect(item).not.toHaveProperty("lootedResources")
    const ranked=await run(queryRankedBattlelog("#2","1788757200"))
    expect(ranked.attacks).toHaveLength(1)
    for(const item of [...ranked.attacks,...ranked.defenses]) expect(item).not.toHaveProperty("lootedResources")
    const stats=await run(queryRankedStats({ dates:{start_date:"2026-09-07",end_date:"2026-09-14"},townhall_level:18,ranked_league_tier_id:105000033 }))
    expect(stats.metrics).toMatchObject({sampleSize:1,threeStarRate:1})
  })
  it("returns unavailable range players for a late row, missing day, or deleted raw history", async () => {
    await run(Effect.gen(function*(){ const sql=yield* SqlClient.SqlClient
      yield* sql`INSERT INTO battles_ranked(player_tag,opponent_tag,battle_time,battle_mode,direction,player_town_hall,opponent_town_hall,stars,destruction_percentage,looted_resources,share_code)
        VALUES ('#2','#P','2026-09-07T12:00:00Z','legend','attack',18,18,3,100,'{}','u1x0')`
    }))
    expect((await run(queryArmySearch(range()))).items[0]?.players).toBeNull()
    const filtered=range();filtered.set("minimumPlayers","1")
    await expect(run(queryArmySearch(filtered))).rejects.toMatchObject({_tag:"InvalidRequest"})
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient;yield* sql`DELETE FROM battles_ranked WHERE battle_time='2026-09-07T12:00:00Z'`}))
    expect((await run(queryArmySearch(range()))).items[0]?.players).toBe(2)
    expect((await run(queryArmySearch(range("2026-09-10")))).items[0]?.players).toBeNull()
    await run(Effect.gen(function*(){const sql=yield* SqlClient.SqlClient;yield* sql`DELETE FROM battles_ranked WHERE battle_mode='legend' AND direction='attack'`}))
    expect((await run(queryArmySearch(range()))).items[0]?.players).toBeNull()
    expect((await run(queryArmyTimeline(new URLSearchParams({...Object.fromEntries(range()),armyLink:"u1x0"})))).items[0]?.players).toBe(2)
  })
})
