import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

// Real workerd API reads over canonical disposable SQL. These are persisted
// configuration changes, not mocked responses or synthetic Discord deliveries.
export async function verifyOperationalReads({db,origin,botKey}) {
 const server='922222222222222201', player='#P2Y2Y2', clan='#Q2Y2Y2', giveaway=randomUUID()
 const read=async(path)=>{
  const r=await fetch(origin+path,{headers:{authorization:`Bearer ${botKey}`}})
  const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body
 }
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Operational reads')",[server])
 try {
  assert.equal((await read(`/v2/server/${server}/bans`)).items.length,0)
  assert.equal((await read(`/v2/server/${server}/giveaways`)).total,0)
  await db.query("INSERT INTO basic_clan(tag,name,public_war_log,war_wins,member_count,badge_token,troops_donated,troops_received) VALUES($1,'Current clan',true,0,1,'',0,0)",[clan])
  await db.query("INSERT INTO basic_player(tag,name,clan_tag,townhall_level) VALUES($1,'Current player',$2,18)",[player,clan])
  await db.query("INSERT INTO server_bans(server_id,player_tag,player_name,reason,added_by) VALUES($1,$2,'Saved player','Retained record','922222222222222202')",[server,player])
  await db.query("INSERT INTO giveaways(id,server_id,prize,status,start_time,end_time,winners) VALUES($1,$2,'Visible upcoming','scheduled',now()+interval '1 hour',now()+interval '2 hours',1)",[giveaway,server])
  const bans=await read(`/v2/server/${server}/bans`)
  assert.equal(bans.items[0].VillageTag,player);assert.equal(bans.items[0].clan_name,'Current clan')
  assert.equal((await read(`/v2/server/${server}/giveaways`)).upcoming[0].id,giveaway)
  await db.query("UPDATE giveaways SET status='ongoing',start_time=now()-interval '1 minute' WHERE id=$1",[giveaway])
  assert.equal((await read(`/v2/server/${server}/giveaways`)).ongoing[0].id,giveaway)
  console.log('PASS operational reads: persisted ban with current clan and scheduled/ongoing giveaway transitions')
 } finally {
  await db.query('DELETE FROM giveaways WHERE server_id=$1',[server]);await db.query('DELETE FROM server_bans WHERE server_id=$1',[server]);
  await db.query('DELETE FROM basic_player WHERE tag=$1',[player]);await db.query('DELETE FROM basic_clan WHERE tag=$1',[clan]);await db.query('DELETE FROM servers WHERE id=$1',[server])
 }
}
