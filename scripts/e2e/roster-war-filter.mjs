import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

// Real HTTP/SQL/archive test. An irrelevant friendly war is deliberately
// unreadable: regular/CWL requests must exclude it before archive loading.
export async function verifyRosterWarFilter({db,origin,botKey}) {
 assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1')
 const server='999999999999991601',tag='#PYLQCCVU',enemy='#PYLQCCVY',roster=randomUUID(),ids=[]
 await db.query("INSERT INTO servers(id,name) VALUES($1,'War filter fixture')",[server])
 await db.query("INSERT INTO rosters(id,server_id,alias,roster_type,signup_scope) VALUES($1,$2,'War filter','family','family-only')",[roster,server])
 await db.query('INSERT INTO roster_members(roster_id,tag,name,townhall) VALUES($1,$2,$3,18)',[roster,tag,'Filter player'])
 const end=new Date(Date.now()-86400000),start=new Date(end.valueOf()-86400000),prep=new Date(start.valueOf()-86400000)
 for(const type of ['random','friendly']){
  const id=(await db.query("INSERT INTO wars(clan_tag,opponent_tag,prep_time,start_time,end_time,size,attacks_per_member,war_type,state) VALUES($1,$2,$3,$4,$5,1,2,$6,'warEnded') RETURNING war_id",[tag,enemy,prep,start,end,type])).rows[0].war_id
  ids.push(id)
  if(type==='random')await db.query('INSERT INTO war_archive_pending(war_id,end_time,payload) VALUES($1,$2,$3)',[id,end,JSON.stringify({state:'warEnded',teamSize:1,attacksPerMember:2,preparationStartTime:prep.toISOString(),startTime:start.toISOString(),endTime:end.toISOString(),battleModifier:'none',clan:{tag,name:'Clan',badgeToken:'local',clanLevel:10,attacks:1,stars:3,destructionPercentage:100,members:[{tag,name:'Player',townhallLevel:18,mapPosition:1,attacks:[{defenderTag:enemy,stars:3,destructionPercentage:100,order:1,duration:120}]}]},opponent:{tag:enemy,name:'Enemy',badgeToken:'local',clanLevel:10,attacks:0,stars:0,destructionPercentage:0,members:[{tag:enemy,name:'Enemy',townhallLevel:18,mapPosition:1,attacks:[]}]}})])
 }
 await db.query('INSERT INTO player_war_history(player_tag,war_ids) VALUES($1,$2)',[tag,ids])
 const query=async(metricId,parameters,expected=200)=>{
  const r=await fetch(origin+'/v2/roster/metrics/query?server_id='+server,{method:'POST',headers:{authorization:'Bearer '+botKey,'content-type':'application/json'},body:JSON.stringify({rosterIds:[roster],metricId,parameters,force:false})})
  const result=await r.json();assert.equal(r.status,expected,metricId+': '+JSON.stringify(result));return result
 }
 try {
  for(const [metric,parameters,expected] of [
   ['war.regular_hit_rate',{windowDays:30},100],
   ['war.hit_rate',{windowDays:30,warType:'random'},100],
   ['war.hit_rate_confidence',{windowDays:30,warType:'random'},null],
   ['war.cwl_hit_rate',{windowDays:30},null],
   ['cwl.stars',{seasonOffset:0},null],
  ]) {
   const result=await query(metric,parameters)
   assert.equal(result.rows.length,1)
   if(metric==='war.hit_rate_confidence')assert.equal(result.rows[0].value.attacks,1)
   else assert.equal(result.rows[0].value,expected)
  }
  await query('war.hit_rate',{windowDays:30,warType:'friendly'},503)
  console.log('PASS roster war filter: actual API excludes unreadable friendly archives from regular/CWL metrics; explicit friendly query still reads them; rates, samples and unknown results retained')
 } finally {
  await db.query('DELETE FROM player_war_history WHERE player_tag=$1',[tag]);await db.query('DELETE FROM war_archive_pending WHERE war_id=ANY($1::int[])',[ids]);await db.query('DELETE FROM wars WHERE war_id=ANY($1::int[])',[ids]);await db.query('DELETE FROM servers WHERE id=$1',[server])
 }
}
