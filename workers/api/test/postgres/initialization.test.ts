import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
vi.mock("../../src/war-archive-decoder.js", () => ({ decodeArchiveFrame: () => { throw new Error("Unexpected R2 frame") } }))
import { InitializationResponse } from "../../../../packages/api-contracts/src/initialization.js"
import { AuthIdentity } from "../../src/auth.js"
import { databaseLayer } from "../../src/database.js"
import { WorkerEnvironment, type WorkerBindings } from "../../src/environment.js"
import { Unauthenticated } from "../../src/errors.js"
import { dispatchInitialization, initializeMobileAccount } from "../../src/initialization.js"
import producer from "../fixtures/war-producer.json"

const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use schema-owned disposable Timescale")
const tag = "#PYY90080", clanTag = "#PYY90081", opponentTag = "#QYY90081"
const badges = { small: "", medium: "", large: "" }
const player = { tag, name: "Init player", townHallLevel: 18, expLevel: 200, trophies: 5000, bestTrophies: 6000,
  warStars: 10, attackWins: 2, defenseWins: 3, achievements: [], heroes: [], troops: [], spells: [],
  clan: { tag: clanTag, name: "Init clan", clanLevel: 10, badgeUrls: badges } }
const clan = { tag: clanTag, name: "Init clan", type: "inviteOnly", description: "", isFamilyFriendly: true, badgeUrls: badges,
  clanLevel: 10, clanPoints: 5000, clanBuilderBasePoints: 0, clanCapitalPoints: 0, requiredTrophies: 0, warFrequency: "always",
  warWinStreak: 0, warWins: 1, isWarLogPublic: true, members: 1, memberList: [], labels: [] }
const fetch = vi.fn(async (request: Request) => {
  const path = decodeURIComponent(new URL(request.url).pathname)
  if (path === `/v1/players/${tag}`) return Response.json(player)
  if (path === `/v1/clans/${clanTag}`) return Response.json(clan)
  if (path.endsWith("/currentwar")) return Response.json({ state: "notInWar" })
  if (path.endsWith("/warlog") || path.endsWith("/capitalraidseasons")) return Response.json({ items: [] })
  return new Response("not found", { status: 404 })
})
const bindings = { HYPERDRIVE: { connectionString: url }, CLASH_PROXY: { fetch } } as unknown as WorkerBindings
const database = databaseLayer(bindings)
describe("mobile initialization against real PostgreSQL", () => {
  it("assembles live player/clan data, rankings, canonical war history and exact empty sections", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const id = (yield* sql<{ war_id: number }>`INSERT INTO wars
        (clan_tag,opponent_tag,prep_time,start_time,end_time,size,attacks_per_member,war_type,state)
        VALUES (${clanTag},${opponentTag},'2026-08-01T12:00:00Z','2026-08-02T12:00:00Z','2026-08-03T12:00:00Z',15,2,'random','ended') RETURNING war_id`)[0]!.war_id
      const payload = { ...producer, warTag: undefined, attacksPerMember: 2,
        clan: { ...producer.clan, tag: clanTag, members: [{ ...producer.clan.members[0]!, tag, attacks: [{ defenderTag: "#QYY", stars: 3, destructionPercentage: 100, order: 1, duration: 120 }] }] },
        opponent: { ...producer.opponent, tag: opponentTag } }
      yield* sql`INSERT INTO war_archive_pending (war_id,end_time,payload) VALUES (${id},'2026-08-03T12:00:00Z',${JSON.stringify(payload)}::jsonb)`
      yield* sql`INSERT INTO player_war_history (player_tag,war_ids) VALUES (${tag},${[id]}::integer[])`
      yield* sql`INSERT INTO player_rankings_current (player_tag,ranking_type,location_id,rank,points) VALUES (${tag},'home','global',42,5500)`
      const response = Schema.decodeUnknownSync(InitializationResponse)(yield* initializeMobileAccount([tag.toLowerCase(), tag, ""], "test-user", bindings, new Date("2026-09-15T12:00:00Z")))
      expect(response.metadata).toEqual({ total_players: 1, total_clans: 1, fetch_time: "2026-09-15T12:00:00Z", user_id: "test-user" })
      expect(response.players[0]).toMatchObject({ tag, legends_by_season: {}, legend_eos_ranking: [], war_data: {}, rankings: { homeVillage: { points: 5500, globalRank: 42 }, builderBase: { points: null } } })
      expect(response.clans).toMatchObject({ clan_stats: {}, cwl_data: [], capital_data: [{ clan_tag: clanTag, history: [] }], war_log_data: [{ clan_tag: clanTag, items: [] }],
        war_data: [{ clan_tag: clanTag, isInWar: false, isInCwl: false, war_info: { state: "notInWar" }, league_info: null }] })
      expect(response.war_stats).toHaveLength(1)
      expect(response.war_stats[0]).toMatchObject({ tag, stats: { all: { warsCounts: 1, totalAttacks: 1, totalDefenses: 0, missedAttacks: 1, missedDefenses: 1, byEnemyTownhall: { "18vs18": { averageStars: 3, count: 1 } } }, random: { totalAttacks: 1 }, cwl: { totalAttacks: 0 } } })
      expect(response.clans.clan_war_stats[0]?.players[0]?.stats).toEqual(response.war_stats[0]?.stats)
      expect(response.war_stats[0]?.wars[0]?.war_data.clan).not.toHaveProperty("members")
      expect(response.players_basic[0]?.tag).toBe(tag)
    }).pipe(Effect.provideService(WorkerEnvironment, bindings), Effect.provide(database), Effect.scoped))
  })
  it("requires authentication before touching the body, database, or upstream", async () => {
    const reject = () => Effect.fail(new Unauthenticated({ message: "Missing token" }))
    const auth = Layer.succeed(AuthIdentity, { requireUser: reject, requireUserOrBot: reject, requireBot: reject })
    const before = fetch.mock.calls.length
    await expect(Effect.runPromise(dispatchInitialization(new Request("https://api.test/v2/initialization", { method: "POST", body: "invalid" }), bindings)
      .pipe(Effect.provide(auth), Effect.provide(database), Effect.scoped))).rejects.toMatchObject({ _tag: "Unauthenticated" })
    expect(fetch.mock.calls).toHaveLength(before)
  })
})
