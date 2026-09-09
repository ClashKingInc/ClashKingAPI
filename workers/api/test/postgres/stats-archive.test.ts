import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { queryWarStats } from "../../src/stats.js"

const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const layer = databaseLayer({ HYPERDRIVE: { connectionString: url } } as WorkerBindings)
const dates = { start_date: "2026-08-01", end_date: "2026-08-02" }
const outcome = (attacks: number, destructionPercent: number) => ({ attacks, destructionPercent, durationSeconds: 0 })
const matchup = {
  attacks: 4, zeroStars: outcome(1, 40), oneStars: outcome(1, 60), twoStars: outcome(1, 80),
  threeStars: { attacks: 1, durationSeconds: 0 },
}

describe("canonical archive regular statistics", () => {
  it("merges uploaded outcome aggregates with pending attacks, then keeps totals after finalization", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const uploaded = { byDay: { "2026-08-01": { regularHitRates: { "18:18": matchup } } } }
      const packs = yield* sql<{ pack_id: string }>`INSERT INTO war_archive_packs
        (status, first_end_time, last_end_time, stats) VALUES
        ('uploaded', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z', ${JSON.stringify(uploaded)}::jsonb)
        RETURNING pack_id::text`
      const wars = yield* sql<{ war_id: number }>`INSERT INTO wars
        (clan_tag, opponent_tag, prep_time, start_time, end_time, size, war_type, state)
        VALUES ('#P0Y', '#P0L', '2026-07-31T12:00:00Z', '2026-08-01T12:00:00Z', '2026-08-02T12:00:00Z', 1, 'random', 'ended')
        RETURNING war_id`
      // Canonical persisted payload has no type; SQL wars.war_type is authoritative.
      const payload = {
        clan: { members: [{ tag: "#P0Y", townhallLevel: 18, attacks: [{ defenderTag: "#P0L", stars: 3, destructionPercentage: 100 }] }] },
        opponent: { members: [{ tag: "#P0L", townhallLevel: 17, attacks: [] }] },
      }
      yield* sql`INSERT INTO war_archive_pending (war_id, end_time, payload)
        VALUES (${wars[0]!.war_id}, '2026-08-02T12:00:00Z', ${JSON.stringify(payload)}::jsonb)`
      const equal = yield* queryWarStats({ dates })
      expect(equal.metrics.sampleSize).toBe(4)
      expect(equal.metrics.averageStars).toBe(1.5)
      expect(equal.metrics.averageDestruction).toBe(70)
      expect(equal.metrics.threeStarRate).toBe(0.25)
      const before = yield* queryWarStats({ dates, equal_townhalls: false })
      expect(before.metrics.sampleSize).toBe(5)
      expect(before.metrics.averageStars).toBeCloseTo(1.8)
      expect(before.metrics.averageDestruction).toBeCloseTo(76)
      expect(before.metrics.daily).toHaveLength(2)
      const selected = yield* queryWarStats({ dates, townhall_level: 18, opponent_townhall_level: 17, equal_townhalls: false })
      expect(selected.metrics.sampleSize).toBe(1)
      expect(selected.metrics.threeStarRate).toBe(1)
      const finalized = { byDay: { "2026-08-02": { regularHitRates: { "18:17": {
        attacks: 1, zeroStars: outcome(0, 0), oneStars: outcome(0, 0), twoStars: outcome(0, 0),
        threeStars: { attacks: 1, durationSeconds: 0 },
      } } } } }
      yield* sql.withTransaction(Effect.gen(function* () {
        yield* sql`INSERT INTO war_archive_packs (status, first_end_time, last_end_time, stats)
          VALUES ('uploaded', '2026-08-02T12:00:00Z', '2026-08-02T12:00:00Z', ${JSON.stringify(finalized)}::jsonb)`
        yield* sql`DELETE FROM war_archive_pending WHERE war_id = ${wars[0]!.war_id}`
      }))
      const after = yield* queryWarStats({ dates, equal_townhalls: false })
      expect(after).toEqual(before)
      expect(packs).toHaveLength(1)
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
