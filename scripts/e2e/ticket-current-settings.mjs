// Run against the real old and current API Workers with baseline-079 disposable
// Timescale. An accepted multi-page operation must survive settings migration.
import assert from 'node:assert/strict';
import { spawn,execFileSync } from 'node:child_process';
import { randomUUID,generateKeyPairSync,sign } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync,copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import pg from 'pg';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1');
const dsn=new URL(process.env.TEST_DATABASE_URL);assert.equal(dsn.hostname,'127.0.0.1');assert.equal(dsn.pathname,'/clashking_test');
assert(process.env.CLASHKING_E2E_PREVIOUS_API_REPO,'The previous API checkout is required');
assert(process.env.CLASHKING_TICKET_MIGRATION_PATH);assert(process.env.CLASHKING_LAB_MIGRATION_PATH);
const db=new pg.Client({connectionString:dsn.href});await db.connect();
const guild='922222222222222901',actor='922222222222222902',other='922222222222222903',app='922222222222222904',channel='922222222222222905',message='922222222222222906';
const panel=randomUUID(),button=randomUUID(),customId=`ck:ticket:open:${panel}:${button}`;
const {privateKey,publicKey}=generateKeyPairSync('ed25519');const publicHex=publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
const key='ticket-e2e-only-'.padEnd(43,'x');let seq=922222222222222910n;
// Effects may wake as soon as the form is accepted. Route every Discord request
// to loopback, including background requests after the HTTP response returns.
const provider=createServer((request,response)=>{request.resume();response.writeHead(503,{'content-type':'application/json'});response.end(JSON.stringify({message:'Local fixture unavailable'}));});
await new Promise((resolveListen,reject)=>provider.once('error',reject).listen(0,'127.0.0.1',resolveListen));
const providerOrigin=`http://127.0.0.1:${provider.address().port}`;
const saved={mod_role:['922222222222222907'],no_ping_mod_role:[],questions:['Why join?','Second?','Third?','Fourth?','Fifth?','Sixth?'],account_apply:false,private_thread:false,th_min:1,naming:'{ticket_count}-{user}',num_apply:25,player_info:false,apply_clans:[],roles_to_add:[],roles_to_remove:[],townhall_requirements:{},new_message:'Welcome'};
const welcome={content:'Welcome text',embeds:[{description:'Welcome to the ticket'}],components:[{type:1,components:[{type:2,style:5,label:'Guide',url:'https://example.com/guide',custom_id:'redundant'},{type:2,style:1,label:'Old action',custom_id:'p_old'}]}]};
const extra={...saved,new_message:null,no_ping_mod_role:null,account_apply:true,questions:['  '+ '😀'.repeat(25),'Two','Three','Four','Five'],message:{description:'Inline welcome',type:'rich',color:null,image:{url:'attachment://missing',proxy_url:'https://example.com/image.png'}}};
await db.query("INSERT INTO servers(id,name) VALUES($1,'Ticket settings E2E')",[guild]);
await db.query("INSERT INTO server_custom_embeds(server_id,name,data) VALUES($1,'Welcome',$2::jsonb)",[guild,JSON.stringify(welcome)]);
await db.query('INSERT INTO ticket_panels(id,server_id,name,components,data) VALUES($1::uuid,$2,$3,$4::jsonb,$5::jsonb)',[panel,guild,'Ticket fixture',JSON.stringify([{id:button,type:2,custom_id:customId,label:'Apply',style:1}]),JSON.stringify({[customId+'_settings']:saved,extra_settings:extra,legacy_publications:{[channel+':'+message]:{message:{components:[{type:1,components:[{type:2,custom_id:customId,label:'Apply',style:1}]}]}}}})]);
let logs='';const children=[];
const start=async(cwd,port)=>{
 const child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{cwd,stdio:['ignore','pipe','pipe'],env:{...process.env,CLASHKING_LOCAL_STATIC_ASSETS_ROOT:process.env.CLASHKING_LOCAL_STATIC_ASSETS_ROOT,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_ADMIN_IDENTITY:'0',CLASHKING_E2E_API_BOT_TOKEN:key,CLASHKING_LOCAL_DISCORD_CLIENT_ID:app,CLASHKING_LOCAL_DISCORD_APPLICATION_ID:app,CLASHKING_LOCAL_DISCORD_PUBLIC_KEY:publicHex,CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'fixture',CLASHKING_LOCAL_DISCORD_BOT_TOKEN:'fixture-only',CLASHKING_LOCAL_DISCORD_TEST_ORIGIN:providerOrigin,CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_LOCAL_FCM_CREDENTIALS_FILE:''}});
 let childLogs='';children.push(child);const capture=x=>{logs+=x;childLogs+=x};child.stdout.on('data',capture);child.stderr.on('data',capture);
 const origin=`http://127.0.0.1:${port}`;let ready=false;
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error(logs.slice(-3000));try{ready=(await fetch(origin+'/v2/health')).ok&&childLogs.includes('isolated_api_ready')&&childLogs.includes('local_static_assets_seeded')}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}
 assert(ready,logs.slice(-3000));return origin;
};
const proof=(id=customId,user=actor,values,type=3,components)=>{const rawBody=JSON.stringify({id:String(seq++),application_id:app,type,guild_id:guild,channel_id:channel,member:{user:{id:user,username:'Fixture'},roles:[],permissions:'0'},message:{id:message,author:{id:app}},data:type===5?{custom_id:id,components}: {custom_id:id,component_type:values?3:2,...(values?{values}:{})}});const timestamp=String(Math.floor(Date.now()/1000));return {interaction:{rawBody,timestamp,signature:sign(null,Buffer.from(timestamp+rawBody),privateKey).toString('hex')}};};
const call=async(origin,path,body,status=200)=>{const response=await fetch(origin+path,{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify(body)});const json=await response.json();assert.equal(response.status,status,JSON.stringify(json));return json;};
const modalFields=indices=>indices.map(i=>({type:1,components:[{type:4,custom_id:`q:${i}`,value:`Answer ${i}`}]}));
try {
 const previous=await start(resolve(process.env.CLASHKING_E2E_PREVIOUS_API_REPO),8842);
 const old=await call(previous,'/v2/runtime/tickets/open/prepare',proof());assert.equal(old.outcome,'ready');assert.equal(old.form.fields.length,5);
 const operation=old.operationId,advance=`/v2/runtime/ticket-operations/${operation}/advance`;
 const next=await call(previous,advance,proof(`ck:ticket:answers:${operation}:0`,actor,undefined,5,modalFields([0,1,2,3,4])));assert.equal(next.form.kind,'continue');
 const before=(await db.query('SELECT context,progress,progress_receipts FROM ticket_runtime_operations WHERE id=$1::uuid',[operation])).rows[0];
 assert.equal(before.context.questions.length,6);assert.equal(before.context.pages.length,2);assert.equal(Object.keys(before.progress.answers).length,5);assert.equal(Object.keys(before.progress_receipts).length,1);
 children.at(-1).kill('SIGTERM');await new Promise(resolveExit=>children.at(-1).once('exit',resolveExit));
 const migrationDir=mkdtempSync(join(tmpdir(),'ticket-migration-'));
 copyFileSync(process.env.CLASHKING_TICKET_MIGRATION_PATH,join(migrationDir,'081_current_ticket_settings.sql'));
 copyFileSync(process.env.CLASHKING_LAB_MIGRATION_PATH,join(migrationDir,'082_server_lab_tenure.sql'));
 execFileSync('goose',['-allow-missing','-dir',migrationDir,'postgres',dsn.href,'up'],{stdio:'pipe'});
 const data=(await db.query('SELECT data FROM ticket_panels WHERE id=$1::uuid',[panel])).rows[0].data,settings=data[customId+'_settings'];
 for(const obsolete of ['questions','num_apply','player_info','apply_clans','townhall_requirements','new_message'])assert(!Object.hasOwn(settings,obsolete),obsolete);
 assert.equal(settings.application_questions.length,5);assert.equal(settings.application_questions[0].label,'Why join?');assert.deepEqual(settings.mod_role,saved.mod_role);
 assert.equal(settings.opening_message.content,'Welcome text');assert.equal(settings.opening_message.embeds[0].description,'Welcome to the ticket');assert.equal(settings.opening_message.components[0].components.length,1);assert(!Object.hasOwn(settings.opening_message.components[0].components[0],'custom_id'));
 assert.equal(data.extra_settings.application_questions.length,4);assert.equal(data.extra_settings.application_questions[0].label,'😀'.repeat(22));assert.deepEqual(data.extra_settings.no_ping_mod_role,[]);assert.deepEqual(data.extra_settings.opening_message.embeds[0].image,{url:'https://example.com/image.png'});assert(!Object.hasOwn(data.extra_settings.opening_message.embeds[0],'type'));
 assert.deepEqual((await db.query("SELECT data FROM server_custom_embeds WHERE server_id=$1 AND name='Welcome'",[guild])).rows[0].data,welcome,'shared source template stays intact');
 const after=(await db.query('SELECT context,progress,progress_receipts FROM ticket_runtime_operations WHERE id=$1::uuid',[operation])).rows[0];
 assert.equal(after.context.settings.application_questions.length,5);for(const field of ['questions','pages','welcomeEmbeds'])assert.deepEqual(after.context[field],before.context[field]);assert.deepEqual(after.progress,before.progress);assert.deepEqual(after.progress_receipts,before.progress_receipts);
 assert.equal((await db.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='ticket_runtime_operations'::regclass AND tgname='guard_ticket_runtime_operation'")).rows[0].tgenabled,'O','immutable context guard is enabled after migration');
 await assert.rejects(db.query("UPDATE ticket_runtime_operations SET context=jsonb_set(context,'{panelName}',to_jsonb('tampered'::text)) WHERE id=$1::uuid",[operation]),/identity and initial request are immutable/);
 const current=await start(process.cwd(),8831);
 const continued=await call(current,advance,proof(`ck:ticket:continue:${operation}:1`));assert.equal(continued.form.kind,'modal');assert.equal(continued.form.fields.length,1);
 const completed=await call(current,advance,proof(`ck:ticket:answers:${operation}:1`,actor,undefined,5,modalFields([5])));assert.equal(completed.outcome,'accepted');
 const final=(await db.query('SELECT context,progress FROM ticket_runtime_operations WHERE id=$1::uuid',[operation])).rows[0];assert.equal(final.progress.answers['q:5'],'Answer 5');assert.equal(final.context.questions.length,6);
 const menuId=`ck:ticket:menu:${panel}:main`;
 await db.query("UPDATE ticket_panels SET data=jsonb_set(data,ARRAY['legacy_publications',$2,'message','components'],$3::jsonb) WHERE id=$1::uuid",[panel,channel+':'+message,JSON.stringify([{type:1,components:[{type:2,custom_id:customId,label:'Apply',style:1}]},{type:1,components:[{type:3,custom_id:menuId,options:[{label:'Apply',value:customId}]}]}])]);
 const first=await call(current,'/v2/runtime/tickets/open/prepare',proof());assert.equal(first.outcome,'ready');assert.equal(first.form.fields.length,5);
 await db.query("UPDATE ticket_panels SET data=jsonb_set(jsonb_set(data,ARRAY[$2::text,'account_apply'],'true'::jsonb),ARRAY[$2::text,'application_questions'],((data->$2::text)->'application_questions') - 4) WHERE id=$1::uuid",[panel,customId+'_settings']);
 const missing=await call(current,'/v2/runtime/tickets/open/prepare',proof());assert.equal(missing.outcome,'link_required');const missingMenu=await call(current,'/v2/runtime/tickets/open/prepare',proof(menuId,actor,[customId]));assert.equal(missingMenu.outcome,'link_required');
 await call(current,'/v2/runtime/tickets/resume',proof(`ck:ticket:resume:${missing.preparationId}`,other),403);
 const stillMissing=await call(current,'/v2/runtime/tickets/resume',proof(`ck:ticket:resume:${missing.preparationId}`));assert.equal(stillMissing.outcome,'link_required');
 await db.query("UPDATE ticket_panels SET data=jsonb_set(data,ARRAY[$2,'th_min'],'18'::jsonb) WHERE id=$1::uuid",[panel,customId+'_settings']);
 await db.query("INSERT INTO basic_player(tag,name,townhall_level) VALUES('#PYLQ20','Fixture player',5)");
 await db.query("INSERT INTO player_links(tag,user_id,source,is_verified) VALUES('#PYLQ20',$1,'discord',true)",[actor]);
 await db.query("UPDATE ticket_panels SET data=jsonb_set(data,ARRAY[$2,'hero_min_percent'],'50'::jsonb) WHERE id=$1::uuid",[panel,customId+'_settings']);
 const ineligibleProof=proof();const ineligible=await call(current,'/v2/runtime/tickets/open/prepare',ineligibleProof);assert.equal(ineligible.outcome,'link_required');assert.match(ineligible.content,/Town Hall 18/);const replayed=await call(current,'/v2/runtime/tickets/open/prepare',ineligibleProof);assert.equal(replayed.preparationId,ineligible.preparationId);assert.equal(replayed.content,ineligible.content);
 await db.query("UPDATE basic_player SET townhall_level=18 WHERE tag='#PYLQ20'");
 await db.query("UPDATE ticket_panels SET data=jsonb_set(data,ARRAY[$2,'hero_min_percent'],'0'::jsonb) WHERE id=$1::uuid",[panel,customId+'_settings']);
 const resumed=await call(current,'/v2/runtime/tickets/resume',proof(`ck:ticket:resume:${missing.preparationId}`));assert.equal(resumed.outcome,'ready');assert.equal(resumed.form.fields.length,5);assert.equal(resumed.form.fields[0].customId,'account');
 const resumedMenu=await call(current,'/v2/runtime/tickets/resume',proof(`ck:ticket:resume:${missingMenu.preparationId}`));assert.equal(resumedMenu.outcome,'ready');
 console.log('PASS migrated settings and welcome; previous Worker multi-page operation resumed with all answers after migration; current single-form limits and inline-link resume');
} finally { for(const child of children)child.kill('SIGTERM');await new Promise(resolveClose=>provider.close(resolveClose));await db.end(); }
