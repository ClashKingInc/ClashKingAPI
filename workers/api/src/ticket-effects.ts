import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, NotFound, RateLimited, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { ticketEmbedTextLength, validateTicketEmbeds } from "./ticket-opening-message.js"
import { ticketPermissionOverwrites } from "./ticket-permissions.js"
import { requireTicketChannel,resolveTicketCategory } from "./ticket-category.js"
import { limitDiscordChannelName } from "./ticket-channel-name.js"

interface Operation {
  readonly id: string; readonly ticket_id: string; readonly ticket_number: number | null; readonly server_id: string
  readonly actor_user_id: string; readonly panel_id: string; readonly state: string; readonly context: unknown
  readonly action: string
}
interface StoredEffect {
  readonly operation_id: string; readonly effect_key: string; readonly ordinal: number; readonly effect_type: string
  readonly request: unknown; readonly state: string; readonly lease_token: string | null; readonly expired: boolean
  readonly result: unknown; readonly attempt_count: number; readonly claimed_at: string | null; readonly ready: boolean
}
interface Work { readonly operation: Operation; readonly effect: StoredEffect; readonly token: string }
const replaySafeEffectTypes = ["pin_message","add_role","remove_role","edit_channel","delete_channel","add_thread_member","set_channel_permission","delete_message"]

const DiscordId = Schema.Struct({ id: Schema.String })
const object = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown): string | undefined => typeof value === "string" && value !== "" ? value : undefined
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
const componentIds = (value: unknown): ReadonlyArray<string> => {
  const ids: string[] = []
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { for (const child of item) visit(child); return }
    const record = object(item)
    if (typeof record.custom_id === "string") ids.push(record.custom_id)
    if (Array.isArray(record.components)) visit(record.components)
  }
  visit(value)
  return ids.sort()
}
const decodedId = (value: unknown) => Schema.decodeUnknownEffect(DiscordId)(value).pipe(
  Effect.map((item) => item.id),
  Effect.mapError(() => new UpstreamUnavailable({ cause:undefined,message:"Discord resource response is invalid" })),
)

const effectResults = (operationId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ effect_key:string;result:unknown }>`SELECT effect_key,result FROM ticket_runtime_effects
    WHERE operation_id=${operationId}::uuid AND state='succeeded'`
  return new Map(rows.map((row) => [row.effect_key,object(row.result)]))
})

const prepareChannelPayload=(work:Work)=>Effect.gen(function* () {
  const request=object(work.effect.request),serverId=text(request.serverId),name=text(request.name),ticketId=text(request.ticketId)
  if (!serverId || !name || !ticketId) return yield* new Conflict({message:"Stored create-channel effect is invalid"})
  const permissionOverwrites=yield* Effect.try({try:()=>ticketPermissionOverwrites(serverId,text(request.applicantUserId) ?? work.operation.actor_user_id,strings(request.moderatorRoleIds)),
    catch:()=>new Conflict({message:"Stored ticket staff roles are unsafe"})})
  const parentId=yield* resolveTicketCategory(serverId,text(request.parentId),text(request.originChannelId))
  return {name,type:0,topic:`ClashKing ticket ${ticketId}`,...(parentId ? {parent_id:parentId} : {}),permission_overwrites:permissionOverwrites}
})

const prepareEffect=(work:Work)=>Effect.gen(function* () {
  if (work.effect.effect_type === "create_channel") return yield* prepareChannelPayload(work)
  const request=object(work.effect.request)
  if (["send_message","edit_channel","set_channel_permission","delete_message","delete_channel"].includes(work.effect.effect_type)
    && request.channelId !== undefined) {
    if (typeof request.channelId !== "string") return yield* new Conflict({message:"Stored ticket channel target is invalid"})
    yield* requireTicketChannel(work.operation.server_id,request.channelId).pipe(Effect.catchTag("NotFound",failure=>
      // Discord IDs cannot be reassigned to a different resource. A confirmed
      // missing delete target remains idempotent through the existing DELETE
      // response handling; no other explicit target silently falls back.
      work.effect.effect_type === "delete_channel" ? Effect.succeed(undefined) : Effect.fail(failure)))
  }
  if (work.effect.effect_type === "edit_channel") {
    const parentId=object(request.body).parent_id
    if (parentId !== undefined && parentId !== null) {
      if (typeof parentId !== "string") return yield* new Conflict({message:"Stored ticket parent category is invalid"})
      const parent=yield* requireTicketChannel(work.operation.server_id,parentId)
      if (parent.type !== 4) return yield* new Conflict({message:"Stored ticket parent is not a category"})
    }
  }
  return undefined
})

const executeEffect = (work: Work, prior: Map<string,Record<string,unknown>>, channelPayload?:Record<string,unknown>): Effect.Effect<Record<string,unknown>,ApiFailure,DiscordApi> => Effect.gen(function* () {
  const discord = yield* DiscordApi, request = object(work.effect.request)
  const channelId = text(prior.get("channel")?.id)
  const threadId = text(prior.get("thread")?.id)
  switch (work.effect.effect_type) {
    case "create_channel": {
      const serverId=text(request.serverId)
      if (!serverId || !channelPayload) return yield* new Conflict({message:"Ticket channel preflight is missing"})
      const value = yield* discord.request(`/guilds/${serverId}/channels`,{method:"POST",body:channelPayload})
      return { id:yield* decodedId(value) }
    }
    case "create_thread": {
      if (!channelId) return yield* new Conflict({ message:"Ticket channel is not provisioned" })
      const value = yield* discord.request(`/channels/${channelId}/threads`,{ method:"POST",body:{
        name:limitDiscordChannelName(text(request.name) ?? `Private ticket ${work.operation.ticket_id}`),type:12,invitable:false,
      } })
      return { id:yield* decodedId(value) }
    }
    case "send_message": {
      const target = text(request.channelId) ?? (request.target === "thread" ? threadId : channelId)
      if (!target) return yield* new Conflict({ message:"Ticket message target is not provisioned" })
      if (typeof request.content === "string") {
        if (request.content.length < 1 || request.content.length > 2000) return yield* new Conflict({ message:"Stored ticket message exceeds Discord limits" })
        const value = yield* discord.request(`/channels/${target}/messages`, { method:"POST",body:{
          content:request.content,nonce:text(request.nonce),enforce_nonce:true,
          allowed_mentions:{parse:[],users:strings(request.userMentions)},
        } })
        return { id:yield* decodedId(value),channelId:target }
      }
      const questions = strings(request.questions), answers = strings(request.answers), accounts = strings(request.accounts)
      const sections = questions.map((question,index) => `**${index+1}. ${question}**\n> ${answers[index] ?? ""}`)
      if (accounts.length > 0) sections.unshift(`**Accounts**\n${accounts.map((tag) => `\`${tag}\``).join(", ")}`)
      const pingRoles = strings(request.pingRoleIds)
      const applicant = text(request.applicantUserId) ?? work.operation.actor_user_id
      const staffThread = request.target === "thread"
      const content = [...pingRoles.map((id) => `<@&${id}>`),...(staffThread ? [] : [`<@${applicant}>`])].join(" ")
        || (staffThread ? "Private staff discussion." : "")
      const description = sections.join("\n\n")
      const embeds=yield* Effect.try({try:()=>validateTicketEmbeds(request.embeds ?? (sections.length === 0 ? [] : [{title:"Ticket application",description}])),
        catch:()=>new Conflict({message:"Stored ticket message embeds are invalid"})})
      if (content.length > 2000 || embeds.length>10 || embeds.reduce((size,embed)=>size+ticketEmbedTextLength(embed),0)>6000) {
        return yield* new Conflict({ message:"Stored ticket message exceeds Discord limits" })
      }
      const components = work.effect.effect_key === "application:0" ? [{ type:1,components:[
        { type:2,style:2,label:"Delete Ticket",custom_id:`ck:ticket:delete:${work.operation.ticket_id}` },
        { type:2,style:2,label:"Assign",custom_id:`ck:ticket:assign:${work.operation.ticket_id}` },
        { type:2,style:3,label:"Approve",custom_id:`ck:ticket:approve:${work.operation.ticket_id}` },
        ...(accounts.length ? [{ type:2,style:2,label:"Accounts",custom_id:`ck:ticket:accounts-view:${work.operation.ticket_id}` }] : []),
      ] }] : work.effect.effect_key === "thread-application:0" && accounts.length > 0 ? [{ type:1,components:[
        { type:2,style:2,label:"Accounts",custom_id:`ck:ticket:accounts-view:${work.operation.ticket_id}` },
      ] }] : []
      const value = yield* discord.request(`/channels/${target}/messages`,{ method:"POST",body:{ content,
        nonce:text(request.nonce),enforce_nonce:true,allowed_mentions:{ parse:[],users:staffThread ? [] : [applicant],roles:pingRoles },
        ...(embeds.length ? {embeds} : {}),components,
      } })
      return { id:yield* decodedId(value),channelId:target }
    }
    case "pin_message": {
      const messageKey = text(request.messageEffectKey), messageId = messageKey ? text(prior.get(messageKey)?.id) : undefined
      const target = request.target === "thread" ? threadId : channelId
      if (!target || !messageId || prior.get(messageKey!)?.channelId !== target) return yield* new Conflict({ message:"Ticket pin dependencies are not provisioned" })
      yield* discord.request(`/channels/${target}/pins/${messageId}`,{ method:"PUT" })
      return { id:messageId,channelId:target }
    }
    case "add_thread_member": {
      if (!threadId) return yield* new Conflict({ message:"Ticket thread is not provisioned" })
      const userId = text(request.userId)
      if (!userId) return yield* new Conflict({ message:"Ticket thread member is invalid" })
      yield* discord.request(`/channels/${threadId}/thread-members/${userId}`,{ method:"PUT" })
      return { id:userId,threadId }
    }
    case "add_role":
    case "remove_role": {
      const roleId = text(request.roleId),userId = text(request.userId)
      if (!roleId || !userId) return yield* new Conflict({ message:"Ticket role effect is invalid" })
      yield* discord.request(`/guilds/${work.operation.server_id}/members/${userId}/roles/${roleId}`,
        { method:work.effect.effect_type === "add_role" ? "PUT" : "DELETE" })
      return { id:roleId,userId }
    }
    case "edit_channel": {
      const id = text(request.channelId) ?? channelId
      if (!id) return yield* new Conflict({ message:"Ticket channel edit target is invalid" })
      const value = yield* discord.request(`/channels/${id}`,{ method:"PATCH",body:object(request.body) })
      return { id:yield* decodedId(value) }
    }
    case "set_channel_permission": {
      const id = text(request.channelId), userId = text(request.userId)
      if (!id || !userId || typeof request.allow !== "string" || typeof request.deny !== "string") {
        return yield* new Conflict({ message:"Stored ticket permission effect is invalid" })
      }
      yield* discord.request(`/channels/${id}/permissions/${userId}`, {method:"PUT",body:{type:1,allow:request.allow,deny:request.deny}})
      return {id:userId,channelId:id}
    }
    case "delete_message": {
      const id = text(request.channelId), key = text(request.messageEffectKey)
      const messageId = key ? text(prior.get(key)?.id) : undefined
      if (!id || !messageId || prior.get(key!)?.channelId !== id) return yield* new Conflict({ message:"Ticket notification deletion dependency is invalid" })
      yield* discord.request(`/channels/${id}/messages/${messageId}`, { method:"DELETE" }).pipe(
        Effect.catchTag("NotFound", () => Effect.void))
      return { id:messageId,channelId:id }
    }
    case "delete_channel": {
      const id = text(request.channelId) ?? channelId
      if (!id) return yield* new Conflict({ message:"Ticket channel delete target is invalid" })
      const value = yield* discord.request(`/channels/${id}`,{ method:"DELETE" })
      return { id:yield* decodedId(value) }
    }
    default: return yield* new Conflict({ message:"Unknown stored ticket effect" })
  }
})

const claimNext = (operationId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    const operation = (yield* sql<Operation>`SELECT id::text,ticket_id::text,ticket_number,server_id,actor_user_id,panel_id::text,state,context,action
      FROM ticket_runtime_operations WHERE id=${operationId}::uuid FOR UPDATE`)[0]
    if (!operation) return { outcome:"missing" as const }
    if (["completed","failed"].includes(operation.state)) return { outcome:operation.state as "completed"|"failed" }
    if (operation.state === "preparing") return { outcome:"waiting" as const }
    const effect = (yield* sql<StoredEffect>`SELECT operation_id::text,effect_key,ordinal,effect_type,request,state,lease_token::text,
      lease_expires_at<=clock_timestamp() AS expired,result,attempt_count,claimed_at::text,next_attempt_at<=clock_timestamp() AS ready
      FROM ticket_runtime_effects WHERE operation_id=${operationId}::uuid AND state<>'succeeded' ORDER BY ordinal LIMIT 1 FOR UPDATE`)[0]
    if (!effect) return { outcome:"finalize" as const,operation }
    if (effect.effect_type === "delete_message") {
      const dependency = text(object(effect.request).messageEffectKey)
      if (dependency) yield* sql`UPDATE ticket_runtime_effects removal SET next_attempt_at=GREATEST(removal.next_attempt_at,sent.updated_at+interval '1 second')
        FROM ticket_runtime_effects sent WHERE removal.operation_id=${operationId}::uuid AND removal.effect_key=${effect.effect_key}
          AND removal.state='pending' AND sent.operation_id=removal.operation_id AND sent.effect_key=${dependency} AND sent.state='succeeded'`
      const ready = dependency ? yield* sql`SELECT 1 FROM ticket_runtime_effects
        WHERE operation_id=${operationId}::uuid AND effect_key=${dependency} AND state='succeeded'
          AND updated_at+interval '1 second'<=clock_timestamp()` : []
      if (!ready.length) return { outcome:"waiting" as const }
    }
    if (effect.state === "executing" && !effect.expired || effect.state === "pending" && !effect.ready) return { outcome:"waiting" as const }
    if (effect.state === "executing" && replaySafeEffectTypes.includes(effect.effect_type)) {
      yield* sql`UPDATE ticket_runtime_effects SET state='pending',lease_token=NULL,lease_expires_at=NULL,
        claimed_at=NULL,next_attempt_at=clock_timestamp(),last_error='expired_replay_safe_claim',updated_at=clock_timestamp()
        WHERE operation_id=${operationId}::uuid AND effect_key=${effect.effect_key}`
    } else if (effect.state === "executing" || effect.state === "uncertain") {
      yield* sql`UPDATE ticket_runtime_effects SET state='uncertain',next_attempt_at=clock_timestamp()+interval '30 seconds',
        last_error='discord_result_requires_reconciliation',updated_at=clock_timestamp() WHERE operation_id=${operationId}::uuid AND effect_key=${effect.effect_key}`
      yield* sql`UPDATE ticket_runtime_operations SET state='reconciling',updated_at=clock_timestamp() WHERE id=${operationId}::uuid`
      return { outcome:"uncertain" as const,operation,effect }
    }
    const token = crypto.randomUUID()
    yield* sql`UPDATE ticket_runtime_effects SET state='executing',lease_token=${token}::uuid,
      lease_expires_at=clock_timestamp()+interval '90 seconds',claimed_at=clock_timestamp(),attempt_count=attempt_count+1,
      updated_at=clock_timestamp() WHERE operation_id=${operationId}::uuid AND effect_key=${effect.effect_key}`
    yield* sql`UPDATE ticket_runtime_operations SET state='provisioning',updated_at=clock_timestamp() WHERE id=${operationId}::uuid`
    return { outcome:"work" as const,operation,effect,token } satisfies { readonly outcome:"work"; readonly operation:Operation; readonly effect:StoredEffect; readonly token:string }
  }))
})

const reconcile = (operation: Operation,effect: StoredEffect) => Effect.gen(function* () {
  const discord = yield* DiscordApi, request = object(effect.request)
  if (effect.effect_type === "create_channel") {
    const channels = yield* discord.request(`/guilds/${operation.server_id}/channels`)
    if (!Array.isArray(channels)) return undefined
    const marker = `ClashKing ticket ${operation.ticket_id}`
    const matches = channels.map(object).filter((channel) => channel.topic === marker && typeof channel.id === "string")
    return matches.length === 1 ? { id:matches[0]!.id as string } : undefined
  }
  if (effect.effect_type === "create_thread") {
    const prior = yield* effectResults(operation.id),channelId = text(prior.get("channel")?.id)
    const name = text(request.name)
    if (!channelId || !name) return undefined
    const bot = object(yield* discord.request("/users/@me"))
    if (typeof bot.id !== "string") return undefined
    const active = object(yield* discord.request(`/guilds/${operation.server_id}/threads/active`)).threads
    if (!Array.isArray(active)) return undefined
    const candidates = new Map<string,Record<string,unknown>>()
    for (const item of active.map(object)) if (typeof item.id === "string") candidates.set(item.id,item)
    let before: string | undefined,exhausted=false
    for (let page=0;page<5;page++) {
      const archived = object(yield* discord.request(`/channels/${channelId}/users/@me/threads/archived/private?limit=100${before ? `&before=${encodeURIComponent(before)}` : ""}`))
      const items = archived.threads
      if (!Array.isArray(items)) return undefined
      for (const item of items.map(object)) if (typeof item.id === "string") candidates.set(item.id,item)
      if (archived.has_more !== true) { exhausted=true;break }
      const last = object(items.at(-1))
      if (typeof last.id !== "string") return undefined
      before=last.id
    }
    if (!exhausted) return undefined
    const matches = [...candidates.values()].filter((thread) => thread.name === name && thread.parent_id === channelId &&
      thread.owner_id === bot.id && typeof thread.id === "string")
    return matches.length === 1 ? { id:matches[0]!.id as string } : undefined
  }
  if (effect.effect_type === "send_message") {
    const prior = yield* effectResults(operation.id)
    const target = text(request.channelId) ?? (request.target === "thread" ? text(prior.get("thread")?.id) : text(prior.get("channel")?.id))
    const nonce = text(request.nonce)
    if (!target || !nonce) return undefined
    const bot = object(yield* discord.request("/users/@me"))
    const messages = yield* discord.request(`/channels/${target}/messages?limit=100`)
    if (typeof bot.id !== "string" || !Array.isArray(messages)) return undefined
    const expectedComponents = effect.effect_key === "application:0" ? [
      `ck:ticket:approve:${operation.ticket_id}`,
      `ck:ticket:assign:${operation.ticket_id}`,
      `ck:ticket:delete:${operation.ticket_id}`,
      ...(strings(request.accounts).length ? [`ck:ticket:accounts-view:${operation.ticket_id}`] : []),
    ].sort() : effect.effect_key === "thread-application:0" && strings(request.accounts).length > 0
      ? [`ck:ticket:accounts-view:${operation.ticket_id}`] : []
    const matches = messages.map(object).filter((message) => message.nonce === nonce && typeof message.id === "string" &&
      object(message.author).id === bot.id && JSON.stringify(componentIds(message.components)) === JSON.stringify(expectedComponents))
    return matches.length === 1 ? { id:matches[0]!.id as string,channelId:target } : undefined
  }
  return undefined
})

const complete = (work: Work,outcome: "succeeded"|"pending"|"uncertain"|"failed",result: Record<string,unknown> = {},failure?: string,delay=5) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql.withTransaction(Effect.gen(function* () {
    const current = (yield* sql<{ state:string;lease_token:string|null;result:unknown }>`SELECT state,lease_token::text,result FROM ticket_runtime_effects
      WHERE operation_id=${work.operation.id}::uuid AND effect_key=${work.effect.effect_key} FOR UPDATE`)[0]
    if (!current || current.lease_token !== work.token || current.state !== "executing") return yield* new Conflict({ message:"Ticket effect claim is no longer owned" })
    yield* sql`UPDATE ticket_runtime_effects SET state=${outcome},result=${JSON.stringify(result)}::jsonb,
      next_attempt_at=clock_timestamp()+(${delay}*interval '1 second'),last_error=${failure ?? null},
      lease_token=CASE WHEN ${outcome}='uncertain' THEN lease_token ELSE NULL END,
      claimed_at=CASE WHEN ${outcome}='uncertain' THEN claimed_at ELSE NULL END,
      lease_expires_at=CASE WHEN ${outcome}='uncertain' THEN lease_expires_at ELSE NULL END,updated_at=clock_timestamp()
      WHERE operation_id=${work.operation.id}::uuid AND effect_key=${work.effect.effect_key}`
    if (outcome === "failed") yield* sql`UPDATE ticket_runtime_operations SET state='failed',result=${JSON.stringify({ failure:failure ?? "ticket_effect_failed" })}::jsonb,
      updated_at=clock_timestamp() WHERE id=${work.operation.id}::uuid`
    else if (outcome === "uncertain") yield* sql`UPDATE ticket_runtime_operations SET state='reconciling',updated_at=clock_timestamp() WHERE id=${work.operation.id}::uuid`
  }))
})

const finalize = (operation: Operation) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  if (operation.action !== "open") {
    yield* sql.withTransaction(Effect.gen(function* () {
      const ticket = (yield* sql<{ status:string;channel_id:string }>`SELECT status,channel_id FROM tickets
        WHERE id=${operation.ticket_id}::uuid AND server_id=${operation.server_id} FOR UPDATE`)[0]
      const current = (yield* sql<{ state:string;progress:unknown }>`SELECT state,progress FROM ticket_runtime_operations WHERE id=${operation.id}::uuid FOR UPDATE`)[0]
      if (current?.state === "completed") return
      const context = object(operation.context), action = object(context.action)
      if (!ticket || (operation.action !== "notify" && ticket.status !== context.previousStatus) || ticket.channel_id !== context.channelId) {
        return yield* new Conflict({ message:"Ticket changed during staff effect execution" })
      }
      if (operation.action === "set_status") {
        const status = text(action.status)
        if (!status || !["open","sleep","closed","delete"].includes(status)) return yield* new Conflict({ message:"Invalid ticket status operation" })
        yield* sql`UPDATE tickets SET status=${status},closed_at=CASE WHEN ${status} IN ('closed','delete') THEN clock_timestamp() ELSE NULL END WHERE id=${operation.ticket_id}::uuid`
      } else if (operation.action === "assign") {
        const clan = text(object(current?.progress).clanTag)
        if (!clan) return yield* new Conflict({ message:"Invalid ticket assignment operation" })
        yield* sql`UPDATE tickets SET assigned_clan_tag=${clan} WHERE id=${operation.ticket_id}::uuid`
      } else if (operation.action === "opt") {
        if (typeof action.enabled !== "boolean") return yield* new Conflict({ message:"Invalid ticket subscription operation" })
        yield* sql`UPDATE tickets SET opted_in_user_ids=CASE WHEN ${action.enabled} THEN
          ARRAY(SELECT DISTINCT unnest(array_append(COALESCE(opted_in_user_ids,ARRAY[]::text[]),${operation.actor_user_id})))
          ELSE array_remove(COALESCE(opted_in_user_ids,ARRAY[]::text[]),${operation.actor_user_id}) END WHERE id=${operation.ticket_id}::uuid`
      } else if (operation.action !== "add_member" && operation.action !== "approve" && operation.action !== "notify") {
        return yield* new Conflict({ message:"Unknown ticket operation action" })
      }
      yield* sql`UPDATE ticket_runtime_operations SET state='completed',result=${JSON.stringify({channelId:ticket.channel_id,action:operation.action})}::jsonb,
        updated_at=clock_timestamp() WHERE id=${operation.id}::uuid`
    }))
    return
  }
  if (operation.ticket_number === null) return yield* new Conflict({ message:"Ticket operation has no allocated number" })
  yield* sql.withTransaction(Effect.gen(function* () {
    const results = yield* effectResults(operation.id), channelId = text(results.get("channel")?.id), threadId = text(results.get("thread")?.id)
    if (!channelId) return yield* new Conflict({ message:"Ticket operation completed without a channel" })
    const context = object(operation.context),settings = object(context.settings),progress = object((yield* sql<{ progress:unknown }>`SELECT progress FROM ticket_runtime_operations WHERE id=${operation.id}::uuid FOR UPDATE`)[0]?.progress)
    const inserted = yield* sql<{ id:string }>`INSERT INTO tickets(id,server_id,channel_id,is_thread,status_id,number,panel_id,applicant_accounts,applicant_user_id,
      thread_id,status,naming_convention) VALUES(${operation.ticket_id}::uuid,${operation.server_id},${channelId},false,0,
      ${operation.ticket_number},${operation.panel_id}::uuid,${strings(progress.accounts)},${operation.actor_user_id},${threadId ?? null},'open',
      ${text(settings.naming) ?? "{ticket_count}-{user}"}) ON CONFLICT(id) DO NOTHING RETURNING id::text`
    if (inserted.length === 0) {
      const existing = (yield* sql<{ server_id:string;channel_id:string;number:number;panel_id:string;applicant_user_id:string|null;thread_id:string|null }>`
        SELECT server_id,channel_id,number,panel_id::text,applicant_user_id,thread_id FROM tickets WHERE id=${operation.ticket_id}::uuid FOR UPDATE`)[0]
      if (!existing || existing.server_id !== operation.server_id || existing.channel_id !== channelId ||
        existing.number !== operation.ticket_number || existing.panel_id !== operation.panel_id ||
        existing.applicant_user_id !== operation.actor_user_id || existing.thread_id !== (threadId ?? null)) {
        return yield* new Conflict({ message:"Ticket completion conflicts with an existing ticket identity" })
      }
    }
    yield* sql`UPDATE ticket_runtime_operations SET state='completed',result=${JSON.stringify({ channelId,...(threadId ? { threadId } : {}) })}::jsonb,
      updated_at=clock_timestamp() WHERE id=${operation.id}::uuid AND state<>'completed'`
  }))
})

export const runTicketOperation = (operationId: string) => Effect.gen(function* () {
  for (let step=0;step<32;step++) {
    const claimed = yield* claimNext(operationId)
    if (claimed.outcome === "missing" || claimed.outcome === "completed" || claimed.outcome === "failed" || claimed.outcome === "waiting") return claimed.outcome
    if (claimed.outcome === "finalize") {
      const finished=yield* finalize(claimed.operation).pipe(Effect.result)
      if(finished._tag==="Success")return "completed" as const
      if(finished.failure instanceof Conflict){
        const sql=yield* SqlClient.SqlClient
        yield* sql`UPDATE ticket_runtime_operations SET state='failed',result=${JSON.stringify({ failure:"ticket_finalization_conflict" })}::jsonb,
          updated_at=clock_timestamp() WHERE id=${operationId}::uuid AND state<>'completed'`
        return "failed" as const
      }
      return yield* Effect.fail(finished.failure)
    }
    if (claimed.outcome === "uncertain") {
      const recovered = yield* reconcile(claimed.operation,claimed.effect)
      if (recovered === undefined) return "reconciling" as const
      const sql = yield* SqlClient.SqlClient
      yield* sql`UPDATE ticket_runtime_effects SET state='succeeded',result=${JSON.stringify(recovered)}::jsonb,
        lease_token=NULL,claimed_at=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=clock_timestamp()
        WHERE operation_id=${operationId}::uuid AND effect_key=${claimed.effect.effect_key} AND state='uncertain'`
      continue
    }
    if (claimed.outcome !== "work") return "waiting" as const
    const work: Work = { operation:claimed.operation,effect:claimed.effect,token:claimed.token }
    // Dependency loading is strictly before Discord I/O. Its database failure
    // is safe to retry, unlike a lost response from executeEffect below.
    const dependencies = yield* effectResults(operationId).pipe(Effect.result)
    if (dependencies._tag === "Failure") {
      yield* complete(work,"pending",{},"dependency_read_unavailable",5)
      return "waiting" as const
    }
    // Explicit channel/category lookups are read-only and precede mutations. Their
    // known failures must not enter ambiguous-create reconciliation: there is
    // no created channel to discover. Only executeEffect crosses that boundary.
    const preflight=yield* prepareEffect(work).pipe(Effect.result)
    if (preflight._tag === "Failure") {
      const failure=preflight.failure
      if (failure instanceof UpstreamUnavailable || failure instanceof RateLimited) {
        yield* complete(work,"pending",{},"channel_preflight_unavailable",failure instanceof RateLimited ? failure.retryAfterSeconds : 5)
        return "waiting" as const
      }
      yield* complete(work,"failed",{},failure._tag)
      return "failed" as const
    }
    const result = yield* executeEffect(work,dependencies.success,preflight.success).pipe(Effect.result)
    if (result._tag === "Success") { yield* complete(work,"succeeded",result.success); continue }
    const failure = result.failure
    if (failure instanceof RateLimited) { yield* complete(work,"pending",{},"rate_limited",failure.retryAfterSeconds); return "waiting" as const }
    if (failure instanceof UpstreamUnavailable) {
      const safelyRepeatable = replaySafeEffectTypes.includes(work.effect.effect_type)
      yield* complete(work,safelyRepeatable ? "pending" : "uncertain",{},"transport_uncertain",30)
      return safelyRepeatable ? "waiting" as const : "reconciling" as const
    }
    if (failure instanceof NotFound && work.effect.effect_type === "delete_channel") {
      const request=object(work.effect.request),prior=yield* effectResults(work.operation.id)
      const deletedId=text(request.channelId) ?? text(prior.get("channel")?.id)
      if (!deletedId) { yield* complete(work,"failed",{},"missing_delete_target"); return "failed" as const }
      yield* complete(work,"succeeded",{ id:deletedId }); continue
    }
    if (failure instanceof Forbidden || failure instanceof InvalidRequest || failure instanceof NotFound || failure instanceof Conflict) {
      yield* complete(work,"failed",{},failure._tag); return "failed" as const
    }
    yield* complete(work,"failed",{},"ticket_effect_failed"); return "failed" as const
  }
  return "waiting" as const
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause,message:"Ticket effect storage is unavailable" }))))
