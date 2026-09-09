import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { strFromU8, unzipSync } from "fflate"
import { expect, it, vi } from "vitest"

import producerWar from "../fixtures/war-producer.json"
import { databaseLayer } from "../../src/database.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { dispatchWarExports } from "../../src/war-exports.js"

// Exercise real pending SQL JSON. Packed dictionary decoding has separate workerd coverage.
vi.mock("../../src/war-archive-decoder.js", () => ({ decodeArchiveFrame: () => { throw new Error("Unexpected R2 frame") } }))
const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use schema-owned disposable Timescale")
const bindings = { HYPERDRIVE: { connectionString: url } } as WorkerBindings
const xml = (response: Response | undefined) => Effect.promise(async () => {
  expect(response?.status).toBe(200)
  const parts = unzipSync(new Uint8Array(await response!.arrayBuffer()))
  return strFromU8(parts["xl/worksheets/sheet1.xml"]!)
})

it("exports actual migrated pending archive rows with CWL type/orientation and inclusive player time/limit filtering", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const clanTag = "#PYY90099", playerTag = "#PYY90098"
    const ids: number[] = []
    for (const [index, type, name] of [[2, "random", "Older"], [3, "cwl", "CWL player"], [4, "random", "Newest"]] as const) {
      const end = new Date(`2026-08-0${index}T12:00:00Z`)
      const prep = new Date(end.getTime() - 48 * 3_600_000)
      const start = new Date(end.getTime() - 24 * 3_600_000)
      const id = (yield* sql<{ war_id: number }>`INSERT INTO wars
        (clan_tag,opponent_tag,prep_time,start_time,end_time,size,war_type,state)
        VALUES ('#QYY90099',${clanTag},${prep},${start},${end},15,${type},'ended') RETURNING war_id`)[0]!.war_id
      ids.push(id)
      const payload = { ...producerWar, preparationStartTime: prep.toISOString(), startTime: start.toISOString(), endTime: end.toISOString(),
        clan: { ...producerWar.opponent, tag: "#QYY90099" },
        opponent: { ...producerWar.clan, tag: clanTag, members: [{ ...producerWar.clan.members[0]!, tag: playerTag, name,
          attacks: [{ defenderTag: "#QYY", stars: 3, destructionPercentage: 100, duration: 120, order: 1 }] }] },
      }
      yield* sql`INSERT INTO war_archive_pending (war_id,end_time,payload) VALUES (${id},${end},${JSON.stringify(payload)}::jsonb)`
    }
    yield* sql`INSERT INTO player_war_history (player_tag,war_ids) VALUES (${playerTag},${ids}::integer[])`
    const cwl = yield* xml(yield* dispatchWarExports(new Request(`https://api.test/v2/exports/war/cwl-summary?tag=${encodeURIComponent(clanTag)}`)))
    expect(cwl).toContain("CWL player")
    expect(cwl).not.toContain("Newest")
    expect(cwl).not.toContain("Older")
    const playerRequest = (body: unknown) => new Request("https://api.test/v2/exports/war/player-stats", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    })
    const newest = yield* xml(yield* dispatchWarExports(playerRequest({ player_tag: playerTag, limit: 2 })))
    expect(newest).toContain("Newest")
    expect(newest).toContain("CWL player")
    expect(newest).not.toContain("Older")
    const bounded = yield* xml(yield* dispatchWarExports(playerRequest({ player_tag: playerTag,
      timestamp_start: Date.parse("2026-08-03T12:00:00Z") / 1000, timestamp_end: Date.parse("2026-08-03T12:00:00Z") / 1000 })))
    expect(bounded).toContain("CWL player")
    expect(bounded).not.toContain("Newest")
    expect(bounded).not.toContain("Older")
  }).pipe(Effect.provideService(WorkerEnvironment, bindings), Effect.provide(databaseLayer(bindings)), Effect.scoped))
})
