import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { SignJWT } from 'jose'
import pg from 'pg'

// Real local API and SQL only. The fixture owns no user content and is removed
// in finally; never run this against a remote database or production origin.
const base = new URL(process.env.CLASHKING_E2E_BASE_URL ?? 'http://127.0.0.1:8787')
assert.equal(base.hostname, '127.0.0.1')
const env = parseEnv(readFileSync('/Users/matthewanderson/ClashKing/.clashking/local.env', 'utf8'))
assert.equal(env.TIMESCALE_HOST, '127.0.0.1')
assert.equal(env.TIMESCALE_DATABASE, 'clashking_dev')
const db = new pg.Client({ connectionString: `postgres://clashking_local:clashking_local@127.0.0.1:${env.TIMESCALE_PORT}/clashking_dev` })
await db.connect()
const user = `home-e2e-${randomBytes(8).toString('hex')}`
let seeded = false
try {
  await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')", [user]); seeded = true
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(user).setAudience('clashking-web').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET))
  async function call(method = 'GET', data, status = 200) {
    const response = await fetch(new URL('/v2/users/me/home-layout', base), { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) })
    const body = await response.json()
    assert.equal(response.status, status, JSON.stringify(body))
    return body
  }
  const original = await call()
  assert.deepEqual(original.items.map(item => item.kind), ['todo', 'ranked', 'upgrade', 'activity'])
  const reversed = [...original.items].reverse()
  await call('PUT', { revision: original.revision, items: reversed })
  assert.deepEqual((await call()).items, reversed)
  await call('PUT', { revision: original.revision, items: original.items }, 409)
  console.log(JSON.stringify({ passed: true, cards: 4, savedOrder: true, staleRevisionRejected: true }))
} finally {
  if (seeded) await db.query('DELETE FROM auth_users WHERE user_id=$1', [user])
  await db.end()
}
