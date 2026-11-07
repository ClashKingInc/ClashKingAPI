import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {SignJWT} from 'jose'

export async function verifySharedViewImport({db,origin,signingKey,botKey}){
 assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1')
 const source='999999999999990101',target='999999999999990102',other='999999999999990103'
 const sender='999999999999990111',recipient='999999999999990112',creator='999999999999990113'
 for(const id of [source,target,other])await db.query("INSERT INTO servers(id,name) VALUES($1,$2)",[id,id===source?'Shared from server':'Destination server'])
 for(const id of [sender,recipient,creator])await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[id])
 await db.query('INSERT INTO discord_cache.gateway_shards(application_id,shard_id,shard_count,generation,healthy,heartbeat_at) VALUES($1,0,1,$2,true,now()) ON CONFLICT(application_id,shard_id) DO NOTHING',['999999999999999999',randomUUID()])
 const shard=(await db.query('SELECT application_id,shard_id,generation FROM discord_cache.gateway_shards LIMIT 1')).rows[0]
 for(const [id,owner] of [[source,sender],[target,recipient],[other,sender]])await db.query('INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete) VALUES($1,$2,$3,$4,$5,true,true,true)',[id,{owner_id:owner,icon:'abc'},shard.application_id,shard.shard_id,shard.generation])
 await db.query('INSERT INTO discord_cache.members(guild_id,user_id,data) VALUES($1,$2,$3)',[source,sender,{user:{id:sender,username:'Sender',global_name:'Actual sharer',avatar:'abc'},roles:[]}])
 const token=async id=>new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(id).setAudience('clashking-native').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signingKey))
 const senderToken=await token(sender),recipientToken=await token(recipient)
 const call=async(path,method='GET',body,auth=recipientToken,status=200)=>{
  const response=await fetch(origin+path,{method,headers:{...(auth?{authorization:'Bearer '+auth}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value
 }
 const viewId=randomUUID(),legacy='LegacyImport01',code='async () => { throw new Error("source data must not execute during import"); }'
 await db.query('INSERT INTO roster_views(id,share_id,server_id,name,source_code,created_by_discord_user_id) VALUES($1,$2,$3,$4,$5,$6)',[viewId,legacy,source,'Shared recipe',code,creator])
 await call(`/v2/roster/views/${viewId}/share?server_id=${source}`,'POST',undefined,recipientToken,403)
 const share=await call(`/v2/roster/views/${viewId}/share?server_id=${source}`,'POST',undefined,senderToken,201)
 assert.equal(share.sharedBy.id,sender);assert.equal(share.sharedBy.name,'Actual sharer');assert.equal(share.sourceServer.id,source)
 await call(`/v2/roster/view-shares/${share.shareId}`,'GET',undefined,null,401)
 // No source-server membership is needed for metadata or copying the recipe.
 await call(`/v2/roster/views/${viewId}?server_id=${source}`,'GET',undefined,recipientToken,403)
 const metadata=await call(`/v2/roster/view-shares/${share.shareId}`)
 assert.equal(metadata.name,'Shared recipe');assert(!JSON.stringify(metadata).includes('source_code'));assert(!JSON.stringify(metadata).includes('must not execute'))
 assert.equal((await db.query('SELECT count(*)::int AS n FROM roster_views WHERE server_id=$1',[target])).rows[0].n,0,'Preview must not import')
 await call(`/v2/roster/view-shares/${share.shareId}/import?server_id=${other}`,'POST',undefined,recipientToken,403)
 await call(`/v2/roster/view-shares/${share.shareId}/import?server_id=${target}`,'POST',undefined,botKey,403)
 await db.query("UPDATE roster_views SET name='Changed later',source_code='async () => null' WHERE id=$1",[viewId])
 const imports=await Promise.all([1,2].map(()=>call(`/v2/roster/view-shares/${share.shareId}/import?server_id=${target}`,'POST')))
 assert.equal(imports[0].id,imports[1].id);assert.equal(imports[0].name,'Shared recipe');assert.equal(imports[0].sourceCode,code);assert.equal(imports[0].createdBy,recipient)
 await db.query("UPDATE roster_views SET name='Recipient edit' WHERE id=$1",[imports[0].id])
 assert.equal((await call(`/v2/roster/view-shares/${share.shareId}/import?server_id=${target}`,'POST')).name,'Recipient edit','Retry must not overwrite local edits')
 const permissions={manager:false,sections:{rosters:'view'}}
 const grant=(await db.query("INSERT INTO dashboard_access_grants(token_hash,user_id,server_id,source,permissions) VALUES($1,$2,$3,'bot',$4) RETURNING id",[randomUUID(),recipient,target,permissions])).rows[0].id
 const session=(await db.query("INSERT INTO dashboard_scoped_sessions(grant_id,user_id,server_id,permissions,refresh_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour') RETURNING id",[grant,recipient,target,permissions,randomUUID()])).rows[0].id
 const scoped=await new SignJWT({dashboard_session:session}).setProtectedHeader({alg:'HS256'}).setSubject(recipient).setAudience('clashking-server-dashboard').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signingKey))
 await call(`/v2/roster/view-shares/${share.shareId}`,'GET',undefined,scoped)
 await call(`/v2/roster/view-shares/${share.shareId}/import?server_id=${target}`,'POST',undefined,scoped,403)
 await db.query('UPDATE dashboard_scoped_sessions SET permissions=$2 WHERE id=$1',[session,{manager:false,sections:{rosters:'manage'}}])
 await call(`/v2/roster/view-shares/${share.shareId}/import?server_id=${target}`,'POST',undefined,scoped)
 await call(`/v2/roster/view-shares/${share.shareId}/import?server_id=${source}`,'POST',undefined,scoped,403)
 await call(`/v2/roster/view-shares/${legacy}`,'GET',undefined,recipientToken,404)
 await call(`/v2/roster/view-shares/${legacy}/import?server_id=${target}`,'POST',undefined,recipientToken,404)
 await db.query("INSERT INTO roster_views(server_id,name,source_code,created_by_discord_user_id) VALUES($1,'Changed later','async () => null',$2)",[target,recipient])
 const another=await call(`/v2/roster/views/${viewId}/share?server_id=${source}`,'POST',undefined,senderToken,201)
 assert.equal((await call(`/v2/roster/view-shares/${another.shareId}/import?server_id=${target}`,'POST')).name,'Changed later (2)','Name collision must retain both independent views')
 await call('/v2/roster/view-shares/UnknownImport1','GET',undefined,recipientToken,404)
 assert.equal((await db.query('SELECT count(*)::int AS n FROM rosters WHERE server_id=$1',[target])).rows[0].n,0,'Import must not copy rosters or players')
 console.log('PASS shared-view import: authenticated external preview, actual sharer attribution, no source access/data, immutable snapshot, authorized destination, concurrent idempotence, edits preserved, old links rejected and no code execution')
}
