// Run with the canonical with-test-integration.sh --profile retained-api harness.
// This exercises the real workerd HTTP service, SQL, Gateway cache and JWT auth.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import pg from 'pg'
import { verifyClanLinks } from './clan-links.mjs'
import { startBotCustomizationProvider } from './bot-customization-provider.mjs'

assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1')
const dsn=new URL(process.env.TEST_DATABASE_URL ?? '')
assert.equal(dsn.hostname,'127.0.0.1')
assert.equal(dsn.pathname,'/clashking_test')
const db=new pg.Client({connectionString:dsn.href})
await db.connect()
const port=8813,origin=`http://127.0.0.1:${port}`,applicationId='999999999999999999'
const actor='999999999999994901',server='999999999999994902',other='999999999999994903'
const signingKey=randomBytes(32).toString('base64url')
let api,logs=''
const clanProvider=await startBotCustomizationProvider()
try {
  const generation=randomUUID(),permissions={manager:false,sections:{links:'view'}}
  await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[actor])
  for(const id of [server,other])await db.query("INSERT INTO servers(id,name) VALUES($1,'Clan Links E2E')",[id])
  await db.query(`INSERT INTO discord_cache.gateway_shards(application_id,shard_id,shard_count,generation,healthy,heartbeat_at)
    VALUES($1,0,1,$2,true,now())`,[applicationId,generation])
  for(const id of [server,other])await db.query(`INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete)
    VALUES($1,$2,$3,0,$4,true,true,true)`,[id,{owner_id:actor},applicationId,generation])
  const grant=(await db.query(`INSERT INTO dashboard_access_grants(token_hash,user_id,server_id,source,permissions)
    VALUES($1,$2,$3,'bot',$4) RETURNING id`,[randomUUID(),actor,server,permissions])).rows[0].id
  const session=(await db.query(`INSERT INTO dashboard_scoped_sessions(grant_id,user_id,server_id,permissions,refresh_hash,expires_at)
    VALUES($1,$2,$3,$4,$5,now()+interval '1 hour') RETURNING id`,[grant,actor,server,permissions,randomUUID()])).rows[0].id
  const token=await new SignJWT({dashboard_session:session}).setProtectedHeader({alg:'HS256'}).setSubject(actor)
    .setAudience('clashking-server-dashboard').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signingKey))
  api=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{
    env:{...process.env,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_BIND_HOST:'127.0.0.1',
      CLASHKING_LOCAL_CLASH_PROXY_ORIGIN:clanProvider.origin,
      CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0',
      CLASHKING_LOCAL_DISCORD_CLIENT_ID:applicationId,CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local-only',
      CLASHKING_E2E_DATA_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
      CLASHKING_E2E_AI_USAGE_SECRET:randomBytes(32).toString('base64url'),
      CLASHKING_E2E_JWT_ACCESS_SECRET:signingKey,CLASHKING_E2E_EMAIL_HASH_SECRET:randomBytes(32).toString('base64url'),
      CLASHKING_E2E_API_BOT_TOKEN:randomBytes(32).toString('base64url')},stdio:['ignore','pipe','pipe']})
  api.stdout.on('data',data=>{logs+=data});api.stderr.on('data',data=>{logs+=data})
  let ready=false
  for(let attempt=0;attempt<120;attempt++) {
    if(api.exitCode!==null)throw Error(`Local API exited: ${logs.slice(-3000)}`)
    try{ready=(await fetch(`${origin}/v2/health`,{signal:AbortSignal.timeout(2000)})).ok}catch{}
    if(ready&&logs.includes('isolated_api_ready'))break
    await new Promise(resolve=>setTimeout(resolve,500))
  }
  assert(ready&&logs.includes('isolated_api_ready'),logs.slice(-3000))
  const request=async(path,{status=200,method='GET',body}={})=>{
    const response=await fetch(origin+path,{method,headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)})
    const value=await response.json()
    assert.equal(response.status,status,`${path}: ${JSON.stringify(value)}`)
    return value
  }
  try {
    await verifyClanLinks({db,request,server,other,actor,clanProvider})
    await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{links:'manage'}}])
    await request(`/v2/links/server/${server}/clans/%23QUP/%23QUL`,{method:'POST',body:{userId:actor}})
    assert.equal((await db.query("SELECT user_id FROM player_links WHERE tag='#QUL'")).rows[0].user_id,actor,'Link creation uses the tracked roster even when the SQL roster is empty')
    console.log('PASS tracked roster link creation through actual HTTP, scoped auth and SQL transaction')
  } catch(cause) { console.error(logs.slice(-6000)); throw cause }
} finally {
  if(api&&api.exitCode===null){api.kill('SIGTERM');await Promise.race([once(api,'exit'),new Promise(resolve=>setTimeout(resolve,5000))]);if(api.exitCode===null)api.kill('SIGKILL')}
  await db.end()
  await clanProvider.close()
}
