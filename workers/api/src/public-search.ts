import { Effect, Schema } from "effect"
import { InvalidRequest, UpstreamUnavailable } from "./errors.js"
import { decryptStoredFernet, encryptStoredFernet } from "./fernet.js"
import { correctTag } from "./home.js"
import { lookupStaticItem } from "./static-metadata.js"
import { badgeUrls } from "./war-archive-model.js"
import locations from "../../../internal/routes/search_locations.json"
const JsonValue = Schema.Json

export interface SearchBindings {
  readonly ELASTICSEARCH: Fetcher
  readonly ELASTICSEARCH_API_KEY: string
  readonly ELASTICSEARCH_PLAYERS_ALIAS: string
  readonly ELASTICSEARCH_CLANS_ALIAS: string
  readonly DATA_ENCRYPTION_KEY: string
}
const ClanSource = Schema.Struct({ tag: Schema.String, name: Schema.String, clan_level: Schema.optionalKey(Schema.Number), badge_token: Schema.optionalKey(Schema.String), location_id: Schema.optionalKey(Schema.Number), cwl_league_id: Schema.optionalKey(Schema.Number), member_count: Schema.optionalKey(Schema.Number) })
const PlayerSource = Schema.Struct({ tag: Schema.String, name: Schema.String, league_id: Schema.optionalKey(Schema.Number), clan_tag: Schema.optionalKey(Schema.String), townhall_level: Schema.Number })
const SearchHit = Schema.Struct({ _source: JsonValue, sort: Schema.Array(JsonValue) })
const SearchResponse = Schema.Struct({ pit_id: Schema.optionalKey(Schema.String), hits: Schema.Struct({ hits: Schema.Array(SearchHit) }) })
const Cursor = Schema.Struct({ v: Schema.Number, entity: Schema.String, pit_id: Schema.String, search_after: Schema.Array(JsonValue), request_hash: Schema.String, expires_at: Schema.Number })
const Pit = Schema.Struct({ id: Schema.String })
const MGet = Schema.Struct({ docs: Schema.Array(Schema.Struct({ _id: Schema.String, found: Schema.Boolean, _source: Schema.optionalKey(ClanSource) })) })
export type SearchClanSource = typeof ClanSource.Type
export type SearchPlayerSource = typeof PlayerSource.Type
const tagPattern = /^#[PYLQGRJCUV0289]{3,15}$/u
const upstream = (cause: unknown) => new UpstreamUnavailable({ cause, message: "Elasticsearch search is unavailable" })
const invalid = (message: string): never => { throw new InvalidRequest({ message }) }
type Filters = Readonly<Record<string, readonly (number | string)[] | Readonly<{ min?: number; max?: number }>>>

export const normalizeSearch = (entity: "clan" | "player", query: URLSearchParams) => Effect.try({ try: () => {
  const text = (query.get("query") ?? "").trim()
  if ([...text].length < 2 || [...text].length > 100) invalid("Query must contain between 2 and 100 characters")
  const rawLimit = query.get("limit")?.trim()
  let limit = rawLimit ? Number(rawLimit) : 25
  if (limit === 0) limit = 25
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) invalid("Limit must be between 1 and 200")
  const parts = (key: string) => query.getAll(key).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean)
  const ids = (key: string, maximumCount: number, maximum = Infinity) => {
    const values = parts(key)
    if (values.length > maximumCount) invalid(`${key} contains too many values`)
    const numbers = values.map((value) => Number(value))
    if (numbers.some((value) => !Number.isSafeInteger(value) || value < 1 || value > maximum)) invalid(`${key} contains an unsupported value`)
    return [...new Set(numbers)].sort((a, b) => a - b)
  }
  const range = (key: string, minimum: number, maximum = Infinity) => {
    const minRaw = query.get(`${key}[min]`)?.trim(), maxRaw = query.get(`${key}[max]`)?.trim()
    const min = minRaw ? Number(minRaw) : undefined, max = maxRaw ? Number(maxRaw) : undefined
    if ([min, max].some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < minimum || value > maximum)) || min !== undefined && max !== undefined && min > max) invalid(`${key} contains an unsupported range`)
    return { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }
  }
  const filters: Record<string, readonly (number | string)[] | Readonly<{ min?: number; max?: number }>> = {}
  if (entity === "player") {
    const tags = parts("clanTags")
    if (tags.length > 100) invalid("Clan tags cannot contain more than 100 values")
    const normalized = [...new Set(tags.map(correctTag))].sort()
    if (normalized.some((tag) => !tagPattern.test(tag))) invalid("Clan tags contains an invalid tag")
    const leagues = ids("leagueIds", 5), townhalls = ids("townhallLevels", 100, 100)
    if (normalized.length) filters.clan_tags = normalized
    if (leagues.length) filters.league_ids = leagues
    if (townhalls.length) filters.townhall_levels = townhalls
  } else {
    const locations = ids("locationIds", 5), leagues = ids("warLeagueIds", 5)
    const levels = range("clanLevel", 1), members = range("members", 0, 50)
    if (locations.length) filters.location_ids = locations
    if (leagues.length) filters.cwl_league_ids = leagues
    if (Object.keys(levels).length) filters.clan_level = levels
    if (Object.keys(members).length) filters.members = members
  }
  return { entity, text, limit, filters, cursor: query.get("cursor") ?? "" }
}, catch: (cause) => cause instanceof InvalidRequest ? cause : new InvalidRequest({ message: "Invalid search query" }) })

export const elasticsearchQuery = (text: string, filters: Filters) => {
  const should: unknown[] = [{ match: { name: { query: text, operator: "and" } } }]
  const tag = correctTag(text)
  if (tagPattern.test(tag)) should.push({ term: { tag: { value: tag.toLowerCase(), boost: 100 } } })
  const mapping: Record<string, string> = { clan_tags: "clan_tag", league_ids: "league_id", townhall_levels: "townhall_level", location_ids: "location_id", cwl_league_ids: "cwl_league_id", clan_level: "clan_level", members: "member_count" }
  const clauses = Object.entries(filters).map(([key, value]) => {
    const field = mapping[key]
    if (!field) throw new Error("Unsupported search filter")
    if (Array.isArray(value)) return { terms: { [field]: value.map((item) => typeof item === "string" ? item.toLowerCase() : item) } }
    const range = value as { readonly min?: number; readonly max?: number }
    return { range: { [field]: { ...(range.min !== undefined ? { gte: range.min } : {}), ...(range.max !== undefined ? { lte: range.max } : {}) } } }
  })
  return { bool: { should, minimum_should_match: 1, ...(clauses.length ? { filter: clauses } : {}) } }
}

const esRequest = async (bindings: SearchBindings, path: string, method: "POST" | "DELETE", body?: unknown, signal?: AbortSignal): Promise<unknown> => {
  const response = await bindings.ELASTICSEARCH.fetch(`http://elasticsearch:9200${path}`, {
    method, headers: { authorization: `ApiKey ${bindings.ELASTICSEARCH_API_KEY}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal ? { signal } : {}), redirect: "error",
  })
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Elasticsearch returned ${response.status}`) }
  if (method === "DELETE") { await response.body?.cancel(); return {} }
  if (!response.body) throw new Error("Missing Elasticsearch response body")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 10 * 1024 * 1024) throw new Error("Elasticsearch response exceeds size limit")
      chunks.push(chunk.value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

export const searchSources = (bindings: SearchBindings, entity: "clan" | "player", query: URLSearchParams) => Effect.gen(function* () {
  const input = yield* normalizeSearch(entity, query)
  return yield* Effect.tryPromise({ try: async (signal) => {
    const alias = entity === "clan" ? bindings.ELASTICSEARCH_CLANS_ALIAS : bindings.ELASTICSEARCH_PLAYERS_ALIAS
    if (!/^[a-z0-9_-]+$/u.test(alias) || !bindings.ELASTICSEARCH_API_KEY) throw new Error("Elasticsearch is not configured")
    // Preserve Go JSON field order for cursors issued just before a cutover.
    const encoded = JSON.stringify({ entity, query: input.text, filters: input.filters }).replace(/[<>&\u2028\u2029]/gu, (value) => `\\u${value.charCodeAt(0).toString(16).padStart(4, "0")}`)
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encoded)))].map((byte) => byte.toString(16).padStart(2, "0")).join("")
    let pitId: string, searchAfter: readonly (typeof JsonValue.Type)[] = []
    if (input.cursor) {
      let cursor: typeof Cursor.Type
      try { cursor = Schema.decodeUnknownSync(Cursor)(JSON.parse(await decryptStoredFernet(input.cursor, bindings.DATA_ENCRYPTION_KEY))) }
      catch { return invalid("Invalid or expired search cursor") }
      if (cursor.v !== 1 || !cursor.pit_id || !cursor.search_after.length || Date.now() / 1000 >= cursor.expires_at) invalid("Invalid or expired search cursor")
      if (cursor.entity !== entity || cursor.request_hash !== hash) invalid("Search cursor does not match the query and filters")
      pitId = cursor.pit_id; searchAfter = cursor.search_after
    } else pitId = Schema.decodeUnknownSync(Pit)(await esRequest(bindings, `/${alias}/_pit?keep_alive=2m`, "POST", undefined, signal)).id
    if (!pitId) throw new Error("Empty Elasticsearch PIT")
    const close = async () => { try { await esRequest(bindings, "/_pit", "DELETE", { id: pitId }, signal) } catch { /* PIT expires after two minutes. */ } }
    try {
      const result = Schema.decodeUnknownSync(SearchResponse)(await esRequest(bindings, "/_search", "POST", {
        size: input.limit + 1, track_total_hits: false, pit: { id: pitId, keep_alive: "2m" }, query: elasticsearchQuery(input.text, input.filters),
        sort: [{ _score: "desc" }, { tag: "asc" }],
        _source: entity === "clan" ? ["tag", "name", "clan_level", "badge_token", "location_id", "cwl_league_id", "member_count"] : ["tag", "name", "league_id", "clan_tag", "townhall_level"],
        ...(searchAfter.length ? { search_after: searchAfter } : {}),
      }, signal))
      pitId = result.pit_id || pitId
      const hits = result.hits.hits.slice(0, input.limit)
      const hasMore = result.hits.hits.length > input.limit && hits.length > 0
      let nextCursor: string | null = null
      if (hasMore) {
        const sort = hits.at(-1)?.sort
        if (!sort?.length) throw new Error("Missing search sort position")
        nextCursor = await encryptStoredFernet(JSON.stringify({ v: 1, entity, pit_id: pitId, search_after: sort, request_hash: hash, expires_at: Math.floor(Date.now() / 1000) + 120 }), bindings.DATA_ENCRYPTION_KEY)
      } else await close()
      return { sources: hits.map((hit) => hit._source), pagination: { limit: input.limit, hasMore, nextCursor } }
    } catch (error) { await close(); throw error }
  }, catch: (cause) => cause instanceof InvalidRequest ? cause : upstream(cause) })
})

export const searchPlayerSources = (bindings: SearchBindings, query: URLSearchParams) => Effect.gen(function* () {
  const result = yield* searchSources(bindings, "player", query)
  const players = yield* Schema.decodeUnknownEffect(Schema.Array(PlayerSource))(result.sources).pipe(Effect.mapError(upstream))
  const tags = [...new Set(players.flatMap((player) => player.clan_tag ? [correctTag(player.clan_tag)] : []))]
  const clans = new Map<string, SearchClanSource>()
  if (tags.length) {
    const response = yield* Effect.tryPromise({ try: (signal) => esRequest(bindings, `/${bindings.ELASTICSEARCH_CLANS_ALIAS}/_mget?_source_includes=tag,name,clan_level,badge_token`, "POST", { ids: tags }, signal), catch: upstream })
    const decoded = yield* Schema.decodeUnknownEffect(MGet)(response).pipe(Effect.mapError(upstream))
    for (const doc of decoded.docs) if (doc.found && doc._source) clans.set(correctTag(doc._source.tag || doc._id), doc._source)
  }
  return { players, clans, pagination: result.pagination }
})
export const searchClanSources = (bindings: SearchBindings, query: URLSearchParams) => Effect.gen(function* () {
  const result = yield* searchSources(bindings, "clan", query)
  const clans = yield* Schema.decodeUnknownEffect(Schema.Array(ClanSource))(result.sources).pipe(Effect.mapError(upstream))
  return { clans, pagination: result.pagination }
})

const leagueReference = (category: string, id: number | undefined) => {
  if (id === undefined) return undefined
  const item = lookupStaticItem(category, id)
  return item ? { id, name: item.name } : undefined
}
export const queryPlayerSearch = (bindings: SearchBindings, query: URLSearchParams) => Effect.gen(function* () {
  const result = yield* searchPlayerSources(bindings, query)
  return { pagination: result.pagination, items: result.players.map((player) => {
    const leagueTier = leagueReference("league_tiers", player.league_id)
    const tag = player.clan_tag ? correctTag(player.clan_tag) : undefined
    const clan = tag ? result.clans.get(tag) : undefined
    return { name: player.name, tag: player.tag, townHallLevel: player.townhall_level,
      ...(leagueTier ? { leagueTier } : {}), ...(tag ? { clan: { tag,
        ...(clan ? { name: clan.name, clanLevel: clan.clan_level ?? 0, ...(clan.badge_token ? { badge: badgeUrls(clan.badge_token).large } : {}) } : {}),
      } } : {}),
    }
  }) }
})
export const queryClanSearch = (bindings: SearchBindings, query: URLSearchParams) => Effect.gen(function* () {
  const result = yield* searchClanSources(bindings, query)
  return { pagination: result.pagination, items: result.clans.map((clan) => {
    const location = locations.find((item) => item.id === clan.location_id)
    const warLeague = leagueReference("war_leagues", clan.cwl_league_id)
    return { name: clan.name, tag: clan.tag, clanLevel: clan.clan_level ?? 0, members: clan.member_count ?? 0,
      ...(clan.badge_token ? { badge: badgeUrls(clan.badge_token).large } : {}), ...(location ? { location } : {}), ...(warLeague ? { warLeague } : {}),
    }
  }) }
})
