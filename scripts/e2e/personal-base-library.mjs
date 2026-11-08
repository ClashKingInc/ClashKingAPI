// Real HTTP reads/mutations against canonical disposable SQL. This verifies
// the Expo service contract without launching a browser or native app.
import assert from 'node:assert/strict'
import { SignJWT } from 'jose'

export async function verifyPersonalBaseLibrary({db,origin,signingKey}) {
  assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1')
  assert.equal(new URL(origin).hostname,'127.0.0.1')
  const user='922222222222223401',other='922222222222223402',server='922222222222223403'
  const ids=[],now=new Date().toISOString()
  const jwt=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(user).setAudience('clashking-web').setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(signingKey))
  const call=async(path='',method='GET')=>{
    const response=await fetch(origin+'/v2/bases/personal'+path,{method,headers:{authorization:`Bearer ${jwt}`}})
    const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.items
  }
  for(const id of [user,other])await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[id])
  try {
    for(let index=0;index<3;index++) {
      const row=await db.query(`INSERT INTO bases(base_link,message_id,server_id,channel_id,description,downloads,votes)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`,[
        'https://link.clashofclans.com/en?action=OpenLayout&id=local-library-'+index,'92222222222222341'+index,server,'922222222222223420','Library '+index,
        JSON.stringify(index===1?{[user]:now,[other]:now}:{}),JSON.stringify(index===2?{[user]:{vote:1,updatedAt:now}}:{}),
      ]);ids.push(row.rows[0].id)
    }
    await db.query('INSERT INTO user_saved_bases(user_id,base_id) VALUES($1,$2)',[user,ids[0]])
    let items=await call()
    assert.deepEqual(new Set(items.map(item=>item.id)),new Set(ids.slice(0,2)),'Explicit saves and Discord downloads form the library; feedback alone does not')
    assert.equal(items.find(item=>item.id===ids[0]).saved,true)
    assert.equal(items.find(item=>item.id===ids[1]).saved,false)
    items=await call('/'+ids[2],'PUT')
    assert.equal(items.find(item=>item.id===ids[2]).saved,true)
    items=await call('/'+ids[1],'DELETE')
    assert.ok(!items.some(item=>item.id===ids[1]),'Unsave must remove historical download membership too')
    const retained=(await db.query('SELECT downloads,votes FROM bases WHERE id=$1',[ids[1]])).rows[0]
    assert.equal(retained.downloads[user],undefined)
    assert.equal(retained.downloads[other],now,'Unsave must not remove another user’s download')
    items=await call('/'+ids[2],'DELETE')
    assert.ok(!items.some(item=>item.id===ids[2]),'Vote must not keep an unsaved base in the library')
    assert.equal((await db.query('SELECT votes FROM bases WHERE id=$1',[ids[2]])).rows[0].votes[user].vote,1,'Unsave preserves feedback')
    console.log('PASS personal base library: saved/downloaded membership, feedback-only exclusion, save/unsave, other-user download and feedback preservation')
  } finally {
    await db.query('DELETE FROM bases WHERE id=ANY($1::bigint[])',[ids])
    await db.query('DELETE FROM auth_users WHERE user_id=ANY($1::text[])',[[user,other]])
  }
}
