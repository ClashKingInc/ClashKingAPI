import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import pg from 'pg'
const root=resolve('.local/scoped-import')
const offsets=JSON.parse(readFileSync(resolve(root,'local-archive-offsets.json'),'utf8'))
const packs=JSON.parse(readFileSync(resolve(root,'local-pack-metadata.json'),'utf8'))
const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8')).filter(x=>x.count>0)
const q=s=>'"'+s.replaceAll('"','""')+'"'
const c=new pg.Client({connectionString:'postgres://clashking_local:clashking_local@127.0.0.1:54329/clashking_dev'})
await c.connect()
try {
  const constraints=(await c.query("SELECT conrelid::regclass::text AS child,confrelid::regclass::text AS parent FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace")).rows
  const pending=new Map(manifest.map(x=>[x.table,x])),ordered=[]
  while(pending.size){const ready=[...pending].filter(([name])=>!constraints.some(x=>x.child===name&&x.parent!==name&&pending.has(x.parent)));if(!ready.length)throw Error('Unresolved dependency cycle');for(const [name,m]of ready){ordered.push(m);pending.delete(name)}}
  const result=[]
  if(process.argv[2]==='merge'){
    const backup=resolve(root,'local-before-import.dump')
    if(!existsSync(backup))writeFileSync(backup,execFileSync('docker',['exec','clashking-rewrite-api-dev','pg_dump','-U','clashking_local','-d','clashking_dev','-Fc'],{maxBuffer:256*1024*1024}),{mode:0o600})
    await c.query('BEGIN')
  }
  for(const m of ordered){
    const columns=(await c.query("SELECT column_name,udt_name,is_nullable,column_default,is_generated,is_identity FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[m.table])).rows
    const names=columns.filter(x=>m.columns.includes(x.column_name)&&x.is_generated==='NEVER').map(x=>x.column_name)
    const missing=columns.filter(x=>!names.includes(x.column_name)&&x.is_nullable==='NO'&&x.column_default===null&&x.is_generated==='NEVER'&&x.is_identity==='NO').map(x=>x.column_name)
    if(missing.length)throw Error(`${m.table}: missing required columns ${missing.join(',')}`)
    let inserted=0
    if(process.argv[2]==='merge'){
      const deferred=(await c.query("SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND condeferrable AND contype IN ('u','x')",['public.'+m.table])).rows
      const primary=(await c.query("SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND contype='p'",['public.'+m.table])).rows[0]
      const conflict=deferred.length&&primary?`ON CONFLICT ON CONSTRAINT ${q(primary.conname)} DO NOTHING`:'ON CONFLICT DO NOTHING'
      const rows=readFileSync(resolve(root,m.table+'.jsonl'),'utf8').split('\n').filter(Boolean).map(JSON.parse)
        .filter(row=>!row.server_id||['923764211845312533','684667214347108386'].includes(row.server_id))
      for(const row of rows){
        // Retain reminder configuration without a usable production delivery credential.
        if(m.table==='reminders'&&row.webhook_token===null)row.webhook_token=''
        if(m.table==='wars'){
          const local=offsets[row.war_id];if(!local)throw Error('Missing local war offset')
          row.archive_offset=String(local.offset);row.archive_compressed_bytes=String(local.length)
        }
        if(m.table==='war_archive_packs'){
          const local=packs[row.pack_id];if(!local)throw Error('Missing validated local pack')
          for(const [key,value] of Object.entries(local))row[key]=typeof value==='object'?JSON.stringify(value):String(value)
          row.checkpoint_key=null;row.source_checkpoint=null
        }
      }
      for(let offset=0;offset<rows.length;offset+=100){
        const batch=rows.slice(offset,offset+100),values=[]
        const tuples=batch.map(row=>'('+names.map(name=>{values.push(row[name]??null);return '$'+values.length}).join(',')+')')
        const sql=`INSERT INTO public.${q(m.table)} (${names.map(q).join(',')}) OVERRIDING SYSTEM VALUE VALUES ${tuples.join(',')} ${conflict}`
        inserted+=(await c.query(sql,values)).rowCount
      }
    }
    result.push({table:m.table,source:m.count,inserted,existing:process.argv[2]==='merge'?m.count-inserted:undefined})
    console.log(JSON.stringify(result.at(-1)))
  }
  if(process.argv[2]==='merge'){
    // Imported explicit IDs must not collide with the next local insert.
    for(const m of ordered){
      const seqs=(await c.query("SELECT column_name,pg_get_serial_sequence(format('%I.%I',table_schema,table_name),column_name) AS seq FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[m.table])).rows.filter(x=>x.seq)
      for(const {column_name,seq}of seqs)await c.query(`SELECT setval($1::regclass,GREATEST((SELECT COALESCE(MAX(${q(column_name)}),1) FROM ${q(m.table)}),(SELECT last_value FROM ${seq})),true)`,[seq])
    }
    await c.query('COMMIT')
    writeFileSync(resolve(root,'merge-result.json'),JSON.stringify(result,null,2),{mode:0o600})
  }
} catch(error){await c.query('ROLLBACK');console.error({error:error.code??error.name,table:error.table,column:error.column,constraint:error.constraint,message:error.message});process.exitCode=1} finally{await c.end()}
