import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { queryCwlStats } from "../../src/stats.js"

const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const layer = databaseLayer({ HYPERDRIVE: { connectionString: url } } as WorkerBindings)
const dates = { start_date: "2026-09-01", end_date: "2026-09-02" }
const outcome = (attacks: number, destructionPercent: number, durationSeconds: number) => ({ attacks, destructionPercent, durationSeconds })
// Exact v1 histogram from schema-owned database/wararchive/testdata/cwl-v1.json.
const known = {
  "18:17": { attacks: 2, zeroStars: outcome(1, 40, 60), oneStars: outcome(1, 60, 90), twoStars: outcome(0, 0, 0), threeStars: { attacks: 0, durationSeconds: 0 } },
  "17:18": { attacks: 2, zeroStars: outcome(0, 0, 0), oneStars: outcome(0, 0, 0), twoStars: outcome(1, 80, 120), threeStars: { attacks: 1, durationSeconds: 150 } },
}

describe("canonical CWL archive coverage", () => {
  it("includes unknown league globally, gates missing coverage, and keeps totals across finalization", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const base = { byDay: { "2026-09-01": { warsByType: { cwl: 1 } } } }
      const packs = yield* sql<{ pack_id: string }>`INSERT INTO war_archive_packs (status, first_end_time, last_end_time, stats)
        VALUES ('uploaded', '2026-09-01T12:00:00Z', '2026-09-01T12:00:00Z', ${JSON.stringify(base)}::jsonb) RETURNING pack_id::text`
      const failure = yield* queryCwlStats({ dates }).pipe(Effect.catch((error) => Effect.succeed(error)))
      expect(failure).toMatchObject({ _tag: "UpstreamUnavailable" })
      const summary = { version: 1, coverage: { complete: true, warCount: 1, unknownLeagueWarCount: 0, leagueComplete: true }, byDay: { "2026-09-01": { byLeague: { "48000001": known } } } }
      yield* sql`UPDATE war_archive_packs SET stats = ${JSON.stringify({ ...base, cwl: summary })}::jsonb WHERE pack_id = ${packs[0]!.pack_id}::bigint`
      const all = yield* queryCwlStats({ dates, equal_townhalls: false, cwl_league_id: 48000001 })
      expect(all.metrics.sample_size).toBe(4)
      expect(all.metrics.average_stars).toBe(1.5)
      expect(all.metrics.average_destruction).toBe(70)
      expect(all.metrics.three_star_rate).toBe(0.25)
      expect(all.breakdowns[0]!.key).toBe("2026-09")
      expect((yield* queryCwlStats({ dates })).metrics.sample_size).toBe(0)
      expect((yield* queryCwlStats({ dates, equal_townhalls: false, townhall_level: 18 })).metrics.average_stars).toBe(0.5)
      const wars = yield* sql<{ war_id: number }>`INSERT INTO wars
        (clan_tag, opponent_tag, prep_time, start_time, end_time, size, war_type, state, war_tag)
        VALUES ('#P0Y', '#P0L', '2026-08-31T12:00:00Z', '2026-09-01T12:00:00Z', '2026-09-02T12:00:00Z', 1, 'cwl', 'ended', '#UNKNOWN') RETURNING war_id`
      const payload = { clan: { members: [{ tag: "#P0Y", townhallLevel: 18, attacks: [{ defenderTag: "#P0L", stars: 3, destructionPercentage: 100 }] }] }, opponent: { members: [{ tag: "#P0L", townhallLevel: 17, attacks: [] }] } }
      yield* sql`INSERT INTO war_archive_pending (war_id, end_time, payload) VALUES (${wars[0]!.war_id}, '2026-09-02T12:00:00Z', ${JSON.stringify(payload)}::jsonb)`
      const before = yield* queryCwlStats({ dates, equal_townhalls: false })
      expect(before.metrics.sample_size).toBe(5)
      expect(before.metrics.average_stars).toBeCloseTo(1.8)
      expect(yield* queryCwlStats({ dates, equal_townhalls: false, cwl_league_id: 48000001 }).pipe(Effect.catch((error) => Effect.succeed(error)))).toMatchObject({ _tag: "UpstreamUnavailable" })
      const pendingSummary = { version: 1, coverage: { complete: true, warCount: 1, unknownLeagueWarCount: 1, leagueComplete: false }, byDay: { "2026-09-02": { byLeague: { unknown: { "18:17": { attacks: 1, zeroStars: outcome(0, 0, 0), oneStars: outcome(0, 0, 0), twoStars: outcome(0, 0, 0), threeStars: { attacks: 1, durationSeconds: 0 } } } } } } }
      yield* sql.withTransaction(Effect.gen(function* () {
        yield* sql`INSERT INTO war_archive_packs (status, first_end_time, last_end_time, stats) VALUES
          ('uploaded', '2026-09-02T12:00:00Z', '2026-09-02T12:00:00Z', ${JSON.stringify({ byDay: { "2026-09-02": { warsByType: { cwl: 1 } } }, cwl: pendingSummary })}::jsonb)`
        yield* sql`DELETE FROM war_archive_pending WHERE war_id = ${wars[0]!.war_id}`
      }))
      expect(yield* queryCwlStats({ dates, equal_townhalls: false })).toEqual(before)
      expect(yield* queryCwlStats({ dates, cwl_league_id: 48000001 }).pipe(Effect.catch((error) => Effect.succeed(error)))).toMatchObject({ _tag: "UpstreamUnavailable" })
      expect((yield* queryCwlStats({ dates, seasons: ["2026-08"] })).metrics.sample_size).toBe(0)
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
