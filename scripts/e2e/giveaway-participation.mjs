// Actual local workerd HTTP, Discord signature verification and disposable SQL.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {generateKeyPairSync,sign,randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1');
const dbUrl=new URL(process.env.TEST_DATABASE_URL);assert.equal(dbUrl.hostname,'127.0.0.1');assert.equal(dbUrl.pathname,'/clashking_test');
const root=new URL('../../',import.meta.url).pathname;
const schema=process.env.CLASHKING_LOCAL_SCHEMA_ROOT;assert.ok(schema);
const db=new pg.Client({connectionString:dbUrl.href});await db.connect();
const key=generateKeyPairSync('ed25519');const publicKey=key.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
const app='1402809875855052911',server='1317858645349765150',actor='706149153431879760',other='999999999999996002',channel='1568167494219464815',post='999999999999996003';
// Only Discord's read-only member endpoint is used, for this known development
// server/owner. Credentials stay in memory; no real Discord write is performed.
const token=readFileSync(process.env.CLASHKING_GIVEAWAY_E2E_BOT_TOKEN_FILE,'utf8').trim();
const auth=randomBytes(32).toString('base64url');const id=randomUUID();let sequence=0;let logs='';
const port=18979,origin=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{cwd:root,env:{...process.env,CLASHKING_LOCAL_BIND_HOST:'127.0.0.1',CLASHKING_LOCAL_LAN_IP:'127.0.0.1',CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_DISCORD_CLIENT_ID:app,CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local-test',CLASHKING_LOCAL_DISCORD_BOT_TOKEN:token,CLASHKING_LOCAL_DISCORD_PUBLIC_KEY:publicKey,CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_E2E_API_BOT_TOKEN:auth}});
child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
function proof(action,{who=actor,rootPost=post,author=app,guild=server}={}){
 const rawBody=JSON.stringify({id:String(999999999999970000n+BigInt(++sequence)),application_id:app,guild_id:guild,channel_id:channel,member:{user:{id:who}},type:3,data:{component_type:2,custom_id:action==='enter'?`ck:giveaway:enter:${id}`:`ck:giveaway:leave:${id}:${rootPost}`},message:{id:action==='enter'?post:String(999999999999980000n+BigInt(sequence)),author:{id:author}}});const timestamp=String(Math.floor(Date.now()/1000));return{interaction:{rawBody,timestamp,signature:sign(null,Buffer.from(timestamp+rawBody),key.privateKey).toString('hex')}};
}
async function call(p,status=200){const r=await fetch(`${origin}/v2/runtime/giveaways/${id}/entries`,{method:'POST',headers:{authorization:`Bearer ${auth}`,'content-type':'application/json'},body:JSON.stringify(p)});const body=await r.json();assert.equal(r.status,status,JSON.stringify(body));return body;}
try{
 for(let i=0;i<160;i++){if(child.exitCode!==null)throw Error(logs.slice(-2000));try{if((await fetch(origin+'/v2/health')).ok&&logs.includes('isolated_api_ready'))break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===159)throw Error(logs.slice(-2000));}
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Giveaway E2E')",[server]);
 await db.query("INSERT INTO giveaways(id,server_id,channel_id,message_id,prize,status,start_time,end_time,winners,entries,winners_list) VALUES($1,$2,$3,$4,'E2E','ongoing',now()-interval '1 hour',now()+interval '1 hour',1,$5,'[]')",[id,server,channel,post,JSON.stringify([actor,{user_id:other,label:'preserve'}])]);
 const repeat=await call(proof('enter'));assert.equal(repeat.outcome,'already_entered');assert.equal(repeat.canLeave,true);assert.equal(repeat.entryCount,2);
 const leave=proof('leave');assert.equal((await call(leave)).outcome,'left');assert.equal((await call(leave)).entryCount,1);assert.equal((await call(proof('leave'))).outcome,'already_left');
 assert.deepEqual((await db.query('SELECT entries FROM giveaways WHERE id=$1',[id])).rows[0].entries,[{user_id:other,label:'preserve'}]);
 assert.equal((await call(proof('enter'))).outcome,'entered');await call(leave);assert.equal((await db.query('SELECT jsonb_array_length(entries) n FROM giveaways WHERE id=$1',[id])).rows[0].n,2);
 await call(proof('leave',{author:other}),403);await call(proof('leave',{rootPost:other}),403);await call(proof('leave',{guild:other}),403);
 const concurrent=proof('leave');const pair=await Promise.all([call(concurrent),call(concurrent)]);assert(pair.every(x=>x.outcome==='left'&&x.entryCount===1));
 await call(proof('enter'));await db.query("UPDATE giveaways SET status='ended',end_time=now()-interval '1 minute' WHERE id=$1",[id]);
 const ended=await call(proof('enter'));assert.equal(ended.outcome,'already_entered');assert.equal(ended.canLeave,false);
 assert.equal((await call(proof('leave'),409)).reason,'not_open');assert.equal((await call(proof('enter',{who:other}))).canLeave,false);
 // Rollback must fail rather than deleting replay-protection records.
 let rollbackBlocked=false;try{execFileSync('goose',['-env','/dev/null','-dir',schema+'/database/timescale','postgres',dbUrl.href,'down'],{stdio:'pipe'});}catch{rollbackBlocked=true;}assert(rollbackBlocked);
 assert((await db.query("SELECT count(*)::int n FROM giveaway_entry_receipts WHERE outcome='left'")).rows[0].n>0);
 console.log('PASS: duplicate entry; leave; exact and concurrent replay; rejoin; actor/message scope; closed giveaway; rollback preservation.');
}finally{if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}await db.end();}
