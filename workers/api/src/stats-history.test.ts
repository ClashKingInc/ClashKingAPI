import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { parseStatsHistoryWindow, queryWarHitrates, queryWarSummary } from "./stats-history.js"

describe("statistics history query parsing", () => {
  it("normalizes timestamp boundaries to UTC days", async () => {
    const result = await Effect.runPromise(parseStatsHistoryWindow(new URLSearchParams({
      "time[after]": "2026-08-01T23:30:00-05:00",
      "time[before]": "2026-08-03T00:15:00+02:00",
    })))
    expect(result.start.toISOString()).toBe("2026-08-02T00:00:00.000Z")
    expect(result.end.toISOString()).toBe("2026-08-02T00:00:00.000Z")
  })

  it("defaults to thirty inclusive UTC days", async () => {
    const result = await Effect.runPromise(parseStatsHistoryWindow(new URLSearchParams(), new Date("2026-09-08T23:00:00Z")))
    expect([result.start.toISOString(), result.end.toISOString()]).toEqual([
      "2026-08-10T00:00:00.000Z", "2026-09-08T00:00:00.000Z",
    ])
  })

  it("allows an all-retained-history War window while keeping the parser default at 90 days", async () => {
    const query = new URLSearchParams({ "time[after]": "2012-01-01", "time[before]": "2026-09-23" })
    await expect(Effect.runPromise(parseStatsHistoryWindow(query))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    const war = await Effect.runPromise(parseStatsHistoryWindow(query, new Date(), 20000))
    expect([war.start.toISOString(), war.end.toISOString()]).toEqual([
      "2012-01-01T00:00:00.000Z", "2026-09-23T00:00:00.000Z",
    ])
    await expect(Effect.runPromise(parseStatsHistoryWindow(new URLSearchParams({
      "time[after]": "1900-01-01", "time[before]": "2026-09-23",
    }), new Date(), 20000))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })

  it("runs both archive-history endpoints over a long empty retained range", async () => {
    const emptySql = { unsafe: () => Effect.succeed([]) } as unknown as SqlClient.SqlClient
    const query = new URLSearchParams({ "time[after]": "2012-01-01", "time[before]": "2026-09-23" })
    const run = (effect: Effect.Effect<unknown, unknown, SqlClient.SqlClient>) =>
      Effect.runPromise(effect.pipe(Effect.provideService(SqlClient.SqlClient, emptySql)))
    await expect(run(queryWarHitrates(query))).resolves.toEqual({ items: [] })
    await expect(run(queryWarSummary(query))).resolves.toEqual({ items: [] })
  })
})
