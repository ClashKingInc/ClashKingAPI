import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, InvalidRequest } from "./errors.js"

// Ported from original API cf7371e: tracking owns observations, the API owns
// their health/rate/progress calculations. No request is sent to Tracking here.
type Row = Readonly<Record<string, unknown>>
type Snapshot = { run: string; count: number; cycle: number; processed: number; observedAt: number }
const staleSeconds = 120
const windows = { "15m": [900, 15], "1h": [3600, 60], "6h": [21600, 300], "24h": [86400, 900] } as const
const round = (value: number) => Math.round(value * 1000) / 1000
const numeric = (value: unknown) => Number(value ?? 0)
const iso = (value: unknown) => new Date(value as string | number | Date).toISOString()
const millis = (value: unknown) => new Date(value as string | number | Date).getTime()
const rate = (numerator: number, denominator: number) => denominator <= 0 || !Number.isFinite(numerator) ? 0 : round(numerator / denominator)
const invalid = (message: string) => new InvalidRequest({ message })

export function parseTrackingQuery(input: unknown) {
  const query = input !== null && typeof input === "object" ? input as Record<string, unknown> : {}
  const name = String(query.window ?? "").trim().toLowerCase() || "1h"
  if (!Object.hasOwn(windows, name)) throw invalid("window must be one of 15m, 1h, 6h, or 24h")
  const filter = (key: "script" | "domain") => {
    const value = String(query[key] ?? "").trim()
    if (value && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(value)) throw invalid(`${key} contains unsupported characters`)
    return value
  }
  return { window: name as keyof typeof windows, script: filter("script"), domain: filter("domain") }
}

function health(reported: boolean, observedAt: unknown, now: number) {
  const age = Math.max((now - millis(observedAt)) / 1000, 0)
  const stale = age > staleSeconds
  return { healthy: reported && !stale, reported_healthy: reported, stale, observed_at: iso(observedAt), age_seconds: round(age), stale_after_seconds: staleSeconds }
}

function snapshot(row: Row, prefix = ""): Snapshot {
  return { run: String(row[`${prefix}run_id`]), count: numeric(row[`${prefix}target_count`]), cycle: numeric(row[`${prefix}target_cycle`]),
    processed: numeric(row[`${prefix}target_processed`]), observedAt: millis(row.observed_at ?? row.interval_end) }
}

function targetDelta(current: Snapshot, previous?: Snapshot) {
  if (current.count <= 0 || current.processed < 0) return 0
  if (!previous || previous.run !== current.run || current.cycle < previous.cycle) return current.processed
  if (current.cycle === previous.cycle) return Math.max(current.processed - previous.processed, 0)
  return Math.max(previous.count - previous.processed, 0) + Math.max(current.cycle - previous.cycle - 1, 0) * current.count + current.processed
}

function targetProgress(current: Snapshot, speed: number, now: number, stale: boolean) {
  if (current.count <= 0) return null
  const remaining = Math.max(current.count - current.processed, 0)
  const seconds = round(remaining / speed)
  return {
    target_count: current.count, current_cycle: current.cycle, processed_targets: current.processed,
    targets_per_second: round(speed), completion_percentage: round(Math.min(Math.max(rate(current.processed, current.count) * 100, 0), 100)),
    ...(!stale && remaining > 0 && speed > 0 ? {
      estimated_seconds_remaining: seconds, estimated_loop_completion: new Date(now + seconds * 1000).toISOString(),
    } : {}),
  }
}

function metrics(row: Row, duration: number) {
  const requests = numeric(row.requests), writes = numeric(row.writes), errors = numeric(row.errors), processed = numeric(row.processing_count)
  return {
    interval_duration_seconds: round(duration), request_count: requests, requests_per_second: rate(requests, duration),
    error_count: errors, error_rate: rate(errors, requests), average_request_latency_ms: rate(numeric(row.request_latency_ms), requests),
    write_count: writes, writes_per_second: rate(writes, duration), processing_count: processed,
    average_processing_duration_ms: rate(numeric(row.total_process_time_ms), processed), queue_depth: numeric(row.queue_depth),
    database: { batch_count: numeric(row.store_batches), rows_requested: numeric(row.store_rows_requested), rows_affected: numeric(row.store_rows_affected),
      average_store_duration_ms: rate(numeric(row.store_duration_ms), numeric(row.store_batches)) },
  }
}

function domainState(row: Row, now: number) {
  const duration = Math.max((millis(row.interval_end) - millis(row.interval_start)) / 1000, 0)
  const current = snapshot(row)
  const hasPrevious = ["previous_run_id", "previous_target_count", "previous_target_cycle", "previous_target_processed"].every(key => row[key] != null)
  return {
    script: String(row.script), domain: String(row.name), run_id: numeric(row.run_id), interval_start: iso(row.interval_start), interval_end: iso(row.interval_end),
    ...(row.last_success == null ? {} : { last_success: iso(row.last_success) }),
    latest_error: row.last_error == null ? null : { message: String(row.last_error), timestamp: iso(row.last_ready_change ?? row.interval_end) },
    ...metrics(row, duration), targets: targetProgress(current, rate(targetDelta(current, hasPrevious ? snapshot(row, "previous_") : undefined), duration),
      now, now - millis(row.interval_end) > staleSeconds * 1000), health: health(Boolean(row.healthy), row.interval_end, now),
  }
}

const latestProcesses = `SELECT DISTINCT ON (script) script, run_id, interval_start, interval_end, process_started_at,
  uptime_ms, goroutines, alloc_bytes, heap_objects, gc_cycles FROM tracking_process_stats
  ORDER BY script, interval_end DESC, run_id DESC`
const latestDomains = `WITH latest AS (
  SELECT DISTINCT ON (script, name) interval_start, interval_end, run_id, script, name, last_success, last_error,
    last_ready_change, requests, writes, errors, request_latency_ms, queue_depth, healthy, processing_count,
    total_process_time_ms, store_batches, store_rows_requested, store_rows_affected, store_duration_ms,
    target_count, target_cycle, target_processed
  FROM tracking_domain_stats ORDER BY script, name, interval_end DESC, run_id DESC
) SELECT latest.*, previous.run_id AS previous_run_id, previous.target_count AS previous_target_count,
  previous.target_cycle AS previous_target_cycle, previous.target_processed AS previous_target_processed
FROM latest LEFT JOIN LATERAL (
  SELECT run_id, target_count, target_cycle, target_processed FROM tracking_domain_stats
  WHERE script=latest.script AND name=latest.name AND interval_end < latest.interval_end
  ORDER BY interval_end DESC, run_id DESC LIMIT 1
) previous ON TRUE ORDER BY latest.script, latest.name`
const processSeries = `SELECT time_bucket($3::interval, interval_end) AS bucket, script, max(interval_end) AS observed_at,
  avg(alloc_bytes)::double precision AS alloc_bytes, avg(uptime_ms) AS uptime_ms, avg(goroutines)::double precision AS goroutines,
  avg(heap_objects)::double precision AS heap_objects, max(gc_cycles) AS gc_cycles
FROM tracking_process_stats WHERE interval_end >= $1 AND interval_end < $2 AND ($4='' OR script=$4)
GROUP BY bucket, script ORDER BY bucket, script LIMIT 20000`
const domainSeries = `SELECT time_bucket($3::interval, interval_end) AS bucket, script, name, max(interval_end) AS observed_at,
  last(run_id, interval_end) AS run_id, sum(EXTRACT(EPOCH FROM interval_end-interval_start))::double precision AS duration_seconds,
  sum(requests) AS requests, sum(writes) AS writes, sum(errors) AS errors, sum(request_latency_ms) AS request_latency_ms,
  last(queue_depth, interval_end) AS queue_depth, last(healthy, interval_end) AS healthy, sum(processing_count) AS processing_count,
  sum(total_process_time_ms) AS total_process_time_ms, sum(store_batches) AS store_batches,
  sum(store_rows_requested) AS store_rows_requested, sum(store_rows_affected) AS store_rows_affected, sum(store_duration_ms) AS store_duration_ms,
  last(target_count, interval_end) AS target_count, last(target_cycle, interval_end) AS target_cycle,
  last(target_processed, interval_end) AS target_processed
FROM tracking_domain_stats WHERE interval_end >= $1 AND interval_end < $2 AND ($4='' OR script=$4) AND ($5='' OR name=$5)
GROUP BY bucket, script, name ORDER BY bucket, script, name LIMIT 20000`

const summary = (sql: SqlClient.SqlClient, now: number) => Effect.gen(function* () {
  const [processRows, domainRows] = yield* Effect.all([sql.unsafe<Row>(latestProcesses), sql.unsafe<Row>(latestDomains)], { concurrency: 2 })
  const domains = domainRows.map(row => domainState(row, now))
  const processes = processRows.map(row => {
    const observed = health(true, row.interval_end, now)
    const children = domains.filter(domain => domain.script === row.script)
    return { script: String(row.script), run_id: numeric(row.run_id), interval_start: iso(row.interval_start), interval_end: iso(row.interval_end),
      process_started_at: iso(row.process_started_at), ram_bytes: numeric(row.alloc_bytes), uptime_seconds: round(numeric(row.uptime_ms) / 1000),
      goroutines: numeric(row.goroutines), heap_objects: numeric(row.heap_objects), gc_cycles: numeric(row.gc_cycles),
      health: { ...observed, healthy: observed.healthy && children.every(domain => domain.health.healthy),
        reported_healthy: observed.reported_healthy && children.every(domain => domain.health.reported_healthy) } }
  })
  return { generated_at: new Date(now).toISOString(), stale_after_seconds: staleSeconds, processes, domains }
})

function groupedProcesses(rows: readonly Row[]) {
  type Point = { timestamp: string; observed_at: string; ram_bytes: number; uptime_seconds: number; goroutines: number; heap_objects: number; gc_cycles: number }
  const series = new Map<string, Point[]>()
  for (const row of rows) {
    const script = String(row.script), points = series.get(script) ?? []
    points.push({ timestamp: iso(row.bucket), observed_at: iso(row.observed_at), ram_bytes: Math.round(numeric(row.alloc_bytes)),
      uptime_seconds: round(numeric(row.uptime_ms) / 1000), goroutines: round(numeric(row.goroutines)),
      heap_objects: Math.round(numeric(row.heap_objects)), gc_cycles: numeric(row.gc_cycles) })
    series.set(script, points)
  }
  return [...series.keys()].sort().map(script => ({ script, points: series.get(script)! }))
}

function groupedDomains(rows: readonly Row[], responseStart: number) {
  type Point = ReturnType<typeof metrics> & { timestamp: string; observed_at: string; targets: ReturnType<typeof targetProgress>; reported_healthy: boolean }
  const series = new Map<string, { script: string; domain: string; points: Point[] }>()
  const previous = new Map<string, Snapshot>()
  for (const row of rows) {
    const script = String(row.script), domain = String(row.name), key = `${script}\0${domain}`, current = snapshot(row), prior = previous.get(key)
    previous.set(key, current)
    if (millis(row.bucket) < responseStart) continue
    const duration = numeric(row.duration_seconds)
    const targetDuration = prior && current.observedAt > prior.observedAt ? (current.observedAt - prior.observedAt) / 1000 : duration
    const item = series.get(key) ?? { script, domain, points: [] }
    item.points.push({ timestamp: iso(row.bucket), observed_at: iso(row.observed_at), ...metrics(row, duration),
      targets: targetProgress(current, rate(targetDelta(current, prior), targetDuration), current.observedAt, false), reported_healthy: Boolean(row.healthy) })
    series.set(key, item)
  }
  return [...series.keys()].sort().map(key => series.get(key)!)
}

const timeseries = (sql: SqlClient.SqlClient, query: ReturnType<typeof parseTrackingQuery>, now: number) => Effect.gen(function* () {
  const [duration, bucket] = windows[query.window]
  const end = Math.floor(now / (bucket * 1000)) * bucket * 1000, start = end - duration * 1000
  const [processRows, domainRows] = yield* Effect.all([
    query.domain ? Effect.succeed([] as readonly Row[]) : sql.unsafe<Row>(processSeries, [new Date(start), new Date(end), `${bucket} seconds`, query.script]),
    sql.unsafe<Row>(domainSeries, [new Date(start - bucket * 1000), new Date(end), `${bucket} seconds`, query.script, query.domain]),
  ], { concurrency: 2 })
  return { generated_at: new Date(now).toISOString(), window: query.window, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
    bucket_seconds: bucket, max_points_per_series: duration / bucket, processes: groupedProcesses(processRows), domains: groupedDomains(domainRows, start) }
})

export const executeTrackingRead = (endpoint: "summary" | "timeseries", query: unknown) => Effect.gen(function* () {
  const parsed = yield* Effect.try({ try: () => parseTrackingQuery(endpoint === "summary" ? {} : query), catch: cause => cause as InvalidRequest })
  const sql = yield* SqlClient.SqlClient
  const now = Date.now()
  return yield* (endpoint === "summary" ? summary(sql, now) : timeseries(sql, parsed, now))
}).pipe(Effect.timeout("10 seconds"), Effect.mapError(cause => cause instanceof InvalidRequest ? cause : new DatabaseFailure({ cause, message: "Tracking statistics store is unavailable" })))

export const trackingReadInternals = { health, targetDelta, targetProgress, domainState, groupedDomains, groupedProcesses, windows, processSeries, domainSeries }
