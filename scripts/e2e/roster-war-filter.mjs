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
  const groups=[], foreign='#PYLQCCVR';
  await db.query("INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received) VALUES($1,'CWL scope',true,0,1,'local',0,0)",[tag]);
  await db.query('INSERT INTO server_clans(server_id,tag) VALUES($1,$2)',[server,tag]);
  try {
   for(const [offset,stars,outside,reverse] of [[0,2,false,false],[1,null,false,false],[2,3,false,true],[0,3,true,false],[3,3,false,false]]) {
    const ended=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth()-offset,2));
    // Keep the current month's fixture in the past even near month start.
    if(ended>new Date())ended.setTime(Date.now()-1000);
    const started=new Date(ended.valueOf()-86400000),prepared=new Date(started.valueOf()-86400000);
    const season=ended.toISOString().slice(0,7),group=randomUUID().slice(0,12),warTag='#'+randomUUID().replaceAll('-','');groups.push(group);
    const ownSide=outside?foreign:tag, clanTag=reverse?enemy:ownSide, opponentTag=reverse?ownSide:(outside?tag:enemy);
    const id=(await db.query("INSERT INTO wars(clan_tag,opponent_tag,prep_time,start_time,end_time,size,attacks_per_member,war_type,state,war_tag) VALUES($1,$2,$3,$4,$5,1,1,'cwl','warEnded',$6) RETURNING war_id",[clanTag,opponentTag,prepared,started,ended,warTag])).rows[0].war_id;ids.push(id);
    const member={tag,name:'Player',townhallLevel:18,mapPosition:1,attacks:stars===null?[]:[{defenderTag:enemy,stars,destructionPercentage:stars*30,order:1,duration:100}]};
    const side=(sideTag,members)=>({tag:sideTag,name:'Clan',badgeToken:'local',clanLevel:10,attacks:0,stars:0,destructionPercentage:0,members});
    await db.query('INSERT INTO war_archive_pending(war_id,end_time,payload) VALUES($1,$2,$3)',[id,ended,JSON.stringify({state:'warEnded',battleModifier:'none',warTag,teamSize:1,attacksPerMember:1,preparationStartTime:prepared.toISOString(),startTime:started.toISOString(),endTime:ended.toISOString(),clan:side(clanTag,reverse?[]:[member]),opponent:side(opponentTag,reverse?[member]:[])})]);
    await db.query("INSERT INTO cwl_groups(cwl_id,season,state,rounds) VALUES($1,$2,'ended',$3)",[group,season,JSON.stringify(offset%2?[{warTags:[warTag]}]:[[warTag]])]);
    for(const t of [clanTag,opponentTag])await db.query('INSERT INTO cwl_group_clans(cwl_id,clan_tag) VALUES($1,$2)',[group,t]);
   }
   await db.query('UPDATE player_war_history SET war_ids=$2 WHERE player_tag=$1',[tag,ids]);
   const result=await query('cwl.performance_history',{windowMonths:3,familyOnly:true});
   const value=result.rows[0].value;
   assert.equal(value.observedSeasons,3);
   assert.equal(value.summary.completedWars,3);
   assert.equal(value.summary.attackStars,5);
   assert.equal(value.summary.attacks,2);
   assert.equal(value.summary.missedAttacks,1);
   assert.equal(value.summary.averageStarsPerWar,5/3);
   assert.equal(value.summary.averageStars,2.5);
   assert.equal(value.seasons.length,3);
   await query('cwl.performance_history',{windowMonths:0,familyOnly:true},400);
   await query('cwl.performance_history',{windowMonths:3,familyOnly:'yes'},400);
   console.log('PASS CWL actual API/SQL/archive: 3 calendar months, historical family side, opponent exclusion, missed attack retained, older season excluded, averages and counts');
  } finally {await db.query('DELETE FROM cwl_groups WHERE cwl_id=ANY($1::text[])',[groups]);}
  console.log('PASS roster war filter: actual API excludes unreadable friendly archives from regular/CWL metrics; explicit friendly query still reads them; rates, samples and unknown results retained')
 } finally {
  await db.query('DELETE FROM player_war_history WHERE player_tag=$1',[tag]);await db.query('DELETE FROM war_archive_pending WHERE war_id=ANY($1::int[])',[ids]);await db.query('DELETE FROM wars WHERE war_id=ANY($1::int[])',[ids]);await db.query('DELETE FROM servers WHERE id=$1',[server])
 }
}
