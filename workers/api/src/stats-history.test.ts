import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { parseStatsHistoryWindow } from "./stats-history.js"

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
})
