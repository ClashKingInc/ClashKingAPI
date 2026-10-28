import { decodeJwt, SignJWT } from "jose"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DashboardGrantRequest, DashboardExchangeEndpoint } from "@clashking/api-contracts"
import { AuthIdentity, bearerToken } from "./auth.js"
import { ServerAuthorization } from "./server-authorization.js"
import { WorkerEnvironment } from "./environment.js"
import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, Unauthenticated } from "./errors.js"
import { readBoundedJson } from "./request-body.js"

const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,"0")).join("")
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,"0")).join("")
const challenge=async(value:string)=>btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")
const audience="clashking-server-dashboard"
const cookie=(serverId:string,value:string,seconds:number)=>`ck_server_refresh_${serverId}=${value}; Path=/v2/auth/server-dashboard; HttpOnly; Secure; SameSite=None; Max-Age=${seconds}`

/** Scope-check before ANY dispatch, not only handlers with serverId paths.
 * Otherwise a server token could be used on private /users or /auth routes. */
export const guardDashboardScope=(request:Request)=>Effect.gen(function*(){
 const token=bearerToken(request);if(!token)return
 let scoped=false;try{const aud=decodeJwt(token).aud;scoped=aud===audience||Array.isArray(aud)&&aud.includes(audience)}catch{return}
 if(!scoped)return
 const user=yield* (yield* AuthIdentity).requireUser(request),id=user.dashboardScope?.serverId
 const url=new URL(request.url),path=url.pathname
 if(!id)return yield* new Forbidden({message:"Invalid server scope"})
 if(path.startsWith(`/v2/server/${id}/`)||path===`/v2/guild/${id}`||path==="/v2/auth/server-dashboard/logout")return
 if(path.startsWith(`/v2/competitive/servers/${id}/`))return
 if(request.method==="GET"&&/^\/v2\/competitive\/(tournaments|clans|teams)(\/|$)/u.test(path))return
 // Game data is public. Keep the allowlist read-only and do not include any
 // general user, OAuth, billing, or refresh endpoint here.
 if(request.method==="GET"&&/^\/proxy\/v1\/(clans|players|locations|leagues)(\/|$)/u.test(path))return
 return yield* new Forbidden({message:"This session can only manage its selected server"})
})

export const dispatchDashboardAccess=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url),grant=/^\/v2\/server\/(\d+)\/dashboard-access-grants$/u.exec(url.pathname),action=/^\/v2\/auth\/server-dashboard\/(exchange|refresh|logout)$/u.exec(url.pathname)?.[1]
 if(!grant&&!action)return undefined
 if(request.method!=="POST"||url.search)return yield* new InvalidRequest({message:"POST without query required"})
 const env=yield* WorkerEnvironment,sql=yield* SqlClient.SqlClient,auth=yield* AuthIdentity,authorization=yield* ServerAuthorization
 const key=new TextEncoder().encode(env.JWT_ACCESS_SECRET)
 const tokenFor=(userId:string,sessionId:string,deviceId:string|null)=>Effect.promise(()=>new SignJWT({dashboard_session:sessionId,...(deviceId?{device:deviceId}:{})}).setProtectedHeader({alg:"HS256"}).setSubject(userId).setAudience(audience).setIssuedAt().setExpirationTime("15m").sign(key))
 const origin=request.headers.get("origin")
 if(origin&&!env.WEB_ALLOWED_ORIGINS.split(",").map(s=>s.trim()).includes(origin))return yield* new Forbidden({message:"Origin not allowed"})
 if(grant){
  const input=yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(DashboardGrantRequest)),Effect.mapError(()=>new InvalidRequest({message:"Invalid dashboard grant"})))
  let userId:string,deviceId:string|null=null,proof=request
  if(input.source==="bot"){
   yield* auth.requireBot(request)
   if(!input.userId||!/^\d+$/u.test(input.userId))return yield* new InvalidRequest({message:"Discord user required"})
   userId=input.userId
   // The trusted bot supplies the interaction actor, but cannot bypass that
   // actor's current server access. This internal proof is never returned.
   const internal=yield* Effect.promise(()=>new SignJWT({}).setProtectedHeader({alg:"HS256"}).setSubject(userId).setAudience(env.WEB_TOKEN_AUDIENCE).setIssuedAt().setExpirationTime("15s").sign(key))
   proof=new Request(request.url,{headers:{authorization:`Bearer ${internal}`}})
  }else{
   const user=yield* auth.requireUser(request);if(user.dashboardScope)return yield* new Forbidden({message:"Use the main app session"})
   if(!input.pkceChallenge||!/^[A-Za-z0-9_-]{43}$/u.test(input.pkceChallenge))return yield* new InvalidRequest({message:"S256 challenge required"})
   if(!user.deviceId&&decodeJwt(bearerToken(request)!).aud!==env.WEB_TOKEN_AUDIENCE)return yield* new InvalidRequest({message:"Native device required"})
   // Browser app sessions use the existing empty-string web device marker.
   // Native handoffs retain their exact device ID and revocation boundary.
   userId=user.userId;deviceId=user.deviceId??""
  }
  const access=yield* authorization.require(proof,grant[1]!,{})
  const code=random(),digest=yield* Effect.promise(()=>hash(code)),expires=new Date(Date.now()+120000)
  yield* sql`INSERT INTO dashboard_access_grants(token_hash,user_id,server_id,source,device_id,permissions,pkce_challenge,expires_at)
    VALUES(${digest},${userId},${grant[1]},${input.source},${deviceId},${JSON.stringify({manager:access.manager,sections:access.sections})}::jsonb,${input.source==="app"?input.pkceChallenge!:null},${expires})`
  return Response.json({code,expiresAt:expires.toISOString(),serverId:grant[1]},{status:201,headers:{"Cache-Control":"no-store"}})
 }
 if(action==="exchange"){
  const input=yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(DashboardExchangeEndpoint.body)),Effect.mapError(()=>new InvalidRequest({message:"Invalid dashboard exchange"})))
  if(!/^[a-f0-9]{64}$/u.test(input.code))return yield* new Unauthenticated({message:"Invalid grant"})
  const digest=yield* Effect.promise(()=>hash(input.code)),refresh=random(),refreshHash=yield* Effect.promise(()=>hash(refresh))
  const session=yield* sql.withTransaction(Effect.gen(function*(){
   const rows=yield* sql<{id:string;user_id:string;server_id:string;source:string;device_id:string|null;permissions:unknown;pkce_challenge:string|null}>`SELECT * FROM dashboard_access_grants WHERE token_hash=${digest} AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`
   const row=rows[0];if(!row)return yield* new Unauthenticated({message:"Grant expired or already used"})
   if(row.source==="app") {if(!input.codeVerifier||input.codeVerifier.length<43||input.codeVerifier.length>128||(yield* Effect.promise(()=>challenge(input.codeVerifier!)))!==row.pkce_challenge)return yield* new Unauthenticated({message:"Grant proof failed"})}
   else {const user=yield* auth.requireUser(request);if(user.userId!==row.user_id||user.dashboardScope)return yield* new Forbidden({message:"Sign in as the intended Discord user"});row.device_id=user.deviceId??"";}
   yield* sql`UPDATE dashboard_access_grants SET consumed_at=now() WHERE id=${row.id}::uuid`
   const expires=new Date(Date.now()+(row.source==="app"&&row.device_id?30*86400:8*3600)*1000)
   const created=yield* sql<{id:string}>`INSERT INTO dashboard_scoped_sessions(grant_id,user_id,server_id,device_id,permissions,refresh_hash,expires_at)
    VALUES(${row.id}::uuid,${row.user_id},${row.server_id},${row.device_id},${JSON.stringify(row.permissions)}::jsonb,${refreshHash},${expires}) RETURNING id::text`
   return {...row,sessionId:created[0]!.id,expires}
  }))
  const access=yield* tokenFor(session.user_id,session.sessionId,session.device_id)
  return Response.json({access_token:access,serverId:session.server_id},{headers:{"Cache-Control":"no-store","Set-Cookie":cookie(session.server_id,refresh,Math.floor((+session.expires-Date.now())/1000))}})
 }
 if(!origin)return yield* new Forbidden({message:"Browser origin required"})
 const body=yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({serverId:Schema.String}))),Effect.mapError(()=>new InvalidRequest({message:"Server ID required"})))
 if(!/^\d+$/u.test(body.serverId))return yield* new InvalidRequest({message:"Invalid server ID"})
 const refresh=new RegExp(`(?:^|;\\s*)ck_server_refresh_${body.serverId}=([a-f0-9]{64})(?:;|$)`,'u').exec(request.headers.get("cookie")??"")?.[1]
 if(!refresh)return yield* new Unauthenticated({message:"Dashboard session missing"})
 const digest=yield* Effect.promise(()=>hash(refresh))
 if(action==="logout"){
  yield* sql`UPDATE dashboard_scoped_sessions SET revoked_at=now() WHERE refresh_hash=${digest} AND server_id=${body.serverId}`
  return Response.json({loggedOut:true},{headers:{"Set-Cookie":cookie(body.serverId,"",0),"Cache-Control":"no-store"}})
 }
 const next=random(),nextHash=yield* Effect.promise(()=>hash(next))
 // Do not burn a usable refresh cookie if the current permission/cache check
 // fails transiently. Rotation and successful authorization commit together.
 const renewed=yield* sql.withTransaction(Effect.gen(function*(){
 const rows=yield* sql<{id:string;user_id:string;server_id:string;device_id:string|null;expires_at:Date}>`UPDATE dashboard_scoped_sessions s SET refresh_hash=${nextHash}
   WHERE refresh_hash=${digest} AND s.server_id=${body.serverId} AND revoked_at IS NULL AND expires_at>now()
   AND (device_id IS NULL OR EXISTS(SELECT 1 FROM auth_refresh_tokens r WHERE r.user_id=s.user_id AND r.device_id=s.device_id AND r.expires_at>now()))
   RETURNING id::text,user_id,server_id,device_id,expires_at`
 const row=rows[0];if(!row)return yield* new Unauthenticated({message:"Dashboard session expired"})
 const token=yield* tokenFor(row.user_id,row.id,row.device_id)
 const proof=new Request(request.url,{headers:{authorization:`Bearer ${token}`}})
 yield* authorization.require(proof,row.server_id,{})
 return {row,token}
 }))
 return Response.json({access_token:renewed.token,serverId:renewed.row.server_id},{headers:{"Cache-Control":"no-store","Set-Cookie":cookie(renewed.row.server_id,next,Math.floor((+new Date(renewed.row.expires_at)-Date.now())/1000))}})
}).pipe(Effect.mapError(cause=>cause instanceof InvalidRequest||cause instanceof Unauthenticated||cause instanceof Forbidden||cause instanceof Conflict||cause instanceof DatabaseFailure?cause:new DatabaseFailure({cause,message:"Dashboard access unavailable"})))
