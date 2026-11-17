// Exercise the actual Worker, auth and SQL against disposable Timescale.
// The loopback game provider is the external API boundary, not a mocked app service.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { SignJWT } from 'jose';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1');
const dsn = new URL(process.env.TEST_DATABASE_URL);
assert.equal(dsn.hostname, '127.0.0.1'); assert.equal(dsn.pathname, '/clashking_test');
const db = new pg.Client({ connectionString: dsn.href }); await db.connect();
const user = `activity-${randomUUID()}`, clan = '#PYLQRRJC', tags = ['#PYLQRRJP','#PYLQRRJQ','#PYLQRRJG'];
const secret = randomBytes(32).toString('base64url');
let roster = [...tags], unavailable = false, child, logs = '';
const provider = createServer((req, res) => {
  res.setHeader('content-type','application/json');
  if (unavailable) { res.statusCode=503; res.end('{}'); return; }
  res.end(JSON.stringify({tag:clan,memberList:roster.map(tag=>({tag,name:'Local',role:'member',expLevel:200,trophies:5000,clanRank:1,previousClanRank:1,donations:0,donationsReceived:0,townHallLevel:19}))}));
});
await new Promise(r=>provider.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:8836';
try {
  await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[user]);
  await db.query("INSERT INTO player_links(user_id,tag,is_verified,source) VALUES($1,$2,true,'app')",[user,tags[0]]);
  await db.query("INSERT INTO player_online_events(tag,clan_tag,seen_at) VALUES($1,$2,now()-interval '8 minutes')",[tags[1],clan]);
  await db.query("INSERT INTO join_leave_history(player_tag,clan_tag,type,time) VALUES($1,$3,'join',now()-interval '2 hours'),($2,$3,'join',now()-interval '2 hours'),($2,$3,'leave',now()-interval '1 hour')",[tags[1],tags[2],clan]);
  child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{env:{...process.env,CLASHKING_LOCAL_API_PORT:'8836',CLASHKING_LOCAL_DISCORD_CLIENT_ID:'999999999999999999',CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local',CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_E2E_JWT_ACCESS_SECRET:secret,CLASHKING_LOCAL_CLASH_PROXY_ORIGIN:`http://127.0.0.1:${provider.address().port}`},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  let ready=false; for(let i=0;i<160;i++){try{ready=(await fetch(origin+'/v2/health')).ok&&logs.includes('isolated_api_ready')}catch{} if(ready)break; assert.equal(child.exitCode,null,logs.slice(-2000)); await new Promise(r=>setTimeout(r,250));}assert(ready,logs.slice(-2000));
  const token=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(user).setAudience('clashking-web').setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(secret));
  const path=origin+'/v2/clan/'+encodeURIComponent(clan)+'/member-activity';
  const get=async(status,auth=token)=>{const response=await fetch(path,{headers:auth?{authorization:`Bearer ${auth}`}:{}});const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;};
  const joinsPath=origin+'/v2/clan/'+encodeURIComponent(clan)+'/member-joins';
  const getJoins=async()=>{const response=await fetch(joinsPath);assert.equal(response.status,200);const body=await response.json();assert(body.items.every(x=>!Object.hasOwn(x,'lastObservedAt')),'Public joins must not expose online activity');return body;};
  const joins=await getJoins();assert.equal(joins.items.length,3);assert(joins.items.find(x=>x.tag===tags[1]).joinedAt);assert.equal(joins.items.find(x=>x.tag===tags[2]).joinedAt,null);
  await get(401,null);
  const result=await get(200);assert.equal(result.items.length,3);
  assert(result.items.find(x=>x.tag===tags[1]).lastObservedAt);assert(result.items.find(x=>x.tag===tags[1]).joinedAt);
  assert.equal(result.items.find(x=>x.tag===tags[0]).lastObservedAt,null);
  assert.equal(result.items.find(x=>x.tag===tags[2]).joinedAt,null,'A leave ends the observed membership episode');
  roster=tags.slice(1);await get(403);await getJoins(); // stale stored link cannot authorize a former clan member
  roster=[...tags];unavailable=true;await get(503);unavailable=false;
  await db.query('UPDATE player_links SET is_verified=false WHERE user_id=$1',[user]);await get(403);await getJoins();
  console.log('PASS actual local Worker: verified current membership, missing history, join/leave episodes, former-member denial, unverified denial, provider outage, anonymous denial and public join privacy');
} catch(error){console.error(logs.slice(-4000));throw error}
finally {
  child?.kill('SIGTERM');await new Promise(r=>provider.close(r));
  await db.query('DELETE FROM player_online_events WHERE tag=ANY($1::text[]) AND clan_tag=$2',[tags,clan]);
  await db.query('DELETE FROM join_leave_history WHERE player_tag=ANY($1::text[]) AND clan_tag=$2',[tags,clan]);
  await db.query('DELETE FROM player_links WHERE user_id=$1',[user]);await db.query('DELETE FROM auth_users WHERE user_id=$1',[user]);await db.end();
}
