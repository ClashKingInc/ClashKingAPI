import {
  AppConfigResponse,
  GroupedCountsResponse,
  GlobalCounts,
  HomeActivityRequest,
  HomeActivityResponse,
  HealthResponse,
  StatsPerformanceResponse,
  endpoints as apiEndpoints,
} from "@clashking/api-contracts"
import { Effect, Schema } from "effect"

import { dispatchAdmin } from "./admin.js"
import { dispatchAuthLifecycle } from "./auth-lifecycle.js"
import { dispatchAppContentNotifications } from "./app-content-notifications.js"
import { dispatchBotAdjacentRuntime } from "./bot-adjacent-runtime.js"
import { dispatchBotRuntime } from "./bot-runtime.js"
import { dispatchDashboardRoster } from "./dashboard-roster-runtime.js"
import { dispatchDashboardRosterAIContext } from "./dashboard-roster-ai-context.js"
import { dispatchDashboardRosterAIUsage } from "./dashboard-roster-ai-usage.js"
import { dispatchPublicData } from "./public-data-runtime.js"
import { dispatchPublicMetadata } from "./public-metadata-runtime.js"
import { dispatchDashboardServer } from "./dashboard-server-runtime.js"
import { dispatchDashboardMisc } from "./dashboard-misc-runtime.js"
import { dispatchWarExports } from "./war-exports.js"
import { dispatchMobilePersistence } from "./mobile-persistence.js"
import { dispatchCdnUpload } from "./cdn-upload.js"
import { dispatchMedia } from "./media-runtime.js"
import { dispatchAnnouncementMutations } from "./announcement-mutations.js"
import { dispatchDashboardRosterBonuses } from "./dashboard-roster-bonuses.js"
import { dispatchAccountMutations } from "./account-mutations.js"
import { dispatchLinkMutations } from "./link-mutations.js"
import { dispatchBillingMutations } from "./billing-runtime.js"
import { dispatchDashboardRosterSnapshots } from "./dashboard-roster-snapshots.js"
import { dispatchInitialization } from "./initialization.js"
import { dispatchPublicPlayerExtra } from "./public-player-extra.js"
import { dispatchPublicClanExtra } from "./public-clan-extra.js"
import { AuthIdentity, type UserPrincipal } from "./auth.js"
import { serveAppUpdateManifest } from "./app-updates.js"
import { loadAppConfig } from "./app-config.js"
import { prepareStaticMetadata, staticMetadataSectionsForPath } from "./static-metadata.js"
import type { ApiFailure } from "./errors.js"
import { InvalidRequest, NotFound, NotImplemented } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { proxyRequest } from "./proxy.js"
import { queryHomeActivity } from "./home.js"
import { readBoundedJson } from "./request-body.js"
import {
  queryCwlStats,
  queryGroupedCounts,
  queryGlobalCounts,
  queryRankedStats,
  queryWarStats,
  parseStatsCwlQuery,
  parseStatsRankedQuery,
  parseStatsWarQuery,
} from "./stats.js"
import { dispatchLeagueAnalytics } from "./league-analytics.js"
import { dispatchStatsHistory } from "./stats-history.js"
import { dispatchLegacyPublic } from "./legacy-public.js"

const jsonHeaders = { "content-type": "application/json; charset=utf-8" }

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: jsonHeaders })
const parseStatsQuery = <A>(parse: () => A) => Effect.try({
  try: parse,
  catch: (cause) => cause instanceof InvalidRequest ? cause : new InvalidRequest({ message: "Statistics query is invalid" }),
})

export const failureResponse = (failure: ApiFailure, requestId: string): Response => {
  switch (failure._tag) {
    case "InvalidRequest":
      return json({ code: "invalid_request", message: failure.message, request_id: requestId, ...(failure.details === undefined ? {} : { details: failure.details }) }, failure.status ?? 400)
    case "Unauthenticated":
      return json({ code: "unauthenticated", message: failure.message, request_id: requestId }, 401)
    case "Forbidden":
      return json({ code: "forbidden", message: failure.message, request_id: requestId, ...(failure.reason === undefined ? {} : { reason: failure.reason }) }, 403)
    case "NotFound":
      return json({ code: "not_found", message: failure.message, request_id: requestId }, 404)
    case "NotImplemented":
      return json({ code: "not_implemented", message: failure.message, request_id: requestId }, 501)
    case "RateLimited": {
      const response = json({ code: "rate_limited", message: failure.message, request_id: requestId }, 429)
      response.headers.set("retry-after", String(failure.retryAfterSeconds))
      return response
    }
    case "Conflict":
      return json({ code: "conflict", message: failure.message, request_id: requestId, ...(failure.reason === undefined ? {} : { reason: failure.reason }) }, 409)
    case "PayloadTooLarge":
      return json({ code: "payload_too_large", message: failure.message, request_id: requestId }, 413)
    case "UnprocessableEntity":
      return json({ code: "unprocessable_entity", message: failure.message, request_id: requestId }, 422)
    case "DatabaseFailure":
    case "UpstreamUnavailable":
      return json({ code: "upstream_unavailable", message: failure.message, request_id: requestId }, 503)
  }
}

const decodeJson = <A>(request: Request, schema: Schema.Codec<A, unknown, never, never>) =>
  Effect.gen(function* () {
    const contentType = request.headers.get("content-type")?.toLowerCase().trim() ?? ""
    if (!contentType.startsWith("application/json")) {
      return yield* new InvalidRequest({
        message: "Content-Type must be application/json",
        status: 415,
      })
    }
    return yield* readBoundedJson(request)
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError((cause) =>
      cause instanceof InvalidRequest || cause._tag === "PayloadTooLarge"
        ? cause
        : new InvalidRequest({ message: "Request body failed schema validation" }),
    ),
  )

export const encodeJson = <A>(schema: Schema.Codec<A, unknown, never, never>, value: A, status = 200) =>
  Schema.encodeUnknownEffect(schema)(value).pipe(
    Effect.map((encoded) => json(encoded, status)),
    Effect.orDie,
  )

const adminCors = (request: Request, response: Response, bindings: WorkerBindings): Response => {
  const origin = request.headers.get("origin")
  if (origin === null) return response
  const allowed = bindings.ADMIN_ALLOWED_ORIGINS.split(",").map((value) => value.trim())
  if (!allowed.includes(origin)) return response
  const headers = new Headers(response.headers)
  headers.set("access-control-allow-origin", origin)
  headers.set("access-control-allow-credentials", "true")
  headers.set("access-control-expose-headers", "X-Request-ID, Retry-After, Content-Disposition")
  headers.append("vary", "Origin")
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export const browserCors = (request: Request, response: Response, bindings: WorkerBindings): Response => {
  const origin = request.headers.get("origin")
  if (origin === null) return response
  const allowed = bindings.WEB_ALLOWED_ORIGINS.split(",").map((value) => value.trim())
  if (!allowed.includes(origin)) return response
  const headers = new Headers(response.headers)
  headers.set("access-control-allow-origin", origin)
  headers.set("access-control-allow-credentials", "true")
  headers.set("access-control-expose-headers", "X-Request-ID, Retry-After, Content-Disposition")
  headers.append("vary", "Origin")
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

const endpointMatchers = Object.values(apiEndpoints).map((endpoint) => ({
  auth: endpoint.auth, method: endpoint.method,
  pattern: new RegExp(`^${endpoint.path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replaceAll(/:[A-Za-z0-9_]+/gu, "[^/]+")}$`, "u"),
  path: endpoint.path,
}))
const isOpenPublicRequest = (request: Request) => {
  const url = new URL(request.url)
  const method = request.method === "OPTIONS" ? request.headers.get("access-control-request-method") ?? "GET" : request.method
  const matches = endpointMatchers.filter((endpoint) => endpoint.method === method && endpoint.pattern.test(url.pathname))
  return matches.length > 0 && matches.every((endpoint) => endpoint.auth === "public" &&
    !endpoint.path.startsWith("/v2/auth/") && !endpoint.path.startsWith("/v2/billing/"))
}
const publicCors = (request: Request, response: Response): Response => {
  if (request.headers.get("origin") === null) return response
  const headers = new Headers(response.headers)
  headers.set("access-control-allow-origin", "*")
  headers.set("access-control-expose-headers", "X-Request-ID, Retry-After, Content-Disposition")
  headers.delete("access-control-allow-credentials")
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export const applyCors = (request: Request, response: Response, bindings: WorkerBindings): Response => {
  if (isOpenPublicRequest(request)) return publicCors(request, response)
  return new URL(request.url).pathname.startsWith("/v2/admin/") ? adminCors(request, response, bindings) : browserCors(request, response, bindings)
}

export const adminPreflight = (request: Request, bindings: WorkerBindings): Response => {
  const response = new Response(null, { status: 204 })
  const withOrigin = adminCors(request, response, bindings)
  const headers = new Headers(withOrigin.headers)
  headers.set("access-control-allow-methods", "DELETE, GET, PATCH, POST, PUT")
  headers.set("access-control-allow-headers", "Content-Type, X-Requested-With, X-Request-ID, Traceparent, Tracestate")
  headers.set("access-control-max-age", "86400")
  return new Response(null, { status: 204, headers })
}

export const browserPreflight = (request: Request, bindings: WorkerBindings): Response => {
  const withOrigin = isOpenPublicRequest(request) ? publicCors(request, new Response(null, { status: 204 })) : browserCors(request, new Response(null, { status: 204 }), bindings)
  const headers = new Headers(withOrigin.headers)
  headers.set("access-control-allow-methods", "DELETE, GET, PATCH, POST, PUT")
  headers.set("access-control-allow-headers", "Accept, Authorization, Content-Type, X-Device-ID, X-Request-ID, Traceparent, Tracestate")
  headers.set("access-control-max-age", "86400")
  return new Response(null, { status: 204, headers })
}

export const route = (request: Request, bindings: WorkerBindings,
  onProxyResponse?: (principal: UserPrincipal, request: Request, response: Response) => void,
) =>
  Effect.gen(function* () {
    const url = new URL(request.url)
    if (request.method === "OPTIONS" && url.pathname.startsWith("/v2/admin/")) {
      return adminPreflight(request, bindings)
    }
    if (request.method === "OPTIONS") {
      return browserPreflight(request, bindings)
    }
    const staticSections = staticMetadataSectionsForPath(url.pathname)
    if (staticSections.length > 0) yield* prepareStaticMetadata(bindings, staticSections)
    if (request.method === "GET" && url.pathname === "/v2/health") {
      return yield* encodeJson(HealthResponse, { status: "ok", runtime: "cloudflare-worker", version: "0.1.0-rc.13" })
    }
    if (request.method === "GET" && url.pathname === "/v2/app/config") {
      return yield* encodeJson(AppConfigResponse, yield* loadAppConfig)
    }
    if (request.method === "GET" && url.pathname === "/v2/app/updates/manifest") {
      return yield* serveAppUpdateManifest(request, bindings)
    }
    if (request.method === "POST" && url.pathname === "/v2/home/activity") {
      const body = yield* decodeJson(request, HomeActivityRequest)
      const auth = yield* AuthIdentity
      const principal = yield* auth.requireUserOrBot(request)
      return yield* encodeJson(HomeActivityResponse, yield* queryHomeActivity(body, principal))
    }
    if (request.method === "GET" && url.pathname === "/v2/stats/ranked") {
      const query = yield* parseStatsQuery(() => parseStatsRankedQuery(url.searchParams))
      return yield* encodeJson(StatsPerformanceResponse, yield* queryRankedStats(query))
    }
    if (request.method === "GET" && url.pathname === "/v2/stats/war") {
      const query = yield* parseStatsQuery(() => parseStatsWarQuery(url.searchParams))
      return yield* encodeJson(StatsPerformanceResponse, yield* queryWarStats(query))
    }
    if (request.method === "GET" && url.pathname === "/v2/stats/cwl") {
      const query = yield* parseStatsQuery(() => parseStatsCwlQuery(url.searchParams))
      return yield* encodeJson(StatsPerformanceResponse, yield* queryCwlStats(query))
    }
    const analyticsResponse = yield* dispatchLeagueAnalytics(request)
    if (analyticsResponse !== undefined) return analyticsResponse
    const statsHistoryResponse = yield* dispatchStatsHistory(request)
    if (statsHistoryResponse !== undefined) return statsHistoryResponse
    if (request.method === "GET" && url.pathname === "/v2/counts") {
      return yield* encodeJson(GlobalCounts, yield* queryGlobalCounts)
    }
    if (request.method === "GET" && url.pathname === "/v2/counts/players/town-halls") {
      return yield* encodeJson(GroupedCountsResponse, yield* queryGroupedCounts("townhall_level"))
    }
    if (request.method === "GET" && url.pathname === "/v2/counts/players/builder-halls") {
      return yield* new NotImplemented({ message: "Builder Hall counts are not implemented" })
    }
    if (request.method === "GET" && url.pathname === "/v2/counts/players/league-tiers") {
      return yield* encodeJson(GroupedCountsResponse, yield* queryGroupedCounts("league_tier_id"))
    }
    if (request.method === "GET" && url.pathname === "/v2/counts/clans/locations") {
      return yield* encodeJson(GroupedCountsResponse, yield* queryGroupedCounts("location_id"))
    }
    if (request.method === "GET" && url.pathname === "/v2/counts/clans/cwl-leagues") {
      return yield* encodeJson(GroupedCountsResponse, yield* queryGroupedCounts("cwl_league_id"))
    }
    if (request.method === "GET" && url.pathname === "/v2/counts/clans/capital-leagues") {
      return yield* encodeJson(GroupedCountsResponse, yield* queryGroupedCounts("capital_league_id"))
    }
    if (url.pathname.startsWith("/proxy/v1/")) {
      const auth = yield* AuthIdentity
      const principal = yield* auth.requireUser(request)
      const response = yield* proxyRequest(request, bindings)
      if (onProxyResponse !== undefined) {
        yield* Effect.sync(() => onProxyResponse(principal, request, response))
      }
      return response
    }
    const legacyResponse = yield* dispatchLegacyPublic(request)
    if (legacyResponse !== undefined) return legacyResponse
    const authResponse = yield* dispatchAuthLifecycle(request, bindings)
    if (authResponse !== undefined) return authResponse
    const accountResponse = yield* dispatchAccountMutations(request)
    if (accountResponse !== undefined) return accountResponse
    const linkResponse = yield* dispatchLinkMutations(request, bindings)
    if (linkResponse !== undefined) return linkResponse
    const billingResponse = yield* dispatchBillingMutations(request, bindings)
    if (billingResponse !== undefined) return billingResponse
    const adminResponse = yield* dispatchAdmin(request, bindings)
    if (adminResponse !== undefined) return adminResponse
    const contentResponse = yield* dispatchAppContentNotifications(request, bindings)
    if (contentResponse !== undefined) return contentResponse
    const announcementResponse = yield* dispatchAnnouncementMutations(request)
    if (announcementResponse !== undefined) return announcementResponse
    const botAdjacentResponse = yield* dispatchBotAdjacentRuntime(request, bindings)
    if (botAdjacentResponse !== undefined) return botAdjacentResponse
    const moderationResponse = yield* dispatchBotRuntime(request, bindings)
    if (moderationResponse !== undefined) return moderationResponse
    // Discord command orchestration is deferred to the Bot specification. Its
    // reference modules remain in this checkout, but are not API dispatchers.
    const metadataResponse = yield* dispatchPublicMetadata(request, bindings)
    if (metadataResponse !== undefined) return metadataResponse
    const publicDataResponse = yield* dispatchPublicData(request, bindings)
    if (publicDataResponse !== undefined) return publicDataResponse
    const serverResponse = yield* dispatchDashboardServer(request, bindings)
    if (serverResponse !== undefined) return serverResponse
    const bonusResponse = yield* dispatchDashboardRosterBonuses(request)
    if (bonusResponse !== undefined) return bonusResponse
    const snapshotResponse = yield* dispatchDashboardRosterSnapshots(request, bindings)
    if (snapshotResponse !== undefined) return snapshotResponse
    const aiContextResponse = yield* dispatchDashboardRosterAIContext(request, bindings.AI_ROSTER_MAX_PROMPT_CHARS)
    if (aiContextResponse !== undefined) return aiContextResponse
    const aiUsageResponse = yield* dispatchDashboardRosterAIUsage(request, bindings.AI_USAGE_SECRET)
    if (aiUsageResponse !== undefined) return aiUsageResponse
    const rosterResponse = yield* dispatchDashboardRoster(request, bindings)
    if (rosterResponse !== undefined) return rosterResponse
    const miscResponse = yield* dispatchDashboardMisc(request, bindings)
    if (miscResponse !== undefined) return miscResponse
    const exportResponse = yield* dispatchWarExports(request)
    if (exportResponse !== undefined) return exportResponse
    const mobileResponse = yield* dispatchMobilePersistence(request, bindings)
    if (mobileResponse !== undefined) return mobileResponse
    const uploadResponse = yield* dispatchCdnUpload(request, bindings)
    if (uploadResponse !== undefined) return uploadResponse
    const mediaResponse = yield* dispatchMedia(request, bindings)
    if (mediaResponse !== undefined) return mediaResponse
    const initializationResponse = yield* dispatchInitialization(request, bindings)
    if (initializationResponse !== undefined) return initializationResponse
    const playerExtraResponse = yield* dispatchPublicPlayerExtra(request, bindings)
    if (playerExtraResponse !== undefined) return playerExtraResponse
    const clanExtraResponse = yield* dispatchPublicClanExtra(request, bindings)
    if (clanExtraResponse !== undefined) return clanExtraResponse
    return yield* new NotFound({ message: "Route not found" })
  })

export const recoverRoute = (requestId: string) =>
  Effect.catch((failure: ApiFailure) => Effect.succeed(failureResponse(failure, requestId)))

export const recoverDefectWith = (onDefect?: () => void) => Effect.catchCause(() => {
  // Schema defects can carry response tokens and SQL defects can carry bound
  // parameters. Do not serialize arbitrary causes into application logs.
  onDefect?.()
  console.error(JSON.stringify({ level: "error", event: "unhandled_effect_failure" }))
  return Effect.succeed(json({ code: "internal_error", message: "Internal server error" }, 500))
})

export const recoverDefect = recoverDefectWith()
