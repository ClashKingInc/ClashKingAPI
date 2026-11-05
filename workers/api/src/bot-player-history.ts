import { Effect } from "effect"
import { AuthIdentity } from "./auth.js"
import { InvalidRequest } from "./errors.js"
import { queryJoinLeave } from "./public-join-leave.js"
export const dispatchBotPlayerHistory=(request:Request)=>Effect.gen(function*(){
 const url=new URL(request.url),match=/^\/v2\/bot\/players\/([^/]+)\/clan-history$/u.exec(url.pathname)
 if(!match)return undefined
 yield* (yield* AuthIdentity).requireBot(request)
 if(request.method!=="GET"||url.search)return yield* new InvalidRequest({message:"Invalid player history request"})
 const tag=yield* Effect.try({try:()=>decodeURIComponent(match[1]!),catch:()=>new InvalidRequest({message:"Invalid tag encoding"})})
 // The user explicitly approved dated clan visits in public Discord lookup.
 // Keep the App's user-authenticated endpoint unchanged and bound this read.
 return Response.json(yield* queryJoinLeave(tag,new URLSearchParams({limit:"500"}),"player"))
})
