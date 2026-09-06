import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { TrackingSummaryResponse, TrackingTimeSeriesResponse } from "@clashking/api-contracts"
import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { executeTrackingRead } from "../../src/tracking-operations.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Run through the retained-api with-test-timescale.sh harness")
const database = databaseLayer({ HYPERDRIVE: { connectionString: databaseUrl } } as WorkerBindings)
const uniqueScript = () => `fixture_${crypto.randomUUID().replaceAll("-", "")}`

const insertProcess = (script: string, start: Date, end: Date, run = 1) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO tracking_process_stats
    (interval_start,interval_end,run_id,script,process_started_at,uptime_ms,goroutines,alloc_bytes,heap_objects,gc_cycles)
    VALUES (${start},${end},${run},${script},${start},10000,3,1024,10,2)`
})
const insertDomain = (script: string, name: string, start: Date, end: Date, options: {
  count?: number | null; cycle?: number | null; processed?: number | null; healthy?: boolean; error?: string | null; run?: number
} = {}) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO tracking_domain_stats
    (interval_start,interval_end,run_id,script,name,last_success,last_error,last_ready_change,
     requests,writes,errors,request_latency_ms,queue_depth,healthy,processing_count,total_process_time_ms,
     store_batches,store_rows_requested,store_rows_affected,store_duration_ms,target_count,target_cycle,target_processed)
    VALUES (${start},${end},${options.run ?? 1},${script},${name},NULL,${options.error ?? null},${end},
      50,20,5,1000,7,${options.healthy ?? true},10,500,4,30,28,200,
      ${options.count === undefined ? 100 : options.count},${options.cycle === undefined ? 2 : options.cycle},${options.processed === undefined ? 50 : options.processed})`
})

describe("original Tracking readers against retained authoritative tables", () => {
  it("loads actual latest observations, computes progress/errors and rolls failed queue health into its process", async () => {
    const script = uniqueScript(), now = Date.now(), earlier = new Date(now - 20_000), latest = new Date(now - 10_000)
    await Effect.runPromise(Effect.gen(function* () {
      yield* insertProcess(script, earlier, latest)
      yield* insertDomain(script, "priority", new Date(now - 30_000), earlier, { processed: 40 })
      yield* insertDomain(script, "priority", earlier, latest, { processed: 50, error: "provider timeout" })
      yield* insertDomain(script, "queue", earlier, latest, { count: null, cycle: null, processed: null, healthy: false })
      const response = Schema.decodeUnknownSync(TrackingSummaryResponse)(yield* executeTrackingRead("summary", {}))
      const domain = response.domains.find(row => row.script === script && row.domain === "priority")!
      expect(domain).toMatchObject({ requests_per_second: 5, writes_per_second: 2, error_rate: 0.1, average_request_latency_ms: 20,
        targets: { targets_per_second: 1, completion_percentage: 50, estimated_seconds_remaining: 50 },
        latest_error: { message: "provider timeout", timestamp: latest.toISOString() } })
      expect(response.domains.find(row => row.script === script && row.domain === "queue"))
        .toMatchObject({ targets: null, latest_error: null, health: { healthy: false, stale: false, reported_healthy: false } })
      expect(response.processes.find(row => row.script === script)).toMatchObject({ run_id: 1, uptime_seconds: 10,
        health: { healthy: false, stale: false, reported_healthy: false } })
    }).pipe(Effect.provide(database), Effect.scoped))
  })

  it("uses an extra lookback bucket for delta, excludes the current bucket and preserves exact domain filtering", async () => {
    const script = uniqueScript()
    const end = Math.floor(Date.now() / 60_000) * 60_000, start = end - 3600_000
    await Effect.runPromise(Effect.gen(function* () {
      // A prior-bucket sample supplies progress, but is not a returned point.
      yield* insertDomain(script, "priority", new Date(start - 30_000), new Date(start - 20_000), { processed: 40 })
      yield* insertDomain(script, "priority", new Date(start), new Date(start + 10_000), { processed: 50 })
      yield* insertDomain(script, "queue", new Date(start), new Date(start + 10_000), { count: null, cycle: null, processed: null })
      yield* insertDomain(script, "priority", new Date(end), new Date(end + 10_000), { processed: 90 })
      yield* insertProcess(script, new Date(start), new Date(start + 10_000))
      const all = Schema.decodeUnknownSync(TrackingTimeSeriesResponse)(yield* executeTrackingRead("timeseries", { window: " 1H ", script }))
      expect(all).toMatchObject({ window: "1h", start: new Date(start).toISOString(), end: new Date(end).toISOString(), bucket_seconds: 60, max_points_per_series: 60 })
      expect(all.processes).toHaveLength(1)
      expect(all.domains.map(row => row.domain)).toEqual(["priority", "queue"])
      expect(all.domains[0]!.points).toHaveLength(1)
      expect(all.domains[0]!.points[0]).toMatchObject({ timestamp: new Date(start).toISOString(), requests_per_second: 5,
        targets: { targets_per_second: 0.333 } })
      expect(all.domains[1]!.points[0]!.targets).toBeNull()
      const filtered = Schema.decodeUnknownSync(TrackingTimeSeriesResponse)(yield* executeTrackingRead("timeseries", { window: "1h", script, domain: " priority " }))
      expect(filtered.processes).toEqual([])
      expect(filtered.domains).toEqual([all.domains[0]])
      const absent = Schema.decodeUnknownSync(TrackingTimeSeriesResponse)(yield* executeTrackingRead("timeseries", { window: "15m", script, domain: "absent" }))
      expect(absent).toMatchObject({ bucket_seconds: 15, max_points_per_series: 60, processes: [], domains: [] })
    }).pipe(Effect.provide(database), Effect.scoped))
  })

  it("reads SQL without a Tracking origin, API token or provider request", async () => {
    const outbound = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected provider request"))
    try {
      await Effect.runPromise(executeTrackingRead("timeseries", { script: uniqueScript() }).pipe(Effect.provide(database), Effect.scoped))
      expect(outbound).not.toHaveBeenCalled()
    } finally { outbound.mockRestore() }
  })
})
