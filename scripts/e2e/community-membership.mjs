// Real local Worker/auth/SQL path. Discord alone uses a loopback provider fixture.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { SignJWT } from 'jose'
import { build } from 'esbuild'
import pg from 'pg'
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1')
const dsn=new URL(process.env.TEST_DATABASE_URL)
assert.equal(dsn.hostname,'127.0.0.1');assert.equal(dsn.pathname,'/clashking_test')
const db=new pg.Client({connectionString:dsn.href})
const actor='999999999999991291', email='999999999999991292'
let calls=0, api, logs=''
const provider=createServer((req,res)=>{
 req.resume(); res.setHeader('content-type','application/json'); calls++
 if (req.url !== '/api/v10/users/@me') { res.statusCode=500;res.end('{}');return }
 res.end(JSON.stringify({id:actor,username:'Fixture',discriminator:'0',avatar:null}))
})
const secret=randomBytes(32).toString('base64url'), encryptionKey=randomBytes(32).toString('base64url'), device='community-cache', port=8897, origin=`http://127.0.0.1:${port}`
try {
 await db.connect();await new Promise(r=>provider.listen(0,'127.0.0.1',r))
 await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[actor])
 await db.query("INSERT INTO auth_users(user_id,provider,email_hash,username,password_hash) VALUES($1,'email','community-fixture-hash','fixture','not-a-real-password')",[email])
 const bundle=await build({entryPoints:['workers/api/src/fernet.ts'],bundle:true,write:false,platform:'node',format:'esm'})
 const {encryptStoredFernet}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
 const encrypted=await encryptStoredFernet('fixture-oauth',encryptionKey)
 await db.query("INSERT INTO auth_discord_tokens(user_id,device_id,access_token_ciphertext,refresh_token_ciphertext,expires_at) VALUES($1,$2,$3,$3,now()+interval '1 hour')",[actor,device,encrypted])
 await db.query("INSERT INTO discord_cache.members(guild_id,user_id,data,updated_at) VALUES('923764211845312533',$1,'{}',now()-interval '1 year')",[actor])
 const token=async user=>new SignJWT({device}).setProtectedHeader({alg:'HS256'}).setSubject(user).setAudience('clashking-native').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(secret))
 api=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{env:{...process.env,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_E2E_JWT_ACCESS_SECRET:secret,CLASHKING_E2E_DATA_ENCRYPTION_KEY:encryptionKey,CLASHKING_LOCAL_DISCORD_CLIENT_ID:'999999999999999999',CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'fixture',CLASHKING_LOCAL_DISCORD_BOT_TOKEN:'fixture',CLASHKING_LOCAL_DISCORD_TEST_ORIGIN:`http://127.0.0.1:${provider.address().port}`,CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0'},stdio:['ignore','pipe','pipe']})
 api.stdout.on('data',d=>logs+=d);api.stderr.on('data',d=>logs+=d)
 let ready=false
 for(let i=0;i<120;i++){if(api.exitCode!==null)throw Error(logs.slice(-5000));try{ready=(await fetch(origin+'/v2/health')).ok&&logs.includes('isolated_api_ready')}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500))}
 assert(ready,logs.slice(-5000))
 const request=async(user,status,expected)=>{
 const r=await fetch(origin+'/v2/auth/me',{headers:user?{authorization:`Bearer ${await token(user)}`}:{},signal:AbortSignal.timeout(30000)})
 const body=await r.json();assert.equal(r.status,status,JSON.stringify(body));if(expected!==undefined)assert.equal(body.discord_community_member,expected)
 }
 await request(actor,200,true)
 assert.equal(calls,1,'Only the existing auth profile request; no membership request')
 await db.query("DELETE FROM discord_cache.members WHERE user_id=$1",[actor])
 await request(actor,200,false)
 assert.equal(calls,2)
 const before=calls;await request(email,200,false);assert.equal(calls,before)
 await request(null,401);assert.equal(calls,before)
 // A failed optional cache query must not turn a valid auth/me into an error.
 await db.query('ALTER TABLE discord_cache.members RENAME TO members_unavailable')
 try { await request(actor,200,false) } finally { await db.query('ALTER TABLE discord_cache.members_unavailable RENAME TO members') }
 console.log('PASS cached community auth/me: stale membership accepted without Gateway health, cache miss, email-only, unauthenticated, failed cache query; no added Discord requests; actual local Worker/SQL path')
} finally {
 if(api&&api.exitCode===null){api.kill('SIGTERM');await Promise.race([once(api,'exit'),new Promise(r=>setTimeout(r,5000))]);if(api.exitCode===null)api.kill('SIGKILL')}
 await new Promise(r=>provider.close(r));await db.end()
}
