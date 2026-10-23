// Real API HTTP and PostgreSQL integration. Only uniquely scoped local fixture
// rows are written. No external provider or mocked application is involved.
import pg from 'pg'
import {SignJWT} from 'jose'
import {randomBytes,randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import assert from 'node:assert/strict'
const {verifyTournamentBot}=await import(new URL('../../../clashking_bot/tooling/e2e/tournament-bot.mjs',import.meta.url))
const connection='postgres://clashking_local:clashking_local@127.0.0.1:54330/clashking_dev'
const db=new pg.Client({connectionString:connection});await db.connect()
const server='999999999999994803',actor='999999999999994802',other='999999999999994804',clan='#PYLQRYQP',tags=['#PYLQRYQG','#PYLQRYQJ','#PYLQRYQC','#PYLQRYQU','#PYLQRYQ0','#PYLQRYQ2','#PYLQRYQ9','#PYLQRYQ8']
const enemy='#PYLQRYQL'
const clanTags=[clan,enemy,'#PYLQRYQV','#PYLQRYQR']
const app='999999999999994801',role='999999999999994805'
const origin='http://127.0.0.1:8799',directory=mkdtempSync(join(tmpdir(),'ck-competitive-'))
const keys=Object.fromEntries(['DATA_ENCRYPTION_KEY','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','API_BOT_TOKEN','AI_USAGE_SECRET','STRIPE_WEBHOOK_SECRET'].map(key=>[key,randomBytes(32).toString('base64url')]))
const token=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(actor).setAudience('clashking-web').setIssuedAt().setExpirationTime('20m').sign(new TextEncoder().encode(keys.JWT_ACCESS_SECRET))
const foreign=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(other).setAudience('clashking-web').setIssuedAt().setExpirationTime('20m').sign(new TextEncoder().encode(keys.JWT_ACCESS_SECRET))
let child,logs='',seeded=false,warId
const checks=[]
async function req(path,method='GET',data,expected=200,auth=keys.API_BOT_TOKEN){
 const response=await fetch(origin+path,{method,headers:{authorization:`Bearer ${auth}`,...(data===undefined?{}:{'content-type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})}).catch(cause=>{throw new Error(`Local competitive E2E request failed: ${method} ${path}`,{cause})})
 const value=await response.json();assert.equal(response.status,expected,`${path}: ${JSON.stringify(value)}`);return value
}
const base=`/v2/competitive/servers/${server}`
const checkTournamentBadge=async(auth)=>{const result=await req('/v2/achievements/check','POST',{},200,auth);const badge=result.items.find(item=>item.id==='first_tournament');assert(badge,'Tournament badge must be in the authoritative catalog');assert.equal(badge.asset_url,'bundled:first_tournament');assert.equal(badge.repeatable,true);return badge}
try{
 assert.equal((await db.query('SELECT 1 FROM auth_users WHERE user_id=ANY($1::text[])',[[actor,other]])).rowCount,0,'Fixture users already exist')
 assert.equal((await db.query('SELECT 1 FROM basic_clan WHERE tag=ANY($1::text[])',[clanTags])).rowCount,0,'Fixture clan exists')
 assert.equal((await db.query('SELECT 1 FROM basic_player WHERE tag=ANY($1::text[])',[tags])).rowCount,0,'Fixture players exist')
 await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord'),($2,'discord')",[actor,other]);seeded=true
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Competitive E2E')",[server])
 const generation=randomUUID();await db.query('INSERT INTO discord_cache.gateway_shards(application_id,shard_id,shard_count,generation,healthy,heartbeat_at) VALUES($1,0,1,$2,true,now())',[app,generation])
 await db.query('INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete) VALUES($1,$2,$3,0,$4,true,true,true)',[server,JSON.stringify({owner_id:other}),app,generation])
 await db.query('INSERT INTO discord_cache.members(guild_id,user_id,data) VALUES($1,$2,$3)',[server,actor,JSON.stringify({roles:[role]})])
 for(const tag of clanTags){
  await db.query("INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received) VALUES($1,'Public Clan',true,0,4,'local',0,0)",[tag])
  await db.query('INSERT INTO server_clans(tag,server_id) VALUES($1,$2)',[tag,server])
  await db.query("INSERT INTO server_clan_verifications(server_id,clan_tag,challenge_id,marker,marker_index,requested_by,state,check_after,next_check_at,expires_at,verified_at) VALUES($1,$2,$3,'appleck',0,$4,'verified',now()+interval '2 minutes',now(),now()+interval '1 day',now())",[server,tag,randomUUID(),actor])
 }
 for(const tag of tags){await db.query("INSERT INTO basic_player(tag,name,townhall_level,clan_tag) VALUES($1,'Verified attacker',16,$2)",[tag,clan]);await db.query("INSERT INTO player_links(tag,is_verified,source,user_id) VALUES($1,true,'clashking',$2)",[tag,actor])}
 const env={...process.env,CLASHKING_PERSISTENT_LOCAL_API:'1',CLASHKING_LOCAL_DATABASE_URL:connection,CLASHKING_LOCAL_API_PORT:'8799',CLASHKING_LOCAL_CUSTOM_ORIGINS:'1',CLASHKING_LOCAL_PUBLIC_ORIGIN:'https://local-api.clashk.ing',CLASHKING_LOCAL_DISCORD_CLIENT_ID:'999999999999994801',CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local-only',CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_CLASH_PROXY_ORIGIN:'http://127.0.0.1:65534',CLASHKING_LOCAL_STORAGE_ROOT:directory,...Object.fromEntries(Object.entries(keys).map(([key,value])=>[`CLASHKING_LOCAL_${key}`,value]))}
 child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{cwd:new URL('../../',import.meta.url),env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d)
 for(let i=0;i<300;i++){try{if((await fetch(origin+'/v2/health')).ok)break}catch{}if(i===299)throw Error(logs.slice(-3000));await new Promise(resolve=>setTimeout(resolve,100))}
 assert.equal((await checkTournamentBadge(token)).earned_count,0)
 if(process.env.CLASHKING_E2E_LIVE_CCN==='1'){
  const [ccn,parallel]=await Promise.all([req('/v2/esports/ccn/events'),req('/v2/esports/ccn/events')]);assert.equal(ccn.source,'ccn');assert(Array.isArray(ccn.data));assert(ccn.data.length>0);assert.equal(parallel.fetchedAt,ccn.fetchedAt)
  const cached=await req('/v2/esports/ccn/events');assert.equal(cached.fetchedAt,ccn.fetchedAt)
  const leaderboard=await req('/v2/esports/ccn/leaderboard?segmentId=111');assert.equal(leaderboard.source,'ccn');assert(Array.isArray(leaderboard.data));assert(leaderboard.data.some(team=>typeof team.ccn_elo_points==='number'))
  const standings=await req('/v2/esports/ccn/standings?segmentId=99');assert(Array.isArray(standings.data));assert(standings.data.some(team=>typeof team.rank==='number'&&typeof team.points==='number'))
  checks.push('actual local API outbound adapter reaches live public CCN events')
 }
 await req(base+'/teams','POST',{clanTag:clan,internalName:'Forbidden team',size:2},403,token)
 await req(base+'/permissions','PUT',{items:[{roleId:role,permission:'teams'}]})
 const allowed=await req(base+'/teams','POST',{clanTag:clan,internalName:'Scoped permission team',size:3},200,token)
 await req(base+'/tournaments','POST',{name:'Forbidden tournament',format:'elo',teamSize:2,startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+86400000).toISOString()},403,token)
 await req(base+'/permissions','PUT',{items:[]})
 await req(base+`/teams/${allowed.id}`,'PUT',{internalName:'Revoked permission'},403,token)
 await req(base+`/teams/${allowed.id}`,'PUT',{archived:true})
 checks.push('live cached Discord role fine permission, unrelated mutation denied, grant revocation immediate')
 const unnamedProfile=await req('/v2/competitive/profile','PUT',{avatarUrl:null,bannerUrl:null,private:true},200,foreign)
 assert(unnamedProfile.private);assert.equal(unnamedProfile.hideDiscord,false)
 await req(`/v2/competitive/profiles/${other}`,'GET',undefined,404)
 await req('/v2/competitive/profile','PUT',{displayName:'No linked accounts',avatarUrl:null,bannerUrl:null,private:true,hideDiscord:true},200,foreign)
 checks.push('profile saves without display name or handle setting; private ID links remain inaccessible')
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64')
 const uploadForm=new FormData();uploadForm.append('file',new Blob([png],{type:'image/png'}),'avatar.png')
 const uploaded=await fetch(origin+'/v2/competitive/profile/image',{method:'POST',headers:{authorization:`Bearer ${foreign}`},body:uploadForm});assert.equal(uploaded.status,400)
 await req('/v2/competitive/profile','PUT',{avatarUrl:'https://example.com/custom.png',private:true},200,foreign)
 const savedImage=await req('/v2/competitive/profile','PUT',{private:true},200,foreign);assert.equal(savedImage.avatarUrl,null);assert.equal(savedImage.bannerUrl,null)
 const badForm=new FormData();badForm.append('file',new Blob([png],{type:'image/jpeg'}),'spoof.jpg')
 const badImage=await fetch(origin+'/v2/competitive/profile/image',{method:'POST',headers:{authorization:`Bearer ${foreign}`},body:badForm});assert.equal(badImage.status,400)
 const linkedBadge=await req('/v2/achievements/check','POST',{},200,token)
 assert.equal(linkedBadge.items.find(item=>item.id==='verified_accounts').earned_count,1)
 assert.equal(linkedBadge.items.find(item=>item.id==='verified_accounts').repeatable,false)
 const unlinkedBadge=await req('/v2/achievements/check','POST',{},200,foreign)
 assert.equal(unlinkedBadge.items.find(item=>item.id==='verified_accounts').earned_count,0)
 assert.equal((await req('/v2/competitive/profile','GET',undefined,200,token)).verifiedAccountCount,tags.length)
 checks.push('custom uploads rejected and legacy image URLs ignored; profile saves without image fields; verified-account badge follows actual server links')
 await req(`/v2/competitive/profiles/${other}`,'GET',undefined,404)
 checks.push('profile without links and private404')
 const teamIds=[]
 for(let index=0;index<4;index++){
  const {id}=await req(base+'/teams','POST',{clanTag:clanTags[index],internalName:`Secret ${index}`,size:2});teamIds.push(id)
  for(const tag of tags.slice(index*2,index*2+2)){
   await req(base+`/teams/${id}/members`,'POST',{playerTag:tag})
   await req(`/v2/competitive/teams/${id}/join`,'POST',{playerTag:tag},403,foreign)
   await req(`/v2/competitive/teams/${id}/join`,'POST',{playerTag:tag},200,token)
  }
 }
 const sibling=await req(base+'/teams','POST',{clanTag:clan,internalName:'Secret sibling team',size:2})
 for(const playerTag of tags.slice(4,6)){await req(base+`/teams/${sibling.id}/members`,'POST',{playerTag});await req(`/v2/competitive/teams/${sibling.id}/join`,'POST',{playerTag},200,token)}
 const publicTeams=await req('/v2/competitive/clans/'+encodeURIComponent(clan)+'/teams');assert.equal(publicTeams.items.length,2);assert(!JSON.stringify(publicTeams).includes('Secret'));checks.push('multiple clan teams private labels and verified owner consent')
 assert.equal((await db.query("SELECT count(*)::int count FROM achievement_player_awards WHERE achievement_id='first_tournament' AND player_tag=ANY($1::text[])",[tags])).rows[0].count,0)
 for(const format of ['single_elimination','double_elimination','round_robin','swiss','elo']){
  const {id}=await req(base+'/tournaments','POST',{name:`Local ${format.replaceAll('_',' ')}`,format,teamSize:2,startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:new Date(Date.now()+7*86400000).toISOString(),rules:{description:'Free local event',minTownHall:16,maxTownHall:16,maxRosterSize:2}})
  await req(base+`/tournaments/${id}`,'PUT',{status:'registration'})
  for(const teamId of teamIds.slice(0,2)){await req(`/v2/competitive/tournaments/${id}/register`,'POST',{teamId},200,token);await req(`/v2/competitive/tournaments/${id}/check-in`,'POST',{teamId},200,token)}
  const sameClan=await req(`/v2/competitive/tournaments/${id}/register`,'POST',{teamId:sibling.id},400,token);assert.match(JSON.stringify(sameClan),/same clan/)
  if(format==='single_elimination'){
   // Simulate a pre-guard imported event: scheduling must also enforce the
   // clan invariant when registration did not run through the current API.
   await db.query('INSERT INTO competitive_participants(tournament_id,team_id,checked_in_at) VALUES($1,$2,now())',[id,sibling.id])
   const legacy=await req(base+`/tournaments/${id}/generate`,'POST',{},400);assert.match(JSON.stringify(legacy),/clan cannot fight itself/)
   const manual=await req(base+`/tournaments/${id}/matches`,'POST',{homeTeamId:teamIds[0],awayTeamId:sibling.id,round:1},400);assert.match(JSON.stringify(manual),/clan cannot play/)
   await req(base+`/tournaments/${id}/participants/${sibling.id}`,'DELETE')
  }
  if(format==='single_elimination')checks.push(...(await verifyTournamentBot({apiOrigin:origin,apiToken:keys.API_BOT_TOKEN,serverId:server,tournamentId:id,tournamentName:`Local ${format.replaceAll('_',' ')}`})).checks)
  await req(base+`/teams/${teamIds[0]}`,'PUT',{archived:true},400)
  const generated=await req(base+`/tournaments/${id}/generate`,'POST',{});assert.equal(generated.matches.length,1)
  if(format==='single_elimination'){
   const start=new Date(Date.now()-3600000),end=new Date(Date.now()-1800000),prep=new Date(Date.now()-86400000)
   warId=(await db.query("INSERT INTO wars(clan_tag,opponent_tag,prep_time,start_time,end_time,size,attacks_per_member,war_type,state,clan_stars,opponent_stars) VALUES($1,$2,$3,$4,$5,2,1,'friendly','inWar',6,2) RETURNING war_id",[clan,enemy,prep,start,end])).rows[0].war_id
   const side=(tag,players,stars)=>({tag,name:'Public Clan',badgeToken:'local',clanLevel:1,attacks:2,stars,destructionPercentage:stars===6?100:50,members:players.map((tag,index)=>({tag,name:'Observed attacker',townhallLevel:16,mapPosition:index+1,attacks:[{defenderTag:tags[(index+2)%4],stars:3,destructionPercentage:100,duration:100,order:index+1}]}))})
   const archivePayload=JSON.stringify({state:'warEnded',teamSize:2,attacksPerMember:1,preparationStartTime:prep.toISOString(),startTime:start.toISOString(),endTime:end.toISOString(),battleModifier:'none',clan:side(clan,tags.slice(0,2),6),opponent:side(enemy,tags.slice(2,4),2)})
   await db.query('INSERT INTO war_archive_pending(war_id,end_time,payload) VALUES($1,$2,$3)',[warId,end,archivePayload])
   await req(base+`/tournaments/${id}/sync`,'POST',{})
   assert.equal((await db.query("SELECT count(*)::int count FROM achievement_player_awards WHERE player_tag=ANY($1::text[])",[tags])).rows[0].count,0)
   await db.query("UPDATE wars SET state='warEnded' WHERE war_id=$1",[warId])
   await db.query('DELETE FROM war_archive_pending WHERE war_id=$1',[warId])
   await req(base+`/tournaments/${id}/sync`,'POST',{})
   assert.equal((await db.query("SELECT count(*)::int count FROM achievement_player_awards WHERE player_tag=ANY($1::text[])",[tags])).rows[0].count,0)
   const incorrectLineup=JSON.parse(archivePayload);incorrectLineup.clan.members[0].tag=tags[7]
   await db.query('INSERT INTO war_archive_pending(war_id,end_time,payload) VALUES($1,$2,$3)',[warId,end,JSON.stringify(incorrectLineup)])
   const rejectedLineup=await req(base+`/tournaments/${id}/sync`,'POST',{});assert.equal(rejectedLineup.updated,0)
   const unobserved=await req('/v2/competitive/profile','GET',undefined,200,token);assert.equal(unobserved.tournamentStats,null)
   await db.query('UPDATE war_archive_pending SET payload=$1 WHERE war_id=$2',[archivePayload,warId])
   await req(base+`/tournaments/${id}/sync`,'POST',{})
   const attackView=await req(`/v2/competitive/matches/${generated.matches[0]}/attacks`);assert.equal(attackView.items.length,4)
   const observedProfile=await req('/v2/competitive/profile','GET',undefined,200,token);assert.equal(observedProfile.tournamentStats.attacks,4);assert.equal(observedProfile.tournamentStats.triples,4);assert.equal(observedProfile.tournamentStats.hitRatePercent,100);assert.equal(observedProfile.statsAvailability.status,'available')
   await req(base+`/tournaments/${id}/sync`,'POST',{})
   const repeated=await req('/v2/competitive/profile','GET',undefined,200,token);assert.equal(repeated.tournamentStats.attacks,4)
   assert.equal((await checkTournamentBadge(token)).earned_count,4)
   assert.equal((await checkTournamentBadge(token)).earned_count,4)
   checks.push('actual achievement catalog includes bundled tournament model; zero to four verified-account lifetime awards; repeated check stable')
   checks.push('canonical war association, active/unobserved no award, delayed archive recovery, public attacks, idempotent profile attack summaries')
   checks.push('off-roster canonical war cannot decide a match or produce profile evidence; corrected frozen lineup accepted')
  }
  await req(base+`/matches/${generated.matches[0]}`,'PUT',{homeScore:3,awayScore:0,status:'completed',reason:'Local fixture score'})
  const detail=await req(`/v2/competitive/tournaments/${id}`);assert.equal(detail.matches[0].homeScore,3);assert.equal(detail.participants.find(item=>item.withdrawnAt===null).roster.length,2);assert.equal(detail.standings[0].wins,1)
  if(format==='double_elimination'){
   const next=await req(base+`/tournaments/${id}/generate`,'POST',{});assert.equal(next.matches.length,1)
   await req(base+`/matches/${next.matches[0]}`,'PUT',{homeScore:3,awayScore:0,status:'completed',reason:'Local grand final'})
  }
  if(format!=='elo'){const end=await req(base+`/tournaments/${id}/generate`,'POST',{});assert.equal(end.completed,true)}
  checks.push(`${format} HTTP registration/checkin/scheduling/result/standings`)
 }
 const audit=await req(base+'/audit');assert(audit.items.some(item=>item.action==='match.score'&&item.reason==='Local fixture score'))
 const awards=await db.query("SELECT count(*)::int AS count FROM achievement_player_awards WHERE achievement_id='first_tournament' AND player_tag=ANY($1::text[])",[tags]);assert.equal(awards.rows[0].count,4)
 checks.push('audit score reasons and only four observed players earn idempotent achievement')
 for(const format of ['single_elimination','double_elimination','round_robin','swiss']){
  const {id}=await req(base+'/tournaments','POST',{name:`Four teams ${format}`,format,teamSize:2,startsAt:new Date(Date.now()+10000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString()})
  await req(base+`/tournaments/${id}`,'PUT',{status:'registration'})
  for(const teamId of teamIds){await req(`/v2/competitive/tournaments/${id}/register`,'POST',{teamId},200,token);await req(`/v2/competitive/tournaments/${id}/check-in`,'POST',{teamId},200,token)}
  let completed=false,rounds=0
  while(!completed&&rounds++<8){
   const generated=await req(base+`/tournaments/${id}/generate`,'POST',{});completed=generated.completed
   if(completed)break
   assert(generated.matches.length>0)
   await req(base+`/tournaments/${id}/generate`,'POST',{},400)
   for(const matchId of generated.matches){
    await req(base+`/matches/${matchId}`,'PUT',{homeScore:3,awayScore:3,status:'completed',reason:'Tie fixture'})
    if(format.includes('elimination'))await req(base+`/tournaments/${id}/generate`,'POST',{},400)
    await req(base+`/matches/${matchId}`,'PUT',{homeScore:3,awayScore:1,status:'completed',reason:'Corrected score',penalty:{homeDeduction:3,awayDeduction:0,reason:'Actual numeric penalty'}})
   }
   const detail=await req(`/v2/competitive/tournaments/${id}`)
   const current=detail.matches.filter(match=>generated.matches.includes(match.id));assert(current.every(match=>match.rawHomeScore===3&&match.homeScore===0&&match.awayScore===1));assert(!JSON.stringify(detail.participants).includes('userId'))
  }
  assert(completed,`${format} did not complete`)
  checks.push(`four-team ${format} full progression, tie corrections, numeric penalties, duplicate-generation rejection`)
 }
 const metadataRules={description:'Attached rules',minTownHall:16,maxTownHall:16,maxRosterSize:2,prizeDescription:'Sponsor-funded $500 prize pool; informational only',rulebookUrl:'https://example.com/rulebook.pdf',visibility:'unlisted'}
 const metadataEvent=await req(base+'/tournaments','POST',{name:'Unlisted prize event',format:'elo',teamSize:2,startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),rules:metadataRules})
 await req(base+`/tournaments/${metadataEvent.id}`,'PUT',{status:'registration'})
 const hiddenBrowse=await req('/v2/competitive/tournaments');assert(!hiddenBrowse.items.some(item=>item.id===metadataEvent.id))
 const directEvent=await req(`/v2/competitive/tournaments/${metadataEvent.id}`);assert.deepEqual(directEvent.tournament.rules,metadataRules)
 const managed=await req(base+'/tournaments');assert(managed.items.some(item=>item.id===metadataEvent.id))
 await req(`/v2/competitive/tournaments/${metadataEvent.id}/register`,'POST',{teamId:teamIds[0]},200,token)
 await req('/v2/competitive/profile','PUT',{displayName:'Visible competitor',avatarUrl:null,bannerUrl:null,private:false,hideDiscord:true},200,token)
 const ownEvents=await req('/v2/competitive/profile','GET',undefined,200,token);assert(ownEvents.tournamentHistory.some(item=>item.id===metadataEvent.id));assert.equal(ownEvents.hideDiscord,false)
 const publicEvents=await req(`/v2/competitive/profiles/${actor}`);assert(!publicEvents.tournamentHistory.some(item=>item.id===metadataEvent.id));assert(publicEvents.accounts.length>0);assert(publicEvents.accounts.every(account=>account.townHallLevel===16))
 await req(base+`/tournaments/${metadataEvent.id}`,'PUT',{rules:{description:'Updated description'}})
 const retained=await req(`/v2/competitive/tournaments/${metadataEvent.id}`);assert.equal(retained.tournament.rules.rulebookUrl,metadataRules.rulebookUrl);assert.equal(retained.tournament.rules.visibility,'unlisted');assert.equal(retained.tournament.rules.minTownHall,16)
 for(const rulebookUrl of ['http://example.com/rules.pdf','javascript:alert(1)','https://user:password@example.com/rules.pdf'])await req(base+`/tournaments/${metadataEvent.id}`,'PUT',{rules:{rulebookUrl}},400)
 await req(base+`/tournaments/${metadataEvent.id}`,'PUT',{rules:{entryFee:50}},400)
 await req(base+`/tournaments/${metadataEvent.id}`,'PUT',{rules:{prizeDescription:'',rulebookUrl:'',visibility:'public'}})
 const cleared=await req(`/v2/competitive/tournaments/${metadataEvent.id}`);assert(!('prizeDescription' in cleared.tournament.rules));assert(!('rulebookUrl' in cleared.tournament.rules));assert.equal(cleared.tournament.rules.visibility,'public')
 const published=await req('/v2/competitive/tournaments');assert(published.items.some(item=>item.id===metadataEvent.id))
 checks.push('informational prize and HTTPS rulebook roundtrip, metadata preservation/clearing, invalid URL and nested fee rejection')
 checks.push('unlisted omitted from public discovery and profile history; direct link, owner history and admin listing work; public toggle restores discovery')
 await db.query('UPDATE player_links SET user_id=$1 WHERE tag=$2',[other,tags[0]])
 const transferred=await req('/v2/competitive/profile','GET',undefined,200,foreign);assert.equal(transferred.teams.length,0);assert.equal(transferred.achievements.filter(item=>item.id==='first_tournament').length,0)
 assert.equal((await checkTournamentBadge(foreign)).earned_count,0)
 assert.equal((await checkTournamentBadge(token)).earned_count,3)
 checks.push('achievement check catalog excludes transferred owner credit while original owner retains three other earned accounts')
 await req(`/v2/competitive/teams/${teamIds[0]}/join`,'POST',{playerTag:tags[0]},403,foreign)
 await db.query('DELETE FROM player_links WHERE tag=$1',[tags[0]])
 const original=await req('/v2/competitive/profile','GET',undefined,200,token);assert(original.teams.some(item=>item.playerTag===tags[0]));assert(!original.accounts.some(item=>item.tag===tags[0]))
 checks.push('link transfer cannot inherit accepted membership or personal tournament award; unlink preserves original membership history')
 await req(base+'/tournaments','POST',{name:'Fee rejected',format:'elo',teamSize:2,startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),entryFee:5},400)
 checks.push('entry fee property rejected')
 checks.push('one clan may maintain multiple teams but only one active team per tournament')
 console.log(JSON.stringify({checkCount:checks.length,checks,origin,liveProviderResources:process.env.CLASHKING_E2E_LIVE_CCN==='1'?['events','leaderboard','standings']:[]}))
}finally{
 if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))])}
 if(seeded){
  await db.query('DELETE FROM competitive_role_grants WHERE server_id=$1',[server]);await db.query('DELETE FROM discord_cache.members WHERE guild_id=$1',[server]);await db.query('DELETE FROM discord_cache.guilds WHERE id=$1',[server]);await db.query('DELETE FROM discord_cache.gateway_shards WHERE application_id=$1',[app])
  await db.query('DELETE FROM competitive_matches WHERE tournament_id IN (SELECT id FROM competitive_tournaments WHERE server_id=$1)',[server]);await db.query('DELETE FROM competitive_participants WHERE tournament_id IN (SELECT id FROM competitive_tournaments WHERE server_id=$1)',[server]);await db.query('DELETE FROM competitive_tournaments WHERE server_id=$1',[server]);await db.query('DELETE FROM competitive_team_members WHERE team_id IN (SELECT id FROM competitive_teams WHERE server_id=$1)',[server]);await db.query('DELETE FROM competitive_teams WHERE server_id=$1',[server]);await db.query('DELETE FROM competitive_audit WHERE server_id=$1',[server]);await db.query('DELETE FROM competitive_profiles WHERE user_id=ANY($1::text[])',[[actor,other]]);await db.query('DELETE FROM player_links WHERE user_id=$1',[actor]);await db.query('DELETE FROM basic_player WHERE tag=ANY($1::text[])',[tags]);await db.query('DELETE FROM servers WHERE id=$1',[server]);if(warId){await db.query('DELETE FROM war_archive_pending WHERE war_id=$1',[warId]);await db.query('DELETE FROM wars WHERE war_id=$1',[warId])}await db.query('DELETE FROM basic_clan WHERE tag=ANY($1::text[])',[clanTags]);await db.query('DELETE FROM auth_users WHERE user_id=ANY($1::text[])',[[actor,other]])
 }
 await db.end()
}
