import { readFileSync } from "node:fs"
import { zstdCompressSync } from "node:zlib"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it, vi } from "vitest"
import { forEachArchiveWar, loadArchiveWars } from "./war-archive.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"

const clan = { tag: "#ABC", name: "Clan", badgeToken: "", clanLevel: 1, attacks: 0, stars: 0, destructionPercentage: 0, members: [] }
const stored = { state: "warEnded", teamSize: 5, attacksPerMember: 2, preparationStartTime: "2026-01-01T00:00:00Z", startTime: "2026-01-02T00:00:00Z", endTime: "2026-01-03T00:00:00Z", battleModifier: "", clan, opponent: { ...clan, tag: "#DEF" } }
const dictionary = readFileSync("workers/api/assets/war-json.zdict")
const fixture = (count: number, padding = "") => {
  const frame = zstdCompressSync(JSON.stringify({ ...stored, padding }), { dictionary })
  let active = 0, peak = 0
  const get = vi.fn(async () => {
    active++; peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active--
    return { body: new ReadableStream(), arrayBuffer: async () => frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) }
  })
  const query = vi.fn(() => Effect.succeed(Array.from({ length: count }, (_, index) => ({
    war_id: String(index + 1), war_type: "random", archive_pack_id: "1", archive_offset: "0",
    archive_compressed_bytes: frame.length, payload: null, pending: false,
  }))))
  const sql = query as unknown as SqlClient.SqlClient
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
    Effect.provideService(SqlClient.SqlClient, sql), Effect.provideService(WorkerEnvironment, { WAR_ARCHIVE: { get } } as unknown as WorkerBindings),
  ) as Effect.Effect<A, E, Exclude<R, SqlClient.SqlClient | WorkerEnvironment>>
  return { get, query, peak: () => peak,
    run: () => Effect.runPromise(provide(loadArchiveWars(Array.from({ length: count }, (_, index) => String(index + 1))))),
    stream: () => {
      const seen: string[] = []
      return Effect.runPromise(provide(forEachArchiveWar(Array.from({ length: count }, (_, index) => String(index + 1)),
        (id) => Effect.sync(() => { seen.push(id) }))).pipe(Effect.as(seen)))
    },
  }
}
it("loads 50 archive locators in one SQL query and uses bounded parallel R2 reads", async () => {
  const test = fixture(50)
  expect((await test.run()).size).toBe(50)
  expect(test.query).toHaveBeenCalledOnce()
  expect(test.get).toHaveBeenCalledTimes(50)
  expect(test.peak()).toBe(4)
})
it("still rejects a page whose decoded total exceeds the memory limit", async () => {
  const test = fixture(2, "x".repeat(5 * 1024 * 1024))
  await expect(test.run()).rejects.toMatchObject({ _tag: "InvalidRequest" })
})
it("streams 50 archives with one locator query and four concurrent reads", async () => {
  const test = fixture(50)
  expect(await test.stream()).toEqual(Array.from({ length: 50 }, (_, index) => String(index + 1)))
  expect(test.query).toHaveBeenCalledOnce()
  expect(test.get).toHaveBeenCalledTimes(50)
  expect(test.peak()).toBe(4)
})

it("keeps the CWL read queue moving when an earlier archive stalls", async () => {
  const frame = zstdCompressSync(JSON.stringify(stored), { dictionary })
  const started: number[] = []
  let releaseFirst!: () => void
  const first = new Promise<void>((resolve) => { releaseFirst = resolve })
  let active = 0, peak = 0
  const get = vi.fn(async (_key: string, options: { range: { offset: number } }) => {
    const id = options.range.offset
    started.push(id)
    active++; peak = Math.max(peak, active)
    if (id === 0) await first
    if (id === 4) releaseFirst()
    active--
    return { body: new ReadableStream(), arrayBuffer: async () => frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) }
  })
  const sql = (() => Effect.succeed(Array.from({ length: 8 }, (_, id) => ({
    war_id: String(id), war_type: "cwl", archive_pack_id: "1", archive_offset: String(id),
    archive_compressed_bytes: frame.length, payload: null, pending: false,
  })))) as unknown as SqlClient.SqlClient
  const seen: string[] = []
  await Effect.runPromise(forEachArchiveWar(Array.from({ length: 8 }, (_, id) => String(id)),
    (id) => Effect.sync(() => { seen.push(id) }), { unordered: true }).pipe(
      Effect.provideService(SqlClient.SqlClient, sql),
      Effect.provideService(WorkerEnvironment, { WAR_ARCHIVE: { get } } as unknown as WorkerBindings),
      Effect.timeout("1 second"),
    )).finally(releaseFirst)
  expect(started).toContain(4)
  expect(seen.indexOf("1")).toBeLessThan(seen.indexOf("0"))
  expect(new Set(seen).size).toBe(8)
  expect(peak).toBeLessThanOrEqual(4)
})

it("keeps pending archives bounded to two SQL reads and supplies their partition time", async () => {
  let active = 0, peak = 0, timePredicates = 0
  const end = stored.endTime
  const query = ((strings: TemplateStringsArray) => {
    const statement = strings.join("?")
    if (statement.includes("AS pending")) return Effect.succeed(Array.from({ length: 6 }, (_, id) => ({
      war_id: String(id + 1), war_type: "random", end_time: end,
      archive_pack_id: null, archive_offset: null, archive_compressed_bytes: null, pending: true,
    })))
    if (statement.includes("AND w.end_time")) { timePredicates++; return Effect.succeed([]) }
    return Effect.promise(async () => {
      active++; peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      return [{ war_type: "random", payload: stored }]
    })
  }) as unknown as SqlClient.SqlClient
  const get = vi.fn()
  const result = await Effect.runPromise(loadArchiveWars(["1", "2", "3", "4", "5", "6"]).pipe(
    Effect.provideService(SqlClient.SqlClient, query),
    Effect.provideService(WorkerEnvironment, { WAR_ARCHIVE: { get } } as unknown as WorkerBindings),
  ))
  expect(result.size).toBe(6)
  expect(peak).toBe(2)
  expect(timePredicates).toBe(6)
  expect(get).not.toHaveBeenCalled()
})
