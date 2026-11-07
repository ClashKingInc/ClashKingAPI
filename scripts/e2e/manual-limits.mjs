import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SignJWT} from 'jose';
export async function verifyManualLimits({db,origin,adminOrigin,signingKey,meteringKey,profileProvider}){
 assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1');
 const server='999999999999995901',actor='999999999999995902';
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Manual limits fixture')",[server]);
 await db.query("INSERT INTO auth_users(user_id,provider) VALUES($1,'discord')",[actor]);
 const token=await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject(actor).setAudience('clashking-native').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signingKey));
 const request=async(base,path,method='GET',body,headers={},expected=200)=>{
 const r=await fetch(base+path,{method,headers:{origin:'http://localhost:3000','x-requested-with':'XMLHttpRequest',...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();assert.equal(r.status,expected,`${method} ${path}: ${text}`);return text?JSON.parse(text):null;};
 await request(origin,'/v2/admin/server-limits?search='+server,'GET',undefined,{},401);
 let row=(await request(adminOrigin,'/v2/admin/server-limits?search='+server))[0];
 assert.equal(row.clanLimit,10);assert.equal(row.autoboardLimit,5);assert.equal(row.aiMonthlyLimitUsd,.10);assert.equal(row.botCustomizationEnabled,false);
 await request(origin,'/v2/admin/server-limits/'+server,'PATCH',{clanLimit:90,autoboardLimit:90,aiMonthlyLimitUsd:9},{authorization:'Bearer '+token},401);
 const generation=(await db.query('SELECT generation FROM discord_cache.gateway_shards WHERE application_id=$1 AND shard_id=0',['999999999999999999'])).rows[0].generation;
 await db.query('INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete) VALUES($1,$2,$3,0,$4,true,true,true)',[server,{owner_id:actor},'999999999999999999',generation]);
 const userHeaders={authorization:'Bearer '+token};
 await request(origin,'/v2/server/'+server+'/limits','GET',undefined,userHeaders);
 // Actual API requests: reminders share a preexisting log hook, including threads.
 const reminderBody={type:'War',clan_tag:'#PYLQ',channel_id:'999999999999994901',time:'60 min'};
 const first=await request(origin,'/v2/server/'+server+'/reminders','POST',reminderBody,userHeaders);
 const second=await request(origin,'/v2/server/'+server+'/reminders','POST',{...reminderBody,time:'120 min',thread_id:'999999999999994903'},userHeaders);
 let stored=(await db.query('SELECT webhook_id,webhook_token FROM reminders WHERE id=ANY($1::uuid[])',[[first.reminder_id,second.reminder_id]])).rows;
 assert(stored.every(x=>x.webhook_id==='999999999999994911'&&x.webhook_token===''));
 assert.equal(profileProvider.webhookCreates.length,0,'Reuse existing log webhook without creating another');
 await Promise.all([180,240].map(time=>request(origin,'/v2/server/'+server+'/reminders','POST',{...reminderBody,time:time+' min',channel_id:'999999999999994902'},userHeaders)));
 assert.equal(profileProvider.webhookCreates.length,1,'Concurrent reminder creation shares one channel webhook');
 await request(origin,'/v2/server/'+server+'/reminders/'+first.reminder_id,'PUT',{channel_id:'999999999999994902'},userHeaders);
 assert.equal((await db.query('SELECT webhook_id FROM reminders WHERE id=$1',[first.reminder_id])).rows[0].webhook_id,'999999999999994912');
 await request(origin,'/v2/server/'+server+'/reminders','POST',{...reminderBody,time:'300 min',channel_id:'999999999999994904'},userHeaders,400);
 assert.equal(profileProvider.webhookCreates.length,1,'Cross-server destination cannot create webhooks');
 console.log('PASS reminder API: reuses log hooks, shares one hook across concurrent reminders, retains threads, changes destination, rejects cross-server channel');
 const redditPath='/v2/server/'+server+'/logs';
 const redditBody={channel_id:'999999999999994901',thread_id:'999999999999994903',log_types:['reddit_user_feed'],reddit_role_id:'999999999999995911',reddit_accounts:['Recruiter','Second'],reddit_include_comments:true};
 await request(origin,redditPath,'PUT',redditBody,userHeaders);
 let reddit=(await request(origin,redditPath,'GET',undefined,userHeaders)).logs.find(row=>row.type==='reddit_user_feed');
 assert.deepEqual(reddit.reddit_accounts,['Recruiter','Second']);assert.equal(reddit.reddit_include_comments,true);
 await request(origin,redditPath,'PUT',{...redditBody,reddit_include_comments:false},userHeaders);
 reddit=(await request(origin,redditPath,'GET',undefined,userHeaders)).logs.find(row=>row.type==='reddit_user_feed');assert.equal(reddit.reddit_include_comments,false);
 for(const names of [[],['one','two','three'],['Recruiter','recruiter']])await request(origin,redditPath,'PUT',{...redditBody,reddit_accounts:names},userHeaders,400);
 await request(origin,redditPath,'PUT',{...redditBody,reddit_role_id:'999999999999995912'},userHeaders,400);
 const recruitment={channel_id:redditBody.channel_id,log_types:['reddit_feed'],reddit_min_townhall:16};
 await request(origin,redditPath,'PUT',recruitment,userHeaders);
 await request(origin,redditPath,'PUT',{...recruitment,reddit_min_townhall:99},userHeaders,400);
 await request(origin,redditPath,'PUT',{channel_id:redditBody.channel_id,log_types:['reddit_feed']},userHeaders);
 reddit=(await request(origin,redditPath,'GET',undefined,userHeaders)).logs.find(row=>row.type==='reddit_feed');assert.equal(reddit.reddit_min_townhall,16);
 await request(origin,redditPath,'PUT',{...recruitment,reddit_min_townhall:null},userHeaders);
 reddit=(await request(origin,redditPath,'GET',undefined,userHeaders)).logs.find(row=>row.type==='reddit_feed');assert.equal(reddit.reddit_min_townhall,null);
 console.log('PASS Reddit API: two independent feeds, two usernames, comment toggle, minimum persistence and clearing, invalid names/levels rejected');
 // Exercise the real HTTP/authorization/SQL path with Discord unavailable.
 // State writes must not need destination enrichment or lose the saved hook.
 const beforeToggle=(await db.query('SELECT webhook_id,thread_id FROM server_logs WHERE server_id=$1 AND type=$2',[server,'reddit_feed'])).rows[0];
 const webhookReads=profileProvider.webhookReads;
 profileProvider.failWebhookReads=true;
 try {
  for(const disabled of [true,false]){
   const result=await request(origin,redditPath,'PATCH',{log_types:['reddit_feed'],disabled},userHeaders);
   assert.equal(result.logs[0].disabled,disabled);
   assert.equal(result.logs[0].channel_id,undefined);
   const stored=(await db.query('SELECT webhook_id,thread_id,disabled FROM server_logs WHERE server_id=$1 AND type=$2',[server,'reddit_feed'])).rows[0];
   assert.deepEqual(stored,{...beforeToggle,disabled});
  }
  assert.equal(profileProvider.webhookReads,webhookReads,'State writes must not request Discord webhooks');
 } finally {profileProvider.failWebhookReads=false;}
 console.log('PASS log state: actual authorized HTTP/SQL disable and enable without Discord webhook access; destination retained');


 await request(adminOrigin,'/v2/admin/server-limits/'+server,'PATCH',{clanLimit:0,autoboardLimit:0,aiMonthlyLimitUsd:.05});
 await request(origin,'/v2/server/'+server+'/clans','POST',{tag:'#PYLQRRJC'},userHeaders,409);
 await request(origin,'/v2/server/'+server+'/autoboards','POST',{boardType:'donations',targetScope:'family',targets:[],deliveryMode:'refresh',channelId:'999999999999995999',enabled:true},userHeaders,400);
 await request(adminOrigin,'/v2/admin/server-limits/'+server,'PATCH',{clanLimit:10,autoboardLimit:5,aiMonthlyLimitUsd:.05});
 // An ordinary settings manager cannot grant customization to their server.
 await request(origin,'/v2/admin/server-limits/'+server,'PATCH',{clanLimit:10,autoboardLimit:5,aiMonthlyLimitUsd:.05,botCustomizationEnabled:true},userHeaders,401);
 const startWrites=profileProvider.writes.length;
 for(const body of [{name:'Denied name'},{bio:'Denied bio'},{avatar:'invalid-image'},{banner:'invalid-image'},{clear_name:true},{clear_avatar:true},{clear_banner:true},{clear_bio:true}])
  await request(origin,'/v2/server/'+server+'/bot-profile','PATCH',body,userHeaders,403);
 assert.equal(profileProvider.writes.length,startWrites,'Denied changes must never reach Discord');
 const existing=await request(origin,'/v2/server/'+server+'/bot-profile','GET',undefined,userHeaders);
 assert.equal(existing.name,'Existing profile','Read-only display remains available without a grant');
 await request(adminOrigin,'/v2/admin/server-limits/'+server,'PATCH',{clanLimit:10,autoboardLimit:5,aiMonthlyLimitUsd:.05,botCustomizationEnabled:true});
 row=(await request(adminOrigin,'/v2/admin/server-limits?search='+server))[0];assert.equal(row.botCustomizationEnabled,true);
 const changed=await request(origin,'/v2/server/'+server+'/bot-profile','PATCH',{name:'Granted name',bio:'Granted bio'},userHeaders);
 assert.equal(changed.name,'Granted name');assert.equal(changed.bio,'Granted bio');
 assert.equal(profileProvider.writes.length,startWrites+1);
 // Updating unrelated limits must not silently remove a granted permission.
 await request(adminOrigin,'/v2/admin/server-limits/'+server,'PATCH',{clanLimit:11,autoboardLimit:5,aiMonthlyLimitUsd:.05});
 assert.equal((await request(origin,'/v2/server/'+server+'/limits','GET',undefined,userHeaders)).botCustomizationEnabled,true);
 const otherServer='999999999999995903';
 await db.query("INSERT INTO servers(id,name) VALUES($1,'Other customization fixture')",[otherServer]);
 await db.query('INSERT INTO discord_cache.guilds(id,data,application_id,shard_id,generation,available,metadata_complete,members_complete) VALUES($1,$2,$3,0,$4,true,true,true)',[otherServer,{owner_id:actor},'999999999999999999',generation]);
 await request(origin,'/v2/server/'+otherServer+'/bot-profile','PATCH',{name:'Not granted'},userHeaders,403);
 // A grant does not replace the session's normal write-permission ceiling.
 const viewerGrant=(await db.query("INSERT INTO dashboard_access_grants(token_hash,user_id,server_id,source,permissions) VALUES($1,$2,$3,'bot',$4) RETURNING id",[randomUUID(),actor,server,{manager:false,sections:{settings:'view'}}])).rows[0].id;
 const viewerSession=(await db.query("INSERT INTO dashboard_scoped_sessions(grant_id,user_id,server_id,permissions,refresh_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 hour') RETURNING id",[viewerGrant,actor,server,{manager:false,sections:{settings:'view'}},randomUUID()])).rows[0].id;
 const viewerToken=await new SignJWT({dashboard_session:viewerSession}).setProtectedHeader({alg:'HS256'}).setSubject(actor).setAudience('clashking-server-dashboard').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(signingKey));
 await request(origin,'/v2/server/'+server+'/bot-profile','PATCH',{name:'Read-only session'}, {authorization:'Bearer '+viewerToken},403);
 await request(adminOrigin,'/v2/admin/server-limits/'+server,'PATCH',{clanLimit:10,autoboardLimit:5,aiMonthlyLimitUsd:.05,botCustomizationEnabled:false});
 await request(origin,'/v2/server/'+server+'/bot-profile','PATCH',{name:'Revoked name'},userHeaders,403);
 assert.equal(profileProvider.writes.length,startWrites+1,'Revocation and read-only sessions must not cause Discord writes');
 assert.equal((await request(origin,'/v2/server/'+server+'/bot-profile','GET',undefined,userHeaders)).name,'Granted name','Revocation retains the existing profile');
 // Reset is a separate, privileged action, including after access revocation.
 await request(origin,'/v2/admin/server-limits/'+server+'/reset-bot-profile','POST',undefined,userHeaders,401);
 assert.equal(profileProvider.writes.length,startWrites+1);
 await request(adminOrigin,'/v2/admin/server-limits/'+server+'/reset-bot-profile','POST');
 const reset=await request(origin,'/v2/server/'+server+'/bot-profile','GET',undefined,userHeaders);
 assert.equal(reset.name,'ClashKing');assert.equal(reset.bio,'Global profile');
 assert.equal(reset.name_inherited,true);assert.equal(reset.avatar_inherited,true);assert.equal(reset.banner_inherited,true);assert.equal(reset.bio_inherited,true);
 assert.deepEqual(profileProvider.writes.at(-1).body,{nick:null,avatar:null,banner:null,bio:null});
 assert.equal((await request(origin,'/v2/server/'+server+'/limits','GET',undefined,userHeaders)).botCustomizationEnabled,false,'Reset must not enable customization');
 const priorResetCount=profileProvider.writes.length;
 profileProvider.failNextReset=true;
 await request(adminOrigin,'/v2/admin/server-limits/'+server+'/reset-bot-profile','POST',undefined,{},503);
 assert.equal(profileProvider.writes.length,priorResetCount,'A failed provider reset must not be reported as successful');
 assert.equal((await db.query("SELECT count(*)::int AS n FROM admin_audit_events WHERE resource_id=$1 AND action='bot_profile.reset'",[server])).rows[0].n,1);
 console.log('PASS Admin reset: clears all overrides, global inheritance restored, works after revoke, preserves grant, denies non-Admin, provider failure stays a failure');
 console.log('PASS bot customization grant: default denial, all fields/reset actions, Admin-only grant/revoke, retained profile, per-server isolation, normal settings permissions; loopback Discord only');
 const metering={'x-clashking-ai-metering':meteringKey};
 const ids=[randomUUID(),randomUUID(),randomUUID()];for(const id of ids)await db.query("INSERT INTO roster_ai_usage(id,server_id,discord_user_id,operation,provider,model) VALUES($1,$2,$3,'fixture','openai','gpt-6-luna')",[id,server,actor]);
 const reservation=id=>({requestId:id,step:0,inputTokenLimit:100000,outputTokenLimit:64000});
 await request(origin,'/v2/runtime/roster-ai/reserve','POST',reservation(ids[0]),{},401);
 const responses=await Promise.all(ids.slice(0,2).map(id=>fetch(origin+'/v2/runtime/roster-ai/reserve',{method:'POST',headers:{...metering,'content-type':'application/json'},body:JSON.stringify(reservation(id))})));
 assert.deepEqual(responses.map(r=>r.status),[200,200],'Calls do not reserve allowance');
 const winner=ids[0];
 await request(origin,'/v2/runtime/roster-ai/reserve','POST',reservation(winner),metering);
 const actual={requestId:winner,step:0,inputTokens:100000,outputTokens:10000,reasoningTokens:300};
 await request(origin,'/v2/runtime/roster-ai/settle','POST',actual,metering);
 await request(origin,'/v2/runtime/roster-ai/settle','POST',actual,metering);
 row=(await request(adminOrigin,'/v2/admin/server-limits?search='+server))[0];assert.equal(row.aiSpentUsd,.015);assert.equal(row.aiReservedUsd,0);
 assert.equal(Number((await db.query('SELECT reasoning_tokens FROM roster_ai_usage WHERE id=$1',[winner])).rows[0].reasoning_tokens),300);
 await request(adminOrigin,'/v2/admin/server-limits/'+server,'PATCH',{clanLimit:20,autoboardLimit:15,aiMonthlyLimitUsd:.01});
 // A prompt already admitted may exceed the cap, even after an admin lowers it.
 await request(origin,'/v2/runtime/roster-ai/reserve','POST',{requestId:ids[1],step:1,inputTokenLimit:1000,outputTokenLimit:1000},metering);
 await request(origin,'/v2/runtime/roster-ai/settle','POST',{requestId:ids[1],step:1,inputTokens:0,outputTokens:0,outcome:'unknown',failureCode:'provider_stream_interrupted'},metering);
 assert.equal((await db.query('SELECT outcome,settled_at,actual_usd FROM roster_ai_step_budgets WHERE usage_id=$1 AND step=1',[ids[1]])).rows[0].actual_usd,null);
 row=(await request(adminOrigin,'/v2/admin/server-limits?search='+server))[0];assert.equal(row.aiReservedUsd,0);assert.equal(row.aiSpentUsd,.015);
 // A late receipt repairs unknown status; a late error never erases that receipt.
 await request(origin,'/v2/runtime/roster-ai/settle','POST',{requestId:ids[1],step:1,inputTokens:2000,outputTokens:2000},metering);
 await request(origin,'/v2/runtime/roster-ai/settle','POST',{requestId:ids[1],step:1,inputTokens:0,outputTokens:0,outcome:'unknown'},metering);
 assert.equal((await db.query('SELECT outcome FROM roster_ai_step_budgets WHERE usage_id=$1 AND step=1',[ids[1]])).rows[0].outcome,'completed');
 await request(adminOrigin,'/v2/admin/server-limits/'+server,'PATCH',{clanLimit:20,autoboardLimit:15,aiMonthlyLimitUsd:.20});
 const longId=randomUUID();await db.query("INSERT INTO roster_ai_usage(id,server_id,discord_user_id,operation,provider,model) VALUES($1,$2,$3,'fixture','openai','gpt-6-luna')",[longId,server,actor]);
 await request(origin,'/v2/runtime/roster-ai/reserve','POST',{requestId:longId,step:0,inputTokenLimit:300000,outputTokenLimit:64000},metering);
 await request(origin,'/v2/runtime/roster-ai/settle','POST',{requestId:longId,step:0,inputTokens:300000,cacheWriteTokens:300000,outputTokens:10000},metering);
 assert.equal(Number((await db.query('SELECT total_cost_usd FROM roster_ai_usage WHERE id=$1',[longId])).rows[0].total_cost_usd),.0825,'Long-context cache-write pricing retained');
 assert((await db.query("SELECT count(*)::int AS n FROM admin_audit_events WHERE resource_id=$1 AND action='server_limits.update'",[server])).rows[0].n>=2);
 await request(origin,'/v2/billing/subscription','GET',undefined,{authorization:'Bearer '+token},410);
 console.log('PASS manual limits: real Access JWT admin boundary, audited edits, defaults 10/5/$0.05, no reservations, duplicate settlement, unknown call recovery, reasoning usage, raised/lowered limits, billing retired');
}
