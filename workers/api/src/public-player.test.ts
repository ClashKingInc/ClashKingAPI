import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
vi.mock("./war-archive-decoder.js", () => ({ decodeArchiveFrame: vi.fn() }))
import { parseHistoryTime, playerTimerFromRow } from "./public-player.js"
import { joinLeaveClanTotals, type JoinLeaveRow } from "./public-join-leave.js"

describe("public player helpers", () => {
  it("keeps active CWL/raid timers and excludes unscheduled wars", () => {
    const row = { event_type: "war", event_key: "key", expires_at: "2026-09-03T12:00:00Z", source_clan_tag: "#A", opponent_tag: "#B", war_type: "CWL", war_tag: "war" }
    expect(playerTimerFromRow(row)).toMatchObject({ type: "cwl", clans: ["#A", "#B"], warTag: "#WAR" })
    expect(playerTimerFromRow({ ...row, source_clan_tag: null })).toBeUndefined()
    expect(playerTimerFromRow({ ...row, event_type: "raid", event_key: "#A" })).toMatchObject({ type: "capital", clans: ["#A"] })
  })
  it("rejects rolled-over dates instead of accepting JavaScript normalization", async () => {
    await expect(Effect.runPromise(parseHistoryTime("2026-02-31", new Date()))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    expect(await Effect.runPromise(parseHistoryTime("2026-02-28", new Date()))).toEqual(new Date("2026-02-28"))
  })
  it("counts repeated clan visits and closes an active visit at now", () => {
    const event = (hour: number, clan: string, type: string): JoinLeaveRow => ({ time: new Date(Date.UTC(2026, 8, 1, hour)), type, clan_tag: clan, player_tag: "#P", player_name: "Player", townhall_level: 18, clan_name: clan })
    expect(joinLeaveClanTotals([event(0, "#A", "join"), event(1, "#A", "leave"), event(2, "#B", "join"), event(3, "#A", "join")], new Date("2026-09-01T04:00:00Z"))).toEqual([
      { clan: { name: "#A", tag: "#A" }, visits: 2, minutes: 180 },
      { clan: { name: "#B", tag: "#B" }, visits: 1, minutes: 60 },
    ])
  })
})
