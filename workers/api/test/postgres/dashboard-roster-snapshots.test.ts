import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it } from "vitest"

import { dispatchDashboardRosterSnapshots } from "../../src/dashboard-roster-snapshots.js"
import { ServerAuthorization } from "../../src/server-authorization.js"
import { Forbidden } from "../../src/errors.js"
import type { WorkerBindings } from "../../src/environment.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const serverId = "6934567890123456702", otherServerId = "6934567890123456703"
const access = { principal: { kind: "bot" as const }, manager: true, sections: {} }
const layer = Layer.merge(PgClient.layer({ url: Redacted.make(databaseUrl) }), Layer.succeed(ServerAuthorization, {
  resolve: () => Effect.succeed(access),
  require: (_request, id) => id === serverId ? Effect.succeed(access) : Effect.fail(new Forbidden({ message: "Unauthorized server" })),
}))
const bindings = { ROSTER_REFRESH_COOLDOWN_MINUTES: "15", ASSETS: { get: async () => ({ json: async () => ({ items: [] }) }) }, CLASH_PROXY: { fetch: async (request: Request) => {
  const tag = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1)!)
  if (tag === "#PQG") return new Response(null, { status: 404 })
  if (tag === "#PQY") return new Response(null, { status: 503 })
  return Response.json({ tag, name: "Fresh player", townHallLevel: 17, trophies: 5200,
    troops: [], spells: [], heroes: [], clan: { tag: '#PQL', name: 'New clan' } })
} } } as unknown as WorkerBindings
const refresh = (rosterId: string, scope: "data" | "role", server = serverId) => dispatchDashboardRosterSnapshots(new Request(
  `https://api.clashk.ing/v2/server/${server}/rosters/${rosterId}/refresh`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope }),
  },
), bindings)

it("prepares role reconciliation only for a roster in the authorized server", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Refresh fixture'), (${otherServerId}, 'Other server')`
    const rows = yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_role_id, roster_type, signup_scope)
      VALUES (${serverId}, 'Role target', '7934567890123456701', 'clan', 'clan-only') RETURNING id::text`
    const rosterId = rows[0]!.id
    yield* sql`INSERT INTO roster_members (roster_id, tag, discord_user_id) VALUES
      (${rosterId}, '#PQL', '7934567890123456702'), (${rosterId}, '#PQG', '7934567890123456702'), (${rosterId}, '#PQY', NULL)`
    const response = yield* refresh(rosterId, "role")
    expect(response?.status).toBe(200)
    expect(yield* Effect.promise(() => response!.json())).toMatchObject({ scope: 'role', status: 'ready',
      roleId: '7934567890123456701', roleMemberUserIds: ['7934567890123456702'], refreshedPlayers: 0, failedPlayers: 0, reused: false })
    expect(yield* refresh(rosterId, "role", otherServerId).pipe(Effect.flip)).toMatchObject({ _tag: 'Forbidden' })
    const foreign = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_type, signup_scope)
      VALUES (${otherServerId}, 'Foreign target', 'clan', 'clan-only') RETURNING id::text`)[0]!.id
    expect(yield* refresh(foreign, "role").pipe(Effect.flip)).toMatchObject({ _tag: 'NotFound' })
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("refreshes snapshots, deletes only authoritative missing players, and reuses the configured cooldown", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Refresh fixture') ON CONFLICT DO NOTHING`
    const rosterId = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_type, signup_scope)
      VALUES (${serverId}, 'Data target', 'clan', 'clan-only') RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_members (roster_id, tag, name, discord_user_id, discord_username) VALUES
      (${rosterId}, '#PQL', 'Old player', '7934567890123456702', 'Stale identity'),
      (${rosterId}, '#PQG', 'Deleted player', NULL, NULL), (${rosterId}, '#PQY', 'Outage player', NULL, NULL)`
    const response = yield* refresh(rosterId, "data")
    expect(response?.status).toBe(200)
    expect(yield* Effect.promise(() => response!.json())).toMatchObject({ scope: 'data', status: 'completed',
      refreshedPlayers: 2, failedPlayers: 1, reused: false })
    expect(yield* sql`SELECT tag, name, discord_user_id, discord_username FROM roster_members WHERE roster_id = ${rosterId} ORDER BY tag`)
      .toEqual([{ tag: '#PQL', name: 'Fresh player', discord_user_id: null, discord_username: null },
        { tag: '#PQY', name: 'Outage player', discord_user_id: null, discord_username: null }])
    const again = yield* refresh(rosterId, "data")
    expect(yield* Effect.promise(() => again!.json())).toMatchObject({ status: 'reused', refreshedPlayers: 0, failedPlayers: 0, reused: true })
    yield* sql`UPDATE rosters SET last_refreshed_at = now() - interval '16 minutes', refresh_started_at = now() WHERE id = ${rosterId}`
    expect(yield* refresh(rosterId, "data").pipe(Effect.flip)).toMatchObject({ _tag: 'Conflict' })
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("keeps a member re-added while an old refresh lookup was in flight", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rosterId = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_type, signup_scope)
      VALUES (${serverId}, 'Concurrent member', 'clan', 'clan-only') RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_members (roster_id, tag, name) VALUES (${rosterId}, '#PQL', 'Original')`
    const racingBindings: WorkerBindings = { ...bindings, CLASH_PROXY: { ...bindings.CLASH_PROXY, fetch: async () => {
      await Effect.runPromise(sql.withTransaction(Effect.gen(function* () {
        yield* sql`DELETE FROM roster_members WHERE roster_id = ${rosterId}`
        yield* sql`INSERT INTO roster_members (roster_id, tag, name) VALUES (${rosterId}, '#PQL', 'New signup')`
      })))
      return new Response(null, { status: 404 })
    } } }
    const response = yield* dispatchDashboardRosterSnapshots(new Request(
      `https://api.clashk.ing/v2/roster/refresh-data?server_id=${serverId}&roster_id=${rosterId}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope: 'data' }),
      }), racingBindings)
    expect(response?.status).toBe(200)
    expect(yield* sql`SELECT name FROM roster_members WHERE roster_id = ${rosterId}`).toEqual([{ name: 'New signup' }])
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("reports reused and waiting batch items without treating either as a failed refresh", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const recent = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_type, signup_scope, last_refreshed_at)
      VALUES (${serverId}, 'Batch recent', 'clan', 'clan-only', now()) RETURNING id::text`)[0]!.id
    const waiting = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_type, signup_scope, refresh_started_at)
      VALUES (${serverId}, 'Batch waiting', 'clan', 'clan-only', now()) RETURNING id::text`)[0]!.id
    const request = (rosterIds: string[]) => dispatchDashboardRosterSnapshots(new Request('https://api.clashk.ing/v2/roster/refresh-batch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverId, rosterIds }),
    }), bindings)
    const response = yield* request([recent, waiting])
    expect(response?.status).toBe(200)
    expect(yield* Effect.promise(() => response!.json())).toMatchObject({ rosters: [
      { rosterId: recent, status: 'reused' }, { rosterId: waiting, status: 'waiting' },
    ] })
    expect(yield* request([recent, recent]).pipe(Effect.flip)).toMatchObject({ _tag: 'InvalidRequest' })
    expect(yield* request([]).pipe(Effect.flip)).toMatchObject({ _tag: 'InvalidRequest' })
  }).pipe(Effect.provide(layer), Effect.scoped))
})
