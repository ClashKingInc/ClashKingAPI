import { ServerLeaderboardsEndpoint, ServerLinksEndpoint } from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { DiscordApi } from "./discord-api.js"
import { executeDashboardServerReads, getDashboardServerLeaderboards, getDashboardServerLinks, parseServerLinksQuery, serverMemberAvatar } from "./dashboard-server-reads.js"
import type { WorkerBindings } from "./environment.js"
import { RateLimited } from "./errors.js"

const serverId = "1234567890123456789"
const userA = "999999999999999991"
const userB = "999999999999999992"
const roleA = "888888888888888881"
const roleB = "888888888888888882"
const member = (id = userA, overrides = {}) => ({ user: { id, username: "player", global_name: "Player", discriminator: "0", avatar: null, bot: false }, roles: [roleA], nick: null, avatar: null, ...overrides })
const roles = [
  { id: serverId, name: "@everyone", color: 0, position: 0, managed: false },
  { id: roleA, name: "Alpha", color: 123, position: 1, managed: false },
  { id: roleB, name: "Beta", color: 456, position: 2, managed: false },
  { id: "777777777777777777", name: "Integration", color: 0, position: 3, managed: true },
]
const link = (user_id = userA, tag = "#2PP", verified = true) => ({ user_id, tag, is_verified: verified, added_at: new Date("2026-09-01T00:00:00Z"), name: "Clash Player", townhall_level: 17 })
type Rows = ReadonlyArray<Readonly<Record<string, unknown>>>
function fixture(options: {
  cached?: unknown
  members?: ReadonlyArray<unknown>
  discord?: DiscordApi["Service"]["request"]
  query?: (text: string, values: ReadonlyArray<unknown>) => Effect.Effect<Rows, unknown>
} = {}) {
  const query = vi.fn(options.query ?? ((text: string) => Effect.succeed(text.includes("FROM servers") ? [{ id: serverId }] : [link()])))
  const sql = ((parts: TemplateStringsArray, ...values: ReadonlyArray<unknown>) => query(parts.join("?"), values)) as SqlClient.SqlClient
  const discord = vi.fn(options.discord ?? ((path: string) => Effect.succeed(path.endsWith("/roles") ? roles : options.members ?? [member()])))
  const get = vi.fn().mockResolvedValue(options.cached ?? null)
  const put = vi.fn().mockResolvedValue(undefined)
  const proxy = vi.fn().mockResolvedValue(Response.json({ items: [{ id: 32000006, name: "Finland", countryCode: "FI" }] }))
  const bindings = { API_CACHE: { get, put }, CLASH_PROXY: { fetch: proxy } } as unknown as WorkerBindings
  const layer = Layer.mergeAll(Layer.succeed(SqlClient.SqlClient, sql), Layer.succeed(DiscordApi, { request: discord, token: () => Effect.die("Unexpected OAuth") }))
  return { query, discord, get, put, proxy, bindings, layer }
}

describe("server linked-member read", () => {
  it("joins visible links and returns Go totals, roles and avatar/name behavior", async () => {
    const f = fixture({ members: [member(), member(userB, { nick: "Beta", roles: [roleB] }), member("999999999999999993", { user: { ...member().user, id: "999999999999999993", bot: true } })] })
    const result = await Effect.runPromise(getDashboardServerLinks(f.bindings, serverId, {}).pipe(Effect.provide(f.layer)))
    expect(result).toMatchObject({ total_members: 2, filtered_members: 2, members_with_links: 1, total_linked_accounts: 1, verified_accounts: 1 })
    expect(result.roles.map((role) => role.id)).toEqual([roleB, roleA])
    expect(result.members[0]).toMatchObject({ user_id: userA, display_name: "Player", account_count: 1, linked_accounts: [{ player_tag: "#2PP", town_hall: 17, is_verified: true, added_at: "2026-09-01T00:00:00Z" }] })
    expect(f.query.mock.calls[0]?.[1]).toEqual([serverId])
    expect(f.query.mock.calls[1]?.[0]).toContain("links.hidden = false")
    expect(f.query.mock.calls[1]?.[1]).toEqual([[userA, userB]])
    expect(f.put).toHaveBeenCalledWith(`dashboard:server-links:members:v1:${serverId}`, expect.any(String), { expirationTtl: 900 })
    expect(Schema.decodeUnknownSync(ServerLinksEndpoint.response)(result)).toEqual(result)
  })

  it("uses role mention union plus display-name search and paginates after filtering", async () => {
    const f = fixture({ cached: [member(userA, { nick: "Zeta" }), member(userB, { nick: "Beta", roles: [roleB] })] })
    const result = await Effect.runPromise(getDashboardServerLinks(f.bindings, serverId, { query: `<@&${roleA}> <@&${roleB}> eta`, limit: 1, offset: 1 }).pipe(Effect.provide(f.layer)))
    expect(result.filtered_members).toBe(2)
    expect(result.members.map((item) => item.user_id)).toEqual([userB])
    expect(f.discord).toHaveBeenCalledOnce()
    expect(f.discord).toHaveBeenCalledWith(`/guilds/${serverId}/roles`)
    expect(f.put).not.toHaveBeenCalled()
  })

  it("player tags select their owner without narrowing the returned account list", async () => {
    const f = fixture({ query: (text) => Effect.succeed(text.includes("FROM servers") ? [{ id: serverId }] : [link(), link(userA, "#2QQ", false)]) })
    const result = await Effect.runPromise(getDashboardServerLinks(f.bindings, serverId, { query: "2qq" }).pipe(Effect.provide(f.layer)))
    expect(result.members[0]?.linked_accounts.map((account) => account.player_tag)).toEqual(["#2PP", "#2QQ"])
    expect(result.verified_accounts).toBe(1)
    expect(parseServerLinksQuery("not a tag")).toEqual({ roleIds: [], playerTag: "", text: "not a tag" })
  })

  it("none filter keeps unlinked members while totals remain unfiltered", async () => {
    const f = fixture({ cached: [member(), member(userB)] })
    const result = await Effect.runPromise(getDashboardServerLinks(f.bindings, serverId, { account_filter: "none", limit: 0, offset: -1 }).pipe(Effect.provide(f.layer)))
    expect(result.members.map((item) => item.user_id)).toEqual([userB])
    expect(result).toMatchObject({ filtered_members: 1, total_members: 2, members_with_links: 1, verified_accounts: 1 })
  })

  it("rejects managed/everyone/unknown role filters before querying links", async () => {
    const f = fixture()
    await expect(Effect.runPromise(getDashboardServerLinks(f.bindings, serverId, { query: "<@&777777777777777777>" }).pipe(Effect.provide(f.layer)))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(f.query).toHaveBeenCalledOnce()
  })

  it("keeps snowflake member cursors exact and caps the fetch at 5000 including bots", async () => {
    let page = 0
    const f = fixture({ discord: (path) => {
      if (path.endsWith("/roles")) return Effect.succeed(roles)
      const batch = Array.from({ length: 1000 }, (_, index) => member(String(9_000_000_000_000_000_000n + BigInt(page * 1000 + index))))
      page++
      return Effect.succeed(batch)
    } })
    const result = await Effect.runPromise(getDashboardServerLinks(f.bindings, serverId, { limit: 6000 }).pipe(Effect.provide(f.layer)))
    expect(page).toBe(5)
    expect(result.total_members).toBe(5000)
    expect(f.discord.mock.calls[1]?.[0]).toBe(`/guilds/${serverId}/members?limit=1000&after=9000000000000000999`)
  })

  it("sorts equal account counts by case-insensitive display name then exact user ID", async () => {
    const f = fixture({ cached: [member(userB), member(userA)], query: (text) => Effect.succeed(text.includes("FROM servers") ? [{ id: serverId }] : []) })
    const result = await Effect.runPromise(getDashboardServerLinks(f.bindings, serverId, {}).pipe(Effect.provide(f.layer)))
    expect(result.members.map((item) => item.user_id)).toEqual([userA, userB])
  })

  it("fails missing server before Discord/cache access and preserves Discord errors", async () => {
    const missing = fixture({ query: () => Effect.succeed([]) })
    await expect(Effect.runPromise(getDashboardServerLinks(missing.bindings, serverId, {}).pipe(Effect.provide(missing.layer)))).rejects.toMatchObject({ _tag: "NotFound" })
    expect(missing.get).not.toHaveBeenCalled()
    const limited = fixture({ discord: () => Effect.fail(new RateLimited({ message: "limited", retryAfterSeconds: 5 })) })
    await expect(Effect.runPromise(getDashboardServerLinks(limited.bindings, serverId, {}).pipe(Effect.provide(limited.layer)))).rejects.toMatchObject({ _tag: "RateLimited", retryAfterSeconds: 5 })
  })

  it("rejects numeric Discord response IDs instead of silently rounding", async () => {
    const f = fixture({ members: [{ ...member(), user: { ...member().user, id: 123 } }] })
    await expect(Effect.runPromise(getDashboardServerLinks(f.bindings, serverId, {}).pipe(Effect.provide(f.layer)))).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })

  it("matches guild/user animated avatar and legacy/default avatar selection", () => {
    expect(serverMemberAvatar(serverId, member(userA, { avatar: "a_guild" }))).toBe(`https://cdn.discordapp.com/guilds/${serverId}/users/${userA}/avatars/a_guild.gif`)
    expect(serverMemberAvatar(serverId, member(userA, { user: { ...member().user, avatar: "userhash" } }))).toBe(`https://cdn.discordapp.com/avatars/${userA}/userhash.png`)
    expect(serverMemberAvatar(serverId, member())).toBe(`https://cdn.discordapp.com/embed/avatars/${(BigInt(userA) >> 22n) % 6n}.png`)
    expect(serverMemberAvatar(serverId, member(userA, { user: { ...member().user, discriminator: "0002" } }))).toBe("https://cdn.discordapp.com/embed/avatars/2.png")
  })
})

describe("aggregate persisted server leaderboards", () => {
  const clans = [{ tag: "#AAA", name: "Alpha" }, { tag: "#BBB", name: "Beta" }]
  const players = [
    { tag: "#P1", name: "Player1", clan_tag: "#AAA", townhall_level: 17, trophies: 5000 },
    { tag: "#P2", name: "Player2", clan_tag: "#BBB", townhall_level: 16, trophies: 6000 },
    { tag: "#P3", name: "Player3", clan_tag: "#AAA", townhall_level: 15, trophies: 4000 },
  ]
  const ranks = [
    { player_tag: "#P1", location_id: "global", rank: 10, points: 1000 },
    { player_tag: "#P1", location_id: "32000006", rank: 2, points: 1000 },
    { player_tag: "#P2", location_id: "global", rank: 1, points: 500 },
  ]
  const clanRanks = [
    { tag: "#AAA", global_rank: 20, local_rank: 5, clan_level: 20, clan_points: 40000, member_count: 50, capital_points: 3000 },
    { tag: "#BBB", global_rank: null, local_rank: null, clan_level: 19, clan_points: 39000, member_count: 49, capital_points: 2000 },
  ]
  const query = (text: string) => Effect.succeed(text.includes("FROM server_clans") ? clans : text.includes("FROM basic_player") ? players : text.includes("FROM player_rankings_current") ? ranks : clanRanks)

  it("uses canonical persisted tables and preserves null unranked data and string server ID", async () => {
    const f = fixture({ query })
    const result = await Effect.runPromise(getDashboardServerLeaderboards(f.bindings, serverId, {}).pipe(Effect.provide(f.layer)))
    expect(result.server_id).toBe(serverId)
    expect(result.players.map((item) => item.player_tag)).toEqual(["#P2", "#P1", "#P3"])
    expect(result.players[1]).toMatchObject({ local_rank: 2, location_id: "32000006", country_code: "FI", country_name: "Finland" })
    expect(result.players[2]).toMatchObject({ global_rank: null, local_rank: null, legend_trophies: null, country_name: null })
    expect(result.clans.map((item) => item.clan_tag)).toEqual(["#BBB", "#AAA"])
    expect(result.clans[0]).toMatchObject({ global_rank: null, country_name: null })
    expect(f.query.mock.calls[0]?.[1]).toEqual([serverId])
    expect(f.query.mock.calls[2]?.[0]).toContain("ranking_type = 'home'")
    expect(f.query.mock.calls[3]?.[0]).toContain("clan_rankings_current")
    expect(f.query.mock.calls.every(([statement]) => !statement.includes("legend_rankings_current") && !/\b(?:INSERT|UPDATE|DELETE)\b/u.test(statement))).toBe(true)
    expect(Schema.decodeUnknownSync(ServerLeaderboardsEndpoint.response)(result)).toEqual(result)
  })

  it.each([
    ["trophies", ["#P2", "#P1", "#P3"]], ["legend_trophies", ["#P1", "#P2", "#P3"]],
    ["local_rank", ["#P1", "#P2", "#P3"]], ["unknown", ["#P1", "#P2", "#P3"]],
  ])("preserves Go sort behavior for %s", async (sort_by, expected) => {
    const f = fixture({ query })
    const result = await Effect.runPromise(getDashboardServerLeaderboards(f.bindings, serverId, { sort_by }).pipe(Effect.provide(f.layer)))
    expect(result.players.map((item) => item.player_tag)).toEqual(expected)
  })

  it("clamps independent result limits but preserves total population counts", async () => {
    const f = fixture({ query })
    const result = await Effect.runPromise(getDashboardServerLeaderboards(f.bindings, serverId, { limit_players: 0, limit_clans: -1 }).pipe(Effect.provide(f.layer)))
    expect(result).toMatchObject({ total_players: 3, total_clans: 2 })
    expect(result.players).toHaveLength(1)
    expect(result.clans).toHaveLength(1)
  })

  it("returns 404 for a server with no persisted configured clans", async () => {
    const f = fixture({ query: () => Effect.succeed([]) })
    await expect(Effect.runPromise(getDashboardServerLeaderboards(f.bindings, serverId, {}).pipe(Effect.provide(f.layer)))).rejects.toMatchObject({ _tag: "NotFound" })
    expect(f.proxy).not.toHaveBeenCalled()
  })

  it("rejects invalid server IDs before SQL and refuses malformed locations", async () => {
    const f = fixture({ query })
    await expect(Effect.runPromise(getDashboardServerLeaderboards(f.bindings, "1e18", {}).pipe(Effect.provide(f.layer)))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(f.query).not.toHaveBeenCalled()
    f.proxy.mockResolvedValue(Response.json({ items: [{ id: "32000006", name: "Finland" }] }))
    await expect(Effect.runPromise(getDashboardServerLeaderboards(f.bindings, serverId, {}).pipe(Effect.provide(f.layer)))).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })

  it("validates exported operation parameters before doing reads", async () => {
    const f = fixture()
    await expect(Effect.runPromise(executeDashboardServerReads({ endpoint: ServerLinksEndpoint, bindings: f.bindings, body: {}, path: { serverId }, query: { account_filter: "all" }, principal: { kind: "bot" }, request: new Request("https://api.clashk.ing/") }).pipe(Effect.provide(f.layer)))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(f.query).not.toHaveBeenCalled()
  })
})
