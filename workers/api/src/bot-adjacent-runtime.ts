import { botEndpoints, DecimalSnowflake } from "@clashking/api-contracts"
import { Context, Data, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity, bearerToken } from "./auth.js"
import { DiscordApi } from "./discord-api.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound, PayloadTooLarge, Unauthenticated, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { ServerAuthorization } from "./server-authorization.js"
import { SharedLinksLimiter } from "./shared-links-limiter.js"
import { commitServerScopedLink,readServerLinkTokenPolicy,requireServerLinkToken } from "./server-scoped-linking.js"
import { prepareLink } from "./link-mutations.js"

class OperationConflict extends Data.TaggedError("OperationConflict")<{ readonly message: string }> {}
class RateLimited extends Data.TaggedError("RateLimited")<{ readonly message: string; readonly retryAfterSeconds: number }> {}
type OperationFailure = ApiFailure | OperationConflict | RateLimited

export const botAdjacentRuntimeRoutes = [
  { method: "POST", path: "/v2/links/shared", operation: "sharedLinksLookup" },
  { method: "POST", path: "/v2/links/server/:serverId", operation: "createServerLink" },
  { method: "DELETE", path: "/v2/links/server/:serverId", operation: "deleteServerLink" },
  { method: "PATCH", path: "/v2/links/:userId/last-login", operation: "updateLinkLastLogin" },
  { method: "POST", path: "/v2/tracking/verified-players", operation: "refreshVerifiedPlayerTracking" },
  { method: "GET", path: "/v2/server/:serverId/clans-basic", operation: "serverClans" },
  { method: "PUT", path: "/v2/bases/:baseId/votes/:voterId", operation: "upsertBaseVote" },
  { method: "DELETE", path: "/v2/bases/:baseId/votes/:voterId", operation: "removeBaseVote" },
  { method: "POST", path: "/v2/bases/:baseId/downloaders/:userId", operation: "recordBaseDownload" },
] as const

type SharedRequest = typeof botEndpoints.sharedLinksLookup.body.Type
type LinkMutation = typeof botEndpoints.createServerLink.response.Type
type TrackingResponse = typeof botEndpoints.refreshVerifiedPlayerTracking.response.Type
type LinkBindings = Parameters<typeof prepareLink>[3]

const reorderServerLinkOwner = (userId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`WITH ordered AS (SELECT tag, row_number() OVER (ORDER BY order_index, added_at, tag) - 1 AS position
    FROM player_links WHERE user_id = ${userId})
    UPDATE player_links p SET order_index = ordered.position FROM ordered WHERE p.tag = ordered.tag`
})

/** Caller must authorize server links write access before entering this store operation. */
export const createDashboardServerLink = (bindings: LinkBindings, serverId: string, tag: string, userId: string, apiToken?: string) => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const required = yield* readServerLinkTokenPolicy(serverId)
  yield* requireServerLinkToken(required, apiToken)
  const member = yield* discord.request(`/guilds/${serverId}/members/${userId}`).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ user: Schema.Struct({ id: DecimalSnowflake }) }))),
    Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Unable to verify the server member" })),
  )
  if (member.user.id !== userId) return yield* new NotFound({ message: "Discord member not found" })
  const proof=yield* prepareLink({kind:"bot"},userId,{player_tag:tag,...(apiToken === undefined ? {} : {api_token:apiToken})},bindings)
  const {response:linked}=yield* commitServerScopedLink(serverId,proof)
  return { message: linked.message, player_tag: linked.account.tag, user_id: userId }
}).pipe(
  Effect.catchTag("LinkOwnershipConflict", () => Effect.fail(new OperationConflict({ message: "This account belongs to another user; a valid player token is required" }))),
  Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause, message: "Server account linking failed" }))),
)

/** A confirmed missing player may be removed, never a live player or a failed lookup. */
export const deleteDashboardServerLink = (bindings: LinkBindings, tag: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const owner = (yield* sql<{ user_id: string | null }>`SELECT user_id FROM player_links WHERE tag=${tag}`)[0]?.user_id
  if (owner === undefined || owner === null) return yield* new NotFound({ message: "Link not found" })
  const response = yield* Effect.tryPromise({
    try: () => bindings.CLASH_PROXY.fetch(new Request(`https://clash-proxy/v1/players/${encodeURIComponent(tag)}`)),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Failed to verify that the player no longer exists" }),
  })
  yield* Effect.promise(() => response.body?.cancel().catch(() => undefined) ?? Promise.resolve())
  if (response.ok) return yield* new OperationConflict({ message: "Player still exists; deletion is not allowed" })
  if (response.status !== 404) return yield* new UpstreamUnavailable({ cause: response.status, message: "Only a Clash 404 permits link deletion" })
  yield* sql.withTransaction(Effect.gen(function* () {
    // Match canonical linking/admission order: tag, subject, then link row.
    yield* sql`INSERT INTO player_link_mutation_locks (tag) VALUES (${tag}) ON CONFLICT (tag) DO NOTHING`
    yield* sql`SELECT tag FROM player_link_mutation_locks WHERE tag=${tag} FOR UPDATE`
    yield* sql`INSERT INTO subject_mutation_locks (subject_id) VALUES (${owner}) ON CONFLICT (subject_id) DO NOTHING`
    yield* sql`SELECT subject_id FROM subject_mutation_locks WHERE subject_id=${owner} FOR UPDATE`
    const current = (yield* sql<{ user_id: string | null }>`SELECT user_id FROM player_links WHERE tag=${tag} FOR UPDATE`)[0]
    if (current?.user_id !== owner) return yield* new OperationConflict({ message: "Link changed and can no longer be deleted" })
    yield* sql`DELETE FROM player_links WHERE tag=${tag} AND user_id=${owner}`
    yield* reorderServerLinkOwner(owner)
  }))
  return { message: "Link removed successfully", player_tag: tag, user_id: owner }
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause, message: "Server account deletion failed" }))))

export class BotAdjacentStore extends Context.Service<BotAdjacentStore, {
  readonly sharedLinksLookup: (token: string, body: SharedRequest) => Effect.Effect<typeof botEndpoints.sharedLinksLookup.response.Type, OperationFailure>
  readonly createServerLink: (serverId: string, tag: string, userId: string, apiToken?: string) => Effect.Effect<LinkMutation, OperationFailure>
  readonly deleteServerLink: (serverId: string, tag: string) => Effect.Effect<LinkMutation, OperationFailure>
  readonly updateLinkLastLogin: (userId: string) => Effect.Effect<typeof botEndpoints.updateLinkLastLogin.response.Type, OperationFailure>
  readonly refreshVerifiedPlayerTracking: (userId: string, tags: readonly string[]) => Effect.Effect<TrackingResponse, OperationFailure>
  readonly serverClans: (serverId: string) => Effect.Effect<typeof botEndpoints.serverClans.response.Type, OperationFailure>
  readonly upsertBaseVote: (baseId: string, voterId: string, direction: "up" | "down") => Effect.Effect<typeof botEndpoints.upsertBaseVote.response.Type, OperationFailure>
  readonly removeBaseVote: (baseId: string, voterId: string) => Effect.Effect<void, OperationFailure>
  readonly recordBaseDownload: (baseId: string, userId: string) => Effect.Effect<typeof botEndpoints.recordBaseDownload.response.Type, OperationFailure>
}>()("clashking/BotAdjacentStore") {
  static readonly layer = Layer.effect(BotAdjacentStore, Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const bindings = yield* WorkerEnvironment
    const discord = yield* DiscordApi
    const limiter = yield* SharedLinksLimiter

    return BotAdjacentStore.of({
      sharedLinksLookup: (token, body) => Effect.gen(function* () {
        if (token.length === 0 || token.length > 512) return yield* new Unauthenticated({ message: "Invalid developer API token" })
        const hash = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))
        const applications = yield* db(sql<{ application_id: string }>`
          UPDATE developer_applications SET token_last_used_at = now(), api_request_count = api_request_count + 1
          WHERE token_hash = ${new Uint8Array(hash)} AND revoked_at IS NULL RETURNING application_id::text
        `)
        const applicationId = applications[0]?.application_id
        if (applicationId === undefined) return yield* new Unauthenticated({ message: "Invalid developer API token" })
        const limit = yield* limiter.consume(applicationId)
        if (!limit.allowed) return yield* new RateLimited({ message: "Shared-links request limit exceeded", retryAfterSeconds: limit.retryAfterSeconds })
        const discordIds = [...new Set(body.discord_ids ?? [])]
        const tags = yield* input(() => normalizeTags(body.player_tags ?? [], 100))
        if ((body.discord_ids?.length ?? 0) + (body.player_tags?.length ?? 0) > 100 || discordIds.length + tags.length === 0) {
          return yield* new InvalidRequest({ message: "Provide between 1 and 100 Discord IDs or player tags" })
        }
        const recorded = yield* db(sql<{ application_id: string }>`UPDATE developer_applications SET links_lookup_count = links_lookup_count + ${discordIds.length + tags.length}
          WHERE application_id = ${applicationId}::uuid AND revoked_at IS NULL RETURNING application_id::text`)
        if (recorded.length === 0) return yield* new Unauthenticated({ message: "Invalid developer API token" })
        const items = yield* db(sql.unsafe<{ is_verified: boolean; player_tag: string; user_id: string }>(`
          SELECT is_verified, tag AS player_tag, user_id FROM player_links
          WHERE hidden = false AND user_id ~ '^[1-9][0-9]{14,19}$'
            AND (user_id = ANY($1::text[]) OR tag = ANY($2::text[]))
          ORDER BY user_id, order_index, tag`, [discordIds, tags]))
        return { items }
      }),
      createServerLink: (serverId, tag, userId, apiToken) => createDashboardServerLink(bindings, serverId, tag, userId, apiToken).pipe(
        Effect.provideService(SqlClient.SqlClient, sql), Effect.provideService(DiscordApi, discord)),
      deleteServerLink: (_serverId, tag) => deleteDashboardServerLink(bindings, tag).pipe(Effect.provideService(SqlClient.SqlClient, sql)),
      updateLinkLastLogin: (userId) => Effect.gen(function* () {
        const rows = yield* db(sql<{ timestamp: Date | string; updated_count: number }>`
          WITH server_time AS (SELECT now() AS value), updated AS (
            UPDATE player_links links SET last_login = server_time.value, updated_at = server_time.value
            FROM server_time WHERE links.user_id = ${userId} AND links.is_verified = true RETURNING server_time.value)
          SELECT server_time.value AS timestamp, count(updated.value)::int AS updated_count
          FROM server_time LEFT JOIN updated ON true GROUP BY server_time.value
        `)
        const row = rows[0]
        if (row === undefined) return yield* new DatabaseFailure({ cause: undefined, message: "Login timestamp was not returned" })
        return { timestamp: new Date(row.timestamp).toISOString(), updated_count: row.updated_count }
      }),
      refreshVerifiedPlayerTracking: (userId, tags) => Effect.gen(function* () {
        const rows = yield* db(sql.unsafe<{ tag: string }>(`SELECT tag FROM player_links
          WHERE user_id = $1 AND is_verified = true AND (cardinality($2::text[]) = 0 OR tag = ANY($2::text[])) ORDER BY tag`, [userId, [...tags]]))
        const verified = rows.map(({ tag }) => tag)
        if (tags.length > 0 && verified.length !== tags.length) return yield* new Forbidden({ message: "Every tracking tag must be a verified account" })
        if (verified.length > 100) return yield* new InvalidRequest({ message: "A maximum of 100 tracking tags is allowed" })
        return yield* refreshTrackingTargets(bindings, verified)
      }),
      serverClans: (serverId) => db(sql<{ tag: string; name: string }>`SELECT sc.tag, clan.name
        FROM server_clans sc JOIN basic_clan clan ON clan.tag = sc.tag
        WHERE sc.server_id = ${serverId} ORDER BY clan.name, sc.tag`),
      upsertBaseVote: (baseId, voterId, direction) => Effect.gen(function* () {
        const rows = yield* db(sql<{ baseId: string; voterId: string; direction: "up" | "down" }>`UPDATE bases
          SET upvoter_ids = CASE WHEN ${direction} = 'up' THEN array_append(array_remove(upvoter_ids, ${voterId}), ${voterId}) ELSE array_remove(upvoter_ids, ${voterId}) END,
              downvoter_ids = CASE WHEN ${direction} = 'down' THEN array_append(array_remove(downvoter_ids, ${voterId}), ${voterId}) ELSE array_remove(downvoter_ids, ${voterId}) END
          WHERE id = ${baseId}::uuid RETURNING id::text AS "baseId", ${voterId}::text AS "voterId", ${direction}::text AS direction`)
        if (rows[0] === undefined) return yield* new NotFound({ message: "Base not found" })
        return rows[0]
      }),
      removeBaseVote: (baseId, voterId) => Effect.gen(function* () {
        const rows = yield* db(sql<{ id: string }>`UPDATE bases SET upvoter_ids = array_remove(upvoter_ids, ${voterId}),
          downvoter_ids = array_remove(downvoter_ids, ${voterId}) WHERE id = ${baseId}::uuid RETURNING id::text`)
        if (rows.length === 0) return yield* new NotFound({ message: "Base not found" })
      }),
      recordBaseDownload: (baseId, userId) => Effect.gen(function* () {
        const rows = yield* db(sql<{ download_count: number }>`UPDATE bases SET downloaders = CASE
          WHEN ${userId} = ANY(downloaders) THEN downloaders ELSE array_append(downloaders, ${userId}) END
          WHERE id = ${baseId}::uuid RETURNING cardinality(downloaders)::int AS download_count`)
        if (rows[0] === undefined) return yield* new NotFound({ message: "Base not found" })
        return { baseId, userId, downloadCount: rows[0].download_count }
      }),
    })
  }))
}

export const refreshTrackingTargets = (bindings: WorkerBindings, tags: readonly string[]): Effect.Effect<TrackingResponse, ApiFailure> =>
  input(() => {
    if (tags.length > 100 || tags.some((tag) => !/^#[0289PYLQGRJCUV]{3,14}$/u.test(tag))) throw new Error("Tracking requires at most 100 canonical player tags")
    if (bindings.API_BOT_TOKEN.trim().length === 0) throw new Error("Tracking API token is not configured")
  }).pipe(Effect.andThen(Effect.tryPromise({
    try: async () => {
      const response = await bindings.TRACKING.fetch(new Request("https://tracking.internal/internal/verified-players/refresh", {
        method: "POST", headers: { authorization: `Bearer ${bindings.API_BOT_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ player_tags: tags }),
      }))
      if (!response.ok) throw new Error(`Tracking returned ${response.status}`)
      return await response.json() as unknown
    },
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Verified player tracking cache is unavailable" }),
  })),
    Effect.flatMap(Schema.decodeUnknownEffect(botEndpoints.refreshVerifiedPlayerTracking.response)),
    Effect.mapError((cause) => cause instanceof UpstreamUnavailable ? cause : new UpstreamUnavailable({ cause, message: "Tracking response violated its contract" })),
    Effect.flatMap((response) => response.player_tags.length === tags.length
      && response.player_tags.every((tag, index) => tag === tags[index])
      && Number.isFinite(Date.parse(response.expires_at))
      ? Effect.succeed(response)
      : Effect.fail(new UpstreamUnavailable({ cause: response, message: "Tracking did not acknowledge the requested player targets" }))),
  )

export const dispatchBotAdjacentRuntime = (request: Request, _bindings: WorkerBindings): Effect.Effect<
  Response | undefined, ApiFailure, AuthIdentity | BotAdjacentStore | ServerAuthorization | SqlClient.SqlClient
> => {
  const url = new URL(request.url)
  const match = matchRoute(request.method, url.pathname)
  if (match === undefined) return Effect.succeed(undefined)
  return Effect.gen(function* () {
    const store = yield* BotAdjacentStore
    const auth = yield* AuthIdentity
    const params = yield* input(() => Object.fromEntries(Object.entries(match.params).map(([key, value]) => [key, decodeURIComponent(value)])))
    const snowflake = (key: string) => input(() => Schema.decodeUnknownSync(DecimalSnowflake)(params[key]))
    const baseId = () => input(() => {
      const value = params.baseId ?? ""
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) throw new Error("Invalid base ID")
      return value
    })
    switch (match.operation) {
      case "sharedLinksLookup": {
        const body = yield* decodeBody(request, botEndpoints.sharedLinksLookup.body)
        const result = yield* store.sharedLinksLookup(bearerToken(request) ?? "", body)
        return yield* encode(botEndpoints.sharedLinksLookup.response, result, { "cache-control": "no-store" })
      }
      case "createServerLink":
      case "deleteServerLink": {
        const serverId = yield* snowflake("serverId")
        const authorization = yield* ServerAuthorization
        yield* authorization.require(request, serverId, { section: "links", write: true })
        if (match.operation === "createServerLink") {
          const body = yield* decodeBody(request, botEndpoints.createServerLink.body)
          const tag = yield* input(() => normalizeTag(body.playerTag))
          return yield* encode(botEndpoints.createServerLink.response, yield* store.createServerLink(serverId, tag, body.userID, body.api_token))
        }
        const tag = yield* input(() => normalizeTag(url.searchParams.get("playerTag") ?? ""))
        return yield* encode(botEndpoints.deleteServerLink.response, yield* store.deleteServerLink(serverId, tag))
      }
      case "updateLinkLastLogin": {
        const principal = yield* auth.requireUserOrBot(request)
        const userId = params.userId ?? ""
        if (userId.length === 0) return yield* new InvalidRequest({ message: "User ID is required" })
        if (principal.kind === "user" && principal.userId !== userId) return yield* new Forbidden({ message: "You can only update your own login" })
        return yield* encode(botEndpoints.updateLinkLastLogin.response, yield* store.updateLinkLastLogin(userId))
      }
      case "refreshVerifiedPlayerTracking": {
        const principal = yield* auth.requireUser(request)
        const body = yield* decodeBody(request, botEndpoints.refreshVerifiedPlayerTracking.body)
        const tags = yield* input(() => normalizeTags(body.player_tags, 100))
        return yield* encode(botEndpoints.refreshVerifiedPlayerTracking.response, yield* store.refreshVerifiedPlayerTracking(principal.userId, tags))
      }
      case "serverClans": {
        const serverId = yield* snowflake("serverId")
        const authorization = yield* ServerAuthorization
        yield* authorization.require(request, serverId, { section: "clans" })
        return yield* encode(botEndpoints.serverClans.response, yield* store.serverClans(serverId))
      }
      case "upsertBaseVote": {
        yield* auth.requireBot(request)
        const body = yield* decodeBody(request, botEndpoints.upsertBaseVote.body)
        return yield* encode(botEndpoints.upsertBaseVote.response, yield* store.upsertBaseVote(yield* baseId(), yield* snowflake("voterId"), body.direction))
      }
      case "removeBaseVote": {
        yield* auth.requireBot(request)
        yield* store.removeBaseVote(yield* baseId(), yield* snowflake("voterId"))
        return new Response(null, { status: 204 })
      }
      case "recordBaseDownload": {
        yield* auth.requireBot(request)
        return yield* encode(botEndpoints.recordBaseDownload.response, yield* store.recordBaseDownload(yield* baseId(), yield* snowflake("userId")))
      }
    }
  }).pipe(Effect.catch((failure) => {
    if (failure instanceof OperationConflict || failure instanceof RateLimited) {
      return Effect.succeed(Response.json({ code: failure instanceof RateLimited ? "rate_limited" : "conflict", message: failure.message }, {
        status: failure instanceof RateLimited ? 429 : 409,
        ...(failure instanceof RateLimited ? { headers: { "retry-after": String(failure.retryAfterSeconds) } } : {}),
      }))
    }
    return Effect.fail(failure)
  }))
}

function matchRoute(method: string, path: string) {
  const segments = path.split("/")
  for (const route of botAdjacentRuntimeRoutes) {
    if (route.method !== method) continue
    const template = route.path.split("/")
    if (template.length !== segments.length) continue
    const params: Record<string, string> = {}
    if (template.every((part, index) => {
      const value = segments[index] ?? ""
      if (part.startsWith(":")) { params[part.slice(1)] = value; return value.length > 0 }
      return part === value
    })) return { operation: route.operation, params }
  }
  return undefined
}

function normalizeTag(value: string): string {
  const tag = `#${value.trim().toUpperCase().replace(/^#/u, "").replaceAll("O", "0")}`
  if (!/^#[0289PYLQGRJCUV]{3,14}$/u.test(tag)) throw new Error("Invalid Clash player tag")
  return tag
}
function normalizeTags(values: readonly string[], limit: number): string[] {
  if (values.length > limit) throw new Error(`A maximum of ${limit} player tags is allowed`)
  return [...new Set(values.map(normalizeTag))]
}
function input<A>(evaluate: () => A): Effect.Effect<A, InvalidRequest> {
  return Effect.try({ try: evaluate, catch: (cause) => new InvalidRequest({ message: cause instanceof Error ? cause.message : "Invalid request" }) })
}
function db<A>(effect: Effect.Effect<A, unknown>): Effect.Effect<A, DatabaseFailure> {
  return effect.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Bot integration database operation failed" })))
}
function decodeBody<A>(request: Request, schema: Schema.Codec<A, unknown, never, never>): Effect.Effect<A, InvalidRequest | PayloadTooLarge> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Effect.fail(new InvalidRequest({ message: "Content-Type must be application/json", status: 415 }))
  }
  return readBoundedJson(request, 16_384).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError((cause) => cause instanceof InvalidRequest || cause instanceof PayloadTooLarge ? cause : new InvalidRequest({ message: "Request body failed schema validation" })),
  )
}
function encode<A>(schema: Schema.Codec<A, unknown, never, never>, value: A, headers: Record<string, string> = {}): Effect.Effect<Response, DatabaseFailure> {
  return Schema.encodeUnknownEffect(schema)(value).pipe(
    Effect.map((encoded) => Response.json(encoded, { headers })),
    Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Bot integration response failed its contract" })),
  )
}
