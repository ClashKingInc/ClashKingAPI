// Actual local Worker -> encrypted OAuth credential -> loopback Discord -> SQL.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { SignJWT } from 'jose'

export async function verifyGuildListCache({db,origin,signingKey,encryptionKey,provider}) {
 const actor='999999999999994951',server='999999999999994952',role='999999999999994953',app='999999999999999999'
 const generation=randomUUID(),device='guild-list-cache'
 // Use the service's actual credential encoder to prepare its local OAuth row.
 const bundled=await build({entryPoints:['workers/api/src/fernet.ts'],bundle:true,write:false,platform:'node',format:'esm'})
 const {encryptStoredFernet}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'))
 const encrypted=await encryptStoredFernet('local-oauth-token',encryptionKey)
 await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[actor])
 await db.query("INSERT INTO auth_discord_tokens(user_id,device_id,access_token_ciphertext,refresh_token_ciphertext,expires_at) VALUES($1,$2,$3,$3,now()+interval '1 hour')",[actor,device,encrypted])
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Cache E2E')",[server])
 await db.query("INSERT INTO discord_cache.gateway_shards(application_id,shard_id,shard_count,generation,healthy,heartbeat_at) VALUES($1,99,100,$2,true,now()-interval '5 minutes')",[app,generation])
 await db.query("INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete) VALUES($1,$2,$3,99,$4,true,true,true)",[server,{owner_id:app},app,generation])
 const token=await new SignJWT({device}).setProtectedHeader({alg:'HS256'}).setSubject(actor).setAudience('clashking-web').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signingKey))
 const request=async(path,status)=>{const res=await fetch(origin+path,{headers:{authorization:`Bearer ${token}`}});const body=await res.json();assert.equal(res.status,status,JSON.stringify(body));return body}
 provider.guilds=[{id:server,name:'Cache E2E',owner:false,permissions:'32',features:[]}]
 const listed=await request('/v2/guilds',200)
 assert(listed.some(g=>g.id===server),'Fresh OAuth manager must see server despite stale Gateway')
 await request(`/v2/roster/${server}/list`,503)
 provider.guilds=[{id:server,name:'Cache E2E',owner:false,permissions:'0',features:[]}]
 assert.equal((await request('/v2/guilds',200)).length,0,'No OAuth management or delegated grant means no access')
 await db.query("INSERT INTO dashboard_role_grants(server_id,role_id,section,access_level) VALUES($1,$2,'rosters','view')",[server,role])
 await request('/v2/guilds',503)
 await db.query("UPDATE discord_cache.gateway_shards SET heartbeat_at=now() WHERE application_id=$1 AND shard_id=99",[app])
 await db.query("INSERT INTO discord_cache.members(guild_id,user_id,data) VALUES($1,$2,$3)",[server,actor,{roles:[role]}])
 assert((await request('/v2/guilds',200)).some(g=>g.id===server&&g.delegated),'Fresh matching role grants delegated access')
 await db.query("UPDATE discord_cache.members SET data=$3 WHERE guild_id=$1 AND user_id=$2",[server,actor,{roles:[]}])
 assert.equal((await request('/v2/guilds',200)).length,0,'Revoked member role removes delegated access')
 provider.guilds=[]
 console.log('PASS guild listing: fresh OAuth manager survives stale Gateway; server operations and delegated grants stay fail-closed; role revocation removes access')
}
