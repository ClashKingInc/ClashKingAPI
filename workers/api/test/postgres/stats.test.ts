import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { beforeAll, describe, expect, it } from "vitest"

import { databaseLayer, refreshMaterializedViews } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { queryGlobalCounts, queryGroupedCounts } from "../../src/stats.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run this suite through clashking_schemas/scripts/with-test-timescale.sh")
}
const layer = databaseLayer({ HYPERDRIVE: { connectionString: databaseUrl } } as WorkerBindings)

describe("Stats against authoritative Goose migrations", () => {
  beforeAll(async () => {
    // Goose deliberately creates these WITH NO DATA. Initial population is a
    // release prerequisite; normal scheduled work uses concurrent refreshes.
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`REFRESH MATERIALIZED VIEW api_global_counts`
      yield* sql`REFRESH MATERIALIZED VIEW api_league_tier_counts`
      yield* sql`REFRESH MATERIALIZED VIEW townhall_counts`
      yield* sql`REFRESH MATERIALIZED VIEW war_league_counts`
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
  it("refreshes and reads actual count views through the production database layer", async () => {
    const result = await Effect.runPromise(Effect.gen(function* () {
      yield* refreshMaterializedViews
      return yield* queryGlobalCounts
    }).pipe(Effect.provide(layer), Effect.scoped))
    expect(result).toEqual({
      players_in_war: 0, clans_in_war: 0, total_join_leaves: 0,
      players_in_legends: 0, player_count: 0, clan_count: 0, wars_stored: 0,
    })
  })

  it.each(["capital_league_id", "cwl_league_id", "league_tier_id", "location_id", "townhall_level"] as const)(
    "executes the %s count query against its real schema", async (dimension) => {
      const result = await Effect.runPromise(queryGroupedCounts(dimension).pipe(Effect.provide(layer), Effect.scoped))
      expect(result.count).toBe(result.items.length)
      for (const row of result.items) expect(typeof row.count).toBe("number")
    },
  )
})
