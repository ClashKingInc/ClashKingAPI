import assert from 'node:assert/strict'

// Called with the real local Worker's scoped-session request, after the harness
// has created the server and current Gateway snapshot in disposable Timescale.
export async function verifyClanLinks({ db, request, server, other, actor }) {
  assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE, '1')
  const categories=[]
  for (const [name,position] of [['Priority',0],['Casual',1],['Empty',2]]) {
    categories.push((await db.query('INSERT INTO server_clan_categories(server_id,name,position) VALUES($1,$2,$3) RETURNING id::text,name', [server,name,position])).rows[0])
  }
  await db.query("INSERT INTO server_clan_categories(server_id,name,position) VALUES($1,'Other server',0)",[other])
  await db.query('INSERT INTO discord_cache.members(guild_id,user_id,data) VALUES($1,$2,$3)',[server,actor,{user:{id:actor,username:'Current member'},roles:[]}])
  const members=[{tag:'#QUY',name:'Current'}, {tag:'#QUG',name:'Off server'}, {tag:'#QUJ',name:'Hidden'}]
  for(const [tag,name,category] of [['#QUP','Zeta',categories[0].id],['#QUQ','Alpha',categories[1].id],['#QUR','Beta',null],['#QUV','Alpha',categories[0].id]]) {
    await db.query(`INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received,members)
      VALUES($1,$2,true,0,$3,'',0,0,$4::jsonb)`,[tag,name,tag==='#QUP'?members.length:0,JSON.stringify(tag==='#QUP'?members:[])])
    await db.query('INSERT INTO server_clans(server_id,tag,category_id) VALUES($1,$2,$3)',[server,tag,category])
  }
  for(const [tag,userId,verified,hidden] of [['#QUY',actor,true,false],['#QUG','999999999999994919',false,false],['#QUJ',actor,true,true]]) {
    await db.query("INSERT INTO player_links(tag,user_id,source,is_verified,hidden) VALUES($1,$2,'discord',$3,$4)",[tag,userId,verified,hidden])
  }
  const endpoint=`/v2/links/server/${server}/clans`
  const result=await request(endpoint)
  assert.deepEqual(result.categories,categories,'Links returns saved category order, including empty categories, without foreign-server categories')
  assert.deepEqual(result.clans.map(({name,tag,category})=>[name,tag,category]),[
    ['Alpha','#QUQ','Casual'],['Alpha','#QUV','Priority'],['Beta','#QUR',null],['Zeta','#QUP','Priority'],
  ],'Name/tag ordering within each category matches the Clans page')
  const roster=result.clans.find(({tag})=>tag==='#QUP').members
  const current=roster.find(({tag})=>tag==='#QUY')
  assert.equal(current.link.inServer,true)
  assert.equal(current.link.verified,true)
  assert.equal(current.link.username,'Current member')
  assert.equal(current.townHall,null,'Missing basic_player rows do not hide roster links')
  assert.equal(roster.find(({tag})=>tag==='#QUG').link.inServer,false)
  assert.equal(roster.find(({tag})=>tag==='#QUJ').link,null,'Unverified clans must not reveal hidden link identities')
  await request(`/v2/links/server/${other}/clans`,{status:403})
  await request(`/v2/server/${server}/clan-categories`,{status:403})
  console.log('PASS clan links HTTP/SQL: saved category order, empty categories, name/tag order, current/off-server membership, hidden links, Links-only and foreign-server authorization')
}
