// Actual local Worker -> canonical disposable SQL + loopback Discord provider.
// No isolated helper tests, production requests or real Discord mutations.
import assert from 'node:assert/strict'

export async function verifyModerationActors({db,origin,botKey,profileProvider}) {
  assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1')
  assert.equal(new URL(origin).hostname,'127.0.0.1')
  const server='922222222222223301',actor='922222222222223302',unavailable='922222222222223303'
  const player='#P2Y2YP',missingPlayer='#P2Y2YQ'
  profileProvider.users.set(actor,{id:actor,username:'account-handle',global_name:'Global Moderator',avatar:'a_localmoderator',discriminator:'0',nick:'Guild nickname must not win'})
  await db.query("INSERT INTO servers(id,name) VALUES($1,'Moderation actor E2E')",[server])
  try {
    for(const [tag,user] of [[player,actor],[missingPlayer,unavailable]]) {
      await db.query("INSERT INTO server_bans(server_id,player_tag,player_name,reason,added_by) VALUES($1,$2,'Retained name','Retained reason',$3)",[server,tag,user])
      await db.query("INSERT INTO strikes(id,server_id,tag,date_created,reason,added_by,strike_weight) VALUES($1,$2,$3,now(),'Retained strike',$4,1)",[tag===player?'ACTOR00001':'ACTOR00002',server,tag,user])
    }
    const paths=[`/v2/server/${server}/bans`,`/v2/server/${server}/strikes`]
    const countBefore=profileProvider.userReads.length
    for(const path of paths) {
      const denied=await fetch(origin+path)
      assert.equal(denied.status,401,await denied.text())
    }
    assert.equal(profileProvider.userReads.length,countBefore,'Unauthenticated reads must not resolve actor profiles')
    assert.equal((await db.query('SELECT count(*)::int AS count FROM discord_cache.members WHERE guild_id=$1 AND user_id=$2',[server,actor])).rows[0].count,0)
    for(const path of paths) {
      const response=await fetch(origin+path,{headers:{authorization:`Bearer ${botKey}`}})
      const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.count,2)
      const known=body.items.find(item=>item.added_by===actor),missing=body.items.find(item=>item.added_by===unavailable)
      assert.equal(known.added_by_username,'Global Moderator')
      assert.equal(known.added_by_avatar_url,`https://cdn.discordapp.com/avatars/${actor}/a_localmoderator.gif`)
      assert.equal(missing.added_by,unavailable)
      assert.equal(missing.added_by_username,undefined,'Unavailable Discord profile must preserve record with unknown identity')
      assert.ok(missing.Notes==='Retained reason'||missing.reason==='Retained strike')
    }
    assert.equal(profileProvider.userReads.filter(id=>id===actor).length,1,'Ban/strike reads must reuse the same global profile')
    console.log('PASS moderation actors: real authenticated bans/strikes, global name without guild membership, cached identity, unavailable profile retains records, no unauthenticated profile reads')
  } finally {
    profileProvider.users.delete(actor)
    await db.query('DELETE FROM strikes WHERE server_id=$1',[server])
    await db.query('DELETE FROM server_bans WHERE server_id=$1',[server])
    await db.query('DELETE FROM servers WHERE id=$1',[server])
  }
}
