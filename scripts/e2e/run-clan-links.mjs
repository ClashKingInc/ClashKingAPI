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
const signingKey=randomBytes(32).toString('base64url'),botKey=randomBytes(32).toString('base64url')
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
      CLASHKING_E2E_API_BOT_TOKEN:botKey},stdio:['ignore','pipe','pipe']})
  api.stdout.on('data',data=>{logs+=data});api.stderr.on('data',data=>{logs+=data})
  let ready=false
  for(let attempt=0;attempt<120;attempt++) {
    if(api.exitCode!==null)throw Error(`Local API exited: ${logs.slice(-3000)}`)
    try{ready=(await fetch(`${origin}/v2/health`,{signal:AbortSignal.timeout(2000)})).ok}catch{}
    if(ready&&logs.includes('isolated_api_ready'))break
    await new Promise(resolve=>setTimeout(resolve,500))
  }
  assert(ready&&logs.includes('isolated_api_ready'),logs.slice(-3000))
  const request=async(path,{status=200,method='GET',body,bearer=token}={})=>{
    const response=await fetch(origin+path,{method,headers:{authorization:`Bearer ${bearer}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)})
    const value=await response.json()
    assert.equal(response.status,status,`${path}: ${JSON.stringify(value)}`)
    return value
  }
  try {
    await verifyClanLinks({db,request,server,other,actor,clanProvider})
    await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{links:'manage'}}])
    const linkPath=`/v2/links/server/${server}/clans/%23QUP/%23QUL`,verifiedPath=`/v2/links/server/${server}/clans/%23QUP/%23QUY`;
    await request(linkPath,{method:'POST',body:{userId:actor},status:403});
    assert.equal((await db.query("SELECT count(*)::int AS n FROM player_links WHERE tag='#QUL'")).rows[0].n,0);
    await db.query("INSERT INTO server_clan_verifications(server_id,clan_tag,challenge_id,marker,marker_index,requested_by,state,check_after,next_check_at,expires_at,verified_at) VALUES($1,'#QUP',$2,'apple',0,$3,'verified',now()+interval '1 minute',now()+interval '1 minute',now()+interval '1 hour',now())",[server,randomUUID(),actor]);
    await request(linkPath,{method:'POST',body:{userId:'999999999999994999'},status:403});
    await request(`/v2/links/server/${server}/clans/%23QUP/%23QQQ`,{method:'POST',body:{userId:actor},status:404});
    await request(`/v2/links/server/${server}/clans/%23QQQ/%23QUL`,{method:'POST',body:{userId:actor},status:404});
    const added=await request(linkPath,{method:'POST',body:{userId:actor}});assert.equal(added.verified,false);
    await request(verifiedPath,{method:'POST',body:{userId:actor},status:403});
    await request(verifiedPath,{method:'DELETE',status:403});
    await request(linkPath,{method:'DELETE'});
    const order=(await db.query('SELECT order_index FROM player_links WHERE user_id=$1 ORDER BY order_index',[actor])).rows.map(row=>row.order_index);assert.deepEqual(order,order.map((_,i)=>i));
    const delegate='999999999999994920',role='999999999999994921';
    await db.query('INSERT INTO discord_cache.members(guild_id,user_id,data) VALUES($1,$2,$3)',[server,delegate,{user:{id:delegate,username:'Links moderator'},roles:[role]}]);
    await db.query('INSERT INTO discord_cache.roles(guild_id,id,data) VALUES($1,$2,$3)',[server,role,{id:role,name:'Link team',permissions:'0'}]);
    await db.query("INSERT INTO dashboard_role_grants(server_id,role_id,section,access_level) VALUES($1,$2,'links','view')",[server,role]);
    const modPath=`/v2/bot/servers/${server}/modlinks`,add={action:'add',actorId:delegate,clanTag:'#QUP',playerTag:'#QUL',userId:actor};
    await request(modPath,{method:'POST',body:add,bearer:token,status:403});
    await request(modPath,{method:'POST',body:add,bearer:botKey,status:403});
    await db.query("UPDATE dashboard_role_grants SET access_level='manage' WHERE server_id=$1 AND role_id=$2",[server,role]);
    const moderated=await request(modPath,{method:'POST',body:add,bearer:botKey});assert.equal(moderated.userId,actor);assert.equal(moderated.verified,false);
    await request(modPath,{method:'POST',body:{...add,userId:delegate},bearer:botKey,status:409});
    await request(modPath,{method:'POST',body:{...add,action:'remove',playerTag:'#QUY'},bearer:botKey,status:403});
    await request(`/v2/bot/servers/${other}/modlinks`,{method:'POST',body:add,bearer:botKey,status:403});
    await db.query("UPDATE server_clan_verifications SET state='expired',verified_at=NULL WHERE server_id=$1 AND clan_tag='#QUP'",[server]);
    await request(modPath,{method:'POST',body:{...add,action:'remove'},bearer:botKey,status:403});
    assert.equal((await db.query("SELECT user_id FROM player_links WHERE tag='#QUL'")).rows[0].user_id,actor);
    await db.query("UPDATE server_clan_verifications SET state='verified',verified_at=now() WHERE server_id=$1 AND clan_tag='#QUP'",[server]);
    await db.query("UPDATE player_links SET is_verified=true WHERE tag='#QUL'");
    await request(modPath,{method:'POST',body:{...add,action:'remove'},bearer:botKey,status:403});
    await db.query("UPDATE player_links SET is_verified=false WHERE tag='#QUL'");
    await request(modPath,{method:'POST',body:{...add,action:'remove'},bearer:botKey});
    await db.query("DELETE FROM dashboard_role_grants WHERE server_id=$1 AND role_id=$2",[server,role]);
    await request(modPath,{method:'POST',body:add,bearer:botKey,status:403});
    // Concurrent unverified assignments cannot replace one another's owner.
    const concurrent=await Promise.all([actor,delegate].map(userId=>fetch(origin+linkPath,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({userId})})));
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    await request(linkPath,{method:'DELETE'});
    await request(linkPath,{method:'POST',body:{userId:actor}});
    const report=await request(`/v2/links/server/${server}/clans`);
    assert.equal(report.statistics.players,4);assert.equal(report.statistics.linked,4);assert.equal(report.statistics.verified,2);
    const events=`/v2/server/${server}/clan/%23QUP/war-events`;
    await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{logs:'view'}}]);
    assert.equal((await request(events)).enabled,false);await request(events,{method:'PUT',body:{enabled:true},status:403});
    await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{logs:'manage'}}]);
    assert.equal((await request(events,{method:'PUT',body:{enabled:true}})).enabled,true);
    assert.equal((await db.query("SELECT war_events_enabled FROM server_clans WHERE server_id=$1 AND tag='#QUP'",[server])).rows[0].war_events_enabled,true);
    await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{clans:'manage'}}]);
    await request(events,{status:403});
    await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{giveaways:'view'}}]);
    await db.query("INSERT INTO giveaways(id,server_id,prize,status,start_time,end_time,winners,entries) VALUES('entrant-identity',$1,'Identity fixture','ongoing',now()-interval '1 hour',now()+interval '1 hour',1,$2::jsonb)",[server,JSON.stringify([actor,actor,'999999999999994999'])]);
    const entrants=await request(`/v2/server/${server}/giveaways/entrant-identity/entries`);
    assert.equal(entrants.totalEntries,3);assert.equal(entrants.uniqueUsers,2);
    const current=entrants.entrants.find(row=>row.userId===actor),former=entrants.entrants.find(row=>row.userId==='999999999999994999');
    assert.equal(current.username,'Current member');assert.equal(current.inServer,true);assert.equal(current.entries,2);assert.equal(current.winChance,66.67);
    assert.equal(former.inServer,false);assert.equal(former.username,undefined);assert.equal(former.winChance,33.33);
    await db.query("DELETE FROM giveaways WHERE id='entrant-identity' AND server_id=$1",[server]);
    console.log('PASS giveaway entries preserve weighted counts and resolve current members without inventing former-member identities');
    console.log('PASS family statistics include hidden links without identities; War events requires Logs view/manage in scoped sessions');
    const categories=(await db.query('SELECT id::text,name FROM server_clan_categories WHERE server_id=$1',[server])).rows;
    const priority=categories.find(row=>row.name==='Priority').id,casual=categories.find(row=>row.name==='Casual').id;
    const orderPath=`/v2/server/${server}/clans/order`,patch=tag=>`/v2/server/${server}/clan/${encodeURIComponent(tag)}/settings`;
    const positions=async()=> (await db.query('SELECT tag,category_id::text,position FROM server_clans WHERE server_id=$1 ORDER BY category_id NULLS LAST,position',[server])).rows;
    const assertConsecutive=async()=>{const groups=new Map();for(const row of await positions()){const key=row.category_id??'none';const values=groups.get(key)??[];values.push(row.position);groups.set(key,values);}for(const values of groups.values())assert.deepEqual(values,values.map((_,i)=>i));};
    await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{clans:'view'}}]);
    await request(orderPath,{method:'PUT',body:{categoryId:priority,clanTags:['#QUP','#QUV']},status:403});
    assert.equal((await request(`/v2/server/${server}/clan-categories`)).items.length,3);
    await request(`/v2/server/${server}/clan-categories`,{method:'POST',body:{name:'Denied'},status:403});
    await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{clans:'manage'}}]);
    const created=await request(`/v2/server/${server}/clan-categories`,{method:'POST',body:{name:'Temporary category'},status:201});
    await request(`/v2/server/${server}/clan-categories/${created.category.id}`,{method:'DELETE'});
    await request(orderPath,{method:'PUT',body:{categoryId:priority,clanTags:['#QUP','#QUV']}});
    assert.deepEqual((await positions()).filter(row=>row.category_id===priority).map(row=>row.tag),['#QUP','#QUV']);
    for(const clanTags of [['#QUP'],['#QUP','#QUP'],['#QUP','#QUQ']])await request(orderPath,{method:'PUT',body:{categoryId:priority,clanTags},status:400});
    await request(orderPath,{method:'PUT',body:{categoryId:'not-a-uuid',clanTags:[]},status:400});
    const foreignCategory=(await db.query('SELECT id::text FROM server_clan_categories WHERE server_id=$1',[other])).rows[0].id;
    await request(orderPath,{method:'PUT',body:{categoryId:foreignCategory,clanTags:[]},status:404});
    await request(patch('#QUP'),{method:'PATCH',body:{category:'Casual'}});
    assert.deepEqual((await positions()).filter(row=>row.category_id===casual).map(row=>row.tag),['#QUQ','#QUP']);await assertConsecutive();
    await request(orderPath,{method:'PUT',body:{categoryId:casual,clanTags:['#QUP','#QUQ']}});
    await request(patch('#QUP'),{method:'PATCH',body:{category:null}});
    assert.deepEqual((await positions()).filter(row=>row.category_id===null).map(row=>row.tag),['#QUR','#QUP']);await assertConsecutive();
    await request(`/v2/server/${server}/clans/%23QUQ`,{method:'DELETE'});await assertConsecutive();
    await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{clans:'manage'}}]);
    await request(`/v2/server/${server}/clan-categories/${priority}`,{method:'DELETE'});
    assert.deepEqual((await positions()).map(row=>row.tag),['#QUR','#QUP','#QUV']);await assertConsecutive();
    const results=await Promise.all([
      fetch(origin+orderPath,{method:'PUT',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({categoryId:null,clanTags:['#QUV','#QUP','#QUR']})}),
      fetch(origin+patch('#QUV'),{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({category:'Casual'})})
    ]);
    assert([200,400].includes(results[0].status));assert.equal(results[1].status,200);await assertConsecutive();
    const listed=await request(`/v2/server/${server}/clans`);const basic=await request(`/v2/server/${server}/clans-basic`);
    assert.deepEqual(listed.map(row=>row.tag),basic.map(row=>row.tag));
    clanProvider.clans.set('#QQQ',{...clanProvider.clans.get('#QUP'),tag:'#QQQ',name:'New clan',members:1,description:'Fixture',isWarLogPublic:true,warWins:0,warWinStreak:0,clanPoints:0,memberList:[{tag:'#QQY',name:'Member',donations:0,donationsReceived:0}]});
    await request(`/v2/server/${server}/clans`,{method:'POST',body:{tag:'#QQQ'}});await assertConsecutive();
    const uncategorized=(await positions()).filter(row=>row.category_id===null);assert.equal(uncategorized.at(-1).tag,'#QQQ');
    await request(`/v2/server/${server}/clans/%23QQQ`,{method:'DELETE'});await assertConsecutive();
    console.log('PASS saved clan order: scoped write permission, complete category membership, invalid/foreign denial, moves/removal/category deletion reindex, concurrent move vs reorder, full/basic read consistency');
    console.log('PASS verified-clan management: Dashboard and bot share Links-manage permission, protect verified owners, deny non-family/unverified clans, reindex deletion, preserve failed edits, prevent concurrent reassignment and recheck revoked access');
    console.log('PASS tracked roster link creation through actual HTTP, scoped auth and SQL transaction')
  } catch(cause) { console.error(logs.slice(-6000)); throw cause }
} finally {
  if(api&&api.exitCode===null){api.kill('SIGTERM');await Promise.race([once(api,'exit'),new Promise(resolve=>setTimeout(resolve,5000))]);if(api.exitCode===null)api.kill('SIGKILL')}
  await db.end()
  await clanProvider.close()
}
