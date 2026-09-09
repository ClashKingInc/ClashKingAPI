import {
  AchievementsCheckEndpoint, BookmarksAddEndpoint, BookmarksDeleteEndpoint, BookmarksListEndpoint,
  BookmarksOrderEndpoint, RecentSearchesEndpoint, UpgradePreferencesGetEndpoint,
  UpgradePreferencesPatchEndpoint, UpgradesGetEndpoint, UpgradesPutEndpoint,
  requireEndpointSuccessStatus,
  type AnyEndpoint, type Bookmark, type BookmarkType, type EndpointRequest, type EndpointResponse,
} from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity, type ApiPrincipal, type UserPrincipal } from "./auth.js"
import type { WorkerBindings } from "./environment.js"
import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, NotFound, Unauthenticated, type ApiFailure } from "./errors.js"
import { correctTag } from "./home.js"
import { checkMobileAchievements } from "./mobile-achievements.js"
import { readBoundedJson } from "./request-body.js"

type EntityType = typeof BookmarkType.Type
type JsonObject = EndpointResponse<typeof UpgradesGetEndpoint>["data"]
type Runtime<A> = Effect.Effect<A, ApiFailure, SqlClient.SqlClient>
const database = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.mapError((cause) =>
  cause instanceof Conflict || cause instanceof NotFound || cause instanceof InvalidRequest || cause instanceof Unauthenticated
    ? cause : new DatabaseFailure({ cause, message: "Mobile persistence database operation failed" })))
const decode = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(
  Effect.mapError(() => new InvalidRequest({ message: "Mobile request failed schema validation" })),
)
const timestamp = (value: Date | string) => new Date(value).toISOString()
const normalizedTag = (raw: string) => {
  const tag = correctTag(raw)
  return tag === "#" || tag === "" ? Effect.fail(new InvalidRequest({ message: "Tag is required" })) : Effect.succeed(tag)
}

/** Recheck under the transaction lock: account deletion must invalidate a user mutation. */
const lockAuthenticatedUser = (userId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${userId} FOR UPDATE`
  if (rows.length === 0) return yield* new Unauthenticated({ message: "User session is no longer valid" })
})

const subject = (principal: ApiPrincipal, raw: string): Effect.Effect<string, Forbidden | InvalidRequest> => {
  const userId = raw.trim()
  if (userId === "") return Effect.fail(new InvalidRequest({ message: "Invalid link subject" }))
  if (principal.kind === "user" && principal.userId !== userId) return Effect.fail(new Forbidden({ message: "You cannot manage links for another user" }))
  return Effect.succeed(userId)
}

interface BookmarkRow { readonly entity_type: EntityType; readonly tag: string; readonly order_index: number; readonly created_at: Date | string }
const bookmark = (row: BookmarkRow): typeof Bookmark.Type => ({
  type: row.entity_type, tag: row.tag, order_index: row.order_index, created_at: timestamp(row.created_at),
  ...(row.entity_type === "player" ? { player_tag: row.tag } : { clan_tag: row.tag }),
})

/** Caller must authorize this subject before invoking the initialization/read helper. */
export const listMobileBookmarks = (userId: string, type: EntityType): Runtime<EndpointResponse<typeof BookmarksListEndpoint>> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* database(sql<BookmarkRow>`SELECT entity_type, tag, order_index, created_at FROM user_bookmarks
    WHERE user_id = ${userId} AND entity_type = ${type} ORDER BY order_index, created_at`)
  return { items: rows.map(bookmark) }
})

const lockBookmarkSubject = (principal: ApiPrincipal, userId: string) =>
  principal.kind === "user" ? lockAuthenticatedUser(userId) : Effect.void

const addBookmark = (principal: ApiPrincipal, userId: string, type: EntityType, rawTag: string): Runtime<typeof Bookmark.Type> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const tag = yield* normalizedTag(rawTag)
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    yield* lockBookmarkSubject(principal, userId)
    if (type === "player") {
      const links = yield* sql`SELECT tag FROM player_links WHERE user_id = ${userId} AND tag = ${tag}`
      if (links.length > 0) return yield* new Conflict({ message: "Linked player accounts cannot also be bookmarked" })
    }
    yield* sql`INSERT INTO user_bookmarks (user_id, entity_type, tag, order_index, created_at)
      SELECT ${userId}, ${type}, ${tag}, count(*)::integer, now() FROM user_bookmarks WHERE user_id = ${userId} AND entity_type = ${type}
      ON CONFLICT (user_id, entity_type, tag) DO NOTHING`
    const rows = yield* sql<BookmarkRow>`SELECT entity_type, tag, order_index, created_at FROM user_bookmarks
      WHERE user_id = ${userId} AND entity_type = ${type} AND tag = ${tag}`
    if (rows[0] === undefined) return yield* Effect.die(new Error("Bookmark insert returned no saved row"))
    return bookmark(rows[0])
  })))
})

const deleteBookmark = (principal: ApiPrincipal, userId: string, type: EntityType, rawTag: string): Runtime<{ message: string }> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const tag = yield* normalizedTag(rawTag)
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    yield* lockBookmarkSubject(principal, userId)
    const rows = yield* sql`DELETE FROM user_bookmarks WHERE user_id = ${userId} AND entity_type = ${type} AND tag = ${tag} RETURNING tag`
    if (rows.length === 0) return yield* new NotFound({ message: "Bookmark not found" })
    if (type === "player") yield* sql`DELETE FROM mobile_notification_accounts WHERE user_id = ${userId} AND player_tag = ${tag} AND source = 'bookmarked'`
    return { message: "Bookmark deleted" }
  })))
})

const orderBookmarks = (principal: ApiPrincipal, userId: string, type: EntityType, rawTags: ReadonlyArray<string>): Runtime<{ message: string }> => Effect.gen(function* () {
  const tags = yield* Effect.forEach(rawTags, normalizedTag)
  if (tags.length === 0 || new Set(tags).size !== tags.length) return yield* new InvalidRequest({ message: "ordered_tags must contain distinct bookmarked tags" })
  const sql = yield* SqlClient.SqlClient
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    yield* lockBookmarkSubject(principal, userId)
    const rows = yield* sql`SELECT tag FROM user_bookmarks WHERE user_id = ${userId} AND entity_type = ${type} AND tag = ANY(${tags}::text[])`
    if (rows.length !== tags.length) return yield* new InvalidRequest({ message: "All ordered tags must be bookmarked" })
    yield* sql`UPDATE user_bookmarks AS bookmarks SET order_index = ordered.position::integer - 1
      FROM unnest(${tags}::text[]) WITH ORDINALITY AS ordered(tag, position)
      WHERE bookmarks.user_id = ${userId} AND bookmarks.entity_type = ${type} AND bookmarks.tag = ordered.tag`
    return { message: "Bookmarks reordered" }
  })))
})

interface UpgradeRow { readonly value: JsonObject; readonly updated_at: Date | string | null }
const upgradeState = (principal: ApiPrincipal, userId: string, rawTag: string, preferences: boolean, value?: JsonObject): Runtime<UpgradeRow> => Effect.gen(function* () {
  const tag = yield* normalizedTag(rawTag)
  const sql = yield* SqlClient.SqlClient
  // One statement gives the ownership check and data the same snapshot without
  // serializing read-only requests against account/link mutations.
  if (value === undefined) {
    const rows = yield* database(sql<UpgradeRow & { active: boolean; linked_tag: string | null }>`
      SELECT ${principal.kind === "user" ? sql`EXISTS(SELECT 1 FROM auth_users WHERE user_id = ${userId})` : sql`true`} AS active,
        link.tag AS linked_tag, COALESCE(state.${preferences ? sql`preferences` : sql`data`}, '{}'::jsonb) AS value, state.updated_at
      FROM (SELECT 1) anchor
      LEFT JOIN player_links link ON link.user_id = ${userId} AND link.tag = ${tag} AND link.is_verified = true
      LEFT JOIN ${preferences ? sql`player_upgrade_preferences` : sql`player_upgrades`} state ON state.player_tag = link.tag`)
    const row = rows[0]
    if (!row?.active) return yield* new Unauthenticated({ message: "User session is no longer valid" })
    if (row.linked_tag === null) return yield* new NotFound({ message: "Verified linked player not found" })
    return { value: row.value, updated_at: row.updated_at }
  }
  return yield* database(sql.withTransaction(Effect.gen(function* () {
    if (principal.kind === "user") yield* lockAuthenticatedUser(userId)
    const links = yield* sql`SELECT tag FROM player_links WHERE user_id = ${userId} AND tag = ${tag} AND is_verified = true FOR UPDATE`
    if (links.length === 0) return yield* new NotFound({ message: "Verified linked player not found" })
    const rows = preferences
        ? yield* sql<UpgradeRow>`INSERT INTO player_upgrade_preferences (player_tag, preferences, updated_at) VALUES (${tag}, ${JSON.stringify(value)}::jsonb, now())
            ON CONFLICT (player_tag) DO UPDATE SET preferences = player_upgrade_preferences.preferences || EXCLUDED.preferences, updated_at = now()
            RETURNING preferences AS value, updated_at`
        : yield* sql<UpgradeRow>`INSERT INTO player_upgrades (player_tag, data, updated_at) VALUES (${tag}, ${JSON.stringify(value)}::jsonb, now())
            ON CONFLICT (player_tag) DO UPDATE SET data = EXCLUDED.data, updated_at = now() RETURNING data AS value, updated_at`
    return rows[0] ?? { value: {}, updated_at: null }
  })))
})

const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined
const badge = (value: unknown) => { const large = text(object(value).large); return large === undefined ? undefined : { large } }
export const compactRecentSnapshot = (type: EntityType, value: unknown): JsonObject | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  const doc = object(value), out: Record<string, JsonObject[string]> = {}
  const name = text(doc.name)
  if (name !== undefined) out.name = name
  if (type === "clan") {
    const urls = badge(doc.badgeUrls), members = positive(doc.members)
    if (urls !== undefined) out.badgeUrls = urls
    if (members !== undefined) out.members = members
    return out
  }
  const townHall = positive(doc.townHallLevel)
  if (townHall !== undefined) out.townHallLevel = townHall
  const clan = object(doc.clan), clanTag = text(clan.tag), clanName = text(clan.name), urls = badge(clan.badgeUrls)
  if (clanTag !== undefined || clanName !== undefined || urls !== undefined) out.clan = {
    ...(clanTag === undefined ? {} : { tag: clanTag }), ...(clanName === undefined ? {} : { name: clanName }), ...(urls === undefined ? {} : { badgeUrls: urls }),
  }
  const league = object(doc.league), id = positive(league.id), leagueName = text(league.name), medium = text(object(league.iconUrls).medium)
  if (id !== undefined || leagueName !== undefined || medium !== undefined) out.league = {
    ...(id === undefined ? {} : { id }), ...(leagueName === undefined ? {} : { name: leagueName }), ...(medium === undefined ? {} : { iconUrls: { medium } }),
  }
  return out
}

/** Caller supplies a verified JWT principal, never an untrusted proxy header. Errors are best-effort at the proxy boundary. */
export const recordSuccessfulProxySearch = (principal: UserPrincipal, pathAndQuery: string, status: number, body: unknown): Effect.Effect<void, DatabaseFailure | Unauthenticated, SqlClient.SqlClient> => Effect.gen(function* () {
  if (status !== 200 || principal.kind !== "user" || principal.userId.trim() === "") return
  let parts: string[]
  try { parts = new URL(`/${pathAndQuery.replace(/^\/+/, "")}`, "http://clash-proxy.internal").pathname.split("/") } catch { return }
  if (parts.length !== 4 || parts[1] !== "v1" || (parts[2] !== "players" && parts[2] !== "clans") || !parts[3]) return
  let tag: string
  try { tag = correctTag(decodeURIComponent(parts[3])) } catch { return }
  if (tag === "#" || tag === "") return
  const type = parts[2] === "players" ? "player" : "clan"
  const data = compactRecentSnapshot(type, body)
  if (data === undefined) return
  const sql = yield* SqlClient.SqlClient
  yield* sql.withTransaction(Effect.gen(function* () {
    yield* lockBookmarkSubject(principal, principal.userId)
    yield* sql`DELETE FROM user_recent_searches WHERE user_id = ${principal.userId} AND entity_type = ${type} AND tag = ${tag}`
    yield* sql`INSERT INTO user_recent_searches (user_id, entity_type, tag, data, created_at) VALUES (${principal.userId}, ${type}, ${tag}, ${JSON.stringify(data)}::jsonb, now())`
  })).pipe(Effect.mapError((cause) => cause instanceof Unauthenticated ? cause : new DatabaseFailure({ cause, message: "Recent search persistence failed" })))
})

/** Caller must authorize this subject before invoking the initialization/read helper. */
export const listMobileRecentSearches = (userId: string): Runtime<EndpointResponse<typeof RecentSearchesEndpoint>> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* database(sql<{ entity_type: EntityType; tag: string; data: unknown; created_at: Date | string }>`SELECT entity_type, tag, data, created_at
    FROM user_recent_searches WHERE user_id = ${userId} AND created_at >= now() - interval '90 days' ORDER BY created_at DESC`)
  const values = (type: EntityType) => rows.filter((row) => row.entity_type === type).map((row) => ({ ...compactRecentSnapshot(type, row.data), tag: row.tag, created_at: timestamp(row.created_at) }))
  return yield* Schema.decodeUnknownEffect(RecentSearchesEndpoint.response)({ players: values("player"), clans: values("clan") }).pipe(Effect.orDie)
})

interface RouteContext { readonly principal: ApiPrincipal; readonly bindings: WorkerBindings }
const route = <E extends AnyEndpoint>(endpoint: E, execute: (input: EndpointRequest<E>, context: RouteContext) => Runtime<EndpointResponse<E>>) => ({
  endpoint,
  run: (request: Request, rawPath: Record<string, string>, context: RouteContext): Runtime<Response> => Effect.gen(function* () {
    if (endpoint.bodyMode === "json" && request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return yield* new InvalidRequest({ status: 415, message: "Content-Type must be application/json" })
    }
    const path = yield* decode(endpoint.pathParams, rawPath)
    const query = yield* decode(endpoint.query, Object.fromEntries(new URL(request.url).searchParams))
    const body = yield* decode(endpoint.body, endpoint.bodyMode === "none" ? {} : yield* readBoundedJson(request))
    // These schemas are tied to E by the factory; their generic Type is erased by AnyEndpoint.
    const value = yield* execute({ path, query, body } as EndpointRequest<E>, context)
    const encoded = yield* Schema.encodeUnknownEffect(endpoint.response)(value).pipe(Effect.orDie)
    return Response.json(encoded, { status: requireEndpointSuccessStatus(endpoint) })
  }),
})

const routes = [
  route(AchievementsCheckEndpoint, (_, { principal, bindings }) => principal.kind === "user"
    ? checkMobileAchievements(principal.userId, bindings) : Effect.fail(new Unauthenticated({ message: "User authentication is required" }))),
  route(BookmarksListEndpoint, ({ path, query }, { principal }) => subject(principal, path.userId).pipe(Effect.flatMap((id) => listMobileBookmarks(id, query.type)))),
  route(BookmarksAddEndpoint, ({ path, body }, { principal }) => subject(principal, path.userId).pipe(Effect.flatMap((id) => addBookmark(principal, id, body.type, body.tag)))),
  route(BookmarksDeleteEndpoint, ({ path }, { principal }) => subject(principal, path.userId).pipe(Effect.flatMap((id) => deleteBookmark(principal, id, path.type, path.tag)))),
  route(BookmarksOrderEndpoint, ({ path, body }, { principal }) => subject(principal, path.userId).pipe(Effect.flatMap((id) => orderBookmarks(principal, id, body.type, body.ordered_tags)))),
  route(RecentSearchesEndpoint, ({ path }, { principal }) => subject(principal, path.userId).pipe(Effect.flatMap((id) => listMobileRecentSearches(id)))),
  route(UpgradesGetEndpoint, ({ path }, { principal }) => Effect.gen(function* () {
    const id = yield* subject(principal, path.userId), row = yield* upgradeState(principal, id, path.playerTag, false)
    return { player_tag: correctTag(path.playerTag), data: row.value, updated_at: row.updated_at === null ? null : timestamp(row.updated_at) }
  })),
  route(UpgradesPutEndpoint, ({ path, body }, { principal }) => Effect.gen(function* () {
    const id = yield* subject(principal, path.userId), row = yield* upgradeState(principal, id, path.playerTag, false, body.data)
    return { player_tag: correctTag(path.playerTag), data: row.value, updated_at: row.updated_at === null ? null : timestamp(row.updated_at) }
  })),
  route(UpgradePreferencesGetEndpoint, ({ path }, { principal }) => Effect.gen(function* () {
    const id = yield* subject(principal, path.userId), row = yield* upgradeState(principal, id, path.playerTag, true)
    return { player_tag: correctTag(path.playerTag), preferences: row.value, updated_at: row.updated_at === null ? null : timestamp(row.updated_at) }
  })),
  route(UpgradePreferencesPatchEndpoint, ({ path, body }, { principal }) => Effect.gen(function* () {
    const id = yield* subject(principal, path.userId), row = yield* upgradeState(principal, id, path.playerTag, true, body.preferences)
    return { player_tag: correctTag(path.playerTag), preferences: row.value, updated_at: row.updated_at === null ? null : timestamp(row.updated_at) }
  })),
]

// Literal inventory is consumed by the repository's static parity analyzer.
export const mobilePersistenceRuntimeRoutes = [
  { method: "POST", path: "/v2/achievements/check" },
  { method: "GET", path: "/v2/links/:userId/bookmarks" },
  { method: "POST", path: "/v2/links/:userId/bookmarks" },
  { method: "DELETE", path: "/v2/links/:userId/bookmarks/:type/:tag" },
  { method: "PUT", path: "/v2/links/:userId/bookmarks/order" },
  { method: "GET", path: "/v2/links/:userId/searches" },
  { method: "GET", path: "/v2/links/:userId/:playerTag/upgrades" },
  { method: "PUT", path: "/v2/links/:userId/:playerTag/upgrades" },
  { method: "GET", path: "/v2/links/:userId/:playerTag/upgrade-preferences" },
  { method: "PATCH", path: "/v2/links/:userId/:playerTag/upgrade-preferences" },
] as const
export const dispatchMobilePersistence = (request: Request, bindings: WorkerBindings): Effect.Effect<Response | undefined, ApiFailure, AuthIdentity | SqlClient.SqlClient> => Effect.gen(function* () {
  const actual = new URL(request.url).pathname.split("/")
  for (const candidate of routes) {
    const expected = candidate.endpoint.path.split("/")
    if (candidate.endpoint.method !== request.method || expected.length !== actual.length || expected.some((part, i) => !part.startsWith(":") && part !== actual[i])) continue
    const path = yield* Effect.try({ try: () => Object.fromEntries(expected.flatMap((part, i) => part.startsWith(":") ? [[part.slice(1), decodeURIComponent(actual[i]!)]] : [])), catch: () => new InvalidRequest({ message: "Malformed path encoding" }) })
    const auth = yield* AuthIdentity
    const principal = yield* (candidate.endpoint.auth === "user" ? auth.requireUser(request) : auth.requireUserOrBot(request))
    return yield* candidate.run(request, path, { principal, bindings })
  }
  return undefined
})
