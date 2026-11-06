// Actual local Worker -> authenticated bot route -> current Gateway SQL snapshot.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
export async function verifyManualRefreshTargets({db,origin,botKey}) {
 const app='999999999999999999',guild='999999999999996101',actor='999999999999996102',role='999999999999996103'
 const eligible='999999999999996104',unroled='999999999999996105',bot='999999999999996106',generation=randomUUID()
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Refresh fixture')",[guild])
 await db.query("INSERT INTO discord_cache.gateway_shards(application_id,shard_id,shard_count,generation,healthy,heartbeat_at) VALUES($1,98,100,$2,true,now())",[app,generation])
 await db.query("INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete) VALUES($1,$2,$3,98,$4,true,true,true)",[guild,{owner_id:actor},app,generation])
 await db.query("INSERT INTO discord_cache.roles(guild_id,id,data) VALUES($1,$2,$3),($1,$1,$4)",[guild,role,{id:role,permissions:'0'},{id:guild,permissions:'0'}])
 for(const [id,data] of [[actor,{user:{id:actor},roles:[role]}],[eligible,{user:{id:eligible}}],[unroled,{user:{id:unroled}}],[bot,{user:{id:bot,bot:true},roles:[role]}]])
  await db.query("INSERT INTO discord_cache.members(guild_id,user_id,data) VALUES($1,$2,$3)",[guild,id,data])
 await db.query("INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received) VALUES('#REFRESHCLAN','Refresh',true,0,1,'',0,0)")
 await db.query("INSERT INTO basic_player(tag,name,clan_tag,townhall_level) VALUES('#REFRESHPLAYER','Eligible','#REFRESHCLAN',16)")
 await db.query("INSERT INTO server_clans(server_id,tag) VALUES($1,'#REFRESHCLAN')",[guild])
 await db.query("INSERT INTO player_links(tag,user_id,source) VALUES('#REFRESHPLAYER',$1,'discord')",[eligible])
 await db.query("INSERT INTO server_roles(server_id,type,option,role_id) VALUES($1,'family','family',$2)",[guild,role])
 const request=async(targetId,targetKind='role',actorId=actor,status=200)=>{
  const r=await fetch(`${origin}/v2/bot/role-refresh/${guild}/manual-targets`,{method:'POST',headers:{authorization:`Bearer ${botKey}`,'content-type':'application/json'},body:JSON.stringify({actorId,targetId,targetKind})})
  const body=await r.json();assert.equal(r.status,status,JSON.stringify(body));return body
 }
 assert.deepEqual((await request(role)).users.sort(),[actor,eligible].sort(),'Role expansion accepts omitted empty roles, includes eligible family member, excludes bots/unrelated members')
 assert.deepEqual((await request(guild)).users.sort(),[actor,eligible,unroled].sort(),'Everyone means all human members, including members with no explicit roles')
 assert.deepEqual((await request(unroled,'user',unroled)).users,[unroled],'Unroled member can request their own refresh')
 await request(role,'role',unroled,403)
 await request(role,'role','999999999999996199',403)
 await db.query("UPDATE discord_cache.gateway_shards SET heartbeat_at=now()-interval '2 minutes' WHERE application_id=$1 AND shard_id=98",[app])
 await request(role,'role',actor,503)
 assert.equal(Number((await db.query('SELECT count(*) FROM role_refresh_jobs WHERE server_id=$1',[guild])).rows[0].count),0,'Target selection must not create background work')
 console.log('PASS manual role refresh: omitted empty roles, eligible family expansion, everyone, bot exclusion, authorization and stale-cache rejection')
}
