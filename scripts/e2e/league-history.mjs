// Actual Worker routes and indexed canonical Timescale history, not mocked HTTP.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'

export async function verifyLeagueHistory({db,origin}) {
  assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1')
  assert.equal(new URL(origin).hostname,'127.0.0.1')
  const tag='#PULY',other='#PULQ',rankedSeason=1790552400
  const seasons=['2023-03','2024-03-25','2024-01','2025-09','2025-12','v2-2026-09-28T05:00:00Z','v2-2026-10-26T05:00:00Z','v2-2099-01-01T05:00:00Z','v2-2026-08-31T05:00:00Z','v2-2026-07-06T05:00:00Z']
  const sourceIcons={small:'https://source.example/original-small.png',medium:'https://source.example/original-medium.png'}
  const fixtures=[
    [seasons[0],29000022,null,{league:{id:29000022,name:'Original Legend League',iconUrls:sourceIcons}}],
    [seasons[1],null,null,null],
    [seasons[2],null,null,null],
    [seasons[3],29000022,null,{league:{id:29000022,name:'Transition source name'}}],
    [seasons[4],null,105000035,{leagueTier:{id:105000035,name:'Original Legend II',iconUrls:sourceIcons}}],
    [seasons[5],29000022,105000036,{league:{id:29000022,name:'Legacy retained'},leagueTier:{id:105000036,name:'Original preferred tier'}}],
    [seasons[6],null,105000036,{leagueTier:{id:105000036,name:'Original Legend I',iconUrls:sourceIcons}}],
    [seasons[7],null,105000036,null],
    [seasons[8],null,null,null],
    [seasons[9],null,105000035,{leagueTier:{id:105000035,name:'Legend League II'}}],
  ]
  const read=async path=>{
    const response=await fetch(origin+path),body=await response.json()
    assert.equal(response.status,200,JSON.stringify(body));return body.items
  }
  try {
    for(const [season,legacy,tier,snapshot] of fixtures) {
      await db.query(`INSERT INTO legend_history(season,player_tag,player_name,rank,trophies,exp_level,attack_wins,defense_wins,league_id,league_tier_id,league_snapshot)
        VALUES($1,$2,'Historical source player',5,5300,200,200,10,$3,$4,$5)`,[season,tag,legacy,tier,snapshot])
    }
    await db.query(`INSERT INTO legend_history(season,player_tag,player_name,rank,trophies,exp_level,attack_wins,defense_wins)
      VALUES($1,$2,'Population observation',17,5000,200,100,5)`,[seasons[6],other])
    await db.query(`INSERT INTO ranked_league_group_members(season_id,group_tag,league_tier_id,player_tag,player_name,placement,league_trophies,
      attack_win_count,attack_loss_count,defense_win_count,defense_loss_count,maximum_battle_count)
      VALUES($1,'#PUL',105000034,$2,'Ranked source player',2,6200,5,1,4,2,6)`,[rankedSeason,tag])
    await assert.rejects(db.query('UPDATE legend_history SET league_id=-1 WHERE player_tag=$1 AND season=$2',[tag,seasons[0]]),error=>error.code==='23514')
    await assert.rejects(db.query("UPDATE legend_history SET league_snapshot='[]'::jsonb WHERE player_tag=$1 AND season=$2",[tag,seasons[0]]),error=>error.code==='23514')
    const items=await read(`/v2/player/${encodeURIComponent(tag)}/legend-history`)
    assert.equal(items.length,9,'Known unfinished season is excluded; raw legacy history is retained')
    assert(items.every(item=>!Object.hasOwn(item,'mode')),'Legend-only route does not need a mode discriminator')
    const bySeason=new Map(items.map(item=>[item.season,item]))
    const legacy=bySeason.get(seasons[0]);assert.equal(legacy.league.id,29000022);assert.equal(legacy.league.namespace,'legacy')
    assert.equal(legacy.league.name,'Original Legend League');assert.deepEqual(legacy.league.iconUrls,sourceIcons)
    assert.equal(legacy.leagueTier,undefined,'A legacy league never becomes a current tier')
    assert.equal(legacy.seasonStart,'2023-02-27T05:00:00.000Z');assert.equal(legacy.seasonEnd,'2023-03-27T05:00:00.000Z')
    const rawDate=bySeason.get(seasons[1]);assert.equal(rawDate.season,'2024-03-25');assert.equal(rawDate.seasonStart,null);assert.equal(rawDate.seasonEnd,null)
    assert.equal(rawDate.league,null,'Missing source metadata is never inferred from the Legend endpoint')
    assert.equal(bySeason.get(seasons[2]).league,null)
    const transition=bySeason.get(seasons[3]);assert.equal(transition.seasonStart,'2025-08-25T05:00:00.000Z');assert.equal(transition.seasonEnd,'2025-10-06T05:00:00.000Z')
    assert.equal(bySeason.get(seasons[4]).league.id,105000035);assert.equal(bySeason.get(seasons[4]).league.name,'Original Legend II')
    assert.equal(bySeason.get(seasons[5]).league.name,'Original preferred tier');assert.equal(bySeason.get(seasons[5]).league.namespace,'tier')
    const current=bySeason.get(seasons[6]);assert.equal(current.league.name,'Original Legend I');assert.equal(current.leagueTier.name,'Original Legend I')
    assert.equal(current.population,17,'Population preserves highest retained rank, not row count')
    assert.equal(current.seasonStart,'2026-09-28T05:00:00.000Z');assert.equal(current.seasonEnd,'2026-10-26T05:00:00.000Z')
    assert.equal(items[0].season,seasons[6],'Mixed identifier formats sort by known calendar before raw date labels')
    const bounded=await read(`/v2/player/${encodeURIComponent(tag)}/legend-history?time[after]=2026-10-01&time[before]=2026-11-01`)
    assert.deepEqual(bounded.map(item=>item.season),[seasons[6]],'Unknown boundaries cannot match an explicit time range')
    const ranked=await read(`/v2/player/${encodeURIComponent(tag)}/ranked/history`)
    assert.equal(ranked.length,1);assert.equal(ranked[0].seasonId,String(rankedSeason));assert(!Object.hasOwn(ranked[0],'mode'))
    const mixed=await read(`/v2/player/${encodeURIComponent(tag)}/league/history`)
    assert.equal(mixed.filter(item=>item.mode==='ranked').length,1)
    assert.deepEqual(mixed.filter(item=>item.mode==='legend').map(item=>item.season),items.map(item=>item.season),'Compatibility projection shares filtering and order')
    const seasonRows=await read(`/v2/legends/history/${encodeURIComponent(seasons[6])}`)
    assert.deepEqual(seasonRows.filter(item=>[tag,other].includes(item.tag)).map(item=>item.rank),[5,17])
    assert.equal(seasonRows.find(item=>item.tag===tag).league.name,'Original Legend I')
    const queryPlan=await db.query('EXPLAIN (FORMAT JSON) SELECT rank FROM legend_history WHERE season=$1 ORDER BY rank DESC LIMIT 1',[seasons[6]])
    // The deployed canonical index is present. Tiny disposable fixtures may
    // legitimately use a sequential scan; never force a production planner hint.
    const index=await db.query("SELECT indexdef FROM pg_indexes WHERE tablename='legend_history' AND indexname='idx_legend_history_season_rank'")
    assert.match(index.rows[0]?.indexdef??'',/\(season, rank\)/)
    assert(queryPlan.rows[0]['QUERY PLAN'][0].Plan)
    if(process.env.CLASHKING_E2E_APP_REPO) {
      const child=spawn(process.execPath,[resolve(process.env.CLASHKING_E2E_APP_REPO,'scripts/e2e/league-history.mjs')],{stdio:'inherit',env:{...process.env,CLASHKING_E2E_API_REPO:process.cwd(),CLASHKING_E2E_BASE_URL:origin,CLASHKING_E2E_HISTORY_TAG:tag}})
      const [code]=await once(child,'exit');assert.equal(code,0,'Typed Expo Legend history loader failed')
    }
    console.log('PASS league history: actual Legend/Ranked/mixed routes, original namespaces and icons, unknown metadata/dates, transition/v2 calendars, completed filtering and indexed population lookup')
  } finally {
    await db.query('DELETE FROM ranked_league_group_members WHERE player_tag=$1 AND season_id=$2',[tag,rankedSeason])
    await db.query('DELETE FROM legend_history WHERE player_tag=ANY($1::text[]) AND season=ANY($2::text[])',[[tag,other],seasons])
  }
}
