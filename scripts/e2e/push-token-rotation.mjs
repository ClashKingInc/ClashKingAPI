// Real workerd HTTP and disposable Timescale; no production/provider calls.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import pg from 'pg';
import {SignJWT} from 'jose';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1');
const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');
const db=new pg.Client({connectionString:url.href});await db.connect();
const old=randomBytes(32).toString('base64url'),api=randomBytes(32).toString('base64url'),current=randomBytes(32).toString('base64url'),auth=randomBytes(32).toString('base64url'),operator=randomBytes(32).toString('base64url');
const jwtKey=randomBytes(32).toString('base64url');
const hash=s=>createHash('sha256').update(s).digest('hex');
const seal=(value,key,prefix='v1.')=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(hash(key),'hex'),iv);return prefix+Buffer.concat([iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]).toString('base64url');};
const open=(value)=>{assert(value.startsWith('v2.'));const b=Buffer.from(value.slice(3),'base64url'),c=createDecipheriv('aes-256-gcm',Buffer.from(hash(current),'hex'),b.subarray(0,12));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString();};
let logs='';const origin='http://127.0.0.1:18981';
const child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{env:{...process.env,CLASHKING_LOCAL_DISCORD_CLIENT_ID:'999999999999999999',CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local-only',CLASHKING_LOCAL_API_PORT:'18981',CLASHKING_LOCAL_BIND_HOST:'127.0.0.1',CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_E2E_JWT_ACCESS_SECRET:jwtKey,CLASHKING_E2E_DATA_ENCRYPTION_KEY:api,CLASHKING_E2E_API_BOT_TOKEN:auth,CLASHKING_E2E_MOBILE_PUSH_TOKEN_ENCRYPTION_KEY:current,CLASHKING_E2E_MOBILE_PUSH_LEGACY_ENCRYPTION_KEY:old,CLASHKING_E2E_PUSH_TOKEN_MIGRATION_SECRET:operator}});
child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
async function call(body,token=auth,key=operator,status=200){const r=await fetch(origin+'/v2/internal/push-token-rotation',{method:'POST',headers:{authorization:'Bearer '+token,'x-push-token-migration-key':key,'content-type':'application/json'},body:JSON.stringify(body)});const v=await r.json();assert.equal(r.status,status,JSON.stringify(v));return v;}
try{
 for(let i=0;i<160;i++){if(child.exitCode!==null)throw Error(logs.slice(-1500));try{if((await fetch(origin+'/v2/health')).ok&&logs.includes('isolated_api_ready'))break;}catch{}await new Promise(r=>setTimeout(r,250));if(i===159)throw Error(logs.slice(-1500));}
 for(let i=0;i<102;i++){const token='test-device-token-'+i;await db.query(`INSERT INTO mobile_push_devices(user_id,device_id,platform,provider,environment,token_ciphertext,token_hash,enabled,last_seen_at) VALUES('900000000000000001',$1,'ios','fcm','production',$2,$3,true,'2026-01-01')`,[String(i).padStart(3,'0'),i===101?seal(token,'unknown'):seal(token,i===100?current:i%2?api:old,i===100?'v2.':'v1.'),hash(token)]);}
 const before=(await db.query('SELECT * FROM mobile_push_devices ORDER BY device_id')).rows;
 await call({dryRun:true},'wrong',operator,401);await call({dryRun:true},auth,'wrong',403);
 const dry=await call({dryRun:true});assert.equal(dry.visited,100);assert.equal(dry.rotated,100);assert(dry.next);
 assert.deepEqual((await db.query('SELECT * FROM mobile_push_devices ORDER BY device_id')).rows,before);
 const first=await call({dryRun:false});assert.equal(first.rotated,100);
 const second=await call({dryRun:false,after:first.next});assert.equal(second.current,1);assert.equal(second.unreadable,1);assert.equal(second.next,null);
 const after=(await db.query('SELECT * FROM mobile_push_devices ORDER BY device_id')).rows;
 for(let i=0;i<101;i++){assert.equal(open(after[i].token_ciphertext),'test-device-token-'+i);assert.deepEqual({...after[i],token_ciphertext:before[i].token_ciphertext},before[i]);}
 assert.deepEqual(after[101],before[101]);const again=await call({dryRun:false});assert.equal(again.current,100);assert.equal(again.rotated,0);
 await db.query("INSERT INTO auth_users(user_id,provider) VALUES('900000000000000001','discord')");
 const bearer=await new SignJWT({device:'fresh-device'}).setProtectedHeader({alg:'HS256'}).setSubject('900000000000000001').setAudience('clashking-native').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(jwtKey));
 const registered=await fetch(origin+'/v2/notifications/devices',{method:'POST',headers:{authorization:'Bearer '+bearer,'content-type':'application/json'},body:JSON.stringify({token:'fresh-provider-token-after-rotation',device_id:'fresh-device',platform:'ios',enabled:true})});assert.equal(registered.status,200,await registered.text());
 const saved=(await db.query("SELECT token_ciphertext,token_hash FROM mobile_push_devices WHERE device_id='fresh-device'")).rows[0];assert.equal(open(saved.token_ciphertext),'fresh-provider-token-after-rotation');assert.equal(saved.token_hash,hash('fresh-provider-token-after-rotation'));
 console.log('PASS: real API rotation, old/API/current key formats, operator auth, dry run, 100-row cursor, unchanged token hashes/settings/timestamps, unreadable preservation, idempotent rerun, new registration uses v2.');
}finally{if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}await db.end();}
