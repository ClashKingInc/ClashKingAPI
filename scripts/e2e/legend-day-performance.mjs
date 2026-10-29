// Real local workerd -> API -> canonical disposable Timescale. Fixtures are
// stored observations, never mocked HTTP responses or production writes.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import pg from 'pg'

const dsn = new URL(process.env.TEST_DATABASE_URL ?? '')
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1')
assert.equal(dsn.hostname, '127.0.0.1')
assert.equal(dsn.pathname, '/clashking_test')
const db = new pg.Client({ connectionString: dsn.href })
await db.connect()
const port = 8803
let api, logs = ''
const date = offset => new Date(Date.now() - offset * 86400000).toISOString().slice(0,10)
const first = date(5), last = date(3), prior = date(6)
const days = [
  { day: first, players: [{ tag:'#PYP', rank:1, attack:320, defense:320 }] },
  { day: date(4), players: [{ tag:'#PYP', rank:1500, attack:320, defense:null }, { tag:'#PYQ', rank:201, attack:0, defense:null }] },
  { day: prior, players: [{ tag:'#PYP', rank:1, attack:160, defense:null }] },
]
try {
  for (const {day,players} of days) {
    for (const player of players) {
      await db.query(`INSERT INTO legend_rankings_history
        (day,tag,global_rank,trophies,observed_attack_count,observed_attack_triples,observed_attack_trophies,
         observed_defense_count,observed_defense_triples,observed_defense_trophies,performance_calculated_at)
        VALUES($1,$2,$3,5000,8,$4,$5,$6,$7,$8,now())`,
        [day,player.tag,player.rank,player.attack===320?8:0,player.attack,player.defense===null?0:8,player.defense===320?8:0,player.defense??0])
    }
    for (const [cohort,max] of [['legend_i',Infinity],['top_1000',1000],['top_200',200]]) {
      const members=players.filter(p=>p.rank<=max)
      for (const [direction,key] of [[1,'attack'],[2,'defense']]) {
        const observed=members.filter(p=>p[key]!==null), perfect=observed.filter(p=>p[key]===320)
        const buckets=Array(16).fill(0)
        for(const player of observed)buckets[Math.min(15,Math.floor(player[key]/20))]++
        await db.query(`INSERT INTO legend_day_performance
          (day,cohort,direction,source_window_start,source_window_end,eligible_player_count,observed_player_count,
           complete_player_count,invalid_player_count,observed_battle_count,observed_triple_count,
           perfect_player_count,complete_trophy_sum,trophy_buckets)
          VALUES($1,$2,$3,$1::date+interval '5 hours',$1::date+interval '29 hours',$4,$5,$5,0,$6,$7,$8,$9,$10)`,
          [day,cohort,direction,members.length,observed.length,observed.length*8,perfect.length*8,perfect.length,observed.reduce((n,p)=>n+p[key],0),buckets])
      }
    }
  }
  api=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{
    env:{...process.env,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',
      CLASHKING_LOCAL_DISCORD_CLIENT_ID:'999999999999999999',CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local-only',
      CLASHKING_LOCAL_PRODUCTION_READS:'0'},stdio:['ignore','pipe','pipe']})
  api.stdout.on('data',d=>logs+=d);api.stderr.on('data',d=>logs+=d)
  let ready=false
  for(let i=0;i<120;i++) {
    if(api.exitCode!==null)throw Error(`Local API exited: ${logs.slice(-2000)}`)
    try {ready=(await fetch(`http://127.0.0.1:${port}/v2/health`)).ok}catch{}
    if(ready)break
    await new Promise(r=>setTimeout(r,500))
  }
  assert(ready,logs.slice(-2000))
  const endpoint=(extra='')=>`http://127.0.0.1:${port}/v2/stats/legend/performance?time[after]=${first}&time[before]=${last}${extra}`
  const response=await fetch(endpoint());const body=await response.json()
  assert.equal(response.status,200,JSON.stringify(body))
  assert.equal(body.cohort,'legend_i')
  assert.deepEqual(body.availability,{firstDay:prior,lastDay:date(4)},'Availability describes real stored dates, not the requested window')
  const selected=body.periods.find(p=>p.kind==='selected')
  assert.equal(selected.expectedDays,3);assert.equal(selected.availableDays,2)
  assert.equal(selected.offense.completePlayerDays,3);assert.equal(selected.offense.perfectPlayerDays,2)
  assert.equal(selected.perfectOffensePlayers,1)
  assert.equal(selected.offense.perfectDayRate,2/3,'Must weight player-days, not average daily rates')
  assert.equal(selected.offense.meanTrophies,640/3)
  assert.equal(selected.offense.buckets[15].playerDays,2);assert.equal(selected.offense.buckets[0].playerDays,1)
  assert.equal(selected.defense.completePlayerDays,1);assert.equal(selected.defense.missingPlayerDays,2)
  assert.equal(selected.defense.meanTrophies,320)
  assert.deepEqual(body.perfectDayContributions,[
    {rankBand:'1_200',offensePlayerDays:1,defensePlayerDays:1},
    {rankBand:'201_1000',offensePlayerDays:0,defensePlayerDays:0},
    {rankBand:'1001_plus',offensePlayerDays:1,defensePlayerDays:0},
  ])
  for(const period of body.periods.slice(1)){assert.equal(period.availableDays,1);assert.equal(period.offense.meanTrophies,160)}
  assert.equal(body.items.length,2);assert(body.items.every(item=>item.sourceWindowStart.endsWith('05:00:00.000Z')))
  const top=await (await fetch(endpoint('&cohort=top_200'))).json()
  assert.equal(top.periods[0].offense.completePlayerDays,1)
  assert.deepEqual(top.availability,{firstDay:prior,lastDay:first},'Availability excludes empty cohort placeholders')
  assert.deepEqual(top.perfectDayContributions,body.perfectDayContributions,'Contribution bands remain global and disjoint')
  assert.equal((await fetch(endpoint('&cohort=bad'))).status,400)
  assert.equal((await fetch(endpoint('&cohort=top_200&cohort=top_1000'))).status,400)
  const empty=await (await fetch(`http://127.0.0.1:${port}/v2/stats/legend/performance?time[after]=${date(200)}&time[before]=${date(200)}`)).json()
  assert.deepEqual(empty.availability,body.availability,'Empty selected window still advertises where real data exists')
  assert.equal(empty.periods[0].availableDays,0);assert.equal(empty.periods[0].offense.meanTrophies,null)
  assert.equal(empty.periods[0].offense.perfectDayRate,null);assert.equal(empty.items.length,0)
  if(process.env.CLASHKING_E2E_APP_REPO) {
    const appCheck=spawn(process.execPath,[resolve(process.env.CLASHKING_E2E_APP_REPO,'scripts/e2e/legend-performance.mjs')],{
      stdio:'inherit',env:{...process.env,CLASHKING_E2E_API_REPO:process.cwd(),CLASHKING_E2E_BASE_URL:`http://127.0.0.1:${port}`,CLASHKING_E2E_FIRST_DAY:first,CLASHKING_E2E_LAST_DAY:last},
    })
    const [code]=await once(appCheck,'exit');assert.equal(code,0,'App data path failed')
  }
  // Previously stored 05:10 summaries must disappear until recalculated;
  // otherwise changing the reader's date math would silently mix day definitions.
  await db.query("UPDATE legend_day_performance SET source_window_start=source_window_start+interval '10 minutes',source_window_end=source_window_end+interval '10 minutes' WHERE day=$1",[first])
  const oldWindow=await(await fetch(endpoint())).json()
  assert.equal(oldWindow.periods[0].availableDays,1)
  const oldTop=await(await fetch(endpoint('&cohort=top_200'))).json()
  assert.deepEqual(oldTop.availability,{firstDay:prior,lastDay:prior},'Old provenance is not advertised as available')
  assert.equal(oldWindow.periods[0].offense.perfectPlayerDays,1)
  assert.equal(oldWindow.perfectDayContributions[0].offensePlayerDays,0)
  await db.query("UPDATE legend_day_performance SET source_window_start=source_window_start-interval '10 minutes',source_window_end=source_window_end-interval '10 minutes' WHERE day=$1",[first])
  assert.equal((await fetch(`http://127.0.0.1:${port}/v2/stats/legend/performance?time[after]=${first}T05:10:00Z&time[before]=${last}T05:10:00Z`)).status,400)
  assert.equal((await fetch(`http://127.0.0.1:${port}/v2/stats/legend/performance?time[after]=${first}T05:00:00Z&time[before]=${last}T05:00:00Z`)).status,200)
  for(const timestamp of [`${first}T04:59:59Z`,`${first}T05:00:00Z`,`${first}T05:09:59Z`,`${date(4)}T05:00:00Z`]) {
    await db.query(`INSERT INTO battles_ranked(player_tag,opponent_tag,battle_time,direction,battle_mode,player_town_hall,opponent_town_hall,stars,destruction_percentage,duration_seconds,looted_resources)
      VALUES('#PYP','#QQQ',$1,1,2,18,18,3,100,120,'{}')`,[timestamp])
  }
  const dayResponse=await fetch(`http://127.0.0.1:${port}/v2/legends/days`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({day:first,tags:['#PYP']})})
  const dayBody=await dayResponse.json()
  assert.equal(dayResponse.status,200,JSON.stringify(dayBody))
  assert.equal(dayBody.items[0].attacks,2,'05:00 and 05:09 belong to the same new game day')
  assert.equal(dayBody.items[0].attackTrophies,80)
  await db.query("UPDATE legend_day_performance SET source_window_start=source_window_start+interval '10 minutes',source_window_end=source_window_end+interval '10 minutes'")
  const noValid=await(await fetch(endpoint())).json()
  assert.equal(noValid.availability,undefined,'No valid cohort summaries must not invent an available date')
  await db.query("UPDATE legend_day_performance SET source_window_start=source_window_start-interval '10 minutes',source_window_end=source_window_end-interval '10 minutes'")
  // A saved aggregate without matching retained player observations must not
  // falsely turn two perfect player-days into zero distinct perfect players.
  await db.query('UPDATE legend_rankings_history SET observed_attack_triples=0 WHERE tag=$1',['#PYP'])
  const mismatch=await(await fetch(endpoint())).json()
  assert.equal(mismatch.periods[0].perfectOffensePlayers,null)
  console.log('PASS: real local API/Timescale; weighted periods, distinct players, disjoint rank bands, coverage, source windows, cohorts, query validation and missing observation reconciliation')
} finally {
  if(api&&api.exitCode===null){api.kill('SIGTERM');await Promise.race([once(api,'exit'),new Promise(r=>setTimeout(r,5000))]);if(api.exitCode===null)api.kill('SIGKILL')}
  await db.end()
}
