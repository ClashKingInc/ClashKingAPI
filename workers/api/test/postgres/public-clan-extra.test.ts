import { BotClanCachedEndpoint, BotClanRankingsEndpoint, BotCwlGroupEndpoint, BotCwlLeaderboardEndpoint, BotCwlRankingHistoryEndpoint } from "@clashking/api-contracts"
import { Effect, Layer, ManagedRuntime, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { zstdCompressSync } from "node:zlib"

import { databaseLayer } from "../../src/database.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { dispatchPublicClanExtra } from "../../src/public-clan-extra.js"
import { prepareStaticMetadata } from "../../src/static-metadata.js"
import producerWar from "../fixtures/war-producer.json"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const clanTag = "#PYY8822", groupId = "ClanExtra001"
const archive = { ...producerWar, warTag: "#CLANWAR", clan: { ...producerWar.clan, tag: clanTag, badgeToken: "fixture-badge" } }
const packedBytes = zstdCompressSync(Buffer.from(JSON.stringify(archive)), { dictionary: readFileSync(new URL("../../assets/war-json.zdict", import.meta.url)) })
const bindings = { HYPERDRIVE: { connectionString: databaseUrl }, ASSETS: { get: async (key: string) => ({ json: async () => ({ items: key.includes("capital_leagues")
  ? [{ _id: 85_000_001, name: "Bronze League III" }] : [{ _id: 48_000_000, name: "Unranked" }] }) }) } } as unknown as WorkerBindings
const runtime = ManagedRuntime.make(Layer.merge(databaseLayer(bindings), Layer.succeed(WorkerEnvironment, bindings)))
const run = (path: string) => Effect.gen(function* () {
  const response = yield* dispatchPublicClanExtra(new Request(`https://api.clashk.ing/v2${path}`), bindings)
  if (response === undefined || !response.ok) return yield* Effect.die(new Error(`GET ${path} returned ${response?.status}`))
  return yield* Effect.promise(() => response.json() as Promise<unknown>)
})
const execute = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | WorkerEnvironment>) =>
  runtime.runPromise(effect)

describe("public clan extra reads against authoritative Goose migrations", () => {
  afterAll(() => runtime.dispose())
  beforeAll(async () => {
    await Effect.runPromise(prepareStaticMetadata(bindings, ["war_leagues", "capital_leagues"]))
    await execute(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO basic_clan (tag, name, description, clan_level, clan_points, builder_base_points, capital_points,
        capital_gold_total, location_id, cwl_league_id, capital_league_id, public_war_log, war_wins, member_count,
        badge_token, troops_donated, troops_received, members, last_active)
        VALUES (${clanTag}, 'Fixture clan', 'Stored description', 20, 50000, 40000, 3000, 9007199254740991,
        32000006, 48000000, 85000001, true, 100, 1, 'fixture-badge', 1000, 900,
        '[{"tag":"#PYY8823","name":"Stored player","town_hall":18}]'::jsonb, '2026-09-03T00:00:00Z')`
      yield* sql`INSERT INTO clan_rankings_current (clan_tag, ranking_type, location_id, rank, points)
        SELECT ${clanTag}, 'home', (32000000 + n)::text, n, 50000 FROM generate_series(1, 300) n`
      yield* sql`INSERT INTO clan_rankings_current (clan_tag, ranking_type, location_id, rank, points) VALUES
        (${clanTag}, 'home', 'global', 5, 50000), (${clanTag}, 'builder_base', 'global', 6, 40000), (${clanTag}, 'capital', 'global', 7, 3000)`
      yield* sql`INSERT INTO cwl_groups (cwl_id, season, cwl_league_id, rounds, state, war_size) VALUES
        (${groupId}, '2026-09', 48000000, '[["#CLANWAR","#0"],["#CLANWAR","#MISSING"]]'::jsonb, 'ended', 15),
        ('ClanExtra000', '2026-08', 48000001, '[]'::jsonb, 'ended', 15)`
      yield* sql`INSERT INTO cwl_group_clans (cwl_id, clan_tag, name, clan_level, badge_token) VALUES
        (${groupId}, ${clanTag}, 'Fixture clan', 20, 'fixture-badge'), ('ClanExtra000', ${clanTag}, 'Older clan', 19, 'older-badge')`
      yield* sql`INSERT INTO cwl_group_members (cwl_id, clan_tag, name, tag, town_hall) VALUES
        (${groupId}, ${clanTag}, 'Stored player', '#PYY8823', 18)`
      yield* sql`INSERT INTO cwl_standings (cwl_id, clan_tag, season, cwl_league_id, war_size, stars, destruction, wins, wars_finished, total_clans_in_group, group_rank, global_rank)
        VALUES (${groupId}, ${clanTag}, '2026-09', 48000000, 15, 45, 98.125, 1, 1, 8, 1, 1)`
      yield* sql`INSERT INTO cwl_groups (cwl_id, season, cwl_league_id, rounds, state, war_size)
        SELECT 'RankExtra' || lpad(n::text, 3, '0'), '2026-09', 48000000, '[]'::jsonb, 'ended', 15 FROM generate_series(1, 300) n`
      yield* sql`INSERT INTO cwl_group_clans (cwl_id, clan_tag)
        SELECT 'RankExtra' || lpad(n::text, 3, '0'), '#RANK' || n::text FROM generate_series(1, 300) n`
      yield* sql`INSERT INTO cwl_standings (cwl_id, clan_tag, season, cwl_league_id, war_size, stars, group_rank, global_rank)
        SELECT 'RankExtra' || lpad(n::text, 3, '0'), '#RANK' || n::text, '2026-09', 48000000, 15, 40, 2, n + 1 FROM generate_series(1, 300) n`
    }))
  })

  it("encodes the cached clan and rejects unsafe capital-gold integers", async () => {
    await execute(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const cached = Schema.decodeUnknownSync(BotClanCachedEndpoint.response)(yield* run(`/clan/${encodeURIComponent(clanTag)}/cached`))
      expect(cached).toMatchObject({ name: "Fixture clan", capitalGoldTotal: Number.MAX_SAFE_INTEGER,
        warLeague: { id: 48000000, name: "Unranked" }, capitalLeague: { id: 85000001, name: "Bronze League III" },
        location: { id: 32000006, name: "International", isCountry: false },
        badgeUrls: { large: "https://api-assets.clashofclans.com/badges/512/fixture-badge.png" },
        members: [{ tag: "#PYY8823", name: "Stored player", townHallLevel: 18 }],
      })
      yield* sql`UPDATE basic_clan SET capital_gold_total = 9007199254740992 WHERE tag = ${clanTag}`
      expect(yield* run(`/clan/${encodeURIComponent(clanTag)}/cached`).pipe(Effect.flip)).toMatchObject({ _tag: "UpstreamUnavailable" })
      yield* sql`UPDATE basic_clan SET capital_gold_total = 123 WHERE tag = ${clanTag}`
    }))
  })

  it("encodes current clan rankings", async () => {
    await execute(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const rankings = Schema.decodeUnknownSync(BotClanRankingsEndpoint.response)(yield* run(`/clan/${encodeURIComponent(clanTag)}/rankings`))
      expect(rankings.homeVillage.placements).toHaveLength(301)
      expect(rankings.homeVillage.placements[0]).toEqual({ locationId: "global", rank: 5, points: 50000 })
      expect(rankings.builderBase).toEqual({ points: 40000, placements: [{ locationId: "global", rank: 6, points: 40000 }] })
      expect(rankings.clanCapital.points).toBe(3000)
      yield* sql`UPDATE basic_clan SET badge_token = '  ' WHERE tag = ${clanTag}`
      expect(yield* run(`/clan/${encodeURIComponent(clanTag)}/rankings`)).toMatchObject({ badge: null })
      yield* sql`UPDATE basic_clan SET badge_token = 'fixture-badge' WHERE tag = ${clanTag}`
    }))
  })

  it("encodes CWL ranking history", async () => {
    await execute(Effect.gen(function* () {
      const history = Schema.decodeUnknownSync(BotCwlRankingHistoryEndpoint.response)(yield* run(`/cwl/${encodeURIComponent(clanTag)}/ranking-history`))
      expect(history.items.map((item) => item.season)).toEqual(["2026-09", "2026-08"])
      expect(history.items[0]).toMatchObject({ rounds: [{ warTags: ["#CLANWAR", "#0"] }, { warTags: ["#CLANWAR", "#MISSING"] }],
        clan: { badgeToken: "fixture-badge", members: [{ tag: "#PYY8823", name: "Stored player", townHallLevel: 18 }] }, standing: { destruction: 98.125, globalRank: 1 },
      })
    }))
  })

  it("encodes the CWL leaderboard", async () => {
    await execute(Effect.gen(function* () {
      const leaderboard = Schema.decodeUnknownSync(BotCwlLeaderboardEndpoint.response)(yield* run("/leaderboard/cwl/48000000?season=2026-09&team_size=15"))
      expect(leaderboard.items).toHaveLength(301)
      expect(leaderboard.items[0]).toMatchObject({ clanTag, globalRank: 1, destruction: 98.125 })
      expect(leaderboard.items.at(-1)?.globalRank).toBe(301)
    }))
  })

  it("reads pending and packed CWL wars through the stored group route", async () => {
    await execute(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const warId = (yield* sql<{ war_id: number }>`INSERT INTO wars (clan_tag, opponent_tag, prep_time, start_time, end_time, size, war_type, war_tag, state)
        VALUES (${clanTag}, ${archive.opponent.tag}, ${archive.preparationStartTime}::timestamptz, ${archive.startTime}::timestamptz, ${archive.endTime}::timestamptz, 15, 'cwl', '#CLANWAR', 'ended') RETURNING war_id`)[0]!.war_id
      yield* sql`INSERT INTO war_archive_pending (war_id, end_time, payload) VALUES (${warId}, ${archive.endTime}::timestamptz, ${JSON.stringify(archive)}::jsonb)`
      const pending = Schema.decodeUnknownSync(BotCwlGroupEndpoint.response)(yield* run(`/cwl/${encodeURIComponent(clanTag)}/group?season=2026-09`))
      expect(pending).toMatchObject({ warLeague: { id: 48000000, name: "Unranked" },
        clans: [{ badgeUrls: { large: "https://api-assets.clashofclans.com/badges/512/fixture-badge.png" } }],
        rounds: [{ warTags: [{ tag: "#CLANWAR", startTime: "20260802T120000.000Z", warStartTime: "20260802T120000.000Z", season: "2026-09" }, { tag: "#0" }] }, { warTags: [{ tag: "#CLANWAR" }, { tag: "#MISSING" }] }],
      })
      const packId = (yield* sql<{ pack_id: string }>`INSERT INTO war_archive_packs (status, first_end_time, last_end_time) VALUES
        ('uploaded', ${archive.endTime}::timestamptz, ${archive.endTime}::timestamptz) RETURNING pack_id::text`)[0]!.pack_id
      yield* sql.withTransaction(Effect.gen(function* () {
        yield* sql`UPDATE wars SET archive_pack_id = ${packId}::bigint, archive_offset = 25, archive_compressed_bytes = ${packedBytes.byteLength} WHERE war_id = ${warId}`
        yield* sql`DELETE FROM war_archive_pending WHERE war_id = ${warId}`
      }))
      const fetchArchive = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe(`https://wars.clashk.ing/packs/${packId.padStart(6, "0")}.pack`)
        expect(new Headers(init?.headers).get("range")).toBe(`bytes=25-${24 + packedBytes.byteLength}`)
        return new Response(packedBytes, { status: 206, headers: {
          "content-length": String(packedBytes.byteLength),
          "content-range": `bytes 25-${24 + packedBytes.byteLength}/${25 + packedBytes.byteLength}`,
        } })
      })
      vi.stubGlobal("fetch", fetchArchive)
      const packed = Schema.decodeUnknownSync(BotCwlGroupEndpoint.response)(yield* run(`/cwl/${encodeURIComponent(clanTag)}/group?season=2026-09`))
      expect(packed).toEqual(pending)
      expect(fetchArchive).toHaveBeenCalledTimes(1)
      vi.unstubAllGlobals()
    }))
  })
})
