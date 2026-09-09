import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { readDashboardThreadParentNames } from "../../src/dashboard-discord-cache.js"
import type { WorkerBindings } from "../../src/environment.js"

const connectionString = process.env.TEST_DATABASE_URL
if (!connectionString || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run through the schema-owned disposable Timescale harness")
}
const layer = databaseLayer({ HYPERDRIVE: { connectionString } } as WorkerBindings)
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.scoped))
const guild = "1234567890123456789", parent = "2234567890123456789", foreign = "3234567890123456789"

describe("existing Discord cache schema", () => {
  it("returns only exact fresh parent names from the requested guild", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO discord_cache.channels(id,guild_id,data,updated_at)
      VALUES (${parent},${guild},${JSON.stringify({ id: parent, name: "general" })}::jsonb,now()),
        (${foreign},'9234567890123456789',${JSON.stringify({ id: foreign, name: "private" })}::jsonb,now())`
    expect(yield* readDashboardThreadParentNames(guild, [parent, parent])).toEqual(new Map([[parent, "general"]]))
    expect(yield* readDashboardThreadParentNames(guild, [parent, foreign])).toBeUndefined()
    expect(yield* readDashboardThreadParentNames(guild, [])).toEqual(new Map())
  })))

  it("returns a miss for stale or malformed stored data without changing it", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const stale = "4234567890123456789", malformed = "5234567890123456789"
    yield* sql`INSERT INTO discord_cache.channels(id,guild_id,data,updated_at)
      VALUES (${stale},${guild},${JSON.stringify({ id: stale, name: "old" })}::jsonb,now()-interval '61 seconds'),
        (${malformed},${guild},${JSON.stringify({ id: malformed, name: 123 })}::jsonb,now())`
    expect(yield* readDashboardThreadParentNames(guild, [stale])).toBeUndefined()
    expect(yield* readDashboardThreadParentNames(guild, [malformed])).toBeUndefined()
    expect(yield* sql`SELECT id FROM discord_cache.channels WHERE id=ANY(${[stale, malformed]}::text[])`).toHaveLength(2)
  })))
})
