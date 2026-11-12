import assert from 'node:assert/strict'
import { storeTrackedClanFixture } from './tracked-clan-fixture.mjs'

// Called with the real local Worker's scoped-session request, after the harness
// has created the server and current Gateway snapshot in disposable Timescale.
export async function verifyClanLinks({ db, request, server, other, actor, clanProvider }) {
  assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1')
  const categories=[]
  for (const [name,position] of [['Priority',0],['Casual',1],['Empty',2]]) {
    categories.push((await db.query('INSERT INTO server_clan_categories(server_id,name,position) VALUES($1,$2,$3) RETURNING id::text,name', [server,name,position])).rows[0])
  }
  await db.query("INSERT INTO server_clan_categories(server_id,name,position) VALUES($1,'Other server',0)",[other])
  await db.query('INSERT INTO discord_cache.members(guild_id,user_id,data) VALUES($1,$2,$3)',[server,actor,{user:{id:actor,username:'Current member'},roles:[]}])
  const members=[{tag:'#QUY',name:'Current'}, {tag:'#QUG',name:'Off server'}, {tag:'#QUJ',name:'Hidden'}, {tag:'#QUL',name:'Unlinked'}]
  for(const [tag,name,category] of [['#QUP','Zeta',categories[0].id],['#QUQ','Alpha',categories[1].id],['#QUR','Beta',null],['#QUV','Alpha',categories[0].id]]) {
    await db.query(`INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received,members)
      VALUES($1,$2,true,0,$3,'',0,0,$4::jsonb)`,[tag,name,0,JSON.stringify([])])
    await db.query('INSERT INTO server_clans(server_id,tag,category_id,position) VALUES($1,$2,$3,$4)',[server,tag,category,tag==='#QUP'?1:0])
    const profile=await storeTrackedClanFixture(tag,name,tag==='#QUP'?members:[],{cache:!clanProvider || tag!=='#QUV'})
    clanProvider?.clans.set(tag,profile)
  }
  for(const [tag,userId,verified,hidden] of [['#QUY',actor,true,false],['#QUG','999999999999994919',false,false],['#QUJ',actor,true,true]]) {
    await db.query("INSERT INTO player_links(tag,user_id,source,is_verified,hidden) VALUES($1,$2,'discord',$3,$4)",[tag,userId,verified,hidden])
  }
  const endpoint=`/v2/links/server/${server}/clans`
  const result=await request(endpoint)
  assert.deepEqual(result.categories,categories,'Links returns saved category order, including empty categories, without foreign-server categories')
  assert.deepEqual(result.clans.map(({name,tag,category})=>[name,tag,category]),[
    ['Alpha','#QUV','Priority'],['Zeta','#QUP','Priority'],['Alpha','#QUQ','Casual'],['Beta','#QUR',null],
  ],'Saved category/clan ordering matches the Clans page')
  const roster=result.clans.find(({tag})=>tag==='#QUP').members
  const current=roster.find(({tag})=>tag==='#QUY')
  assert.equal(current.link.inServer,true)
  assert.equal(current.link.verified,true)
  assert.equal(current.link.username,'Current member')
  assert.equal(current.townHall,18,'Town Hall comes from the tracked snapshot even without a basic_player row')
  assert.equal(result.clans[0].observedAt,null,'Old SQL activity must not be reported as snapshot freshness')
  assert.equal(roster.find(({tag})=>tag==='#QUG').link.inServer,false)
  assert.equal(roster.find(({tag})=>tag==='#QUJ').link,null,'Unverified clans must not reveal hidden link identities')
  if(clanProvider){
    assert.deepEqual(clanProvider.clanReads,['#QUV'],'Only a missing tracked snapshot calls the upstream API, including when cached members are empty')
    await storeTrackedClanFixture('#QUQ','Alpha',[],{corrupt:true})
    await request(endpoint)
    assert.equal(clanProvider.clanReads.filter(tag=>tag==='#QUQ').length,1,'Corrupt snapshots fall back to the API')
    assert.equal(clanProvider.clanReads.filter(tag=>tag==='#QUV').length,2,'Fallback reads do not overwrite Tracking-owned snapshots')
  }
  await request(`/v2/links/server/${other}/clans`,{status:403})
  await request(`/v2/server/${server}/clan-categories`,{status:403})
  console.log('PASS clan links HTTP/SQL: saved category order, empty categories, name/tag order, current/off-server membership, hidden links, Links-only and foreign-server authorization')
}
