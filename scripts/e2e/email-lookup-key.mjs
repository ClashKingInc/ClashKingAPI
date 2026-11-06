import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { hash } from 'bcryptjs'
import { jwtVerify } from 'jose'

// Run only against the actual disposable API/SQL service. The stored email key
// deliberately differs from token signing, as in the migrated production data.
export async function verifyEmailLookupKey({ db, origin, signingKey, emailLookupKey }) {
  assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1')
  assert.equal(new URL(origin).hostname, '127.0.0.1')
  assert.notEqual(signingKey, emailLookupKey)
  const id = `email-key-${randomUUID()}`
  const email = `${id}@example.invalid`, password = 'local-email-check-1234'
  const emailHash = createHash('sha256').update(email + emailLookupKey).digest('hex')
  await db.query("INSERT INTO auth_users(user_id,provider,email_hash,username,password_hash) VALUES($1,'email',$2,'Reviewer',$3)", [id, emailHash, await hash(password, 10)])
  const request = body => fetch(`${origin}/v2/auth/email`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ device_id:id, device_name:'Local reviewer', ...body }) })
  try {
    const result = await request({ email:` ${email.toUpperCase()} `, password })
    assert.equal(result.status, 200)
    const session = await result.json()
    await jwtVerify(session.access_token, new TextEncoder().encode(signingKey), { audience:'clashking-native' })
    await assert.rejects(jwtVerify(session.access_token, new TextEncoder().encode(emailLookupKey)))
    const me = await fetch(`${origin}/v2/auth/me`, { headers:{authorization:`Bearer ${session.access_token}`} })
    assert.equal(me.status, 200)
    assert.equal((await me.json()).user_id, id)
    assert.equal((await request({email,password:'incorrect-1234'})).status, 401)
    const duplicate = await fetch(`${origin}/v2/auth/register`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ email,password,username:'duplicate',device_id:id,device_name:'Local' }) })
    assert.equal(duplicate.status, 400)
    assert.match((await duplicate.json()).message, /already registered/)
    const refreshed = await fetch(`${origin}/v2/auth/refresh`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token,device_id:id})})
    assert.equal(refreshed.status,200)
    console.log('PASS preserved email lookup key: real login, current-key JWT, profile, password rejection, duplicate prevention and refresh')
  } finally { await db.query('DELETE FROM auth_users WHERE user_id=$1',[id]) }
}
