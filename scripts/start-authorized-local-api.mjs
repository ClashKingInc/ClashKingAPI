import {execFileSync,spawn} from 'node:child_process'
// Load only the previously authorized Discord credentials, in memory.
const template='{{range .Config.Env}}{{$key := index (split . "=") 0}}{{if or (eq $key "DISCORD_CLIENT_ID") (eq $key "DISCORD_CLIENT_SECRET") (eq $key "DISCORD_BOT_TOKEN")}}{{println .}}{{end}}{{end}}'
const shellQuote=s=>"'"+s.replaceAll("'","'\\''")+"'"
const values=execFileSync('ssh',['root@152.53.82.182',`docker inspect ck-api --format ${shellQuote(template)}`],{encoding:'utf8'})
const env={...process.env,CLASHKING_LOCAL_LAN_IP:'192.168.5.62',CLASHKING_LOCAL_CLASH_PROXY_ORIGIN:'https://proxy.clashk.ing'}
for(const line of values.split('\n')){const index=line.indexOf('=');if(index<0)continue;const key=line.slice(0,index);if(['DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','DISCORD_BOT_TOKEN'].includes(key))env['CLASHKING_LOCAL_'+key]=line.slice(index+1)}
const child=spawn(process.execPath,['scripts/local-api-database.mjs','run'],{env,stdio:'inherit'})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
child.on('exit',code=>process.exit(code??1))
