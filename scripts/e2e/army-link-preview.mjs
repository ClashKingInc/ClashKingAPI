// Actual HTTP Worker and disposable SQL; no Discord delivery or personal saves.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import pg from 'pg';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1');
const dsn=new URL(process.env.TEST_DATABASE_URL);assert.equal(dsn.hostname,'127.0.0.1');
const db=new pg.Client({connectionString:dsn.href});await db.connect();
const token=randomBytes(32).toString('base64url'),port=8816,origin=`http://127.0.0.1:${port}`;
let logs='';
const child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{stdio:['ignore','pipe','pipe'],env:{...process.env,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_ADMIN_IDENTITY:'0',CLASHKING_LOCAL_FCM_CREDENTIALS_FILE:'',CLASHKING_LOCAL_DISCORD_CLIENT_ID:'999999999999999999',CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'fixture',CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_E2E_API_BOT_TOKEN:token,CLASHKING_LOCAL_STATIC_ASSETS_ROOT:process.env.CLASHKING_E2E_STATIC_ASSETS_ROOT??resolve('../clashking_assets/assets/static_data')}});
child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
try{
 let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error(logs.slice(-1200));try{ready=(await fetch(origin+'/v2/health')).ok&&logs.includes('isolated_api_ready');}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert(ready,logs.slice(-1200));
 const request=(army,authorized=true)=>fetch(origin+'/v2/bot/armies/preview',{method:'POST',headers:{'content-type':'application/json',...(authorized?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({army})});
 const counts=async()=> (await db.query('SELECT (SELECT count(*) FROM army_compositions)::text AS compositions,(SELECT count(*) FROM user_saved_armies)::text AS saved')).rows[0];
 const before=await counts();
 assert.equal((await request('u1x0',false)).status,401);
 assert.equal((await request('not-an-army')).status,400);
 const code='h6p17e49_61-4p4e6_13-2m1p16e5_22-7p11e53_57i1x76-1x63-1x188-1x62d1x9-1x11-1x70u70x5s3x35-3x10-1x120-4x5';
 const response=await request('https://link.clashofclans.com/en?action=CopyArmy&army='+code);
 assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.shareCode,'h2m1p16e5_22-4p4e6_13-6p17e49_61-7p11e53_57i1x62-1x63-1x76-1x188d1x9-1x11-1x70u70x5s4x5-3x10-3x35-1x120');assert.equal(result.saved,false);assert.deepEqual(result.items,[]);
 assert.equal(result.presentation.heroes.length,4);assert(result.presentation.units.some(u=>u.section==='Troops'&&u.quantity===70));
 assert(result.presentation.units.some(u=>u.section==='Clan Castle'));assert(result.presentation.troopSpace>0);assert(result.presentation.spellSpace>0);
 assert.equal(new URL(result.armyLink).searchParams.get('army'),result.shareCode);
 assert.deepEqual(await counts(),before,'Preview must not save an army or composition');
 console.log('PASS actual army preview API: screenshot army, heroes/equipment/CC, canonical copy link, bot authorization, invalid input, no persistence.');
}finally{child.kill('SIGTERM');await db.end();}
