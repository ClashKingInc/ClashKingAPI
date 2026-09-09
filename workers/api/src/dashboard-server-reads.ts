import { DecimalSnowflake, ServerLeaderboardsEndpoint, ServerLinksEndpoint, type EndpointResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { DiscordApi } from "./discord-api.js"
import { readDashboardGatewayCollection } from "./dashboard-gateway-cache.js"
import type { WorkerBindings } from "./environment.js"
import { DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"

export const dashboardServerReadOperationIds = ["serverLinks", "serverLeaderboards"] as const
type LinksQuery = typeof ServerLinksEndpoint.query.Type
type LinksResponse = EndpointResponse<typeof ServerLinksEndpoint>
type LeaderboardQuery = typeof ServerLeaderboardsEndpoint.query.Type
type LeaderboardResponse = EndpointResponse<typeof ServerLeaderboardsEndpoint>
const OptionalText = Schema.optionalKey(Schema.NullOr(Schema.String))
const Member = Schema.Struct({
  user: Schema.Struct({ id: DecimalSnowflake, username: Schema.String, global_name: OptionalText,
    avatar: OptionalText, discriminator: Schema.String, bot: Schema.optionalKey(Schema.Boolean) }),
  nick: OptionalText, avatar: OptionalText, roles: Schema.optionalKey(Schema.Array(DecimalSnowflake)),
})
const Members = Schema.Array(Member)
type DiscordMember = typeof Member.Type
const Roles = Schema.Array(Schema.Struct({ id: DecimalSnowflake, name: Schema.String, color: Schema.Number, position: Schema.Number, managed: Schema.Boolean }))
const Locations = Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.Number, name: Schema.String, countryCode: Schema.optionalKey(Schema.String) })) })
const database = <A>(effect: Effect.Effect<A, unknown>) => effect.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Server read database operation failed" })))
const decode = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(
  Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Server read upstream response failed its schema" })),
)
const input = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(
  Effect.mapError(() => new InvalidRequest({ message: "Invalid server read parameters" })),
)
const numericQuery = (value: number | undefined, fallback: number) => value === undefined || !Number.isSafeInteger(value) ? fallback : value
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

const memberName = (member: DiscordMember) => member.nick ?? member.user.global_name ?? member.user.username
export const serverMemberAvatar = (serverId: string, member: DiscordMember): string => {
  const hash = member.avatar ?? member.user.avatar
  if (hash !== null && hash !== undefined) {
    if (hash === "") return ""
    const prefix = member.avatar === null || member.avatar === undefined ? `/avatars/${member.user.id}` : `/guilds/${serverId}/users/${member.user.id}/avatars`
    return `https://cdn.discordapp.com${prefix}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}`
  }
  if (!/^\d+$/u.test(member.user.discriminator)) return ""
  const legacyIndex = Number(BigInt(member.user.discriminator) % 5n)
  const index = legacyIndex === 0 ? Number((BigInt(member.user.id) >> 22n) % 6n) : legacyIndex
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}

const fetchMembers = (bindings: WorkerBindings, serverId: string) => Effect.gen(function* () {
  const members = yield* readDashboardGatewayCollection(bindings.DISCORD_CLIENT_ID, serverId, "members").pipe(Effect.flatMap(body => decode(Members, body)))
  return members.filter(member => member.user.bot !== true)
})

export const parseServerLinksQuery = (raw: string) => {
  let remainder = raw.trim()
  const roleIds: string[] = []
  while (true) {
    const match = /^<@&(\d+)>\s*/u.exec(remainder)
    if (match === null) break
    roleIds.push(match[1]!)
    remainder = remainder.slice(match[0].length).trim()
  }
  const isPlayerTag = /^#?[0289PYLQGRJCUV]{3,15}$/u.test(remainder.toUpperCase())
  return { roleIds, playerTag: isPlayerTag ? `#${remainder.toUpperCase().replace(/^#/u, "")}` : "", text: isPlayerTag ? "" : remainder.toLowerCase() }
}
interface LinkRow {
  readonly user_id: string
  readonly tag: string
  readonly is_verified: boolean
  readonly added_at: Date | string
  readonly name: string | null
  readonly townhall_level: number | null
}

/** Caller must authorize the server links section before invoking this read. */
export const getDashboardServerLinks = (bindings: WorkerBindings, serverId: string, query: LinksQuery): Effect.Effect<LinksResponse, ApiFailure, SqlClient.SqlClient | DiscordApi> => Effect.gen(function* () {
  yield* input(DecimalSnowflake, serverId)
  const sql = yield* SqlClient.SqlClient
  const servers = yield* database(sql<{ id: string }>`SELECT id FROM servers WHERE id = ${serverId} LIMIT 1`)
  if (servers.length === 0) return yield* new NotFound({ message: "Server not found" })
  const requestedLimit = numericQuery(query.limit, 100)
  const limit = requestedLimit <= 0 ? 100 : Math.min(requestedLimit, 5000)
  const offset = Math.max(0, numericQuery(query.offset, 0))
  const parsed = parseServerLinksQuery(query.query ?? "")
  const members = yield* fetchMembers(bindings, serverId)
  const roles = (yield* readDashboardGatewayCollection(bindings.DISCORD_CLIENT_ID, serverId, "roles").pipe(Effect.flatMap((body) => decode(Roles, body))))
    .filter((role) => role.id !== serverId && role.name !== "@everyone" && !role.managed)
    .map(({ managed: _managed, ...role }) => role).sort((a, b) => b.position - a.position)
  const allowedRoles = new Set(roles.map((role) => role.id))
  if (parsed.roleIds.some((id) => !allowedRoles.has(id))) return yield* new InvalidRequest({ message: "Role mention is not available for link filtering" })
  const memberIds = members.map((member) => member.user.id)
  const rows = memberIds.length === 0 ? [] : yield* database(sql<LinkRow>`
    SELECT links.user_id, links.tag, links.is_verified, links.added_at, player.name, player.townhall_level
    FROM player_links links LEFT JOIN basic_player player ON player.tag = links.tag
    WHERE links.user_id = ANY(${memberIds}::text[]) AND links.hidden = false
    ORDER BY links.order_index ASC, links.added_at ASC
  `)
  const byUser = new Map<string, LinkRow[]>()
  for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row])
  const filtered: Array<LinksResponse["members"][number]> = []
  for (const member of members) {
    const links = byUser.get(member.user.id) ?? []
    if (parsed.roleIds.length > 0 && !parsed.roleIds.some((id) => member.roles?.includes(id))) continue
    if (parsed.playerTag !== "" && !links.some((row) => row.tag === parsed.playerTag)) continue
    if (parsed.text !== "" && !member.user.username.toLowerCase().includes(parsed.text) && !memberName(member).toLowerCase().includes(parsed.text)) continue
    if (query.account_filter === "none" && links.length > 0) continue
    filtered.push({ user_id: member.user.id, username: member.user.username, display_name: memberName(member), avatar_url: serverMemberAvatar(serverId, member),
      account_count: links.length, linked_accounts: links.map((row) => ({
        player_tag: row.tag, is_verified: row.is_verified, added_at: new Date(row.added_at).toISOString().replace(/\.\d{3}Z$/u, "Z"),
        ...(row.name === null ? {} : { player_name: row.name }), ...(row.townhall_level === null ? {} : { town_hall: row.townhall_level }),
      })),
    })
  }
  filtered.sort((a, b) => b.account_count - a.account_count || compareText(a.display_name.toLowerCase(), b.display_name.toLowerCase()) || compareText(a.user_id, b.user_id))
  return { members: filtered.slice(offset, offset + limit), roles, total_members: members.length, filtered_members: filtered.length,
    members_with_links: byUser.size, total_linked_accounts: rows.length, verified_accounts: rows.filter((row) => row.is_verified).length }
})

interface ClanRow { readonly tag: string; readonly name: string }
interface PlayerRow { readonly tag: string; readonly name: string; readonly clan_tag: string | null; readonly townhall_level: number; readonly trophies: number }
interface PlayerRankRow { readonly player_tag: string; readonly location_id: string; readonly rank: number | null; readonly points: number | null }
interface ClanRankRow { readonly tag: string; readonly clan_level: number; readonly clan_points: number; readonly member_count: number; readonly capital_points: number; readonly global_rank: number | null; readonly local_rank: number | null }
interface PlayerRanks { global_rank: number | null; local_rank: number | null; location_id: string | null; legend_trophies: number | null }

const fetchLocations = (bindings: WorkerBindings) => Effect.gen(function* () {
  const response = yield* Effect.tryPromise({ try: () => bindings.CLASH_PROXY.fetch(new Request("http://clash-proxy.internal/v1/locations", { signal: AbortSignal.timeout(15_000) })),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Clash locations request failed" }) })
  if (!response.ok) {
    yield* Effect.tryPromise({ try: () => response.body?.cancel() ?? Promise.resolve(), catch: (cause) => new UpstreamUnavailable({ cause, message: "Clash locations response cancellation failed" }) })
    return yield* new UpstreamUnavailable({ cause: response.status, message: "Clash locations request failed" })
  }
  const body = yield* Effect.tryPromise({ try: () => response.json() as Promise<unknown>, catch: (cause) => new UpstreamUnavailable({ cause, message: "Clash locations returned invalid JSON" }) })
  return (yield* decode(Locations, body)).items
})

/** Rankings come from Tracking's current home-ranking tables, not legend_rankings_current. */
export const getDashboardServerLeaderboards = (bindings: WorkerBindings, serverId: string, query: LeaderboardQuery): Effect.Effect<LeaderboardResponse, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  yield* input(DecimalSnowflake, serverId)
  const sql = yield* SqlClient.SqlClient
  const limitPlayers = Math.max(1, Math.min(numericQuery(query.limit_players, 100), 500))
  const limitClans = Math.max(1, Math.min(numericQuery(query.limit_clans, 50), 200))
  const sortBy = query.sort_by ?? "global_rank"
  const clans = yield* database(sql<ClanRow>`SELECT sc.tag, clan.name FROM server_clans sc JOIN basic_clan clan ON clan.tag = sc.tag WHERE sc.server_id = ${serverId} ORDER BY clan.name, sc.tag`)
  if (clans.length === 0) return yield* new NotFound({ message: "No clans found for this server" })
  const clanTags = clans.map((clan) => clan.tag)
  const clanNames = new Map(clans.map((clan) => [clan.tag, clan.name]))
  const players = yield* database(sql<PlayerRow>`SELECT tag, clan_tag, name, townhall_level, trophies FROM basic_player WHERE clan_tag = ANY(${clanTags}::text[])`)
  const playerTags = players.map((player) => player.tag)
  const rankRows = yield* database(sql<PlayerRankRow>`
    SELECT player_tag, location_id, rank, points FROM player_rankings_current
    WHERE player_tag = ANY(${playerTags}::text[]) AND ranking_type = 'home'
    ORDER BY player_tag, CASE WHEN location_id = 'global' THEN 0 ELSE 1 END, location_id
  `)
  const ranks = new Map<string, PlayerRanks>()
  for (const row of rankRows) {
    const rank = ranks.get(row.player_tag) ?? { global_rank: null, local_rank: null, location_id: null, legend_trophies: null }
    if (row.location_id === "global") {
      if (row.rank !== null) rank.global_rank = row.rank
      if (row.points !== null) rank.legend_trophies = row.points
    } else {
      rank.location_id = row.location_id
      if (row.rank !== null) rank.local_rank = row.rank
    }
    ranks.set(row.player_tag, rank)
  }
  const locations = new Map((yield* fetchLocations(bindings)).map((location) => [String(location.id), location]))
  const playerResults = players.map((player): LeaderboardResponse["players"][number] => {
    const rank = ranks.get(player.tag)
    const location = rank?.location_id === null || rank?.location_id === undefined ? undefined : locations.get(rank.location_id)
    return { player_tag: player.tag, player_name: player.name || "Unknown", townhall_level: player.townhall_level,
      clan_tag: player.clan_tag ?? "", clan_name: clanNames.get(player.clan_tag ?? "") ?? "", trophies: player.trophies,
      global_rank: rank?.global_rank ?? null, local_rank: rank?.local_rank ?? null, location_id: rank?.location_id ?? null,
      country_code: location?.countryCode || null, country_name: location?.name ?? null, legend_trophies: rank?.legend_trophies ?? null }
  })
  const rankForSort = (player: LeaderboardResponse["players"][number]): number | null => {
    if (sortBy === "global_rank") return player.global_rank ?? null
    if (sortBy === "local_rank") return player.local_rank ?? null
    if (sortBy === "location_id") return Number(player.location_id) || null
    return null
  }
  playerResults.sort((a, b) => {
    if (sortBy === "trophies") return (b.trophies ?? 0) - (a.trophies ?? 0)
    if (sortBy === "legend_trophies") return (b.legend_trophies ?? 0) - (a.legend_trophies ?? 0)
    const left = rankForSort(a), right = rankForSort(b)
    return left === null || left <= 0 ? right === null || right <= 0 ? 0 : 1 : right === null || right <= 0 ? -1 : left - right
  })
  const clanRanks = yield* database(sql<ClanRankRow>`
    SELECT clan.tag, clan.clan_level, clan.clan_points, clan.member_count, clan.capital_points,
      max(ranking.rank) FILTER (WHERE ranking.ranking_type = 'home' AND ranking.location_id = 'global') AS global_rank,
      max(ranking.rank) FILTER (WHERE ranking.ranking_type = 'home' AND clan.location_id IS NOT NULL AND ranking.location_id = clan.location_id::text) AS local_rank
    FROM basic_clan clan LEFT JOIN clan_rankings_current ranking ON ranking.clan_tag = clan.tag AND ranking.ranking_type = 'home'
    WHERE clan.tag = ANY(${clanTags}::text[])
    GROUP BY clan.tag, clan.clan_level, clan.clan_points, clan.member_count, clan.capital_points, clan.location_id
  `)
  const byClan = new Map(clanRanks.map((row) => [row.tag, row]))
  const clanResults = clans.map((clan): LeaderboardResponse["clans"][number] => {
    const rank = byClan.get(clan.tag)
    return { clan_tag: clan.tag, clan_name: clan.name, global_rank: rank?.global_rank ?? null, local_rank: rank?.local_rank ?? null,
      country_code: null, country_name: null, clan_level: rank?.clan_level ?? null, clan_points: rank?.clan_points ?? null,
      member_count: rank?.member_count ?? null, capital_points: rank?.capital_points ?? null }
  }).sort((a, b) => (a.global_rank ?? 0) - (b.global_rank ?? 0))
  return { server_id: serverId, total_players: players.length, total_clans: clans.length,
    players: playerResults.slice(0, limitPlayers), clans: clanResults.slice(0, limitClans) }
})

export const executeDashboardServerReads = (operation: DashboardServerOperationInput): Effect.Effect<LinksResponse | LeaderboardResponse, ApiFailure, SqlClient.SqlClient | DiscordApi> => Effect.gen(function* () {
  if (operation.endpoint.operationId === "serverLinks") {
    const path = yield* input(ServerLinksEndpoint.pathParams, operation.path)
    const query = yield* input(ServerLinksEndpoint.query, operation.query)
    return yield* getDashboardServerLinks(operation.bindings, path.serverId, query)
  }
  if (operation.endpoint.operationId === "serverLeaderboards") {
    const path = yield* input(ServerLeaderboardsEndpoint.pathParams, operation.path)
    const query = yield* input(ServerLeaderboardsEndpoint.query, operation.query)
    return yield* getDashboardServerLeaderboards(operation.bindings, path.serverId, query)
  }
  return yield* new NotFound({ message: "Server read operation not found" })
})
