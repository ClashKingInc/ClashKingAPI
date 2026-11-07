import { verifyRosterWarFilter } from "./roster-war-filter.mjs"
import { verifyPublicDashboardCors } from "./public-dashboard-cors.mjs"
import { verifyOperationalReads } from "./operational-reads.mjs"
import { verifyEmailLookupKey } from './email-lookup-key.mjs'
import { verifyCappedClanRankings } from "./capped-clan-rankings.mjs"
import { verifyManualRefreshTargets } from "./manual-refresh-targets.mjs"
import { verifyGuildListCache } from "./guild-list-cache.mjs"
import { verifyAccountAvatars } from "./account-avatar.mjs"
import { startBotCustomizationProvider } from "./bot-customization-provider.mjs"
import { verifyManualLimits } from "./manual-limits.mjs"
import { verifyScopedDashboardAccess } from "./scoped-dashboard-access.mjs"
// Real local workerd -> API -> canonical disposable Timescale. Fixtures are
// stored observations, never mocked HTTP responses or production writes.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
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
const profileProvider=await startBotCustomizationProvider()
const encryptionKey = randomBytes(32).toString('base64url')
const signingKey = randomBytes(32).toString('base64url')
const emailLookupKey = randomBytes(32).toString('base64url')
const meteringKey = randomBytes(32).toString('base64url')
const botKey = randomBytes(32).toString('base64url')
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
    env:{...process.env,CLASHKING_LOCAL_DISCORD_TEST_ORIGIN:profileProvider.origin,CLASHKING_LOCAL_DISCORD_BOT_TOKEN:"local-discord-token",CLASHKING_LOCAL_ADMIN_IDENTITY:"1",CLASHKING_LOCAL_ADMIN_PORT:"8804",CLASHKING_E2E_DATA_ENCRYPTION_KEY:encryptionKey,CLASHKING_E2E_AI_USAGE_SECRET:meteringKey,CLASHKING_E2E_JWT_ACCESS_SECRET:signingKey,CLASHKING_E2E_EMAIL_HASH_SECRET:emailLookupKey,CLASHKING_E2E_API_BOT_TOKEN:botKey,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',
      CLASHKING_LOCAL_DISCORD_CLIENT_ID:'999999999999999999',CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local-only',
      CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_LOCAL_STATIC_ASSETS_ROOT:process.env.CLASHKING_E2E_STATIC_ASSETS_ROOT??resolve('../clashking_assets/assets/static_data')},stdio:['ignore','pipe','pipe']})
  api.stdout.on('data',d=>logs+=d);api.stderr.on('data',d=>logs+=d)
  let ready=false
  for(let i=0;i<120;i++) {
    if(api.exitCode!==null)throw Error(`Local API exited: ${logs.slice(-2000)}`)
    try {ready=(await fetch(`http://127.0.0.1:${port}/v2/health`, { signal: AbortSignal.timeout(2000) })).ok}catch{}
    ready=ready&&logs.includes('isolated_api_ready')
    if(ready)break
    await new Promise(r=>setTimeout(r,500))
  }
  assert(ready,logs.slice(-2000))
  await verifyPublicDashboardCors({origin:`http://127.0.0.1:${port}`})
  await verifyOperationalReads({db,origin:`http://127.0.0.1:${port}`,botKey})
  await verifyRosterWarFilter({db,origin:`http://127.0.0.1:${port}`,botKey})
  await verifyEmailLookupKey({db,origin:`http://127.0.0.1:${port}`,signingKey,emailLookupKey})
  await verifyCappedClanRankings({db,origin:`http://127.0.0.1:${port}`})
  await verifyManualRefreshTargets({db,origin:`http://127.0.0.1:${port}`,botKey})
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
  // Raw Legend observations work without ranking snapshots. Finished days
  // require exactly eight battles; current-day observations stay separate.
  const rawTags = ['#P0Q', '#P0R', '#P0Y']
  const addBattles = async (tag, day, count, direction=1, tripleCount=count) => {
    for (let index=0; index<count; index++) {
      await db.query(`INSERT INTO battles_ranked(player_tag,opponent_tag,battle_time,direction,battle_mode,player_town_hall,opponent_town_hall,stars,destruction_percentage,duration_seconds,looted_resources)
        VALUES($1,'#QQQ',$2::date+interval '6 hours'+$3::integer*interval '1 minute'+$4::integer*interval '1 second',$4,2,18,18,$5,$6,120,CASE WHEN $4=1 THEN '{}'::jsonb ELSE NULL END)`,
        [tag,day,index,direction,index<tripleCount?3:2,index<tripleCount?100:80])
    }
  }
  await addBattles(rawTags[0],first,8)
  await addBattles(rawTags[1],first,7)
  await addBattles(rawTags[2],first,9)
  await addBattles(rawTags[0],first,8,2)
  await addBattles(rawTags[0],date(4),8)
  const currentStart=new Date(Math.floor((Date.now()-5*3600000)/86400000)*86400000+5*3600000)
  // Use times after the game-day boundary and before now even just after 05:00.
  for(let index=0;index<3;index++) await db.query(`INSERT INTO battles_ranked(player_tag,opponent_tag,battle_time,direction,battle_mode,player_town_hall,opponent_town_hall,stars,destruction_percentage,duration_seconds,looted_resources)
    VALUES($1,'#QQQ',$2::timestamptz+$3::integer*interval '1 millisecond',1,2,18,18,$4,$5,120,'{}')`,
    [rawTags[0],currentStart.toISOString(),index,index<2?3:2,index<2?100:80])
  for(let index=0;index<9;index++) await db.query(`INSERT INTO battles_ranked(player_tag,opponent_tag,battle_time,direction,battle_mode,player_town_hall,opponent_town_hall,stars,destruction_percentage,duration_seconds,looted_resources)
    VALUES($1,'#QQQ',$2::timestamptz+$3::integer*interval '1 millisecond',1,2,18,18,3,100,120,'{}')`,[rawTags[2],currentStart.toISOString(),index])
  // Completed-day fixtures exercise the real stored-summary API contract.
  // Raw battle edits must not change published days until Tracking rebuilds them.
  const bucket = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1]
  for (const [day,direction,population,observedCount,complete,invalid,battles] of [
    [first,1,3,3,1,1,15], [first,2,3,1,1,0,8], [date(4),1,1,1,1,0,8], [date(4),2,1,0,0,0,0],
  ]) await db.query(`INSERT INTO legend_observed_daily_stats
    (day,direction,source_window_start,source_window_end,eligible_player_count,observed_player_count,
     complete_player_count,invalid_player_count,observed_battle_count,observed_triple_count,
     perfect_player_count,complete_trophy_sum,trophy_buckets,star_counts,destruction_sum,duration_sum,attack_types)
    VALUES ($1,$2,$1::date+interval '5 hours',$1::date+interval '29 hours',$3,$4,$5,$6,$7::bigint,$7::bigint,$5,$5*320,$8,$9,$7::bigint*100,$7::bigint*120,$9)`,
    [day,direction,population,observedCount,complete,invalid,battles,complete?bucket:Array(16).fill(0),[0,0,0,battles]])
  const observedResponse=await fetch(endpoint('&cohort=observed'))
  const observed=await observedResponse.json()
  assert.equal(observedResponse.status,200,JSON.stringify(observed))
  assert.equal(observed.cohort,'observed')
  assert.deepEqual(observed.availability,{firstDay:first,lastDay:date(4)})
  const observedPeriod=observed.periods[0]
  assert.equal(observedPeriod.availableDays,2)
  assert.equal(observedPeriod.offense.eligiblePlayerDays,4)
  assert.equal(observedPeriod.offense.completePlayerDays,2)
  assert.equal(observedPeriod.offense.partialPlayerDays,1)
  assert.equal(observedPeriod.offense.invalidPlayerDays,1)
  assert.deepEqual(observedPeriod.offense.starCounts,[0,0,0,23])
  assert.equal(observedPeriod.offense.averageStars,3)
  assert.equal(observedPeriod.offense.averageDestruction,100)
  assert.equal(observedPeriod.offense.averageDuration,120)
  assert.deepEqual(observedPeriod.offense.attackTypes,{air:0,ground:0,mixed:0,unknown:23})
  const compositions = [
    ['observed-air',[{id:4000008,quantity:1}]],
    ['observed-ground',[{id:4000000,quantity:20}]],
    ['observed-mixed',[{id:4000000,quantity:20},{id:4000008,quantity:1}]],
    ['observed-unknown',[{id:4999999,quantity:1}]],
  ]
  for(const [index,[code,troops]] of compositions.entries()) {
    await db.query('INSERT INTO army_compositions(share_code,main_troops) VALUES($1,$2)',[code,JSON.stringify(troops)])
    await db.query(`UPDATE battles_ranked SET share_code=$1 WHERE player_tag=$2 AND direction=1
      AND battle_time=$3::date+interval '6 hours'+$4::integer*interval '1 minute'+interval '1 second'`,[code,rawTags[0],first,index])
  }
  const beforeRebuild=await(await fetch(endpoint('&cohort=observed'))).json()
  assert.deepEqual(beforeRebuild.periods[0].offense.attackTypes,{air:0,ground:0,mixed:0,unknown:23},'Historical raw changes cannot bypass the completed summary')
  await db.query("UPDATE legend_observed_daily_stats SET attack_types=ARRAY[1,1,1,12]::bigint[] WHERE day=$1 AND direction=1",[first])
  const classified=await(await fetch(endpoint('&cohort=observed'))).json()
  const fast=await(await fetch(endpoint('&cohort=observed&compare=false'))).json()
  assert.equal(fast.periods.length,1)
  const noTypes=await(await fetch(endpoint('&cohort=observed&compare=false&armyTypes=false'))).json()
  assert.equal(noTypes.periods[0].offense.attackTypes,undefined)
  assert.deepEqual(noTypes.periods[0].offense.starCounts,fast.periods[0].offense.starCounts)
  assert.equal((await fetch(endpoint('&cohort=observed&armyTypes=invalid'))).status,400)
  assert.deepEqual(fast.periods[0],classified.periods[0],'Skipping unused baseline periods preserves selected metrics exactly')
  assert.equal((await fetch(endpoint('&cohort=observed&compare=invalid'))).status,400)
  assert.equal((await fetch(endpoint('&cohort=observed&compare=false&compare=true'))).status,400)
  assert.deepEqual(classified.periods[0].offense.attackTypes,{air:1,ground:1,mixed:1,unknown:20},'Main-troop housing classification preserves unknown metadata and missing compositions')
  assert.equal(observedPeriod.offense.observedBattles,23,'More than eight observations cannot inflate the valid battle denominator')
  assert.equal(observedPeriod.offense.perfectPlayerDays,2)
  assert.equal(observedPeriod.perfectOffensePlayers,null,'Observed population does not invent distinct ranked players')
  assert.equal(observedPeriod.offense.buckets[15].playerDays,2)
  assert.equal(observedPeriod.defense.completePlayerDays,1)
  assert.equal(observedPeriod.defense.missingPlayerDays,3)
  assert.deepEqual(observed.perfectDayContributions,[],'Unranked observations must not invent rank bands')
  assert.equal(observed.items.length,2,'The unfinished day stays out of complete-day distributions')
  assert.equal(observed.currentDay,undefined,'Historical selections must not include today in client totals')
  const currentObserved=await(await fetch(`http://127.0.0.1:${port}/v2/stats/legend/performance?cohort=observed&time[after]=${first}&time[before]=${currentStart.toISOString().slice(0,10)}`)).json()
  assert.equal(currentObserved.currentDay.day,currentStart.toISOString().slice(0,10))
  assert.equal(currentObserved.currentDay.offense.battles,3)
  assert.equal(currentObserved.currentDay.offense.triples,2)
  assert.deepEqual(currentObserved.currentDay.offense.starCounts,[0,0,1,2])
  assert.equal(currentObserved.currentDay.offense.averageStars,8/3)
  assert.equal(currentObserved.currentDay.offense.averageDestruction,280/3)
  assert.equal(currentObserved.currentDay.offense.averageDuration,120)
  assert.equal(currentObserved.currentDay.offense.tripleRate,2/3)
  assert.equal(currentObserved.currentDay.defense.battles,0)
  assert.equal((await(await fetch(endpoint('&cohort=top_200'))).json()).periods[0].offense.completePlayerDays,1,'Raw data never changes the genuine ranked cohort')
  assert.equal((await fetch(endpoint('&cohort=observed&cohort=observed'))).status,400)
  assert.equal((await fetch(`http://127.0.0.1:${port}/v2/stats/legend/performance?cohort=observed&time[after]=${date(100)}&time[before]=${last}`)).status,400)
  if(process.env.CLASHKING_E2E_APP_REPO) {
    const appCheck=spawn(process.execPath,[resolve(process.env.CLASHKING_E2E_APP_REPO,'scripts/e2e/legend-performance.mjs')],{
      stdio:'inherit',env:{...process.env,CLASHKING_E2E_OBSERVED:'1',CLASHKING_E2E_API_REPO:process.cwd(),CLASHKING_E2E_BASE_URL:`http://127.0.0.1:${port}`,CLASHKING_E2E_FIRST_DAY:first,CLASHKING_E2E_LAST_DAY:last},
    })
    const [code]=await once(appCheck,'exit');assert.equal(code,0,'App observed data path failed')
  }
  await db.query('DELETE FROM battles_ranked WHERE player_tag=ANY($1::text[])',[rawTags])
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
  const userId='999999999999994801', serverId='999999999999994802'
  await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[userId])
  await db.query("INSERT INTO servers(id,name) VALUES($1,'Release E2E')",[serverId])
  const permissions={full_access:false,sections:{}}
  const grant=(await db.query("INSERT INTO dashboard_access_grants(token_hash,user_id,server_id,source,permissions) VALUES($1,$2,$3,'bot',$4) RETURNING id",[randomUUID(),userId,serverId,permissions])).rows[0].id
  const session=(await db.query("INSERT INTO dashboard_scoped_sessions(grant_id,user_id,server_id,permissions,refresh_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour') RETURNING id",[grant,userId,serverId,permissions,randomUUID()])).rows[0].id
  const token=await new SignJWT({dashboard_session:session}).setProtectedHeader({alg:'HS256'}).setSubject(userId).setAudience('clashking-server-dashboard').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signingKey))
  assert.equal((await fetch(endpoint('&cohort=observed&compare=false'),{headers:{authorization:`Bearer ${token}`}})).status,200,'A scoped session can read public statistics')
  assert.equal((await fetch(`http://127.0.0.1:${port}/v2/auth/export`,{headers:{authorization:`Bearer ${token}`}})).status,403,'Scoped sessions cannot export the unrestricted account')
  const userToken=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(userId).setAudience('clashking-native').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signingKey))
  await db.query("INSERT INTO home_layouts(user_id) VALUES($1)",[userId])
  await db.query("INSERT INTO home_items(user_id,id,kind,size,position) VALUES($1,'todo','todo','wide',0)",[userId])
  await db.query("INSERT INTO user_settings(user_id,app) VALUES($1,'{\"private_mode\":true}')",[userId])
  await db.query("INSERT INTO user_bookmarks(user_id,entity_type,tag,order_index,war_notifications_enabled) VALUES($1,'clan','#PYLQRRJC',0,true)",[userId])
  await db.query("INSERT INTO user_saved_armies(user_id,share_code,name,notes) VALUES($1,'observed-air','My army','My notes')",[userId])
  const exportedResponse=await fetch(`http://127.0.0.1:${port}/v2/auth/export`,{headers:{authorization:`Bearer ${userToken}`}})
  const exported=await exportedResponse.json()
  assert.equal(exportedResponse.status,200,JSON.stringify(exported))
  assert.equal(exported.saved_armies[0].name,'My army')
  assert.equal(exported.saved_armies[0].notes,'My notes')
  assert.equal(exported.home_items[0].id,'todo')
  assert.equal(exported.home_layouts.length,1)
  assert.equal(exported.dashboard_sessions[0].server_id,serverId)
  assert.equal(exported.legacy_search_settings[0].private_mode,true)
  assert.equal(exported.bookmarks[0].war_notifications_enabled,true)
  const serialized=JSON.stringify(exported)
  assert(!serialized.includes('refresh_hash')&&!serialized.includes('token_hash')&&!serialized.includes('pkce_challenge'),'Exports must not disclose authentication material')
  await verifyAccountAvatars({db,origin:`http://127.0.0.1:${port}`,signingKey})
  await verifyScopedDashboardAccess({db,origin:`http://127.0.0.1:${port}`,signingKey,applicationId:'999999999999999999',botKey,meteringKey})
  await verifyGuildListCache({db,origin:`http://127.0.0.1:${port}`,signingKey,encryptionKey,provider:profileProvider})
  await verifyManualLimits({db,origin:`http://127.0.0.1:${port}`,adminOrigin:'http://127.0.0.1:8804',signingKey,meteringKey,profileProvider})
  // The running API must not depend on retired permanent-family tables. Rename
  // them only inside this disposable fixture while retaining their rows.
  for (const table of ['army_family_daily_stats','army_family_members','army_families']) {
    await db.query(`ALTER TABLE ${table} RENAME TO retired_${table}`)
  }
  for (const path of [
    `/v2/player/%23PYP/legend/${first}/battlelog`,
    `/v2/player/%23PYP/battlelog/history?time[after]=${first}&time[before]=${last}`,
  ]) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`)
    const result = await response.json()
    assert.equal(response.status,200,JSON.stringify(result))
    assert.ok(!JSON.stringify(result).includes('familyId'),'Retired numeric family IDs are absent')
  }
  await db.query(`INSERT INTO legend_daily_stats(day,cohort,attack_count,distinct_player_count,zero_star_count,one_star_count,two_star_count,three_star_count,destruction_percentage_sum,duration_seconds_sum,classified_army_attacks)
    VALUES($1,'legend_i',10,2,0,0,0,10,1000,1200,10) ON CONFLICT(day,cohort) DO UPDATE SET classified_army_attacks=10`,[first])
  await db.query(`INSERT INTO army_setup_daily_stats(day,league_tier_id,group_key,core_troops,representative_share_code,attack_count,zero_star_count,one_star_count,two_star_count,three_star_count,destruction_percentage_sum)
    VALUES($1,105000036,'[4000008]',ARRAY[4000008],'u1x8',10,0,0,0,10,1000)`,[first])
  const groupsResponse = await fetch(`http://127.0.0.1:${port}/v2/stats/army-setups?time[after]=${first}&time[before]=${first}`)
  const groups = await groupsResponse.json()
  assert.equal(groupsResponse.status,200,JSON.stringify(groups))
  assert.equal(groups.items[0].groupKey,'[4000008]')
  assert.equal(groups.items[0].attacks,10)
  console.log('PASS: actual API battle history and daily army-group reads with legacy family tables unavailable')
  console.log('PASS: real local API/Timescale; weighted periods, distinct players, disjoint rank bands, coverage, source windows, cohorts, query validation and missing observation reconciliation, unranked observed cohorts and partial current day')
} finally {
  if(api&&api.exitCode===null){api.kill('SIGTERM');await Promise.race([once(api,'exit'),new Promise(r=>setTimeout(r,5000))]);if(api.exitCode===null)api.kill('SIGKILL')}
  await profileProvider.close()
  await db.end()
}
