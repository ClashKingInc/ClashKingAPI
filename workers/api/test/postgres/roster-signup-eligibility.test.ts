import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { beforeAll, expect, it } from "vitest"
import { AuthIdentity } from "../../src/auth.js"
import { DashboardRosterOperations, dispatchDashboardRoster } from "../../src/dashboard-roster-runtime.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { ServerAuthorization } from "../../src/server-authorization.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Disposable Goose Timescale required")
const db = PgClient.layer({ url: Redacted.make(databaseUrl) })
const serverId = "6834567890123456891", userId = "7834567890123456891", clanTag = "#9PQ", playerTag = "#9PQC"
const principal = { kind: "user" as const, userId }
const player = { tag: playerTag, name: "Eligibility fixture", townHallLevel: 17, trophies: 5000,
  clan: { tag: clanTag, name: "Fixture clan" }, troops: [], spells: [], heroes: [] }
const bindings = { ASSETS: { get: async () => ({ json: async () => ({ items: [] }) }) },
  CLASH_PROXY: { fetch: async () => Response.json(player) } } as unknown as WorkerBindings
const discord = Layer.succeed(DiscordApi, {
  request: () => Effect.succeed({ user: { id: userId, username: "Applicant", avatar: null } }),
  token: () => Effect.die("Unexpected OAuth"),
})
const layer = Layer.mergeAll(db,
  DashboardRosterOperations.layer.pipe(Layer.provide(Layer.merge(db, discord))),
  Layer.succeed(AuthIdentity, { requireUser: () => Effect.succeed(principal), requireUserOrBot: () => Effect.succeed(principal),
    requireBot: () => Effect.die("An ordinary user must not become a bot") }),
  Layer.succeed(ServerAuthorization, { require: () => Effect.die("Fixture has no staff privileges"),
    resolve: () => Effect.die("Fixture has no staff privileges") }),
)
beforeAll(() => Effect.runPromise(Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Signup eligibility')`
  yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${userId}, 'discord')`
  yield* sql`INSERT INTO basic_clan (tag, name, public_war_log, war_wins, member_count, badge_token, troops_donated, troops_received)
    VALUES (${clanTag}, 'Fixture clan', true, 1, 1, 'fixture', 0, 0)`
  yield* sql`INSERT INTO server_clans (tag, server_id) VALUES (${clanTag}, ${serverId})`
  yield* sql`INSERT INTO basic_player (tag, name, townhall_level, trophies, clan_tag)
    VALUES (${playerTag}, 'Eligibility fixture', 17, 5000, ${clanTag})`
  // The allowed control proves ordinary signup does not require verification.
  yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified) VALUES (${playerTag}, ${userId}, 'bot', false)`
}).pipe(Effect.provide(db), Effect.scoped)))

it.each([
  { name: "below minimum", min: 18, max: 18, allowed: false },
  { name: "above maximum", min: 16, max: 16, allowed: false },
  { name: "eligible unverified account", min: 16, max: 18, allowed: true },
])("enforces canonical Town Hall limits for a direct user signup: $name", async ({ name, min, max, allowed }) => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const id = (yield* sql<{ id: string }>`INSERT INTO rosters (server_id, alias, clan_tag, min_townhall, max_townhall)
      VALUES (${serverId}, ${name}, ${clanTag}, ${min}, ${max}) RETURNING id::text`)[0]!.id
    const url = `https://api.clashk.ing/v2/server/${serverId}/rosters/${id}/submissions`
    const outcome = yield* dispatchDashboardRoster(new Request(url, { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ playerTag, answers: {} }) }), bindings).pipe(
      Effect.map(response => response?.status === 201 ? "accepted" : `unexpected:${response?.status}`),
      Effect.catch(error => Effect.succeed(error._tag)),
    )
    expect(outcome).toBe(allowed ? "accepted" : "Forbidden")
    const members = yield* sql`SELECT tag FROM roster_members WHERE roster_id = ${id}::uuid`
    expect(members).toEqual(allowed ? [{ tag: playerTag }] : [])
    expect(yield* sql`SELECT revision::integer FROM rosters WHERE id = ${id}::uuid`).toEqual([{ revision: allowed ? 2 : 1 }])
  }).pipe(Effect.provide(layer), Effect.scoped))
})
