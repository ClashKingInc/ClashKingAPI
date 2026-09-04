import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"

import { dispatchDashboardRosterBonuses } from "../../src/dashboard-roster-bonuses.js"
import { ServerAuthorization, serverAccessAllows } from "../../src/server-authorization.js"
import { Forbidden } from "../../src/errors.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const serverId = "6934567890123456701"
const access = { principal: { kind: "bot" as const }, manager: false, sections: { settings: "manage" as const } }
const layer = Layer.merge(PgClient.layer({ url: Redacted.make(databaseUrl) }), Layer.succeed(ServerAuthorization, {
  resolve: () => Effect.succeed(access),
  require: (_request, id, requirement) => id === serverId && serverAccessAllows(access, requirement)
    ? Effect.succeed(access) : Effect.fail(new Forbidden({ message: "Unauthorized server or section" })),
}))
const replace = (recipients: unknown) => dispatchDashboardRosterBonuses(new Request(
  `https://api.clashk.ing/v2/server/${serverId}/cwl/%23PQY/bonus-recipients?season=2026-09-01`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipients }),
  },
))

it("replaces a saved full-date CWL award plan using the frozen roster", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Bonus fixture')`
    yield* sql`INSERT INTO basic_clan (tag, name, public_war_log, war_wins, member_count, badge_token, troops_donated, troops_received)
      VALUES ('#PQY', 'Bonus clan', true, 0, 0, '', 0, 0)`
    yield* sql`INSERT INTO server_clans (server_id, tag) VALUES (${serverId}, '#PQY')`
    yield* sql`INSERT INTO cwl_groups (cwl_id, season, rounds) VALUES ('BonusGroup01', '2026-09-01', '[]')`
    yield* sql`INSERT INTO cwl_group_clans (cwl_id, clan_tag) VALUES ('BonusGroup01', '#PQY')`
    yield* sql`INSERT INTO cwl_group_members (cwl_id, clan_tag, tag) VALUES ('BonusGroup01', '#PQY', '#PQL'), ('BonusGroup01', '#PQY', '#PQG')`
    yield* sql`INSERT INTO cwl_bonus_recipients (season, clan_tag, player_tag, medal_count) VALUES ('2026-09-01', '#PQY', '#PQG', 20)`
    const response = yield* replace([{ playerTag: 'pql', medalCount: 100 }])
    expect(response?.status).toBe(200)
    expect(yield* Effect.promise(() => response!.json())).toEqual({ items: [{ playerTag: '#PQL', medalCount: 100 }] })
    expect(yield* sql`SELECT season, player_tag, medal_count FROM cwl_bonus_recipients WHERE clan_tag = '#PQY'`)
      .toEqual([{ season: '2026-09-01', player_tag: '#PQL', medal_count: 100 }])
    for (const recipients of [
      [{ playerTag: '#YYY', medalCount: 100 }],
      [{ playerTag: 'pql', medalCount: 100 }, { playerTag: '#PQL', medalCount: 50 }],
      [{ playerTag: '#PQL', medalCount: 0.5 }],
      [{ playerTag: '#PQL', medalCount: -1 }],
      [{ playerTag: '#PQL', medalCount: 32768 }],
    ]) {
      expect(yield* replace(recipients).pipe(Effect.flip)).toMatchObject({ _tag: 'InvalidRequest' })
      expect(yield* sql`SELECT player_tag, medal_count FROM cwl_bonus_recipients WHERE clan_tag = '#PQY'`)
        .toEqual([{ player_tag: '#PQL', medal_count: 100 }])
    }
    const concurrent = yield* Effect.all([
      replace([{ playerTag: '#PQL', medalCount: 50 }]),
      replace([{ playerTag: '#PQG', medalCount: 75 }]),
    ], { concurrency: 2 })
    expect(concurrent.map((item) => item?.status)).toEqual([200, 200])
    const saved = yield* sql<{ player_tag: string; medal_count: number }>`SELECT player_tag, medal_count FROM cwl_bonus_recipients WHERE clan_tag = '#PQY'`
    expect(saved).toHaveLength(1)
    expect([{ player_tag: '#PQL', medal_count: 50 }, { player_tag: '#PQG', medal_count: 75 }]).toContainEqual(saved[0])
    expect((yield* replace([]))?.status).toBe(200)
    expect(yield* sql`SELECT player_tag FROM cwl_bonus_recipients WHERE clan_tag = '#PQY'`).toEqual([])
  }).pipe(Effect.provide(layer), Effect.scoped))
})
