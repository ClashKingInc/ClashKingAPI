import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { parseArmySearchQuery, parseLeagueHitRateQuery, parsePlayerHistoryWindow } from "./league-analytics-query.js"

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect)

describe("league analytics query parsing", () => {
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
