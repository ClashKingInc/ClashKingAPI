import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { parseStatsCwlQuery, parseStatsRankedQuery, parseStatsWarQuery, statsDateWindow } from "./stats.js"

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
})

describe("GET statistics query parsing", () => {
  it("decodes repeated CWL seasons", () => {
    expect(parseStatsCwlQuery(new URLSearchParams("seasons=2026-07&seasons=2026-08&cwlLeagueId=48000001"))).toMatchObject({ seasons: ["2026-07", "2026-08"], cwl_league_id: 48000001 })
  })

  it("requires ranked scalars and rejects unknown, duplicate, or malformed values", () => {
    expect(parseStatsRankedQuery(new URLSearchParams("townHallLevel=18&leagueTierId=105000034"))).toMatchObject({ townhall_level: 18, ranked_league_tier_id: 105000034 })
    for (const query of [
      "townHallLevel=18", "townHallLevel=18&leagueTierId=1&extra=x",
      "townHallLevel=18&townHallLevel=17&leagueTierId=1", "townHallLevel=18&leagueTierId=1&equalTownHalls=yes",
    ]) expect(() => query.includes("equalTownHalls") ? parseStatsWarQuery(new URLSearchParams(query)) : parseStatsRankedQuery(new URLSearchParams(query))).toThrow()
  })
})
