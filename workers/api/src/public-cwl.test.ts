import { Effect, Schema } from "effect"
import { describe, expect, it, vi } from "vitest"
vi.mock("./war-archive-decoder.js", () => ({ decodeArchiveFrame: vi.fn() }))
import { StoredCwlRounds, cwlStandings, cwlSummary, decodeStoredCwlRounds, nextCwlLeague, type CwlGroup, type CwlWar } from "./public-cwl.js"
import { historyKind, trophySeason } from "./public-history.js"
import { playerChangeTypes } from "./public-changes.js"

const group: CwlGroup = { cwl_id: "testcwl12345", season: "2026-08", state: "ended", rounds: [["#WAR"], ["#WAR", "#0"]], cwl_league_id: 48000018, war_size: 15, clan_tags: ["#P0Y", "#P0L"] }
const war: CwlWar = { war_id: "1", war_tag: "#WAR", state: "warEnded", size: 15, end_time: "2026-08-03T12:00:00Z", clan_tag: "#P0Y", opponent_tag: "#P0L", clan_stars: 30, opponent_stars: 30, clan_destruction_percentage: 95, opponent_destruction_percentage: 90 }
describe("public CWL calculations", () => {
  it("reads stored rounds as warTags objects", () => {
    expect(Schema.decodeUnknownSync(StoredCwlRounds)([{ warTags: ["#WAR", "#0"] }])).toEqual([{ warTags: ["#WAR", "#0"] }])
  })
  it("normalizes both persisted round encodings", async () => {
    await expect(Effect.runPromise(decodeStoredCwlRounds([["#WAR", "#0"]]))).resolves.toEqual([["#WAR", "#0"]])
    await expect(Effect.runPromise(decodeStoredCwlRounds([{ warTags: ["#WAR", "#0"] }]))).resolves.toEqual([["#WAR", "#0"]])
  })
  it("deduplicates rounds and applies the ten-star victory bonus and destruction tiebreak", () => {
    const wars = new Map([[war.war_tag, war]])
    expect(cwlStandings(group, wars)).toMatchObject({ complete: true, items: [{ tag: "#P0Y", rank: 1, stars: 40, wins: 1 }, { tag: "#P0L", rank: 2, stars: 30, losses: 1 }] })
    expect(cwlSummary(group, wars, "#P0Y")).toEqual({ rank: 1, stars: 40, destruction: 95, rounds: { won: 1, tied: 0, lost: 0 } })
    expect(cwlStandings({ ...group, rounds: [["#WAR", "#MISSING"]] }, wars).complete).toBe(false)
    expect(cwlSummary(group, new Map(), "#P0Y")).toBeUndefined()
  })
  it("uses competition ranks for exact ties", () => {
    const result = cwlStandings(group, new Map([[war.war_tag, { ...war, opponent_destruction_percentage: 95 }]]))
    expect(result.items.map((item) => [item.rank, item.stars, item.ties])).toEqual([[1, 30, 1], [1, 30, 1]])
  })
  it("preserves historical and May-August 2026 transition promotion rules", () => {
    expect(nextCwlLeague(48000018, 1, 8, "2026-04")).toBe(48000018)
    expect(nextCwlLeague(48000018, 4, 8, "2026-08")).toBe(48000019)
    expect(nextCwlLeague(48000018, 4, 8, "2026-09")).toBe(48000018)
    expect(nextCwlLeague(48000018, 7, 8, "2026-08")).toBe(48000018)
    expect(nextCwlLeague(48000018, 7, 8, "2026-09")).toBe(48000017)
    expect(nextCwlLeague(48000000, 1, 8, "2026-08")).toBe(48000000)
  })
  it("rejects prototype keys as public selectors", async () => {
    for (const raw of ["toString", "constructor", "__proto__"]) {
      await expect(Effect.runPromise(historyKind(raw))).rejects.toMatchObject({ _tag: "InvalidRequest" })
      await expect(Effect.runPromise(playerChangeTypes(raw))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
    expect(trophySeason("2025-09-12").season).toBe("2025-09")
    expect(trophySeason("2025-10-06T05:00:00Z").season).toBe("2025-10")
  })
})
