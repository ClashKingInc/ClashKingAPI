import { describe, expect, it } from "vitest"
import { legendSeasonFinish, legendSeasonWindow } from "./legend-season.js"

describe("Legend season calendar", () => {
  it("uses the four-week calendar independently of a player's finishes", () => {
    expect(legendSeasonWindow(new Date("2026-09-21T12:00:00Z"), "v2-2026-08-03T05:00:00Z")).toEqual({
      start: new Date("2026-08-31T05:00:00Z"), end: new Date("2026-09-28T05:00:00Z"),
    })
  })
  it("switches at the actual season boundary", () => {
    expect(legendSeasonWindow(new Date("2026-09-28T04:59:59Z"), "v2-2026-08-03T05:00:00Z").start.toISOString()).toBe("2026-08-31T05:00:00.000Z")
    expect(legendSeasonWindow(new Date("2026-09-28T05:00:00Z"), "v2-2026-08-03T05:00:00Z").start.toISOString()).toBe("2026-09-28T05:00:00.000Z")
  })
  it("understands legacy and v2 finishes without parsing v2 as a month", () => {
    expect(legendSeasonFinish("v2-2026-09-07T05:00:00Z")).toBe(Date.parse("2026-09-07T05:00:00Z"))
    expect(legendSeasonFinish("2025-09")).toBe(Date.parse("2025-10-06T05:00:00Z"))
    expect(legendSeasonFinish("2025-08")).toBe(Date.parse("2025-08-25T05:00:00Z"))
    expect(legendSeasonFinish("bad")).toBeNaN()
  })
})
