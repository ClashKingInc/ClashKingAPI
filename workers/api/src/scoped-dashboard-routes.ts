import { endpoints } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { ServerAuthorization } from "./server-authorization.js"

// Only these reviewed management families may resolve scope outside /server/:id.
// Requiring server-* metadata excludes account, signup and AI-token endpoints.
const routes = Object.values(endpoints).filter(endpoint => endpoint.auth.startsWith("server-")
  && /^\/v2\/(?:roster(?:\/|$)|roster-group(?:\/|$)|roster-automation(?:\/|$)|links\/server\/)/u.test(endpoint.path))
  .sort((a, b) => a.path.split(":").length - b.path.split(":").length)

export const authorizeAdditionalDashboardRoute = (request: Request, scopedServerId: string) => Effect.gen(function* () {
  const url = new URL(request.url), parts = url.pathname.split("/")
  // A server session may acknowledge only its own person's AI notice. This
  // exact exception grants no access to profiles, exports or other user routes.
  if (url.pathname === "/v2/users/me/ai-notice" && !url.search && ["GET", "POST"].includes(request.method)) {
    yield* (yield* ServerAuthorization).require(request, scopedServerId, { section: "rosters" })
    return true
  }
  const route = routes.find(endpoint => endpoint.method === request.method
    && endpoint.path.split("/").length === parts.length
    && endpoint.path.split("/").every((part, index) => part.startsWith(":") || part === parts[index]))
  if (!route) return false
  const params = yield* Effect.try({
    try: () => Object.fromEntries(route.path.split("/").flatMap((part, index) =>
      part.startsWith(":") ? [[part.slice(1), decodeURIComponent(parts[index]!)]] : [])),
    catch: () => new InvalidRequest({ message: "Path contains malformed percent encoding" }),
  })
  const serverIds: unknown[] = [...url.searchParams.getAll("server_id")]
  if (params.serverId !== undefined) serverIds.push(params.serverId)
  if (route.bodyMode === "json") {
    // Clone so normal decoding still validates the complete original request.
    // Bound this early read just like the handler; never trust an unbounded body.
    const body = yield* readBoundedJson(request.clone())
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      for (const key of ["serverId", "server_id"]) if (key in body) serverIds.push((body as Record<string, unknown>)[key])
    }
  }
  if (route.path === "/v2/roster/views/shared/:viewId") {
    // A shared view's owner is stored data, never a caller-provided server ID.
    const sql = yield* SqlClient.SqlClient
    const view = (yield* sql<{ server_id: string }>`SELECT server_id FROM roster_views WHERE share_id=${params.viewId}`
      .pipe(Effect.mapError(cause => new DatabaseFailure({ cause, message: "Roster view scope is unavailable" }))))[0]
    if (!view) return yield* new NotFound({ message: "Roster view not found" })
    serverIds.push(view.server_id)
  }
  if (!serverIds.length || serverIds.some(id => typeof id !== "string" || !/^\d+$/u.test(id)))
    return yield* new InvalidRequest({ message: "A decimal server_id is required" })
  if (serverIds.some(id => id !== scopedServerId))
    return yield* new Forbidden({ message: "Dashboard session is limited to another server" })
  // This is authorization, not a URL bypass. Current Gateway access and the
  // session's section/read-write ceiling must both allow the operation. The
  // normal handler repeats its checks and enforces object ownership afterwards.
  yield* (yield* ServerAuthorization).require(request, scopedServerId, {
    section: route.path.startsWith("/v2/links/server/") ? "links" : "rosters",
    write: route.auth.endsWith("write"),
    managerOnly: route.auth.startsWith("server-manager-"),
  })
  return true
})
