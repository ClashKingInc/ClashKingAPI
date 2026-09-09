import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { beforeAll, expect, it } from "vitest"
import { DashboardRosterOperations } from "../../src/dashboard-roster-runtime.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { assertRosterCapacity, lockRosterAdmissionOwners, lockRosterMembership } from "../../src/roster-interaction-membership.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const db = PgClient.layer({ url: Redacted.make(databaseUrl) })
const discord = Layer.succeed(DiscordApi, { request: () => Effect.die("Unexpected Discord request"), token: () => Effect.die("Unexpected OAuth") })
const layer = Layer.merge(db, DashboardRosterOperations.layer.pipe(Layer.provide(Layer.merge(db, discord))))
const bindings = { CLASH_PROXY: { fetch: async () => new Response(null, { status: 404 }) } } as unknown as WorkerBindings
const serverId = "6834567890123456791"
beforeAll(() => Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Membership locks')`
}).pipe(Effect.provide(db), Effect.scoped)))

it("holds linked rows until admission commits", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES ('#8P2', '7834567890123456804', 'bot')`
  }).pipe(Effect.provide(db), Effect.scoped))
  const ready = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const admission = Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql.withTransaction(Effect.gen(function* () {
      expect([...(yield* lockRosterAdmissionOwners(sql, ['#8P2'])).values()]).toEqual(['7834567890123456804'])
      ready.resolve()
      yield* Effect.promise(() => release.promise)
    }))
  }).pipe(Effect.provide(db), Effect.scoped))
  void admission.catch(ready.reject)
  try {
    await ready.promise
    const outcome = await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql.withTransaction(
        sql`SELECT tag FROM player_links WHERE tag = '#8P2' FOR UPDATE NOWAIT`).pipe(
          Effect.map(() => 'unlocked'), Effect.catchTag('SqlError', (error) => {
            expect(error).toMatchObject({ reason: { cause: { code: '55P03' } } })
            return Effect.succeed('locked')
          }))
    }).pipe(Effect.provide(db), Effect.scoped))
    expect(outcome).toBe('locked')
  } finally {
    release.resolve()
    await admission
  }
})

it("rolls back a Dashboard add when the canonical capacity is full, including substitutes", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const operations = yield* DashboardRosterOperations
    const id = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, capacity)
      VALUES (${serverId}, 'Capacity one', 1) RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_members (roster_id, tag, name, is_substitute) VALUES (${id}::uuid, '#2PP', 'Substitute', true)`
    const url = new URL(`https://api.clashk.ing/v2/roster/${id}/members?server_id=${serverId}`)
    const result = yield* operations.execute("manageMembers", { bindings, params: { rosterId: id }, url,
      request: new Request(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ members: [{ tag: "#2PQ", name: "Additional player" }] }) }) }).pipe(
      Effect.map(() => "accepted"), Effect.catch((error) => Effect.succeed(error._tag)),
    )
    expect(result).toBe("Conflict")
    expect(yield* sql`SELECT tag FROM roster_members WHERE roster_id = ${id}::uuid`).toEqual([{ tag: "#2PP" }])
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("serializes a Dashboard add against the persistent writer protocol and allows removal", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const operations = yield* DashboardRosterOperations
    const id = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, capacity)
      VALUES (${serverId}, 'Concurrent capacity', 1) RETURNING id::text`)[0]!.id
    const url = new URL(`https://api.clashk.ing/v2/roster/${id}/members?server_id=${serverId}`)
    const dashboard = operations.execute("manageMembers", { bindings, params: { rosterId: id }, url,
      request: new Request(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ members: [{ tag: "#2PR", name: "Dashboard" }] }) }) })
    // The persistent operation's transaction uses this same protocol. This is
    // deliberately not presented as end-to-end signed signup coverage.
    const persistent = sql.withTransaction(Effect.gen(function* () {
      yield* lockRosterMembership(sql, serverId, [id])
      yield* sql`INSERT INTO roster_members (roster_id, tag, name) VALUES (${id}::uuid, '#2PY', 'Persistent')`
      yield* assertRosterCapacity(sql, [id])
    }))
    const outcome = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
      Effect.map(() => "accepted"), Effect.catch((error) => Effect.succeed(error._tag)),
    )
    const results = yield* Effect.all([outcome(dashboard), outcome(persistent)], { concurrency: 2 })
    expect(results.sort()).toEqual(["Conflict", "accepted"])
    const members = yield* sql<{ tag: string }>`SELECT tag FROM roster_members WHERE roster_id = ${id}::uuid`
    expect(members).toHaveLength(1)
    const removeUrl = new URL(`https://api.clashk.ing/v2/roster/${id}/members/${encodeURIComponent(members[0]!.tag)}?server_id=${serverId}`)
    yield* operations.execute("removeMember", { bindings, params: { rosterId: id, memberTag: members[0]!.tag }, url: removeUrl,
      request: new Request(removeUrl, { method: "DELETE" }) })
    expect(yield* sql`SELECT tag FROM roster_members WHERE roster_id = ${id}::uuid`).toEqual([])
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("rejects oversized initial membership without leaving a partial roster", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const operations = yield* DashboardRosterOperations
    const url = new URL(`https://api.clashk.ing/v2/roster?server_id=${serverId}`)
    const result = yield* operations.execute("createRoster", { bindings, params: {}, url,
      request: new Request(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ alias: "Oversized", members: Array.from({ length: 51 }, (_, index) => ({ tag: `#P${index}`, name: "Member" })) }) }) }).pipe(
      Effect.map(() => "accepted"), Effect.catch((error) => Effect.succeed(error._tag)),
    )
    expect(result).toBe("Conflict")
    const response = yield* operations.execute("listRosters", { bindings, params: { serverId }, url, request: new Request(url) })
    const body = yield* Effect.promise(() => response.json() as Promise<{ rosters: Array<{ alias: string }> }>)
    expect(body.rosters.some((roster) => roster.alias === "Oversized")).toBe(false)
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("enforces the configured per-user limit using authoritative links, not submitted Discord identity", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const operations = yield* DashboardRosterOperations
    const id = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, max_accounts_per_user)
      VALUES (${serverId}, 'One account per user', 1) RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES ('#2PV', '7834567890123456791', 'bot'), ('#2PU', '7834567890123456791', 'bot')`
    yield* sql`INSERT INTO roster_members (roster_id, tag, name) VALUES (${id}::uuid, '#2PV', 'First')`
    const url = new URL(`https://api.clashk.ing/v2/roster/${id}/members?server_id=${serverId}`)
    const add = () => operations.execute("manageMembers", { bindings, params: { rosterId: id }, url,
      request: new Request(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ members: [{ tag: "#2PU", name: "Second", discord: "7834567890123456792" }] }) }) })
    expect(yield* add().pipe(Effect.map(() => "accepted"), Effect.catch((error) => Effect.succeed(error._tag)))).toBe("Conflict")
    yield* sql`UPDATE rosters SET max_accounts_per_user = NULL WHERE id = ${id}::uuid`
    expect((yield* add()).ok).toBe(true)
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("rejects a move into a full roster without removing the source membership", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const operations = yield* DashboardRosterOperations
    const ids = yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, capacity)
      VALUES (${serverId}, 'Move source', 1), (${serverId}, 'Move target', 1) RETURNING id::text`
    const source = ids[0]!.id, target = ids[1]!.id
    yield* sql`INSERT INTO roster_members (roster_id, tag, name) VALUES (${source}::uuid, '#2PW', 'Source'), (${target}::uuid, '#2PX', 'Existing')`
    const url = new URL('https://api.clashk.ing/v2/roster/membership-changes')
    const response = yield* operations.execute("applyMembershipChanges", { bindings, params: {}, url,
      request: new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverId,
        changes: [{ action: "move", playerTag: "#2PW", fromRosterId: source, toRosterId: target }], expectedRevisions: { [source]: 1, [target]: 1 } }) }) })
    expect(response.status).toBe(409)
    expect(yield* sql`SELECT roster_id::text AS id FROM roster_members WHERE tag = '#2PW'`).toEqual([{ id: source }])
    expect(yield* sql`SELECT revision::integer FROM rosters WHERE id = ANY(${[source, target]}::uuid[])`).toEqual([{ revision: 1 }, { revision: 1 }])
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("allows an unrelated owner admission despite a transfer-induced per-user overage", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const operations = yield* DashboardRosterOperations
    const id = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, max_accounts_per_user)
      VALUES (${serverId}, 'Transfer overage admission', 1) RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES
      ('#8PP', '7834567890123456801', 'bot'), ('#8PQ', '7834567890123456801', 'bot'),
      ('#8PR', '7834567890123456802', 'bot'), ('#8PY', '7834567890123456801', 'bot')`
    yield* sql`INSERT INTO roster_members (roster_id, tag, name) VALUES
      (${id}::uuid, '#8PP', 'Preserved first'), (${id}::uuid, '#8PQ', 'Preserved transferred')`
    const url = new URL(`https://api.clashk.ing/v2/roster/${id}/members?server_id=${serverId}`)
    const add = (tag: string) => operations.execute("manageMembers", { bindings, params: { rosterId: id }, url,
      request: new Request(url, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ members: [{ tag, name: "Admission" }] }) }) }).pipe(
      Effect.map(() => "accepted"), Effect.catch((error) => Effect.succeed(error._tag)))
    expect(yield* add('#8PR')).toBe('accepted')
    expect(yield* add('#8PY')).toBe('Conflict')
    // Updating a preserved member is not a new admission for its overfull owner.
    expect(yield* add('#8PP')).toBe('accepted')
    expect((yield* sql<{ tag: string }>`SELECT tag FROM roster_members WHERE roster_id = ${id}::uuid ORDER BY tag`).map((row) => row.tag))
      .toEqual(['#8PP', '#8PQ', '#8PR'])
    const source = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias)
      VALUES (${serverId}, 'Unrelated move source') RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES ('#8PV', '7834567890123456803', 'bot')`
    yield* sql`INSERT INTO roster_members (roster_id, tag, name) VALUES (${source}::uuid, '#8PV', 'Move admission')`
    const targetRevision = (yield* sql<{ revision: number }>`SELECT revision::integer FROM rosters WHERE id = ${id}::uuid`)[0]!.revision
    const moveUrl = new URL('https://api.clashk.ing/v2/roster/membership-changes')
    const moved = yield* operations.execute('applyMembershipChanges', { bindings, params: {}, url: moveUrl,
      request: new Request(moveUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverId,
        changes: [{ action: 'move', playerTag: '#8PV', fromRosterId: source, toRosterId: id }],
        expectedRevisions: { [source]: 1, [id]: targetRevision } }) }) })
    expect(moved.status).toBe(200)
    expect(yield* sql`SELECT roster_id::text AS id FROM roster_members WHERE tag = '#8PV'`).toEqual([{ id }])
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("preserves capacity on cloning and rejects a configuration change below existing membership", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const operations = yield* DashboardRosterOperations
    const run = (operation: string, path: string, body: unknown, rosterId?: string) => {
      const url = new URL(`https://api.clashk.ing/v2${path}?server_id=${serverId}`)
      return operations.execute(operation, { bindings, params: rosterId === undefined ? {} : { rosterId }, url,
        request: new Request(url, { method: operation === "updateRoster" ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) })
    }
    const created = yield* run("createRoster", "/roster", { alias: "Clone limits", capacity: 2, max_accounts_per_user: null,
      members: [{ tag: "#9PP", name: "First" }, { tag: "#9PQ", name: "Second" }] })
    const source = yield* Effect.promise(() => created.json() as Promise<{ roster_id: string; roster: { capacity: number } }>)
    expect(source.roster.capacity).toBe(2)
    const cloned = yield* run("cloneRoster", `/roster/${source.roster_id}/clone`, { copy_members: true }, source.roster_id)
    const clone = yield* Effect.promise(() => cloned.json() as Promise<{ roster: { capacity: number; members: unknown[] } }>)
    expect(clone.roster.capacity).toBe(2)
    expect(clone.roster.members).toHaveLength(2)
    const rejected = yield* run("updateRoster", `/roster/${source.roster_id}`, { capacity: 1 }, source.roster_id).pipe(
      Effect.map(() => "accepted"), Effect.catch((error) => Effect.succeed(error._tag)),
    )
    expect(rejected).toBe("Conflict")
    for (const limit of [0, -1, 1.5]) {
      expect(yield* run("updateRoster", `/roster/${source.roster_id}`, { max_accounts_per_user: limit }, source.roster_id).pipe(
        Effect.map(() => "accepted"), Effect.catch((error) => Effect.succeed(error._tag)),
      )).toBe("InvalidRequest")
    }
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it('preserves same-server member groups, role settings, and substitutes when cloning', async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, operations = yield* DashboardRosterOperations
    const source = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_role_id)
      VALUES (${serverId}, 'Clone grouped source', '8834567890123456831') RETURNING id::text`)[0]!.id
    const group = (yield* sql<{ id: string }>`INSERT INTO roster_member_groups (server_id, name)
      VALUES (${serverId}, 'Clone members') RETURNING id::text`)[0]!.id
    yield* sql`INSERT INTO roster_member_group_settings (roster_id, member_group_id, server_id, signup_enabled, position, role_id)
      VALUES (${source}::uuid, ${group}::uuid, ${serverId}, false, 3, '8834567890123456832')`
    yield* sql`INSERT INTO roster_members (roster_id, tag, name, member_group_id, is_substitute)
      VALUES (${source}::uuid, '#8QJ', 'Grouped substitute', ${group}::uuid, true)`
    const url = new URL(`https://api.clashk.ing/v2/roster/${source}/clone?server_id=${serverId}`)
    const response = yield* operations.execute('cloneRoster', { bindings, params: { rosterId: source }, url,
      request: new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ copy_members: true }) }) })
    expect(response.status).toBe(201)
    expect(yield* Effect.promise(() => response.json())).toMatchObject({ roster: {
      roster_role_id: '8834567890123456831',
      member_groups: [{ id: group, name: 'Clone members', signup_enabled: false, position: 3, role_id: '8834567890123456832' }],
      members: [expect.objectContaining({ tag: '#8QJ', member_group_id: group, is_substitute: true })],
    } })
    const targetServer = '6834567890123456832'
    yield* sql`INSERT INTO servers (id, name) VALUES (${targetServer}, 'Clone destination')`
    const foreignUrl = new URL(`https://api.clashk.ing/v2/roster/${source}/clone?server_id=${targetServer}`)
    const foreign = yield* operations.execute('cloneRoster', { bindings, params: { rosterId: source }, url: foreignUrl,
      request: new Request(foreignUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ copy_members: true }) }) })
    expect(foreign.status).toBe(201)
    expect(yield* Effect.promise(() => foreign.json())).toMatchObject({ roster: {
      server_id: targetServer, roster_role_id: null, member_groups: [],
      members: [expect.objectContaining({ tag: '#8QJ', member_group_id: null, is_substitute: true })],
    } })
  }).pipe(Effect.provide(layer), Effect.scoped))
})
