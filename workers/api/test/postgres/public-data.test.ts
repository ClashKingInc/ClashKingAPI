import { ClanCwlSeasonsResponse, PlayerCwlHistoryResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
vi.mock("../../src/war-archive-decoder.js", () => ({ decodeArchiveFrame: vi.fn() }))
import { databaseLayer } from "../../src/database.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { queryClanCwlSeasons, queryPlayerCwlHistory } from "../../src/public-cwl.js"
import { queryClanRecords } from "../../src/public-changes.js"
import { queryLeaderboardHistory, queryClanLeaderboardHistory } from "../../src/public-history.js"
import { selectClanWarIds } from "../../src/public-war.js"
import { readArchiveWar } from "../../src/war-archive.js"
import producer from "../fixtures/war-producer.json"

const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use schema-owned with-test-timescale.sh")
const bindings = { HYPERDRIVE: { connectionString: url } } as WorkerBindings
const layer = databaseLayer(bindings)
describe("public data against canonical Goose migrations", () => {
  it("hydrates a canonical pending archive, repairs CWL metadata, and calculates clan/player standings", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const cwlId = "publiccwl001", clan = "#P0Y", opponent = "#P0L", player = "#PYY"
      yield* sql`INSERT INTO cwl_groups (cwl_id,season,rounds,state) VALUES (${cwlId},'2025-08','[["#WAR"]]'::jsonb,'ended')`
      yield* sql`INSERT INTO cwl_group_clans (cwl_id,clan_tag,name,badge_token) VALUES (${cwlId},${clan},'Clan A',''),(${cwlId},${opponent},'Clan B','')`
      yield* sql`INSERT INTO cwl_group_members (cwl_id,clan_tag,tag,name,town_hall) VALUES (${cwlId},${clan},${player},'Player',18)`
      yield* sql`INSERT INTO cwl_league_history (clan_tag,seasons) VALUES (${clan},'{"2025-08":48000010}'::jsonb)`
      const rows = yield* sql<{ war_id: number }>`INSERT INTO wars
        (clan_tag,opponent_tag,prep_time,start_time,end_time,size,war_type,state,war_tag,clan_stars,opponent_stars,clan_destruction_percentage,opponent_destruction_percentage)
        VALUES (${clan},${opponent},'2026-08-01T12:00:00Z','2026-08-02T12:00:00Z','2026-08-03T12:00:00Z',15,'cwl','ended','#WAR',3,0,100,0) RETURNING war_id`
      const id = String(rows[0]!.war_id)
      const payload = { ...producer, clan: { ...producer.clan, tag: clan, stars: 3, destructionPercentage: 100,
        members: [{ ...producer.clan.members[0]!, attacks: [{ defenderTag: "#QYY", stars: 3, destructionPercentage: 100, order: 1, duration: 120 }] }] },
        opponent: { ...producer.opponent, tag: opponent } }
      yield* sql`INSERT INTO war_archive_pending (war_id,end_time,payload) VALUES (${id}::integer,'2026-08-03T12:00:00Z',${JSON.stringify(payload)}::jsonb)`
      expect((yield* readArchiveWar(id))?.war.type).toBe("cwl")
      const seasons = Schema.decodeUnknownSync(ClanCwlSeasonsResponse)(yield* queryClanCwlSeasons(clan, new URLSearchParams()))
      expect(seasons.items[0]).toMatchObject({ season: "2025-08", warSize: 15, rank: 1, stars: 13, rounds: { won: 1, lost: 0, tied: 0 }, warLeague: { id: 48000010 } })
      expect(yield* sql`SELECT cwl_league_id,war_size FROM cwl_groups WHERE cwl_id = ${cwlId}`).toEqual([{ cwl_league_id: 48000010, war_size: 15 }])
      expect(yield* sql`SELECT * FROM cwl_league_history WHERE clan_tag = ${clan}`).toEqual([])
      const history = Schema.decodeUnknownSync(PlayerCwlHistoryResponse)(yield* queryPlayerCwlHistory(player, new URLSearchParams()))
      expect(history.items[0]).toMatchObject({ teamSize: 15, missedAttacks: 0, placement: { clan: 1, group: 1 },
        clan: { totalStars: 13, placement: { group: 1, global: null } }, attacks: [{ round: 1, stars: 3, defender: { tag: "#QYY" } }] })
    }).pipe(Effect.provideService(WorkerEnvironment, bindings), Effect.provide(layer), Effect.scoped))
  })
  it("selects newest wars across both indexed clan sides with numeric ties and no duplicates", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const clan = "#UNION", other = "#OTHER"
      const rows = yield* sql<{ war_id: number }>`INSERT INTO wars
        (clan_tag,opponent_tag,prep_time,start_time,end_time,size,war_type,state)
        VALUES
        (${clan},${other},'2026-08-01','2026-08-02','2026-08-03',15,'random','ended'),
        (${other},${clan},'2026-08-02','2026-08-03','2026-08-04',15,'cwl','ended'),
        (${clan},${clan},'2026-08-03','2026-08-04','2026-08-05',15,'friendly','ended')
        RETURNING war_id`
      const start = new Date("2026-08-01"), end = new Date("2026-08-31")
      expect(yield* selectClanWarIds(clan, start, end, [], 2)).toEqual(rows.slice(1).reverse().map((row) => ({ war_id: String(row.war_id) })))
      expect(yield* selectClanWarIds(clan, start, end, ["random"], 2)).toEqual([{ war_id: String(rows[0]!.war_id) }])
      expect(yield* selectClanWarIds(clan, start, new Date("2026-08-02"), [], 5, true))
        .toEqual(rows.slice(0, 2).reverse().map((row) => ({ war_id: String(row.war_id) })))
      const ties = yield* sql<{ war_id: number }>`INSERT INTO wars
        (clan_tag,opponent_tag,prep_time,start_time,end_time,size,war_type,state)
        SELECT ${clan},${other},'2026-08-06'::timestamptz,'2026-08-07'::timestamptz,'2026-08-08'::timestamptz,15,'random','ended'
        FROM generate_series(1, 13) RETURNING war_id`
      expect(yield* selectClanWarIds(clan, start, end, [], 5))
        .toEqual([...ties].sort((a, b) => b.war_id - a.war_id).slice(0, 5).map((row) => ({ war_id: String(row.war_id) })))
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
  it("queries clan records and historical leaderboard summaries without invented table columns", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient, tag = "#QQY"
      expect(yield* queryClanRecords(tag)).toEqual({})
      yield* sql`INSERT INTO clan_records (tag,clan_points,clan_points_at) VALUES (${tag},12345,'2026-08-01T12:00:00Z')`
      expect(yield* queryClanRecords(tag)).toEqual({ clanPoints: { value: 12345, time: "2026-08-01T12:00:00.000Z" } })
      yield* sql`INSERT INTO leaderboard_history_clan_home (location_id,date,clan_tag,clan_name,clan_badge_token,clan_level,clan_points,members,rank)
        VALUES ('global','2026-08-01',${tag},'History clan','token',10,12345,30,100),('32000006','2026-08-01',${tag},'History clan','token',10,12345,30,10)`
      const response = yield* queryLeaderboardHistory('clan_home_points','global','2026-08-01')
      expect(response.items[0]).toMatchObject({ name: 'History clan', tag, rank: 100, clanPoints: 12345 })
      const summary = yield* queryClanLeaderboardHistory(tag, new URLSearchParams('type=clan_home_points'), true)
      expect(summary).toMatchObject({ seasons: [{ daysInTop200: 1, bestRank: 10, peakPoints: 12345 }] })
    }).pipe(Effect.provide(layer), Effect.scoped))
  })
})
