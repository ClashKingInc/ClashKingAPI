import {
  dashboardEndpoints,
  requireEndpointSuccessStatus,
  BotServerWarLeaderboardEndpoint,
  BotServerDonationsLeaderboardEndpoint,
  BotServerLegendsLeaderboardEndpoint,
  BotServerClanGamesLeaderboardEndpoint,
  type AnyEndpoint,
  type AuthMode,
  type HttpMethod,
} from "@clashking/api-contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity, type ApiPrincipal } from "./auth.js"
import {
  InvalidRequest,
  PayloadTooLarge,
  type ApiFailure,
} from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { ServerAuthorization } from "./server-authorization.js"
import { executeDashboardServerCore } from "./dashboard-server-core.js"
import { DiscordApi } from "./discord-api.js"
import { DiscordCredentials } from "./discord-credentials.js"
import { readBoundedJson } from "./request-body.js"
import { readDashboardMultipart } from "./dashboard-upload.js"
import { encodeDashboardBaseFailure } from "./dashboard-server-bases.js"

export interface DashboardServerRuntimeRoute {
  readonly method: HttpMethod
  readonly path: string
}

// This inventory is deliberately literal: route-parity checks can compare it with
// the Go registry without executing contract-module discovery code.
export const dashboardServerRuntimeRoutes = [
  { method: "GET", path: "/v2/server/:serverId/dashboard-capabilities" },
  { method: "GET", path: "/v2/server/:serverId/dashboard-access" },
  { method: "PUT", path: "/v2/server/:serverId/dashboard-access" },
  { method: "GET", path: "/v2/server/:serverId/bot-profile" },
  { method: "PATCH", path: "/v2/server/:serverId/bot-profile" },
  { method: "GET", path: "/v2/guilds" },
  { method: "GET", path: "/v2/guild/:guildId" },
  { method: "POST", path: "/v2/server/:serverId/reactivate" },
  { method: "GET", path: "/v2/server/:serverId/settings" },
  { method: "PATCH", path: "/v2/server/:serverId/settings" },
  { method: "GET", path: "/v2/server/:serverId/clan/:clanTag/settings" },
  { method: "PATCH", path: "/v2/server/:serverId/clan/:clanTag/settings" },
  { method: "GET", path: "/v2/server/:serverId/clans" },
  { method: "GET", path: "/v2/server/:serverId/clans-basic" },
  { method: "POST", path: "/v2/server/:serverId/clans" },
  { method: "DELETE", path: "/v2/server/:serverId/clans/:clanTag" },
  { method: "PUT", path: "/v2/server/:serverId/embed-color/:hexCode" },
  { method: "GET", path: "/v2/search/:guildId/banned-players" },
  { method: "GET", path: "/v2/server/:serverId/discord-roles" },
  { method: "GET", path: "/v2/server/:serverId/discord-test" },
  { method: "GET", path: "/v2/server/:serverId/role-settings" },
  { method: "PATCH", path: "/v2/server/:serverId/role-settings" },
  { method: "GET", path: "/v2/server/:serverId/server-roles" },
  { method: "POST", path: "/v2/server/:serverId/server-roles" },
  { method: "PATCH", path: "/v2/server/:serverId/server-roles/:roleId" },
  { method: "DELETE", path: "/v2/server/:serverId/server-roles/:roleId" },
  { method: "GET", path: "/v2/server/:serverId/logs" },
  { method: "PUT", path: "/v2/server/:serverId/logs" },
  { method: "PATCH", path: "/v2/server/:serverId/logs" },
  { method: "DELETE", path: "/v2/server/:serverId/logs" },
  { method: "GET", path: "/v2/server/:serverId/countdowns" },
  { method: "POST", path: "/v2/server/:serverId/countdowns" },
  { method: "DELETE", path: "/v2/server/:serverId/countdowns" },
  { method: "GET", path: "/v2/server/:serverId/clan/:clanTag/countdowns" },
  { method: "GET", path: "/v2/server/:serverId/channels" },
  { method: "GET", path: "/v2/server/:serverId/threads" },
  { method: "GET", path: "/v2/server/:serverId/autoboards/capabilities" },
  { method: "GET", path: "/v2/server/:serverId/autoboards" },
  { method: "POST", path: "/v2/server/:serverId/autoboards" },
  { method: "PUT", path: "/v2/server/:serverId/autoboards/:autoboardId" },
  { method: "DELETE", path: "/v2/server/:serverId/autoboards/:autoboardId" },
  { method: "GET", path: "/v2/server/:serverId/panel" },
  { method: "GET", path: "/v2/server/:serverId/reminders" },
  { method: "GET", path: "/v2/server/:serverId/giveaways" },
  { method: "GET", path: "/v2/server/:serverId/giveaways/:giveawayId" },
  { method: "GET", path: "/v2/server/:serverId/bases" },
  { method: "GET", path: "/v2/server/:serverId/bases/:baseId" },
  { method: "POST", path: "/v2/server/:serverId/bases" },
  { method: "DELETE", path: "/v2/server/:serverId/bases/:baseId" },
  { method: "POST", path: "/v2/server/:serverId/bases/images" },
  { method: "GET", path: "/v2/server/:serverId/bases/:baseId/downloaders/:userId" },
  { method: "POST", path: "/v2/server/:serverId/giveaways" },
  { method: "PUT", path: "/v2/server/:serverId/giveaways/:giveawayId" },
  { method: "DELETE", path: "/v2/server/:serverId/giveaways/:giveawayId" },
  { method: "GET", path: "/v2/server/:serverId/giveaways/:giveawayId/entries" },
  { method: "POST", path: "/v2/server/:serverId/giveaways/:giveawayId/reroll" },
  { method: "POST", path: "/v2/server/:serverId/reminders" },
  { method: "PUT", path: "/v2/server/:serverId/reminders/:reminderId" },
  { method: "DELETE", path: "/v2/server/:serverId/reminders/:reminderId" },
  { method: "GET", path: "/v2/links/server/:serverId" },
  { method: "GET", path: "/v2/server/:serverId/leaderboards" },
  { method: "GET", path: "/v2/server/:serverId/leaderboards/war-performance" },
  { method: "GET", path: "/v2/server/:serverId/leaderboards/donations" },
  { method: "GET", path: "/v2/server/:serverId/leaderboards/legends" },
  { method: "GET", path: "/v2/server/:serverId/leaderboards/clan-games" },
  { method: "PUT", path: "/v2/server/:serverId/panel" },
  { method: "GET", path: "/v2/server/:serverId/embeds" },
  { method: "POST", path: "/v2/server/:serverId/embeds" },
  { method: "PUT", path: "/v2/server/:serverId/embeds/:embedName" },
  { method: "DELETE", path: "/v2/server/:serverId/embeds/:embedName" },
  { method: "GET", path: "/v2/server/:serverId/tickets" },
  { method: "POST", path: "/v2/server/:serverId/tickets" },
  { method: "DELETE", path: "/v2/server/:serverId/tickets/:panelName" },
  { method: "POST", path: "/v2/server/:serverId/tickets/:panelName/buttons" },
  { method: "DELETE", path: "/v2/server/:serverId/tickets/:panelName/buttons/:customId" },
  { method: "PATCH", path: "/v2/server/:serverId/tickets/:panelName/buttons/:customId" },
  { method: "PUT", path: "/v2/server/:serverId/tickets/:panelName" },
  { method: "PUT", path: "/v2/server/:serverId/tickets/:panelName/buttons/:customId" },
  { method: "PUT", path: "/v2/server/:serverId/tickets/:panelName/approve-messages" },
  { method: "GET", path: "/v2/server/:serverId/clan-categories" },
  { method: "POST", path: "/v2/server/:serverId/clan-categories" },
  { method: "PATCH", path: "/v2/server/:serverId/clan-categories/:categoryId" },
  { method: "PUT", path: "/v2/server/:serverId/clan-categories/order" },
  { method: "GET", path: "/v2/server/:serverId/clan-categories/:categoryId/delete-preview" },
  { method: "DELETE", path: "/v2/server/:serverId/clan-categories/:categoryId" },
] as const satisfies ReadonlyArray<DashboardServerRuntimeRoute>

export interface DashboardServerOperationInput {
  readonly bindings: WorkerBindings
  readonly body: unknown
  readonly endpoint: AnyEndpoint
  readonly path: Readonly<Record<string, unknown>>
  readonly principal: ApiPrincipal
  readonly query: Readonly<Record<string, unknown>>
  readonly request: Request
}

export class DashboardServerOperations extends Context.Service<
  DashboardServerOperations,
  {
    readonly execute: (
      input: DashboardServerOperationInput,
    ) => Effect.Effect<unknown, ApiFailure, SqlClient.SqlClient>
  }
>()("clashking/DashboardServerOperations") {
  static readonly layer = Layer.effect(DashboardServerOperations, Effect.gen(function* () {
    const discord = yield* DiscordApi
    const credentials = yield* DiscordCredentials
    const authorization = yield* ServerAuthorization
    return { execute: (input: DashboardServerOperationInput) => executeDashboardServerCore(input).pipe(
      Effect.provideService(DiscordApi, discord),
      Effect.provideService(DiscordCredentials, credentials),
      Effect.provideService(ServerAuthorization, authorization),
      Effect.flatMap((value) => value === undefined ? Effect.die(new Error(`Unregistered dashboard server implementation: ${input.endpoint.operationId}`)) : Effect.succeed(value)),
    ) }
  }))
}


const canonicalEndpoints: ReadonlyArray<AnyEndpoint> = [...Object.values(dashboardEndpoints), BotServerWarLeaderboardEndpoint, BotServerDonationsLeaderboardEndpoint, BotServerLegendsLeaderboardEndpoint, BotServerClanGamesLeaderboardEndpoint]
const routeKeys = new Set(dashboardServerRuntimeRoutes.map(({ method, path }) => `${method} ${path}`))
const endpoints = canonicalEndpoints.filter((endpoint) => routeKeys.has(`${endpoint.method} ${endpoint.path}`))

interface MatchedRoute {
  readonly endpoint: AnyEndpoint
  readonly path: Readonly<Record<string, string>>
}

export const dispatchDashboardServer = (
  request: Request,
  bindings: WorkerBindings,
): Effect.Effect<
  Response | undefined,
  ApiFailure,
  AuthIdentity | ServerAuthorization | DashboardServerOperations | SqlClient.SqlClient
> => {
  const match = matchRoute(request)
  if (match === undefined) return Effect.succeed(undefined)

  return Effect.gen(function* () {
    const unescapedPath = yield* Effect.try({
      try: () => Object.fromEntries(Object.entries(match.path).map(([key, value]) => [key, decodeURIComponent(value)])),
      catch: () => new InvalidRequest({ message: "Path parameters contain malformed percent encoding" }),
    })
    const decodedPath = yield* decode(match.endpoint.pathParams, unescapedPath, "Path parameters")
    const path = yield* asRecord(decodedPath, "Path parameters")
    yield* validateSnowflakePath(path)
    const decodedQuery = yield* decode(
      match.endpoint.query,
      queryInput(new URL(request.url)),
      "Query parameters",
    )
    const query = yield* asRecord(decodedQuery, "Query parameters")
    const principal = yield* authorizeServerRoute(request, match.endpoint, path)
    const body = yield* bodyInput(request, match.endpoint)
    const operations = yield* DashboardServerOperations
    const value = yield* operations.execute({
      bindings,
      body,
      endpoint: match.endpoint,
      path,
      principal,
      query,
      request,
    })
    return yield* responseFor(match.endpoint, value)
  }).pipe(Effect.withSpan(`DashboardServer.${match.endpoint.operationId}`))
}

const matchRoute = (request: Request): MatchedRoute | undefined => {
  const pathname = new URL(request.url).pathname
  const method = request.method.toUpperCase()
  for (const endpoint of endpoints) {
    if (endpoint.method !== method) continue
    const path = matchPath(endpoint.path, pathname)
    if (path !== undefined) return { endpoint, path }
  }
  return undefined
}

const matchPath = (
  template: string,
  pathname: string,
): Readonly<Record<string, string>> | undefined => {
  const expected = template.split("/")
  const actual = pathname.split("/")
  if (expected.length !== actual.length) return undefined
  const values: Record<string, string> = {}
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index]
    const value = actual[index]
    if (segment === undefined || value === undefined) return undefined
    if (!segment.startsWith(":")) {
      if (segment !== value) return undefined
      continue
    }
    values[segment.slice(1)] = value
  }
  return values
}

const decode = (
  schema: AnyEndpoint["pathParams"] | AnyEndpoint["query"],
  value: unknown,
  label: string,
) => Schema.decodeUnknownEffect(schema)(value).pipe(
  Effect.mapError(() => new InvalidRequest({ message: `${label} failed schema validation` })),
)

const asRecord = (
  value: unknown,
  label: string,
): Effect.Effect<Readonly<Record<string, unknown>>, InvalidRequest> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Effect.succeed(value as Readonly<Record<string, unknown>>)
    : Effect.fail(new InvalidRequest({ message: `${label} must be an object` }))

const numericQueryFields = new Set(["limit", "offset", "limit_players", "limit_clans"])
const booleanQueryFields = new Set(["clan_settings", "view_expired"])

const queryInput = (url: URL): Readonly<Record<string, unknown>> => {
  const query: Record<string, unknown> = {}
  for (const [key, value] of url.searchParams) {
    if (numericQueryFields.has(key)) query[key] = Number(value)
    else if (booleanQueryFields.has(key)) query[key] = value === "true" ? true : value === "false" ? false : value
    else query[key] = value
  }
  return query
}

const bodyInput = (request: Request, endpoint: AnyEndpoint) => {
  if (endpoint.bodyMode === "none") return Effect.succeed({})
  if (endpoint.bodyMode === "multipart") {
    return readDashboardMultipart(request).pipe(Effect.flatMap((body) => Schema.decodeUnknownEffect(endpoint.body)(body)),
      Effect.mapError((cause) => cause instanceof InvalidRequest || cause instanceof PayloadTooLarge ? cause : new InvalidRequest({ message: "Request body failed schema validation" })))
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Effect.fail(new InvalidRequest({ message: "Content-Type must be application/json", status: 415 }))
  }
  // A profile can contain two individually capped 10 MiB base64 images.
  return readBoundedJson(request, endpoint.operationId === "updateBotGuildProfile" ? 28 * 1024 * 1024 : undefined).pipe(
    Effect.flatMap((body) => Schema.decodeUnknownEffect(endpoint.body)(body)),
    Effect.mapError((cause) => cause instanceof InvalidRequest || cause instanceof PayloadTooLarge
      ? cause
      : new InvalidRequest({ message: "Request body failed schema validation" })),
  )
}

const authenticate = (
  request: Request,
  mode: AuthMode,
): Effect.Effect<ApiPrincipal, ApiFailure, AuthIdentity | SqlClient.SqlClient> => Effect.gen(function* () {
  const auth = yield* AuthIdentity
  switch (mode) {
    case "bot": return yield* auth.requireBot(request)
    case "user": return yield* auth.requireUser(request)
    case "public": return { kind: "bot" as const }
    default: return yield* auth.requireUserOrBot(request)
  }
})

const sectionFor = (path: string): string => {
  if (path === "/v2/guild/:guildId") return ""
  if (path.includes("/bases")) return "bases"
  if (path.includes("/dashboard-capabilities")) return ""
  if (path.includes("/links/server/")) return "links"
  if (path.includes("/logs")) return "logs"
  if (path.includes("/reminders")) return "reminders"
  if (path.includes("/autoboards")) return "autoboards"
  if (path.includes("/giveaways")) return "giveaways"
  if (path.includes("/tickets")) return "tickets"
  if (path.includes("/embeds")) return "embeds"
  if (path.includes("/panel")) return "panels"
  if (path.includes("/leaderboards")) return "leaderboards"
  if (path.includes("/banned-players")) return "moderation"
  if (path.includes("/role") || path.includes("/server-roles") || path.includes("/discord-roles")) return "roles"
  if (path.includes("/clan")) return "clans"
  if (path.includes("/channels") || path.includes("/threads")) return ""
  return "settings"
}

const authorizeServerRoute = (
  request: Request,
  endpoint: AnyEndpoint,
  path: Readonly<Record<string, unknown>>,
): Effect.Effect<ApiPrincipal, ApiFailure, AuthIdentity | ServerAuthorization | SqlClient.SqlClient> => {
  if (!endpoint.auth.startsWith("server-")) return authenticate(request, endpoint.auth)
  const serverId = typeof path.serverId === "string"
    ? path.serverId
    : typeof path.guildId === "string" ? path.guildId : undefined
  if (serverId === undefined) {
    return Effect.fail(new InvalidRequest({ message: "Server path parameter is required" }))
  }
  return Effect.gen(function* () {
    const access = yield* ServerAuthorization
    const authorized = yield* access.require(request, serverId, {
      write: endpoint.auth.endsWith("write"),
      managerOnly: endpoint.auth.startsWith("server-manager-"),
      section: sectionFor(endpoint.path),
    })
    return authorized.principal
  })
}

const validateSnowflakePath = (
  path: Readonly<Record<string, unknown>>,
): Effect.Effect<void, InvalidRequest> => {
  for (const key of ["serverId", "guildId", "userId"] as const) {
    const value = path[key]
    if (value !== undefined && (typeof value !== "string" || !/^\d+$/u.test(value))) {
      return Effect.fail(new InvalidRequest({ message: `${key} must be a decimal string` }))
    }
  }
  return Effect.void
}

const responseFor = (endpoint: AnyEndpoint, value: unknown) => {
  const baseFailure = encodeDashboardBaseFailure(value)
  if (baseFailure !== undefined) return baseFailure
  if (endpoint.responseMode === "none") {
    return Effect.succeed(new Response(null, { status: requireEndpointSuccessStatus(endpoint) }))
  }
  return Schema.encodeUnknownEffect(endpoint.response)(value).pipe(
    Effect.map((encoded) => Response.json(encoded, {
      status: requireEndpointSuccessStatus(endpoint),
      headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
    })),
    Effect.orDie,
  )
}

export const dashboardServerRuntimeInternals = { matchPath, queryInput, sectionFor }
