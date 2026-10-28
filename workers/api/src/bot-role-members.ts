import { Effect, Schema } from "effect"
import { AuthIdentity } from "./auth.js"
import { readDashboardGatewayCollection } from "./dashboard-gateway-cache.js"
import { Forbidden, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
const Member=Schema.Struct({user:Schema.Struct({id:Schema.String,username:Schema.String,global_name:Schema.optionalKey(Schema.NullOr(Schema.String))}),nick:Schema.optionalKey(Schema.NullOr(Schema.String)),roles:Schema.Array(Schema.String)})
const Role=Schema.Struct({id:Schema.String,name:Schema.String})
export const dispatchBotRoleMembers=(request:Request,bindings:WorkerBindings)=>Effect.gen(function*(){
 const url=new URL(request.url),match=/^\/v2\/bot\/servers\/(\d{15,20})\/roles\/(\d{15,20})\/members$/u.exec(url.pathname)
 if(request.method!=="GET"||!match)return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 const server=match[1]!,role=match[2]!,actor=url.searchParams.get("actorId")??"",offset=Number(url.searchParams.get("offset")??0),limit=Number(url.searchParams.get("limit")??20)
 if(!/^\d{15,20}$/u.test(actor)||!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50||[...url.searchParams.keys()].some(key=>!["actorId","offset","limit"].includes(key)))return yield* new InvalidRequest({message:"Invalid role member query"})
 const decodeFailure=(cause:unknown)=>new UpstreamUnavailable({cause,message:"Discord member data is unavailable"})
 const members=yield* Schema.decodeUnknownEffect(Schema.Array(Member))(yield* readDashboardGatewayCollection(bindings.DISCORD_CLIENT_ID,server,"members")).pipe(Effect.mapError(decodeFailure))
 if(!members.some(member=>member.user.id===actor))return yield* new Forbidden({message:"You must be a server member"})
 const roles=yield* Schema.decodeUnknownEffect(Schema.Array(Role))(yield* readDashboardGatewayCollection(bindings.DISCORD_CLIENT_ID,server,"roles")).pipe(Effect.mapError(decodeFailure))
 const selected=roles.find(item=>item.id===role)
 if(!selected)return yield* new NotFound({message:"Role not found"})
 // Membership in @everyone is implicit, not listed in each member's roles.
 // Return display data only; this endpoint must not expose linked accounts.
 const matching=members.filter(member=>role===server||member.roles.includes(role)).map(member=>({id:member.user.id,name:member.nick??member.user.global_name??member.user.username})).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id))
 return Response.json({role:selected,total:matching.length,offset,items:matching.slice(offset,offset+limit)})
})
