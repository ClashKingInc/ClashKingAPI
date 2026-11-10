// Real local Worker + canonical disposable PostgreSQL. Only Discord responses
// use a loopback fixture; this script cannot target a remote database or API.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import pg from 'pg'
import { SignJWT } from 'jose'

assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1')
const dsn = new URL(process.env.TEST_DATABASE_URL ?? '')
assert.equal(dsn.hostname, '127.0.0.1')
assert.equal(dsn.username, 'clashking_test')
assert.equal(dsn.pathname, '/clashking_test')
const db = new pg.Client({ connectionString: dsn.href })
const guild = '999999999999993101', actor = '999999999999993102'
const valid = '999999999999993103', deleted = '999999999999993104'
const managed = '999999999999993105', newRole = '999999999999993106'
const app = '999999999999999999', generation = randomUUID()
const role = (id, managed = false) => ({ id, name: id, managed, color: 0, position: 1, mentionable: false })
let liveRoles = [role(guild), role(valid), role(managed, true), role(newRole)]
let failProvider = false, api, logs = ''
const provider = createServer((req, res) => {
  res.setHeader('content-type', 'application/json')
  if (req.url === `/api/v10/guilds/${guild}/roles` && req.method === 'GET') {
    res.statusCode = failProvider ? 503 : 200
    res.end(JSON.stringify(failProvider ? { message: 'Local provider failure' } : liveRoles))
  } else {
    res.statusCode = 404
    res.end(JSON.stringify({ message: 'Unexpected local Discord request' }))
  }
})
const signingKey = randomBytes(32).toString('base64url')
const port = 8896, origin = `http://127.0.0.1:${port}`
try {
  await db.connect()
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
  await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')", [actor])
  await db.query("INSERT INTO servers(id,name) VALUES($1,'Access regression fixture')", [guild])
  await db.query(`INSERT INTO discord_cache.gateway_shards(application_id,shard_id,shard_count,generation,healthy,heartbeat_at)
    VALUES($1,0,1,$2,true,now())`, [app, generation])
  await db.query(`INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete)
    VALUES($1,$2,$3,0,$4,true,true,true)`, [guild, {owner_id:actor}, app, generation])
  // A healthy but stale Gateway inventory must not populate the access picker.
  await db.query('INSERT INTO discord_cache.roles(id,guild_id,data) VALUES($1,$2,$3)', [deleted,guild,role(deleted)])
  const grant = (id, level = 'view') => ({role_id:id,section:'settings',access_level:level})
  const initial = [valid, deleted, managed, guild].map(id => grant(id))
  for (const item of initial) await db.query(`INSERT INTO dashboard_role_grants(server_id,role_id,section,access_level)
    VALUES($1,$2,$3,$4)`, [guild,item.role_id,item.section,item.access_level])
  const token = await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(actor)
    .setAudience('clashking-native').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signingKey))
  api = spawn(process.execPath, ['scripts/start-local-rewrite-api.mjs'], {
    env: {...process.env, CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_E2E_JWT_ACCESS_SECRET:signingKey,
      CLASHKING_LOCAL_DISCORD_CLIENT_ID:app,CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local-only',
      CLASHKING_LOCAL_DISCORD_BOT_TOKEN:'local-only',CLASHKING_LOCAL_DISCORD_TEST_ORIGIN:`http://127.0.0.1:${provider.address().port}`,
      CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0'},
    stdio:['ignore','pipe','pipe']
  })
  api.stdout.on('data', d => logs += d); api.stderr.on('data', d => logs += d)
  let ready = false
  for (let i=0;i<120;i++) {
    if (api.exitCode !== null) throw Error(logs.slice(-4000))
    try { ready = (await fetch(origin+'/v2/health',{signal:AbortSignal.timeout(1000)})).ok && logs.includes('isolated_api_ready') } catch {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve,500))
  }
  assert(ready,logs.slice(-4000))
  const path = `/v2/server/${guild}/dashboard-access`
  const request = async (method='GET', grants, status=200, bearer=token) => {
    const response = await fetch(origin+path, {method,headers:{authorization:`Bearer ${bearer}`,...(grants?{'content-type':'application/json'}:{})},
      ...(grants?{body:JSON.stringify({grants})}:{}),signal:AbortSignal.timeout(15000)})
    const body = await response.json()
    assert.equal(response.status,status,JSON.stringify(body))
    return body
  }
  const stored = async () => (await db.query('SELECT role_id,section,access_level FROM dashboard_role_grants WHERE server_id=$1 ORDER BY role_id',[guild])).rows
  const audit = async () => (await db.query('SELECT before_grants,after_grants FROM dashboard_access_audit WHERE server_id=$1 ORDER BY created_at',[guild])).rows
  const read = await request()
  assert.deepEqual(read.roles.map(r=>r.id).sort(),[valid,newRole].sort())
  assert.deepEqual(read.grants,[grant(valid)])
  assert.equal((await stored()).length,4,'Reading must not mutate saved access')
  assert.equal((await audit()).length,0)
  const saved = await request('PUT',[grant(valid,'manage'),...initial.slice(1)])
  assert.deepEqual(saved.grants,[grant(valid,'manage')])
  assert.deepEqual(await stored(),saved.grants)
  assert.equal((await audit())[0].before_grants.length,4)
  assert.deepEqual((await audit())[0].after_grants,saved.grants)
  // A removed, managed, everyone, or foreign ID must never create a new grant.
  for (const id of [deleted,managed,guild,'999999999999993199']) {
    const denied = await request('PUT',[grant(valid,'view'),grant(id)],400)
    assert(JSON.stringify(denied).includes(id),'Error identifies the unavailable role')
    assert.deepEqual(await stored(),saved.grants,'Rejected update is atomic')
  }
  assert.equal((await audit()).length,1)
  await request('PUT',[grant(valid),grant(valid)],400)
  await request('PUT',[{...grant(valid),section:'bogus'}],400)
  await request('PUT',[grant(valid)],401,'invalid')
  // An already-granted role deleted between read and save is pruned safely.
  liveRoles = liveRoles.filter(r=>r.id!==valid)
  const afterDeletion = await request('PUT',[grant(valid),grant(newRole,'manage')])
  assert.deepEqual(afterDeletion.grants,[grant(newRole,'manage')])
  assert.deepEqual(await stored(),afterDeletion.grants)
  failProvider = true
  await request('PUT',[],503)
  await request('GET',undefined,503)
  assert.deepEqual(await stored(),afterDeletion.grants,'Provider failure must retain saved access')
  assert.equal((await audit()).length,2)
  failProvider = false
  await request('PUT',[])
  assert.deepEqual(await stored(),[])
  console.log('PASS dashboard access HTTP/SQL: live picker, no GET writes, stale grants pruned and audited, new invalid roles denied atomically, deletion race, duplicate/section/auth validation, provider failure, explicit removal; no remote writes')
} finally {
  if (api && api.exitCode === null) {
    api.kill('SIGTERM')
    await Promise.race([once(api,'exit'),new Promise(resolve=>setTimeout(resolve,5000))])
    if (api.exitCode === null) api.kill('SIGKILL')
  }
  await new Promise(resolve=>provider.close(resolve))
  await db.end()
}
