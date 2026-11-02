// Loopback Discord provider for the actual API service test. No real guilds.
import { createServer } from 'node:http';
export async function startBotCustomizationProvider(){
 const writes=[];
 const control={failNextReset:false};
 const profiles=new Map();
 const server=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
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
 return {get failNextReset(){return control.failNextReset},set failNextReset(value){control.failNextReset=value},origin:`http://127.0.0.1:${server.address().port}`,writes,close:()=>new Promise(resolve=>server.close(resolve))};
}
