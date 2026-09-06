import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
const root=resolve('.local/scoped-import')
const frames=resolve(root,'frames'),packs=resolve('.local/imported-archives/packs')
mkdirSync(frames,{recursive:true,mode:0o700});mkdirSync(packs,{recursive:true,mode:0o700})
const wars=readFileSync(resolve(root,'wars.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse)
let index=0,done=0
await Promise.all(Array.from({length:6},async()=>{while(index<wars.length){const war=wars[index++];if(!war.archive_pack_id)continue;const path=resolve(frames,war.war_id+'.zstd');const length=Number(war.archive_compressed_bytes),offset=Number(war.archive_offset)
if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<=0||length>8*1024*1024)throw Error('Invalid archive locator')
if(!existsSync(path)){
 let bytes
 for(let attempt=0;attempt<3;attempt++){
  const r=await fetch(`https://wars.clashk.ing/packs/${war.archive_pack_id.padStart(6,'0')}.pack`,{headers:{Range:`bytes=${offset}-${offset+length-1}`},signal:AbortSignal.timeout(30000)})
  if(r.status!==206){await r.body?.cancel();if(attempt===2)throw Error(`Archive ${war.war_id} returned ${r.status}`);continue}
  if(!r.headers.get('content-range')?.startsWith(`bytes ${offset}-${offset+length-1}/`)){await r.body?.cancel();throw Error('Archive range mismatch')}
  bytes=Buffer.from(await r.arrayBuffer());if(bytes.length!==length)throw Error('Incomplete archive frame');break
 }
 writeFileSync(path,bytes,{mode:0o600})
}
done++;if(done%250===0)console.log(JSON.stringify({downloaded:done,total:wars.length}))
}}))
const groups=new Map()
for(const w of wars){if(!w.archive_pack_id)continue;if(!groups.has(w.archive_pack_id))groups.set(w.archive_pack_id,[]);groups.get(w.archive_pack_id).push(w)}
const offsets={}
for(const [id,items]of groups){let offset=0;const buffers=[];for(const w of items){const bytes=readFileSync(resolve(frames,w.war_id+'.zstd'));offsets[w.war_id]={packId:id,offset,length:bytes.length};buffers.push(bytes);offset+=bytes.length}writeFileSync(resolve(packs,id.padStart(6,'0')+'.pack'),Buffer.concat(buffers),{mode:0o600})}
writeFileSync(resolve(root,'local-archive-offsets.json'),JSON.stringify(offsets),{mode:0o600})
console.log(JSON.stringify({event:'scoped_archives_ready',wars:done,packs:groups.size,bytes:Object.values(offsets).reduce((n,x)=>n+x.length,0)}))
