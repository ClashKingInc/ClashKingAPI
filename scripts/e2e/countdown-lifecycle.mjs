// Actual local Worker + canonical disposable SQL + loopback Discord provider.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import pg from 'pg'
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1')
const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1')
const db=new pg.Client({connectionString:url.href});await db.connect()
const guild='999999999999991901',actor='999999999999991902',app='999999999999999999'
const channels=new Map();let created=0,mode='ok',api,logs=''
const provider=createServer(async(req,res)=>{
 res.setHeader('content-type','application/json')
 if(req.url==='/api/v10/users/@me'){res.end(JSON.stringify({id:app,username:'Local Bot'}));return}
 if(req.url===`/api/v10/guilds/${guild}/channels`&&req.method==='POST'){
  let raw='';for await(const c of req)raw+=c
  const id=String(999999999999991910n+BigInt(created++));const channel={id,guild_id:guild,type:2,name:JSON.parse(raw).name};channels.set(id,channel);res.end(JSON.stringify(channel));return
 }
 const match=/^\/api\/v10\/channels\/(\d+)$/.exec(req.url??'')
 if(match){
  if(mode==='outage'){res.statusCode=503;res.end('{}');return}
  if(mode==='denied'){res.statusCode=403;res.end('{"code":50013}');return}
  const c=channels.get(match[1]);if(!c){res.statusCode=404;res.end('{}');return}
  res.end(JSON.stringify(c));return
 }
 res.statusCode=404;res.end('{}')
});await new Promise(r=>provider.listen(0,'127.0.0.1',r))
const key=()=>randomBytes(32).toString('base64url'),signingKey=key();const port=8813
try{
 await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[actor])
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Countdown lifecycle')",[guild])
 const generation=randomUUID()
 await db.query(`INSERT INTO discord_cache.gateway_shards(application_id,shard_id,shard_count,generation,healthy,heartbeat_at) VALUES($1,0,1,$2,true,now())`,[app,generation])
 await db.query(`INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete) VALUES($1,$2,$3,0,$4,true,true,true)`,[guild,{owner_id:actor},app,generation])
 const permissions={manager:true,full_access:true,sections:{logs:'edit'}}
 const grant=(await db.query(`INSERT INTO dashboard_access_grants(token_hash,user_id,server_id,source,permissions) VALUES($1,$2,$3,'bot',$4) RETURNING id`,[randomUUID(),actor,guild,permissions])).rows[0].id
 const session=(await db.query(`INSERT INTO dashboard_scoped_sessions(grant_id,user_id,server_id,permissions,refresh_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour') RETURNING id`,[grant,actor,guild,permissions,randomUUID()])).rows[0].id
 const token=await new SignJWT({dashboard_session:session}).setProtectedHeader({alg:'HS256'}).setSubject(actor).setAudience('clashking-server-dashboard').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signingKey))
 api=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{env:{...process.env,CLASHKING_LOCAL_DISCORD_TEST_ORIGIN:`http://127.0.0.1:${provider.address().port}`,CLASHKING_LOCAL_DISCORD_BOT_TOKEN:'local-only',CLASHKING_LOCAL_ADMIN_IDENTITY:'1',CLASHKING_LOCAL_ADMIN_PORT:'8814',CLASHKING_E2E_DATA_ENCRYPTION_KEY:key(),CLASHKING_E2E_AI_USAGE_SECRET:key(),CLASHKING_E2E_JWT_ACCESS_SECRET:signingKey,CLASHKING_E2E_EMAIL_HASH_SECRET:key(),CLASHKING_E2E_API_BOT_TOKEN:key(),CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_DISCORD_CLIENT_ID:app,CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local-only',CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_LOCAL_STATIC_ASSETS_ROOT:process.env.CLASHKING_E2E_STATIC_ASSETS_ROOT??'/Users/matthewanderson/PycharmProjects/clashking_assets/assets/static_data'},stdio:['ignore','pipe','pipe']})
 api.stdout.on('data',d=>logs+=d);api.stderr.on('data',d=>logs+=d)
 let ready=false;for(let i=0;i<120;i++){if(api.exitCode!==null)throw Error(logs.slice(-4000));try{ready=(await fetch(`http://127.0.0.1:${port}/v2/health`)).ok&&logs.includes('isolated_api_ready')}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500))}assert(ready,logs.slice(-4000))
 const request=async(method,status=200)=>{const res=await fetch(`http://127.0.0.1:${port}/v2/server/${guild}/countdowns`,{method,headers:{authorization:`Bearer ${token}`,...(method==='GET'?{}:{'content-type':'application/json'})},...(method==='GET'?{}:{body:JSON.stringify({countdown_type:'cwl_timer'})})});const body=await res.json();assert.equal(res.status,status,JSON.stringify(body));return body}
 const first=await request('POST');assert.equal(created,1)
 await request('DELETE');let listed=await request('GET');assert.equal(listed.countdowns.find(x=>x.type==='cwl_timer').enabled,false)
 assert.equal((await db.query('SELECT channel_id FROM server_countdowns WHERE server_id=$1',[guild])).rows[0].channel_id,first.channel_id)
 const reused=await request('POST');assert.equal(reused.channel_id,first.channel_id);assert.equal(created,1)
 await request('DELETE');mode='outage';await request('POST',503);assert.equal(created,1);assert.equal((await db.query('SELECT disabled FROM server_countdowns WHERE server_id=$1',[guild])).rows[0].disabled,true)
 mode='ok';channels.delete(first.channel_id);const replacement=await request('POST');assert.notEqual(replacement.channel_id,first.channel_id);assert.equal(created,2)
 await request('DELETE');mode='denied';await request('POST');assert.equal(created,3)
 console.log('PASS actual API countdown lifecycle: retained disable, reuse, missing/forbidden replacement, outage preservation')
}finally{if(api&&api.exitCode===null){api.kill('SIGTERM');await Promise.race([once(api,'exit'),new Promise(r=>setTimeout(r,5000))]);if(api.exitCode===null)api.kill('SIGKILL')}await new Promise(r=>provider.close(r));await db.end()}
