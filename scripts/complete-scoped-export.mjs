import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
const root=resolve('.local/scoped-import')
const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8'))
const rows=t=>readFileSync(resolve(root,t+'.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse)
const sqlString=x=>"'"+x.replaceAll("'","''")+"'"
const users=rows('player_links').map(x=>x.tag).map(sqlString).join(',')
const packIds=[...new Set(rows('wars').map(x=>x.archive_pack_id).filter(Boolean))]
for(const table of ['war_archive_packs','join_leave_history']){
 const item=manifest.find(x=>x.table===table)
 const fields=item.columns.map(x=>`'${x}',"${x}"::text`).join(',')
 const query=table==='war_archive_packs'?`SELECT * FROM war_archive_packs WHERE pack_id=ANY(ARRAY[${packIds.join(',')}]::bigint[])`:
 `SELECT * FROM join_leave_history WHERE player_tag=ANY(ARRAY[${users}]::text[]) UNION SELECT * FROM join_leave_history WHERE clan_tag=ANY(ARRAY['#2VC0Q9LV','#2GYQ8YY2V','#VY2J0LL']::text[])`
 const data=execFileSync('ssh',['root@152.53.82.182',`docker exec -i timescale-qsj8dfwekv4uw7ri76r9bhcx-044219017574 sh -c 'exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d clashking'`],{input:`BEGIN READ ONLY;SET LOCAL statement_timeout='120s';SELECT json_build_object(${fields}) FROM (${query}) selected;ROLLBACK;`,encoding:'utf8',maxBuffer:256*1024*1024}).trim()
 writeFileSync(resolve(root,table+'.jsonl'),data,{mode:0o600});delete item.error;item.count=data?data.split('\n').length:0
 writeFileSync(resolve(root,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});console.log(JSON.stringify({table,count:item.count}))
}
