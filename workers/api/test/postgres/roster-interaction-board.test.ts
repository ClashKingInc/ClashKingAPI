import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"
import { prepareRosterBoardSnapshot } from "../../src/roster-interaction-board-store.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== '1') throw new Error('Use schema-owned disposable Timescale')
const db = PgClient.layer({ url: Redacted.make(databaseUrl) })

it('renders canonical stored roster data and retained groups under the parent snapshot lock', async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, serverId = '6834567890123464101'
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Board snapshot')`
    const rosterId = (yield* sql<{ id: string }>`INSERT INTO rosters
      (server_id, alias, description, display_column_ids, sort_configuration, revision)
      VALUES (${serverId}, 'Stored Board', 'Use both attacks', ARRAY['name', 'hero_lvs'],
        '[{"columnId":"name","direction":"asc"}]'::jsonb, 7) RETURNING id::text`)[0]!.id
    const groupId = (yield* sql<{ id: string }>`INSERT INTO roster_member_groups (server_id, name)
      VALUES (${serverId}, 'Retained Team') RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_member_group_settings (roster_id, server_id, member_group_id, signup_enabled)
      VALUES (${rosterId}::uuid, ${serverId}, ${groupId}::uuid, false)`
    yield* sql`INSERT INTO roster_members (roster_id, tag, name, hero_level_sum, member_group_id)
      VALUES (${rosterId}::uuid, '#9B41', 'Zulu', 123, NULL),
        (${rosterId}::uuid, '#9B42', 'Alpha', 456, NULL),
        (${rosterId}::uuid, '#9B43', 'Grouped', 789, ${groupId}::uuid)`
    const snapshot = yield* prepareRosterBoardSnapshot(serverId, rosterId, 'signup', Date.now())
    expect(snapshot.revision).toBe('7')
    const text = snapshot.message.embeds.map(embed => embed.description).join('\n')
    expect(text).toContain('Retained Team')
    expect(text).toContain('Grouped | 789')
    expect(text.indexOf('Alpha')).toBeLessThan(text.indexOf('Zulu'))
    expect(snapshot.message.embeds[0]!.title).toBe('Stored Board')
    expect(snapshot.message.embeds.at(-1)!.footer!.text).toContain('Showing 3 of 3 members')
    const wrongGuild = yield* Effect.result(prepareRosterBoardSnapshot('6834567890123464102', rosterId, 'signup', Date.now()))
    expect(wrongGuild._tag).toBe('Failure')
    // The snapshot helper has released its transaction before the caller can
    // send a Discord request; a separate connection can lock the same parent.
    yield* Effect.promise(() => Effect.runPromise(Effect.gen(function* () {
      const other = yield* SqlClient.SqlClient
      yield* other.withTransaction(other`SELECT id FROM rosters WHERE id = ${rosterId}::uuid FOR UPDATE NOWAIT`)
    }).pipe(Effect.provide(db), Effect.scoped)))
  }).pipe(Effect.provide(db), Effect.scoped))
})
