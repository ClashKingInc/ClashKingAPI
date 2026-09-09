import { afterEach, describe, expect, it, vi } from "vitest"

import type { WorkerBindings } from "./environment.js"
import { filterSentryEvent, observabilityInternals, recordRequestTiming, requestRouteTemplate, sentryOptions } from "./observability.js"

afterEach(() => {
  observabilityInternals.resetSuppression()
  vi.useRealTimers()
})

describe("Worker observability", () => {
  it("uses contract route templates and never exposes unmatched or transcript paths", () => {
    expect(requestRouteTemplate(new Request("https://api.clashk.ing/v2/server/1234567890123456789/settings?token=secret"))).toBe("/v2/server/:serverId/settings")
    expect(requestRouteTemplate(new Request("https://api.clashk.ing/v2/private/value"))).toBe("/v2/unmatched")
    expect(requestRouteTemplate(new Request("https://api.clashk.ing/v2/ticket-transcripts/secret-capability"))).toBeUndefined()
  })

  it("writes one unbiased route timing record with release metadata", () => {
    const writeDataPoint = vi.fn()
    const bindings = {
      API_REQUEST_TIMINGS: { writeDataPoint },
      CF_VERSION_METADATA: { id: "version-id", tag: "release-tag", timestamp: "2026-09-06T00:00:00Z" },
      ENVIRONMENT: "test",
    } as unknown as WorkerBindings
    recordRequestTiming(bindings, "/v2/health", "GET", 200, 12.5)
    expect(writeDataPoint).toHaveBeenCalledExactlyOnceWith({
      indexes: ["/v2/health"],
      blobs: ["/v2/health", "GET", "200", "test", "version-id", "release-tag"],
      doubles: [12.5, 1],
    })
  })

  it("suppresses repeated error fingerprints and removes request data", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-06T00:00:00Z"))
    const event = { type: undefined, fingerprint: ["worker-api", "database", "GET", "/v2/health"], request: { url: "https://secret.invalid" }, user: { id: "secret" } }
    expect(filterSentryEvent(event)).toMatchObject({ fingerprint: event.fingerprint, message: "Worker failure", breadcrumbs: [], contexts: {}, extra: {} })
    expect(filterSentryEvent(event)).toBeNull()
    vi.advanceTimersByTime(60_000)
    expect(filterSentryEvent(event)).not.toBeNull()
  })

  it("scrubs raw SDK exception text and stacks while separating safe exception types", () => {
    const raw = (type: string) => ({
      type: undefined,
      message: "database password=private",
      exception: { values: [{ type, value: "token=private", stacktrace: { frames: [{ filename: "/private/secret.ts" }] } }] },
      request: { url: "https://secret.invalid/capability" },
      tags: { http_route: "/v2/health", unsafe: "private" },
    })
    const first = filterSentryEvent(raw("DatabaseFailure"))!
    expect(first).toMatchObject({
      fingerprint: ["worker-api", "sdk", "DatabaseFailure"], message: "Worker failure",
      exception: { values: [{ type: "DatabaseFailure", value: "Worker failure" }] },
      tags: { http_route: "/v2/health" },
    })
    expect(JSON.stringify(first)).not.toMatch(/password|token|secret\.ts|unsafe|private/u)
    expect(filterSentryEvent(raw("UpstreamFailure"))).not.toBeNull()
  })

  it("keeps API Sentry disabled until its own DSN is configured", () => {
    const base = { ENVIRONMENT: "test", CF_VERSION_METADATA: { id: "version-id" } } as unknown as WorkerBindings
    expect(sentryOptions(base)).toBeUndefined()
    const configured = sentryOptions({ ...base, SENTRY_DSN_API: "https://public@example.invalid/1" })
    expect(configured).toMatchObject({ environment: "test", release: "version-id", tracesSampleRate: 0, sendDefaultPii: false })
  })
})
