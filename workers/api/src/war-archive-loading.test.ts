import { readFileSync } from "node:fs"
import { zstdCompressSync } from "node:zlib"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it, vi } from "vitest"
import { loadArchiveWars } from "./war-archive.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"

const clan = { tag: "#ABC", name: "Clan", badgeToken: "", clanLevel: 1, attacks: 0, stars: 0, destructionPercentage: 0, members: [] }
const stored = { state: "warEnded", teamSize: 5, attacksPerMember: 2, preparationStartTime: "2026-01-01T00:00:00Z", startTime: "2026-01-02T00:00:00Z", endTime: "2026-01-03T00:00:00Z", battleModifier: "", clan, opponent: { ...clan, tag: "#DEF" } }
const dictionary = readFileSync("internal/wararchive/war-json.zdict")
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
  return { get, query, peak: () => peak, run: () => Effect.runPromise(loadArchiveWars(Array.from({ length: count }, (_, index) => String(index + 1))).pipe(
    Effect.provideService(SqlClient.SqlClient, sql), Effect.provideService(WorkerEnvironment, { WAR_ARCHIVE: { get } } as unknown as WorkerBindings),
  )) }
}
it("loads 50 archive locators in one SQL query and uses bounded parallel R2 reads", async () => {
  const test = fixture(50)
  expect((await test.run()).size).toBe(50)
  expect(test.query).toHaveBeenCalledOnce()
  expect(test.get).toHaveBeenCalledTimes(50)
  expect(test.peak()).toBe(2)
})
it("still rejects a page whose decoded total exceeds the memory limit", async () => {
  const test = fixture(2, "x".repeat(5 * 1024 * 1024))
  await expect(test.run()).rejects.toMatchObject({ _tag: "InvalidRequest" })
})
