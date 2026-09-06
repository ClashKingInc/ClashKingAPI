import {
  AccountConflictErrorResponse, LinksAddEndpoint, LinksOrderEndpoint, LinksRemoveEndpoint, LinksVisibilityEndpoint,
  requireEndpointSuccessStatus,
  type AnyEndpoint, type EndpointRequest, type EndpointResponse,
} from "@clashking/api-contracts"
import { Data, Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity, type ApiPrincipal } from "./auth.js"
import type { WorkerBindings } from "./environment.js"
import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, NotFound, Unauthenticated, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { correctTag } from "./home.js"
import { readBoundedJson } from "./request-body.js"

type LinkedPlayer = EndpointResponse<typeof LinksAddEndpoint>["account"]
type LinkBindings = { readonly CLASH_PROXY: Pick<WorkerBindings["CLASH_PROXY"], "fetch"> }
type Runtime<A> = Effect.Effect<A, ApiFailure | LinkOwnershipConflict, SqlClient.SqlClient>
class LinkOwnershipConflict extends Data.TaggedError("LinkOwnershipConflict")<{ readonly account: LinkedPlayer }> {}
interface LinkRow {
  readonly tag: string; readonly user_id: string | null; readonly order_index: number
  readonly is_verified: boolean; readonly hidden: boolean; readonly added_at: Date | string
  readonly verified_at: Date | string | null; readonly last_login: Date | string | null
}
const database = <A, E, R>(operation: Effect.Effect<A, E, R>) => operation.pipe(Effect.mapError((cause) =>
  cause instanceof Conflict || cause instanceof LinkOwnershipConflict || cause instanceof Forbidden || cause instanceof InvalidRequest
    || cause instanceof NotFound || cause instanceof Unauthenticated ? cause : new DatabaseFailure({ cause, message: "Account link operation failed" })))
const decode = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(
  Effect.mapError(() => new InvalidRequest({ message: "Account link request failed schema validation" })))
const tag = (raw: string) => {
  const value = correctTag(raw)
  return /^#[A-Z0-9]+$/u.test(value) ? Effect.succeed(value) : Effect.fail(new InvalidRequest({ message: "Player tag is required" }))
}
const subject = (principal: ApiPrincipal, raw: string): Effect.Effect<string, InvalidRequest | Forbidden> => {
  const id = raw.trim()
  if (id === "") return Effect.fail(new InvalidRequest({ message: "Invalid link subject" }))
  if (principal.kind === "user" && principal.userId !== id) return Effect.fail(new Forbidden({ message: "You cannot manage links for another user" }))
  return Effect.succeed(id)
}
const lockUser = (principal: ApiPrincipal) => Effect.gen(function* () {
  if (principal.kind === "bot") return
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${principal.userId} FOR UPDATE`
  if (rows.length === 0) return yield* new Unauthenticated({ message: "User session is no longer valid" })
})
const lockSubjects = (ids: ReadonlyArray<string>) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const id of [...new Set(ids)].sort()) {
    yield* sql`INSERT INTO subject_mutation_locks (subject_id) VALUES (${id}) ON CONFLICT (subject_id) DO NOTHING`
    yield* sql`SELECT subject_id FROM subject_mutation_locks WHERE subject_id = ${id} FOR UPDATE`
  }
})
const compactOrder = (userId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`WITH ordered AS (SELECT tag, (row_number() OVER (ORDER BY order_index, added_at, tag) - 1)::integer AS position
    FROM player_links WHERE user_id = ${userId}) UPDATE player_links AS links SET order_index = ordered.position, updated_at = now()
    FROM ordered WHERE links.tag = ordered.tag`
})
const iso = (value: Date | string) => new Date(value).toISOString()
const linkedAccount = (row: LinkRow): EndpointResponse<typeof LinksVisibilityEndpoint> => ({
  user_id: row.user_id ?? "", player_tag: row.tag, order_index: row.order_index, is_verified: row.is_verified,
  hidden: row.hidden, added_at: iso(row.added_at), last_login: row.last_login === null ? null : iso(row.last_login),
  ...(row.verified_at === null ? {} : { verified_at: iso(row.verified_at) }),
})

const PlayerIdentity = Schema.Struct({ tag: Schema.String, name: Schema.String, townHallLevel: Schema.Number })
const fetchClash = (bindings: LinkBindings, path: string, body?: { token: string }) => Effect.tryPromise({
  try: (signal) => bindings.CLASH_PROXY.fetch(new Request(`https://clash-proxy.internal/v1/${path}`, {
    signal, method: body === undefined ? "GET" : "POST", headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })),
  catch: (cause) => new UpstreamUnavailable({ cause, message: "Clash account verification is unavailable" }),
})
const upstreamJson = (response: Response) => readBoundedJson(response).pipe(
  Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Clash account verification returned invalid data" })))
const discard = (response: Response) => Effect.promise(() => response.body?.cancel().catch(() => undefined) ?? Promise.resolve())

const preparedLinkBrand=Symbol("clashking/PreparedLink")
export interface PreparedLink {
  readonly [preparedLinkBrand]: true
  readonly principal: ApiPrincipal
  readonly userId: string
  readonly player: typeof PlayerIdentity.Type
  readonly verifiedOwnership: boolean
}
export interface CommittedLink {
  readonly response: EndpointResponse<typeof LinksAddEndpoint>
  /** Read under the tag/subject locks, including both sides of a transfer. */
  readonly affectedSubjectIds: ReadonlyArray<string>
}

/** Provider I/O only. The opaque in-process result binds proof to its exact
 * subject and player; HTTP inputs cannot manufacture the private symbol. The
 * raw API token is deliberately absent from this result and every SQL write. */
export const prepareLink = (principal: ApiPrincipal, rawUserId: string, input: EndpointRequest<typeof LinksAddEndpoint>["body"], bindings: LinkBindings): Effect.Effect<PreparedLink,ApiFailure> => Effect.gen(function* () {
  const userId=yield* subject(principal,rawUserId)
  const playerTag = yield* tag(input.player_tag)
  const response = yield* fetchClash(bindings, `players/${encodeURIComponent(playerTag)}`)
  if (response.status === 404) { yield* discard(response); return yield* new NotFound({ message: "Clash of Clans account does not exist" }) }
  if (!response.ok) { yield* discard(response); return yield* new UpstreamUnavailable({ cause: response.status, message: "Clash account lookup is unavailable" }) }
  const player = yield* Schema.decodeUnknownEffect(PlayerIdentity)(yield* upstreamJson(response)).pipe(
    Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Clash account identity is invalid" })))
  if (player.tag !== playerTag) return yield* new UpstreamUnavailable({ cause: "Player tag mismatch", message: "Clash account identity is invalid" })
  const apiToken = input.api_token?.trim() ?? ""
  const verifyOwnership = apiToken !== ""
  if (verifyOwnership) {
    const verification = yield* fetchClash(bindings, `players/${encodeURIComponent(playerTag)}/verifytoken`, { token: apiToken })
    if (!verification.ok) {
      yield* discard(verification)
      return yield* new UpstreamUnavailable({ cause: verification.status, message: "Clash account verification is unavailable" })
    }
    const result = yield* Schema.decodeUnknownEffect(Schema.Struct({ status: Schema.Literals(["ok", "invalid"]) }))(yield* upstreamJson(verification)).pipe(
      Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Clash account verification returned invalid data" })))
    if (result.status !== "ok") return yield* new Forbidden({ message: "Invalid player token. Check your Clash of Clans account settings and try again." })
  }
  return Object.freeze({[preparedLinkBrand]:true as const,principal:Object.freeze({...principal}),userId,
    player:Object.freeze(player),verifiedOwnership:verifyOwnership})
})

/** SQL only. Callers may wrap this in their receipt/outbox transaction; the
 * returned affected subjects must be journaled before that transaction commits.
 * This performs the same canonical transfer cleanup and current-owner locking
 * for global, Dashboard and signed server-scoped linking. */
export const commitPreparedLink=(proof:PreparedLink):Runtime<CommittedLink>=>Effect.gen(function* () {
  if (proof?.[preparedLinkBrand] !== true) return yield* new InvalidRequest({message:"Account link provider proof is missing"})
  const {principal,userId,player,verifiedOwnership:verifyOwnership}=proof,playerTag=player.tag
  const sql = yield* SqlClient.SqlClient
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    yield* lockUser(principal)
    // A durable tag mutex also serializes claims when player_links has no row.
    yield* sql`INSERT INTO player_link_mutation_locks (tag) VALUES (${playerTag}) ON CONFLICT (tag) DO NOTHING`
    yield* sql`SELECT tag FROM player_link_mutation_locks WHERE tag = ${playerTag} FOR UPDATE`
    const owners = yield* sql<{ user_id: string | null }>`SELECT user_id FROM player_links WHERE tag = ${playerTag}`
    const previousOwner = owners[0]?.user_id
    yield* lockSubjects(previousOwner === null || previousOwner === undefined ? [userId] : [userId, previousOwner])
    const existing = (yield* sql<LinkRow>`SELECT tag, user_id, order_index, is_verified, hidden, added_at, verified_at, last_login
      FROM player_links WHERE tag = ${playerTag} FOR UPDATE`)[0]
    if (existing !== undefined && existing.user_id !== userId && !verifyOwnership) {
      return yield* new LinkOwnershipConflict({ account: { ...player, is_verified: false, hidden: false } })
    }
    if (existing !== undefined && existing.user_id !== userId) {
      // Delete preserves existing transfer semantics: private upgrades/preferences
      // cascade rather than exposing the previous owner's data to the new owner.
      yield* sql`DELETE FROM player_links WHERE tag = ${playerTag}`
      if (existing.user_id !== null) {
        yield* sql`DELETE FROM mobile_notification_accounts WHERE user_id = ${existing.user_id} AND player_tag = ${playerTag}`
        yield* compactOrder(existing.user_id)
      }
    }
    const saved = yield* sql<{ is_verified: boolean; hidden: boolean }>`INSERT INTO player_links
      (tag, user_id, source, order_index, is_verified, verified_at)
      SELECT ${playerTag}, ${userId}, 'clashking', COALESCE(max(order_index) + 1, 0), ${verifyOwnership}, CASE WHEN ${verifyOwnership} THEN now() ELSE NULL END
      FROM player_links WHERE user_id = ${userId}
      ON CONFLICT (tag) DO UPDATE SET source = 'clashking', is_verified = player_links.is_verified OR EXCLUDED.is_verified,
        verified_at = COALESCE(player_links.verified_at, EXCLUDED.verified_at), updated_at = now()
      RETURNING is_verified, hidden`
    if (saved[0] === undefined) return yield* Effect.die(new Error("Linked account was not saved"))
    if (verifyOwnership) yield* sql`DELETE FROM user_bookmarks WHERE user_id = ${userId} AND entity_type = 'player' AND tag = ${playerTag}`
    return {response:{
      message: verifyOwnership ? "Clash of Clans account linked successfully with ownership verification" : "Clash of Clans account linked successfully",
      account: { ...player, ...saved[0] },
    },affectedSubjectIds:[...new Set([userId,...(existing?.user_id ? [existing.user_id] : [])])].sort()}
  })))
})

export const addLink = (principal: ApiPrincipal, userId: string, input: EndpointRequest<typeof LinksAddEndpoint>["body"], bindings: LinkBindings): Runtime<EndpointResponse<typeof LinksAddEndpoint>> =>
  prepareLink(principal,userId,input,bindings).pipe(Effect.flatMap(commitPreparedLink),Effect.map(result=>result.response))

export const removeLink = (principal: ApiPrincipal, userId: string, rawTag: string): Runtime<EndpointResponse<typeof LinksRemoveEndpoint>> => Effect.gen(function* () {
  const playerTag = yield* tag(rawTag), sql = yield* SqlClient.SqlClient
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    yield* lockUser(principal)
    yield* lockSubjects([userId])
    const links = yield* sql<{ tag: string; is_verified: boolean }>`SELECT tag, is_verified FROM player_links WHERE user_id = ${userId} FOR UPDATE`
    const target = links.find((row) => row.tag === playerTag)
    if (target === undefined) return yield* new NotFound({ message: "Clash of Clans account not found or not linked to your profile" })
    if (target.is_verified && links.length > 1 && links.filter((row) => row.is_verified).length === 1) {
      return yield* new Conflict({ message: "Cannot remove the final verified link while other links remain" })
    }
    yield* sql`DELETE FROM player_links WHERE user_id = ${userId} AND tag = ${playerTag}`
    yield* sql`DELETE FROM mobile_notification_accounts WHERE user_id = ${userId} AND player_tag = ${playerTag}`
    yield* compactOrder(userId)
    return { message: "Clash of Clans account unlinked successfully" }
  })))
})

export const setLinkVisibility = (principal: ApiPrincipal, userId: string, rawTag: string, hidden: boolean): Runtime<EndpointResponse<typeof LinksVisibilityEndpoint>> => Effect.gen(function* () {
  const playerTag = yield* tag(rawTag), sql = yield* SqlClient.SqlClient
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    yield* lockUser(principal)
    yield* lockSubjects([userId])
    const rows = yield* sql<LinkRow>`UPDATE player_links SET hidden = ${hidden}, updated_at = now()
      WHERE user_id = ${userId} AND tag = ${playerTag} AND is_verified = true
      RETURNING tag, user_id, order_index, is_verified, hidden, added_at, verified_at, last_login`
    if (rows[0] !== undefined) return linkedAccount(rows[0])
    const existing = yield* sql`SELECT tag FROM player_links WHERE user_id = ${userId} AND tag = ${playerTag}`
    if (existing.length === 0) return yield* new NotFound({ message: "Clash of Clans account not found or not linked to your profile" })
    return yield* new Forbidden({ message: "Only verified links can be hidden" })
  })))
})

export const orderLinks = (principal: ApiPrincipal, userId: string, rawTags: ReadonlyArray<string>): Runtime<EndpointResponse<typeof LinksOrderEndpoint>> => Effect.gen(function* () {
  const tags = yield* Effect.forEach(rawTags, tag)
  if (tags.length === 0 || new Set(tags).size !== tags.length) return yield* new InvalidRequest({ message: "ordered_tags must contain distinct linked tags" })
  const sql = yield* SqlClient.SqlClient
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    yield* lockUser(principal)
    yield* lockSubjects([userId])
    const links = yield* sql`SELECT tag FROM player_links WHERE user_id = ${userId} AND tag = ANY(${tags}::text[])`
    if (links.length !== tags.length) return yield* new InvalidRequest({ message: "Invalid account tags provided" })
    yield* sql`UPDATE player_links AS links SET order_index = ordered.position::integer - 1, updated_at = now()
      FROM unnest(${tags}::text[]) WITH ORDINALITY AS ordered(tag, position) WHERE links.user_id = ${userId} AND links.tag = ordered.tag`
    return { message: "Accounts reordered successfully" }
  })))
})

const route = <E extends AnyEndpoint>(endpoint: E, execute: (input: EndpointRequest<E>, principal: ApiPrincipal, bindings: LinkBindings) => Runtime<EndpointResponse<E>>) => ({
  endpoint,
  run: (request: Request, rawPath: Record<string, string>, principal: ApiPrincipal, bindings: LinkBindings): Runtime<Response> => Effect.gen(function* () {
    if (endpoint.bodyMode === "json" && request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return yield* new InvalidRequest({ status: 415, message: "Content-Type must be application/json" })
    }
    const path = yield* decode(endpoint.pathParams, rawPath)
    const query = yield* decode(endpoint.query, Object.fromEntries(new URL(request.url).searchParams))
    const body = yield* decode(endpoint.body, endpoint.bodyMode === "none" ? {} : yield* readBoundedJson(request))
    // The factory binds these independently decoded fields to this endpoint.
    const result = yield* execute({ path, query, body } as EndpointRequest<E>, principal, bindings)
    return Response.json(yield* Schema.encodeUnknownEffect(endpoint.response)(result).pipe(Effect.orDie), { status: requireEndpointSuccessStatus(endpoint), headers: { "cache-control": "no-store" } })
  }),
})
const routes = [
  route(LinksAddEndpoint, ({ path, body }, principal, bindings) => subject(principal, path.userId).pipe(Effect.flatMap((id) => addLink(principal, id, body, bindings)))),
  route(LinksRemoveEndpoint, ({ path }, principal) => subject(principal, path.userId).pipe(Effect.flatMap((id) => removeLink(principal, id, path.playerTag)))),
  route(LinksVisibilityEndpoint, ({ path, body }, principal) => subject(principal, path.userId).pipe(Effect.flatMap((id) => setLinkVisibility(principal, id, path.playerTag, body.hidden)))),
  route(LinksOrderEndpoint, ({ path, body }, principal) => subject(principal, path.userId).pipe(Effect.flatMap((id) => orderLinks(principal, id, body.ordered_tags)))),
]
export const linkMutationRuntimeRoutes = [
  { method: "POST", path: "/v2/links/:userId" },
  { method: "DELETE", path: "/v2/links/:userId/:playerTag" },
  { method: "PATCH", path: "/v2/links/:userId/:playerTag" },
  { method: "PUT", path: "/v2/links/:userId/order" },
] as const
export const dispatchLinkMutations = (request: Request, bindings: LinkBindings): Effect.Effect<Response | undefined, ApiFailure, AuthIdentity | SqlClient.SqlClient> => Effect.gen(function* () {
  const actual = new URL(request.url).pathname.split("/")
  if (request.method === "PATCH" && actual.length === 5 && actual[4] === "last-login") return undefined
  for (const candidate of routes) {
    const expected = candidate.endpoint.path.split("/")
    if (candidate.endpoint.method !== request.method || expected.length !== actual.length || expected.some((part, i) => !part.startsWith(":") && part !== actual[i])) continue
    const path = yield* Effect.try({ try: () => Object.fromEntries(expected.flatMap((part, i) => part.startsWith(":") ? [[part.slice(1), decodeURIComponent(actual[i]!)]] : [])), catch: () => new InvalidRequest({ message: "Malformed path encoding" }) })
    const principal = yield* (yield* AuthIdentity).requireUserOrBot(request)
    return yield* candidate.run(request, path, principal, bindings).pipe(Effect.catchTag("LinkOwnershipConflict", ({ account }) => Effect.gen(function* () {
      const body = yield* Schema.encodeUnknownEffect(AccountConflictErrorResponse)({ code: "conflict", message: "This Clash of Clans account is already linked to another user", account }).pipe(Effect.orDie)
      return Response.json(body, { status: 409, headers: { "cache-control": "no-store" } })
    })))
  }
  return undefined
})
