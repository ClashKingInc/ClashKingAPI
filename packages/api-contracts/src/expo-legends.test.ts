import { describe, expect, it } from "vitest"

import {
  LegendHistoricalRanksEndpoint,
  LegendPlayerDailySeriesEndpoint,
  LegendRanksEndpoint,
  expoEndpoints,
} from "./expo.js"

describe("Expo Legend contracts", () => {
  it("exports current and historical rank endpoints through the Expo boundary", () => {
    expect(expoEndpoints.legendRanks).toBe(LegendRanksEndpoint)
    expect(expoEndpoints.historicalLegendRanks).toBe(LegendHistoricalRanksEndpoint)
    expect(expoEndpoints.legendPlayerDailySeries).toBe(LegendPlayerDailySeriesEndpoint)
    expect(LegendRanksEndpoint).toMatchObject({ method: "POST", path: "/v2/legends/ranks" })
    expect(LegendHistoricalRanksEndpoint).toMatchObject({ method: "POST", path: "/v2/legends/ranks/history" })
    expect(LegendPlayerDailySeriesEndpoint).toMatchObject({ method: "GET", path: "/v2/player/:playerTag/legend/series" })
  })
})
