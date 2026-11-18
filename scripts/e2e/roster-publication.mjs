// Real API Worker, auth and SQL; Discord writes are captured by a loopback provider.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';
assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1');
const dsn=new URL(process.env.TEST_DATABASE_URL);
assert.equal(dsn.hostname,'127.0.0.1');assert.equal(dsn.pathname,'/clashking_test');
const db=new pg.Client({connectionString:dsn.href});await db.connect();
const app='999999999999993101',server='999999999999993102',channel='999999999999993103',hookId='999999999999993104',message='999999999999993105';
const roster=randomUUID(),writes=[];
const keys=Object.fromEntries(['DATA_ENCRYPTION_KEY','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','API_BOT_TOKEN','AI_USAGE_SECRET','STRIPE_WEBHOOK_SECRET'].map(k=>[k,randomBytes(32).toString('base64url')]));
const hook={id:hookId,token:'local-fixture-only',application_id:app,guild_id:server,channel_id:channel,type:1,name:'ClashKing Rosters'};
let child,logs='';
const provider=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');let raw='';for await(const chunk of req)raw+=chunk;
 res.setHeader('content-type','application/json');
 const send=body=>res.end(JSON.stringify(body));
 if(req.method==='GET'&&u.pathname==='/api/v10/channels/'+channel)return send({id:channel,guild_id:server,type:0});
 if(req.method==='GET'&&u.pathname==='/api/v10/users/@me')return send({id:app,username:'Roster Fixture'});
 if(req.method==='GET'&&u.pathname==='/api/v10/guilds/'+server+'/members/'+app)return send({nick:'Roster Fixture',roles:[]});
 if(req.method==='GET'&&u.pathname==='/api/v10/channels/'+channel+'/webhooks')return send([hook]);
 if(req.method==='GET'&&u.pathname==='/api/v10/webhooks/'+hookId)return send(hook);
 if(req.method==='GET'&&u.pathname==='/api/v10/applications/'+app+'/emojis')return send({items:[{id:'999999999999993118',name:'th18'}]});
 if(['POST','PATCH'].includes(req.method)&&u.pathname.startsWith('/api/v10/webhooks/'+hookId+'/')){writes.push({method:req.method,body:JSON.parse(raw)});return send({id:message});}
 res.statusCode=500;send({message:'Unexpected fixture path '+req.method+' '+u.pathname});
});
await new Promise(r=>provider.listen(0,'127.0.0.1',r));
const port=8847,origin='http://127.0.0.1:'+port;
try{
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Roster display fixture')",[server]);
 await db.query("INSERT INTO rosters(id,server_id,alias,roster_type,signup_scope,description) VALUES($1,$2,'[GC] Fixture','family','family-only','[GC] Signup')",[roster,server]);
 await db.query('INSERT INTO roster_members(roster_id,tag,name,townhall) VALUES($1,$2,$3,19)',[roster,'#2PP','[GC] Valentine']);
 child=spawn(process.execPath,['scripts/start-local-rewrite-api.mjs'],{env:{...process.env,CLASHKING_LOCAL_API_PORT:String(port),CLASHKING_LOCAL_DISCORD_CLIENT_ID:app,CLASHKING_LOCAL_DISCORD_CLIENT_SECRET:'local-only',CLASHKING_LOCAL_DISCORD_BOT_TOKEN:'local-only',CLASHKING_LOCAL_ARCHIVE_BRIDGE:'0',CLASHKING_LOCAL_PRODUCTION_READS:'0',CLASHKING_LOCAL_DISCORD_TEST_ORIGIN:'http://127.0.0.1:'+provider.address().port,CLASHKING_LOCAL_CLASH_PROXY_ORIGIN:'http://127.0.0.1:'+provider.address().port,...Object.fromEntries(Object.entries(keys).map(([k,v])=>['CLASHKING_E2E_'+k,v]))},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 let ready=false;for(let i=0;i<160;i++){try{ready=(await fetch(origin+'/v2/health')).ok&&logs.includes('isolated_api_ready');}catch{}if(ready)break;assert.equal(child.exitCode,null,logs.slice(-2000));await new Promise(r=>setTimeout(r,250));}assert(ready,logs.slice(-2000));
 const post=async(path,body)=>{const response=await fetch(origin+path,{method:'POST',headers:{authorization:'Bearer '+keys.API_BOT_TOKEN,'content-type':'application/json'},body:JSON.stringify(body)});const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;};
 const base='/v2/server/'+server+'/rosters/'+roster;
 await post(base+'/post',{channelId:channel,mode:'signup',nonce:'roster-display-regression',dashboardUrl:'http://localhost:3002/dashboard/rosters/detail?guildId='+server+'&rosterId='+roster,joinLabel:'Join',leaveLabel:'Leave',viewLabel:'Dashboard'});
 assert.equal(writes.filter(w=>w.method==='POST').length,1);
 const first=writes.find(w=>w.method==='POST').body;
 assert.ok(first.embeds[0].description.includes('\\[GC\\] Valentine'));
 assert.ok(first.embeds[0].description.includes('\\[GC\\] Signup'));
 assert.deepEqual(first.allowed_mentions,{parse:[]});
 await db.query('UPDATE roster_members SET name=$2 WHERE roster_id=$1',[roster,'[GC] Valentine [alt]']);
 const previousWrites=writes.length;
 await post(base+'/refresh-publication',{});
 assert.ok(writes.length>previousWrites);assert.equal(writes.at(-1).method,'PATCH');
 assert.ok(writes.at(-1).body.embeds[0].description.includes('\\[GC\\] Valentine \\[alt\\]'));
 assert.deepEqual(writes.at(-1).body.allowed_mentions,{parse:[]});
 assert.ok(writes.every(w=>w.body.embeds[0].description.length<=4096));
 console.log('PASS actual API roster publication and refresh: preserved bracketed names/descriptions and no mentions; external Discord writes: 0');
}catch(error){console.error(logs.slice(-2500));throw error;}
finally{
 child?.kill('SIGTERM');provider.closeAllConnections();await new Promise(r=>provider.close(r));
 await db.query('DELETE FROM servers WHERE id=$1',[server]);await db.end();
}
