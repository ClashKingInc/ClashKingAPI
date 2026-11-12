import { BotModerateClanLinkEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import type { WorkerBindings } from "./environment.js"
import { ServerAuthorization } from "./server-authorization.js"
import { InvalidRequest } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { createRosterLink,deleteRosterLink } from "./dashboard-clan-links.js"

export const dispatchBotClanLinks=(request:Request,bindings:WorkerBindings)=>Effect.gen(function*(){
  const url=new URL(request.url),match=/^\/v2\/bot\/servers\/(\d+)\/modlinks$/u.exec(url.pathname)
  if(request.method!=="POST"||!match)return undefined
  if(url.search)return yield* new InvalidRequest({message:"Unexpected query parameters"})
  const body=yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(BotModerateClanLinkEndpoint.body)),Effect.mapError(()=>new InvalidRequest({message:"Invalid moderator link request"})))
  yield* (yield* ServerAuthorization).requireBotActor(request,match[1]!,body.actorId,{section:"links",write:true})
  const result=body.action==="add"
    ? yield* createRosterLink(bindings,match[1]!,body.clanTag,body.playerTag,body.userId)
    : yield* deleteRosterLink(bindings,match[1]!,body.clanTag,body.playerTag)
  return Response.json(result,{headers:{"Cache-Control":"no-store"}})
})
