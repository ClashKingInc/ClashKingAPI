import { CwlSummaryExportEndpoint, PlayerWarStatsExportEndpoint } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it } from "vitest"

import producerWar from "../test/fixtures/war-producer.json"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { createWarWorkbookStream, MAX_EXPORT_ROWS, MAX_EXPORT_WARS, safeExportFilename, XLSX_MIME } from "./war-export-workbook.js"
import { dispatchWarExports, warExportRuntimeRoutes } from "./war-exports.js"

const makeWar = (endTime: string, name: string, stars = 3) => ({ ...producerWar, endTime,
  clan: { ...producerWar.clan, members: [{ ...producerWar.clan.members[0]!, name,
    attacks: [{ defenderTag: "#QYY", stars, destructionPercentage: stars === 3 ? 100 : 75, duration: 120, order: 1 }] }] },
})
type FixtureWar = Omit<ReturnType<typeof makeWar>, "opponent"> & { opponent: ReturnType<typeof makeWar>["clan"] }
const harness = (wars: FixtureWar[] = [makeWar("2026-08-03T12:00:00Z", "Player")], clanName = "Clan A") => {
  const queries: Array<{ query: string; parameters: unknown[] }> = []
  interface Fragment { readonly query: string; readonly parameters: unknown[] }
  const sql = ((parts: TemplateStringsArray, ...values: unknown[]) => {
    let query = parts[0] ?? ""
    const parameters: unknown[] = []
    values.forEach((value, index) => {
      const fragment = typeof value === "object" && value !== null && "fixtureFragment" in value
        ? (value as { fixtureFragment: Fragment }).fixtureFragment : undefined
      query += fragment?.query ?? "?"
      parameters.push(...(fragment?.parameters ?? [value]))
      query += parts[index + 1] ?? ""
    })
    // SQL fragments are constructed eagerly but execute only when yielded.
    return Object.assign(Effect.suspend((): Effect.Effect<readonly object[]> => {
      queries.push({ query, parameters })
      if (query.includes("max(end_time)")) return Effect.succeed([{ latest: wars.at(-1)?.endTime ?? null, clan_name: clanName }])
      if (query.includes("SELECT DISTINCT")) return Effect.succeed(wars.map((_, index) => ({ war_id: index + 1 })))
      if (query.includes("SELECT war_id::text")) return Effect.succeed(wars.map((_, index) => ({ war_id: String(index + 1) })))
      if (query.includes("war_archive_pending")) {
        const id = String(parameters[0])
        return Effect.succeed([{ war_id: id, war_type: "cwl", payload: wars[Number(id) - 1],
          archive_pack_id: null, archive_offset: null, archive_compressed_bytes: null }])
      }
      throw new Error(`Unexpected query ${query}`)
    }), { fixtureFragment: { query, parameters } })
  }) as unknown as SqlClient.SqlClient
  const run = (path: string, body?: unknown) => Effect.runPromise(dispatchWarExports(new Request(`https://api.clashk.ing${path}`, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  })).pipe(Effect.provideService(SqlClient.SqlClient, sql), Effect.provideService(WorkerEnvironment, {} as WorkerBindings)))
  return { run, queries }
}
const unpack = async (response: Response | undefined) => {
  expect(response?.status).toBe(200)
  expect(response?.headers.get("content-type")).toBe(XLSX_MIME)
  const bytes = new Uint8Array(await response!.arrayBuffer())
  expect(Array.from(bytes.subarray(0, 2))).toEqual([80, 75])
  const files = unzipSync(bytes)
  expect(Object.keys(files).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"].sort())
  return { xml: strFromU8(files["xl/worksheets/sheet1.xml"]!), workbook: strFromU8(files["xl/workbook.xml"]!) }
}

describe("war export binary routes", () => {
  it("uses the two existing public shared descriptors without an auth dependency", () => {
    expect(warExportRuntimeRoutes).toEqual([CwlSummaryExportEndpoint, PlayerWarStatsExportEndpoint].map(({ method, path }) => ({ method, path })))
    expect(CwlSummaryExportEndpoint.auth).toBe("public")
    expect(PlayerWarStatsExportEndpoint.auth).toBe("public")
    expect(PlayerWarStatsExportEndpoint.responseMode).toBe("response")
  })
  it("keeps only newest requested hits with exact Go time filters and filename", async () => {
    const test = harness([makeWar("2026-08-03T12:00:00Z", "Older"), makeWar("2026-08-04T12:00:00Z", "Newest")])
    const response = await test.run("/v2/exports/war/player-stats", { player_tag: " pyy ", timestamp_start: 10.9, timestamp_end: 100.9, limit: 1 })
    expect(response?.headers.get("content-disposition")).toBe('attachment; filename="war_stats_PYY.xlsx"')
    const { xml, workbook } = await unpack(response)
    expect(workbook).toContain('name="War Stats"')
    expect(xml).toContain("Newest")
    expect(xml).not.toContain("Older")
    expect(xml).toContain("100.0%")
    expect(xml).toContain('<mergeCell ref="A1:J1"/>')
    const scan = test.queries.find(({ query }) => query.includes("SELECT DISTINCT"))!
    expect(scan.parameters).toEqual([["#PYY"], 0, new Date(10_000), new Date(100_000)])
    expect(scan.query).toContain("w.end_time >=")
    expect(scan.query).toContain("w.end_time <=")
  })
  it("uses epoch/default upper time bound and exports every hit when limit is nonpositive", async () => {
    const test = harness([makeWar("2026-08-03T12:00:00Z", "Player", 2)])
    const { xml } = await unpack(await test.run("/v2/exports/war/player-stats", { player_tag: "#PYY", limit: 0 }))
    expect(xml).toContain("75.0%")
    expect(test.queries[0]?.parameters).toEqual([["#PYY"], 0, new Date(0), new Date(9_999_999_999_000)])
  })
  it("aggregates only the requested CWL side within latest month and preserves workbook layout", async () => {
    const original = makeWar("2026-08-03T12:00:00Z", '=HYPERLINK("bad") <&>', 2)
    const reversed = { ...original, clan: { ...original.opponent }, opponent: { ...original.clan } }
    const test = harness([reversed], 'Clan "A"\r\nInjected')
    const response = await test.run("/v2/exports/war/cwl-summary?tag=%23AAA")
    expect(response?.headers.get("content-disposition")).toBe('attachment; filename="cwl_Clan__A___Injected_2026-08.xlsx"')
    const { xml, workbook } = await unpack(response)
    expect(workbook).toContain('name="CWL Summary"')
    expect(xml).toContain("=HYPERLINK(&quot;bad&quot;) &lt;&amp;&gt;")
    expect(xml).not.toContain("<f>")
    expect(xml).toContain('<c r="D15" s="0"><v>1</v></c>')
    expect(xml).toContain('<c r="E15" s="0"><v>2</v></c>')
    expect(xml).toContain("2.75")
    expect(xml).toContain('<mergeCell ref="A1:I1"/>')
    const month = test.queries.find(({ query }) => query.includes("SELECT war_id::text"))!
    expect(month.query).toContain("war_type='cwl' ORDER BY end_time DESC LIMIT 100")
    expect(month.parameters).toContainEqual(new Date("2026-08-01T00:00:00Z"))
    expect(month.parameters).toContainEqual(new Date("2026-09-01T00:00:00Z"))
  })
  it("rejects absent data and invalid inputs instead of returning an empty workbook", async () => {
    await expect(harness([]).run("/v2/exports/war/cwl-summary?tag=%23AAA")).rejects.toMatchObject({ _tag: "NotFound" })
    await expect(harness([]).run("/v2/exports/war/player-stats", { player_tag: "#PYY" })).rejects.toMatchObject({ _tag: "NotFound" })
    for (const body of [{ player_tags: ["#PYY"] }, { player_tag: "" }, { player_tag: "#PYY", limit: MAX_EXPORT_ROWS + 1 },
      { player_tag: "#PYY", timestamp_start: 20, timestamp_end: 10 }]) {
      const test = harness()
      await expect(test.run("/v2/exports/war/player-stats", body)).rejects.toMatchObject({ _tag: "InvalidRequest" })
      expect(test.queries).toHaveLength(0)
    }
  })
  it("rejects unlimited exports over the explicit row ceiling without silently truncating", async () => {
    const war = makeWar("2026-08-03T12:00:00Z", "Player")
    war.clan.members[0]!.attacks = Array.from({ length: MAX_EXPORT_ROWS + 1 }, (_, index) => ({
      defenderTag: "#QYY", stars: 3, destructionPercentage: 100, duration: 120, order: index + 1,
    }))
    await expect(harness([war]).run("/v2/exports/war/player-stats", { player_tag: "#PYY" }))
      .rejects.toMatchObject({ _tag: "InvalidRequest", message: expect.stringContaining("20000") })
  })
  it("preflights cell and byte limits and permits cancelling a partially read ZIP", async () => {
    expect(() => createWarWorkbookStream({ name: "War Stats", rows: [["x".repeat(32_768)]], titleColumns: 10, boldRows: [] })).toThrow("oversized")
    expect(() => createWarWorkbookStream({ name: "War Stats", rows: Array.from({ length: 300 }, () => ["x".repeat(30_000)]), titleColumns: 10, boldRows: [] })).toThrow("workbook size")
    const stream = createWarWorkbookStream({ name: "War Stats", rows: [["Title"], ["body"]], titleColumns: 10, boldRows: [] })
    const reader = stream.getReader()
    expect((await reader.read()).done).toBe(false)
    await reader.cancel()
    expect(safeExportFilename('bad"\r\nname.xlsx')).toBe("bad___name.xlsx")
  })
  it("rejects excessive archive work explicitly even when the requested output limit is small", async () => {
    const wars = Array.from({ length: MAX_EXPORT_WARS + 1 }, () => makeWar("2026-08-03T12:00:00Z", "Player"))
    await expect(harness(wars).run("/v2/exports/war/player-stats", { player_tag: "#PYY", limit: 1 }))
      .rejects.toMatchObject({ _tag: "InvalidRequest", message: "Export exceeds 1000 wars; provide a narrower time range" })
  })
})
