// Actual workerd HTTP and disposable PostgreSQL; Discord is a loopback provider.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import pg from 'pg';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1');
const dsn=new URL(process.env.TEST_DATABASE_URL);assert.equal(dsn.hostname,'127.0.0.1');
const db=new pg.Client({connectionString:dsn.href});await db.connect();
const server='999999999999993201',actor='999999999999993202',role='999999999999993203',outsider='999999999999993204',app='999999999999999999';
const calls=[];
const discord=createServer((req,res)=>{
 calls.push(req.url);res.setHeader('content-type','application/json');
 if(req.url.endsWith(`/guilds/${server}/members/${actor}`))return res.end(JSON.stringify({roles:[role]}));
 if(req.url.endsWith(`/guilds/${server}/roles`))return res.end(JSON.stringify([{id:role,permissions:'32'}]));
 res.statusCode=404;res.end('{}');
});await new Promise(r=>discord.listen(0,'127.0.0.1',r));
const keys=generateKeyPairSync('ed25519');const publicKey=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
const token=randomBytes(32).toString('base64url'),port=8818,origin=`http://127.0.0.1:${port}`;let logs='';
const child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{stdio:['ignore','pipe','pipe'],env:{...process.env,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_ADMIN_IDENTITY:'0',CLASHKING_LOCAL_FCM_CREDENTIALS_FILE:'',CLASHKING_LOCAL_DISCORD_CLIENT_ID:app,CLASHKING_LOCAL_DISCORD_PUBLIC_KEY:publicKey,CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'fixture',CLASHKING_LOCAL_DISCORD_BOT_TOKEN:'fixture',CLASHKING_LOCAL_DISCORD_TEST_ORIGIN:`http://127.0.0.1:${discord.address().port}`,CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_E2E_API_BOT_TOKEN:token,CLASHKING_LOCAL_STATIC_ASSETS_ROOT:process.env.CLASHKING_E2E_STATIC_ASSETS_ROOT??resolve('../clashking_assets/assets/static_data')}});
child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
try{
 let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error(logs.slice(-1500));try{ready=(await fetch(origin+'/v2/health')).ok&&logs.includes('isolated_api_ready');}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert(ready,logs.slice(-1500));

 await db.query('INSERT INTO discord_cache.gateway_shards(application_id,shard_id,shard_count,generation,healthy,heartbeat_at) VALUES($1,0,1,$2,true,now())',[app,'11111111-1111-4111-8111-111111111111']);
 await db.query('INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete) VALUES($1,$2,$3,0,$4,true,true,false)',[server,{owner_id:'999999999999993299'},app,'11111111-1111-4111-8111-111111111111']);
 const newGuild='999999999999993299';
 await db.query('INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete) VALUES($1,$2,$3,0,$4,true,true,false)',[newGuild,{name:'New guild'},app,'11111111-1111-4111-8111-111111111111']);
 const rawBody=JSON.stringify({id:'999999999999993298',application_id:app,guild_id:newGuild,channel_id:'999999999999993297',member:{user:{id:actor}},type:2,data:{name:'setup'}});
 const timestamp=String(Math.floor(Date.now()/1000));const signature=sign(null,Buffer.from(timestamp+rawBody),keys.privateKey).toString('hex');
 const activity=()=>fetch(origin+'/v2/bot/server-activity',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({interaction:{rawBody,timestamp,signature}})});
 let activityReply=await activity();assert.equal(activityReply.status,200);assert.equal((await activityReply.json()).recorded,true);
 assert.equal((await db.query('SELECT count(*)::int n FROM servers WHERE id=$1 AND last_command_at IS NOT NULL',[newGuild])).rows[0].n,1);
 activityReply=await activity();assert.equal((await activityReply.json()).recorded,false);
 await db.query('UPDATE servers SET left_at=now() WHERE id=$1',[newGuild]);activityReply=await activity();assert.equal((await activityReply.json()).recorded,false);
 console.log('PASS signed activity: creates new active server, replay does not extend activity, left server not revived.');
 const grant=async userId=>fetch(origin+`/v2/server/${server}/dashboard-access-grants`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({source:'bot',userId})});
 let r=await grant(actor);assert.equal(r.status,201,await r.clone().text());const code=await r.json();assert(code.code);assert.equal((await db.query("SELECT count(*)::int n FROM servers WHERE id=$1",[server])).rows[0].n,1);
 assert.equal((await grant(outsider)).status,403);assert(calls.some(path => path.endsWith(`/guilds/${server}/members/${actor}`)));
 console.log('PASS actual setup grant: new server settings and incomplete guild snapshot uses verified Discord member/permissions; outsider denied.');
 const stats={byDay:{'2026-09-01':{regularHitRates:{'18:18':{attacks:2,zeroStars:{attacks:0},oneStars:{attacks:0},twoStars:{attacks:1,destructionPercent:80},threeStars:{attacks:1}}},regularByWarSize:{15:{wars:1,ties:0,townhalls:{18:30}}},totalMissedAttacks:2},'2026-08-31':{regularByWarSize:{15:{wars:999,ties:0,townhalls:{18:999}}}}}};
 await db.query("INSERT INTO war_archive_packs(source,status,first_end_time,last_end_time,stats) VALUES('live','uploaded','2026-08-31','2026-09-01',$1)",[stats]);
 await db.query("INSERT INTO war_archive_packs(source,status,first_end_time,last_end_time,stats) VALUES('live','uploaded','2025-01-01','2025-01-01',$1)",[stats]);
 const read=async suffix=>{const r=await fetch(origin+'/v2/stats/wars/'+suffix+'?time%5Bafter%5D=2026-09-01&time%5Bbefore%5D=2026-09-01&interval=day');assert.equal(r.status,200,await r.clone().text());return r.json();};
 const summary=await read('summary');assert.equal(summary.items.length,1);assert.equal(summary.items[0].wars,1);assert.equal(summary.items[0].accounts,30);
 const hits=await read('hitrates');assert.equal(hits.items[0].attacks,2);assert.equal(hits.items[0].averageStars,2.5);assert.equal(hits.items[0].averageDestruction,90);
 console.log('PASS actual War API: bounded packs, precise stored days, counts and outcomes preserved.');
}finally{child.kill('SIGTERM');discord.closeAllConnections();await new Promise(r=>discord.close(r));await db.end();}
