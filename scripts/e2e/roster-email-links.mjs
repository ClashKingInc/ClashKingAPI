// Real local Worker/SQL/Clash-proxy verification for email-linked roster members,
// lightweight signup metadata (/accounts & /signup-form), and basic_player hydration.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'

assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1')
const dsn = new URL(process.env.TEST_DATABASE_URL)
assert.equal(dsn.hostname, '127.0.0.1'); assert.equal(dsn.pathname, '/clashking_test')
const db = new pg.Client({ connectionString: dsn.href })

const serverId = '999999999999993101'
const discordUserId = '999999999999993102'
const roleId = '999999999999993103'
const emailUserId = randomUUID()
const rosterId = randomUUID()
const botToken = randomBytes(32).toString('base64url')
const secret = randomBytes(32).toString('base64url')
const encryptionKey = randomBytes(32).toString('base64url')
const port = 8896
const origin = `http://127.0.0.1:${port}`

const clashPlayers = new Map([
  ['#P99HYDRATE', { tag: '#P99HYDRATE', name: 'Hydrated Hero', townHallLevel: 18, trophies: 5120, clan: { tag: '#C99CLAN' }, leagueTier: { id: 105000034 } }],
  ['#P99NEWLINK', { tag: '#P99NEWLINK', name: 'Newly Linked', townHallLevel: 19, trophies: 5400, clan: { tag: '#C99CLAN' }, leagueTier: { id: 105000036 } }],
])
let clashFetches = 0
const clashProxy = createServer((req, res) => {
  req.resume()
  res.setHeader('content-type', 'application/json')
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const verifyMatch = url.pathname.match(/^\/v1\/players\/([^/]+)\/verifytoken$/u)
  if (req.method === 'POST' && verifyMatch) {
    res.end(JSON.stringify({ tag: decodeURIComponent(verifyMatch[1]), token: 'ok', status: 'ok' }))
    return
  }
  const playerMatch = url.pathname.match(/^\/v1\/players\/([^/]+)$/u)
  if (req.method === 'GET' && playerMatch) {
    clashFetches++
    const tag = decodeURIComponent(playerMatch[1])
    if (tag === '#P99SLOW') { setTimeout(() => { res.statusCode = 503; res.end('{}') }, 1500); return }
    const found = clashPlayers.get(tag)
    if (!found) { res.statusCode = 404; res.end(JSON.stringify({ reason: 'notFound' })); return }
    res.end(JSON.stringify(found))
    return
  }
  res.statusCode = 404; res.end('{}')
})

let api, logs = ''
try {
  await db.connect()
  await new Promise(r => clashProxy.listen(0, '127.0.0.1', r))
  await db.query("INSERT INTO servers(id, name) VALUES($1, 'AkroPoliS Fixture')", [serverId])
  await db.query("INSERT INTO auth_users(user_id, provider) VALUES($1, 'discord')", [discordUserId])
  await db.query("INSERT INTO auth_users(user_id, provider, email_hash, username, password_hash) VALUES($1, 'email', 'roster-email-hash', 'emailuser', 'not-a-password')", [emailUserId])
  await db.query("INSERT INTO basic_player(tag, name, townhall_level, trophies, clan_tag, observed_at) VALUES('#P99EMAIL1', 'Email One', 19, 5300, '#C99CLAN', now()), ('#P99DISC1', 'Discord One', 19, 5200, '#C99CLAN', now())")
  await db.query("INSERT INTO player_links(tag, user_id, source, order_index, is_verified, verified_at) VALUES('#P99EMAIL1', $1, 'clashking', 0, true, now()), ('#P99EMAIL2', $1, 'clashking', 1, true, now()), ('#P99DISC1', $2, 'clashking', 0, true, now()), ('#P99HYDRATE', $2, 'clashking', 1, true, now()), ('#P99ROSTERONLY', $2, 'clashking', 2, true, now()), ('#P99SLOW', $2, 'clashking', 3, false, null)", [emailUserId, discordUserId])
  await db.query(
    `INSERT INTO rosters(id, server_id, alias, clan_tag, roster_type, signup_scope, require_verified, roster_role_id, signup_questions)
     VALUES($1, $2, 'CWL Inscription', '#C99CLAN', 'clan', 'anyone', true, $3, '[{"id":"q1","label":"Ready?","type":"boolean","required":true,"options":[],"order":0}]'::jsonb)`,
    [rosterId, serverId, roleId],
  )
  await db.query(
    `INSERT INTO roster_members(roster_id, tag, name, townhall, current_clan_tag, discord_user_id, position)
     VALUES($1, '#P99EMAIL1', 'Email One', 19, '#C99OTHER', $2, 0),
           ($1, '#P99EMAIL2', 'Email Two', 18, '#C99CLAN', $2, 1),
           ($1, '#P99DISC1', 'Discord One', 19, '#C99OTHER', $3, 2),
           ($1, '#P99ROSTERONLY', 'Roster Fallback', 17, '#C99CLAN', $3, 3)`,
    [rosterId, emailUserId, discordUserId],
  )

  api = spawn(process.execPath, ['scripts/start-local-rewrite-api.mjs'], {
    env: {
      ...process.env,
      CLASHKING_LOCAL_API_PORT: String(port),
      CLASHKING_E2E_API_BOT_TOKEN: botToken,
      CLASHKING_E2E_JWT_ACCESS_SECRET: secret,
      CLASHKING_E2E_DATA_ENCRYPTION_KEY: encryptionKey,
      CLASHKING_LOCAL_DISCORD_CLIENT_ID: '999999999999999999',
      CLASHKING_LOCAL_DISCORD_CLIENT_SECRET: 'fixture',
      CLASHKING_LOCAL_DISCORD_BOT_TOKEN: 'fixture',
      CLASHKING_LOCAL_CLASH_PROXY_ORIGIN: `http://127.0.0.1:${clashProxy.address().port}`,
      CLASHKING_LOCAL_ARCHIVE_BRIDGE: '0',
      CLASHKING_LOCAL_PRODUCTION_READS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  api.stdout.on('data', d => { logs += d })
  api.stderr.on('data', d => { logs += d })
  let ready = false
  for (let i = 0; i < 120; i++) {
    if (api.exitCode !== null) throw Error(logs.slice(-5000))
    try { ready = (await fetch(origin + '/v2/health')).ok && logs.includes('isolated_api_ready') } catch {}
    if (ready) break
    await new Promise(r => setTimeout(r, 500))
  }
  assert(ready, logs.slice(-5000))

  const req = async (method, path, body) => {
    const res = await fetch(origin + path, {
      method,
      headers: { authorization: `Bearer ${botToken}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    })
    return { status: res.status, body: await res.json() }
  }

  // 1. Bot roster read succeeds with email-linked members and returns null discordUserId for email UUIDs.
  const rosterRes = await req('GET', `/v2/server/${serverId}/rosters/${rosterId}`)
  assert.equal(rosterRes.status, 200, JSON.stringify(rosterRes.body))
  const byTag = new Map(rosterRes.body.roster.members.map(m => [m.playerTag, m]))
  assert.equal(byTag.get('#P99EMAIL1').discordUserId, null)
  assert.equal(byTag.get('#P99EMAIL2').discordUserId, null)
  assert.equal(byTag.get('#P99DISC1').discordUserId, discordUserId)

  // 2. Missing members endpoint also succeeds without 503 on email-linked members.
  const missingRes = await req('GET', `/v2/server/${serverId}/rosters/${rosterId}/missing-members`)
  assert.equal(missingRes.status, 200, JSON.stringify(missingRes.body))
  assert.equal(missingRes.body.items.find(i => i.playerTag === '#P99EMAIL1').discordUserId, null)
  assert.equal(missingRes.body.items.find(i => i.playerTag === '#P99DISC1').discordUserId, discordUserId)

  // 3. Account groups still group email-linked alts together under one owner.
  const groupsRes = await req('POST', '/v2/roster/account-groups/query', { serverId, rosterIds: [rosterId] })
  assert.equal(groupsRes.status, 200, JSON.stringify(groupsRes.body))
  const emailGroup = groupsRes.body.groups.find(g => g.accounts.some(a => a.playerTag === '#P99EMAIL1'))
  assert.deepEqual(emailGroup.accounts.map(a => a.playerTag).sort(), ['#P99EMAIL1', '#P99EMAIL2'])

  // 4. Refresh Discord identity on an email-linked member returns 404 (not Discord error).
  const refreshIdRes = await req('POST', `/v2/server/${serverId}/rosters/${rosterId}/discord-identity/refresh`, { playerTag: '#P99EMAIL1' })
  assert.equal(refreshIdRes.status, 404, JSON.stringify(refreshIdRes.body))

  // 5. Role refresh succeeds and excludes email UUIDs from both response and role_refresh_jobs.
  const roleRes = await req('POST', `/v2/server/${serverId}/rosters/${rosterId}/refresh`, { scope: 'role' })
  assert.equal(roleRes.status, 200, JSON.stringify(roleRes.body))
  assert.deepEqual(roleRes.body.roleMemberUserIds, [discordUserId])
  const queuedJobs = await db.query('SELECT user_id FROM role_refresh_jobs WHERE server_id = $1', [serverId])
  assert.deepEqual(queuedJobs.rows.map(r => r.user_id), [discordUserId])

  // 6. Lightweight /signup-form includes requireVerified + questions.
  const formRes = await req('GET', `/v2/server/${serverId}/rosters/${rosterId}/signup-form`)
  assert.equal(formRes.status, 200, JSON.stringify(formRes.body))
  assert.equal(formRes.body.requireVerified, true)
  assert.equal(formRes.body.questions.length, 1)
  assert.equal(formRes.body.questions[0].id, 'q1')

  // 7. /accounts includes requireVerified + questionnaire, hydrates missing basic_player best-effort,
  //    falls back to roster_members snapshot or tag on slow/404 lookups, and persists hydrated row.
  const accountsRes = await req('GET', `/v2/server/${serverId}/rosters/${rosterId}/accounts?discordUserId=${discordUserId}`)
  assert.equal(accountsRes.status, 200, JSON.stringify(accountsRes.body))
  assert.equal(accountsRes.body.requireVerified, true)
  assert.equal(accountsRes.body.questionnaire.questions.length, 1)
  const accByTag = new Map(accountsRes.body.items.map(i => [i.tag, i]))
  assert.equal(accByTag.get('#P99DISC1').name, 'Discord One')
  assert.equal(accByTag.get('#P99HYDRATE').name, 'Hydrated Hero')
  assert.equal(accByTag.get('#P99HYDRATE').townhall, 18)
  assert.equal(accByTag.get('#P99ROSTERONLY').name, 'Roster Fallback')
  assert.equal(accByTag.get('#P99ROSTERONLY').townhall, 17)
  assert.equal(accByTag.get('#P99SLOW').name, '#P99SLOW')
  const hydratedDb = await db.query("SELECT name, townhall_level, clan_tag, trophies, league_id FROM basic_player WHERE tag = '#P99HYDRATE'")
  assert.equal(hydratedDb.rows.length, 1)
  assert.equal(hydratedDb.rows[0].name, 'Hydrated Hero')
  assert.equal(hydratedDb.rows[0].townhall_level, 18)
  assert.equal(hydratedDb.rows[0].clan_tag, '#C99CLAN')
  assert.equal(hydratedDb.rows[0].league_id, 105000034)

  // 8. Linking a new account seeds basic_player immediately inside commitPreparedLink.
  const linkRes = await req('POST', `/v2/links/${discordUserId}`, { player_tag: '#P99NEWLINK', api_token: 'fixture-token' })
  assert.equal(linkRes.status, 200, JSON.stringify(linkRes.body))
  const linkedDb = await db.query("SELECT name, townhall_level, clan_tag, trophies, league_id FROM basic_player WHERE tag = '#P99NEWLINK'")
  assert.equal(linkedDb.rows.length, 1)
  assert.equal(linkedDb.rows[0].name, 'Newly Linked')
  assert.equal(linkedDb.rows[0].townhall_level, 19)
  assert.equal(linkedDb.rows[0].league_id, 105000036)

  assert.ok(clashFetches >= 3)
  console.log('PASS roster email-links, lightweight /accounts & /signup-form, and basic_player hydration')
} finally {
  if (api && api.exitCode === null) {
    api.kill('SIGTERM')
    await Promise.race([once(api, 'exit'), new Promise(r => setTimeout(r, 5000))])
    if (api.exitCode === null) api.kill('SIGKILL')
  }
  await new Promise(r => clashProxy.close(r))
  await db.end()
}
