import { Effect, Layer, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { dispatchPublicClanExtra } from "./public-clan-extra.js"
import { prepareStaticMetadata } from "./static-metadata.js"
import producerWar from "../test/fixtures/war-producer.json"

const bindings = { ASSETS: { get: async (key: string) => ({ json: async () => ({ items: key.includes("capital_leagues")
  ? [{ _id: 85_000_001, name: "Bronze League III" }] : [{ _id: 48_000_000, name: "Unranked" }] }) }) } } as unknown as WorkerBindings
const fixture = (select: (query: string, values: readonly unknown[]) => readonly object[]) => {
  const statements: string[] = []
  const query = (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0] ?? ""
    const parameters: unknown[] = []
    for (const [index, value] of values.entries()) {
      if (typeof value === "object" && value !== null && "sqlFragment" in value && typeof value.sqlFragment === "string"
        && "sqlValues" in value && Array.isArray(value.sqlValues)) {
        text += value.sqlFragment
        parameters.push(...value.sqlValues)
      } else {
        text += "?"
        parameters.push(value)
      }
      text += strings[index + 1] ?? ""
    }
    // Constructing a SQL fragment is not executing a query.
    const rows = () => { statements.push(text); return select(text, parameters) }
    return Object.assign(Effect.sync(rows), {
      stream: Stream.suspend(() => Stream.fromIterable(rows())), sqlFragment: text, sqlValues: parameters,
    })
  }
  const layer = Layer.merge(Layer.succeed(SqlClient.SqlClient, query as unknown as SqlClient.SqlClient), Layer.succeed(WorkerEnvironment, bindings))
  return { statements, run: (path: string, method = "GET") => Effect.runPromise(Effect.gen(function* () {
    yield* prepareStaticMetadata(bindings, ["war_leagues", "capital_leagues"])
    return yield* dispatchPublicClanExtra(new Request(`https://api.clashk.ing${path}`, { method }), bindings)
  }).pipe(Effect.provide(layer))) }
}
const cached = { name: "Clan", tag: "#P0Y", description: "Fixture", clan_level: 20, clan_points: 50000, capital_gold_total: "9007199254740991",
  location_id: 32000006, cwl_league_id: 48000000, capital_league_id: 85000001, public_war_log: true,
  war_wins: 100, war_win_streak: 3, member_count: 1, badge_token: "badge", troops_donated: 1000, troops_received: 900,
  members: [{ tag: "#P0L", name: "Player", town_hall: 18 }], last_active: "2026-09-03T00:00:00Z",
}

describe("public clan extra dispatcher", () => {
  it("uses the authoritative Unranked reference for a cached clan's default league", async () => {
    const response = await fixture(() => [cached]).run("/v2/clan/%23P0Y/cached")
    expect(await response?.json()).toMatchObject({ warLeague: { id: 48000000, name: "Unranked" } })
  })

  it("keeps empty ranking badge tokens null", async () => {
    const response = await fixture((sql) => sql.includes("FROM basic_clan") ? [{ name: "Clan", badge_token: "  ", clan_points: 1, builder_base_points: 2, capital_points: 3 }] : []).run("/v2/clan/%23P0Y/rankings")
    expect(await response?.json()).toMatchObject({ badge: null })
  })

  it("preserves the largest safe capital gold count and rejects precision loss", async () => {
    const response = await fixture(() => [cached]).run("/v2/clan/%23P0Y/cached")
    expect(await response?.json()).toMatchObject({ capitalGoldTotal: Number.MAX_SAFE_INTEGER,
      badgeUrls: { small: "https://api-assets.clashofclans.com/badges/70/badge.png", large: "https://api-assets.clashofclans.com/badges/512/badge.png" },
      location: { id: 32000006, name: "International", isCountry: false },
      capitalLeague: { id: 85000001, name: "Bronze League III" }, members: [{ tag: "#P0L", name: "Player", townHallLevel: 18 }],
    })
    await expect(fixture(() => [{ ...cached, capital_gold_total: "9007199254740992" }]).run("/v2/clan/%23P0Y/cached"))
      .rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
  })

  it("returns canonical empty reads and does not touch SQL for unmatched routes", async () => {
    expect(await (await fixture(() => []).run("/v2/clan/%23P0Y/cached"))?.json()).toBeNull()
    const empty = fixture(() => [])
    expect(await empty.run("/v2/not-clan")).toBeUndefined()
    expect(await empty.run("/v2/clan/%23P0Y/cached", "POST")).toBeUndefined()
    expect(empty.statements).toEqual([])
  })

  it.each(["/v2/clan/%ZZ/cached", "/v2/cwl/%23P0Y/group?season=2026-02-30", "/v2/leaderboard/cwl/48000001?season=2026-09&team_size=1.5", "/v2/leaderboard/cwl/48000001?team_size=15"])("rejects invalid path or query %s before SQL", async (path) => {
    const invalid = fixture(() => [])
    await expect(invalid.run(path)).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(invalid.statements).toEqual([])
  })

  it("hydrates a repeated war once while preserving producer round arrays and placeholders", async () => {
    const group = fixture((sql) => {
      if (sql.includes("bool_or")) return [{ league: false, size: false }]
      if (sql.includes("SELECT g.cwl_id")) return [{ cwl_id: "FixtureGroup", season: "2026-09", state: "ended", rounds: [["#WAR", "#0"], ["#WAR", "#MISSING"]], cwl_league_id: 48000000 }]
      if (sql.includes("SELECT clan.clan_tag AS tag")) return []
      if (sql.includes("FROM wars WHERE")) return [{ war_id: "1", clan_tag: producerWar.clan.tag, war_tag: "#WAR" }]
      if (sql.includes("LEFT JOIN war_archive_pending")) return [{ war_id: "1", war_type: "cwl", payload: { ...producerWar, warTag: "#WAR" } }]
      throw new Error(`Unexpected SQL: ${sql}`)
    })
    const response = await group.run("/v2/cwl/%23P0Y/group")
    expect(await response?.json()).toMatchObject({ warLeague: { id: 48000000, name: "Unranked" }, rounds: [
      { warTags: [{ tag: "#WAR", season: "2026-09", startTime: "20260802T120000.000Z", warStartTime: "20260802T120000.000Z" }, { tag: "#0" }] },
      { warTags: [{ tag: "#WAR" }, { tag: "#MISSING" }] },
    ] })
    expect(group.statements.filter((sql) => sql.includes("LEFT JOIN war_archive_pending"))).toHaveLength(1)
  })

  it("rejects oversized placeholder rounds before archive hydration", async () => {
    const group = fixture((sql) => {
      if (sql.includes("bool_or")) return [{ league: false, size: false }]
      if (sql.includes("SELECT g.cwl_id")) return [{ cwl_id: "FixtureGroup", season: "2026-09", state: "ended", rounds: [["#WAR", "#" + "P".repeat(8 * 1024 * 1024)]], cwl_league_id: 48000001 }]
      if (sql.includes("FROM wars WHERE")) return [{ war_id: "1", clan_tag: producerWar.clan.tag, war_tag: "#WAR" }]
      return []
    })
    await expect(group.run("/v2/cwl/%23P0Y/group")).rejects.toMatchObject({ _tag: "UpstreamUnavailable" })
    expect(group.statements.some((sql) => sql.includes("LEFT JOIN war_archive_pending"))).toBe(false)
  })
})
