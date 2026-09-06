import { describe, expect, it } from "vitest"

import { adminEndpoints, AppConfigResponse, endpoints } from "./index.js"
import { Schema } from "effect"

describe("canonical endpoint contracts", () => {
  it("exposes the six former QUERY operations only as POST", () => {
    expect([
      endpoints.homeActivity,
      endpoints.statsArmies,
      endpoints.statsItems,
      endpoints.statsRanked,
      endpoints.statsWar,
      endpoints.statsCwl,
    ].map(({ method, path }) => [method, path])).toEqual([
      ["POST", "/v2/home/activity"],
      ["POST", "/v2/stats/armies"],
      ["POST", "/v2/stats/items"],
      ["POST", "/v2/stats/ranked"],
      ["POST", "/v2/stats/war"],
      ["POST", "/v2/stats/cwl"],
    ])
  })

  it("models web as having no forced-update minimum", () => {
    expect(
      Schema.decodeUnknownSync(AppConfigResponse)({
        flags: [],
        updates: {
          ios: { minimum_version: "1.2.0", store_url: "https://apps.apple.com/app/id1", message: "Update required" },
          android: { minimum_version: "1.2.0", store_url: "https://play.google.com/store/apps/details?id=ing.clashk", message: "Update required" },
          web: null,
        },
        generated_at: "2026-09-03T12:00:00Z",
      }).updates.web,
    ).toBeNull()
  })

  it("keeps every Admin operation under the central /v2/admin namespace", () => {
    expect(Object.keys(adminEndpoints)).toHaveLength(39)
    expect(Object.values(adminEndpoints).every(({ auth, path, operationId }) =>
      auth === (operationId === "adminTrackingSummary" || operationId === "adminTrackingTimeseries" ? "admin-or-bot" : "admin") && path.startsWith("/v2/admin/"),
    )).toBe(true)
  })

  it("models Admin archives and revocation as empty 204 responses", () => {
    expect([
      adminEndpoints.archivePost,
      adminEndpoints.deleteDeveloperApplication,
    ].map(({ method, responseMode }) => [method, responseMode])).toEqual([
      ["DELETE", "none"],
      ["DELETE", "none"],
    ])
  })
})
