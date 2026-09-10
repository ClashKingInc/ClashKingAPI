import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { parseArmySearchQuery, parseLeagueHitRateQuery, parseLegendAggregateWindow, parsePlayerHistoryWindow } from "./league-analytics-query.js"

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect)

describe("league analytics query parsing", () => {
  it("maps inclusive day labels to half-open shifted days", () => {
    const labels = new URLSearchParams({ "time[after]": "2026-09-08", "time[before]": "2026-09-08" })
    const timestamps = new URLSearchParams({ "time[after]": "2026-09-08T05:10:00Z", "time[before]": "2026-09-09T05:10:00Z" })
    const window = parseLegendAggregateWindow(labels, new Date(), { maximumDays: 30 })
    expect(window).toEqual(parseLegendAggregateWindow(timestamps, new Date(), { maximumDays: 30 }))
    expect(window).toMatchObject({ start: new Date("2026-09-08T05:10:00Z"), end: new Date("2026-09-09T05:10:00Z"), calendarDays: 1 })
  })

  it.each(["04:59:59", "05:00:00", "05:09:59.999", "05:10:00.001"])("rejects partial aggregate windows at %s", (time) => {
    expect(() => parseLegendAggregateWindow(new URLSearchParams({ "time[after]": `2026-09-08T${time}Z`, "time[before]": "2026-09-09T05:10:00Z" }), new Date(), { maximumDays: 30 })).toThrow()
  })

  it("defaults to the latest completed day across the reset boundary", () => {
    const parse = (time: string) => parseLegendAggregateWindow(new URLSearchParams(), new Date(`2026-09-09T${time}Z`), { defaultDays: 1, maximumDays: 30 })
    expect(parse("05:09:59.999").firstDay).toBe("2026-09-07")
    expect(parse("05:10:00").firstDay).toBe("2026-09-08")
  })
  it("uses inclusive UTC time keys and a 30-day default", async () => {
    const now = new Date("2026-09-08T18:00:00Z")
    await expect(run(parseLeagueHitRateQuery(new URLSearchParams(), now))).resolves.toMatchObject({
      window: { firstDay: "2026-08-10", lastDay: "2026-09-08", calendarDays: 30 },
    })
    await expect(run(parseLeagueHitRateQuery(new URLSearchParams("start=2026-09-01"), now))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })

  it("allows 250 families for one day and only 10 for a multi-day discovery", async () => {
    await expect(run(parseArmySearchQuery(new URLSearchParams("time%5Bafter%5D=2026-09-08&time%5Bbefore%5D=2026-09-08&limit=250"))))
      .resolves.toMatchObject({ limit: 250, window: { calendarDays: 1 } })
    await expect(run(parseArmySearchQuery(new URLSearchParams("time%5Bafter%5D=2026-09-07&time%5Bbefore%5D=2026-09-08&limit=11"))))
      .rejects.toMatchObject({ _tag: "InvalidRequest" })
  })

  it("parses stable smart filters without Town Hall or mode", async () => {
    await expect(run(parseArmySearchQuery(new URLSearchParams(
      "heroIds=28000000,28000001&equipmentIds=90000000&minimumAttacks=100&minimumPlayers=20&minimumTripleRate=.4&sort=averageDestruction&direction=asc",
    )))).resolves.toMatchObject({ heroIds: [28000000, 28000001], equipmentIds: [90000000], minimumAttacks: 100,
      minimumPlayers: 20, minimumTripleRate: 0.4, sort: "averageDestruction", direction: "asc" })
  })

  it.each(["mode=legend", "townHallLevel=18", "limit=11", "minimumTripleRate=1.1", "heroIds=no", "sort=popularity", "cursor=x"])
  ("rejects obsolete or invalid army parameters: %s", async (raw) => {
    await expect(run(parseArmySearchQuery(new URLSearchParams(raw)))).rejects.toMatchObject({ _tag: "InvalidRequest" })
  })

  it("bounds stats at 90 UTC days and player history at one year", async () => {
    await expect(run(parseLeagueHitRateQuery(new URLSearchParams("time%5Bafter%5D=2026-06-11&time%5Bbefore%5D=2026-09-08")))).resolves.toBeDefined()
    await expect(run(parseLeagueHitRateQuery(new URLSearchParams("time%5Bafter%5D=2026-06-10&time%5Bbefore%5D=2026-09-08")))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(run(parsePlayerHistoryWindow(new URLSearchParams("time%5Bafter%5D=2025-09-09&time%5Bbefore%5D=2026-09-08")))).resolves.toBeDefined()
  })
})
