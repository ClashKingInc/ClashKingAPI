import assert from 'node:assert/strict';
// Loopback Discord provider for the actual API service test. No real guilds.
import { createServer } from 'node:http';
export async function startBotCustomizationProvider(){
 const writes=[];let authCodeCalls=0,profileRetries=0;
 const control={stallProfile:false,profileRetrySeconds:0.01,failNextReset:false,failWebhookReads:false,webhookReads:0,guilds:[]};
 const profiles=new Map();
 const clans=new Map(),clanReads=[];
 const users=new Map(),userReads=[];
 const hooks=new Map(), webhookCreates=[];
 const server=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/api/oauth2/token'){
   assert.equal(req.headers.authorization,undefined,'Code exchange must not send bot or user authorization');
   let raw='';for await(const part of req)raw+=part;const form=new URLSearchParams(raw),code=form.get('code');
   if(!/^sdk-code-[01]$/.test(code??'')){res.statusCode=400;res.end('{}');return;}
   authCodeCalls++;const index=code.at(-1);res.end(JSON.stringify({access_token:'sdk-access-'+index,refresh_token:'sdk-refresh-'+index,expires_in:3600,token_type:'Bearer'}));return;
  }
  if(req.url==='/api/v10/users/@me'&&req.headers.authorization?.startsWith('Bearer sdk-access-')){
   const index=req.headers.authorization.at(-1);
   if(index==='0'&&profileRetries===0){profileRetries++;res.statusCode=429;res.setHeader('retry-after',String(control.profileRetrySeconds));res.end(JSON.stringify({retry_after:control.profileRetrySeconds,global:false}));return;}
   if(control.stallProfile&&index==='1'){res.flushHeaders();await new Promise(resolve=>setTimeout(resolve,16_000));}
   await new Promise(resolve=>setTimeout(resolve,index==='0'?15:30));
   res.end(JSON.stringify({id:'99999999999999497'+(Number(index)+1),username:'SDK User '+index,discriminator:'0',global_name:null,avatar:null}));return;
  }

  if(req.url==='/api/v10/users/@me/guilds?limit=200&with_counts=true'){assert.equal(req.headers.authorization,'Bearer local-oauth-token');res.end(JSON.stringify(control.guilds));return;}
  if(decodeURIComponent(req.url??'')==='/v1/clans/#PYLQRRJC'){
   res.end(JSON.stringify({tag:'#PYLQRRJC',name:'Unlimited clans fixture',description:'Local fixture',isWarLogPublic:true,type:'inviteOnly',clanPoints:0,warWins:0,warWinStreak:0,clanLevel:10,members:1,memberList:[{tag:'#PYLQRRJP',name:'Fixture',townHallLevel:16,trophies:5000,role:'member',donations:0,donationsReceived:0,clanRank:1,previousClanRank:1,expLevel:200}],badgeUrls:{small:'https://example.invalid/badge.png'}}));return;
  }
  const clan=/^\/v1\/clans\/(#[0289PYLQGRJCUV]+)$/.exec(decodeURIComponent(req.url??''));
  if(clan&&clans.has(clan[1])){clanReads.push(clan[1]);res.end(JSON.stringify(clans.get(clan[1])));return;}
  if(req.url==='/api/v10/users/@me'){res.end(JSON.stringify({id:'999999999999999999',username:'ClashKing'}));return;}
  const user=/^\/api\/v10\/users\/(\d+)$/.exec(req.url??'');
  if(user){userReads.push(user[1]);const value=users.get(user[1]);if(!value)res.statusCode=404;res.end(JSON.stringify(value??{message:'Unknown User'}));return;}
  const channel=/^\/api\/v10\/channels\/(99999999999999490[1234])$/.exec(req.url??'');
  if(channel){const id=channel[1];res.end(JSON.stringify({id,guild_id:id.endsWith('4')?'999999999999995903':'999999999999995901',type:id.endsWith('3')?11:0,...(id.endsWith('3')?{parent_id:'999999999999994901'}:{})}));return;}
  const webhookList=/^\/api\/v10\/channels\/(99999999999999490[124])\/webhooks$/.exec(req.url??'');
  if(webhookList){const channel=webhookList[1];if(!hooks.has(channel))hooks.set(channel,channel.endsWith('1')?[{id:'999999999999994911',type:1,guild_id:'999999999999995901',channel_id:channel,user:{id:'999999999999999999'},token:'local-only',name:'Existing log hook'}]:[]);
   if(req.method==='POST'){const h={id:'999999999999994912',type:1,guild_id:'999999999999995901',channel_id:channel,application_id:'999999999999999999',token:'local-only'};hooks.get(channel).push(h);webhookCreates.push(channel);res.end(JSON.stringify(h));return;}
   res.end(JSON.stringify(hooks.get(channel)));return;}
  if(req.url==='/api/v10/guilds/999999999999995901/roles'){
   res.end(JSON.stringify([{id:'999999999999995911',name:'Recruit alerts',color:0,position:1,managed:false,mentionable:true}]));return;
  }
  if(req.url==='/api/v10/guilds/999999999999995901/webhooks'){
   control.webhookReads++;
   if(control.failWebhookReads){res.statusCode=403;res.end(JSON.stringify({message:'Missing webhook permissions'}));return;}
   res.end(JSON.stringify([...hooks.values()].flat()));return;
  }
  if(req.url==='/api/v10/guilds/999999999999996101'){res.end(JSON.stringify({id:'999999999999996101',owner_id:'999999999999996102'}));return;}
  const match=/^\/api\/v10\/guilds\/(\d+)\/members\/@me$/.exec(req.url??'');
  if(match && req.method==='PATCH'){
   let raw='';for await(const chunk of req)raw+=chunk;
   const body=JSON.parse(raw||'{}');
   if(control.failNextReset && body.nick===null && body.avatar===null && body.banner===null && body.bio===null){control.failNextReset=false;res.statusCode=503;res.end(JSON.stringify({message:'Local reset failure'}));return;}
   const prior=profiles.get(match[1])??{nick:'Existing profile',bio:'Existing bio',avatar:'local_avatar',banner:'local_banner'};
   const value={...prior,...body};profiles.set(match[1],value);
   if(Object.keys(body).length)writes.push({serverId:match[1],body});
   res.end(JSON.stringify({...value,user:{id:'999999999999999999',username:'ClashKing'}}));return;
  }
  if(req.url==='/api/v10/oauth2/applications/@me'){
   res.end(JSON.stringify({name:'ClashKing',description:'Global profile',bot:{id:'999999999999999999',username:'ClashKing',avatar:'global_avatar',banner:'global_banner'}}));return;
  }
  res.statusCode=404;res.end(JSON.stringify({message:'Unexpected local Discord request'}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {set stallProfile(value){control.stallProfile=value},set profileRetrySeconds(value){control.profileRetrySeconds=value},get authCodeCalls(){return authCodeCalls},get profileRetries(){return profileRetries},clans,clanReads,users,userReads,set guilds(value){control.guilds=value},get webhookReads(){return control.webhookReads},set failWebhookReads(value){control.failWebhookReads=value},webhookCreates,get failNextReset(){return control.failNextReset},set failNextReset(value){control.failNextReset=value},origin:`http://127.0.0.1:${server.address().port}`,writes,close:()=>new Promise(resolve=>server.close(resolve))};
}
