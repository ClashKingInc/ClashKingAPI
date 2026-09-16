import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { normalizeArmyLink, parseArmyLinkQuery } from "./army-link.js"

describe("army link normalization", () => {
  it("matches the canonical code vector after reordering a link", async () => {
    const normalized = normalizeArmyLink("https://link.clashofclans.com/en?action=CopyArmy&army=u2x1-10x0s4x35d1x70i3x53h1p9e39-0p4e14_8")
    expect(normalized).toBe("h0p4e8_14-1p9e39i3x53d1x70u10x0-2x1s4x35")

  })
  it("combines quantities and retains zero-based IDs and hero assignments", () => {
    expect(normalizeArmyLink("u1x0-2x0u3x1h0p0e8_1")).toBe("h0p0e1_8u3x0-3x1")
    expect(normalizeArmyLink("h0p4e8_14-1p9e39")).not.toBe(normalizeArmyLink("h0p9e8_14-1p4e39"))
  })
  it.each(["", "ab".repeat(32), "u1x", "u0x1", "u65536x1", "u1x1garbage", "h0e", "https://evil.example/?action=CopyArmy&army=u1x1", "https://link.clashofclans.com/?action=CopyArmy&army=u1x1&army=u2x1"])("rejects invalid input %s", (input) => {
    expect(() => normalizeArmyLink(input)).toThrow()
  })
  it("requires one link and preserves time filters for their existing validation", async () => {
    const result = await Effect.runPromise(parseArmyLinkQuery(new URLSearchParams({ armyLink: "u1x1", "time[after]": "2026-09-08" })))
    expect(result.shareCode).toBe("u1x1")
    expect([...result.timeQuery]).toEqual([["time[after]", "2026-09-08"]])
    await expect(Effect.runPromise(parseArmyLinkQuery(new URLSearchParams()))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(Effect.runPromise(parseArmyLinkQuery(new URLSearchParams("armyLink=u1x1&armyLink=u2x1")))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
})
