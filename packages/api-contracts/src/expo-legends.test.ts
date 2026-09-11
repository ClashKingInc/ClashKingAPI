import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  LegendHistoricalRanksEndpoint,
  LegendDaySummariesEndpoint,
  LegendPlayerDailySeriesEndpoint,
  LegendRanksEndpoint,
  expoEndpoints,
} from "./expo.js"

describe("Expo Legend contracts", () => {
  it("exports current and historical rank endpoints through the Expo boundary", () => {
    expect(expoEndpoints.legendRanks).toBe(LegendRanksEndpoint)
    expect(expoEndpoints.historicalLegendRanks).toBe(LegendHistoricalRanksEndpoint)
    expect(expoEndpoints.legendDaySummaries).toBe(LegendDaySummariesEndpoint)
    expect(expoEndpoints.legendPlayerDailySeries).toBe(LegendPlayerDailySeriesEndpoint)
    expect(LegendRanksEndpoint).toMatchObject({ method: "POST", path: "/v2/legends/ranks" })
    expect(LegendHistoricalRanksEndpoint).toMatchObject({ method: "POST", path: "/v2/legends/ranks/history" })
    expect(LegendDaySummariesEndpoint).toMatchObject({ method: "POST", path: "/v2/legends/days" })
    expect(LegendPlayerDailySeriesEndpoint).toMatchObject({ method: "GET", path: "/v2/player/:playerTag/legend/series" })
  })

  it("bounds the selected-day batch contract to 100 tags", () => {
    expect(Schema.decodeUnknownSync(LegendDaySummariesEndpoint.body)({ day: "2026-09-10", tags: ["#P0Y"] }))
      .toEqual({ day: "2026-09-10", tags: ["#P0Y"] })
    expect(() => Schema.decodeUnknownSync(LegendDaySummariesEndpoint.body)({
      day: "2026-09-10", tags: Array.from({ length: 101 }, () => "#P0Y"),
    })).toThrow()
  })
})
