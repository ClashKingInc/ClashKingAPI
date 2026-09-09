import { describe, expect, it } from "vitest"

import {
  CwlTownHallsEndpoint,
  WarHitratesEndpoint,
  WarSummaryEndpoint,
} from "./stats-history.js"

describe("public statistics history contracts", () => {
  it("keeps the approved reads as GET endpoints", () => {
    expect([WarHitratesEndpoint, WarSummaryEndpoint, CwlTownHallsEndpoint]
      .map(({ method, path }) => [method, path])).toEqual([
      ["GET", "/v2/stats/wars/hitrates"],
      ["GET", "/v2/stats/wars/summary"],
      ["GET", "/v2/stats/cwl/townhalls"],
    ])
  })
})
