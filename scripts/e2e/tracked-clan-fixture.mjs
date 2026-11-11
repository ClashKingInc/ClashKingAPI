import assert from 'node:assert/strict'
import { createConnection } from 'node:net'
import { compress } from 'snappyjs'

// Seed the real disposable Valkey with Tracking's Snappy wire format.
export async function storeTrackedClanFixture(tag, name, members, {cache=true,corrupt=false}={}) {
  assert.equal(process.env.CLASHKING_DISPOSABLE_VALKEY, '1')
  const url=new URL(process.env.TEST_VALKEY_URL)
  assert.equal(url.hostname,'127.0.0.1')
  const clan={tag,name,clanLevel:12,clanPoints:20000,members:members.length,type:'inviteOnly',
    clanCapital:{capitalHallLevel:10,districts:[]},badgeUrls:{small:'https://example.invalid/clan.png'},
    memberList:members.map(member=>({role:'member',clanRank:1,previousClanRank:1,donations:0,donationsReceived:0,expLevel:200,trophies:5000,townHallLevel:18,...member}))}
  if(!cache)return clan
  const parts=[Buffer.from('SET'),Buffer.from(`trackedclans:snapshot:clan:${tag}`),corrupt?Buffer.from('invalid-snappy'):Buffer.from(compress(Buffer.from(JSON.stringify(clan))))]
  const payload=Buffer.concat([Buffer.from(`*${parts.length}\r\n`),...parts.flatMap(part=>[Buffer.from(`$${part.length}\r\n`),part,Buffer.from('\r\n')])])
  await new Promise((resolve,reject)=>{
    const socket=createConnection({host:url.hostname,port:Number(url.port)},()=>socket.write(payload))
    let reply=''
    socket.setTimeout(5000,()=>socket.destroy(Error('Valkey fixture timed out')))
    socket.on('error',reject)
    socket.on('data',data=>{reply+=data.toString();if(reply.endsWith('\r\n')){socket.end();if(reply==='+OK\r\n')resolve();else reject(Error('Valkey fixture write failed'))}})
  })
  return clan
}
