import { describe, expect, it } from "vitest"

import {
  LegendHistoricalRanksEndpoint,
  LegendRanksEndpoint,
  expoEndpoints,
} from "./expo.js"

describe("Expo Legend contracts", () => {
  it("exports current and historical rank endpoints through the Expo boundary", () => {
    expect(expoEndpoints.legendRanks).toBe(LegendRanksEndpoint)
    expect(expoEndpoints.historicalLegendRanks).toBe(LegendHistoricalRanksEndpoint)
    expect(LegendRanksEndpoint).toMatchObject({ method: "POST", path: "/v2/legends/ranks" })
    expect(LegendHistoricalRanksEndpoint).toMatchObject({ method: "POST", path: "/v2/legends/ranks/history" })
  })
})
