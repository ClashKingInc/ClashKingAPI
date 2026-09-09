import { botEndpoints, DecimalSnowflake } from "@clashking/api-contracts"
import { Context, Data, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity, bearerToken } from "./auth.js"
import { DiscordApi } from "./discord-api.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { DatabaseFailure, InvalidRequest, NotFound, PayloadTooLarge, Unauthenticated, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { ServerAuthorization } from "./server-authorization.js"
import { commitServerScopedLink,readServerLinkTokenPolicy,requireServerLinkToken } from "./server-scoped-linking.js"
import { prepareLink } from "./link-mutations.js"

class OperationConflict extends Data.TaggedError("OperationConflict")<{ readonly message: string }> {}
type OperationFailure = ApiFailure | OperationConflict

export const botAdjacentRuntimeRoutes = [
  { method: "POST", path: "/v2/links/shared", operation: "sharedLinksLookup" },
  { method: "POST", path: "/v2/links/server/:serverId", operation: "createServerLink" },
  { method: "DELETE", path: "/v2/links/server/:serverId", operation: "deleteServerLink" },
  { method: "GET", path: "/v2/server/:serverId/clans-basic", operation: "serverClans" },
  { method: "PUT", path: "/v2/bases/:baseId/votes/:voterId", operation: "upsertBaseVote" },
  { method: "DELETE", path: "/v2/bases/:baseId/votes/:voterId", operation: "removeBaseVote" },
  { method: "POST", path: "/v2/bases/:baseId/downloaders/:userId", operation: "recordBaseDownload" },
] as const

type SharedRequest = typeof botEndpoints.sharedLinksLookup.body.Type
type LinkMutation = typeof botEndpoints.createServerLink.response.Type
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
    try: () => bindings.CLASH_PROXY.fetch(new Request(`http://clash-proxy/v1/players/${encodeURIComponent(tag)}`)),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Failed to verify that the player no longer exists" }),
  })
  yield* Effect.promise(() => response.body?.cancel().catch(() => undefined) ?? Promise.resolve())
  if (response.ok) return yield* new OperationConflict({ message: "Player still exists; deletion is not allowed" })
  if (response.status !== 404) return yield* new UpstreamUnavailable({ cause: response.status, message: "Only a Clash 404 permits link deletion" })
  yield* sql.withTransaction(Effect.gen(function* () {
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
  readonly serverClans: (serverId: string) => Effect.Effect<typeof botEndpoints.serverClans.response.Type, OperationFailure>
  readonly upsertBaseVote: (baseId: string, voterId: string, direction: "up" | "down") => Effect.Effect<typeof botEndpoints.upsertBaseVote.response.Type, OperationFailure>
  readonly removeBaseVote: (baseId: string, voterId: string) => Effect.Effect<void, OperationFailure>
  readonly recordBaseDownload: (baseId: string, userId: string) => Effect.Effect<typeof botEndpoints.recordBaseDownload.response.Type, OperationFailure>
}>()("clashking/BotAdjacentStore") {
  static readonly layer = Layer.effect(BotAdjacentStore, Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const bindings = yield* WorkerEnvironment
    const discord = yield* DiscordApi

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
    if (failure instanceof OperationConflict) {
      return Effect.succeed(Response.json({ code: "conflict", message: failure.message }, { status: 409 }))
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
function normalizeTags(values: readonly string[], limit?: number): string[] {
  if (limit !== undefined && values.length > limit) throw new Error(`A maximum of ${limit} player tags is allowed`)
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
