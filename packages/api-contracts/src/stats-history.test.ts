import { describe, expect, it } from "vitest"

import {
  WarHitratesEndpoint,
  WarSummaryEndpoint,
} from "./stats-history.js"

describe("public statistics history contracts", () => {
  it("keeps the approved reads as GET endpoints", () => {
    expect([WarHitratesEndpoint, WarSummaryEndpoint]
      .map(({ method, path }) => [method, path])).toEqual([
      ["GET", "/v2/stats/wars/hitrates"],
      ["GET", "/v2/stats/wars/summary"],
    ])
  })
})
