import { BotServerClanGamesLeaderboardEndpoint, BotServerDonationsLeaderboardEndpoint, BotServerLegendsLeaderboardEndpoint, BotServerWarLeaderboardEndpoint, type AnyEndpoint } from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { dashboardServerActivityOperationIds, executeDashboardServerActivity, serverActivitySeason } from "./dashboard-server-activity.js"
import type { WorkerBindings } from "./environment.js"
import producer from "../test/fixtures/war-producer.json"

const serverId = "1234567890123456789"
const players = [
  { tag: "#PYY", name: "Player", clan_tag: "#AAA", townhall_level: 18, trophies: 5500, league_id: 29000022 },
  { tag: "#QYY", name: "Other", clan_tag: "#AAA", townhall_level: 17, trophies: 5600, league_id: 29000022 },
  { tag: "#RYY", name: "Unranked", clan_tag: "#AAA", townhall_level: 16, trophies: 5700, league_id: null },
]
const war = { ...producer, clan: { ...producer.clan, members: [{ ...producer.clan.members[0], attacks: [
  { defenderTag: "#QYY", stars: 3, destructionPercentage: 100, duration: 100, order: 1 },
  { defenderTag: "#QYY", stars: 2, destructionPercentage: 66.9, duration: 100, order: 2 },
] }] }, opponent: { ...producer.opponent, members: [{ ...producer.opponent.members[0], attacks: [
  { defenderTag: "#PYY", stars: 3, destructionPercentage: 100, duration: 100, order: 3 },
] }] } }
type Rows = ReadonlyArray<Readonly<Record<string, unknown>>>
function fixture(queryOverride?: (query: string, params: ReadonlyArray<unknown>) => Effect.Effect<Rows, unknown>) {
  const query = vi.fn((statement: string, params: ReadonlyArray<unknown>) => queryOverride?.(statement, params) ?? Effect.succeed(
    statement.includes("FROM server_clans") ? [{ tag: "#AAA", name: "Clan" }]
      : statement.includes("FROM basic_player") ? players
      : statement.includes("FROM player_war_history") ? [{ war_id: 1 }, { war_id: 2 }]
      : statement.includes("FROM wars w") ? [{ war_id: String(params[0]), war_type: params[0] === "2" ? "friendly" : "random", payload: war, archive_pack_id: null, archive_offset: null, archive_compressed_bytes: null }]
      : statement.includes("AS donated") ? [{ player_tag: "#PYY", donated: "100", received: "50" }]
      : [{ player_tag: "#QYY", clan_games: "4000" }],
  ))
  const sql = ((strings: TemplateStringsArray, ...params: ReadonlyArray<unknown>) => query(strings.join("?"), params)) as SqlClient.SqlClient
  const run = (endpoint: AnyEndpoint, queryParams: Readonly<Record<string, unknown>> = {}, id = serverId) => Effect.runPromise(executeDashboardServerActivity({
    endpoint, bindings: {} as WorkerBindings, path: { serverId: id }, query: queryParams, body: {}, principal: { kind: "bot" }, request: new Request("https://api.clashk.ing/"),
  }).pipe(Effect.provide(Layer.succeed(SqlClient.SqlClient, sql))))
  return { run, query }
}

describe("server activity leaderboards", () => {
  it("includes only four implemented read operations, never the denied CWL mutation", () => {
    expect(dashboardServerActivityOperationIds).toHaveLength(4)
    expect(dashboardServerActivityOperationIds.some((id) => id.includes("Cwl"))).toBe(false)
  })
  it("filters Legend League, sorts trophies and reports post-limit total with exact server IDs", async () => {
    const f = fixture()
    const result = Schema.decodeUnknownSync(BotServerLegendsLeaderboardEndpoint.response)(await f.run(BotServerLegendsLeaderboardEndpoint, { limit: 1 }))
    expect(result).toEqual({ server_id: serverId, items: [{ player_tag: "#QYY", player_name: "Other", townhall_level: 17, clan_tag: "#AAA", clan_name: "Clan", trophies: 5600 }], total: 1 })
    expect(f.query.mock.calls[0]?.[1]).toEqual([serverId])
  })
  it("sums canonical stat deltas over the trophy season and preserves donated/received", async () => {
    const f = fixture()
    const result = Schema.decodeUnknownSync(BotServerDonationsLeaderboardEndpoint.response)(await f.run(BotServerDonationsLeaderboardEndpoint, { season: "2025-09", limit: 999 }))
    expect(result).toMatchObject({ server_id: serverId, season: "2025-09", type: "donations", total: 1, items: [{ donated: 100, received: 50, score: 100, rank: 1 }] })
    const statement = f.query.mock.calls.at(-1)
    expect(statement?.[0]).toContain("ORDER BY donated DESC, received DESC, player_tag")
    expect(statement?.[1]).toEqual([["#PYY", "#QYY", "#RYY"], new Date("2025-08-25T05:00:00Z"), new Date("2025-10-06T05:00:00Z"), 500])
  })
  it("uses clan-games deltas and score, not a renamed donation field", async () => {
    const f = fixture()
    const result = Schema.decodeUnknownSync(BotServerClanGamesLeaderboardEndpoint.response)(await f.run(BotServerClanGamesLeaderboardEndpoint, { season: "2025-10", limit: 0 }))
    expect(result).toMatchObject({ season: "2025-10", type: "clan_games", items: [{ clan_games: 4000, score: 4000 }], total: 1 })
    expect(f.query.mock.calls.at(-1)?.[0]).toContain("stat_type = 'clan_games'")
    expect(f.query.mock.calls.at(-1)?.[1]?.at(-1)).toBe(1)
  })
  it("streams lifetime war history, excludes friendly wars, counts both sides and rounds Go metrics", async () => {
    const f = fixture()
    const result = Schema.decodeUnknownSync(BotServerWarLeaderboardEndpoint.response)(await f.run(BotServerWarLeaderboardEndpoint))
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ player_tag: "#PYY", total_attacks: 2, total_stars: 5, average_stars: 2.5, average_destruction: 83, three_star_attacks: 1, three_star_rate: 50 })
    expect(result.items[1]).toMatchObject({ player_tag: "#QYY", total_attacks: 1, total_stars: 3, three_star_rate: 100 })
    const history = f.query.mock.calls.find(([statement]) => statement.includes("FROM player_war_history"))
    expect(history?.[0]).toContain("LIMIT 128")
    expect(history?.[1]?.[2]).toEqual(new Date(0))
  })
  it("returns empty lists for servers without configured clans and never performs archive I/O", async () => {
    const f = fixture(() => Effect.succeed([]))
    expect(await f.run(BotServerWarLeaderboardEndpoint)).toEqual({ server_id: serverId, items: [], total: 0 })
    expect(await f.run(BotServerLegendsLeaderboardEndpoint)).toEqual({ server_id: serverId, items: [], total: 0 })
    expect(f.query.mock.calls.every(([statement]) => statement.includes("FROM server_clans"))).toBe(true)
  })
  it("rejects invalid seasons and non-string snowflakes before SQL", async () => {
    const f = fixture()
    await expect(f.run(BotServerDonationsLeaderboardEndpoint, { season: "2026-13" })).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(f.run(BotServerLegendsLeaderboardEndpoint, {}, "1e18")).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(f.query).not.toHaveBeenCalled()
  })
  it.each([
    ["2025-08", "2025-07-28T05:00:00.000Z", "2025-08-25T05:00:00.000Z"],
    ["2025-09", "2025-08-25T05:00:00.000Z", "2025-10-06T05:00:00.000Z"],
    ["2025-10", "2025-10-06T05:00:00.000Z", "2025-11-03T05:00:00.000Z"],
    ["2025-11", "2025-11-03T05:00:00.000Z", "2025-12-01T05:00:00.000Z"],
  ])("matches canonical season %s", async (season, start, end) => {
    const result = await Effect.runPromise(serverActivitySeason(season))
    expect(result.start.toISOString()).toBe(start); expect(result.end.toISOString()).toBe(end)
  })
  it("uses the canonical current trophy season rather than calendar month", async () => {
    expect((await Effect.runPromise(serverActivitySeason(undefined, new Date("2025-09-30T00:00:00Z")))).season).toBe("2025-09")
    expect((await Effect.runPromise(serverActivitySeason("2025-8"))).season).toBe("2025-8")
  })
})
