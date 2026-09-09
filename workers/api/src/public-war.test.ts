import { Effect, Schema } from "effect"
import { PlayerWarStatsResponse, WarResponse } from "@clashking/api-contracts"
import { describe, expect, it, vi } from "vitest"
vi.mock("./war-archive-decoder.js", () => ({ decodeArchiveFrame: vi.fn() }))
import { historyOptions, parsePreviousWarTime } from "./public-war.js"
import { ArchivedWar, StoredArchivedWar, hydrateArchivedWar, officialArchiveWar, playerWarHistoryItem } from "./war-archive-model.js"
import producerWar from "../test/fixtures/war-producer.json"

const war: ArchivedWar = {
  type: "cwl", state: "ended", teamSize: 15, attacksPerMember: 1,
  preparationStartTime: "2026-08-01T12:00:00Z", startTime: "2026-08-02T12:00:00Z", endTime: "2026-08-03T12:00:00Z", warTag: "#WAR",
  clan: { tag: "#A", members: [
    { tag: "#A1", attacks: [{ defenderTag: "#B1", stars: 2, destructionPercentage: 75, order: 2, duration: 90 }] },
    { tag: "#A2", attacks: [{ defenderTag: "#B1", stars: 3, destructionPercentage: 100, order: 3, duration: 100 }] },
  ] },
  opponent: { tag: "#B", members: [{ tag: "#B1", attacks: [] }, { tag: "#B2", attacks: [] }] },
}
describe("public war history", () => {
  it("hydrates actual canonical Go producer JSON with SQL-owned war type", () => {
    expect(producerWar).not.toHaveProperty("type")
    const stored = Schema.decodeUnknownSync(StoredArchivedWar)(producerWar)
    const hydrated = hydrateArchivedWar(stored, "cwl")
    expect(hydrated.type).toBe("cwl")
    expect(hydrated.clan.members[0]?.attacks).toEqual([])
    expect(Schema.decodeUnknownSync(WarResponse)(officialArchiveWar(hydrated, "#AAA")).tag).toBe("#WAR")
  })
  it("orients CWL output, supplies both start timestamps, and chooses the best defense", () => {
    const result = Schema.decodeUnknownSync(WarResponse)(officialArchiveWar(war, "#B"))
    expect(result.clan.tag).toBe("#B")
    expect(result.state).toBe("warEnded")
    expect(result.warStartTime).toBe(result.startTime)
    expect(result.attacksPerMember).toBeUndefined()
    expect(result.clan.members[0]).toMatchObject({ opponentAttacks: 2, bestOpponentAttack: { attackerTag: "#A2" } })
  })
  it("keeps missed attacks and distinguishes fresh attacks across all participants", () => {
    const result = playerWarHistoryItem("#B1", "1", war)
    Schema.decodeUnknownSync(PlayerWarStatsResponse)({ items: [result] })
    expect(result?.attacks).toEqual([])
    expect(result?.defenses.map((attack) => attack.fresh)).toEqual([true, false])
    expect(playerWarHistoryItem("#MISSING", "1", war)).toBeUndefined()
    expect(playerWarHistoryItem("#B2", "1", war)?.attacks).toEqual([])
  })
  it("rejects invalid filtering before SQL", async () => {
    for (const query of ["type=league", "limit=0", "limit=1.5", "time[after]=bad", "time[after]=2026-02-31", "time[after]=2026-09-02&time[before]=2026-08-01"]) {
      await expect(Effect.runPromise(historyOptions(new URLSearchParams(query), 15))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    }
    await expect(Effect.runPromise(parsePreviousWarTime("20260231T000000.000Z"))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
})
