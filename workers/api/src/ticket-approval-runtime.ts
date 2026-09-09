import { ApproveMessages, DecimalSnowflake } from "@clashking/api-contracts"
import { RuntimeUUID, TicketApprovePrepareEndpoint } from "@clashking/api-contracts/deferred-runtime"
import { Context, Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, NotFound, type ApiFailure } from "./errors.js"
import { requireFreshInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"
import { ApprovalProgress, advanceApprovalForm, approvalAnswers, approvalForm, initialApprovalProgress } from "./ticket-approval-form.js"
import { renderApprovalMessages, type TicketApprovalToken } from "./ticket-approval-template.js"
import { parseTicketStaffAction } from "./ticket-staff-actions.js"
import { requireTicketStaff } from "./ticket-staff-authorization.js"
import { checkTicketButtonSource, snapshotStaffTicket, type StaffTicketSnapshot } from "./ticket-staff-runtime.js"

/** Read-only provider resolution. Delivery happens only through ticket_runtime_effects. */
export class TicketApprovalResolver extends Context.Service<TicketApprovalResolver, {
  readonly resolve: (ticket: StaffTicketSnapshot, template: string) => Effect.Effect<{
    readonly builtins: Readonly<Partial<Record<TicketApprovalToken, string>>>;
    readonly userMentions: readonly string[];
  }, ApiFailure>
}>()("clashking/TicketApprovalResolver") {}

type Reply = typeof TicketApprovePrepareEndpoint.response.Type
interface Operation {
  id: string; ticket_id: string; panel_id: string; server_id: string; actor_user_id: string; origin_channel_id: string;
  origin_message_id: string; request_hash: string; action: string; state: string; context: unknown; progress: unknown;
  progress_receipts: unknown; version: number; expires_at: string;
}
const columns = "id::text,ticket_id::text,panel_id::text,server_id,actor_user_id,origin_channel_id,origin_message_id,request_hash,action,state,context,progress,progress_receipts,version,expires_at::text"
const ApprovalContext = Schema.Struct({
  panelId: RuntimeUUID, channelId: DecimalSnowflake, previousStatus: Schema.String, panelRevision: Schema.String,
  applicantUserId: Schema.NullOr(DecimalSnowflake), assignedClanTag: Schema.NullOr(Schema.String),
  applicantAccounts: Schema.Array(Schema.String), names: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(25)),
})
type ApprovalContext = typeof ApprovalContext.Type
const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown> : {}
const failure = (cause: unknown) => new DatabaseFailure({ cause, message: "Ticket approval storage is unavailable" })
const stored = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(failure))
const safely = <A>(fn: () => A) => Effect.try({ try: fn, catch: cause => cause instanceof Conflict || cause instanceof InvalidRequest ? cause : failure(cause) })
const scope = (row: Operation, interaction: VerifiedRuntimeInteraction) =>
  row.action === "approve" && row.server_id === interaction.guildId && row.actor_user_id === interaction.actorId && row.origin_channel_id === interaction.channelId
    ? Effect.void : Effect.fail(new Forbidden({ message: "Ticket approval does not belong to this staff member or channel" }))
const response = (row: Operation): Effect.Effect<Reply, ApiFailure> => Effect.gen(function* () {
  if (row.state !== "preparing") return yield* stored(TicketApprovePrepareEndpoint.response, {
    outcome: row.state === "completed" ? "complete" : "accepted", operationId: row.id, ticketId: row.ticket_id, state: row.state,
  })
  const context = yield* stored(ApprovalContext, row.context), progress = yield* stored(ApprovalProgress, row.progress)
  const form = yield* safely(() => approvalForm(row.id, context.names, progress))
  return yield* stored(TicketApprovePrepareEndpoint.response, { outcome: "ready", operationId: row.id, ticketId: row.ticket_id,
    action: "approve", expiresAt: new Date(row.expires_at).toISOString(), form })
})
const templatesFor = (ticket: StaffTicketSnapshot) => stored(ApproveMessages, object(ticket.data).approve_messages ?? []).pipe(
  Effect.map(messages => messages.map(message => ({ ...message, name: message.name.trim() }))))
const sameSnapshot = (ticket: StaffTicketSnapshot, context: ApprovalContext) =>
  ticket.panel_id === context.panelId && ticket.channel_id === context.channelId && ticket.status === context.previousStatus && ticket.panel_revision === context.panelRevision &&
  ticket.applicant_user_id === context.applicantUserId && ticket.assigned_clan_tag === context.assignedClanTag &&
  JSON.stringify(ticket.applicant_accounts) === JSON.stringify(context.applicantAccounts)
    ? Effect.void : Effect.fail(new Conflict({ message: "Ticket or approval templates changed; start a new approval" }))

const lockTicketAndPanel = (ticketId: string, panelId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`SELECT id FROM tickets WHERE id=${ticketId}::uuid FOR UPDATE`
  yield* sql`SELECT id FROM ticket_panels WHERE id=${panelId}::uuid FOR SHARE`
})

export const prepareTicketApproval = (interaction: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  const action = yield* parseTicketStaffAction(interaction)
  if (action.action !== "approve") return yield* new InvalidRequest({ message: "A matching ticket approval button is required" })
  const sql = yield* SqlClient.SqlClient
  const replay = (yield* sql.unsafe<Operation>(`SELECT ${columns} FROM ticket_runtime_operations WHERE interaction_id=$1`, [interaction.id]))[0]
  const replayResponse = (row: Operation) => Effect.gen(function* () {
    yield* scope(row, interaction)
    if (row.ticket_id !== action.ticketId || row.request_hash !== interaction.requestHash || row.origin_message_id !== interaction.messageId) {
      return yield* new Conflict({ message: "Ticket approval interaction identity was reused" })
    }
    return yield* response(row)
  })
  if (replay) return yield* replayResponse(replay)
  yield* requireFreshInteraction(interaction)
  const ticket = yield* snapshotStaffTicket(interaction, action.ticketId)
  yield* checkTicketButtonSource(ticket, interaction)
  yield* requireTicketStaff(interaction, ticket.panel_id, ticket.id)
  if (!["open", "sleep"].includes(ticket.status)) return yield* new Conflict({ message: "Ticket is closed" })
  const templates = yield* templatesFor(ticket)
  if (!templates.length) return yield* new Conflict({ message: "No approval messages are configured for this panel" })
  const context: ApprovalContext = { panelId: ticket.panel_id, channelId: ticket.channel_id, previousStatus: ticket.status, panelRevision: ticket.panel_revision,
    applicantUserId: ticket.applicant_user_id, assignedClanTag: ticket.assigned_clan_tag, applicantAccounts: ticket.applicant_accounts,
    names: templates.map(template => template.name) }
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* lockTicketAndPanel(ticket.id, ticket.panel_id)
    const raced = (yield* sql.unsafe<Operation>(`SELECT ${columns} FROM ticket_runtime_operations WHERE interaction_id=$1`, [interaction.id]))[0]
    if (raced) return yield* replayResponse(raced)
    yield* sameSnapshot(yield* snapshotStaffTicket(interaction, ticket.id), context)
    yield* requireTicketStaff(interaction, ticket.panel_id, ticket.id)
    const active = yield* sql`SELECT id FROM ticket_runtime_operations WHERE ticket_id=${ticket.id}::uuid
      AND (state IN ('submitted','provisioning','reconciling') OR (state='preparing' AND expires_at>clock_timestamp()))`
    if (active.length) return yield* new Conflict({ message: "Ticket already has an active operation" })
    const id = crypto.randomUUID()
    const rows = yield* sql.unsafe<Operation>(`INSERT INTO ticket_runtime_operations(id,interaction_id,action,ticket_id,server_id,actor_user_id,panel_id,
      origin_channel_id,origin_message_id,context,request,request_hash,progress,expires_at)
      VALUES($1::uuid,$2,'approve',$3::uuid,$4,$5,$6::uuid,$7,$8,$9::jsonb,$10::jsonb,$11,$12::jsonb,clock_timestamp()+interval '10 minutes') RETURNING ${columns}`,
    [id, interaction.id, ticket.id, ticket.server_id, interaction.actorId, ticket.panel_id, ticket.channel_id, interaction.messageId,
      JSON.stringify(context), JSON.stringify(action), interaction.requestHash, JSON.stringify(initialApprovalProgress())])
    if (!rows[0]) return yield* failure(undefined)
    return yield* response(rows[0])
  }))
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(failure(cause))))

export const advanceTicketApproval = (id: string, interaction: VerifiedRuntimeInteraction): Effect.Effect<Reply | undefined, ApiFailure,
  SqlClient.SqlClient | DiscordApi | TicketApprovalResolver> => Effect.gen(function* () {
  yield* Schema.decodeUnknownEffect(RuntimeUUID)(id).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid ticket operation ID" })))
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql.unsafe<Operation>(`SELECT ${columns} FROM ticket_runtime_operations WHERE id=$1::uuid AND action='approve'`, [id]))[0]
  if (!row) return undefined
  yield* scope(row, interaction)
  const replay = (current: Operation) => Effect.gen(function* () {
    const receipts = yield* stored(Schema.Record(Schema.String, Schema.String), current.progress_receipts)
    if (!Object.hasOwn(receipts, interaction.id)) return undefined
    if (receipts[interaction.id] !== interaction.requestHash) return yield* new Conflict({ message: "Ticket approval submission identity was reused" })
    return yield* response(current)
  })
  const prior = yield* replay(row)
  if (prior) return prior
  yield* requireFreshInteraction(interaction)
  if (row.state !== "preparing" || Date.parse(row.expires_at) <= Date.now()) return yield* new Conflict({ message: "Ticket approval session is no longer current" })
  yield* requireTicketStaff(interaction, row.panel_id, row.ticket_id)
  const context = yield* stored(ApprovalContext, row.context), progress = yield* stored(ApprovalProgress, row.progress)
  const ticket = yield* snapshotStaffTicket(interaction, row.ticket_id)
  yield* sameSnapshot(ticket, context)
  const templates = yield* templatesFor(ticket)
  const next = yield* safely(() => advanceApprovalForm(id, progress, interaction, templates))
  // Template provider reads happen before row locks and cannot send messages. A later CAS
  // rejects stale pages, changed templates, revoked grants or ticket assignments.
  const resolution = next.stage === "complete" ? yield* (yield* TicketApprovalResolver).resolve(ticket, next.template) : undefined
  const messages = resolution ? yield* safely(() => renderApprovalMessages(next.template, resolution.builtins, approvalAnswers(next))) : []
  if (messages.length > 10_000) return yield* new InvalidRequest({ message: "Expanded approval message is too large" })
  const mentions = resolution ? yield* stored(Schema.Array(DecimalSnowflake), [...new Set(resolution.userMentions)]) : []
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* lockTicketAndPanel(row.ticket_id, row.panel_id)
    const current = (yield* sql.unsafe<Operation>(`SELECT ${columns} FROM ticket_runtime_operations WHERE id=$1::uuid FOR UPDATE`, [id]))[0]
    if (!current) return yield* new NotFound({ message: "Ticket approval operation not found" })
    yield* scope(current, interaction)
    const raced = yield* replay(current)
    if (raced) return raced
    if (current.version !== row.version || current.state !== "preparing" || Date.parse(current.expires_at) <= Date.now()) {
      return yield* new Conflict({ message: "Ticket approval page is no longer current" })
    }
    yield* sameSnapshot(yield* snapshotStaffTicket(interaction, row.ticket_id), context)
    yield* requireTicketStaff(interaction, row.panel_id, row.ticket_id)
    const receipts = { ...object(current.progress_receipts), [interaction.id]: interaction.requestHash }
    const sizes = (yield* sql<{ progress_bytes: number; receipt_bytes: number }>`SELECT
      octet_length(${JSON.stringify(next)}::jsonb::text) AS progress_bytes,
      octet_length(${JSON.stringify(receipts)}::jsonb::text) AS receipt_bytes`)[0]!
    if (sizes.progress_bytes > 524288 || sizes.receipt_bytes > 131072) return yield* new InvalidRequest({ message: "Ticket approval form exceeds journal limits" })
    if (next.stage !== "complete") {
      yield* sql`UPDATE ticket_runtime_operations SET progress=${JSON.stringify(next)}::jsonb,progress_receipts=${JSON.stringify(receipts)}::jsonb,
        version=version+1,updated_at=clock_timestamp() WHERE id=${id}::uuid`
      return yield* response({ ...current, progress: next })
    }
    for (const [index, content] of messages.entries()) {
      const request = { channelId: ticket.channel_id, content, userMentions: mentions, nonce: `${interaction.id}:${index}` }
      yield* sql`INSERT INTO ticket_runtime_effects(operation_id,effect_key,ordinal,effect_type,request)
        VALUES(${id}::uuid,${`approval:${index}`},${index},'send_message',${JSON.stringify(request)}::jsonb)`
    }
    yield* sql`UPDATE ticket_runtime_operations SET state='submitted',progress=${JSON.stringify(next)}::jsonb,
      progress_receipts=${JSON.stringify(receipts)}::jsonb,version=version+1,submission_interaction_id=${interaction.id},
      submitted_request=${JSON.stringify({ templateIndex: next.templateIndex, customId: interaction.data.custom_id })}::jsonb,
      submitted_request_hash=${interaction.requestHash},updated_at=clock_timestamp() WHERE id=${id}::uuid`
    return yield* response({ ...current, state: "submitted" })
  }))
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(failure(cause))))
