// Real Worker HTTP, production Durable Objects and disposable SQL. The cached
// SQL binding is deliberately unavailable so the operational path must be fresh.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';
import pg from 'pg';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1');
const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/clashking_test');
const db=new pg.Client({connectionString:url.href});await db.connect();
const guild='922222222222228901',actor='922222222222228902',app='922222222222228903',originChannel='922222222222228904',originMessage='922222222222228905',staffRole='922222222222228906',addedRole='922222222222228907';
let id=922222222222230000n;const next=()=>String(id++);
const {privateKey,publicKey}=generateKeyPairSync('ed25519');const token='ticket-opening-e2e'.padEnd(43,'x');
const channels=new Map([[originChannel,{id:originChannel,guild_id:guild,type:0,parent_id:null}]]),messages=new Map(),pins=[],created=[];
let releasePin, pinWaiting=false, allowRoles=false;
const provider=createServer(async(req,res)=>{try{
 let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};const path=new URL(req.url,'http://local').pathname.replace(/^\/api\/v10/, '');
 const reply=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(status===204?undefined:JSON.stringify(value));};
 if(path==='/users/@me')return reply(200,{id:app});
 if(path===`/guilds/${guild}`)return reply(200,{id:guild,owner_id:'922222222222228999'});
 if(path===`/guilds/${guild}/channels`&&req.method==='POST'){const channel={...body,id:next(),guild_id:guild,mode:body.name.split('-')[0]};channels.set(channel.id,channel);created.push(channel);return reply(200,channel);}
 if(path===`/guilds/${guild}/channels`)return reply(200,[...channels.values()]);
 let match=/^\/channels\/(\d+)$/.exec(path);if(match)return reply(200,channels.get(match[1]));
 match=/^\/channels\/(\d+)\/threads$/.exec(path);if(match&&req.method==='POST'){const channel={...body,id:next(),guild_id:guild,mode:channels.get(match[1]).mode};channels.set(channel.id,channel);return reply(200,channel);}
 match=/^\/channels\/(\d+)\/messages$/.exec(path);if(match&&req.method==='POST'){const message={...body,id:next(),channel_id:match[1],author:{id:app}};messages.set(message.id,message);return reply(200,message);}
 if(match)return reply(200,[...messages.values()].filter(m=>m.channel_id===match[1]));
 match=/^\/channels\/(\d+)\/messages\/pins\/(\d+)$/.exec(path);if(match){pins.push({channel:match[1],message:match[2]});if(channels.get(match[1]).mode==='normal'&&!pinWaiting){pinWaiting=true;await new Promise(resolve=>releasePin=resolve);}return reply(channels.get(match[1]).mode==='denied'?403:204,{message:'Missing permissions'});}
 if(path.includes('/pins/'))return reply(400,{message:'Use the current pin endpoint'});
 if(path.includes('/roles/'))return reply(allowRoles?204:403,{message:'Missing permissions'});
 return reply(404,{message:'Unexpected local provider route'});
}catch{res.writeHead(500);res.end('{}');}});
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
const port=8862,base=`http://127.0.0.1:${port}`;let logs='';
const child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{stdio:['ignore','pipe','pipe'],env:{...process.env,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_E2E_UNAVAILABLE_CACHED_DATABASE:'1',CLASHKING_LOCAL_ADMIN_IDENTITY:'0',CLASHKING_E2E_API_BOT_TOKEN:token,CLASHKING_LOCAL_DISCORD_CLIENT_ID:app,CLASHKING_LOCAL_DISCORD_APPLICATION_ID:app,CLASHKING_LOCAL_DISCORD_PUBLIC_KEY:publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex'),CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'fixture',CLASHKING_LOCAL_DISCORD_BOT_TOKEN:'fixture-only',CLASHKING_LOCAL_DISCORD_TEST_ORIGIN:`http://127.0.0.1:${provider.address().port}`,CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_LOCAL_FCM_CREDENTIALS_FILE:''}});
child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
const proof=(data,{type=3,channel=originChannel,message=originMessage,roles=[]}={})=>{const rawBody=JSON.stringify({id:next(),application_id:app,type,guild_id:guild,channel_id:channel,member:{user:{id:actor,username:'Fixture'},roles,permissions:'0'},...(type===3?{message:{id:message,author:{id:app}}}:{}),data});const timestamp=String(Math.floor(Date.now()/1000));return {interaction:{rawBody,timestamp,signature:sign(null,Buffer.from(timestamp+rawBody),privateKey).toString('hex')}};};
const call=async(path,payload,status=200)=>{const r=await fetch(base+path,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;};
try{
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error(logs.slice(-3000));try{if((await fetch(base+'/v2/health')).ok&&logs.includes('isolated_api_ready'))break;}catch{}await new Promise(r=>setTimeout(r,250));}
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Opening lifecycle')",[guild]);
 for(const mode of ['normal','denied','role']){
  const panel=randomUUID(),button=randomUUID(),customId=`ck:ticket:open:${panel}:${button}`;
  const settings={mod_role:[staffRole],no_ping_mod_role:[],private_thread:mode==='normal',th_min:0,hero_min_percent:0,naming:mode+'-{user}',account_apply:false,roles_to_add:mode==='role'?[addedRole]:[],roles_to_remove:[],application_questions:[{id:'why',label:'Why?',type:'text',required:true,options:[],order:0}],opening_message:{content:'Welcome'}};
  await db.query('INSERT INTO ticket_panels(id,server_id,name,components,data) VALUES($1,$2,$3,$4,$5)',[panel,guild,mode,JSON.stringify([{id:button,type:2,custom_id:customId,label:'Apply',style:1}]),JSON.stringify({[customId+'_settings']:settings,legacy_publications:{[originChannel+':'+originMessage]:{message:{components:[{type:1,components:[{type:2,custom_id:customId,label:'Apply',style:1}]}]}}}})]);
  const prepared=await call('/v2/runtime/tickets/open/prepare',proof({custom_id:customId,component_type:2}));
  const answer=proof({custom_id:prepared.form.customId,components:[{type:1,components:[{type:4,custom_id:'q:0',value:'Hello'}]}]},{type:5});
  await call(`/v2/runtime/ticket-operations/${prepared.operationId}/advance`,answer);
  const statusProof=channel=>proof({name:'ticket',options:[{name:'status',type:1,options:[{name:'status',type:3,value:'close'}]}]},{type:2,channel,roles:[staffRole]});
  if(mode==='normal'){
    for(let i=0;i<100&&!releasePin;i++)await new Promise(r=>setTimeout(r,25));assert(releasePin);
    const opening=(await db.query('SELECT channel_id FROM tickets WHERE id=$1',[prepared.ticketId])).rows[0];assert(opening,'Register before pin completion');
    const pending=await call('/v2/runtime/tickets/actions',statusProof(opening.channel_id),409);assert.equal(pending.message,'Ticket is still being set up');releasePin();
  }
  let op;for(let i=0;i<180;i++){op=(await db.query('SELECT state,result FROM ticket_runtime_operations WHERE id=$1',[prepared.operationId])).rows[0];if(['completed','failed'].includes(op.state))break;await new Promise(r=>setTimeout(r,250));}
  assert.equal(op.state,mode==='role'?'failed':'completed',JSON.stringify({mode,op,log:logs.slice(-2000)}));
  const ticket=(await db.query('SELECT id,channel_id,thread_id FROM tickets WHERE id=$1',[prepared.ticketId])).rows[0];assert(ticket,'The created ticket must remain registered');
  if(mode==='role')assert.equal(op.result.channelId,ticket.channel_id);
  assert.equal(created.filter(c=>c.mode===mode).length,1);assert(pins.some(p=>p.channel===ticket.channel_id));
  if(mode==='normal')assert(ticket.thread_id,'Private staff thread attached to existing ticket');
  if(mode==='denied')assert.equal((await db.query("SELECT result->>'skipped' AS skipped FROM ticket_runtime_effects WHERE operation_id=$1 AND effect_key='pin-application'",[prepared.operationId])).rows[0].skipped,'true');
  await call('/v2/runtime/tickets/actions',proof({name:'ticket',options:[{name:'status',type:1,options:[{name:'status',type:3,value:'close'}]}]},{type:2,channel:ticket.channel_id}),403);
  const close=await call('/v2/runtime/tickets/actions',proof({name:'ticket',options:[{name:'status',type:1,options:[{name:'status',type:3,value:'close'}]}]},{type:2,channel:ticket.channel_id,roles:[staffRole]}));assert.equal(close.outcome,'ready');
  await call(`/v2/runtime/ticket-operations/${prepared.operationId}/advance`,answer);assert.equal(created.filter(c=>c.mode===mode).length,1);
  assert(created.find(c=>c.id===ticket.channel_id).permission_overwrites.some(p=>p.id===staffRole&&(BigInt(p.allow)&(1n<<51n))!==0n));
  if(mode==='role'){
    // Reproduce an older operation with durable messages but no ticket row.
    const sent=messages.size;allowRoles=true;
    await db.query('DELETE FROM tickets WHERE id=$1',[prepared.ticketId]);
    await db.query("UPDATE ticket_runtime_effects SET state='pending',last_error=NULL,next_attempt_at=now() WHERE operation_id=$1 AND state='failed'",[prepared.operationId]);
    await db.query("UPDATE ticket_runtime_operations SET state='submitted',result='{}'::jsonb WHERE id=$1",[prepared.operationId]);
    await call(`/v2/runtime/ticket-operations/${prepared.operationId}/advance`,answer);
    for(let i=0;i<120;i++){if((await db.query('SELECT state FROM ticket_runtime_operations WHERE id=$1',[prepared.operationId])).rows[0].state==='completed')break;await new Promise(r=>setTimeout(r,250));}
    assert.equal((await db.query('SELECT state FROM ticket_runtime_operations WHERE id=$1',[prepared.operationId])).rows[0].state,'completed');
    assert((await db.query('SELECT 1 FROM tickets WHERE id=$1',[prepared.ticketId])).rowCount);assert.equal(created.filter(c=>c.mode===mode).length,1);assert.equal(messages.size,sent,'Recovery must not resend successful messages');
  }

 }
 await call('/v2/runtime/tickets/actions',proof({name:'ticket',options:[{name:'status',type:1,options:[{name:'status',type:3,value:'close'}]}]},{type:2}),404);
 console.log('PASS actual ticket open → messages → pin/thread → registration → staff status; denied pin and failed role retain usable tickets; retries do not duplicate channels; cached DB binding unused');
}finally{child.kill('SIGTERM');await new Promise(r=>provider.close(r));await db.end();}
