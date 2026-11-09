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

 const read=async(path,authorized=true)=>{const response=await fetch(origin+path,{headers:authorized?{authorization:`Bearer ${token}`}:{}});return {status:response.status,data:await response.json()};};
 const path=`/v2/bot/users/${actor}/search-suggestions?type=player`;
 assert.equal((await read(path,false)).status,401);
 const p1='#PYLQGRJC',p2='#PYLQGRJU',clan='#PYLQGRJ';
 await db.query("INSERT INTO basic_player(tag,name,townhall_level,league_id) VALUES($1,'Legend One',18,105000036),($2,'Ranked Two',17,105000034)",[p1,p2]);
 await db.query("INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received,members) VALUES($1,'Search Clan',true,0,2,'',0,0,$2)",[clan,JSON.stringify([{tag:p1,name:'Legend One',town_hall:18},{tag:p2,name:'Ranked Two',town_hall:17}])]);
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Search Guild')",[server]);
 await db.query('INSERT INTO server_clans(server_id,tag) VALUES($1,$2)',[server,clan]);
 await db.query("INSERT INTO user_bookmarks(user_id,entity_type,tag) VALUES($1,'player',$2),($1,'clan',$3)",[actor,p1,clan]);
 const post=await fetch(origin+`/v2/bot/users/${actor}/search-suggestions`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({type:'player',tag:p2,name:'Ranked Two',townHallLevel:17})});assert.equal(post.status,200,await post.text());
 const personal=await read(path);assert.equal(personal.status,200,JSON.stringify(personal.data));assert.deepEqual(personal.data.items.map(x=>x.tag),[p2,p1]);
 assert.equal((await read(`/v2/bot/users/${outsider}/search-suggestions?type=player`)).data.items.length,0);
 assert.deepEqual((await read(path+'&legendsOnly=true')).data.items.map(x=>x.tag),[p1]);
 assert.deepEqual((await read(`/v2/bot/users/${actor}/search-suggestions?type=clan`)).data.items.map(x=>x.tag),[clan]);
 const roster=await read(`/v2/bot/servers/${server}/player-autocomplete?legendsOnly=true`);assert.equal(roster.status,200,JSON.stringify(roster.data));assert.deepEqual(roster.data.items.map(x=>x.tag),[p1]);
 assert.equal((await read(`/v2/bot/servers/${server}/player-autocomplete`)).data.items.length,2);
 assert.equal((await db.query("SELECT count(*)::int n FROM user_recent_searches WHERE user_id=$1 AND entity_type='player' AND tag=$2",[actor,p2])).rows[0].n,1);
 console.log('PASS actual API + PostgreSQL: private recent/bookmark sources, successful search persistence, server roster and Legend filtering.');
}finally{child.kill('SIGTERM');discord.closeAllConnections();await new Promise(r=>discord.close(r));await db.end();}
