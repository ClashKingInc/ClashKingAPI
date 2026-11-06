import { AI_NOTICE_VERSION, AiNoticeAcceptEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, Forbidden, InvalidRequest } from "./errors.js"
import { readBoundedJson } from "./request-body.js"

const readAcknowledgement = (userId:string) => Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  // Consent must have a server-recorded time that has already occurred. NOW()
  // also makes this authorization read ineligible for Hyperdrive query caching;
  // a cached rejection must not survive a successful acknowledgement.
  const rows=yield* sql<{version:string|null}>`SELECT data->'ai_notice'->>'version' AS version FROM user_settings
    WHERE user_id=${userId} AND (data->'ai_notice'->>'acknowledged_at')::timestamptz <= now()`
    .pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"AI notice preferences are unavailable"})))
  return rows[0]?.version===AI_NOTICE_VERSION
})
export const requireAiNotice = (userId:string) => Effect.gen(function*(){
  if(!(yield* readAcknowledgement(userId)))return yield* new Forbidden({message:"Review and accept the AI notice before using the assistant"})
})
export const dispatchAiNotice = (request:Request) => Effect.gen(function*(){
  const url=new URL(request.url)
  if(url.pathname!=="/v2/users/me/ai-notice")return undefined
  if(url.search||!["GET","POST"].includes(request.method))return yield* new InvalidRequest({message:"Invalid AI notice request"})
  const user=yield* (yield* AuthIdentity).requireUser(request)
  if(request.method==="POST"){
    yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(AiNoticeAcceptEndpoint.body)),Effect.mapError(()=>new InvalidRequest({message:"Review the current AI notice version"})))
    const sql=yield* SqlClient.SqlClient
    // Reuse per-person settings and atomically update only this key. Never
    // scope acknowledgement to a guild or overwrite unrelated preferences.
    yield* sql`INSERT INTO user_settings(user_id,data) VALUES(${user.userId},jsonb_build_object('ai_notice',jsonb_build_object('version',${AI_NOTICE_VERSION}::text,'acknowledged_at',now())))
      ON CONFLICT(user_id) DO UPDATE SET data=jsonb_set(user_settings.data,'{ai_notice}',EXCLUDED.data->'ai_notice',true),updated_at=now()`
      .pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Unable to save AI notice acknowledgement"})))
    // The completed upsert is authoritative. Do not replace its result with a
    // second SELECT that a database proxy could serve from an earlier cache.
    return Response.json({version:AI_NOTICE_VERSION,acknowledged:true},{headers:{"Cache-Control":"no-store"}})
  }
  return Response.json({version:AI_NOTICE_VERSION,acknowledged:yield* readAcknowledgement(user.userId)},{headers:{"Cache-Control":"no-store"}})
})
