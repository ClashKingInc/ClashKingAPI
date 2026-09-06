import {
  DashboardCreateRosterResponse, DashboardCreateRosterGroupResponse, DashboardCreateRosterAutomationResponse,
  DashboardCloneRosterResponse, DashboardRosterView, DashboardRosterMembershipValidateEndpoint,
} from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { AuthIdentity } from "../../src/auth.js"
import { databaseLayer } from "../../src/database.js"
import { DashboardRosterOperations, dashboardRosterRuntimeRoutes, dispatchDashboardRoster } from "../../src/dashboard-roster-runtime.js"
import { DiscordApi } from "../../src/discord-api.js"
import type { WorkerBindings } from "../../src/environment.js"
import { ServerAuthorization } from "../../src/server-authorization.js"

// The fixture exercises the real pending-JSON archive reader. Binary frame/WASM
// decoding is independently covered by the archive owner's Worker tests.
vi.mock("../../src/war-archive-decoder.js", () => ({ decodeArchiveFrame: () => { throw new Error("Unexpected R2 frame") } }))

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Run through clashking_schemas/scripts/with-test-timescale.sh")
const serverId = "1534567890123456789", userId = "2534567890123456789", channelId = "3534567890123456789"
const clanTag = "#P0Y", playerTag = "#P0YJ"
const player = { tag: playerTag, name: "Fresh player", townHallLevel: 17, trophies: 5200,
  clan: { tag: clanTag, name: "Fixture clan" }, leagueTier: { id: 29000022, name: "Legend League" },
  troops: [], spells: [], heroes: [{ name: "Barbarian King", level: 95, village: "home" }, { name: "Battle Machine", level: 35, village: "builderBase" }],
}
const bindings = {
  HYPERDRIVE: { connectionString: databaseUrl },
  CLASH_PROXY: { fetch: async (request: Request) => request.url.includes("/clans/")
    ? Response.json({ tag: clanTag, name: "Fixture clan", memberList: [
      { tag: playerTag, name: "Fresh player", townHallLevel: 17, trophies: 5200, role: "member" },
      { tag: "#Q0Y", name: "Missing player", townHallLevel: 16, trophies: 4000, role: "member" },
    ] }) : request.url.includes("GONE") ? new Response(null, { status: 404 }) : Response.json(player) },
} as unknown as WorkerBindings
const db = databaseLayer(bindings)
const discord = Layer.succeed(DiscordApi, { request: () => Effect.succeed({ user: { id: userId, username: "fixture-user", avatar: null } }), token: () => Effect.die("Unexpected OAuth") })
const principal = { kind: "user" as const, userId }
const access = { principal, manager: true, sections: {} }
const layer = Layer.mergeAll(db, DashboardRosterOperations.layer.pipe(Layer.provide(Layer.mergeAll(db, discord))),
  Layer.succeed(ServerAuthorization, { require: () => Effect.succeed(access), resolve: () => Effect.succeed(access) }),
  Layer.succeed(AuthIdentity, { requireUserOrBot: () => Effect.succeed(principal), requireUser: () => Effect.succeed(principal), requireBot: () => Effect.succeed({ kind: "bot" as const }) }),
)

describe("Dashboard roster against authoritative Goose migrations", () => {
  it("executes all 43 registered routes with exact Discord IDs and real SQL/archive recipes", async () => {
    const covered = new Set<string>()
    const run = (path: string, method = "GET", body?: unknown) => Effect.gen(function* () {
      const url = new URL(`https://api.clashk.ing/v2${path}`)
      const parts = url.pathname.split("/")
      const route = dashboardRosterRuntimeRoutes.find((candidate) => candidate.method === method
        && candidate.path.split("/").length === parts.length
        && candidate.path.split("/").every((part, index) => part.startsWith(":") || part === parts[index]))
      const response = yield* dispatchDashboardRoster(new Request(url, {
        method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      }), bindings)
      if (response === undefined || !response.ok) return yield* Effect.die(new Error(`${method} ${path} returned ${response?.status}`))
      if (route !== undefined) covered.add(`${route.method} ${route.path}`)
      return response.status === 204 ? undefined : yield* Effect.promise(() => response.json() as Promise<unknown>)
    })
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Roster fixture server')`
      yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${userId}, 'discord')`
      yield* sql`INSERT INTO basic_clan (tag, name, public_war_log, war_wins, member_count, badge_token, troops_donated, troops_received)
        VALUES (${clanTag}, 'Fixture clan', true, 1, 2, 'fixture', 0, 0)`
      yield* sql`INSERT INTO basic_player (tag, name, townhall_level, trophies, clan_tag) VALUES (${playerTag}, 'Stored player', 17, 5000, ${clanTag})`
      yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES (${playerTag}, ${userId}, 'discord')`
      yield* sql`INSERT INTO server_clans (tag, server_id) VALUES (${clanTag}, ${serverId})`
      const query = `?server_id=${serverId}`
      const group = Schema.decodeUnknownSync(DashboardCreateRosterGroupResponse)(yield* run(`/roster-group${query}`, "POST", { name: "Fixture group" })).group
      const groupPath = `/roster-group/${group.group_id}${query}`
      expect(group.server_id).toBe(serverId)
      yield* run(`/roster-group/list${query}`)
      yield* run(groupPath, "PATCH", { description: "Updated group" })
      const created = Schema.decodeUnknownSync(DashboardCreateRosterResponse)(yield* run(`/roster${query}`, "POST", {
        alias: "Fixture roster", roster_type: "clan", signup_scope: "clan-only", clan_tag: clanTag, group_id: group.group_id,
        members: [{ tag: "#GONE", name: "Retained missing player", townhall: 15, hero_level_sum: 0 }],
      }))
      const rosterId = created.roster_id
      const rosterPath = `/roster/${rosterId}${query}`
      expect(created.roster.server_id).toBe(serverId)
      for (const field of ["capacity", "roster_role_id", "member_groups"]) expect(created.roster).not.toHaveProperty(field)
      for (const field of ["member_group_id", "is_substitute"]) expect(created.roster.members[0]).not.toHaveProperty(field)
      yield* run(rosterPath)
      yield* run(`/roster/${serverId}/list`)
      yield* run(rosterPath, "PATCH", { alias: "Updated roster", webhook_id: channelId, message_id: userId })
      expect(yield* sql`SELECT webhook_id, message_id FROM rosters WHERE id = ${rosterId}::uuid`).toEqual([{ webhook_id: channelId, message_id: userId }])
      yield* run(`/roster/${rosterId}/members${query}`, "POST", { members: [{ tag: playerTag }] })
      const saved = yield* sql<{ hero_level_sum: number; max_percent: string; name: string }>`SELECT hero_level_sum, max_percent::text, name FROM roster_members WHERE roster_id = ${rosterId}::uuid AND tag = ${playerTag}`
      expect(saved[0]?.name).toBe("Fresh player")
      expect(saved[0]?.hero_level_sum).toBe(95)
      expect(Number(saved[0]?.max_percent)).toBeGreaterThan(0)
      yield* run(`/roster/${rosterId}/members/${encodeURIComponent(playerTag)}${query}`, "PATCH", { answers: {} })
      yield* run(`/roster/${rosterId}/members/${encodeURIComponent(playerTag)}/refresh${query}`, "POST")
      yield* run(`/roster/refresh${query}&roster_id=${rosterId}`, "POST")
      expect(yield* sql`SELECT tag FROM roster_members WHERE roster_id = ${rosterId}::uuid AND tag = '#GONE'`).toEqual([{ tag: "#GONE" }])
      yield* run(groupPath)
      yield* run(`/roster/server/${serverId}/members`)
      const missing = yield* run(`/roster/missing-members${query}&roster_id=${rosterId}`)
      expect(missing).toMatchObject({ results: [{ state: "ok", roster_info: { roster_id: rosterId }, missing_members: [{ tag: "#Q0Y" }] }] })
      const canonical = `/server/${serverId}/rosters/${rosterId}`
      yield* run(`/server/${serverId}/rosters`)
      yield* run(canonical)
      yield* run(`${canonical}/missing-members`)
      const question = { id: "ready", label: "Ready?", type: "boolean", required: true, options: [], order: 0 }
      yield* run(`/roster/questionnaire${query}&roster_id=${rosterId}`, "PUT", { questions: [question] })
      yield* run(`${canonical}/signup-form`)
      yield* run(`${canonical}/submissions`, "POST", { playerTag, answers: { ready: true } })
      yield* run(`${canonical}/discord-identity/refresh`, "POST", { playerTag })
      expect(yield* sql`SELECT discord_user_id, discord_username FROM roster_members WHERE roster_id = ${rosterId}::uuid AND tag = ${playerTag}`)
        .toEqual([{ discord_user_id: userId, discord_username: "fixture-user" }])
      yield* run("/roster/members/query", "POST", { serverId, rosterIds: [rosterId], fields: ["playerName", "signupAnswers"] })
      yield* run("/roster/account-groups/query", "POST", { serverId, rosterIds: [rosterId] })
      yield* run(`/roster/metrics${query}`)
      const now = new Date(), end = new Date(now.getTime() - 3_600_000), prep = new Date(now.getTime() - 90_000_000)
      const warId = (yield* sql<{ war_id: number }>`INSERT INTO wars (clan_tag, opponent_tag, prep_time, start_time, end_time, size, war_type, state)
        VALUES (${clanTag}, '#Q0Y', ${prep}, ${prep}, ${end}, 1, 'random', 'ended') RETURNING war_id`)[0]!.war_id
      const archive = { state: "warEnded", teamSize: 1, attacksPerMember: 2, battleModifier: "none", preparationStartTime: prep.toISOString(), startTime: prep.toISOString(), endTime: end.toISOString(),
        clan: { tag: clanTag, name: "Clan", badgeToken: "", clanLevel: 1, attacks: 1, stars: 3, destructionPercentage: 100,
          members: [{ tag: playerTag, name: "Player", townhallLevel: 17, mapPosition: 1, attacks: [{ defenderTag: "#Q0Y", stars: 3, destructionPercentage: 100, duration: 120, order: 1 }] }] },
        opponent: { tag: "#Q0Y", name: "Opponent", badgeToken: "", clanLevel: 1, attacks: 0, stars: 0, destructionPercentage: 0,
          members: [{ tag: "#Q0Y", name: "Defender", townhallLevel: 17, mapPosition: 1, attacks: null }] },
      }
      yield* sql`INSERT INTO war_archive_pending (war_id, end_time, payload) VALUES (${warId}, ${end}, ${JSON.stringify(archive)}::jsonb)`
      yield* sql`INSERT INTO player_war_history (player_tag, war_ids) VALUES (${playerTag}, ${[warId]}::integer[])`
      expect(yield* run(`/roster/metrics/query${query}`, "POST", { rosterIds: [rosterId], metricId: "war.hit_rate", force: false }))
        .toMatchObject({ rows: expect.arrayContaining([{ rosterId, playerTag, value: 100 }]) })
      const packStats = { byDay: { [end.toISOString().slice(0, 10)]: { regularHitRates: { "17:17": { attacks: 1, threeStars: { attacks: 0 } } } } } }
      yield* sql`INSERT INTO war_archive_packs (status, first_end_time, last_end_time, stats) VALUES ('uploaded', ${end}, ${end}, ${JSON.stringify(packStats)}::jsonb)`
      expect(yield* run(`/roster/metrics/query${query}`, "POST", { rosterIds: [rosterId], metricId: "benchmark.th_hit_rate_delta", force: false }))
        .toMatchObject({ rows: expect.arrayContaining([{ rosterId, playerTag, value: 50 }]) })
      const view = Schema.decodeUnknownSync(DashboardRosterView)(yield* run(`/roster/views${query}`, "POST", { name: "Fixture view", sourceCode: "Show strongest players", sourceVersion: 1 }))
      yield* run(`/roster/views${query}`)
      yield* run(`/roster/views/${view.id}${query}`)
      yield* run(`/roster/views/shared/${view.shareId}`)
      yield* run(`/roster/views/${view.id}${query}`, "PATCH", { name: "Updated view", sourceCode: "Show strongest players", sourceVersion: 1 })
      yield* run("/roster/views/preview", "POST", { serverId, rosterIds: [rosterId], name: "Preview", sourceCode: "Show players", sourceVersion: 1,
        columns: [{ id: "name", label: "Name", metricId: "player.name" }], filters: [], sort: [], highlights: [], limit: null })
      const automation = Schema.decodeUnknownSync(DashboardCreateRosterAutomationResponse)(yield* run(`/roster-automation${query}`, "POST", {
        roster_id: rosterId, action_type: "ping", scheduled_at: "2026-12-01T00:00:00Z", discord_channel_id: channelId, options: { ping_type: "signup_reminder" },
      })).rule
      expect(automation.discord_channel_id).toBe(channelId)
      yield* run(`/roster-automation/list${query}`)
      yield* run(`/roster-automation/${automation.automation_id}${query}`, "PATCH", { active: false })
      expect(yield* sql`SELECT enabled, ping_type FROM roster_automation_rules WHERE automation_id = ${automation.automation_id}`)
        .toEqual([{ enabled: false, ping_type: "signup_reminder" }])
      const cloned = Schema.decodeUnknownSync(DashboardCloneRosterResponse)(yield* run(`/roster/${rosterId}/clone${query}`, "POST", { new_alias: "Destination", copy_members: false }))
      const destinationId = cloned.new_roster_id
      expect(yield* sql`SELECT webhook_id, message_id FROM rosters WHERE id = ${destinationId}::uuid`).toEqual([{ webhook_id: null, message_id: null }])
      expect(yield* sql`SELECT webhook_id, message_id FROM rosters WHERE id = ${rosterId}::uuid`).toEqual([{ webhook_id: channelId, message_id: userId }])
      const proposal = Schema.decodeUnknownSync(DashboardRosterMembershipValidateEndpoint.response)(yield* run("/roster/membership-changes/validate", "POST", {
        serverId, rosterIds: [rosterId, destinationId], changes: [{ action: "move", playerTag, fromRosterId: rosterId, toRosterId: destinationId }],
      }))
      yield* run("/roster/membership-changes", "POST", { serverId, changes: proposal.changes, expectedRevisions: proposal.expectedRevisions })
      yield* sql`UPDATE rosters SET public_enabled = true, public_share_id = 'RosterFixtureShare2026' WHERE id = ${destinationId}::uuid`
      const shareId = (yield* sql<{ public_share_id: string }>`SELECT public_share_id FROM rosters WHERE id = ${destinationId}::uuid`)[0]!.public_share_id
      expect(yield* run(`/public/rosters/${shareId}`)).toMatchObject({ members: [{ playerTag, name: "Fresh player" }] })
      yield* run(`/roster/${destinationId}/members/${encodeURIComponent(playerTag)}${query}`, "DELETE")
      yield* run(`/roster/views/${view.id}${query}`, "DELETE")
      yield* run(`/roster-automation/${automation.automation_id}${query}`, "DELETE")
      yield* run(groupPath, "DELETE")
      yield* run(`/roster/${destinationId}${query}`, "DELETE")
      yield* run(rosterPath, "DELETE")
    }).pipe(Effect.provide(layer), Effect.scoped))
    expect([...covered].sort()).toEqual(dashboardRosterRuntimeRoutes.map(({ method, path }) => `${method} ${path}`).sort())
  })

  it("retains rosters larger than 50 members and enforces the configured per-owner limit without bot-only columns", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const fixtureServerId = "1534567890123456790"
      yield* sql`INSERT INTO servers (id, name) VALUES (${fixtureServerId}, 'Baseline roster size')`
      const operations = yield* DashboardRosterOperations
      const members = Array.from({ length: 51 }, (_, index) => ({ tag: `#P0Y${index}`, name: `Player ${index}`, townhall: 17, hero_level_sum: 0 }))
      const request = new Request(`https://api.clashk.ing/v2/roster?server_id=${fixtureServerId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ alias: "No new capacity limit", members, max_accounts_per_user: null }),
      })
      const response = yield* operations.execute("createRoster", { request, url: new URL(request.url), bindings, params: {} })
      const created = Schema.decodeUnknownSync(DashboardCreateRosterResponse)(yield* Effect.promise(() => response.json()))
      expect(created.roster.members).toHaveLength(51)
      expect(created.roster).not.toHaveProperty("capacity")
      const owner = "2534567890123456790"
      yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES ('#P0Y0', ${owner}, 'discord'), ('#P0Y1', ${owner}, 'discord')`
      const update = new Request(`https://api.clashk.ing/v2/roster/${created.roster_id}?server_id=${fixtureServerId}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ max_accounts_per_user: 1 }),
      })
      const result = yield* operations.execute("updateRoster", { request: update, url: new URL(update.url), bindings, params: { rosterId: created.roster_id } })
        .pipe(Effect.map(() => "accepted"), Effect.catchTag("Conflict", error => Effect.succeed(error.message)))
      expect(result).toBe("Roster account limit per Discord user would be exceeded")
      expect(yield* sql`SELECT max_accounts_per_user FROM rosters WHERE id = ${created.roster_id}::uuid`)
        .toEqual([{ max_accounts_per_user: null }])
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
