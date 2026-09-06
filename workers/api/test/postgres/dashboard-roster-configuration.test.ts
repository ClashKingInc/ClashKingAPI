import { PgClient } from "@effect/sql-pg"
import { DashboardCreateRosterMemberGroupEndpoint, DashboardRosterMemberGroupsEndpoint, DashboardReplaceRosterMemberGroupsEndpoint } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Layer, Redacted, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { beforeAll, expect, it } from "vitest"
import { dispatchDashboardRosterConfiguration } from "../../src/dashboard-roster-configuration.js"
import { ServerAuthorization } from "../../src/server-authorization.js"
import { DiscordApi } from "../../src/discord-api.js"
import { Forbidden } from "../../src/errors.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const db = PgClient.layer({ url: Redacted.make(databaseUrl) })
const serverId = "6834567890123456793"
const access = Layer.succeed(ServerAuthorization, { require: (_request, id, requirement) => {
  expect(id).toBe(serverId)
  expect(requirement.section).toBe("rosters")
  return Effect.succeed({ principal: { kind: "bot" as const }, manager: true, sections: {} })
}, resolve: () => Effect.die("Unexpected authorization resolution") })
const discord = Layer.succeed(DiscordApi, { request: () => Effect.succeed([]), token: () => Effect.die("Unexpected OAuth") })
const layer = Layer.mergeAll(db, access, discord)
beforeAll(() => Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Roster configuration')`
}).pipe(Effect.provide(db), Effect.scoped)))

const request = (method: string, suffix = "", body?: unknown) => new Request(`https://api.clashk.ing/v2/server/${serverId}/roster-member-groups${suffix}`, {
  method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
})

it("creates trimmed canonical account groups and lists them in display order", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const created = yield* dispatchDashboardRosterConfiguration(request("POST", "", { name: "  CWL  ", position: 4 }))
    expect(created?.status).toBe(201)
    const result = yield* Effect.promise(() => created!.json())
    const { group } = yield* Schema.decodeUnknownEffect(DashboardCreateRosterMemberGroupEndpoint.response)(result)
    expect(group).toMatchObject({ name: "CWL", position: 4 })
    const listed = yield* dispatchDashboardRosterConfiguration(request("GET"))
    const body = yield* Effect.promise(() => listed!.json())
    expect(yield* Schema.decodeUnknownEffect(DashboardRosterMemberGroupsEndpoint.response)(body)).toEqual({ items: [group] })
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("renames and deletes an unassigned group without changing its identity", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const created = yield* dispatchDashboardRosterConfiguration(request("POST", "", { name: "Raid", position: 2 }))
    const { group } = yield* Schema.decodeUnknownEffect(DashboardCreateRosterMemberGroupEndpoint.response)(yield* Effect.promise(() => created!.json()))
    const updated = yield* dispatchDashboardRosterConfiguration(request("PATCH", `/${group.id}`, { name: "  Raid team  ", position: 1 }))
    expect(updated?.status).toBe(200)
    expect(yield* Effect.promise(() => updated!.json())).toEqual({ group: { id: group.id, name: "Raid team", position: 1 } })
    const removed = yield* dispatchDashboardRosterConfiguration(request("DELETE", `/${group.id}`))
    expect(removed?.status).toBe(204)
    const listed = yield* dispatchDashboardRosterConfiguration(request("GET"))
    const result = yield* Schema.decodeUnknownEffect(DashboardRosterMemberGroupsEndpoint.response)(yield* Effect.promise(() => listed!.json()))
    expect(result.items.some((item) => item.id === group.id)).toBe(false)
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("disables omitted signup groups without deleting existing member assignments", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const created = yield* dispatchDashboardRosterConfiguration(request("POST", "", { name: "Assigned" }))
    const { group } = yield* Schema.decodeUnknownEffect(DashboardCreateRosterMemberGroupEndpoint.response)(yield* Effect.promise(() => created!.json()))
    const roster = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias) VALUES (${serverId}, 'Assigned roster') RETURNING id::text`)[0]!.id
    const replace = (groups: unknown[]) => dispatchDashboardRosterConfiguration(new Request(`https://api.clashk.ing/v2/server/${serverId}/rosters/${roster}/member-groups`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ groups }),
    }))
    const assigned = yield* replace([{ member_group_id: group.id, signup_enabled: true, position: 0, role_id: null }])
    expect(assigned?.status).toBe(200)
    expect(yield* Schema.decodeUnknownEffect(DashboardReplaceRosterMemberGroupsEndpoint.response)(yield* Effect.promise(() => assigned!.json())))
      .toEqual({ groups: [{ id: group.id, name: group.name, signup_enabled: true, position: 0, role_id: null }] })
    yield* sql`INSERT INTO roster_members (roster_id, tag, name, member_group_id) VALUES (${roster}::uuid, '#8PP', 'Assigned player', ${group.id}::uuid)`
    const disabled = yield* replace([])
    expect(yield* Effect.promise(() => disabled!.json())).toEqual({ groups: [{ id: group.id, name: group.name, signup_enabled: false, position: 0, role_id: null }] })
    expect(yield* dispatchDashboardRosterConfiguration(request("DELETE", `/${group.id}`)).pipe(Effect.flip)).toMatchObject({ _tag: "Conflict" })
    expect(yield* sql`SELECT member_group_id::text AS id FROM roster_members WHERE roster_id = ${roster}::uuid`).toEqual([{ id: group.id }])
    yield* sql`DELETE FROM roster_members WHERE roster_id = ${roster}::uuid`
    const cleared = yield* replace([])
    expect(yield* Effect.promise(() => cleared!.json())).toEqual({ groups: [] })
    expect((yield* dispatchDashboardRosterConfiguration(request("DELETE", `/${group.id}`)))?.status).toBe(204)
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("rejects foreign guild groups, foreign rosters, unavailable roles and denied management", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const otherServer = "6834567890123456794"
    yield* sql`INSERT INTO servers (id, name) VALUES (${otherServer}, 'Foreign server')`
    const foreignGroup = (yield* sql<{ id: string }>`INSERT INTO roster_member_groups (server_id, name) VALUES (${otherServer}, 'Foreign group') RETURNING id::text`)[0]!.id
    const foreignRoster = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias) VALUES (${otherServer}, 'Foreign roster') RETURNING id::text`)[0]!.id
    const roster = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias) VALUES (${serverId}, 'Scoped roster') RETURNING id::text`)[0]!.id
    const replace = (id: string, groups: unknown[]) => dispatchDashboardRosterConfiguration(new Request(`https://api.clashk.ing/v2/server/${serverId}/rosters/${id}/member-groups`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ groups }),
    }))
    expect(yield* replace(roster, [{ member_group_id: foreignGroup, signup_enabled: true, position: 0, role_id: null }]).pipe(Effect.flip))
      .toMatchObject({ _tag: "InvalidRequest" })
    expect(yield* replace(foreignRoster, []).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
    expect(yield* replace(roster, [{ member_group_id: foreignGroup, signup_enabled: true, position: 0, role_id: serverId }]).pipe(Effect.flip))
      .toMatchObject({ _tag: "InvalidRequest" })
    const denied = { require: () => Effect.fail(new Forbidden({ message: "Management denied" })), resolve: () => Effect.die("Unexpected resolution") }
    expect(yield* dispatchDashboardRosterConfiguration(request("POST", "", { name: "Denied" })).pipe(
      Effect.provideService(ServerAuthorization, denied), Effect.flip,
    )).toMatchObject({ _tag: "Forbidden" })
    expect(yield* sql`SELECT member_group_id FROM roster_member_group_settings WHERE roster_id = ${roster}::uuid`).toEqual([])
  }).pipe(Effect.provide(layer), Effect.scoped))
})

it("serializes concurrent creation at the 25 server-group boundary", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const listed = yield* dispatchDashboardRosterConfiguration(request("GET"))
    const current = yield* Schema.decodeUnknownEffect(DashboardRosterMemberGroupsEndpoint.response)(yield* Effect.promise(() => listed!.json()))
    for (let index = current.items.length; index < 24; index++) {
      yield* dispatchDashboardRosterConfiguration(request("POST", "", { name: `Boundary ${index}` }))
    }
    const add = (name: string) => dispatchDashboardRosterConfiguration(request("POST", "", { name })).pipe(
      Effect.map((response) => response?.status), Effect.catchTag("Conflict", () => Effect.succeed("conflict")),
    )
    expect((yield* Effect.all([add("Boundary A"), add("Boundary B")], { concurrency: 2 })).sort()).toEqual([201, "conflict"])
    const after = yield* dispatchDashboardRosterConfiguration(request("GET"))
    const result = yield* Schema.decodeUnknownEffect(DashboardRosterMemberGroupsEndpoint.response)(yield* Effect.promise(() => after!.json()))
    expect(result.items).toHaveLength(25)
  }).pipe(Effect.provide(layer), Effect.scoped))
})
