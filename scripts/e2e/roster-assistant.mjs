// Real HTTP integration: API -> local PostgreSQL + loopback official-game provider.
// No unit mocks, external Discord calls, or AI provider calls. Synthetic records are cleaned up.
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const dashboard=process.env.CLASHKING_E2E_DASHBOARD_REPO;
if(!dashboard)throw Error('Set CLASHKING_E2E_DASHBOARD_REPO to the local Dashboard checkout');
const require=createRequire(join(repo,'package.json'));
const pg=require('pg'),{build}=require('esbuild');
const {SignJWT}=await import(require.resolve('jose'));
const database=process.env.CLASHKING_E2E_DATABASE_URL??'postgres://clashking_local:clashking_local@127.0.0.1:54330/clashking_dev';
const databaseUrl=new URL(database);
if(databaseUrl.protocol!=='postgres:'||databaseUrl.hostname!=='127.0.0.1'||databaseUrl.pathname!=='/clashking_dev'||databaseUrl.username!=='clashking_local')throw Error('Use the owned loopback clashking_dev database');
const port=Number(process.env.CLASHKING_E2E_API_PORT??8798);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local port');
const occupied=await new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false));});
if(occupied)throw Error('The requested isolated API port is occupied; refusing to use another process');
const db=new pg.Client({connectionString:database}); await db.connect();
const app='999999999999995701',actor='999999999999995702',server='999999999999995703',other='999999999999995704';
const clan='#PYLQRRJC',enemy='#PYLQRRJY',tags=['#PYLQRRJP','#PYLQRRJQ','#PYLQRRJG'];
const keys=Object.fromEntries(['DATA_ENCRYPTION_KEY','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','API_BOT_TOKEN','AI_USAGE_SECRET','STRIPE_WEBHOOK_SECRET'].map(key=>[key,randomBytes(32).toString('base64url')]));
const directory=mkdtempSync(join(tmpdir(),'ck-roster-feedback-'));
const member=tag=>({tag,name:`Local ${tags.indexOf(tag)+1}`,townHallLevel:16,trophies:5000,role:'member',donations:0,donationsReceived:0,clanRank:1,previousClanRank:1,expLevel:200});
const provider=createServer((req,res)=>{res.setHeader('content-type','application/json'); const path=decodeURIComponent(new URL(req.url,'http://local').pathname);
 if(path===`/v1/clans/${clan}`)return res.end(JSON.stringify({tag:clan,name:'Local Family',type:'inviteOnly',clanPoints:0,warWins:0,warWinStreak:0,clanCapital:{capitalHallLevel:1,clanGoldSinkTotal:0,districts:[]},clanLevel:10,memberList:tags.map(member),members:3,badgeUrls:{small:'https://example.invalid/badge.png'}}));
 if(path.startsWith('/v1/players/')){const tag=path.split('/').at(-1);return res.end(JSON.stringify({...member(tag),clan:{tag:clan,name:'Local Family',badgeUrls:{small:'https://example.invalid/badge.png'}},heroes:[],troops:[],spells:[],heroEquipment:[],achievements:[],labels:[]}));}
 res.statusCode=404;res.end(JSON.stringify({reason:'notFound'}));
});await new Promise(r=>provider.listen(0,'127.0.0.1',r));
let child,logs='',seeded=false,warId;const extraWarIds=[],cwlIds=[];const origin=`http://127.0.0.1:${port}`;
const assert=(yes,message)=>{if(!yes)throw Error(message)};
const request=async(path,body,expected=200,token=userToken,method=body===undefined?'GET':'POST')=>{const response=await fetch(origin+path,{method,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const value=await response.json();assert(response.status===expected,`${path}: expected${expected} got${response.status} ${JSON.stringify(value)}`);return value};
const userToken=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(actor).setAudience('clashking-web').setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(keys.JWT_ACCESS_SECRET));
try {
 assert((await db.query('SELECT id FROM servers WHERE id=ANY($1::text[])',[[server,other]])).rowCount===0,'Synthetic servers already exist');
 assert((await db.query('SELECT user_id FROM auth_users WHERE user_id=$1',[actor])).rowCount===0,'Synthetic actor already exists');
 assert((await db.query('SELECT tag FROM basic_clan WHERE tag=$1',[clan])).rowCount===0,'Synthetic clan already exists');
 assert((await db.query('SELECT tag FROM basic_player WHERE tag=ANY($1::text[])',[tags])).rowCount===0,'Synthetic tags already exist');
 await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[actor]);seeded=true;
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Local roster E2E'),($2,'Other local E2E')",[server,other]);
 await db.query('INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received,members) VALUES($1,$2,true,0,3,\'local\',0,0,$3)',[clan,'Local Family',JSON.stringify(tags.map(member))]);
 await db.query('INSERT INTO server_clans(tag,server_id) VALUES($1,$2)',[clan,server]);
 for(const tag of tags)await db.query('INSERT INTO basic_player(tag,name,townhall_level,trophies,clan_tag) VALUES($1,$2,16,5000,$3)',[tag,member(tag).name,clan]);
 const generation=randomUUID();await db.query('INSERT INTO discord_cache.gateway_shards(application_id,shard_id,shard_count,generation,healthy,heartbeat_at) VALUES($1,0,1,$2,true,now())',[app,generation]);
 for(const id of [server,other])await db.query('INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete) VALUES($1,$2,$3,0,$4,true,true,true)',[id,JSON.stringify({owner_id:id===server?actor:'999999999999995799'}),app,generation]);
 await db.query("INSERT INTO discord_cache.members(guild_id,user_id,data) VALUES($1,$2,'{}')",[server,actor]);
 const env={...process.env,CLASHKING_PERSISTENT_LOCAL_API:'1',CLASHKING_LOCAL_DATABASE_URL:database,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_DISCORD_CLIENT_ID:app,CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local-only',CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_CLASH_PROXY_ORIGIN:`http://127.0.0.1:${provider.address().port}`,CLASHKING_LOCAL_STORAGE_ROOT:directory,CLASHKING_LOCAL_STATIC_ASSETS_ROOT:process.env.CLASHKING_E2E_STATIC_ASSETS_ROOT??resolve(repo,'../clashking_assets/assets/static_data'),...Object.fromEntries(Object.entries(keys).map(([key,value])=>[`CLASHKING_LOCAL_${key}`,value]))};
 child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{cwd:repo,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
 for(let i=0;i<200;i++){try{if((await fetch(origin+'/v2/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));if(i===199)throw Error(logs.slice(-2000))}
 const context=await request('/v2/roster/ai/context',{serverId:server,rosterIds:[],messages:[{role:'user',content:'Find unassigned family members'}]});assert(context.context.attachments.length===0,'Empty roster family context failed');
 await build({entryPoints:[dashboard+'/workers/roster-assistant/family-context.ts'],bundle:true,platform:'node',format:'esm',outfile:directory+'/family.mjs'});
 await build({stdin:{contents:`import {executeAssistantEndpoint} from './workers/roster-assistant/api-client'; import {DashboardCreateRosterEndpoint} from '@clashking/api-contracts'; export const create=(origin,token,serverId,body)=>executeAssistantEndpoint(origin,token,DashboardCreateRosterEndpoint,{path:{},query:{server_id:serverId,unassigned_only:true},body});`,resolveDir:dashboard},bundle:true,platform:'node',format:'esm',outfile:directory+'/create.mjs'});
 const {readFamilyMembers,readFamilyWarMetric,validateNewFamilyRoster}=await import(directory+'/family.mjs');
 const {create}=await import(directory+'/create.mjs');
 const family=await readFamilyMembers(origin,userToken,server);assert(family.players.length===3 && family.players.every(p=>p.rosterIds.length===0),'Family discovery mismatch');
 const familyQuery={playerTags:tags,metricId:'war.regular_hit_rate',parameters:{windowDays:60}};
 const noFamilyHistory=await readFamilyWarMetric(origin,userToken,server,familyQuery);
 assert(noFamilyHistory.rows.length===3&&noFamilyHistory.rows.every(row=>row.value===null&&row.attackCount===0),'Empty-roster history must be unknown, not fabricated zero');
 await request('/v2/roster/family/war-metrics/query?server_id='+other,familyQuery,403);
 await request('/v2/roster/family/war-metrics/query?server_id='+server,{...familyQuery,playerTags:[enemy]},403);
 await request('/v2/roster/family/war-metrics/query?server_id='+server,{...familyQuery,metricId:'discord.username'},400);
 assert(validateNewFamilyRoster(family,{rosterType:'family',clanTag:null,memberTags:tags.slice(0,2)}).length===2,'Preview failed');
 const created=await create(origin,userToken,server,{alias:'Local proposed roster',roster_type:'family',signup_scope:'family-only',members:tags.slice(0,2).map(tag=>({tag}))});
 const rosterId=created.roster_id;
 const assigned=await readFamilyMembers(origin,userToken,server);assert(assigned.players.filter(p=>p.rosterIds.length===0).length===1,'Assignment after Apply failed');
 let rejected=false;try{validateNewFamilyRoster(assigned,{rosterType:'family',clanTag:null,memberTags:[tags[0]]})}catch{rejected=true}assert(rejected,'Already assigned proposal accepted');
 await request('/v2/roster/ai/context',{serverId:other,rosterIds:[],messages:[{role:'user',content:'List family'}]},403);
 const metric=async metricId=>request('/v2/roster/metrics/query?server_id='+server,{rosterIds:[rosterId],metricId,parameters:{windowDays:30},force:true});
 const empty=await metric('war.missed_attacks');assert(empty.rows.every(row=>row.value===null),'No-history value was fabricated');
 const end=new Date(Date.now()-3600000),start=new Date(end.valueOf()-86400000),prep=new Date(start.valueOf()-86400000);
 warId=(await db.query("INSERT INTO wars(clan_tag,opponent_tag,prep_time,start_time,end_time,size,attacks_per_member,war_type,state) VALUES($1,$2,$3,$4,$5,2,2,'random','warEnded') RETURNING war_id",[clan,enemy,prep,start,end])).rows[0].war_id;
 const side=(tag,members)=>({tag,name:'Local war',badgeToken:'local',clanLevel:10,attacks:1,stars:3,destructionPercentage:50,members});
 const payload={state:'warEnded',teamSize:2,attacksPerMember:2,preparationStartTime:prep.toISOString(),startTime:start.toISOString(),endTime:end.toISOString(),battleModifier:'none',clan:side(clan,[{tag:tags[0],name:'One',townhallLevel:16,mapPosition:1,attacks:[{defenderTag:enemy,stars:3,destructionPercentage:100,order:1,duration:120}]},{tag:tags[1],name:'Two',townhallLevel:16,mapPosition:2,attacks:[]}]),opponent:side(enemy,[{tag:enemy,name:'Enemy',townhallLevel:16,mapPosition:1,attacks:[]}])};
 await db.query('INSERT INTO war_archive_pending(war_id,end_time,payload) VALUES($1,$2,$3)',[warId,end,JSON.stringify(payload)]);
 for(const tag of tags.slice(0,2))await db.query('INSERT INTO player_war_history(player_tag,war_ids) VALUES($1,$2)',[tag,[warId]]);
 // Include the unassigned player's 40-day triple, not their 90-day failure.
 for(const [days,stars] of [[40,3],[90,0]]){
  const ended=new Date(Date.now()-days*86400000),started=new Date(ended.valueOf()-86400000),prepared=new Date(started.valueOf()-86400000);
  const id=(await db.query("INSERT INTO wars(clan_tag,opponent_tag,prep_time,start_time,end_time,size,attacks_per_member,war_type,state) VALUES($1,$2,$3,$4,$5,1,2,'random','warEnded') RETURNING war_id",[clan,enemy,prepared,started,ended])).rows[0].war_id;
  extraWarIds.push(id);
  const archived={...payload,teamSize:1,preparationStartTime:prepared.toISOString(),startTime:started.toISOString(),endTime:ended.toISOString(),clan:side(clan,[{tag:tags[2],name:'Unassigned',townhallLevel:16,mapPosition:1,attacks:[{defenderTag:enemy,stars,destructionPercentage:stars===3?100:10,order:1,duration:120}]}])};
  await db.query('INSERT INTO war_archive_pending(war_id,end_time,payload) VALUES($1,$2,$3)',[id,ended,JSON.stringify(archived)]);
 }
 await db.query('INSERT INTO player_war_history(player_tag,war_ids) VALUES($1,$2)',[tags[2],extraWarIds]);
 const emptyRoster=await request('/v2/roster?server_id='+server,{alias:'Empty ranking destination',roster_type:'clan',clan_tag:clan,signup_scope:'clan-only',members:[]},201);
 const withEmpty=await request('/v2/roster/ai/context',{serverId:server,rosterIds:[emptyRoster.roster_id],messages:[{role:'user',content:'Create a roster of my best players by their 60-day hit rate'}]});
 assert(withEmpty.context.attachments.length===1,'Empty destination not authorized');
 const rates=await readFamilyWarMetric(origin,userToken,server,familyQuery);
 const unassignedRate=rates.rows.find(row=>row.playerTag===tags[2]);
 assert(unassignedRate.value===100&&unassignedRate.attackCount===1,'Unassigned 60-day war history missing or wrong window');
 assert(rates.rows.find(row=>row.playerTag===tags[1]).value===null,'No attacks must stay unknown');
 const ranked=rates.rows.filter(row=>row.value!==null).sort((a,b)=>b.value-a.value||b.attackCount-a.attackCount||a.playerTag.localeCompare(b.playerTag));
 assert(ranked.length===2,'Ranking must omit players without observed attacks');
 const rankingPreview=await request('/v2/roster/membership-changes/validate',{serverId:server,rosterIds:[emptyRoster.roster_id],changes:ranked.map(row=>({action:'add',playerTag:row.playerTag,toRosterId:emptyRoster.roster_id,reason:'Observed 60-day regular-war rate'}))});
 assert(rankingPreview.changes.length===2,'Could not propose ranked clan players into empty attached roster');
 const missed=await metric('war.missed_attacks');assert(missed.rows.find(row=>row.playerTag===tags[0]).value===1&&missed.rows.find(row=>row.playerTag===tags[1]).value===2,'Missed attacks sample mismatch');
 const participation=await metric('war.participation');assert(participation.rows.find(row=>row.playerTag===tags[0]).value.completionPercent===50,'Participation sample mismatch');
 const confidence=await metric('war.hit_rate_confidence');const known=confidence.rows.find(row=>row.playerTag===tags[0]).value;assert(known.attacks===1&&known.triples===1&&known.ratePercent===100&&known.wilson95LowPercent>20&&known.wilson95LowPercent<21,'Wilson sample mismatch');assert(confidence.rows.find(row=>row.playerTag===tags[1]).value.ratePercent===null,'No-attack confidence fabricated');
 const changes=[{action:'add',playerTag:tags[2],toRosterId:rosterId}];const preview=await request('/v2/roster/membership-changes/validate',{serverId:server,rosterIds:[rosterId],changes});
 const applied=await request('/v2/roster/membership-changes',{serverId:server,changes,expectedRevisions:preview.expectedRevisions});assert(applied.applied,'Apply failed');
 await request('/v2/roster/membership-changes',{serverId:server,changes,expectedRevisions:preview.expectedRevisions},409);
 const undone=await request('/v2/roster/membership-changes',{serverId:server,changes:[{action:'remove',playerTag:tags[2],fromRosterId:rosterId}],expectedRevisions:applied.revisions});assert(undone.applied,'Undo failed');
 const destination=await request('/v2/roster?server_id='+server,{alias:'Local move destination',roster_type:'family',signup_scope:'family-only',members:[]},201);
 const move=[{action:'move',playerTag:tags[0],fromRosterId:rosterId,toRosterId:destination.roster_id}];
 const movePreview=await request('/v2/roster/membership-changes/validate',{serverId:server,rosterIds:[rosterId,destination.roster_id],changes:move});
 const moved=await request('/v2/roster/membership-changes',{serverId:server,changes:move,expectedRevisions:movePreview.expectedRevisions});assert(moved.applied,'Move apply failed');
 const removal=[{action:'remove',playerTag:tags[0],fromRosterId:destination.roster_id}];
 const removePreview=await request('/v2/roster/membership-changes/validate',{serverId:server,rosterIds:[destination.roster_id],changes:removal});
 const removed=await request('/v2/roster/membership-changes',{serverId:server,changes:removal,expectedRevisions:removePreview.expectedRevisions});assert(removed.applied,'Remove apply failed');
 const finalFamily=await readFamilyMembers(origin,userToken,server);assert(finalFamily.players.find(player=>player.playerTag===tags[0]).rosterIds.length===0,'Removal did not persist');
 const claim=alias=>fetch(origin+'/v2/roster?server_id='+server+'&unassigned_only=true',{method:'POST',headers:{authorization:`Bearer ${userToken}`,'content-type':'application/json'},body:JSON.stringify({alias,roster_type:'family',signup_scope:'family-only',members:[{tag:tags[0]}]})});
 const concurrent=await Promise.all([claim('Concurrent claim A'),claim('Concurrent claim B')]);
 assert(concurrent.map(result=>result.status).sort().join(',')==='201,409','Concurrent unassigned Apply was not exclusive');
 const claims=(await db.query('SELECT count(*)::int count FROM roster_members member JOIN rosters roster ON roster.id=member.roster_id WHERE roster.server_id=$1 AND member.tag=$2',[server,tags[0]])).rows[0].count;
 assert(claims===1,'Concurrent claims persisted duplicate assignments');
 await request('/v2/roster?server_id='+server+'&unassigned_only=true',{alias:'Missing profile claim',roster_type:'family',signup_scope:'family-only',members:[{tag:'#PYLQRRJ9'}]},409);
 const cwlRoster=await request('/v2/roster?server_id='+server,{alias:'CWL performance',roster_type:'family',signup_scope:'family-only',members:tags.slice(0,2).map(tag=>({tag}))},201);
 const cwlWarIds=[];
 for(let i=0;i<7;i++){
  const group=`E2ECWL${String(i).padStart(6,'0')}`,season=`2025-${String(i+1).padStart(2,'0')}`;
  const groupWars=[];cwlIds.push(group);
  // The newest season has two wars; its final round crosses into next month.
  for(let j=0;j<(i===6?2:1);j++){
   const ended=new Date(Date.UTC(2025,i+1,1+j)),started=new Date(ended.valueOf()-86400000),prepared=new Date(started.valueOf()-86400000);
   const warTag=`#E2ECWL${i}${j}`;
   const id=(await db.query("INSERT INTO wars(clan_tag,opponent_tag,prep_time,start_time,end_time,size,attacks_per_member,war_type,state,war_tag) VALUES($1,$2,$3,$4,$5,1,1,'cwl','warEnded',$6) RETURNING war_id",[clan,enemy,prepared,started,ended,warTag])).rows[0].war_id;
   extraWarIds.push(id);cwlWarIds.push(id);groupWars.push(warTag);
   const attack=i===5?[]:[{defenderTag:enemy,stars:i===0?0:3,destructionPercentage:i===0?10:100,order:1,duration:120}];
   await db.query('INSERT INTO war_archive_pending(war_id,end_time,payload) VALUES($1,$2,$3)',[id,ended,JSON.stringify({...payload,warTag,teamSize:1,attacksPerMember:1,preparationStartTime:prepared.toISOString(),startTime:started.toISOString(),endTime:ended.toISOString(),clan:side(clan,[{tag:tags[0],name:'One',townhallLevel:16,mapPosition:1,attacks:attack}]),opponent:side(enemy,[{tag:enemy,name:'Enemy',townhallLevel:16,mapPosition:1,attacks:[{defenderTag:tags[0],stars:2,destructionPercentage:80,order:2,duration:120}]}])})]);
  }
  await db.query("INSERT INTO cwl_groups(cwl_id,season,state,rounds) VALUES($1,$2,'ended',$3)",[group,season,JSON.stringify(i%2?[{warTags:groupWars}]:[groupWars])]);
  await db.query("INSERT INTO cwl_group_clans(cwl_id,clan_tag) VALUES($1,$2)",[group,clan]);
  // Player two is registered but benched in every season.
  for(const tag of tags.slice(0,2))await db.query('INSERT INTO cwl_group_members(cwl_id,clan_tag,tag,town_hall) VALUES($1,$2,$3,16)',[group,clan,tag]);
 }
 await db.query('UPDATE player_war_history SET war_ids=war_ids || $2::integer[] WHERE player_tag=$1',[tags[0],cwlWarIds]);
 const cwl=await request('/v2/roster/metrics/query?server_id='+server,{rosterIds:[cwlRoster.roster_id],metricId:'cwl.performance_history',parameters:{seasonCount:6},force:false});
 const performance=cwl.rows.find(row=>row.playerTag===tags[0]).value;
 assert(performance.observedSeasons===6&&performance.seasons[0].season==='2025-07'&&performance.seasons.at(-1).season==='2025-02','CWL seasons selected by end month or not limited per player');
 assert(performance.summary.completedWars===7&&performance.summary.attacks===6&&performance.summary.missedAttacks===1,'Six seasons incorrectly treated as six wars or skipped zero-attack lineup');
 assert(performance.summary.hitRate===100&&performance.summary.defenses===7&&performance.summary.averageStarsConceded===2,'CWL attack/defense aggregation mismatch');
 assert(performance.lateAttacks===null&&!performance.lateAttackTimingAvailable,'Late timing fabricated');
 const benched=cwl.rows.find(row=>row.playerTag===tags[1]).value;
 assert(benched.observedSeasons===0&&benched.summary.hitRate===null&&benched.summary.missedAttacks===null,'Bench registration invented participation');
 await request('/v2/roster/metrics/query?server_id='+server,{rosterIds:[cwlRoster.roster_id],metricId:'cwl.performance_history',parameters:{seasonCount:6,warCount:6},force:false},400);
 await build({entryPoints:[dashboard+'/workers/roster-assistant/cwl-performance-view.ts'],bundle:true,platform:'node',format:'esm',outfile:directory+'/cwl-view.mjs'});
 const {cwlPerformanceViewSource}=await import(directory+'/cwl-view.mjs');
 const source=cwlPerformanceViewSource(6);
 // Execute the exact reusable program against real local HTTP tools, then send
 // its result through the same API preview validation used by the assistant.
 const view=await new Function('codemode','return ('+source+')')({
  getRosterMembers:input=>request('/v2/roster/members/query',{serverId:server,rosterIds:[cwlRoster.roster_id],...input}),
  getRosterMetric:input=>request('/v2/roster/metrics/query?server_id='+server,{rosterIds:[cwlRoster.roster_id],...input,force:false}),
 })();
 const materialized=await request('/v2/roster/views/preview?server_id='+server,{serverId:server,rosterIds:[cwlRoster.roster_id],sourceCode:source,sourceVersion:1,...view});
 assert(materialized.result.rows.length===2&&materialized.result.rows.find(row=>row.playerTag===tags[0]).values.baseline_stars===3,'CWL reusable view did not materialize actual baseline');
 assert(materialized.result.rows.find(row=>row.playerTag===tags[1]).values.baseline_stars===null,'CWL view fabricated a bench forecast');
 console.log(JSON.stringify({cwlChecks:['six participated seasons, seven wars','real season despite cross-month ending','zero-attack lineup retained','bench registration excluded','offense and defense totals','late timing remains unavailable','conflicting war-count rejected']}));
 console.log(JSON.stringify({checks:['zero-roster family context','actual family discovery helper over HTTP','unassigned new-roster preview','explicit create Apply','assigned re-proposal rejected','cross-server403','family-metric cross-server403','non-family player403','private metric400','family no-history null','unassigned 40-day hit included in60days','90-day hit excluded','empty attached roster ranking proposal','no-history null','missed hits 1 and 2','participation50percent','Wilson interval actual sample','no-attack null confidence','membership preview Apply','stale409','revision-checked add Undo','move preview Apply','remove preview Apply','concurrent unassigned Apply statuses201/409','one persisted concurrent assignment','missing profile rejected409'],externalAIRequests:0}));
} finally {
 if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);}
 if(seeded){
  if(cwlIds.length)await db.query('DELETE FROM cwl_groups WHERE cwl_id=ANY($1::text[])',[cwlIds]);
  await db.query('DELETE FROM player_war_history WHERE player_tag=ANY($1::text[])',[tags]);for(const id of [...extraWarIds,...(warId?[warId]:[])]){await db.query('DELETE FROM war_archive_pending WHERE war_id=$1',[id]);await db.query('DELETE FROM wars WHERE war_id=$1',[id]);}
  await db.query('DELETE FROM discord_cache.members WHERE guild_id=ANY($1::text[])',[[server,other]]);await db.query('DELETE FROM discord_cache.guilds WHERE id=ANY($1::text[])',[[server,other]]);await db.query('DELETE FROM discord_cache.gateway_shards WHERE application_id=$1',[app]);
  await db.query('DELETE FROM servers WHERE id=ANY($1::text[])',[[server,other]]);await db.query('DELETE FROM basic_player WHERE tag=ANY($1::text[])',[tags]);await db.query('DELETE FROM basic_clan WHERE tag=$1',[clan]);await db.query('DELETE FROM auth_users WHERE user_id=$1',[actor]);
 }
 await db.end();await new Promise(r=>provider.close(r));rmSync(directory,{recursive:true,force:true});
}
