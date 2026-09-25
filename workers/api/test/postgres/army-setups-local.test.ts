import { writeFileSync } from "node:fs"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, it, expect } from "vitest"
import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { queryArmySetupList, queryArmySetupTimeline, queryArmySetupRankHistory } from "../../src/army-setups.js"
import { queryCwlParticipation } from "../../src/cwl-participation.js"

// Read-only proof against the explicitly selected local replay, never production.
const url = process.env.CLASHKING_LOCAL_ANALYTICS_PROOF_URL
if (url) {
  const u = new URL(url)
  if (u.hostname !== "127.0.0.1" || u.port !== "54330" || u.pathname !== "/clashking_dev" || [...u.searchParams.keys()].some(k => k !== "sslmode"))
    throw new Error("Only local analytics proof is permitted")
}
describe.skipIf(!url)("local rebuilt analytics proof", () => {
  it("reads stored overview, variants, timelines and CWL through the endpoint queries", async () => {
    const layer = databaseLayer({ HYPERDRIVE: { connectionString: url! } } as WorkerBindings)
    const run = <A,E>(effect: Effect.Effect<A,E,SqlClient.SqlClient>) => Effect.runPromise(effect.pipe(Effect.provide(layer),Effect.scoped))
    const query = new URLSearchParams({ "time[after]": "2026-09-15", "time[before]": "2026-09-20" })
    const overview = await run(queryArmySetupList(query))
    expect(overview.completedDays).toHaveLength(6)
    expect(overview.totalAttacks).toBeGreaterThan(overview.classifiedAttacks)
    expect(overview.items.reduce((n, row) => n + row.attacks, 0)).toBeLessThanOrEqual(overview.classifiedAttacks)
    expect(overview.items.every(row => row.attacks * 1000 >= overview.totalAttacks)).toBe(true)
    expect(overview.items[0]?.comparisons?.map(item => item.rankLimit)).toEqual([null, 1000, 200])
    expect(overview.items[0]?.sieges.length).toBeLessThanOrEqual(3)
    expect(overview.items[0]?.dailyRank).toBeGreaterThan(0)
    const group = overview.items[0]!
    query.set("groupKey", group.groupKey)
    const variants = await run(queryArmySetupList(query))
    expect(variants.items.every(row => row.attacks * 100 >= variants.totalAttacks)).toBe(true)
    const timeline = await run(queryArmySetupTimeline(query))
    const rankHistory = await run(queryArmySetupRankHistory(query))
    expect(timeline.items).toHaveLength(6)
    expect(timeline.benchmarks?.map(item => item.rankLimit)).toEqual([null, 1000, 200])
    expect(timeline.items.every(item => item.observation === null || item.observation.groupKey === group.groupKey)).toBe(true)
    expect(rankHistory.points).toHaveLength(6)
    expect(rankHistory.points.at(-1)?.rank).toBe(overview.items[0]?.dailyRank)
    const cwl = await run(queryCwlParticipation(new URLSearchParams()))
    expect(cwl.items.length).toBeGreaterThan(0)
    expect(cwl.clanCount).toBe(cwl.items.reduce((n, row) => n + row.clanCount, 0))
    expect(cwl.availableSeasons?.includes(cwl.season ?? "")).toBe(true)
    writeFileSync("/private/tmp/clashking-analytics-endpoint-examples.json", JSON.stringify({ overview, variants, timeline, rankHistory, cwl }, null, 2))
  })
})
