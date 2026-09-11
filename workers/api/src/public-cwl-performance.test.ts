import { readFileSync } from "node:fs"
import { zstdCompressSync } from "node:zlib"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { afterEach, describe, expect, it, vi } from "vitest"

import { queryPlayerCwlHistory } from "./public-cwl.js"

afterEach(() => vi.unstubAllGlobals())

const dictionary = readFileSync("workers/api/assets/war-json.zdict")
const storedWar = (warTag: string, clanTag: string, order: number) => ({
  warTag, state: "warEnded", teamSize: 15, attacksPerMember: 2,
  preparationStartTime: "2026-08-01T00:00:00Z", startTime: "2026-08-02T00:00:00Z",
  endTime: "2026-08-03T00:00:00Z", battleModifier: "",
  clan: { tag: clanTag, name: clanTag, badgeToken: "", clanLevel: 1, attacks: 2, stars: 5,
    destructionPercentage: 90, members: [
      { tag: "#PYY", name: "Player", townhallLevel: 18, mapPosition: 1,
        attacks: [{ defenderTag: "#DEF", stars: 3, destructionPercentage: 100, duration: 90, order }] },
      { tag: "#ALLY", name: "Ally", townhallLevel: 18, mapPosition: 2,
        attacks: [{ defenderTag: "#OTHER", stars: 2, destructionPercentage: 80, duration: 100, order: order + 1 }] },
    ] },
  opponent: { tag: `#O${order}`, name: "Opponent", badgeToken: "", clanLevel: 1, attacks: 0, stars: 0,
    destructionPercentage: 0, members: [
      { tag: "#DEF", name: "Defender", townhallLevel: 18, mapPosition: 1, attacks: [] },
      { tag: "#OTHER", name: "Other", townhallLevel: 18, mapPosition: 2, attacks: [] },
    ] },
})

describe("batched player CWL history", () => {
  it("loads groups, war metadata, and archive locators once while preserving placement completeness", async () => {
    const seeds = [
      { cwl_id: "complete", season: "2026-08", town_hall: 18, cwl_league_id: 48_000_010, war_size: 15,
        clan_tag: "#A", name: "A", badge_token: "", stars: null, wins: null, losses: null, ties: null, group_rank: null, global_rank: null },
      { cwl_id: "incomplete", season: "2026-07", town_hall: 18, cwl_league_id: 48_000_010, war_size: 15,
        clan_tag: "#B", name: "B", badge_token: "", stars: null, wins: null, losses: null, ties: null, group_rank: null, global_rank: null },
      { cwl_id: "current", season: "2026-06", town_hall: 18, cwl_league_id: 48_000_010, war_size: 15,
        clan_tag: "#C", name: "C", badge_token: "", stars: null, wins: null, losses: null, ties: null, group_rank: null, global_rank: null },
    ]
    const groups = [
      { ...seeds[0], state: "ended", rounds: [["#W1"]], clan_tags: ["#A", "#O1"] },
      { ...seeds[1], state: "ended", rounds: [["#W2"], ["#MISSING"]], clan_tags: ["#B", "#O2"] },
      { ...seeds[2], state: "inWar", rounds: [["#W3", "#W4"]], clan_tags: ["#C", "#O3", "#OTHER1", "#OTHER2"] },
    ].map(({ cwl_id, season, state, rounds, cwl_league_id, war_size, clan_tags }) =>
      ({ cwl_id, season, state, rounds, cwl_league_id, war_size, clan_tags }))
    const wars = [
      { war_id: "1", war_tag: "#W1", state: "warEnded", size: 15, end_time: "2026-08-03T00:00:00Z", clan_tag: "#A", opponent_tag: "#O1", clan_stars: 5, opponent_stars: 0, clan_destruction_percentage: 90, opponent_destruction_percentage: 0 },
      { war_id: "2", war_tag: "#W2", state: "warEnded", size: 15, end_time: "2026-07-03T00:00:00Z", clan_tag: "#B", opponent_tag: "#O2", clan_stars: 5, opponent_stars: 0, clan_destruction_percentage: 90, opponent_destruction_percentage: 0 },
      { war_id: "3", war_tag: "#W3", state: "warEnded", size: 15, end_time: "2026-06-03T00:00:00Z", clan_tag: "#C", opponent_tag: "#O3", clan_stars: 5, opponent_stars: 0, clan_destruction_percentage: 90, opponent_destruction_percentage: 0 },
    ]
    // Other clans' completed wars cannot contribute a placement while this
    // group is ongoing, so their full archives must not be fetched.
    wars.push({ ...wars[2]!, war_id: "4", war_tag: "#W4", clan_tag: "#OTHER1", opponent_tag: "#OTHER2" })
    const frames = new Map(wars.map((war, index) => [index, zstdCompressSync(
      JSON.stringify(storedWar(war.war_tag, war.clan_tag, (index + 1) * 10)), { dictionary })]))
    const counts = { seeds: 0, groups: 0, wars: 0, locators: 0 }
    const tag = ((strings: TemplateStringsArray, ...parameters: readonly unknown[]) => {
      const statement = strings.join("?")
      if (statement.includes("FROM cwl_group_members pm")) { counts.seeds++; return Effect.succeed(seeds) }
      if (statement.includes("WHERE g.cwl_id = ANY")) { counts.groups++; return Effect.succeed(groups) }
      if (statement.includes("FROM wars") && statement.includes("war_tag = ANY")) { counts.wars++; return Effect.succeed(wars) }
      if (statement.includes("AS pending FROM wars")) {
        counts.locators++
        return Effect.succeed((parameters[0] as readonly string[]).map((id) => ({
          war_id: id, war_type: "cwl", archive_pack_id: "1", archive_offset: String(Number(id) - 1),
          archive_compressed_bytes: frames.get(Number(id) - 1)!.length, payload: null, pending: false,
        })))
      }
      return Effect.die(`Unexpected SQL: ${statement}`)
    }) as unknown as SqlClient.SqlClient
    let active = 0, peak = 0
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      active++; peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active--
      const range = new Headers(init?.headers).get("range") ?? ""
      const offset = Number(/^bytes=(\d+)-\d+$/u.exec(range)?.[1] ?? -1)
      const frame = frames.get(offset)!
      return new Response(frame, { status: 206, headers: { "content-length": String(frame.byteLength),
        "content-range": `bytes ${offset}-${offset + frame.byteLength - 1}/${offset + frame.byteLength + 1}` } })
    })
    vi.stubGlobal("fetch", fetch)

    const result = await Effect.runPromise(queryPlayerCwlHistory("#PYY", new URLSearchParams()).pipe(
      Effect.provideService(SqlClient.SqlClient, tag)))

    expect(counts).toEqual({ seeds: 1, groups: 1, wars: 1, locators: 1 })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(peak).toBe(3)
    expect(result.items.map((item) => item.placement)).toEqual([{ clan: 1, group: 1 }, null, null])
    expect(result.items.map((item) => item.missedAttacks)).toEqual([1, 1, 1])
    expect(result.items.map((item) => item.attacks[0]?.round)).toEqual([1, 1, 1])
  })
})
