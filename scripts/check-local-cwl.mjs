import { SignJWT } from 'jose'
import { loadLocalApiSecrets } from './local-api-keychain.mjs'
import { readFileSync } from 'node:fs'
const config = JSON.parse(readFileSync('workers/api/wrangler.jsonc','utf8').split('\n').filter(line=>!line.trimStart().startsWith('//')).join('\n'))
const token = await new SignJWT({device:'local-cwl-check'}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setSubject('706149153431879760').setAudience(config.vars.NATIVE_TOKEN_AUDIENCE).setIssuedAt().setExpirationTime('5m').sign(new TextEncoder().encode(loadLocalApiSecrets().JWT_ACCESS_SECRET))
for (const tag of ['#2VC0Q9LV','#2GYQ8YY2V','#VY2J0LL']) {
  for (const path of [`/v2/war/${encodeURIComponent(tag)}/basic`, `/proxy/v1/clans/${encodeURIComponent(tag)}/currentwar/leaguegroup`]) {
    const r=await fetch('http://127.0.0.1:8787'+path,{headers:{authorization:`Bearer ${token}`}})
    const data=await r.json()
    console.log(JSON.stringify({path,status:r.status,state:data?.state,type:data?.type,season:data?.season,rounds:data?.rounds?.length,code:data?.code,message:data?.message}))
  }
}
const r=await fetch('http://127.0.0.1:8787/v2/initialization',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({player_tags:['#2J8V28GV0']})})
const d=await r.json()
console.log(JSON.stringify({initialization:r.status,keys:Object.keys(d),wars:d?.clans?.war_data?.map(x=>({tag:x.clan_tag,cwl:x.isInCwl,war:x.isInWar,wars:x.war_league_infos?.length})),code:d.code,message:d.message}))
const links = readFileSync('.local/scoped-import/player_links.jsonl','utf8').trim().split('\n').map(JSON.parse)
for (const user of ['706149153431879760','506210109790093342']) {
  const tags = links.filter(x=>x.user_id===user).map(x=>x.tag)
  const response = await fetch('http://127.0.0.1:8787/v2/initialization',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({player_tags:tags})})
  const data = await response.json()
  console.log(JSON.stringify({accountSet:user,requested:tags.length,status:response.status,players:data.players_basic?.length,clans:data.clan_tags?.length,cwlClans:data.clans?.war_data?.filter(x=>x.isInCwl).map(x=>x.clan_tag),message:data.message}))
  if(response.status!==200)process.exitCode=1
}
