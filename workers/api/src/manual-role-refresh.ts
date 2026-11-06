import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { DiscordApi } from "./discord-api.js"
import { InvalidRequest, NotFound } from "./errors.js"
import { manualRefreshTargets, refreshActorAllowed, roleRefreshCategories } from "./bot-role-refresh.js"
import type { WorkerBindings } from "./environment.js"

const snowflake=(v:unknown):v is string=>typeof v==='string'&&/^\d{15,20}$/u.test(v)
const requireInput=(v:boolean)=>v?Effect.void:Effect.fail(new InvalidRequest({message:'Invalid manual refresh request'}))
type Header={id:string;server_id:string;actor_id:string;target_id:string;target_kind:string;channel_id:string;message_id:string|null;preview:boolean;categories:string[];role_treatment:string;created_at:string;updated_at:string;published_complete:boolean}
export const startManualRefresh=(bindings:WorkerBindings,serverId:string,body:Record<string,unknown>)=>Effect.gen(function*(){
  yield* requireInput(snowflake(body.requestId)&&snowflake(body.channelId)&&(body.messageId===undefined||snowflake(body.messageId))&&typeof body.preview==='boolean'&&Array.isArray(body.categories)&&body.categories.length>0&&body.categories.every(v=>roleRefreshCategories.includes(v as typeof roleRefreshCategories[number]))&&['add','remove','both'].includes(String(body.treatment)))
  const users=yield* manualRefreshTargets(bindings,serverId,body)
  const discord=yield* DiscordApi
  const channel=yield* discord.request(`/channels/${String(body.channelId)}`) as Effect.Effect<{guild_id?:string}, import('./errors.js').ApiFailure>
  yield* requireInput(channel.guild_id===serverId)
  const sql=yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function*(){
    // A retry of the same signed invocation must never enqueue a second run.
    const inserted=yield* sql`INSERT INTO role_refresh_requests(id,server_id,actor_id,target_id,target_kind,channel_id,message_id,preview,categories,role_treatment)
      VALUES(${String(body.requestId)},${serverId},${String(body.actorId)},${String(body.targetId)},${String(body.targetKind)},${String(body.channelId)},${typeof body.messageId==='string'?body.messageId:null},${body.preview as boolean},${body.categories as string[]}::text[],${String(body.treatment)}) ON CONFLICT(id) DO NOTHING RETURNING id`
    const headers=yield* sql<Header>`SELECT * FROM role_refresh_requests WHERE id=${String(body.requestId)} FOR UPDATE`
    const header=headers[0]
    yield* requireInput(Boolean(header&&header.server_id===serverId&&header.actor_id===body.actorId&&header.channel_id===body.channelId&&(body.messageId===undefined||header.message_id===body.messageId)&&header.target_id===body.targetId&&header.target_kind===body.targetKind&&header.preview===body.preview&&header.role_treatment===body.treatment&&JSON.stringify(header.categories)===JSON.stringify(body.categories)))
    if(inserted.length)yield* sql`INSERT INTO role_refresh_jobs(id,server_id,user_id,request_id,actor_id,categories,preview,role_treatment,result)
      SELECT ${String(body.requestId)}||':'||subject,${serverId},subject,${String(body.requestId)},${String(body.actorId)},${body.categories as string[]}::text[],${body.preview as boolean},${String(body.treatment)},jsonb_build_object('displayName',COALESCE(NULLIF(member.data->>'nick',''),NULLIF(member.data->'user'->>'global_name',''),NULLIF(member.data->'user'->>'username',''),'Member '||subject))
      FROM unnest(${users}::text[]) subject LEFT JOIN discord_cache.members member ON member.guild_id=${serverId} AND member.user_id=subject`
    return {requestId:body.requestId}
  }))
})
export const manualRefreshReport=(serverId:string,requestId:string)=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  // The header version acknowledges the exact member results rendered. Hold
  // a short shared lock while reading them: a cached standalone header can
  // otherwise trail live jobs and prevent the final publication from settling.
  return yield* sql.withTransaction(Effect.gen(function*(){
  const header=(yield* sql<Header>`SELECT id,server_id,actor_id,target_id,target_kind,channel_id,message_id,preview,categories,role_treatment,created_at::text,updated_at::text,published_complete FROM role_refresh_requests WHERE id=${requestId} AND server_id=${serverId} FOR SHARE`)[0]
  if(!header)return yield* new NotFound({message:'Refresh request not found'})
  const rows=yield* sql<{user_id:string;result:Record<string,unknown>|null;done:boolean;failed:boolean;next_retry_at:string}>`SELECT job.user_id,CASE WHEN job.completed_at IS NOT NULL THEN job.result-'error' ELSE job.result END AS result,job.due_at::text AS next_retry_at,job.completed_at IS NOT NULL AS done,
    job.completed_at IS NULL AND job.attempts>=12 AND NOT EXISTS(SELECT 1 FROM role_refresh_leases l WHERE l.job_id=job.id AND l.expires_at>now()) AS failed
    FROM role_refresh_jobs job WHERE job.server_id=${serverId} AND job.request_id=${requestId} ORDER BY job.user_id`
  const complete=rows.filter(r=>r.done).length,failed=rows.filter(r=>r.failed).length
  return {requestId:header.id,actorId:header.actor_id,channelId:header.channel_id,messageId:header.message_id,createdAt:header.created_at,updatedAt:header.updated_at,
    results:rows.filter(r=>r.done||r.failed).map(r=>({user_id:r.user_id,result:r.result??{error:'Refresh could not finish. Run /refresh to try again.'}})),
    waiting:rows.filter(r=>!r.done&&!r.failed).map(r=>({user_id:r.user_id,result:r.result??{},nextRetryAt:r.next_retry_at})),
    total:rows.length,completed:complete,failed,finished:complete+failed===rows.length,target:header.target_id,kind:header.target_kind,preview:header.preview,categories:header.categories,treatment:header.role_treatment}
  }))
})
export const manualProgressRequests=()=>Effect.gen(function*(){
  const sql=yield* SqlClient.SqlClient
  yield* sql`DELETE FROM role_refresh_requests WHERE published_complete AND updated_at<now()-interval '7 days'`
  // Select unfinished publications, not only unfinished work. A crash after the
  // last member finishes must still publish the final result on the next tick.
  return {requests:yield* sql<{id:string;server_id:string}>`SELECT id,server_id FROM role_refresh_requests
    WHERE NOT published_complete AND (published_at IS NULL OR published_at<now()-interval '15 seconds')
    ORDER BY published_at NULLS FIRST,id LIMIT 20`,
    // Publication throttling must not hide due work from the runner.
    activeRequests:yield* sql<{id:string;server_id:string}>`SELECT request.id,request.server_id FROM role_refresh_requests request
      WHERE NOT request.published_complete AND request.message_id IS NOT NULL
        AND EXISTS(SELECT 1 FROM role_refresh_jobs job WHERE job.request_id=request.id AND job.completed_at IS NULL AND job.attempts<12 AND job.due_at<=now())
      ORDER BY request.updated_at,request.id LIMIT 20` }
})
export const acknowledgeManualProgress=(serverId:string,requestId:string,body:Record<string,unknown>)=>Effect.gen(function*(){
  yield* requireInput(snowflake(body.messageId)&&typeof body.updatedAt==='string'&&typeof body.finished==='boolean')
  const sql=yield* SqlClient.SqlClient
  // Do not acknowledge newer results than the version actually rendered.
  yield* sql`UPDATE role_refresh_requests SET message_id=COALESCE(message_id,${String(body.messageId)}),published_at=now(),
    published_complete=${body.finished as boolean} AND updated_at=${String(body.updatedAt)}::timestamptz
    WHERE id=${requestId} AND server_id=${serverId} AND (message_id IS NULL OR message_id=${String(body.messageId)})`
  return {saved:true}
})
export const authorizeManualReport=(bindings:WorkerBindings,serverId:string,requestId:string,actor:string)=>Effect.gen(function*(){
  yield* requireInput(snowflake(actor)&&snowflake(requestId))
  yield* refreshActorAllowed(bindings,serverId,actor,false)
  const report=yield* manualRefreshReport(serverId,requestId)
  yield* requireInput(report.actorId===actor)
  return report
})
