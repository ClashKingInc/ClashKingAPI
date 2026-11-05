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
// CCN is a public source for the native esports integration. Keep local
// transport limited to the same credential-free operations as the API adapter.
export function allowedCompetitiveRead(request){
 const url=new URL(request.url);
 if(request.method!=='GET'||url.origin!=='https://api.competitiveclash.network'||url.username||url.password)return false;
 const queryByPath=new Map([
  ['/worlds/events',[]],['/worlds/leaderboard',['segment_id']],
  ['/players/basicinfo',['player']],['/clans/info',['clan']],['/clans/matches',['clantag']],
  ['/teams/elo/ranking',['timestamp','limit','offset']],
  ['/teams/basicinfo',['team_id']],['/teams/matches',['team_id','limit','after','before']],['/teams/upcoming_matches',['team_id','limit','after','before','include_streams']],['/teams/search',['search_str']],
 ]);
 const keys=queryByPath.get(url.pathname)??(/^\/worlds\/events\/\d+\/(divisions|segments)$/u.test(url.pathname)||/^\/worlds\/events\/segments\/\d+\/(teams|standings|records)$/u.test(url.pathname)?[]:undefined);
 return keys!==undefined&&[...url.searchParams.keys()].every(key=>keys.includes(key));
}
