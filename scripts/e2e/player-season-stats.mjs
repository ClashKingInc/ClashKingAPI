// Actual HTTP Worker and disposable SQL: season boundaries and stored contributions.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import pg from 'pg';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1');
const dsn=new URL(process.env.TEST_DATABASE_URL);assert.equal(dsn.hostname,'127.0.0.1');
const db=new pg.Client({connectionString:dsn.href});await db.connect();
const token=randomBytes(32).toString('base64url'),port=8817,origin=`http://127.0.0.1:${port}`;
let logs='';
const child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{stdio:['ignore','pipe','pipe'],env:{...process.env,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_ADMIN_IDENTITY:'0',CLASHKING_LOCAL_FCM_CREDENTIALS_FILE:'',CLASHKING_LOCAL_DISCORD_CLIENT_ID:'999999999999999999',CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'fixture',CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_E2E_API_BOT_TOKEN:token,CLASHKING_LOCAL_STATIC_ASSETS_ROOT:process.env.CLASHKING_E2E_STATIC_ASSETS_ROOT??resolve('../clashking_assets/assets/static_data')}});
child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
try{
 let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error(logs.slice(-1200));try{ready=(await fetch(origin+'/v2/health')).ok&&logs.includes('isolated_api_ready');}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert(ready,logs.slice(-1200));
 const url=origin+'/v2/bot/players/%23PYL/season-stats';
 assert.equal((await fetch(url)).status,401);
 const read=async()=>{const r=await fetch(url,{headers:{authorization:`Bearer ${token}`}});assert.equal(r.status,200);return r.json();};
 const empty=await read();assert.equal(empty.donated,0);assert.equal(empty.received,0);
 const start=Date.parse(empty.start);
 for(const [offset,kind,amount] of [[1000,'donated',120],[2000,'donated',50],[3000,'received',90],[-1000,'donated',9999],[-1000,'received',9999]]){
  await db.query('INSERT INTO player_stat_changes(event_time,player_tag,stat_type,previous_value,current_value,delta) VALUES($1,$2,$3,0,$4,$4)',[new Date(start+offset),'#PYL',kind,amount]);
 }
 const result=await read();assert.equal(result.donated,170);assert.equal(result.received,90);assert.equal(result.statObservations,3);
 assert.equal(result.gold,0);assert.equal(result.recordedBattles,0);
 const guild='999999999999992911';
 await db.query('INSERT INTO servers(id,name) VALUES($1,$2)',[guild,'Autocomplete fixture']);
 for(const [tag,name,members] of [
  ['#PYA','Alpha',[{tag:'#PYP',name:'First Player',town_hall:18},{tag:'#PYQ',name:'Second Player',town_hall:17}]],
  ['#PYB','Beta',[{tag:'#PYP',name:'First Player',town_hall:18},{tag:'#PYR',name:'Third Player',town_hall:16}]],
  ['#PYC','Outside',[{tag:'#PYU',name:'Outside Player',town_hall:19}]],
 ]) {
  await db.query('INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received,members) VALUES($1,$2,true,0,$3,\'\',0,0,$4::jsonb)',[tag,name,members.length,JSON.stringify(members)]);
  if(tag!=='#PYC')await db.query('INSERT INTO server_clans(server_id,tag) VALUES($1,$2)',[guild,tag]);
 }
 const autocomplete=origin+'/v2/bot/servers/'+guild+'/player-autocomplete';
 assert.equal((await fetch(autocomplete)).status,401);
 const suggestions=async query=>{const r=await fetch(autocomplete+'?query='+encodeURIComponent(query),{headers:{authorization:`Bearer ${token}`}});assert.equal(r.status,200);return (await r.json()).items;};
 assert.deepEqual((await suggestions('')).map(p=>p.tag),['#PYP','#PYQ','#PYR']);
 assert.deepEqual((await suggestions('second')).map(p=>p.tag),['#PYQ']);
 assert.deepEqual((await suggestions('#PYR')).map(p=>p.clanName),['Beta']);
 assert.deepEqual(await suggestions('Outside'),[]);
 console.log('PASS actual family autocomplete API: linked clan scope, no Discord-link requirement, deduplication and name/tag matching.');
 console.log('PASS actual player-season API: sums stored donation/received events, excludes earlier seasons, preserves empty counts and bot authorization.');
}finally{child.kill('SIGTERM');await db.end();}
