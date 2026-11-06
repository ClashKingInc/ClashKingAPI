// Runs through the real local Worker, JWT verification, Gateway cache and SQL.
// Called by the disposable Timescale API integration runner; no remote writes.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'

export async function verifyScopedDashboardAccess({ db, origin, signingKey, applicationId, botKey }) {
  assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1')
  const actor='999999999999994901', server='999999999999994902', other='999999999999994903'
  const generation=randomUUID(), roster=randomUUID(), foreignRoster=randomUUID()
  await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[actor])
  for (const id of [server,other]) await db.query("INSERT INTO servers(id,name) VALUES($1,'Scoped E2E')",[id])
  await db.query(`INSERT INTO discord_cache.gateway_shards(application_id,shard_id,shard_count,generation,healthy,heartbeat_at)
    VALUES($1,0,1,$2,true,now()) ON CONFLICT(application_id,shard_id) DO UPDATE SET generation=EXCLUDED.generation,heartbeat_at=now(),healthy=true`,[applicationId,generation])
  for (const id of [server,other]) await db.query(`INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete)
    VALUES($1,$2,$3,0,$4,true,true,true)`,[id,{owner_id:actor},applicationId,generation])
  for (const [id,guild] of [[roster,server],[foreignRoster,other]]) await db.query(`INSERT INTO rosters(id,server_id,alias,roster_type,signup_scope)
    VALUES($1,$2,'Original alias','family','family-only')`,[id,guild])
  for (const [share,guild] of [['ScopedOwnView01',server],['ScopedOtherView1',other]]) await db.query(`INSERT INTO roster_views(server_id,share_id,name,source_code,created_by_discord_user_id)
    VALUES($1,$2,'Scoped view','local source',$3)`,[guild,share,actor])
  const permissions={manager:false,sections:{rosters:'view',links:'view'}}
  const grant=(await db.query(`INSERT INTO dashboard_access_grants(token_hash,user_id,server_id,source,permissions)
    VALUES($1,$2,$3,'bot',$4) RETURNING id`,[randomUUID(),actor,server,permissions])).rows[0].id
  const session=(await db.query(`INSERT INTO dashboard_scoped_sessions(grant_id,user_id,server_id,permissions,refresh_hash,expires_at)
    VALUES($1,$2,$3,$4,$5,now()+interval '1 hour') RETURNING id`,[grant,actor,server,permissions,randomUUID()])).rows[0].id
  const token=await new SignJWT({dashboard_session:session}).setProtectedHeader({alg:'HS256'}).setSubject(actor)
    .setAudience('clashking-server-dashboard').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signingKey))
  const request=async(path,{method='GET',body,bearer=token,status=200}={})=>{
    const response=await fetch(origin+path,{method,headers:{...(bearer?{authorization:`Bearer ${bearer}`} : {}),...(body===undefined?{}:{'content-type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)})
    const value=await response.json()
    assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(value)}`)
    return value
  }
  await request(`/v2/roster/${server}/list`)
  const notice='/v2/users/me/ai-notice',version='2026-10-28'
  assert.equal((await request(notice)).acknowledged,false)
  await db.query("INSERT INTO user_settings(user_id,data) VALUES($1,'{\"retained\":true}')",[actor])
  assert.deepEqual(await request(notice,{method:'POST',body:{version}}),{version,acknowledged:true})
  assert.equal((await request(notice)).acknowledged,true)
  assert.equal((await db.query('SELECT data FROM user_settings WHERE user_id=$1',[actor])).rows[0].data.retained,true)
  await db.query("UPDATE user_settings SET data=jsonb_set(data,'{ai_notice,acknowledged_at}',to_jsonb((now()+interval '1 day')::text)) WHERE user_id=$1",[actor])
  assert.equal((await request(notice)).acknowledged,false,'Future consent cannot authorize AI')
  await request(notice,{method:'POST',body:{version}})
  await request(notice,{method:'POST',body:{version:'outdated'},status:400})

  await request('/v2/roster/ai/context',{method:'POST',body:{serverId:server,rosterIds:[],messages:[{role:'user',content:'List my roster'}]},status:403})

  // A real bot-issued grant signs in a first-use Discord actor without OAuth.
  // Its short lifetime, one-use transaction and current server access remain.
  const firstUser='999999999999994904'
  await db.query('UPDATE discord_cache.guilds SET data=$2 WHERE id=$1',[server,{owner_id:firstUser}])
  const issue=()=>request(`/v2/server/${server}/dashboard-access-grants`,{method:'POST',body:{source:'bot',userId:firstUser},bearer:botKey,status:201})
  const fresh=await issue()
  const access=await request('/v2/auth/server-dashboard/exchange',{method:'POST',body:{code:fresh.code},bearer:null})
  assert.equal(access.serverId,server)
  await request(`/v2/roster/${server}/list`,{bearer:access.access_token})
  await request(`/v2/roster/${other}/list`,{bearer:access.access_token,status:403})
  await request('/v2/auth/export',{bearer:access.access_token,status:403})
  await request('/v2/auth/server-dashboard/exchange',{method:'POST',body:{code:fresh.code},bearer:null,status:401})
  const expired=await issue()
  await db.query("UPDATE dashboard_access_grants SET expires_at=now()-interval '1 second' WHERE user_id=$1 AND consumed_at IS NULL",[firstUser])
  await request('/v2/auth/server-dashboard/exchange',{method:'POST',body:{code:expired.code},bearer:null,status:401})
  const revoked=await issue()
  await db.query('UPDATE discord_cache.guilds SET data=$2 WHERE id=$1',[server,{owner_id:actor}])
  await request('/v2/auth/server-dashboard/exchange',{method:'POST',body:{code:revoked.code},bearer:null,status:403})
  console.log('PASS bot dashboard sign-in: actual first-use grant, anonymous exchange, replay/expiry rejection, current permission recheck, foreign-server and private-route denial')
  await request(`/v2/roster/${roster}?server_id=${server}`)
  await request(`/v2/links/server/${server}`)
  await request('/v2/roster/members/query',{method:'POST',body:{serverId:server,rosterIds:[roster]}})
  await request('/v2/roster/members/query',{method:'POST',body:{serverId:other,rosterIds:[foreignRoster]},status:403})
  await request('/v2/roster/views/shared/ScopedOwnView01')
  await request(`/v2/roster/${other}/list`,{status:403})
  await request(`/v2/links/server/${other}`,{status:403})
  await request('/v2/roster/views/shared/ScopedOtherView1',{status:403})
  await request(`/v2/roster/${foreignRoster}?server_id=${server}`,{status:404})
  await request(`/v2/roster/${roster}?server_id=${other}`,{status:403})
  await request(`/v2/roster/${roster}?server_id=${server}&server_id=${other}`,{status:403})
  await request(`/v2/roster/${roster}`,{status:400})
  await request(`/v2/roster/${roster}?server_id=${server}`,{method:'PATCH',body:{alias:'Denied'},status:403})
  await request(`/v2/roster-group?server_id=${server}`,{method:'POST',body:{server_id:server,alias:'Denied'},status:403})
  await request(`/v2/roster/membership-changes?server_id=${server}`,{method:'POST',body:{serverId:server,changes:[],expectedRevisions:{}},status:403})
  assert.equal((await db.query('SELECT alias FROM rosters WHERE id=$1',[roster])).rows[0].alias,'Original alias')
  await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{rosters:'manage'}}])
  await request(`/v2/links/server/${server}`,{status:403})
  const aiBody={serverId:server,rosterIds:[roster],messages:[{role:'user',content:'List my roster'}]}
  const aiContext=await request('/v2/roster/ai/context',{method:'POST',body:aiBody})
  assert.equal(aiContext.context.attachments[0].rosterId,roster)
  await request('/v2/roster/ai/context',{method:'POST',body:{...aiBody,serverId:other},status:403})
  await db.query('DELETE FROM roster_ai_usage WHERE id=$1',[aiContext.requestId])
  console.log('PASS scoped roster AI admission: nondeveloper manager accepted; view-only and foreign server rejected; no model calls')
  await request(`/v2/roster/${roster}?server_id=${server}`,{method:'PATCH',body:{alias:'Allowed'}})
  assert.equal((await db.query('SELECT alias FROM rosters WHERE id=$1',[roster])).rows[0].alias,'Allowed')
  // Exercise the exact dashboard payload through authentication, decoding and SQL.
  const groupPath=`/v2/roster-group?server_id=${server}`
  const aliasGroup=await request(groupPath,{method:'POST',body:{server_id:server,alias:'Beuken'},status:201})
  assert.equal(aliasGroup.group.name,'Beuken')
  assert.equal(aliasGroup.group.alias,'Beuken')
  const savedGroup=await request(`/v2/roster-group/${aliasGroup.group_id}?server_id=${server}`)
  assert.equal(savedGroup.group.name,'Beuken')
  assert.equal(savedGroup.group.alias,'Beuken')
  const namedGroup=await request(groupPath,{method:'POST',body:{name:'Canonical name',alias:'Display alias'},status:201})
  assert.equal(namedGroup.group.name,'Canonical name')
  assert.equal(namedGroup.group.alias,'Display alias')
  await request(groupPath,{method:'POST',body:{alias:'   '},status:400})
  await request(groupPath,{method:'POST',body:{},status:400})
  await request(`/v2/roster-group?server_id=${other}`,{method:'POST',body:{alias:'Foreign'},status:403})
  for(const group of [aliasGroup,namedGroup]) {
    await request(`/v2/roster-group/${group.group_id}?server_id=${server}`,{method:'DELETE'})
  }
  console.log('PASS roster group creation: dashboard alias payload, persisted readback, explicit-name priority, blank rejection and permissions')
  for(const inQuery of [true,false]) {
    await db.query("INSERT INTO roster_members(roster_id,tag,name) VALUES($1,'#P2Y','Local member')",[roster])
    const revision=Number((await db.query('SELECT revision FROM rosters WHERE id=$1',[roster])).rows[0].revision)
    const changed=await request('/v2/roster/membership-changes'+(inQuery?`?server_id=${server}`:''),{method:'POST',body:{
      serverId:server,changes:[{action:'remove',playerTag:'#P2Y',fromRosterId:roster}],expectedRevisions:{[roster]:revision}}})
    assert.equal(changed.changeCount,1)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM roster_members WHERE roster_id=$1',[roster])).rows[0].n,0)
  }
  await request(`/v2/roster/membership-changes?server_id=${server}`,{method:'POST',body:{serverId:other,changes:[],expectedRevisions:{}},status:403})
  await request('/v2/roster/membership-changes',{method:'POST',body:{serverId:other,changes:[],expectedRevisions:{}},status:403})
  for(const path of ['/v2/auth/export','/v2/users/me']) await request(path,{status:403})
  await request('/v2/roster/ai/usage',{method:'POST',body:{},status:403})
  await request(`/v2/roster/${server}/list`,{bearer:null,status:401})
  const forged=await new SignJWT({dashboard_session:session}).setProtectedHeader({alg:'HS256'}).setSubject(actor)
    .setAudience('clashking-server-dashboard').setIssuedAt().setExpirationTime('1h').sign(randomBytes(32))
  await request(`/v2/roster/${server}/list`,{bearer:forged,status:401})
  // Current Gateway ownership alone must not grant a section absent from the session.
  await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{}}])
  await request(`/v2/roster/${server}/list`,{status:403})
  await db.query('UPDATE dashboard_scoped_sessions SET revoked_at=now() WHERE id=$1',[session])
  await request(`/v2/roster/${server}/list`,{status:401})
  console.log('PASS scoped dashboard HTTP/SQL: own-server reads/writes, link/roster sections, body/query/shared-view scope, foreign objects, view-only limits, forged/revoked sessions, private-route isolation; zero external writes')
}
