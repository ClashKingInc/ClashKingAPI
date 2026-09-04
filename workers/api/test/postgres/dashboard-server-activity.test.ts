import { BotServerClanGamesLeaderboardEndpoint, BotServerDonationsLeaderboardEndpoint, BotServerLegendsLeaderboardEndpoint, BotServerWarLeaderboardEndpoint, type AnyEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { expect, it, vi } from "vitest"
import { databaseLayer } from "../../src/database.js"
import { executeDashboardServerActivity } from "../../src/dashboard-server-activity.js"
import type { WorkerBindings } from "../../src/environment.js"
import producer from "../fixtures/war-producer.json"

vi.mock("../../src/war-archive-decoder.js", () => ({ decodeArchiveFrame: () => { throw new Error("Unexpected R2 access") } }))
const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1" || new URL(url).hostname !== "127.0.0.1") throw new Error("Use local disposable schema-owned Timescale")
const bindings = { HYPERDRIVE: { connectionString: url } } as WorkerBindings
const serverId = "7334567890123456789", clanTag = "#P0Y90200", playerTag = "#P0Y90201"
const execute = (endpoint: AnyEndpoint) => executeDashboardServerActivity({ endpoint, bindings, body: {}, path: { serverId }, query: { season: "2025-09" }, principal: { kind: "bot" }, request: new Request("https://api.clashk.ing/") })

it("executes all four server activity reads with real season-delta SQL and pending war archives", async () => {
  await Effect.runPromise(Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO servers (id, name) VALUES (${serverId}, 'Activity fixture')`
    yield* sql`INSERT INTO basic_clan (tag, name, public_war_log, war_wins, member_count, badge_token, troops_donated, troops_received) VALUES (${clanTag}, 'Activity clan', true, 0, 1, '', 0, 0)`
    yield* sql`INSERT INTO basic_player (tag, name, townhall_level, trophies, league_id, clan_tag) VALUES (${playerTag}, 'Activity player', 18, 5500, 29000022, ${clanTag})`
    yield* sql`INSERT INTO server_clans (tag, server_id) VALUES (${clanTag}, ${serverId})`
    for (const [stat, delta] of [["donated", 120], ["received", 30], ["clan_games", 4000]] as const) {
      yield* sql`INSERT INTO player_stat_changes (event_time, player_tag, clan_tag, stat_type, previous_value, current_value, delta)
        VALUES ('2025-08-25T05:00:00Z', ${playerTag}, ${clanTag}, ${stat}, 0, ${delta}, ${delta})`
    }
    // End is exclusive; this delta must not appear in the long September season.
    yield* sql`INSERT INTO player_stat_changes (event_time, player_tag, stat_type, previous_value, current_value, delta)
      VALUES ('2025-10-06T05:00:00Z', ${playerTag}, 'donated', 120, 220, 100)`
    const end = new Date("2026-08-03T12:00:00Z"), prep = new Date("2026-08-01T12:00:00Z"), start = new Date("2026-08-02T12:00:00Z")
    const warId = (yield* sql<{ war_id: number }>`INSERT INTO wars (clan_tag, opponent_tag, prep_time, start_time, end_time, size, war_type, state)
      VALUES (${clanTag}, '#Q0Y90200', ${prep}, ${start}, ${end}, 15, 'random', 'ended') RETURNING war_id`)[0]!.war_id
    const payload = { ...producer, clan: { ...producer.clan, tag: clanTag, members: [{ ...producer.clan.members[0]!, tag: playerTag,
      attacks: [{ defenderTag: "#QYY", stars: 3, destructionPercentage: 100, duration: 90, order: 1 }] }] } }
    yield* sql`INSERT INTO war_archive_pending (war_id, end_time, payload) VALUES (${warId}, ${end}, ${JSON.stringify(payload)}::jsonb)`
    yield* sql`INSERT INTO player_war_history (player_tag, war_ids) VALUES (${playerTag}, ${[warId]}::integer[])`
    const donations = Schema.decodeUnknownSync(BotServerDonationsLeaderboardEndpoint.response)(yield* execute(BotServerDonationsLeaderboardEndpoint))
    expect(donations).toMatchObject({ server_id: serverId, season: "2025-09", items: [{ donated: 120, received: 30, score: 120 }], total: 1 })
    const games = Schema.decodeUnknownSync(BotServerClanGamesLeaderboardEndpoint.response)(yield* execute(BotServerClanGamesLeaderboardEndpoint))
    expect(games.items[0]).toMatchObject({ clan_games: 4000, score: 4000 })
    const legends = Schema.decodeUnknownSync(BotServerLegendsLeaderboardEndpoint.response)(yield* execute(BotServerLegendsLeaderboardEndpoint))
    expect(legends.items[0]).toMatchObject({ player_tag: playerTag, trophies: 5500 })
    const wars = Schema.decodeUnknownSync(BotServerWarLeaderboardEndpoint.response)(yield* execute(BotServerWarLeaderboardEndpoint))
    expect(wars.items[0]).toMatchObject({ player_tag: playerTag, total_attacks: 1, total_stars: 3, three_star_rate: 100 })
  }).pipe(Effect.provide(databaseLayer(bindings)), Effect.scoped))
})
