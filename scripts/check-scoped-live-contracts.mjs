import { build } from 'esbuild'
const result = await build({ stdin: { contents: String.raw`
import {Schema} from 'effect';
import {readFileSync} from 'node:fs';
import {ProxyPlayerResponse,ProxyClanResponse,ProxyWarlogResponse,ProxyCapitalRaidSeasonsResponse} from './packages/api-contracts/src/proxy.ts';
const clans=new Set();
async function check(path,schema){const r=await fetch('https://proxy.clashk.ing/v1/'+path);if(r.status!==200){console.log(path,r.status);return}const d=await r.json();try{Schema.decodeUnknownSync(schema)(d)}catch(e){console.log(path,String(e))}return d}
for(const row of readFileSync('.local/scoped-import/player_links.jsonl','utf8').trim().split('\n').map(JSON.parse)){
const p=await check('players/'+encodeURIComponent(row.tag),ProxyPlayerResponse);if(p?.clan)clans.add(p.clan.tag)}
for(const tag of clans)for(const [suffix,schema]of [['',ProxyClanResponse],['/warlog',ProxyWarlogResponse],['/capitalraidseasons?limit=10',ProxyCapitalRaidSeasonsResponse]])await check('clans/'+encodeURIComponent(tag)+suffix,schema);
console.log('Checked all live player and clan contracts');
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' })
await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
