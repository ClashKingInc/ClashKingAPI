import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { autoboardCapabilities, nextAutoboardRun, validateAutoboardWrite } from "./dashboard-server-autoboards.js"

const base = { boardType: "sample-family-overview", targetScope: "family", targets: [], deliveryMode: "send", channelId: "1234567890123456789", enabled: true, intervalMinutes: null, schedule: { kind: "daily", timeOfDay: "12:30", weekdays: null, dayOfMonth: null } }
describe("autoboard registry and scheduling", () => {
  it("uses the explicit canonical sample capability registry in sorted order", () => {
    expect(autoboardCapabilities).toHaveLength(5)
    expect(autoboardCapabilities.map((item) => item.boardType)).toEqual(autoboardCapabilities.map((item) => item.boardType).sort())
  })
  it("accepts nullable weekdays and schedules daily delivery strictly in the future", async () => {
    const write = await Effect.runPromise(validateAutoboardWrite(base, new Date("2026-09-03T12:30:00Z")))
    expect(write.schedule?.weekdays).toEqual([])
    expect(write.nextRunAt?.toISOString()).toBe("2026-09-04T12:30:00.000Z")
    expect(write.channelId).toBe("1234567890123456789")
  })
  it("skips months without the requested day", () => {
    expect(nextAutoboardRun(new Date("2026-04-01T00:00:00Z"), { kind: "day_of_month", timeOfDay: "09:15", dayOfMonth: 31 }).toISOString()).toBe("2026-05-31T09:15:00.000Z")
  })
  it("treats Sunday as ISO weekday7", () => {
    expect(nextAutoboardRun(new Date("2026-09-03T00:00:00Z"), { kind: "weekdays", timeOfDay: "09:15", weekdays: [7] }).toISOString()).toBe("2026-09-06T09:15:00.000Z")
  })
  it("rejects schedule, scope and target combinations unsupported by the board", async () => {
    await expect(Effect.runPromise(validateAutoboardWrite({ ...base, targetScope: "custom" }))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(Effect.runPromise(validateAutoboardWrite({ ...base, targets: ["#P0Y"] }))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(Effect.runPromise(validateAutoboardWrite({ ...base, schedule: { kind: "weekdays", timeOfDay: "12:30", weekdays: [1, 1] } }))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
  it("deduplicates trimmed custom targets, clears disabled next runs, and requires integer intervals", async () => {
    const refresh = { ...base, boardType: "sample-clan-activity", targetScope: "custom", targets: [" #P0Y ", "#P0Y"], deliveryMode: "refresh", intervalMinutes: 15, schedule: null, enabled: false }
    expect(await Effect.runPromise(validateAutoboardWrite(refresh))).toMatchObject({ targets: ["#P0Y"], nextRunAt: null })
    await expect(Effect.runPromise(validateAutoboardWrite({ ...refresh, intervalMinutes: 15.5 }))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })
})
