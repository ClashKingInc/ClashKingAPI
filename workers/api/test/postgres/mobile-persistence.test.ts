import { Bookmark, BookmarksResponse, RecentSearchesResponse, UpgradePreferencesResponse, UpgradesResponse } from "@clashking/api-contracts"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { AuthIdentity } from "../../src/auth.js"
import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { Unauthenticated } from "../../src/errors.js"
import { dispatchMobilePersistence, recordSuccessfulProxySearch } from "../../src/mobile-persistence.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Run through clashking_schemas/scripts/with-test-timescale.sh")
const bindings = { HYPERDRIVE: { connectionString: databaseUrl } } as unknown as WorkerBindings
const userId = "7534567890123456789", otherUserId = "8534567890123456789"
const userLayer = (id: string) => Layer.merge(databaseLayer(bindings), Layer.succeed(AuthIdentity, {
  requireUserOrBot: () => Effect.succeed({ kind: "user" as const, userId: id }),
  requireUser: () => Effect.succeed({ kind: "user" as const, userId: id }),
  requireBot: () => Effect.die("Unexpected bot authentication"),
}))
const run = (path: string, method = "GET", body?: unknown) => Effect.gen(function* () {
  const response = yield* dispatchMobilePersistence(new Request(`https://api.clashk.ing/v2${path}`, {
    method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  }), bindings)
  if (response === undefined || !response.ok) return yield* Effect.die(new Error(`${method} ${path} returned ${response?.status}`))
  return yield* Effect.promise(() => response.json() as Promise<unknown>)
})

describe("mobile persistence against authoritative Goose migrations", () => {
  it("serializes concurrent bot bookmark additions without creating an auth account", async () => {
    const botSubject = "8734567890123456789"
    const botLayer = Layer.merge(databaseLayer(bindings), Layer.succeed(AuthIdentity, {
      requireUserOrBot: () => Effect.succeed({ kind: "bot" as const }),
      requireBot: () => Effect.succeed({ kind: "bot" as const }),
      requireUser: () => Effect.fail(new Unauthenticated({ message: "User token required" })),
    }))
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const path = `/links/${botSubject}/bookmarks`
      yield* Effect.all(["#BP0Y", "#BP0L", "#BP0Y"].map((tag) => run(path, "POST", { type: "player", tag })), { concurrency: 3 })
      const listed = Schema.decodeUnknownSync(BookmarksResponse)(yield* run(`${path}?type=player`))
      expect(listed.items).toHaveLength(2)
      expect(listed.items.map((item) => item.order_index)).toEqual([0, 1])
      expect(new Set(listed.items.map((item) => item.tag))).toEqual(new Set(["#BP0Y", "#BP0L"]))
      expect(yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${botSubject}`).toEqual([])
      yield* run(`${path}/order`, "PUT", { type: "player", ordered_tags: ["#BP0Y", "#BP0L"] })
      expect(Schema.decodeUnknownSync(BookmarksResponse)(yield* run(`${path}?type=player`)).items.map((item) => item.tag)).toEqual(["#BP0Y", "#BP0L"])
      yield* run(`${path}/player/%23BP0Y`, "DELETE")
      expect(Schema.decodeUnknownSync(BookmarksResponse)(yield* run(`${path}?type=player`)).items.map((item) => item.tag)).toEqual(["#BP0L"])
    }).pipe(Effect.provide(botLayer), Effect.scoped))
  })

  it("adds bookmarks idempotently, supports subset reordering, and scopes deletion", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${userId}, 'discord'), (${otherUserId}, 'discord')`
      const path = `/links/${userId}/bookmarks`
      const first = Schema.decodeUnknownSync(Bookmark)(yield* run(path, "POST", { type: "player", tag: "p0y" }))
      expect(first).toMatchObject({ type: "player", tag: "#P0Y", player_tag: "#P0Y", order_index: 0 })
      expect(yield* run(path, "POST", { type: "player", tag: "#P0Y" })).toEqual(first)
      expect(yield* run(path, "POST", { type: "player", tag: "#P0L" })).toMatchObject({ order_index: 1 })
      expect(yield* run(path, "POST", { type: "clan", tag: "#P0Y" })).toMatchObject({ type: "clan", order_index: 0 })
      const listed = Schema.decodeUnknownSync(BookmarksResponse)(yield* run(`${path}?type=player`))
      expect(listed.items.map((item) => item.tag)).toEqual(["#P0Y", "#P0L"])
      yield* run(`${path}/order`, "PUT", { type: "player", ordered_tags: ["#P0L"] })
      expect(Schema.decodeUnknownSync(BookmarksResponse)(yield* run(`${path}?type=player`)).items.find((item) => item.tag === "#P0L")?.order_index).toBe(0)
      yield* sql`INSERT INTO player_links (tag, user_id, source) VALUES ('#P0G', ${userId}, 'discord')`
      const linked = yield* run(path, "POST", { type: "player", tag: "#P0G" }).pipe(Effect.flip)
      expect(linked).toMatchObject({ _tag: "Conflict" })
      // The current schema allows only verified notification subscriptions.
      // Deleting a bookmark must never remove that independently-owned row.
      yield* sql`INSERT INTO mobile_notification_accounts (user_id, player_tag, source) VALUES (${userId}, '#P0Y', 'verified')`
      yield* sql`INSERT INTO user_bookmarks (user_id, entity_type, tag) VALUES (${otherUserId}, 'player', '#P0Y')`
      yield* run(`${path}/player/%23P0Y`, "DELETE")
      expect(Schema.decodeUnknownSync(BookmarksResponse)(yield* run(`${path}?type=player`)).items.map((item) => item.tag)).toEqual(["#P0L"])
      expect(yield* sql`SELECT user_id FROM mobile_notification_accounts WHERE player_tag = '#P0Y'`).toEqual([{ user_id: userId }])
      expect(yield* sql`SELECT user_id FROM user_bookmarks WHERE entity_type = 'player' AND tag = '#P0Y'`).toEqual([{ user_id: otherUserId }])
      expect((yield* run(`${path}/player/%23P0Y`, "DELETE").pipe(Effect.flip))).toMatchObject({ _tag: "NotFound" })
    }).pipe(Effect.provide(userLayer(userId)), Effect.scoped))
  })

  it("requires verified ownership and replaces upgrade data but shallow-merges preferences", async () => {
    const upgradeUser = "7634567890123456789"
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${upgradeUser}, 'discord')`
      yield* sql`INSERT INTO player_links (tag, user_id, source, is_verified) VALUES
        ('#UP0Y', ${upgradeUser}, 'discord', true), ('#UP0L', ${upgradeUser}, 'discord', false)`
      const base = `/links/${upgradeUser}/%23UP0Y`
      expect(yield* run(`${base}/upgrades`)).toEqual({ player_tag: "#UP0Y", data: {}, updated_at: null })
      expect(yield* run(`${base}/upgrade-preferences`)).toEqual({ player_tag: "#UP0Y", preferences: {}, updated_at: null })
      expect(yield* run(`/links/${upgradeUser}/%23UP0L/upgrades`).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
      yield* run(`${base}/upgrades`, "PUT", { data: { kept: true, removed: 1, nested: { first: 1, second: 2 } } })
      const replaced = Schema.decodeUnknownSync(UpgradesResponse)(yield* run(`${base}/upgrades`, "PUT", { data: { nested: { first: 3 } } }))
      expect(replaced.data).toEqual({ nested: { first: 3 } })
      expect(replaced.updated_at).toEqual(expect.any(String))
      expect(Schema.decodeUnknownSync(UpgradesResponse)(yield* run(`${base}/upgrades`)).data).toEqual(replaced.data)
      yield* run(`${base}/upgrade-preferences`, "PATCH", { preferences: { kept: true, nested: { first: 1, second: 2 } } })
      const patched = Schema.decodeUnknownSync(UpgradePreferencesResponse)(yield* run(`${base}/upgrade-preferences`, "PATCH", { preferences: { nested: { first: 3 }, nullable: null } }))
      expect(patched.preferences).toEqual({ kept: true, nested: { first: 3 }, nullable: null })
      expect(Schema.decodeUnknownSync(UpgradePreferencesResponse)(yield* run(`${base}/upgrade-preferences`)).preferences).toEqual(patched.preferences)
      yield* sql`UPDATE player_links SET is_verified = false WHERE tag = '#UP0Y'`
      expect(yield* run(`${base}/upgrades`).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
      expect(yield* run(`${base}/upgrade-preferences`).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
      expect(yield* run(`${base}/upgrades`, "PUT", { data: {} }).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
      expect(yield* run(`${base}/upgrade-preferences`, "PATCH", { preferences: {} }).pipe(Effect.flip)).toMatchObject({ _tag: "NotFound" })
    }).pipe(Effect.provide(userLayer(upgradeUser)), Effect.scoped))
  })

  it("records compact successful profiles once and excludes searches older than ninety days", async () => {
    const searchUser = "7734567890123456789"
    const principal = { kind: "user" as const, userId: searchUser }
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO auth_users (user_id, provider) VALUES (${searchUser}, 'discord')`
      const player = { tag: "#S0Y", name: " Player ", townHallLevel: 18, expLevel: 250,
        clan: { tag: "#S0L", name: "Clan", badgeUrls: { small: "small", large: "large" }, clanLevel: 25 },
        league: { id: 29000022, name: "Legend League", iconUrls: { small: "small", medium: "medium" } }, heroes: [{ name: "King" }],
      }
      yield* recordSuccessfulProxySearch(principal, "/v1/players/%23S0Y?realtime=true", 200, player)
      yield* Effect.all([0, 1, 2].map((index) => recordSuccessfulProxySearch(principal, "/v1/players/%23S0Y", 200, { ...player, name: `Concurrent ${index}` })), { concurrency: 3 })
      yield* recordSuccessfulProxySearch(principal, "/v1/players/%23S0Y", 200, { ...player, name: "Latest player" })
      yield* recordSuccessfulProxySearch(principal, "/v1/clans/%23S0L", 200, { tag: "#S0L", name: "Clan", members: 50, badgeUrls: { small: "small", large: "large" }, memberList: [{ tag: "#S0Y" }] })
      yield* recordSuccessfulProxySearch(principal, "/v1/players/%23S0G", 404, player)
      yield* recordSuccessfulProxySearch(principal, "/v1/players/%23S0Y/battlelog", 200, player)
      yield* sql`INSERT INTO user_recent_searches (user_id, entity_type, tag, data, created_at)
        VALUES (${searchUser}, 'player', '#OLD', '{"name":"Expired"}'::jsonb, now() - interval '91 days')`
      const listed = Schema.decodeUnknownSync(RecentSearchesResponse)(yield* run(`/links/${searchUser}/searches`))
      expect(listed.players).toHaveLength(1)
      expect(listed.players[0]).toMatchObject({ tag: "#S0Y", name: "Latest player", townHallLevel: 18,
        clan: { tag: "#S0L", name: "Clan", badgeUrls: { large: "large" } }, league: { id: 29000022, name: "Legend League", iconUrls: { medium: "medium" } },
      })
      expect(listed.clans).toHaveLength(1)
      expect(listed.clans[0]).toMatchObject({ tag: "#S0L", name: "Clan", members: 50, badgeUrls: { large: "large" } })
      const stored = yield* sql<{ data: unknown }>`SELECT data FROM user_recent_searches WHERE user_id = ${searchUser} AND entity_type = 'player' AND tag = '#S0Y'`
      expect(stored).toEqual([{ data: { name: "Latest player", townHallLevel: 18,
        clan: { tag: "#S0L", name: "Clan", badgeUrls: { large: "large" } }, league: { id: 29000022, name: "Legend League", iconUrls: { medium: "medium" } },
      } }])
      expect(yield* recordSuccessfulProxySearch({ kind: "user", userId: "8834567890123456789" }, "/v1/players/%23S0Y", 200, player).pipe(Effect.flip))
        .toMatchObject({ _tag: "Unauthenticated" })
    }).pipe(Effect.provide(userLayer(searchUser)), Effect.scoped))
  })
})
