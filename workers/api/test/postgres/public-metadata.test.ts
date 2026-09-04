import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"

import { databaseLayer } from "../../src/database.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { GuildActivityStore } from "../../src/public-metadata-runtime.js"
import { NotFound } from "../../src/errors.js"

const databaseUrl = process.env.TEST_DATABASE_URL
if (databaseUrl === undefined || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") {
  throw new Error("Run this suite through clashking_schemas/scripts/with-test-timescale.sh")
}
const database = databaseLayer({ HYPERDRIVE: { connectionString: databaseUrl } } as WorkerBindings)

describe("Guild activity against authoritative Goose migrations", () => {
  it("reads memberships and latest activity, skips failed Clash fetches, and handles absent servers", async () => {
    const guildId = "123456789012345678"
    const fetch = vi.fn(async (request: Request) => {
      if (decodeURIComponent(new URL(request.url).pathname).endsWith("#P0YQQR")) {
        return new Response("unavailable", { status: 503 })
      }
      return Response.json({ memberList: [
        { tag: "#Q0YQQQ", trophies: 200, donations: 12, donationsReceived: 4 },
        { tag: "#Q0YQQR", trophies: 100, donations: 6, donationsReceived: 2 },
        { tag: "#Q0YQQG", trophies: 0, donations: 0, donationsReceived: 0 },
      ] })
    })
    const bindings = { CLASH_PROXY: { fetch } } as unknown as WorkerBindings
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const store = yield* GuildActivityStore
      const missing = yield* store.summarize(guildId, 7).pipe(Effect.flip)
      expect(missing).toBeInstanceOf(NotFound)
      yield* sql`INSERT INTO servers (id,name) VALUES (${guildId},'Metadata test')`
      expect((yield* store.summarize(guildId, 7)).clans).toEqual([])
      for (const tag of ["#P0YQQQ", "#P0YQQR"]) {
        yield* sql`INSERT INTO basic_clan (tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received)
          VALUES (${tag},'Stored clan name',false,0,3,'',0,0)`
        yield* sql`INSERT INTO server_clans (server_id,tag) VALUES (${guildId},${tag})`
      }
      yield* sql`INSERT INTO player_online_events (tag,clan_tag,seen_at) VALUES
        ('#Q0YQQQ','#P0YQQQ',now() - interval '1 day'),
        ('#Q0YQQQ','#P0YQQQ',now() - interval '20 days'),
        ('#Q0YQQR','#P0YQQQ',now() - interval '10 days')`
      const summary = yield* store.summarize(guildId, 7)
      expect(summary).toMatchObject({
        guild_id: guildId, total_clans: 1, total_members: 3, total_active_members: 1,
        total_inactive_members: 2, total_donations_sent: 18, total_donations_received: 6,
        clans: [{ clan_name: "Stored clan name", average_trophies: 100, average_donations_sent: 6 }],
      })
    }).pipe(
      Effect.provide(GuildActivityStore.layer), Effect.provideService(WorkerEnvironment, bindings),
      Effect.provide(database), Effect.scoped,
    ))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
