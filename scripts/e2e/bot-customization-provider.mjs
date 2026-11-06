// Loopback Discord provider for the actual API service test. No real guilds.
import { createServer } from 'node:http';
export async function startBotCustomizationProvider(){
 const writes=[];
 const control={failNextReset:false,guilds:[]};
 const profiles=new Map();
 const hooks=new Map(), webhookCreates=[];
 const server=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/api/v10/users/@me/guilds?limit=200&with_counts=true'){res.end(JSON.stringify(control.guilds));return;}
  if(req.url==='/api/v10/users/@me'){res.end(JSON.stringify({id:'999999999999999999',username:'ClashKing'}));return;}
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
 return {set guilds(value){control.guilds=value},webhookCreates,get failNextReset(){return control.failNextReset},set failNextReset(value){control.failNextReset=value},origin:`http://127.0.0.1:${server.address().port}`,writes,close:()=>new Promise(resolve=>server.close(resolve))};
}
