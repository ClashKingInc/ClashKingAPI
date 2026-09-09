import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { AppUpdateChannelInput } from "./admin.js"

const decode = Schema.decodeUnknownSync(AppUpdateChannelInput)
const input = { expectedUpdatedAt: null, activeVersion: null, rollbackTargetVersion: null, rolloutBasisPoints: 10_000, paused: false, schedule: null }
const schedule = { fromBasisPoints: 0, toBasisPoints: 10_000, startsAt: "2026-09-04T12:00Z", endsAt: "2026-09-05T12:00:01.123+05:30" }

describe("saved Admin release input parity", () => {
  it("trims normal and beta versions, keeps nullable controls, and accepts offset datetimes", () => {
    expect(decode({ ...input, activeVersion: " 1.2.3-beta ", rollbackTargetVersion: " 1.2.0-beta ", schedule })).toEqual({
      ...input, activeVersion: "1.2.3-beta", rollbackTargetVersion: "1.2.0-beta", schedule,
    })
    expect(decode(input)).toEqual(input)
  })
  it.each(["", "01.2.3", "1.2", "1.2.3-rc.1", "1.2.3+build", "v1.2.3", `${"1".repeat(77)}.2.3`])("rejects invalid version %s", (version) => {
    expect(() => decode({ ...input, activeVersion: version })).toThrow()
    expect(() => decode({ ...input, rollbackTargetVersion: version })).toThrow()
  })
  it.each(["2026-02-29T12:00Z", "2026-09-31T12:00Z", "2026-09-04T24:00Z", "2026-09-04T12:00", "2026-09-04T12:00+2500", "2026-09-04T12:00+25:00", "2026-09-04T12:00:60Z"])("rejects invalid schedule datetime %s", (startsAt) => {
    expect(() => decode({ ...input, schedule: { ...schedule, startsAt } })).toThrow()
  })
  it("accepts leap days and strips nested extras but rejects top-level extras", () => {
    expect(decode({ ...input, schedule: { ...schedule, startsAt: "2028-02-29T12:00Z", extra: true } }).schedule).toEqual({ ...schedule, startsAt: "2028-02-29T12:00Z" })
    expect(() => decode({ ...input, extra: true })).toThrow()
  })
  it.each([-1, 10_001, 0.5])("rejects invalid rollout basis points %s", (rolloutBasisPoints) => {
    expect(() => decode({ ...input, rolloutBasisPoints })).toThrow()
    expect(() => decode({ ...input, schedule: { ...schedule, toBasisPoints: rolloutBasisPoints } })).toThrow()
  })
})
