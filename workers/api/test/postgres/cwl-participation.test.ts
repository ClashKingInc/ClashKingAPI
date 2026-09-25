import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"
import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { queryCwlParticipation } from "../../src/cwl-participation.js"

const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const layer = databaseLayer({ HYPERDRIVE: { connectionString: url } } as WorkerBindings)
describe("CWL participation has no archive-summary dependency", () => {
  it("reads roster buckets even when no attack summary exists", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO cwl_participation(season,cwl_league_id,war_size,group_count,clan_count,registered_player_count,
        townhall_counts,same_th_hitrates,finalized_wars,archived_wars)
        VALUES ('2026-09',48000022,15,1,8,300,'[{"level":18,"count":300}]',NULL,28,0),
        ('2026-09',48000019,30,1,8,400,'[{"level":18,"count":400}]','[{"level":18,"attacks":20,"three_stars":15}]',28,2),
        ('2026-08',48000019,15,1,8,280,'[{"level":17,"count":280}]',NULL,28,0)`
      const result = yield* queryCwlParticipation(new URLSearchParams("season=2026-09"))
      expect(result).toMatchObject({ season: "2026-09", clanCount: 16, registeredPlayerCount: 700 })
      expect(result.availableSeasons).toEqual(["2026-09", "2026-08"])
      expect(result.history).toEqual([
        { season: "2026-09", clanCount: 16, registeredPlayerCount: 700, groupCount: 2 },
        { season: "2026-08", clanCount: 8, registeredPlayerCount: 280, groupCount: 1 },
      ])
      expect(result.items[0]?.sameTownHallHitRates).toBeNull()
      expect(result.items[1]?.sameTownHallHitRates?.[0]).toMatchObject({ level: 18, attacks: 20, threeStarRate: .75 })
      expect((yield* queryCwlParticipation(new URLSearchParams())).season).toBe("2026-09")
      expect((yield* queryCwlParticipation(new URLSearchParams("season=2026-08"))).items).toHaveLength(1)
      expect((yield* queryCwlParticipation(new URLSearchParams("season=2026-07"))).items).toEqual([])
    }).pipe(Effect.provide(layer),Effect.scoped))
  })
})
