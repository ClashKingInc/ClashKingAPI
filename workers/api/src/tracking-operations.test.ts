import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { TrackingSummaryResponse, TrackingTimeSeriesResponse } from "../../../packages/api-contracts/src/admin.js"
import { executeTrackingRead, parseTrackingQuery, trackingReadInternals as internals } from "./tracking-operations.js"

const now = Date.parse("2026-09-04T12:00:00Z")
const raw = {
  interval_start: new Date(now - 10_000), interval_end: new Date(now), run_id: "1", script: "globalclans", name: "globalclans.priority",
  last_success: null, last_error: "proxy timeout", last_ready_change: new Date(now - 3000), requests: "50", writes: "20", errors: "5",
  request_latency_ms: 1000, queue_depth: 7, healthy: true, processing_count: "10", total_process_time_ms: 500,
  store_batches: "4", store_rows_requested: "30", store_rows_affected: "28", store_duration_ms: 200,
  target_count: 100, target_cycle: "2", target_processed: 50, previous_run_id: "1", previous_target_count: 100, previous_target_cycle: "2", previous_target_processed: 40,
}
const noSql = {} as SqlClient.SqlClient

describe("original API tracking calculations and contracts", () => {
  it.each([["15m", 900, 15, 60], ["1h", 3600, 60, 60], ["6h", 21600, 300, 72], ["24h", 86400, 900, 96]] as const)("retains the bounded %s window", (name, duration, bucket, points) => {
    expect(internals.windows[name]).toEqual([duration, bucket])
    expect(duration / bucket).toBe(points)
    expect(parseTrackingQuery({ window: name })).toEqual({ window: name, script: "", domain: "" })
  })
  it("retains empty/default, trim, case normalization and exact script/domain filters", () => {
    expect(parseTrackingQuery({})).toEqual({ window: "1h", script: "", domain: "" })
    expect(parseTrackingQuery({ window: " 6H ", script: " war-discovery ", domain: " cwl.groups " })).toEqual({ window: "6h", script: "war-discovery", domain: "cwl.groups" })
  })
  it.each([{ window: "2d" }, { window: "__proto__" }, { script: "*" }, { domain: "x; DROP TABLE tracking_domain_stats" }, { domain: "x".repeat(101) }])("rejects invalid queries before SQL %#", async query => {
    await expect(Effect.runPromise(executeTrackingRead("timeseries", query).pipe(Effect.provideService(SqlClient.SqlClient, noSql))))
      .rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
  it("preserves original rates, ETA and structured latest error", () => {
    const domain = internals.domainState(raw, now)
    expect(domain).toMatchObject({ requests_per_second: 5, error_rate: 0.1, average_request_latency_ms: 20, writes_per_second: 2,
      database: { average_store_duration_ms: 50 }, targets: { targets_per_second: 1, completion_percentage: 50, estimated_seconds_remaining: 50 },
      latest_error: { message: "proxy timeout", timestamp: "2026-09-04T11:59:57.000Z" } })
    const response = { generated_at: new Date(now).toISOString(), stale_after_seconds: 120, processes: [], domains: [domain] }
    expect(Schema.decodeUnknownSync(TrackingSummaryResponse)(response)).toEqual(response)
  })
  it("accepts queue-only schema003 null targets and keeps null error metadata", () => {
    const domain = internals.domainState({ ...raw, target_count: null, target_cycle: null, target_processed: null, last_error: null, healthy: false }, now)
    expect(domain.targets).toBeNull()
    expect(domain.latest_error).toBeNull()
    expect(domain.health).toMatchObject({ healthy: false, stale: false })
    expect(() => Schema.decodeUnknownSync(TrackingSummaryResponse)({ generated_at: new Date(now).toISOString(), stale_after_seconds: 120, processes: [], domains: [domain] })).not.toThrow()
  })
  it.each([[7, 97, "4", 7], [8, 6, "4", 16], [10, 6, "4", 216], [1, 8, "5", 8]] as const)("preserves cycle/restart delta %#", (cycle, processed, run, delta) => {
    expect(internals.targetDelta({ count: 100, cycle, processed, run, observedAt: now }, { count: 100, cycle: 7, processed: 90, run: "4", observedAt: now - 1000 })).toBe(delta)
  })
  it("retains the exact stale threshold and never estimates stale target completion", () => {
    expect(internals.health(true, new Date(now - 120_000), now)).toMatchObject({ healthy: true, stale: false })
    expect(internals.health(true, new Date(now - 120_001), now)).toMatchObject({ healthy: false, stale: true, reported_healthy: true })
    expect(internals.domainState(raw, now + 120_001).targets).not.toHaveProperty("estimated_loop_completion")
  })
  it("uses the preceding chart bucket only for progress delta, not returned points", () => {
    const point = { ...raw, bucket: new Date(now), observed_at: new Date(now + 10_000), duration_seconds: 10 }
    const previous = { ...point, bucket: new Date(now - 60_000), observed_at: new Date(now - 10_000), target_processed: 40 }
    const domains = internals.groupedDomains([previous, point], now)
    expect(domains[0]!.points).toHaveLength(1)
    expect(domains[0]!.points[0]!.targets).toMatchObject({ targets_per_second: 0.5 })
    expect(() => Schema.decodeUnknownSync(TrackingTimeSeriesResponse)({ generated_at: new Date(now).toISOString(), window: "1h", start: new Date(now).toISOString(), end: new Date(now + 3600_000).toISOString(), bucket_seconds: 60, max_points_per_series: 60, processes: [], domains })).not.toThrow()
  })
  it("keeps both queries bounded and parameterized", () => {
    for (const query of [internals.processSeries, internals.domainSeries]) {
      expect(query).toContain("interval_end >= $1 AND interval_end < $2")
      expect(query).toContain("LIMIT 20000")
    }
    expect(internals.domainSeries).toContain("($5='' OR name=$5)")
  })
  it("does not ask a provider for either tracking read", async () => {
    const outbound = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected provider"))
    try {
      for (const endpoint of ["summary", "timeseries"] as const) {
        const sql = { unsafe: () => Effect.succeed([]) } as unknown as SqlClient.SqlClient
        const result = await Effect.runPromise(executeTrackingRead(endpoint, {}).pipe(Effect.provideService(SqlClient.SqlClient, sql)))
        expect(result).toMatchObject({ processes: [], domains: [] })
      }
      expect(outbound).not.toHaveBeenCalled()
    } finally { outbound.mockRestore() }
  })
})
