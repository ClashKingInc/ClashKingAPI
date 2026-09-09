import { DashboardCreateRosterAutomationResponse, DashboardUpdateRosterAutomationResponse } from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { AuthIdentity } from "../../src/auth.js"
import { databaseLayer } from "../../src/database.js"
import { DashboardRosterOperations, dispatchDashboardRoster } from "../../src/dashboard-roster-runtime.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { Forbidden } from "../../src/errors.js"
import { ServerAuthorization } from "../../src/server-authorization.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use the schema-owned disposable Timescale harness")
const serverId = "6934567890123456789", otherServerId = "8934567890123456789"
const bindings = { HYPERDRIVE: { connectionString: databaseUrl } } as unknown as WorkerBindings
const db = databaseLayer(bindings)
const access = { principal: { kind: "bot" as const }, manager: true, sections: {} }
const discord = Layer.succeed(DiscordApi, { request: () => Effect.die("Unexpected Discord request"), token: () => Effect.die("Unexpected OAuth request") })
const layer = Layer.mergeAll(db, DashboardRosterOperations.layer.pipe(Layer.provide(Layer.merge(db, discord))),
  Layer.succeed(ServerAuthorization, { require: (_request, id) => id === serverId ? Effect.succeed(access) : Effect.fail(new Forbidden({ message: "Other server is unauthorized" })), resolve: () => Effect.succeed(access) }),
  Layer.succeed(AuthIdentity, { requireUserOrBot: () => Effect.succeed(access.principal), requireBot: () => Effect.succeed(access.principal), requireUser: () => Effect.die("Unexpected user auth") }),
)
const run = (path: string, method: string, body: unknown) => Effect.gen(function* () {
  const response = yield* dispatchDashboardRoster(new Request(`https://api.clashk.ing/v2${path}?server_id=${serverId}`, {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), bindings)
  if (response === undefined || !response.ok) return yield* Effect.die(new Error(`${method} ${path} returned ${response?.status}`))
  return yield* Effect.promise(() => response.json() as Promise<unknown>)
})

describe("roster automation target ownership against Goose migrations", () => {
  it("rejects foreign roster/group targets on create and update without changing saved rules", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Allowed server'), (${otherServerId}, 'Other server')`
      yield* sql`INSERT INTO roster_groups (server_id, group_id, name) VALUES
        (${serverId}, 'OwnedGroup01', 'Owned group'), (${otherServerId}, 'OtherGroup01', 'Other group')`
      const owned = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_type, signup_scope)
        VALUES (${serverId}, 'Owned roster', 'clan', 'clan-only') RETURNING id::text`)[0]!.id
      const foreign = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, roster_type, signup_scope)
        VALUES (${otherServerId}, 'Other roster', 'clan', 'clan-only') RETURNING id::text`)[0]!.id
      const base = { action_type: "ping", scheduled_at: "2026-12-01T00:00:00Z" }
      for (const target of [{ roster_id: foreign }, { group_id: "OtherGroup01" }]) {
        const error = yield* run("/roster-automation", "POST", { ...base, ...target }).pipe(Effect.flip)
        expect(error).toMatchObject({ _tag: "NotFound" })
      }
      for (const target of [{ roster_id: "not-a-uuid" }, { group_id: " " }]) {
        expect(yield* run("/roster-automation", "POST", { ...base, ...target }).pipe(Effect.flip)).toMatchObject({ _tag: "InvalidRequest" })
      }
      expect(yield* sql`SELECT automation_id FROM roster_automation_rules WHERE server_id = ${serverId}`).toEqual([])
      const created = Schema.decodeUnknownSync(DashboardCreateRosterAutomationResponse)(yield* run("/roster-automation", "POST", { ...base, roster_id: owned, group_id: "OwnedGroup01" }))
      expect(created.rule).toMatchObject({ server_id: serverId, roster_id: owned, group_id: "OwnedGroup01" })
      const path = `/roster-automation/${created.automation_id}`
      for (const target of [{ roster_id: foreign }, { group_id: "OtherGroup01" }]) {
        const error = yield* run(path, "PATCH", { ...target, active: false }).pipe(Effect.flip)
        expect(error).toMatchObject({ _tag: "NotFound" })
        expect(yield* sql`SELECT roster_id::text, group_id, enabled FROM roster_automation_rules WHERE automation_id = ${created.automation_id}`)
          .toEqual([{ roster_id: owned, group_id: "OwnedGroup01", enabled: true }])
      }
      const updated = Schema.decodeUnknownSync(DashboardUpdateRosterAutomationResponse)(yield* run(path, "PATCH", { roster_id: owned, group_id: "OwnedGroup01", active: false }))
      expect(updated.rule).toMatchObject({ roster_id: owned, group_id: "OwnedGroup01", active: false })
      const cleared = Schema.decodeUnknownSync(DashboardUpdateRosterAutomationResponse)(yield* run(path, "PATCH", { roster_id: null, group_id: null }))
      expect(cleared.rule.roster_id).toBeUndefined()
      expect(cleared.rule.group_id).toBeUndefined()
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
