import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it } from "vitest"

import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { seedObservedClanProfile } from "../../src/proxy-clan-profile.js"
import { recordProxyWarActivity } from "../../src/proxy-war-activity.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1" || new URL(databaseUrl).hostname !== "127.0.0.1") {
  throw new Error("Use the local schema-owned disposable Timescale harness")
}
const database = databaseLayer({ HYPERDRIVE: { connectionString: databaseUrl } } as WorkerBindings)
const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(database), Effect.scoped))

const war = (clanTag: string, memberTag: string, startTime = "20260915T010000.000Z") => ({
  state: "inWar", startTime, endTime: "20260916T010000.000Z",
  clan: { tag: clanTag, members: [{ tag: memberTag }] },
})

describe.sequential("proxy current-war activity against authoritative Goose migrations", () => {
  it("advances both timestamps only for an explicitly enabled verified owned roster member and never regresses them", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const userId = "935000000000009001", enabledTag = "#P0Y91", disabledTag = "#P0Y92"
    const enabledClan = "#Q0Y91", disabledClan = "#Q0Y92"
    yield* sql`INSERT INTO auth_users(user_id,provider) VALUES (${userId},'discord')`
    yield* sql`INSERT INTO player_links(tag,user_id,source,is_verified) VALUES
      (${enabledTag},${userId},'fixture',true),(${disabledTag},${userId},'fixture',true)`
    yield* sql`INSERT INTO mobile_notification_accounts(user_id,player_tag,enabled) VALUES
      (${userId},${enabledTag},true),(${userId},${disabledTag},false)`
    yield* sql`INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received) VALUES
      (${enabledClan},'Enabled clan',true,0,1,'',0,0),(${disabledClan},'Disabled clan',true,0,1,'',0,0)`

    const principal = { kind: "user" as const, userId }
    const now = new Date("2026-09-15T12:00:00Z")
    yield* recordProxyWarActivity(principal, `/proxy/v1/clans/${encodeURIComponent(enabledClan)}/currentwar`, war(enabledClan, enabledTag), now)
    yield* recordProxyWarActivity(principal, `/proxy/v1/clans/${encodeURIComponent(disabledClan)}/currentwar`, war(disabledClan, disabledTag), now)
    yield* recordProxyWarActivity(principal, `/proxy/v1/clans/${encodeURIComponent(enabledClan)}/currentwar`, war(enabledClan, enabledTag, "20260914T010000.000Z"), now)

    const rows = yield* sql<{ tag: string; last_active: Date | null; last_war_at: Date | null }>`
      SELECT tag,last_active,last_war_at FROM basic_clan WHERE tag IN (${enabledClan},${disabledClan}) ORDER BY tag`
    const enabled = rows.find((row) => row.tag === enabledClan)!
    const disabled = rows.find((row) => row.tag === disabledClan)!
    expect(enabled.last_active?.toISOString()).toBe("2026-09-15T01:00:00.000Z")
    expect(enabled.last_war_at?.toISOString()).toBe("2026-09-15T01:00:00.000Z")
    expect(disabled.last_active).toBeNull()
    expect(disabled.last_war_at).toBeNull()
  })))
  it("seeds a complete missing clan from an eligible full-profile response without overwriting an existing profile", () => run(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const userId = "935000000000009002", playerTag = "#P0Y93", clanTag = "#Q0Y93"
    yield* sql`INSERT INTO auth_users(user_id,provider) VALUES (${userId},'discord')`
    yield* sql`INSERT INTO player_links(tag,user_id,source,is_verified) VALUES (${playerTag},${userId},'fixture',true)`
    yield* sql`INSERT INTO mobile_notification_accounts(user_id,player_tag,enabled) VALUES (${userId},${playerTag},true)`
    const profile = { tag: clanTag, name: "Observed clan", description: "Full profile", clanLevel: 20,
      location: { id: 32000006 }, warLeague: { id: 48000010 }, capitalLeague: { id: 85000001 },
      isWarLogPublic: true, warWins: 100, warWinStreak: 4, clanPoints: 50_000, members: 1,
      badgeUrls: { large: "https://api-assets.clashofclans.com/badges/512/token.png" },
      memberList: [{ tag: playerTag, name: "Member", donations: 12, donationsReceived: 3 }] }
    const principal = { kind: "user" as const, userId }

    // A war observed before the profile has no safe full row to update.
    yield* recordProxyWarActivity(principal, `/proxy/v1/clans/${encodeURIComponent(clanTag)}/currentwar`, war(clanTag, playerTag), new Date("2026-09-15T12:00:00Z"))
    yield* seedObservedClanProfile(principal, `/proxy/v1/clans/${encodeURIComponent(clanTag)}`, profile)
    let rows = yield* sql<{ name: string; description: string; clan_level: number; badge_token: string; troops_donated: number; members: unknown; last_war_at: Date | null }>`
      SELECT name,description,clan_level,badge_token,troops_donated,members,last_war_at FROM basic_clan WHERE tag=${clanTag}`
    expect(rows[0]).toMatchObject({ name: "Observed clan", description: "Full profile", clan_level: 20,
      badge_token: "token", troops_donated: 12, members: [{ tag: playerTag, name: "Member" }], last_war_at: null })

    yield* seedObservedClanProfile(principal, `/proxy/v1/clans/${encodeURIComponent(clanTag)}`, { ...profile, name: "Must not overwrite" })
    rows = yield* sql<{ name: string; description: string; clan_level: number; badge_token: string; troops_donated: number; members: unknown; last_war_at: Date | null }>`
      SELECT name,description,clan_level,badge_token,troops_donated,members,last_war_at FROM basic_clan WHERE tag=${clanTag}`
    expect(rows[0]?.name).toBe("Observed clan")

    yield* recordProxyWarActivity(principal, `/proxy/v1/clans/${encodeURIComponent(clanTag)}/currentwar`, war(clanTag, playerTag), new Date("2026-09-15T12:00:00Z"))
    const updated = yield* sql<{ last_war_at: Date | null }>`SELECT last_war_at FROM basic_clan WHERE tag=${clanTag}`
    expect(updated[0]?.last_war_at?.toISOString()).toBe("2026-09-15T01:00:00.000Z")
  })))
})
