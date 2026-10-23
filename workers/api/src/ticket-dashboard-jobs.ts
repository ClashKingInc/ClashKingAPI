import { TicketDashboardJob, dashboardEndpoints, TicketTranscriptDocument } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { DiscordApi } from "./discord-api.js"
import { WorkerEnvironment } from "./environment.js"
import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import { requireTicketChannel, resolveTicketCategory } from "./ticket-category.js"
import { ticketChannelName } from "./ticket-channel-name.js"
import { ticketApplicantPermissions } from "./ticket-permissions.js"
import { ticketStatusLogChannel } from "./ticket-log-settings.js"
import { storeTicketTranscript, removeTicketTranscript } from "./ticket-json-transcript.js"
import { captureTranscriptAttachment } from "./ticket-transcript-attachment-capture.js"

const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === "string" ? value : ""
const fail = (cause: unknown) => new DatabaseFailure({ cause, message: "Ticket dashboard action storage is unavailable" })
interface Job { id: string; server_id: string; ticket_id: string; actor_user_id: string; action: string; request: unknown; state: string; result: unknown; last_error: string | null; claim_token: string | null; updated_at?: string }
interface Ticket { id: string; server_id: string; channel_id: string; thread_id: string | null; status: string; panel_id: string; number: number; applicant_user_id: string | null; naming_convention: string | null; applicant_accounts: string[]; panel_name: string; data: unknown }
const response = (job: Job) => Schema.decodeUnknownEffect(TicketDashboardJob)(job).pipe(Effect.mapError(fail))
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

/** Browser identities are authenticated dashboard users, never forged Discord interactions. */
export const executeTicketDashboardAction = (input: DashboardServerOperationInput) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, serverId = text(input.path.serverId), ticketId = text(input.path.ticketId)
  if (!uuid.test(ticketId)) return yield* new InvalidRequest({ message: "Invalid ticket ID" })
  if (input.endpoint.operationId === "ticketDashboardJob") {
    if (!uuid.test(text(input.path.jobId))) return yield* new InvalidRequest({ message: "Invalid ticket action ID" })
    const job = (yield* sql<Job>`SELECT * FROM ticket_dashboard_jobs WHERE id=${text(input.path.jobId)}::uuid AND server_id=${serverId} AND ticket_id=${ticketId}::uuid`)[0]
    if (!job) return yield* new NotFound({ message: "Ticket action not found" })
    if (job.state === "pending" && (job.last_error === null || Date.now() - Date.parse(job.updated_at ?? "") > 30000)) yield* Effect.tryPromise({
      try: () => input.bindings.TICKET_RUNTIME.getByName(`${serverId}:${ticketId}`).wake(`dashboard:${job.id}`),
      catch: cause => new UpstreamUnavailable({ cause, message: "Ticket action wake is temporarily unavailable" }),
    })
    return yield* response(job)
  }
  if (input.principal.kind !== "user") return yield* new Forbidden({ message: "An authenticated dashboard user is required" })
  const actorId = input.principal.userId
  const body = yield* Schema.decodeUnknownEffect(dashboardEndpoints.ticketDashboardAction.body)(input.body, { onExcessProperty: "error" }).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid ticket action" })))
  if ((body.action === "set_status") !== (body.status !== undefined)) return yield* new InvalidRequest({ message: "A status is required only for status changes" })
  const request = { action: body.action, ...(body.status ? { status: body.status } : {}) }
  const job = yield* sql.withTransaction(Effect.gen(function* () {
    const ticket = (yield* sql<{ status: string; data: unknown; conversation_deleted_at: string | null }>`SELECT t.status,p.data,t.conversation_deleted_at FROM tickets t JOIN ticket_panels p ON p.id=t.panel_id AND p.server_id=t.server_id WHERE t.id=${ticketId}::uuid AND t.server_id=${serverId} FOR UPDATE OF t`)[0]
    if (!ticket) return yield* new NotFound({ message: "Ticket not found" })
    const prior = (yield* sql<Job>`SELECT * FROM ticket_dashboard_jobs WHERE id=${body.id}::uuid`)[0]
    if (prior) {
      if (prior.server_id !== serverId || prior.ticket_id !== ticketId || prior.actor_user_id !== actorId || JSON.stringify(object(prior.request).action) !== JSON.stringify(request.action) || object(prior.request).status !== body.status) return yield* new Conflict({ message: "Ticket action identity was reused" })
      return prior
    }
    if (ticket.status === "delete" || ticket.conversation_deleted_at !== null) return yield* new Conflict({ message: "Closed ticket conversations cannot be changed or captured" })
    const transcriptsEnabled = object(ticket.data).transcripts_enabled !== false
    if (body.action === "capture_transcript" && !transcriptsEnabled) return yield* new Conflict({ message: "Transcripts are disabled for this panel" })
    const active = yield* sql`SELECT id FROM ticket_runtime_operations WHERE ticket_id=${ticketId}::uuid AND
      (state IN ('submitted','provisioning','reconciling') OR (state='preparing' AND expires_at>clock_timestamp()))
      UNION ALL SELECT id FROM ticket_dashboard_jobs WHERE ticket_id=${ticketId}::uuid AND state IN ('pending','running')`
    if (active.length) return yield* new Conflict({ message: "Ticket already has an active action" })
    return (yield* sql<Job>`INSERT INTO ticket_dashboard_jobs(id,server_id,ticket_id,actor_user_id,action,request)
      VALUES(${body.id}::uuid,${serverId},${ticketId}::uuid,${actorId},${body.action === "set_status" && body.status === "closed" ? "delete_ticket" : body.action},${JSON.stringify({ ...request, previousStatus: ticket.status, transcriptsEnabled })}::jsonb) RETURNING *`)[0]!
  }))
  if (["pending", "running"].includes(job.state)) yield* Effect.tryPromise({
    try: () => input.bindings.TICKET_RUNTIME.getByName(`${serverId}:${ticketId}`).wake(`dashboard:${job.id}`),
    catch: cause => new UpstreamUnavailable({ cause, message: "Ticket action is saved; retry to check its progress" }),
  })
  return yield* response(job)
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(fail(cause))))

/** Explicitly bounded snapshot. Unstored media is counted, never presented as an archived attachment. */
export const collectTicketTranscript = (ticket: Ticket, captureStartedAt: string, storage?: { bucket: R2Bucket; capability: string }) => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const channels: typeof TicketTranscriptDocument.Type.channels[number][] = []
  const attachments: typeof TicketTranscriptDocument.Type.attachments[number][] = [], budget = { bytes: 0, count: 0 }
  let remaining = 2000
  const cutoff = ((BigInt(Date.parse(captureStartedAt)) - 1420070400000n) << 22n).toString()
  for (const channelId of [ticket.channel_id, ...(ticket.thread_id ? [ticket.thread_id] : [])]) {
    yield* requireTicketChannel(ticket.server_id, channelId)
    const channel = object(yield* discord.request(`/channels/${channelId}`))
    if (channelId !== ticket.channel_id && channel.parent_id !== ticket.channel_id) return yield* new Forbidden({ message: "Ticket thread does not belong to this conversation" })
    const messages: (typeof TicketTranscriptDocument.Type.channels)[number]["messages"][number][] = []
    let before = cutoff, historyComplete = false
    while (remaining > 0) {
      const page = yield* discord.request(`/channels/${channelId}/messages?limit=${Math.min(100, remaining)}&before=${before}`).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Schema.JsonObject))),
        Effect.mapError(cause => new UpstreamUnavailable({ cause, message: "Ticket history could not be captured" })))
      if (!page.length) { historyComplete = true; break }
      for (const raw of page) {
        if (!/^\d{1,20}$/u.test(text(raw.id)) || BigInt(text(raw.id)) >= BigInt(before)) return yield* new InvalidRequest({ message: "Discord history pagination is invalid" })
        const author = object(raw.author), member = object(raw.member), reference = object(raw.message_reference)
        const attachmentIds: string[] = []
        if (storage && Array.isArray(raw.attachments)) for (const item of raw.attachments) {
          const attachment = yield* Effect.tryPromise({ try: () => captureTranscriptAttachment(storage.bucket, storage.capability, object(item), budget),
            catch: cause => {
              console.error(JSON.stringify({ event: "ticket_attachment_capture_failed", failure: cause instanceof Error ? cause.message.replace(/https?:\/\/\S+/gu, "[redacted URL]").slice(0, 300) : "Unknown attachment failure" }))
              const detail = cause instanceof Error && ["Transcript attachment storage conflict", "Transcript attachment size mismatch", "Attachment size mismatch", "Attachment exceeded its declared size", "Discord attachment is unavailable"].includes(cause.message) ? cause.message : "attachment download or upload unavailable"
              return new UpstreamUnavailable({ cause, message: `Ticket attachment capture failed: ${detail}` })
            } })
          if (attachment) { attachments.push(attachment); attachmentIds.push(attachment.id) }
        }
        messages.push({ id: text(raw.id), createdAt: text(raw.timestamp), editedAt: typeof raw.edited_timestamp === "string" ? raw.edited_timestamp : null,
          author: { id: text(author.id), name: text(author.username), displayName: text(member.nick) || text(author.global_name) || text(author.username),
            avatarUrl: typeof author.avatar === "string" ? `https://cdn.discordapp.com/avatars/${text(author.id)}/${author.avatar}.png` : null, bot: author.bot === true },
          content: text(raw.content), type: typeof raw.type === "number" ? raw.type : 0, pinned: raw.pinned === true,
          referencedMessageId: typeof reference.message_id === "string" ? reference.message_id : null,
          mentions: Array.isArray(raw.mentions) ? raw.mentions.slice(0, 100).map(value => {
            const mention = object(value), mentionedMember = object(mention.member)
            return { id: text(mention.id), displayName: text(mentionedMember.nick) || text(mention.global_name) || text(mention.username) }
          }).filter(mention => /^\d{1,20}$/u.test(mention.id) && mention.displayName.length > 0) : [],
          embeds: Array.isArray(raw.embeds) ? raw.embeds.map(item => object(item) as Schema.JsonObject) : [],
          components: Array.isArray(raw.components) ? raw.components.map(item => object(item) as Schema.JsonObject) : [],
          attachmentIds, omittedAttachmentCount: Array.isArray(raw.attachments) ? raw.attachments.length - attachmentIds.length : 0,
          reactions: Array.isArray(raw.reactions) ? raw.reactions.map(value => { const reaction = object(value), emoji = object(reaction.emoji); return { emoji: text(emoji.name), count: Number(reaction.count) } }) : [],
        })
      }
      remaining -= page.length
      before = text(page.at(-1)?.id)
      if (page.length < Math.min(100, remaining + page.length)) { historyComplete = true; break }
    }
    channels.push({ id: channelId, name: text(channel.name), type: Number(channel.type), topic: typeof channel.topic === "string" ? channel.topic : null, historyComplete, messages: messages.reverse() })
  }
  return yield* Schema.decodeUnknownEffect(TicketTranscriptDocument)({ schemaVersion: 1, captureStartedAt, collectedAt: new Date().toISOString(),
    ticket: { guildId: ticket.server_id, channelId: ticket.channel_id, openerId: ticket.applicant_user_id ?? "0", number: String(ticket.number), panelName: ticket.panel_name }, channels, attachments }).pipe(Effect.mapError(() => new InvalidRequest({ message: "Captured ticket history exceeds transcript limits" })))
})

/** Cleanup is durable and runs only after the replacement is committed. */
const cleanRetiredTranscripts = (job: Job) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, env = yield* WorkerEnvironment
  const retired = object(job.result).retired_transcript_paths
  if (!Array.isArray(retired) || !retired.length) return true
  return yield* Effect.tryPromise({
    try: async () => { for (const path of retired) if (typeof path === "string") await removeTicketTranscript(env.TICKETING, path) },
    catch: cause => new UpstreamUnavailable({ cause, message: "Previous transcript cleanup will retry" }),
  }).pipe(Effect.flatMap(() => sql`UPDATE ticket_dashboard_jobs SET result=result-'retired_transcript_paths' WHERE id=${job.id}::uuid AND state='completed'`),
    Effect.as(true), Effect.catch(() => Effect.succeed(false)))
})

/** Commit status last; deletion requires a durable archive checkpoint first. */
const deliverTicketLogs = (job: Job) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, discord = yield* DiscordApi
  const pending = object(job.result).pending_logs
  if (!Array.isArray(pending)) return true
  for (const raw of pending) {
    const log = object(raw), key = text(log.key), channelId = text(log.channelId), nonce = text(log.nonce)
    const sent = yield* Effect.gen(function* () {
      yield* requireTicketChannel(job.server_id, channelId)
      // Recover a send whose Discord response was lost before its SQL receipt.
      const history = yield* discord.request(`/channels/${channelId}/messages?limit=100`)
      const prior = Array.isArray(history) ? history.find(value => object(value).nonce === nonce) : undefined
      const message = prior ?? (yield* discord.request(`/channels/${channelId}/messages`, {method:"POST",body:{
        content:text(log.content),nonce,enforce_nonce:true,allowed_mentions:{parse:[]},
      }}))
      return {id:text(object(message).id)}
    }).pipe(Effect.catch(error => error._tag === "Forbidden" || error._tag === "NotFound"
      ? Effect.succeed({error:error.message}) : Effect.fail(error)))
    yield* sql`UPDATE ticket_dashboard_jobs SET result=jsonb_set(
      jsonb_set(result,'{pending_logs}',COALESCE((SELECT jsonb_agg(item) FROM jsonb_array_elements(result->'pending_logs') item WHERE item->>'key'<>${key}),'[]'::jsonb)),
      '{log_receipts}',COALESCE(result->'log_receipts','{}'::jsonb)||${JSON.stringify({[key]:sent})}::jsonb)
      WHERE id=${job.id}::uuid AND state='completed'`
  }
  return true
}).pipe(Effect.catch(() => Effect.succeed(false)))

const finishCompletedJob = (job: Job) => Effect.gen(function* () {
  const cleaned = yield* cleanRetiredTranscripts(job)
  const logged = yield* deliverTicketLogs(job)
  return cleaned && logged
})

export const runTicketDashboardJob = (id: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, discord = yield* DiscordApi, env = yield* WorkerEnvironment, token = crypto.randomUUID()
  const job = (yield* sql<Job>`UPDATE ticket_dashboard_jobs SET state='running',claim_token=${token}::uuid,
    lease_expires_at=clock_timestamp()+interval '10 minutes',updated_at=clock_timestamp()
    WHERE id=${id}::uuid AND (state='pending' OR (state='running' AND lease_expires_at<clock_timestamp())) RETURNING *`)[0]
  if (!job) {
    const prior = (yield* sql<Job>`SELECT * FROM ticket_dashboard_jobs WHERE id=${id}::uuid`)[0]
    if (prior?.state === "completed") return yield* finishCompletedJob(prior)
    return !prior || !["pending", "running"].includes(prior.state)
  }
  const work = Effect.gen(function* () {
    const ticket = (yield* sql<Ticket>`SELECT t.*,p.name AS panel_name,p.data FROM tickets t JOIN ticket_panels p ON p.id=t.panel_id AND p.server_id=t.server_id
      WHERE t.id=${job.ticket_id}::uuid AND t.server_id=${job.server_id}`)[0]
    const request = object(job.request)
    if (!ticket || ticket.status !== request.previousStatus) return yield* new Conflict({ message: "Ticket changed before the action could run" })
    let result: Record<string, unknown> = object(job.result)
    const checkpoint = result.verified_channel_id === ticket.channel_id && result.archive_ready === true
    const channel = yield* requireTicketChannel(job.server_id, ticket.channel_id).pipe(Effect.catchTag("NotFound", error => checkpoint && job.action === "delete_ticket" ? Effect.succeed(undefined) : Effect.fail(error)))
    if (job.action === "delete_ticket" && channel && channel.type !== 0) return yield* new Conflict({ message: "Dashboard deletion requires a ticket text channel" })
    if (!checkpoint && (job.action === "capture_transcript" || (job.action === "delete_ticket" && request.transcriptsEnabled !== false))) {
      const capture = yield* collectTicketTranscript(ticket, new Date().toISOString(), { bucket: env.TICKETING, capability: token })
      if (job.action === "delete_ticket" && (!capture.channels.every(item => item.historyComplete) || capture.channels.some(item => item.messages.some(message => message.omittedAttachmentCount > 0)))) return yield* new Conflict({ message: "Deletion blocked: the full conversation and every attachment must be archived first" })
      const published = yield* Effect.tryPromise({ try: () => storeTicketTranscript(env.TICKETING, token, capture), catch: cause => new UpstreamUnavailable({ cause, message: "Transcript storage is unavailable" }) })
      result = { transcript_path: published.path, history_complete: capture.channels.every(item => item.historyComplete),
        omitted_attachment_count: capture.channels.reduce((total, item) => total + item.messages.reduce((count, message) => count + message.omittedAttachmentCount, 0), 0) }
    }
    if (!checkpoint && (job.action === "capture_transcript" || job.action === "delete_ticket")) {
      result = { ...result, verified_channel_id: ticket.channel_id, archive_ready: true, transcripts_enabled: request.transcriptsEnabled !== false }
      const owned = yield* sql`UPDATE ticket_dashboard_jobs SET result=${JSON.stringify(result)}::jsonb WHERE id=${id}::uuid AND claim_token=${token}::uuid AND lease_expires_at>clock_timestamp() RETURNING id`
      if (!owned.length) return yield* new Conflict({ message: "Ticket action lease expired before archive commit" })
    }
    if (job.action === "delete_ticket") {
      if (ticket.thread_id) {
        const thread = yield* requireTicketChannel(job.server_id, ticket.thread_id).pipe(Effect.catchTag("NotFound", () => Effect.succeed(undefined)))
        if (thread && (thread.parent_id !== ticket.channel_id || thread.type !== 12)) return yield* new Forbidden({message:"Private staff thread does not belong to this ticket"})
        if (thread) yield* discord.request(`/channels/${ticket.thread_id}`, {method:"PATCH",body:{archived:true,locked:true}}).pipe(Effect.catchTag("NotFound", () => Effect.succeed(undefined)))
      }
      yield* discord.request(`/channels/${ticket.channel_id}`, { method: "DELETE" }).pipe(Effect.catchTag("NotFound", () => Effect.succeed(undefined)))
      result = { ...result, status: "closed" }
    } else if (job.action === "set_status") {
      const status = request.status
      if (status !== "open" && status !== "sleep") return yield* new InvalidRequest({ message: "Invalid ticket status" })
      if (channel?.type !== 0) return yield* new Conflict({ message: "Dashboard status changes require a ticket text channel" })
      const body: Record<string, unknown> = {}, data = object(ticket.data)
      const categoryId = data[`${status}-category`]
      if (typeof categoryId === "string") body.parent_id = yield* resolveTicketCategory(job.server_id, categoryId)
      if (ticket.naming_convention?.includes("status")) {
        const user = ticket.applicant_user_id ? object(yield* discord.request(`/users/${ticket.applicant_user_id}`)) : {}
        const account = ticket.applicant_accounts[0] ? (yield* sql<{ name: string; townhall_level: number }>`SELECT name,townhall_level FROM basic_player WHERE tag=${ticket.applicant_accounts[0]}`)[0] : undefined
        body.name = ticketChannelName(ticket.naming_convention, { number: ticket.number, user: text(user.username), accountName: account?.name ?? "", accountTownhall: account?.townhall_level ?? null, status })
      }
      if (Object.keys(body).length) yield* discord.request(`/channels/${ticket.channel_id}`, { method: "PATCH", body })
      if (ticket.applicant_user_id) yield* discord.request(`/channels/${ticket.channel_id}/permissions/${ticket.applicant_user_id}`, { method: "PUT",
        body: { type: 1, allow: status === "sleep" ? "0" : ticketApplicantPermissions, deny: status === "sleep" ? "1024" : "0" } })
      result = { status }
    }
    if (job.action === "set_status" || job.action === "delete_ticket") {
      const data = object(ticket.data), status = job.action === "delete_ticket" ? "closed" : text(request.status)
      const logs: Record<string,unknown>[] = []
      const statusLog = ticketStatusLogChannel(data)
      if (statusLog) logs.push({key:"status",channelId:statusLog,
        nonce:`${job.id.replaceAll("-","").slice(0,22)}s`,
        content:`${status === "open" ? "✅" : status === "sleep" ? "💤" : "❌"} Ticket #${ticket.number} changed to ${status} by <@${job.actor_user_id}>.${job.action === "delete_ticket" ? request.transcriptsEnabled === false ? " Transcripts were disabled." : " The transcript was saved before deletion." : ""}`})
      result.pending_logs = logs
    }
    yield* sql.withTransaction(Effect.gen(function* () {
      const current = (yield* sql<{ status: string }>`SELECT status FROM tickets WHERE id=${job.ticket_id}::uuid AND server_id=${job.server_id} FOR UPDATE`)[0]
      if (!current || current.status !== request.previousStatus) return yield* new Conflict({ message: "Ticket changed while the action was running" })
      if (typeof result.transcript_path === "string") {
        const prior = yield* sql<{path: string}>`SELECT DISTINCT result->>'transcript_path' AS path FROM ticket_dashboard_jobs WHERE ticket_id=${job.ticket_id}::uuid AND server_id=${job.server_id} AND state='completed' AND result->>'transcript_path' IS NOT NULL AND result->>'transcript_path'<>${result.transcript_path}`
        result.retired_transcript_paths = prior.map(item => item.path)
      }
      const owned = yield* sql`UPDATE ticket_dashboard_jobs SET state='completed',result=${JSON.stringify(result)}::jsonb,claim_token=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=clock_timestamp()
        WHERE id=${id}::uuid AND claim_token=${token}::uuid AND lease_expires_at>clock_timestamp() RETURNING id`
      if (!owned.length) return yield* new Conflict({ message: "Ticket action lease expired" })
      if (job.action === "set_status") yield* sql`UPDATE tickets SET status=${text(request.status)},closed_at=CASE WHEN ${text(request.status)}='closed' THEN clock_timestamp() ELSE NULL END WHERE id=${job.ticket_id}::uuid`
      if (job.action === "delete_ticket") yield* sql`UPDATE tickets SET status='closed',closed_at=clock_timestamp(),conversation_deleted_at=clock_timestamp() WHERE id=${job.ticket_id}::uuid`
    }))
    return yield* finishCompletedJob({ ...job, result })
  })
  return yield* work.pipe(Effect.catch(error => Effect.gen(function* () {
    const retry = error._tag === "UpstreamUnavailable" || error._tag === "RateLimited" || error._tag === "SqlError"
    yield* sql`UPDATE ticket_dashboard_jobs SET state=${retry ? "pending" : "failed"},claim_token=NULL,lease_expires_at=NULL,
      last_error=${retry ? `${error._tag === "SqlError" ? "Ticket storage is unavailable" : error.message}; retrying` : error.message},updated_at=clock_timestamp()
      WHERE id=${id}::uuid AND claim_token=${token}::uuid`
    return !retry
  })))
})
