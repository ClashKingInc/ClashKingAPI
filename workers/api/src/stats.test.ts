import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { parseStatsRankedQuery, parseStatsWarQuery, queryWarStats, statsDateWindow } from "./stats.js"

describe("stats date-window validation", () => {
  it("defaults to the inclusive trailing 30-day window", async () => {
    const result = await Effect.runPromise(statsDateWindow({}, new Date("2026-09-03T18:00:00Z")))
    expect(result.start.toISOString()).toBe("2026-08-05T00:00:00.000Z")
    expect(result.end.toISOString()).toBe("2026-09-03T00:00:00.000Z")
    expect(result.endExclusive.toISOString()).toBe("2026-09-04T00:00:00.000Z")
  })

  it("rejects invalid calendar dates and windows over 90 days", async () => {
    await expect(Effect.runPromise(statsDateWindow({ start_date: "2026-02-30" }))).rejects.toMatchObject({
      _tag: "InvalidRequest",
    })
    await expect(Effect.runPromise(statsDateWindow({
      start_date: "2026-01-01",
      end_date: "2026-04-01",
    }))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })

  it("accepts the full game-era window only when the War limit is requested", async () => {
    const dates = { start_date: "2012-01-01", end_date: "2026-09-23" }
    const war = await Effect.runPromise(statsDateWindow(dates, new Date("2026-09-23T12:00:00Z"), 20000))
    expect(war.start.toISOString()).toBe("2012-01-01T00:00:00.000Z")
    expect(war.endExclusive.toISOString()).toBe("2026-09-24T00:00:00.000Z")
    await expect(Effect.runPromise(statsDateWindow(dates))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(Effect.runPromise(statsDateWindow({ start_date: "1900-01-01", end_date: "2026-09-23" }, new Date(), 20000)))
      .rejects.toMatchObject({ _tag: "InvalidRequest" })
  })

  it("runs the regular-war endpoint over a long range with an empty retained archive", async () => {
    const emptySql = Object.assign(() => Effect.succeed([]), { unsafe: () => Effect.succeed([]) }) as unknown as SqlClient.SqlClient
    const result = await Effect.runPromise(queryWarStats({
      dates: { start_date: "2012-01-01", end_date: "2026-09-23" },
    }).pipe(Effect.provideService(SqlClient.SqlClient, emptySql)))
    expect(result.dateRange.start).toBe("2012-01-01T00:00:00.000Z")
    expect(result.metrics).toMatchObject({ available: false, sampleSize: 0, daily: [] })
  })
})

describe("GET statistics query parsing", () => {
  it("requires ranked scalars and rejects unknown, duplicate, or malformed values", () => {
    expect(parseStatsRankedQuery(new URLSearchParams("townHallLevel=18&leagueTierId=105000034"))).toMatchObject({ townhall_level: 18, ranked_league_tier_id: 105000034 })
    for (const query of [
      "townHallLevel=18", "townHallLevel=18&leagueTierId=1&extra=x",
      "townHallLevel=18&townHallLevel=17&leagueTierId=1", "townHallLevel=18&leagueTierId=1&equalTownHalls=yes",
    ]) expect(() => query.includes("equalTownHalls") ? parseStatsWarQuery(new URLSearchParams(query)) : parseStatsRankedQuery(new URLSearchParams(query))).toThrow()
  })
})
