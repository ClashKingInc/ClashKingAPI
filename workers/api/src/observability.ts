import * as Sentry from "@sentry/cloudflare"
import { adminEndpoints, botEndpoints, dashboardEndpoints, endpoints, expoEndpoints, type AnyEndpoint } from "@clashking/api-contracts"

import type { WorkerBindings } from "./environment.js"
import { isApiDocumentationRequest } from "./api-documentation.js"
import { isJsonTranscriptRequest } from "./ticket-json-transcript.js"

const endpointMaps = [expoEndpoints, dashboardEndpoints, botEndpoints, adminEndpoints, endpoints] as const
const descriptors = [...new Map(endpointMaps.flatMap((map) => Object.values(map) as ReadonlyArray<AnyEndpoint>)
  .map((endpoint) => [`${endpoint.method} ${endpoint.path}`, endpoint])).values()]

const patterns = descriptors.map((endpoint) => ({
  endpoint,
  pattern: new RegExp(`^${endpoint.path.split("/").map((segment) => segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("/")}$`, "u"),
}))

export const requestRouteTemplate = (request: Request): string | undefined => {
  if (isJsonTranscriptRequest(request)) return undefined
  const path = new URL(request.url).pathname
  if (isApiDocumentationRequest(request)) {
    if (path.startsWith("/swagger/")) return "/swagger/*"
    if (path.startsWith("/docs/")) return "/docs/*"
    return path
  }
  const method = request.method.toUpperCase()
  const matched = patterns.find(({ endpoint, pattern }) => endpoint.method === method && pattern.test(path))
  if (matched !== undefined) return matched.endpoint.path
  if (method === "OPTIONS" && (path.startsWith("/v2/") || path.startsWith("/proxy/v1/"))) return "/preflight"
  return path.startsWith("/v2/") ? "/v2/unmatched" : path.startsWith("/proxy/v1/") ? "/proxy/v1/unmatched" : "/unmatched"
}

export const recordRequestTiming = (bindings: WorkerBindings, route: string, method: string, status: number, durationMs: number): void => {
  console.log(JSON.stringify({ level: "info", event: "request_complete", route, method, status,
    durationMs: Math.max(0, durationMs) }))
  try {
    if (!bindings.API_REQUEST_TIMINGS || !bindings.CF_VERSION_METADATA) return
    const version = bindings.CF_VERSION_METADATA
    bindings.API_REQUEST_TIMINGS.writeDataPoint({
      indexes: [route],
      blobs: [route, method, String(status), bindings.ENVIRONMENT, version.id, version.tag ?? ""],
      doubles: [Math.max(0, durationMs), 1],
    })
  } catch {
    console.error(JSON.stringify({ level: "error", event: "request_timing_write_failed" }))
  }
}

const suppressionWindowMs = 60_000
const maximumFingerprints = 128
const recentErrors = new Map<string, number>()

const safeFingerprintPart = (value: string): string | undefined =>
  value.length > 0 && value.length <= 160 && /^[a-z0-9_./:-]+$/iu.test(value) ? value : undefined

const eventFingerprint = (event: Sentry.ErrorEvent): ReadonlyArray<string> => {
  const explicit = event.fingerprint?.map(safeFingerprintPart)
  if (explicit !== undefined && explicit.length > 0 && explicit.every((part) => part !== undefined)) return explicit as ReadonlyArray<string>
  const type = safeFingerprintPart(event.exception?.values?.[0]?.type ?? "") ?? "unknown"
  return ["worker-api", "sdk", type]
}

export const filterSentryEvent = (event: Sentry.ErrorEvent): Sentry.ErrorEvent | null => {
  const now = Date.now()
  for (const [key, seenAt] of recentErrors) if (now - seenAt >= suppressionWindowMs) recentErrors.delete(key)
  const fingerprint = eventFingerprint(event)
  const fingerprintKey = fingerprint.join(":")
  const seenAt = recentErrors.get(fingerprintKey)
  if (seenAt !== undefined && now - seenAt < suppressionWindowMs) return null
  if (recentErrors.size >= maximumFingerprints) recentErrors.delete(recentErrors.keys().next().value as string)
  recentErrors.set(fingerprintKey, now)
  const safe: Sentry.ErrorEvent = {
    ...event,
    fingerprint: [...fingerprint],
    message: "Worker failure",
    breadcrumbs: [],
    contexts: {},
    extra: {},
    tags: Object.fromEntries(Object.entries(event.tags ?? {}).filter(([key, value]) =>
      ["error_kind", "http_method", "http_route", "http_status"].includes(key) && typeof value === "string" && safeFingerprintPart(value) !== undefined)),
    ...(event.exception?.values === undefined ? {} : { exception: { values: event.exception.values.map((value) => ({
      type: safeFingerprintPart(value.type ?? "") ?? "Error",
      value: "Worker failure",
    })) } }),
  }
  delete safe.request
  delete safe.transaction
  delete safe.user
  delete safe.logentry
  delete safe.modules
  delete safe.server_name
  delete safe.threads
  delete safe.debug_meta
  return safe
}

export const sentryOptions = (bindings: WorkerBindings): Sentry.CloudflareOptions | undefined => {
  const dsn = bindings.SENTRY_DSN_API?.trim()
  if (!dsn) return undefined
  return {
    dsn,
    environment: bindings.ENVIRONMENT,
    release: bindings.CF_VERSION_METADATA.id,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    attachStacktrace: false,
    defaultIntegrations: false,
    tracesSampleRate: 0,
    beforeSend: filterSentryEvent,
    beforeSendTransaction: () => null,
    skipOpenTelemetrySetup: true,
  }
}

export const captureWorkerError = (kind: "database" | "upstream" | "defect", route: string, method: string, status: number): void => {
  Sentry.withScope((scope) => {
    scope.setLevel("error")
    scope.setFingerprint(["worker-api", kind, method, route])
    scope.setTags({ error_kind: kind, http_method: method, http_route: route, http_status: String(status) })
    Sentry.captureMessage(kind === "defect" ? "Unhandled Worker failure" : `${kind === "database" ? "Database" : "Upstream"} request failed`)
  })
}

export const observabilityInternals = {
  resetSuppression: () => recentErrors.clear(),
}
