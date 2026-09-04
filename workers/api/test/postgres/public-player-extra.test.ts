import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { describe, expect, it, vi } from "vitest"
import { BotPlayerRankingsEndpoint, publicPlayerExtraEndpoints } from "@clashking/api-contracts"
vi.mock("../../src/war-archive-decoder.js", () => ({ decodeArchiveFrame: vi.fn() }))
import { databaseLayer } from "../../src/database.js"
import type { WorkerBindings } from "../../src/environment.js"
import { dispatchPublicPlayerExtra, queryMobilePlayerRankingsBatch, queryPlayerLegendHistoryBatch } from "../../src/public-player-extra.js"
import producer from "../fixtures/war-producer.json"

const url = process.env.TEST_DATABASE_URL
if (!url || process.env.CLASHKING_DISPOSABLE_TIMESCALE !== "1") throw new Error("Use schema-owned with-test-timescale.sh")
const leagueFetch = vi.fn(async () => Response.json({items:[{id:29000022,name:'Legend League',iconUrls:{small:'https://example.test/legend.png'}}]}))
const bindings = { HYPERDRIVE: { connectionString: url }, CLASH_PROXY: {fetch:leagueFetch} } as unknown as WorkerBindings
const layer = databaseLayer(bindings)
const get = (path: string) => Effect.gen(function* () {
  const response = yield* dispatchPublicPlayerExtra(new Request(`https://api.test/v2/${path}`), bindings)
  expect(response?.status).toBe(200)
  return yield* Effect.promise(() => response!.json())
})

describe("eleven extra public reads on canonical Goose SQL", () => {
  it("preserves nullable rankings and per-player Legend history limits for initialization", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO player_rankings_current(player_tag,ranking_type,location_id,rank,points) VALUES
        ('#P0Y','home','global',15,6000),('#P0Y','home','32000006',2,5900),('#P0Y','builder_base','32000006',NULL,NULL),
        ('#P0L','home','99999999',NULL,NULL)`
      const rankings = yield* get('player/%23P0Y/rankings')
      expect(rankings).toMatchObject({ tag: '#P0Y', homeVillage: { trophies: 6000, globalRank: 15, localRank: 2 }, location: { id: 32000006 } })
      expect(rankings).not.toHaveProperty('builderBase')
      const unknownLocation = yield* get('player/%23P0L/rankings')
      expect(unknownLocation).toEqual({ tag: '#P0L', location: { id: 99999999, isCountry: false } })
      expect(Schema.decodeUnknownSync(BotPlayerRankingsEndpoint.response)(unknownLocation)).toEqual(unknownLocation)
      const mobile = yield* queryMobilePlayerRankingsBatch(['#P0Y','#QQQ'])
      expect(mobile.get('#P0Y')).toMatchObject({ homeVillage: { points: 6000, globalRank: 15, localRank: 2 }, builderBase: { points: null, globalRank: null, localRank: null, locationId: '32000006' } })
      expect(mobile.get('#QQQ')).toEqual({ tag: '#QQQ', homeVillage: { points: null, globalRank: null, localRank: null, locationId: null, locationName: null, countryCode: null }, builderBase: { points: null, globalRank: null, localRank: null, locationId: null, locationName: null, countryCode: null } })
      for (let i = 1; i <= 12; i++) yield* sql`INSERT INTO legend_history(season,player_tag,player_name,rank,trophies,exp_level,attack_wins,defense_wins,league_tier_id)
        VALUES (${`2025-${String(i).padStart(2,'0')}`},'#P0Y','Player',${i},6000,200,100,10,105000034)`
      const history = yield* get('player/%23P0Y/legend-history')
      expect(history).toHaveProperty('items.length',12)
      const batch = yield* queryPlayerLegendHistoryBatch(['#P0Y','#QQQ'])
      expect(batch.get('#P0Y')).toHaveLength(10)
      expect(batch.get('#P0Y')?.[0]).toMatchObject({ season:'2025-12',name:'Player',tag:'#P0Y',leagueTier:{id:105000034} })
      expect(batch.get('#QQQ')).toEqual([])
      expect(yield* get('legends/history/2025-12?limit=1')).toHaveProperty('items.length',1)
    }).pipe(Effect.provide(layer),Effect.scoped))
  })

  it("uses ranked season membership and an exclusive seven-day battle boundary", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient, season = Date.parse('2026-08-01T00:00:00Z')/1000
      yield* sql`INSERT INTO ranked_league_group_members(season_id,group_tag,league_tier_id,player_tag,player_name,placement,league_trophies,attack_win_count,attack_lose_count,defense_win_count,defense_lose_count) VALUES
        (${String(season)}::bigint,'#GROUP',105000034,'#P0Y','Player',2,6000,1,2,3,4),
        (${String(season)}::bigint,'#GROUP',105000034,'#P0L','Other',1,6100,1,2,3,4),
        (${String(season+604800)}::bigint,'#GROUP',105000034,'#QQQ','Next season',1,6200,1,2,3,4)`
      for (const [time,type] of [['2026-08-01T00:00:00Z','ranked'],['2026-08-08T00:00:00Z','ranked'],['2026-08-02T00:00:00Z','friendly']] as const) {
        yield* sql`INSERT INTO battlelogs(battle_id,player_tag,player_th,opponent_tag,opponent_th,battle_type,attack,stars,destruction_percentage,gold,elixir,dark_elixir,"timestamp",army_items,army_counts,player_name,opponent_name,duration,army_share_code)
          VALUES (${crypto.randomUUID()}::uuid,'#P0Y',18,'#P0L',17,${type},true,3,100,1,2,3,${time}::timestamptz,ARRAY['Barbarian'],'{"Barbarian":1}'::jsonb,'Player','Other',120,'army')`
      }
      expect(yield* get(`player/%23P0Y/ranked/${season}/battlelog`)).toMatchObject({ season,member:{name:'Player',placement:2},battlelogs:[{timestamp:'2026-08-01T00:00:00.000Z',player_townhall:18}] })
      const group = yield* get(`player/%23P0Y/ranked/${season}/group`)
      expect(group).toMatchObject({ season,count:2,members:[{tag:'#P0L'},{tag:'#P0Y'}] })
      expect(yield* get(`player/%23QQQ/ranked/${season}/group`)).toEqual({ tag:'#QQQ',season,group:null,members:[] })
      expect(yield* get(`player/%23QQQ/ranked/${season}/battlelog`)).toEqual({ tag:'#QQQ',season,member:null,battlelogs:[] })
    }).pipe(Effect.provide(layer),Effect.scoped))
  })

  it("maps typed leaderboard history, positive stat changes, capital totals and boundary buckets", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO leaderboard_history_player_home(location_id,date,player_tag,player_name,exp_level,trophies,attack_wins,defense_wins,rank,league_id)
        VALUES ('global','2026-08-01','#P0Y','Player',200,6000,10,20,4,29000022)`
      yield* sql`INSERT INTO leaderboard_history_player_builder_base(location_id,date,player_tag,player_name,exp_level,builder_base_trophies,rank)
        VALUES ('32000006','2026-08-02','#P0Y','Player',200,5000,2)`
      expect(yield* get('player/%23P0Y/leaderboard-history/player_home_trophies')).toMatchObject({ type:'player_home_trophies',playerTag:'#P0Y',items:[{date:'2026-08-01',locationId:'global',details:{trophies:6000,rank:4,league:{id:29000022,name:'Legend League',iconUrls:{small:'https://example.test/legend.png'}}}}] })
      expect(leagueFetch).toHaveBeenCalledTimes(1)
      expect(yield* get('player/%23P0Y/leaderboard-history/player_builder_base_trophies')).toMatchObject({ items:[{details:{builderBaseTrophies:5000}}] })
      yield* sql`INSERT INTO player_stat_changes(event_time,player_tag,clan_tag,stat_type,previous_value,current_value,delta)
        VALUES ('2026-08-01T00:00:00Z','#P0Y',NULL,'capital_gold_donated',9876543210,9876543220,10),
        ('2026-08-01T00:00:00Z','#P0Y',NULL,'donated',1,2,1)`
      expect(yield* get('player/%23P0Y/history/stats?type=capital_gold_donated&time[after]=2026-08-01&time[before]=2026-08-01')).toEqual({items:[{eventTime:'2026-08-01T00:00:00.000Z',clanTag:null,statType:'capital_gold_donated',previousValue:9876543210,currentValue:9876543220,delta:10}]})
      yield* sql`INSERT INTO basic_clan(tag,name,location_id,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received,capital_gold_total)
        VALUES ('#P0C','Capital clan',32000006,true,100,20,'badge',0,0,9876543210),('#P0J','Other location',32000007,true,100,20,'badge',0,0,9999999999)`
      yield* sql`REFRESH MATERIALIZED VIEW clan_leaderboards`
      expect(yield* get('leaderboard/32000006/clan/capital-gold')).toMatchObject({location_id:32000006,kind:'capital_gold_total',count:1,items:[{tag:'#P0C',capital_gold_total:9876543210,rank:1}]})
      for (const [index,trophies] of [-1,0,499,500,6999,7000].entries()) yield* sql`INSERT INTO basic_player(tag,name,league_id,townhall_level,trophies) VALUES (${`#BUCKET${index}`},'Bucket',105000034,18,${trophies})`
      expect(yield* get('leaderboard/105000034/trophy-buckets')).toEqual({league_tier_id:105000034,count:5,items:[{bucket:0,players:1,trophies:-1},{bucket:1,players:2,trophies:499},{bucket:2,players:1,trophies:500},{bucket:14,players:1,trophies:6999},{bucket:15,players:1,trophies:7000}]})
    }).pipe(Effect.provide(layer),Effect.scoped))
  })

  it("reconciles shared clan intervals and reads both attack sides through the existing archive iterator", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      for (const [player,type,time] of [['#PYY','join','2026-08-01T00:00:00Z'],['#PYY','leave','2026-08-01T02:00:00Z'],['#QYY','join','2026-08-01T00:30:00Z'],['#QYY','leave','2026-08-01T01:30:00Z']] as const)
        yield* sql`INSERT INTO join_leave_history("time","type",clan_tag,player_tag,player_name,townhall_level) VALUES (${time}::timestamptz,${type},'#P0C',${player},'Player',18)`
      expect(yield* get('player/%23PYY/join-leave/shared?tag=%23QYY')).toEqual({items:[{clan:{name:'Capital clan',tag:'#P0C'},minutes:60}]})
      const ids: number[] = []
      for (const [end,type] of [['2026-08-03T12:00:00Z','random'],['2026-08-04T12:00:00Z','cwl']] as const) {
        const wars = yield* sql<{war_id:number}>`INSERT INTO wars(clan_tag,opponent_tag,prep_time,start_time,end_time,size,attacks_per_member,war_type,state)
          VALUES ('#AAA','#BBB','2026-08-01T12:00Z','2026-08-02T12:00Z',${end}::timestamptz,15,1,${type},'warEnded') RETURNING war_id`
        const id = wars[0]!.war_id; ids.push(id)
        const payload = {...producer,endTime:end,clan:{...producer.clan,members:[{...producer.clan.members[0]!,attacks:[{defenderTag:'#QYY',stars:2,destructionPercentage:90,order:1,duration:120}]}]},opponent:{...producer.opponent,members:[{...producer.opponent.members[0]!,attacks:[{defenderTag:'#PYY',stars:3,destructionPercentage:100,order:2,duration:110}]}]}}
        yield* sql`INSERT INTO war_archive_pending(war_id,end_time,payload) VALUES (${id},${end}::timestamptz,${JSON.stringify(payload)}::jsonb)`
      }
      yield* sql`INSERT INTO player_war_history(player_tag,war_ids) VALUES ('#PYY',${ids}::integer[])`
      expect(yield* get('player/%23PYY/war/attacks?limit=1')).toMatchObject({items:[{warType:'cwl',warEndTime:'20260804T120000.000Z',side:'defense',stars:3}]})
      expect(yield* get('player/%23PYY/war/attacks?type=random')).toMatchObject({items:[{side:'defense',attackOrder:2},{side:'attack',attackOrder:1}]})
    }).pipe(Effect.provide(layer),Effect.scoped))
  })
  it("registers exactly the six missing shared contracts", () => expect(Object.keys(publicPlayerExtraEndpoints)).toHaveLength(6))

  it.each([
    'player/%ZZ/rankings', 'player/%23P0Y/ranked/nope/group', 'player/%23P0Y/leaderboard-history/clan_home_points',
    'player/%23P0Y/join-leave/shared', 'player/%23P0Y/war/attacks?type=invalid',
    'player/%23P0Y/history/stats?type=season_pass', 'player/%23P0Y/history/stats?type=donated&time[after]=2026-02-30',
    'legends/history/2025-12?limit=201', 'leaderboard/global/clan/capital-gold', 'leaderboard/not-a-league/trophy-buckets',
  ])("rejects invalid public query %s", async (path) => {
    const result = await Effect.runPromise(dispatchPublicPlayerExtra(new Request(`https://api.test/v2/${path}`),bindings).pipe(
      Effect.match({ onFailure: (error) => error._tag, onSuccess: () => 'unexpected success' }), Effect.provide(layer), Effect.scoped))
    expect(result).toBe('InvalidRequest')
  })

  it("does not silently round SQL bigint values outside the shared numeric contract", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO player_stat_changes(event_time,player_tag,stat_type,previous_value,current_value,delta)
        VALUES ('2026-08-01T00:00:00Z','#PQL','donated',9007199254740992,9007199254740993,1)`
      const result = yield* dispatchPublicPlayerExtra(new Request('https://api.test/v2/player/%23PQL/history/stats?type=donated&time[after]=2026-08-01'),bindings).pipe(
        Effect.match({onFailure:(error)=>error._tag,onSuccess:()=> 'unexpected success'}))
      expect(result).toBe('DatabaseFailure')
    }).pipe(Effect.provide(layer),Effect.scoped))
  })
})
