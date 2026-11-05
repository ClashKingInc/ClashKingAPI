import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
import { AccountAvatarId } from '../../packages/api-contracts/dist/expo-auth.js'

// Called by the disposable Timescale/workerd harness. Exercise account isolation
// and cross-device reads through the real HTTP service, never production.
export async function verifyAccountAvatars({db, origin, signingKey}) {
const base = new URL(origin)
assert.equal(base.hostname, '127.0.0.1')
const secret = new TextEncoder().encode(signingKey)
const users = ['email','discord'].map(provider => ({id:`avatar-e2e-${randomUUID()}`,provider}))
const token = (id,device) => new SignJWT({device}).setProtectedHeader({alg:'HS256'}).setSubject(id).setAudience('clashking-web').setIssuedAt().setExpirationTime('5m').sign(secret)
try {
  for(const u of users) await db.query('INSERT INTO auth_users(user_id,provider,email_hash,username,password_hash) VALUES($1,$2,$3,$4,$5)',[u.id,u.provider,u.provider==='email'?u.id:null,u.provider==='email'?'Avatar test':null,u.provider==='email'?'test-only':null])
  async function call(auth,method='GET',body,status=200) {
    const response=await fetch(new URL('/v2/auth/avatar',base),{method,headers:{...(auth?{Authorization:`Bearer ${auth}`} : {}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
    const result=await response.json(); assert.equal(response.status,status,JSON.stringify(result)); return result
  }
  await call(null,'GET',undefined,401)
  for(const u of users) {
    const first=await token(u.id,'first-device'),second=await token(u.id,'second-device')
    assert.deepEqual(await call(first),{avatar_id:null})
    for(const avatar_id of AccountAvatarId.literals) {
      assert.deepEqual(await call(first,'PUT',{avatar_id}),{avatar_id})
      assert.deepEqual(await call(second),{avatar_id})
    }
    await call(second,'PUT',{avatar_id:'grand-warden'},400)
    await call(second,'PUT',{avatar_id:'goblin',user_id:users.find(other=>other!==u).id})
    assert.deepEqual(await call(first),{avatar_id:'goblin'})
  }
  const untouched=await token(users[1].id,'third-device')
  await call(await token(users[0].id,'first-device'),'PUT',{avatar_id:'archer'})
  assert.deepEqual(await call(untouched),{avatar_id:'goblin'})
  console.log(JSON.stringify({passed:true,providers:2,avatars:11,crossDeviceRead:true,invalidChoiceRejected:true,accountIsolation:true}))
} finally { for(const u of users)await db.query('DELETE FROM auth_users WHERE user_id=$1',[u.id]) }

}
