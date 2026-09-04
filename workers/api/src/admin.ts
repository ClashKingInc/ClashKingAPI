import { adminEndpoints, type AnyEndpoint, type HttpMethod } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AccessIdentity, type AdminPrincipal } from "./access.js"
import { executeAdminOperation, type AdminOperationInput, type AdminWorkerBindings } from "./admin-operations.js"
import type { ApiFailure } from "./errors.js"
import { InvalidRequest, UpstreamUnavailable } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { readDashboardMultipart } from "./dashboard-upload.js"

export interface AdminRuntimeRoute {
  readonly method: HttpMethod
  readonly path: string
}

export const adminRuntimeRoutes = [
  { method: "GET", path: "/v2/admin/me" },
  { method: "GET", path: "/v2/admin/dashboard" },
  { method: "GET", path: "/v2/admin/audit" },
  { method: "GET", path: "/v2/admin/proxy/stats" },
  { method: "GET", path: "/v2/admin/tracking/summary" },
  { method: "GET", path: "/v2/admin/tracking/timeseries" },
  { method: "GET", path: "/v2/admin/developer-applications" },
  { method: "POST", path: "/v2/admin/developer-applications" },
  { method: "GET", path: "/v2/admin/developer-applications/:applicationId" },
  { method: "PATCH", path: "/v2/admin/developer-applications/:applicationId" },
  { method: "DELETE", path: "/v2/admin/developer-applications/:applicationId" },
  { method: "GET", path: "/v2/admin/feature-flags" },
  { method: "POST", path: "/v2/admin/feature-flags" },
  { method: "PATCH", path: "/v2/admin/feature-flags/:key" },
  { method: "GET", path: "/v2/admin/app-releases" },
  { method: "PUT", path: "/v2/admin/app-releases/channels/:track/:platform/:runtimeVersion" },
  { method: "GET", path: "/v2/admin/posts" },
  { method: "POST", path: "/v2/admin/posts" },
  { method: "GET", path: "/v2/admin/posts/:id" },
  { method: "PATCH", path: "/v2/admin/posts/:id" },
  { method: "DELETE", path: "/v2/admin/posts/:id" },
  { method: "GET", path: "/v2/admin/posts/:id/audience" },
  { method: "GET", path: "/v2/admin/posts/:id/deliveries" },
  { method: "GET", path: "/v2/admin/posts/:id/revisions" },
  { method: "POST", path: "/v2/admin/posts/:id/revisions/:revision/restore" },
  { method: "POST", path: "/v2/admin/posts/:id/publish" },
  { method: "POST", path: "/v2/admin/posts/:id/push" },
  { method: "POST", path: "/v2/admin/posts/:id/duplicate" },
  { method: "GET", path: "/v2/admin/campaigns" },
  { method: "POST", path: "/v2/admin/campaigns" },
  { method: "PATCH", path: "/v2/admin/campaigns/:id" },
  { method: "GET", path: "/v2/admin/push/audience" },
  { method: "POST", path: "/v2/admin/push/test" },
  { method: "GET", path: "/v2/admin/push/lab/types" },
  { method: "GET", path: "/v2/admin/push/lab/status" },
  { method: "GET", path: "/v2/admin/push/lab/devices" },
  { method: "POST", path: "/v2/admin/push/lab/send" },
  { method: "POST", path: "/v2/admin/media/upload" },
  { method: "POST", path: "/v2/admin/stories/upload" },
] as const satisfies ReadonlyArray<AdminRuntimeRoute>

interface MatchedAdminRoute {
  readonly endpoint: AnyEndpoint
  readonly path: Readonly<Record<string, unknown>>
}

const endpoints = Object.values(adminEndpoints) as ReadonlyArray<AnyEndpoint>

const matchPath = (template: string, pathname: string): Readonly<Record<string, unknown>> | undefined => {
  const expected = template.split("/")
  const actual = pathname.split("/")
  if (expected.length !== actual.length) return undefined
  const values: Record<string, unknown> = {}
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index]
    const value = actual[index]
    if (segment === undefined || value === undefined) return undefined
    if (!segment.startsWith(":")) {
      if (segment !== value) return undefined
      continue
    }
    try {
      values[segment.slice(1)] = decodeURIComponent(value)
    } catch {
      return undefined
    }
  }
  if (typeof values.revision === "string" && /^\d+$/u.test(values.revision)) {
    values.revision = Number(values.revision)
  }
  return values
}

export const matchAdminRoute = (request: Request): MatchedAdminRoute | undefined => {
  const pathname = new URL(request.url).pathname
  const method = request.method.toUpperCase()
  for (const endpoint of endpoints) {
    if (endpoint.method !== method) continue
    const path = matchPath(endpoint.path, pathname)
    if (path !== undefined) return { endpoint, path }
  }
  return undefined
}

export const requiredAdminRole = (endpoint: Pick<AnyEndpoint, "method" | "operationId">): "admin" | "owner" =>
  endpoint.method === "GET" && !endpoint.operationId.startsWith("adminLab") ? "admin" : "owner"

const numberQueryFields = new Set(["days", "limit"])

const queryInput = (endpoint: AnyEndpoint, url: URL): Readonly<Record<string, unknown>> => {
  const query: Record<string, unknown> = {}
  for (const [key, value] of url.searchParams) {
    query[key] = numberQueryFields.has(key) ? Number(value) : value
  }
  if (endpoint.operationId === "adminTrackingTimeseries" && query.window === undefined) {
    query.window = "1h"
  }
  return query
}

const decode = (schema: AnyEndpoint["body"], value: unknown, label: string) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(() => new InvalidRequest({ message: `${label} failed schema validation` })),
  )

const bodyInput = (request: Request, endpoint: AnyEndpoint) => {
  if (endpoint.bodyMode === "none") return Effect.succeed({})
  if (endpoint.bodyMode === "multipart") {
    return readDashboardMultipart(request).pipe(Effect.flatMap((body) => decode(endpoint.body, body, "Request body")))
  }
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? ""
  if (!contentType.startsWith("application/json")) {
    return Effect.fail(new InvalidRequest({ message: "Content-Type must be application/json", status: 415 }))
  }
  return readBoundedJson(request).pipe(Effect.flatMap((body) => decode(endpoint.body, body, "Request body")))
}

const responseFor = (endpoint: AnyEndpoint, value: unknown) => {
  if (value instanceof Response) return Effect.succeed(value)
  if (endpoint.responseMode === "none") return Effect.succeed(new Response(null, { status: endpoint.successStatus }))
  return Schema.encodeUnknownEffect(endpoint.response)(value).pipe(
    Effect.map((encoded) => Response.json(encoded, {
      status: endpoint.successStatus,
      headers: { "cache-control": "no-store" },
    })),
    Effect.mapError((cause) => new UpstreamUnavailable({
      cause,
      message: `Admin response failed contract encoding for ${endpoint.operationId}`,
    })),
  )
}

export const dispatchAdmin = (
  request: Request,
  bindings: AdminWorkerBindings,
): Effect.Effect<Response | undefined, ApiFailure, AccessIdentity | SqlClient.SqlClient> => {
  const match = matchAdminRoute(request)
  if (match === undefined) return Effect.succeed(undefined)
  return Effect.gen(function* () {
    const access = yield* AccessIdentity
    const principal = yield* access.requireAdmin(request, requiredAdminRole(match.endpoint))
    const path = yield* decode(match.endpoint.pathParams, match.path, "Path parameters")
    const query = yield* decode(match.endpoint.query, queryInput(match.endpoint, new URL(request.url)), "Query parameters")
    const body = yield* bodyInput(request, match.endpoint)
    const input: AdminOperationInput = { request, bindings, principal, path, query, body }
    const value = yield* executeAdminOperation(match.endpoint.operationId, input)
    return yield* responseFor(match.endpoint, value)
  }).pipe(Effect.withSpan(`Admin.${match.endpoint.operationId}`))
}

export type { AdminPrincipal, AdminWorkerBindings }
