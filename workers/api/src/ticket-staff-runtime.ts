import { DecimalSnowflake, RuntimeUUID, TicketActionEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import { requireFreshInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"
import { parseTicketStaffAction } from "./ticket-staff-actions.js"
import { requireTicketStaff } from "./ticket-staff-authorization.js"
import { ticketChannelName } from "./ticket-channel-name.js"
import { ticketApplicantPermissions } from "./ticket-permissions.js"

export interface StaffTicketSnapshot {
  id: string; server_id: string; channel_id: string; panel_id: string; applicant_user_id: string | null;
  thread_id: string | null; status: string; number: number; naming_convention: string; applicant_accounts: string[];
  data: unknown; panel_name: string; panel_revision: string; assigned_clan_tag: string | null;
}
interface Operation {
  id: string; ticket_id: string; panel_id: string; server_id: string; actor_user_id: string; origin_channel_id: string;
  origin_message_id: string; request_hash: string; action: string; state: string; context: unknown;
  expires_at: string; submission_interaction_id: string | null; submitted_request_hash: string | null;
}
interface QueuedEffect { key: string; type: string; request: Record<string, unknown> }
const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown> : {}
const failure = (cause: unknown) => new DatabaseFailure({ cause, message: "Ticket staff operation storage is unavailable" })
const columns = "id::text,ticket_id::text,panel_id::text,server_id,actor_user_id,origin_channel_id,origin_message_id,request_hash,action,state,context,expires_at::text,submission_interaction_id,submitted_request_hash"
const respond = (operation: Operation) => Schema.decodeUnknownEffect(TicketActionEndpoint.response)(operation.state === "preparing" ? {
  outcome: "ready", operationId: operation.id, ticketId: operation.ticket_id, action: operation.action,
  expiresAt: new Date(operation.expires_at).toISOString(), form: object(operation.context).form,
} : { outcome: operation.state === "completed" ? "complete" : "accepted", operationId: operation.id,
  ticketId: operation.ticket_id, state: operation.state }).pipe(Effect.mapError(failure))
const assertScope = (operation: Operation, interaction: VerifiedRuntimeInteraction) =>
  operation.server_id === interaction.guildId && operation.actor_user_id === interaction.actorId && operation.origin_channel_id === interaction.channelId
    ? Effect.void : Effect.fail(new Forbidden({ message: "Ticket operation does not belong to this staff member or channel" }))
const queue = (id: string, effects: readonly QueuedEffect[]) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const [ordinal, effect] of effects.entries()) yield* sql`INSERT INTO ticket_runtime_effects(operation_id,effect_key,ordinal,effect_type,request)
    VALUES(${id}::uuid,${effect.key},${ordinal},${effect.type},${JSON.stringify(effect.request)}::jsonb)`
})
export const snapshotStaffTicket = (interaction: VerifiedRuntimeInteraction, ticketId?: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<StaffTicketSnapshot>`SELECT t.id::text,t.server_id,t.channel_id,t.panel_id::text,t.applicant_user_id,t.thread_id,
    t.status,t.number,t.naming_convention,t.applicant_accounts,t.assigned_clan_tag,p.data,p.name AS panel_name,p.updated_at::text AS panel_revision
    FROM tickets t JOIN ticket_panels p ON p.id=t.panel_id AND p.server_id=t.server_id
    WHERE t.server_id=${interaction.guildId} AND t.channel_id=${interaction.channelId}
      AND (${ticketId ?? null}::uuid IS NULL OR t.id=${ticketId ?? null}::uuid)`
  if (!rows[0]) return yield* new NotFound({ message: "Ticket not found in this channel" })
  return rows[0]
})
export const checkTicketButtonSource = (ticket: StaffTicketSnapshot, interaction: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  if (interaction.type !== 3) return
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql`SELECT 1 FROM ticket_runtime_operations opening JOIN ticket_runtime_effects message ON message.operation_id=opening.id
    WHERE opening.ticket_id=${ticket.id}::uuid AND opening.server_id=${ticket.server_id} AND opening.action='open'
      AND opening.state='completed' AND message.effect_key='application:0' AND message.state='succeeded'
      AND message.result->>'id'=${interaction.messageId!} AND message.result->>'channelId'=${ticket.channel_id}`
  if (!rows.length) return yield* new Forbidden({ message: "Ticket control does not belong to the canonical application message" })
})

export const prepareTicketStaff = (interaction: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  const action = yield* parseTicketStaffAction(interaction), sql = yield* SqlClient.SqlClient
  const replay = (yield* sql.unsafe<Operation>(`SELECT ${columns} FROM ticket_runtime_operations WHERE interaction_id=$1`, [interaction.id]))[0]
  if (replay) {
    yield* assertScope(replay, interaction)
    if (replay.request_hash !== interaction.requestHash || replay.origin_message_id !== (interaction.messageId ?? interaction.id)) {
      return yield* new Conflict({ message: "Ticket interaction identity was reused" })
    }
    return yield* respond(replay)
  }
  yield* requireFreshInteraction(interaction)
  const ticket = yield* snapshotStaffTicket(interaction, "ticketId" in action ? action.ticketId : undefined)
  yield* checkTicketButtonSource(ticket, interaction)
  yield* requireTicketStaff(interaction, ticket.panel_id, ticket.id)
  if (action.action === "approve") return yield* new Conflict({ message: "Approval template runtime is not ready" })
  if (action.action === "set_status" && action.status === "delete") return yield* new Conflict({ message: "Ticket transcript export must be ready before deletion" })
  if (ticket.status === "delete" || (ticket.status === "closed" && action.action !== "set_status")) {
    return yield* new Conflict({ message: "Ticket is closed" })
  }
  const operationId = crypto.randomUUID(), data = object(ticket.data), effects: QueuedEffect[] = []
  const context: Record<string, unknown> = { channelId: ticket.channel_id, threadId: ticket.thread_id,
    previousStatus: ticket.status, applicantUserId: ticket.applicant_user_id, action, actorLabel: interaction.actorLabel }
  if (action.action === "assign") {
    const clans = yield* sql<{ tag: string; name: string; member_count: number }>`SELECT sc.tag,clan.name,clan.member_count
      FROM server_clans sc JOIN basic_clan clan ON clan.tag=sc.tag WHERE sc.server_id=${ticket.server_id}
      ORDER BY clan.member_count DESC,sc.tag LIMIT 25`
    if (!clans.length) return yield* new Conflict({ message: "No clans are configured for this server" })
    context.form = { kind: "string_select", customId: `ck:ticket:select:${operationId}`, content: "Choose the clan assigned to this ticket.",
      placeholder: "Select clan", minValues: 1, maxValues: 1,
      options: clans.map((clan) => ({ label: clan.name.slice(0,100) || clan.tag, value: clan.tag, description: `${clan.member_count} members` })) }
  }
  if (action.action === "add_member") {
    const discord = yield* DiscordApi
    const member = yield* discord.request(`/guilds/${ticket.server_id}/members/${action.memberId}`).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ user: Schema.Struct({ id: DecimalSnowflake }) }))),
      Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Ticket member lookup failed" })),
    )
    if (member.user.id !== action.memberId) return yield* new Forbidden({ message: "Ticket member identity mismatch" })
    effects.push({ key: "member-permission", type: "set_channel_permission", request: { channelId: ticket.channel_id, userId: action.memberId, allow: ticketApplicantPermissions, deny: "0" } },
      { key: "member-announcement", type: "send_message", request: { channelId: ticket.channel_id, nonce: interaction.id,
        content: `<@${action.memberId}> added to this ticket by <@${interaction.actorId}>`, userMentions: [action.memberId,interaction.actorId] } })
  }
  if (action.action === "set_status" && action.status !== "delete") {
    if ((action.status === "open" || action.status === "closed") && ticket.applicant_user_id) effects.push({
      key: "applicant-permission", type: "set_channel_permission", request: { channelId: ticket.channel_id,
        userId: ticket.applicant_user_id, allow: action.status === "open" ? ticketApplicantPermissions : "0", deny: action.status === "closed" ? "1024" : "0" },
    })
    const body: Record<string, unknown> = {}
    const category = data[`${action.status}-category`]
    if (typeof category === "string") {
      body.parent_id = yield* Schema.decodeUnknownEffect(DecimalSnowflake)(category).pipe(Effect.mapError(failure))
    }
    if (ticket.naming_convention.includes("status")) {
      const discord = yield* DiscordApi
      const user = ticket.applicant_user_id ? object(yield* discord.request(`/users/${ticket.applicant_user_id}`)) : {}
      const account = ticket.applicant_accounts[0] ? (yield* sql<{ name:string;townhall_level:number }>`SELECT name,townhall_level FROM basic_player WHERE tag=${ticket.applicant_accounts[0]}`)[0] : undefined
      body.name = ticketChannelName(ticket.naming_convention,{number:ticket.number,user:typeof user.username === "string" ? user.username : "",
        accountName:account?.name ?? "",accountTownhall:account?.townhall_level ?? null,status:action.status})
    }
    if (Object.keys(body).length) effects.push({ key: "status-channel", type: "edit_channel", request: { channelId: ticket.channel_id, body } })
    if (typeof data.status_change_log === "string") effects.push({ key: "status-log", type: "send_message", request: {
      channelId: yield* Schema.decodeUnknownEffect(DecimalSnowflake)(data.status_change_log).pipe(Effect.mapError(failure)), nonce: interaction.id,
      content: `Ticket #${ticket.number} status changed to ${action.status} by <@${interaction.actorId}> in <#${ticket.channel_id}>.`, userMentions: [],
    } })
  }
  return yield* sql.withTransaction(Effect.gen(function* () {
    const current = (yield* sql<{ status: string }>`SELECT status FROM tickets WHERE id=${ticket.id}::uuid AND server_id=${ticket.server_id} FOR UPDATE`)[0]
    const raced = (yield* sql.unsafe<Operation>(`SELECT ${columns} FROM ticket_runtime_operations WHERE interaction_id=$1`,[interaction.id]))[0]
    if (raced) {
      yield* assertScope(raced,interaction)
      if (raced.request_hash !== interaction.requestHash || raced.origin_message_id !== (interaction.messageId ?? interaction.id)) {
        return yield* new Conflict({message:"Ticket interaction identity was reused"})
      }
      return yield* respond(raced)
    }
    if (!current || current.status !== ticket.status) return yield* new Conflict({ message: "Ticket changed during staff preparation" })
    const active = yield* sql`SELECT id FROM ticket_runtime_operations WHERE ticket_id=${ticket.id}::uuid
      AND (state IN ('submitted','provisioning','reconciling') OR (state='preparing' AND expires_at>clock_timestamp()))`
    if (active.length) return yield* new Conflict({ message: "Ticket already has an active operation" })
    const preparing = action.action === "assign"
    const rows = yield* sql.unsafe<Operation>(`INSERT INTO ticket_runtime_operations(id,interaction_id,action,ticket_id,server_id,actor_user_id,panel_id,
      origin_channel_id,origin_message_id,context,request,request_hash,state,submission_interaction_id,submitted_request,submitted_request_hash)
      VALUES($1::uuid,$2,$3,$4::uuid,$5,$6,$7::uuid,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15::jsonb,$16) RETURNING ${columns}`,
      [operationId,interaction.id,action.action,ticket.id,ticket.server_id,interaction.actorId,ticket.panel_id,ticket.channel_id,
        interaction.messageId ?? interaction.id,JSON.stringify(context),JSON.stringify(action),interaction.requestHash,preparing ? "preparing" : "submitted",
        preparing ? null : interaction.id,preparing ? null : JSON.stringify(action),preparing ? null : interaction.requestHash])
    yield* queue(operationId,effects)
    if (!rows[0]) return yield* failure(undefined)
    return yield* respond(rows[0])
  }))
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(failure(cause))))

export const advanceTicketStaff = (operationId: string, interaction: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  yield* Schema.decodeUnknownEffect(RuntimeUUID)(operationId).pipe(Effect.mapError(()=>new InvalidRequest({message:"Invalid ticket operation ID"})))
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<Operation>(`SELECT ${columns} FROM ticket_runtime_operations WHERE id=$1::uuid AND action='assign'`,[operationId])
  const operation = rows[0]
  if (!operation) return undefined
  yield* assertScope(operation,interaction)
  if (operation.submission_interaction_id === interaction.id) {
    if (operation.submitted_request_hash !== interaction.requestHash) return yield* new Conflict({ message: "Ticket submission identity was reused" })
    return yield* respond(operation)
  }
  yield* requireFreshInteraction(interaction)
  yield* requireTicketStaff(interaction,operation.panel_id,operation.ticket_id)
  if (interaction.type !== 3 || interaction.data.component_type !== 3 || interaction.data.custom_id !== `ck:ticket:select:${operationId}` || interaction.data.values?.length !== 1) {
    return yield* new InvalidRequest({ message: "A matching ticket clan selection is required" })
  }
  const context = object(operation.context), form = object(context.form), selected = interaction.data.values[0]!
  if (!Array.isArray(form.options) || !form.options.some(value => object(value).value === selected)) return yield* new InvalidRequest({ message: "Selected clan is not available" })
  return yield* sql.withTransaction(Effect.gen(function* () {
    // Lock order matches preparation: ticket first, then operation.
    const ticket = (yield* sql<{ status: string }>`SELECT status FROM tickets WHERE id=${operation.ticket_id}::uuid AND server_id=${operation.server_id} FOR UPDATE`)[0]
    const current = (yield* sql.unsafe<Operation>(`SELECT ${columns} FROM ticket_runtime_operations WHERE id=$1::uuid FOR UPDATE`,[operationId]))[0]
    if (!current) return yield* new NotFound({ message: "Ticket operation not found" })
    if (current.submission_interaction_id === interaction.id && current.submitted_request_hash === interaction.requestHash) return yield* respond(current)
    if (current.state !== "preparing" || Date.parse(current.expires_at) <= Date.now() || !ticket || ticket.status !== context.previousStatus) {
      return yield* new Conflict({ message: "Ticket assignment session is no longer current" })
    }
    const clan = yield* sql`SELECT tag FROM server_clans WHERE server_id=${operation.server_id} AND tag=${selected} FOR SHARE`
    if (!clan.length) return yield* new Conflict({ message: "Selected clan is no longer configured" })
    const request = { clanTag: selected }
    yield* sql`UPDATE ticket_runtime_operations SET state='submitted',submission_interaction_id=${interaction.id},
      submitted_request=${JSON.stringify(request)}::jsonb,submitted_request_hash=${interaction.requestHash},
      progress=${JSON.stringify(request)}::jsonb,updated_at=clock_timestamp() WHERE id=${operationId}::uuid`
    return yield* respond({ ...current,state:"submitted" })
  }))
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(failure(cause))))
