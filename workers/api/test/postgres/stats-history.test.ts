import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { queryCwlTownHalls, queryWarHitrates, queryWarSummary } from "../../src/stats-history.js"

const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const layer = databaseLayer({ HYPERDRIVE: { connectionString: url } } as WorkerBindings)
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.scoped))

describe("public statistics history against authoritative migrations", () => {
  it("reads uploaded pack aggregates only and preserves weighted UTC buckets", async () => {
    const outcome = (attacks: number, destructionPercent: number, durationSeconds: number) => ({ attacks, destructionPercent, durationSeconds })
    const rate = (attacks: number, zero: ReturnType<typeof outcome>, one: ReturnType<typeof outcome>, two: ReturnType<typeof outcome>, three: { attacks: number; durationSeconds: number }) =>
      ({ attacks, zeroStars: zero, oneStars: one, twoStars: two, threeStars: three })
    const stats = { byDay: {
      "2026-07-31": { totalMissedAttacks: 2, regularHitRates: { "16:16": rate(2,outcome(1,40,60),outcome(0,0,0),outcome(0,0,0),{attacks:1,durationSeconds:120}) },
        regularByWarSize: { "15": { wars: 1, townhalls: { "16": 20, "15": 10 }, totalStars: 30, wins: 1, losses: 0, ties: 0 } } },
      "2026-08-01": { totalMissedAttacks: 1, regularHitRates: { "16:16": rate(2,outcome(0,0,0),outcome(1,50,80),outcome(1,80,100),{attacks:0,durationSeconds:0}), "16:15": rate(99,outcome(99,1,1),outcome(0,0,0),outcome(0,0,0),{attacks:0,durationSeconds:0}) },
        regularByWarSize: { "15": { wars: 2, townhalls: { "16": 40, "15": 20 }, totalStars: 60, wins: 1, losses: 0, ties: 1 },
          "20": { wars: 1, townhalls: { "16": 40 }, totalStars: 40, wins: 0, losses: 0, ties: 1 } } },
    } }
    await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO war_archive_packs(status,first_end_time,last_end_time,stats) VALUES
        ('uploaded','2026-07-31','2026-08-01',${JSON.stringify(stats)}::jsonb),
        ('building','2026-07-31','2026-08-01',${JSON.stringify(stats)}::jsonb)`
    }))
    const time = { "time[after]": "2026-07-31", "time[before]": "2026-08-01", interval: "month" }
    const hitrates = await run(queryWarHitrates(new URLSearchParams({ ...time, townHall: "16" }))) as { items: Array<Record<string, unknown>> }
    expect(hitrates.items).toEqual([
      { period: "2026-07-01", townHall: 16, attacks: 2, stars: [{stars:0,count:1},{stars:1,count:0},{stars:2,count:0},{stars:3,count:1}], averageStars: 1.5, averageDestruction: 70, averageDuration: 90 },
      { period: "2026-08-01", townHall: 16, attacks: 2, stars: [{stars:0,count:0},{stars:1,count:1},{stars:2,count:1},{stars:3,count:0}], averageStars: 1.5, averageDestruction: 65, averageDuration: 90 },
    ])
    const summary = await run(queryWarSummary(new URLSearchParams(time))) as { items: Array<Record<string, unknown>> }
    expect(summary.items).toEqual([
      { period: "2026-07-01", wars: 1, accounts: 30, townHalls: [{level:16,count:20},{level:15,count:10}], draws: 0, missedAttacks: 2 },
      { period: "2026-08-01", wars: 3, accounts: 100, townHalls: [{level:16,count:80},{level:15,count:20}], draws: 2, missedAttacks: 1 },
    ])
    const grouped = await run(queryWarSummary(new URLSearchParams({ ...time, groupBy: "warSize", warSize: "15" }))) as { items: Array<Record<string, unknown>> }
    expect(grouped.items).toEqual([
      { period: "2026-07-01", warSize: 15, wars: 1, accounts: 30, townHalls: [{level:16,count:20},{level:15,count:10}], draws: 0 },
      { period: "2026-08-01", warSize: 15, wars: 2, accounts: 60, townHalls: [{level:16,count:40},{level:15,count:20}], draws: 1 },
    ])
  })

  it("returns the reconciled CWL season rows with strict filters", async () => {
    await run(Effect.gen(function* () { const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO cwl_season_statistics
        (season,cwl_league_id,war_size,group_count,clan_count,registered_player_count,town_halls) VALUES
        ('2026-07',48000001,15,2,16,320,'[{"level":18,"count":200},{"level":17,"count":120}]'::jsonb),
        ('2026-07',48000002,30,1,8,240,'[{"level":18,"count":240}]'::jsonb)`
    }))
    expect(await run(queryCwlTownHalls(new URLSearchParams({ season: "2026-07", leagueId: "48000001" })))).toEqual({ items: [{
      leagueId: 48000001, warSize: 15, groups: 2, clans: 16, registeredPlayers: 320,
      townHalls: [{ level: 18, count: 200 }, { level: 17, count: 120 }],
    }] })
    for (const query of ["", "season=2026-7", "season=2026-07&warSize=0", "season=2026-07&extra=1"]) {
      await expect(run(queryCwlTownHalls(new URLSearchParams(query)))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
  })
})
