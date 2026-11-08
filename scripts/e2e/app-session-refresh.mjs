// Actual local Auth API + bundled App auth/token/client services. Files provide
// the platform persistence boundary; no mocked service methods or API responses.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { hash } from 'bcryptjs'
import { build } from 'esbuild'

export async function verifyAppSessionRefresh({db,origin,emailLookupKey}) {
  assert.equal(process.env.CLASHKING_DISPOSABLE_TIMESCALE,'1')
  assert.equal(new URL(origin).hostname,'127.0.0.1')
  const app=process.env.CLASHKING_E2E_EXPO_REPO
  assert.ok(app,'Set CLASHKING_E2E_EXPO_REPO to the actual Expo checkout')
  const directory=await mkdtemp(join(app,'.auth-api-e2e-'))
  const apiRepo=resolve(new URL('../../',import.meta.url).pathname)
  const require=createRequire(join(apiRepo,'package.json'))
  const users=[0,1].map(index=>({id:`app-auth-${randomUUID()}`,email:`app-auth-${randomUUID()}@example.invalid`,name:`App auth ${index}`}))
  const password='actual-local-auth-password-123',device='actual-app-device-'+randomUUID()
  let refreshRequests=0,held,releaseHeld,holdNext401Path=null,holdNext401JsonPath=null,baseId;const requestCounts=new Map()
  const proxy=createServer(async(req,res)=>{
    try {
      const input=[];for await(const chunk of req)input.push(chunk)
      const path=new URL(req.url,'http://local').pathname;const requestKey=req.method+' '+path;requestCounts.set(requestKey,(requestCounts.get(requestKey)??0)+1)
      if(path==='/v2/auth/refresh')refreshRequests++
      const response=await fetch(origin+req.url,{method:req.method,headers:{...(req.headers.authorization?{authorization:req.headers.authorization}:{}),...(path==='/v2/auth/web/refresh'?{origin:'https://local-app.clashk.ing'}:{}),'content-type':'application/json'},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(input)})})
      const body=Buffer.from(await response.arrayBuffer())
      if(holdNext401Path===path&&response.status===401){holdNext401Path=null;held?.();await new Promise(resolve=>{releaseHeld=resolve})}
      res.writeHead(response.status,{'content-type':response.headers.get('content-type')??'application/json'})
      if(holdNext401JsonPath===path&&response.status===401){holdNext401JsonPath=null;res.flushHeaders();held?.();await new Promise(resolve=>{releaseHeld=resolve})}
      res.end(body)
    } catch {res.destroy()}
  })
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve))
  const apiOrigin=`http://127.0.0.1:${proxy.address().port}`
  class Files {
    constructor(path){this.path=path}
    async getItem(key){try{return await readFile(join(this.path,encodeURIComponent(key)),'utf8')}catch(e){if(e.code==='ENOENT')return null;throw e}}
    async setItem(key,value){await mkdir(this.path,{recursive:true});const path=join(this.path,encodeURIComponent(key)),temporary=path+'.tmp';await writeFile(temporary,value,{mode:0o600});await rename(temporary,path)}
    async removeItem(key){await rm(join(this.path,encodeURIComponent(key)),{force:true})}
    async clear(){await rm(this.path,{recursive:true,force:true});await mkdir(this.path,{recursive:true})}
  }
  try {
    for(const user of users)await db.query("INSERT INTO auth_users(user_id,provider,email_hash,username,password_hash) VALUES($1,'email',$2,$3,$4)",[user.id,createHash('sha256').update(user.email+emailLookupKey).digest('hex'),user.name,await hash(password,10)])
    const source=`export {TokenService} from '${app}/src/services/auth/token-service';export {NativeAuthRefreshLock,NoopAuthRefreshLock} from '${app}/src/services/auth/refresh-lock';export {AuthSessionRepository} from '${app}/src/services/storage/auth-storage';export {AuthService} from '${app}/src/features/auth/auth-service';export {createAppContractClient} from '${app}/src/core/api/app-contract-client';export {withBearerToken} from '${app}/src/core/api/contract-api';export {httpTransport,TransportError} from '@clashking/api-client';export {AuthMeEndpoint,NotificationDeviceRegisterEndpoint,expoEndpoints} from '@clashking/api-contracts/expo';export {Effect} from 'effect';`
    const outfile=join(directory,'services.mjs')
    await build({stdin:{contents:source,resolveDir:app},bundle:true,platform:'node',format:'esm',outfile,external:['@clashking/native'],plugins:[{name:'shared-effect-runtime',setup(builder){builder.onResolve({filter:/^effect(?:\/.*)?$/},args=>({path:require.resolve(args.path)}))}}],alias:{'@clashking/api-client':join(apiRepo,'packages/api-client/dist/index.js'),'@clashking/api-contracts/expo':join(apiRepo,'packages/api-contracts/dist/expo.js'),'@clashking/api-contracts':join(apiRepo,'packages/api-contracts/dist/index.js')}})
    const services=await import(outfile)
    const preferences=new Files(join(directory,'preferences')),secure=new Files(join(directory,'secure'))
    const identity={getDeviceId:async()=>device,getDeviceName:async()=>'Local App Auth E2E'}
    const sessions=new services.AuthSessionRepository(secure,preferences,'ios',identity.getDeviceId)
    let auth,rejected=0,clock=Math.floor(Date.now()/1000)
    const tokens=new services.TokenService({apiV2Url:apiOrigin+'/v2',platform:'ios',sessions,refreshLock:new services.NoopAuthRefreshLock(),deviceIdentity:identity,nowSeconds:()=>clock,onSessionRejected:async()=>{rejected++;await auth.handleSessionRejected()}})
    const api=services.withBearerToken(services.createAppContractClient({baseUrl:apiOrigin,transport:services.httpTransport(),web:false,tokens}),tokens)
    auth=new services.AuthService({api,tokens,preferences,environment:'production',platform:'native'})
    const me=()=>services.Effect.runPromise(api.execute(services.AuthMeEndpoint,{path:{},query:{},body:{}}))
    await auth.signInWithEmail(users[0].email,password)
    assert.equal(auth.state.currentUser.userId,users[0].id)
    const invalidateAccess=async()=>{const session=await sessions.read();const parts=session.accessToken.split('.');parts[2]=parts[2].startsWith('A')?'B'+parts[2].slice(1):'A'+parts[2].slice(1);const rejectedToken=parts.join('.');await tokens.saveTokens(rejectedToken,session.refreshToken);return rejectedToken}
    const stale=await invalidateAccess(),before=refreshRequests
    const profiles=await Promise.all(Array.from({length:12},()=>me()))
    assert.ok(profiles.every(profile=>profile.user_id===users[0].id));assert.equal(refreshRequests-before,1,'Concurrent access rejection must coalesce one refresh')
    const afterRotation=refreshRequests
    await tokens.refreshAfterUnauthorized(stale)
    assert.equal(refreshRequests,afterRotation,'Late stale 401 must reuse the newer access token')
    await auth.initializeAuth();assert.equal(auth.state.isAuthenticated,true)

    // Delay the real rejected web refresh JSON after HTTP headers. A newer
    // login must survive the asynchronous response parsing boundary.
    const webTokens=new services.TokenService({apiV2Url:apiOrigin+'/v2',platform:'web',sessions,refreshLock:new services.NoopAuthRefreshLock(),deviceIdentity:identity})
    holdNext401JsonPath='/v2/auth/web/refresh'
    const webJsonReceived=new Promise(resolve=>{held=resolve}),oldWebRefresh=webTokens.getAccessToken()
    await webJsonReceived
    const currentWebBearer=await tokens.getAccessToken()
    await webTokens.saveWebAccessToken(currentWebBearer)
    releaseHeld();await oldWebRefresh
    assert.equal(await webTokens.getAccessToken(),currentWebBearer,'Delayed old web refresh JSON cleared a newer login')

    // The reverse proxy forwards the actual API rejection unchanged; it only
    // delays transport to exercise a real newer sign-in winning the race.
    await invalidateAccess();holdNext401Path='/v2/auth/me'
    const heldResponse=new Promise(resolve=>{held=resolve}),oldStartup=auth.initializeAuth()
    await heldResponse
    await auth.signInWithEmail(users[1].email,password)
    releaseHeld();await oldStartup
    assert.equal(auth.state.currentUser.userId,users[1].id,'Delayed old profile must not replace a newer sign-in')
    assert.equal((await me()).user_id,users[1].id)

    baseId=(await db.query("INSERT INTO bases(base_link,message_id,server_id,channel_id) VALUES('https://link.clashofclans.com/en?action=OpenLayout&id=auth-replay','922222222222223701','922222222222223702','922222222222223703') RETURNING id::text")).rows[0].id
    await db.query('INSERT INTO user_saved_bases(user_id,base_id) VALUES($1,$2)',[users[1].id,baseId])
    const rejectCrossSessionMutation=async(endpoint,input,path,nextUser,relogin=false)=>{
      await invalidateAccess();holdNext401Path=path
      const received=new Promise(resolve=>{held=resolve}),countBefore=requestCounts.get(endpoint.method+' '+path)??0
      const pending=services.Effect.runPromise(api.execute(endpoint,input)).then(value=>({value}),error=>({error}))
      await received
      if(relogin)await tokens.clearTokens()
      await auth.signInWithEmail(nextUser.email,password)
      releaseHeld();const result=await pending
      assert.ok(result.error instanceof services.TransportError,'Old-session mutation must fail without replay')
      assert.equal(requestCounts.get(endpoint.method+' '+path)-countBefore,1,'Old-session mutation reached HTTP transport again')
      assert.equal(auth.state.currentUser.userId,nextUser.id)
      assert.equal((await me()).user_id,nextUser.id,'Old mutation rejection cleared the newer session')
    }
    const register={path:{},query:{},body:{token:'local-auth-replay-token',device_id:'stale-session-device',provider:'fcm',platform:'ios',enabled:true}}
    await rejectCrossSessionMutation(services.NotificationDeviceRegisterEndpoint,register,'/v2/notifications/devices',users[0])
    assert.equal((await db.query('SELECT count(*)::int AS n FROM mobile_push_devices WHERE user_id=ANY($1::text[])',[users.map(user=>user.id)])).rows[0].n,0,'POST changed the newer account')
    await rejectCrossSessionMutation(services.expoEndpoints.unsavePersonalBase,{path:{baseId},query:{},body:{}},'/v2/bases/personal/'+baseId,users[1])
    assert.equal((await db.query('SELECT count(*)::int AS n FROM user_saved_bases WHERE user_id=$1 AND base_id=$2',[users[1].id,baseId])).rows[0].n,1,'DELETE removed the newer account’s saved base')
    await rejectCrossSessionMutation(services.NotificationDeviceRegisterEndpoint,register,'/v2/notifications/devices',users[1],true)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM mobile_push_devices WHERE user_id=$1',[users[1].id])).rows[0].n,0,'Same-user re-login replayed an earlier-session POST')

    // Exercise the real native-lock wrapper's unavailable bridge boundary in
    // this Node service environment; no simulator or substituted native module.
    const nativeTokens=new services.TokenService({apiV2Url:apiOrigin+'/v2',platform:'ios',sessions,refreshLock:new services.NativeAuthRefreshLock('ios'),deviceIdentity:identity,nowSeconds:()=>clock})
    const nativeApi=services.withBearerToken(services.createAppContractClient({baseUrl:apiOrigin,transport:services.httpTransport(),web:false,tokens:nativeTokens}),nativeTokens)
    const nativeAuth=new services.AuthService({api:nativeApi,tokens:nativeTokens,preferences,environment:'production',platform:'native'})
    await nativeAuth.initializeAuth();const persisted=await sessions.read(),lockRequestCount=refreshRequests
    clock+=86400
    await assert.rejects(nativeAuth.initializeAuth(),error=>error instanceof services.TransportError)
    assert.equal(nativeAuth.state.currentUser.userId,users[1].id);assert.equal(nativeAuth.state.isAuthenticated,true)
    assert.ok(JSON.stringify(await sessions.read())===JSON.stringify(persisted),'Transient native lock failure changed persisted credentials');assert.equal(refreshRequests,lockRequestCount)
    clock=Math.floor(Date.now()/1000)

    await invalidateAccess()
    await db.query('DELETE FROM auth_refresh_tokens WHERE user_id=$1',[users[1].id])
    await auth.initializeAuth()
    assert.equal(rejected,1);assert.equal(auth.state.isAuthenticated,false)
    assert.ok((await sessions.read()).refreshToken===null,'Definitively revoked refresh must sign out')
    console.log('PASS real App/Auth API: delayed real web401 JSON preserves newer login; held401 POST/DELETE cannot cross accounts or logout/relogin; twelve concurrent 401s coalesce, late stale 401 reuses rotation, delayed profile cannot replace newer sign-in, real unavailable native bridge preserves cached user/session, revoked refresh signs out')
  } finally {
    releaseHeld?.()
    await new Promise(resolve=>proxy.close(resolve))
    if(baseId)await db.query('DELETE FROM bases WHERE id=$1',[baseId])
    for(const user of users)await db.query('DELETE FROM auth_users WHERE user_id=$1',[user.id])
    await rm(directory,{recursive:true,force:true})
  }
}
