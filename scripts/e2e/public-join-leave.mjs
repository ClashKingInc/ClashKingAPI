// Real anonymous HTTP requests through the API and canonical disposable SQL.
import assert from 'node:assert/strict'
export async function verifyPublicJoinLeave({db,origin}) {
  assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1')
  const player='#QJLR08',other='#QJLR09',clan='#QJLR0P'
  const now=Date.now(),early=new Date(now-7200000),middle=new Date(now-3600000),late=new Date(now-1800000)
  assert.equal((await db.query('SELECT 1 FROM join_leave_history WHERE player_tag=ANY($1::text[])',[[player,other]])).rowCount,0)
  await db.query("INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received) VALUES($1,'Public history fixture',true,0,2,'',0,0)",[clan])
  const read=async(path,status=200)=>{
    const response=await fetch(origin+path,{headers:{origin:'https://external.example'}})
    const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return {response,body}
  }
  try {
    await db.query(`INSERT INTO join_leave_history(time,type,clan_tag,player_tag,player_name,townhall_level)
      VALUES($1,'join',$4,$5,'First',18),($2,'leave',$4,$5,'First',18),($3,'join',$4,$6,'Second',17)`,[early,middle,late,clan,player,other])
    const pp='/v2/player/'+encodeURIComponent(player)+'/join-leave',cp='/v2/clan/'+encodeURIComponent(clan)+'/join-leave'
    const p=await read(pp+'?limit=1');assert.equal(p.body.items.length,1);assert.equal(p.body.available,2);assert.equal(p.body.items[0].type,'leave');assert.equal(p.response.headers.get('access-control-allow-origin'),'*')
    const c=await read(cp+'?limit=1');assert.equal(c.body.items.length,1);assert.equal(c.body.available,3);assert.equal(c.body.uniquePlayers,2)
    const earlier=await read(pp+'?time[before]='+encodeURIComponent(new Date(middle.getTime()-1).toISOString()));assert.equal(earlier.body.items.length,1);assert.equal(earlier.body.items[0].type,'join')
    const totals=await read(pp+'/totals');assert.equal(totals.body.items[0].clan.tag,clan)
    await read(pp+'?limit=invalid',400)
    await read('/v2/player/%23/join-leave',400)
    await read('/v2/clan/%23/join-leave',400)
    await read('/v2/player/'+encodeURIComponent(player)+'/last-activity',401)
    await read('/v2/auth/me',401)
    await read('/v2/player/'+encodeURIComponent(player)+'/timers')
    console.log('PASS anonymous player/clan history: data, limits, date filtering, totals, public CORS, validation, private activity guards')
  }finally{
    await db.query('DELETE FROM join_leave_history WHERE player_tag=ANY($1::text[])',[[player,other]])
    await db.query('DELETE FROM basic_clan WHERE tag=$1',[clan])
  }
}
