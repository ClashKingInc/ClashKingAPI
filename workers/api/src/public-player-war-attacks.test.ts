import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { queryPlayerWarAttacks } from "./public-player-extra.js"

const clan = (tag: string, attacker: string, defender: string, order: number) => ({
  tag, name: tag, badgeToken: "", clanLevel: 1, attacks: 1, stars: 3, destructionPercentage: 100,
  members: [{ tag: attacker, name: attacker, townhallLevel: 18, mapPosition: 1,
    attacks: [{ defenderTag: defender, stars: 3, destructionPercentage: 100, duration: 100, order }] }],
})
const payload = (endTime: string, order: number, target = "#PYY") => ({
  state: "warEnded", teamSize: 1, attacksPerMember: 1, preparationStartTime: endTime,
  startTime: endTime, endTime, battleModifier: "", clan: clan("#AAA", target, "#DEF", order),
  opponent: clan("#BBB", "#OTHER", target, order + 100),
})
type HistoryRow = { readonly war_id: number; readonly end_time: string }
const fixture = (pages: readonly (readonly HistoryRow[])[], payloads: ReadonlyMap<string, unknown>) => {
  const history = vi.fn((_statement: string, _parameters: readonly unknown[]) =>
    Effect.succeed(pages[history.mock.calls.length - 1] ?? []))
  const locator = vi.fn((ids: readonly string[]) => Effect.succeed(ids.map((id) => ({
    war_id: id, war_type: "cwl", archive_pack_id: null, archive_offset: null,
    archive_compressed_bytes: null, payload: null, pending: true,
  }))))
  const archive = vi.fn((id: string) => Effect.succeed(payloads.has(id) ? [{
    war_id: id, war_type: "cwl", archive_pack_id: null, archive_offset: null,
    archive_compressed_bytes: null, payload: payloads.get(id),
  }] : []))
  const tag = ((strings: TemplateStringsArray, ...parameters: readonly unknown[]) => {
    const statement = strings.join("?")
    if (statement.includes("AS pending FROM wars")) return locator(parameters[0] as readonly string[])
    if (statement.includes("LEFT JOIN war_archive_pending")) return archive(String(parameters[0]))
    return Effect.die(`Unexpected SQL: ${statement}`)
  }) as unknown as SqlClient.SqlClient
  const sql = Object.assign(tag, { unsafe: history }) as unknown as SqlClient.SqlClient
  return { history, locator, archive, run: (query: string) => Effect.runPromise(
    queryPlayerWarAttacks("#PYY", new URLSearchParams(query)).pipe(Effect.provideService(SqlClient.SqlClient, sql))),
  }
}

describe("bounded newest player war attack traversal", () => {
  it("stops archive work after the newest qualifying result", async () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ war_id: 8 - index, end_time: `2026-08-${String(8 - index).padStart(2, "0")}T00:00:00Z` }))
    const archives = new Map(rows.map((row) => [String(row.war_id), payload(row.end_time, row.war_id)]))
    const test = fixture([rows], archives)
    const result = await test.run("limit=1")
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ war_id: "8", attackOrder: 108, side: "defense" })
    expect(test.history).toHaveBeenCalledOnce()
    expect(test.locator).toHaveBeenCalledOnce()
    expect(test.archive).toHaveBeenCalledTimes(4)
  })

  it("reads every war tied at the cutoff and preserves attack-order tie breaking", async () => {
    const end = "2026-08-08T00:00:00Z"
    const test = fixture([[{ war_id: 9, end_time: end }, { war_id: 8, end_time: end },
      { war_id: 7, end_time: "2026-08-07T00:00:00Z" }]], new Map([
      ["9", payload(end, 1)], ["8", payload(end, 50)], ["7", payload("2026-08-07T00:00:00Z", 99)],
    ]))
    const result = await test.run("limit=1")
    expect(result.items[0]).toMatchObject({ war_id: "8", attackOrder: 150 })
    expect(test.archive).toHaveBeenCalledTimes(3)
  })

  it("continues beyond one page and pushes the requested war type into SQL", async () => {
    const first = Array.from({ length: 8 }, (_, index) => ({ war_id: 20 - index, end_time: `2026-07-${String(20 - index).padStart(2, "0")}T00:00:00Z` }))
    const second = [{ war_id: 12, end_time: "2026-07-12T00:00:00Z" }]
    const archives = new Map<string, unknown>(first.map((row) => [String(row.war_id), payload(row.end_time, 1, "#NONE")]))
    archives.set("12", payload(second[0]!.end_time, 3))
    const test = fixture([first, second], archives)
    const result = await test.run("limit=1&type=cwl")
    expect(result.items[0]).toMatchObject({ war_id: "12", warType: "cwl" })
    expect(test.history).toHaveBeenCalledTimes(2)
    expect(test.history.mock.calls[0]?.[0]).toContain("w.war_type = ANY")
    expect(test.history.mock.calls[0]?.[1]).toContainEqual(["cwl"])
    expect(test.archive).toHaveBeenCalledTimes(9)
  })
})
