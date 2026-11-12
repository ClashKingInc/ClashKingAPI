// Actual API -> local R2/SQL -> dfx -> loopback Discord HTTP, not a helper test.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { SignJWT } from 'jose'
export async function verifyDiscordBaseUpload({db,origin,signingKey,provider}) {
  assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1')
  const server='999999999999997601',actor='999999999999997602',channel='999999999999997603'
  const application='999999999999999999',generation=randomUUID()
  await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[actor])
  await db.query("INSERT INTO servers(id,name) VALUES($1,'Base upload E2E')",[server])
  await db.query('INSERT INTO discord_cache.gateway_shards(application_id,shard_id,shard_count,generation,healthy,heartbeat_at) VALUES($1,0,1,$2,true,now())',[application,generation])
  await db.query('INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete) VALUES($1,$2,$3,0,$4,true,true,true)',[server,{owner_id:actor},application,generation])
  const token=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(actor).setAudience('clashking-native').setIssuedAt().setExpirationTime('10m').sign(new TextEncoder().encode(signingKey))
  const call=async(path,method,body,status=200)=>{
    const form=body instanceof FormData
    const response=await fetch(origin+path,{method,headers:{authorization:`Bearer ${token}`,...(!form&&body?{'content-type':'application/json'}:{})},body:form?body:body?JSON.stringify(body):undefined})
    const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value
  }
  try {
    const images=[]
    for(let i=0;i<2;i++){
      const form=new FormData();form.set('file',new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')],`base${i}.png`,{type:'image/png'}))
      images.push((await call(`/v2/server/${server}/bases/images`,'POST',form)).url)
    }
    const base=await call(`/v2/server/${server}/bases`,'POST',{channelId:channel,baseLink:'https://link.clashofclans.com/en?action=OpenLayout&id=TH18%3AWB%3AAAAAAA',description:'Multipart regression',images},201)
    await call(`/v2/server/${server}/bases/${base.id}`,'PATCH',{baseLink:base.baseLink,description:'Edited base',images:images.slice(0,1)})
    assert.equal(provider.basePosts.length,2)
    for(const [index,post] of provider.basePosts.entries()){
      assert.equal(typeof post.payload,'string','payload_json must be a text form field')
      assert.equal(post.fileCount,index===0?2:1)
      const payload=JSON.parse(post.payload)
      assert.equal(payload.flags,1<<15)
      assert.equal(payload.components.find(x=>x.type===12).items.length,post.fileCount)
      const buttons=payload.components.find(x=>x.type===1).components
      assert.deepEqual(buttons.map(x=>x.custom_id),[`base:link:${base.id}`,`base:upvote:${base.id}`,`base:downvote:${base.id}`])
      assert(!post.rawPayloadHeader.includes('filename='),'Discord must not receive JSON as a file')
    }
    const stored=(await db.query('SELECT description,images FROM bases WHERE id=$1',[base.id])).rows[0]
    assert.equal(stored.description,'Edited base');assert.deepEqual(stored.images,images.slice(0,1))
    console.log('PASS real base create/edit: JSON text part, image files, gallery/buttons and persisted edits')
  }finally{
    await db.query('DELETE FROM bases WHERE server_id=$1',[server]);await db.query('DELETE FROM discord_cache.guilds WHERE id=$1',[server]);await db.query('DELETE FROM discord_cache.gateway_shards WHERE application_id=$1 AND generation=$2',[application,generation]);await db.query('DELETE FROM servers WHERE id=$1',[server]);await db.query('DELETE FROM auth_users WHERE user_id=$1',[actor])
  }
}
