const productionOrigins=new Set(['https://api.clashk.ing','https://v2-api.clashk.ing','https://dash.clashk.ing','https://staging-api.clashk.ing']);
export function workspaceOrigin(value){
 const url=new URL(value);
 if(url.origin!==value||url.username||url.password||!['http:','https:'].includes(url.protocol)||productionOrigins.has(value))throw Error('Expected an isolated development origin');
 if(url.protocol==='http:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Non-loopback development origins require HTTPS');
 return value;
}
export function allowedProductionRead(request){
 const url=new URL(request.url);
 return ['GET','HEAD'].includes(request.method)&&url.protocol==='https:'&&['wars.clashk.ing','assets.clashk.ing','badges.clashk.ing'].includes(url.hostname)&&!url.username&&!url.password;
}
