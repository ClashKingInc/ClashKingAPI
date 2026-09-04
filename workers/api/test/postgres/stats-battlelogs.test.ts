import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { queryArmyStats, queryItemStats } from "../../src/stats.js"

const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const layer = databaseLayer({ HYPERDRIVE: { connectionString: url } } as WorkerBindings)

describe("battle statistics on authoritative SQL", () => {
  it("returns unavailable zero-count item metrics on an empty interval", async () => {
    const result = await Effect.runPromise(queryItemStats({ dates: { start_date: "2025-01-01", end_date: "2025-01-01" }, items: [{ type: "troop", item: "Barbarian" }] }).pipe(Effect.provide(layer), Effect.scoped))
    expect(result.items[0]).toMatchObject({ available: false, sample_size: 0, use_count: 0, daily: [] })
  })
  it("uses the requested army ranking for its daily points and UTC calendar days", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql.withTransaction(Effect.gen(function* () {
        yield* sql`SET LOCAL TIME ZONE 'America/Los_Angeles'`
        for (const [army, stars] of [["common", 0], ["common", 0], ["successful", 3]] as const) {
          yield* sql`INSERT INTO battlelogs (battle_id, player_tag, player_th, opponent_tag, opponent_th, battle_type,
            attack, stars, destruction_percentage, gold, elixir, dark_elixir, timestamp, army_items, army_counts,
            player_name, opponent_name, duration, army_share_code)
            VALUES (${crypto.randomUUID()}::uuid, '#P0Y', 18, '#P0L', 18, 'ranked', true, ${stars}, ${stars === 3 ? 100 : 40},
              0, 0, 0, '2026-07-01T00:30:00Z', ARRAY['Barbarian'], '{"Barbarian":1}'::jsonb, 'Player', 'Opponent', 120, ${army})`
        }
        const result = yield* queryArmyStats({ dates: { start_date: "2026-07-01", end_date: "2026-07-01" }, minimum_sample_size: 1, limit: 1, sort_by: "three_star_rate" })
        expect(result.items).toHaveLength(1)
        expect(result.items[0]!.army_share_code).toBe("successful")
        expect(result.items[0]!.daily).toHaveLength(1)
        expect(result.items[0]!.daily[0]).toMatchObject({ date: "2026-07-01", sample_size: 1, three_star_rate: 1 })
      }))
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
