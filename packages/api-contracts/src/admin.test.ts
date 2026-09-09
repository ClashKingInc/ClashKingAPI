import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { AdminUser, ProxyStatsResponse } from "./admin.js"

describe("Admin identity contract", () => {
  it("accepts the original Access profile without account timestamps", () => {
    const profile = {
      id: "access-subject", email: "admin@example.test", username: "admin@example.test",
      display_name: "admin", role: "owner", active: true,
    }
    expect(Schema.decodeUnknownSync(AdminUser)(profile)).toEqual(profile)
    expect(Schema.encodeUnknownSync(AdminUser)(profile)).toEqual(profile)
  })
})

describe("Admin proxy statistics contract", () => {
  it("accepts proxy series points without a derived average request rate", () => {
    const statusCounts = { "2xx": 1, "3xx": 0, "4xx": 0, "5xx": 0 }
    const response = {
      now: "2026-09-09T12:00:00Z",
      windows: {
        "1m": { requests: 1, avg_rps: 1 / 60, avg_latency_ms: 12, status_counts: statusCounts, proxy_failures: 0 },
      },
      series_data: {
        interval: "5m",
        lookback: "1h",
        points: [{
          start: "2026-09-09T11:00:00Z", end: "2026-09-09T11:05:00Z", requests: 1,
          avg_latency_ms: 12, status_counts: statusCounts, proxy_failures: 0,
        }],
      },
    }
    expect(Schema.encodeUnknownSync(ProxyStatsResponse)(response)).toEqual(response)
  })
})
