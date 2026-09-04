import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { checkMobileAchievements } from "../../src/mobile-achievements.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Run through clashking_schemas/scripts/with-test-timescale.sh")
const userId = "4534567890123456789", otherUserId = "5534567890123456789"
const bindings = { HYPERDRIVE: { connectionString: databaseUrl } } as unknown as WorkerBindings

describe("mobile achievements against authoritative Goose migrations", () => {
  it("pages links with identical ordering fields without losing timestamp precision", async () => {
    const pagedUserId = "6534567890123456789"
    const tags = Array.from({ length: 129 }, (_, index) => `#ACH${index}`)
    const fetched: string[] = []
    const live = { ...bindings, CLASH_PROXY: { fetch: async (request: Request) => {
      const tag = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1) ?? "")
      fetched.push(tag)
      return Response.json({ tag, townHallLevel: 17, warStars: 0 })
    } } } as unknown as WorkerBindings
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${pagedUserId}, 'discord')`
      yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified, added_at)
        SELECT tag, ${pagedUserId}, 'discord', true, '2026-09-03T00:00:00.123456Z'::timestamptz FROM unnest(${tags}::text[]) tag`
      yield* checkMobileAchievements(pagedUserId, live)
    }).pipe(Effect.provide(databaseLayer(bindings)), Effect.scoped))
    expect(fetched).toHaveLength(129)
    expect(new Set(fetched)).toEqual(new Set(tags))
  })

  it("awards verified players once and rechecks ownership after the live lookup", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${userId}, 'discord'), (${otherUserId}, 'discord')`
      yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified) VALUES
        ('#PP0Y', ${userId}, 'discord', true), ('#PP0L', ${userId}, 'discord', true), ('#PP0G', ${userId}, 'discord', false)`
      const fetched: string[] = []
      const live = { ...bindings, CLASH_PROXY: { fetch: async (request: Request) => {
        const tag = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1) ?? "")
        fetched.push(tag)
        return Response.json({ tag, townHallLevel: tag === "#PP0Y" ? 18 : 17, warStars: tag === "#PP0Y" ? 5000 : 0 })
      } } } as unknown as WorkerBindings
      const first = yield* checkMobileAchievements(userId, live)
      const second = yield* checkMobileAchievements(userId, live)
      expect(first).toEqual(second)
      expect(first.items.map((item) => item.earned_count)).toEqual([1, 1, 0, 0])
      expect(fetched).not.toContain("#PP0G")
      expect(yield* sql`SELECT achievement_id, occurrence_key FROM achievement_player_awards WHERE player_tag = '#PP0Y' ORDER BY achievement_id`)
        .toEqual([{ achievement_id: "townhall_18", occurrence_key: "lifetime" }, { achievement_id: "war_warrior", occurrence_key: "lifetime" }])
      const transferred = { ...bindings, CLASH_PROXY: { fetch: async (request: Request) => {
        const tag = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1) ?? "")
        if (tag === "#PP0L") await Effect.runPromise(sql`UPDATE player_links SET user_id = ${otherUserId} WHERE tag = '#PP0L'`)
        return Response.json({ tag, townHallLevel: 18, warStars: 5000 })
      } } } as unknown as WorkerBindings
      yield* checkMobileAchievements(userId, transferred)
      expect(yield* sql`SELECT achievement_id FROM achievement_player_awards WHERE player_tag = '#PP0L'`).toEqual([])
      yield* sql`UPDATE player_links SET is_verified = false WHERE tag = '#PP0Y'`
      expect((yield* checkMobileAchievements(userId, live)).items.map((item) => item.earned_count)).toEqual([0, 0, 0, 0])
    }).pipe(Effect.provide(databaseLayer(bindings)), Effect.scoped))
  })
})
