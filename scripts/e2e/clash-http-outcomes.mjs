// Real API Worker + real shared client + disposable SQL; only the external Clash service is a loopback provider.
import {SignJWT} from 'jose';import pg from 'pg';
import assert from 'node:assert/strict';import {createServer} from 'node:http';import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';
import {Effect} from 'effect';import {botClashEndpoints} from '../../packages/api-contracts/dist/index.js';import {createApiClient,httpTransport} from '../../packages/api-client/dist/index.js';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1');assert.equal(new URL(process.env.TEST_DATABASE_URL).hostname,'127.0.0.1');
let scenario={status:503,reason:'inMaintenance'};
let html=false;let appCase=null;
const provider=createServer(async(req,res)=>{
 if(req.url==='/test/control'&&req.method==='POST'){let body='';for await(const part of req)body+=part;appCase=JSON.parse(body);res.end('{}');return;}
 if(appCase){const cwl=req.url.includes('/leaguegroup');const status=cwl?appCase.cwlStatus:appCase.status;res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(status===200?{state:'notInWar',clan:{},opponent:{}}:{reason:cwl?appCase.cwlReason:appCase.reason}));return;}
 res.writeHead(scenario.status,{'content-type':html?'text/html':'application/json','retry-after':'3','x-request-id':'local-provider-request'});res.end(html?'<html>Upstream service unavailable</html>':JSON.stringify({reason:scenario.reason}));});await new Promise(r=>provider.listen(0,'127.0.0.1',r));
const signingKey=randomBytes(32).toString('base64url');
const token=randomBytes(32).toString('base64url'),origin='http://127.0.0.1:18985';let logs='';
const child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{stdio:['ignore','pipe','pipe'],env:{...process.env,CLASHKING_LOCAL_API_PORT:'18985',CLASHKING_LOCAL_BIND_HOST:'127.0.0.1',CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_LOCAL_DISCORD_CLIENT_ID:'999999999999999999',CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local-only',CLASHKING_E2E_API_BOT_TOKEN:token,CLASHKING_E2E_JWT_ACCESS_SECRET:signingKey,CLASHKING_LOCAL_CLASH_PROXY_ORIGIN:`http://127.0.0.1:${provider.address().port}`}});child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
try{let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs.slice(-3000));try{ready=(await fetch(origin+'/v2/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert(ready,logs.slice(-3000));
 const client=createApiClient({transport:httpTransport(),baseUrl:origin});let count=0;
 for(const endpoint of Object.values(botClashEndpoints)){
  const path=Object.fromEntries([...endpoint.path.matchAll(/:([A-Za-z]+)/g)].map(([,name])=>[name,name==='locationId'?'global':name==='seasonId'?1:'#2PP']));
  const query=endpoint.path.endsWith('/clans')?{name:'Fixture',limit:10,memberList:true}:endpoint.path.includes('/leaguegroup/')?{playerTag:'#2PP'}:{};
  for(const [status,reason] of [[400,'badRequest'],[403,'accessDenied'],[403,'accessDenied.invalidIp'],[404,'notFound'],[429,'tooManyRequests'],[500,'unknownException'],[501,'notImplemented'],[503,'inMaintenance'],[503,'upstreamUnavailable']]){
   scenario={status,reason};const result=await Effect.runPromise(client.executeStatus(endpoint,{path,query,body:{}},{auth:{bearerToken:token}}));assert.equal(result.ok,false);assert.equal(result.status,status,endpoint.path);assert.equal(result.body.reason,reason==='inMaintenance'?'maintenance':reason);count++;
  }
  scenario={status:200,reason:'malformedSuccess'};
  await assert.rejects(Effect.runPromise(client.executeStatus(endpoint,{path,query,body:{}},{auth:{bearerToken:token}})),error=>error._tag==='ResponseDecodeError');
  html=true;scenario={status:503,reason:'unavailable'};
  await assert.rejects(Effect.runPromise(client.executeStatus(endpoint,{path,query,body:{}},{auth:{bearerToken:token}})),error=>error._tag==='ApiResponseError'&&error.status===503&&error.contractMismatch===true);
  html=false;
 }
 if(process.env.CLASHKING_E2E_APP_REPO){
  const db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
  const user='999999999999995501';await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[user]);
  try{
   const access=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(user).setAudience('clashking-web').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(signingKey));
   const runner=spawn(process.execPath,['scripts/e2e/clash-outcomes.mjs'],{cwd:process.env.CLASHKING_E2E_APP_REPO,stdio:'inherit',env:{...process.env,CLASHKING_E2E_BASE_URL:origin,CLASHKING_E2E_ACCESS_TOKEN:access,CLASHKING_E2E_PROVIDER_URL:`http://127.0.0.1:${provider.address().port}`}});
   await new Promise((yes,no)=>{runner.on('error',no);runner.on('exit',code=>code===0?yes():no(Error('App outcome integration failed: '+code)));});
  }finally{await db.query('DELETE FROM auth_users WHERE user_id=$1',[user]);await db.end();}
 }
 assert.equal((await fetch(origin+'/v2/internal/push-token-rotation',{method:'POST'})).status,404);
 assert.equal((await fetch(origin+'/v2/bot/clash/players/%232PP')).status,401);
 console.log(`PASS ${count} real API/client HTTP failures plus 30 malformed-body cases; removed migration route 404; bot authentication enforced.`);
}catch(error){console.error(logs.slice(-2500));throw error;}finally{child.kill('SIGTERM');await new Promise(r=>provider.close(r));}
