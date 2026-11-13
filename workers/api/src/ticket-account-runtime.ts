import { RuntimeUUID, TicketAccountInteractionEndpoint } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"

import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, NotFound } from "./errors.js"
import { requireFreshInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"
import { prepareTicketOpen } from "./ticket-runtime.js"
import { loadTicketPanelSource } from "./ticket-panel-source.js"
import { requireTicketStaff } from "./ticket-staff-authorization.js"

const uuid = (value: string) => Schema.decodeUnknownEffect(RuntimeUUID)(value).pipe(
  Effect.mapError(() => new InvalidRequest({ message: "Invalid ticket account identifier" })))
const ViewerContext = Schema.Struct({ accounts: Schema.Array(Schema.Struct({
  tag: Schema.String.check(Schema.isPattern(/^#[A-Z0-9]+$/u)),
  name: Schema.String.check(Schema.isMaxLength(100)),
  townHallLevel: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
})).check(Schema.isMinLength(1), Schema.isMaxLength(25)) })
interface TicketRow {
  readonly id: string; readonly panel_id: string; readonly server_id: string; readonly channel_id: string
  readonly applicant_accounts: readonly string[]; readonly updated_at: string
  readonly message_id: string
  readonly staff_thread: boolean
}
interface PreparationRow {
  readonly id: string; readonly interaction_id: string; readonly request_hash: string; readonly action: string
  readonly actor_user_id: string; readonly server_id: string; readonly channel_id: string
  readonly origin_message_id: string; readonly ticket_id: string | null; readonly panel_id: string
  readonly button_id: string | null
  readonly source_updated_at: string; readonly expires_at: Date | string; readonly context: unknown
}
interface ReceiptRow { readonly preparation_id: string; readonly request_hash: string; readonly result: unknown }

export const parseTicketAccountAction = (interaction: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  const customId = interaction.data.custom_id ?? ""
  const prepare = /^ck:ticket:accounts-view:([0-9a-f-]{36})$/u.exec(customId)
  if (prepare && interaction.type === 3 && interaction.data.component_type === 2 && interaction.messageId !== undefined) {
    return { kind: "prepare" as const, ticketId: yield* uuid(prepare[1]!) }
  }
  const select = /^ck:ticket:account-view:([0-9a-f-]{36})$/u.exec(customId)
  if (select && interaction.type === 3 && interaction.data.component_type === 3 && interaction.data.values?.length === 1) {
    return { kind: "select" as const, sessionId: yield* uuid(select[1]!), tag: interaction.data.values[0]! }
  }
  return yield* new Forbidden({ message: "A canonical ticket account control is required", reason: "wrong_message" })
})

const ticket = (ticketId: string, interaction: VerifiedRuntimeInteraction, locked = true) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<TicketRow>`SELECT t.id::text,t.panel_id::text,t.server_id,t.channel_id,t.applicant_accounts,p.updated_at::text,
    message.result->>'id' AS message_id,COALESCE(t.thread_id=${interaction.channelId},false) AS staff_thread FROM tickets t
    JOIN ticket_panels p ON p.id=t.panel_id AND p.server_id=t.server_id
    JOIN ticket_runtime_operations opening ON opening.ticket_id=t.id AND opening.server_id=t.server_id
      AND opening.action='open' AND opening.state='completed'
    JOIN ticket_runtime_effects message ON message.operation_id=opening.id
      AND message.effect_key=CASE WHEN t.thread_id=${interaction.channelId} THEN 'thread-application:0' ELSE 'application:0' END
      AND message.state='succeeded' AND message.result->>'channelId'=${interaction.channelId}
    WHERE t.id=${ticketId}::uuid AND t.server_id=${interaction.guildId}
      AND (t.channel_id=${interaction.channelId} OR t.thread_id=${interaction.channelId})
      AND t.status <> 'delete' ${locked ? sql`FOR SHARE OF t,p` : sql``}`
  if (rows.length !== 1 || !rows[0]?.message_id) return yield* new NotFound({ message: "Ticket account viewer is not available in this channel" })
  return rows[0]
})
const preparationColumns = "id::text,interaction_id,request_hash,action,actor_user_id,server_id,channel_id,origin_message_id,ticket_id::text,panel_id::text,button_id::text,source_updated_at::text,expires_at,context"
const context = (row: PreparationRow) => Schema.decodeUnknownEffect(ViewerContext)(row.context).pipe(
  Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Stored ticket account viewer is invalid" })))
const identity = (row: PreparationRow, interaction: VerifiedRuntimeInteraction) => {
  if (row.action !== "view" || row.ticket_id === null || row.actor_user_id !== interaction.actorId || row.server_id !== interaction.guildId || row.channel_id !== interaction.channelId) {
    return Effect.fail(new Forbidden({ message: "Ticket account viewer belongs to another interaction", reason: "wrong_message" }))
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) return Effect.fail(new Forbidden({ message: "Ticket account viewer has expired" }))
  return Effect.void
}
const currentScope = (row: PreparationRow, current: TicketRow) => {
  if (row.ticket_id !== current.id || row.panel_id !== current.panel_id || row.origin_message_id !== current.message_id
    || row.source_updated_at !== current.updated_at) {
    return Effect.fail(new Forbidden({ message: "Ticket account viewer source has changed", reason: "wrong_message" }))
  }
  return Effect.void
}
const currentAccountList = (row: PreparationRow, current: TicketRow) => Effect.gen(function* () {
  const stored = yield* context(row)
  if (stored.accounts.some((account) => !current.applicant_accounts.includes(account.tag))) {
    return yield* new Forbidden({ message: "Ticket applicant accounts have changed" })
  }
  return accountList(row, stored)
})
const accountList = (row: PreparationRow, stored: typeof ViewerContext.Type) => stored.accounts.length === 1
  ? accountSummary(row.ticket_id!, row.id, stored.accounts[0]!) : ({
  outcome: "accounts" as const, ticketId: row.ticket_id!, sessionId: row.id, expiresAt: new Date(row.expires_at).toISOString(),
  content: "Select an account from this ticket.", accounts: stored.accounts,
  select: { customId: `ck:ticket:account-view:${row.id}`, placeholder: "Select an account",
    options: stored.accounts.map((account) => ({ label: `${account.name} (${account.tag})`.slice(0, 100), value: account.tag })),
    minValues: 1 as const, maxValues: 1 as const },
})
const safeName = (name: string) => name.replaceAll(/([\\`*_{}[\]()<>~|])/gu, "\\$1").replaceAll("@", "@\u200b")
const accountSummary = (ticketId: string, sessionId: string, account: typeof ViewerContext.Type["accounts"][number]) => ({
  outcome: "account" as const, ticketId, sessionId, account,
  content: `**${safeName(account.name)}**\n${account.tag}\n${account.townHallLevel > 0 ? `Town Hall ${account.townHallLevel}` : "Town Hall unavailable"}`,
})

/** The HTTP boundary must verify the Discord proof before calling this function. */
export const ticketAccountInteraction = (interaction: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  const action = yield* parseTicketAccountAction(interaction)
  yield* requireFreshInteraction(interaction)
  const sql = yield* SqlClient.SqlClient
  // Staff authorization may resolve guild ownership over Discord. Keep that
  // provider call outside the transaction, then fence the canonical source
  // again under the ticket/panel locks before saving or replaying a viewer.
  const authorized = yield* Effect.gen(function* () {
    const prepared = action.kind === "select"
      ? (yield* sql.unsafe<PreparationRow>(`SELECT ${preparationColumns} FROM ticket_account_preparations WHERE id=$1::uuid`, [action.sessionId]))[0]
      : undefined
    if (action.kind === "select") {
      if (!prepared) return yield* new NotFound({ message: "Ticket account viewer session not found" })
      yield* identity(prepared, interaction)
    }
    const current = yield* ticket(action.kind === "prepare" ? action.ticketId : prepared!.ticket_id!, interaction, false)
    if (current.staff_thread) yield* requireTicketStaff(interaction, current.panel_id, current.id)
    return current
  })
  const checkAuthorizedSource = (current: TicketRow) => authorized !== undefined
    && current.id === authorized.id && current.panel_id === authorized.panel_id
    && current.updated_at === authorized.updated_at && current.message_id === authorized.message_id
    && current.staff_thread === authorized.staff_thread
    ? Effect.void : Effect.fail(new Forbidden({ message: "Ticket account viewer source has changed", reason: "wrong_message" }))
  return yield* sql.withTransaction(Effect.gen(function* () {
    if (action.kind === "prepare") {
      const current = yield* ticket(action.ticketId, interaction)
      yield* checkAuthorizedSource(current)
      if (interaction.messageId !== current.message_id) return yield* new Forbidden({ message: "Ticket account control does not belong to the canonical application message", reason: "wrong_message" })
      const previous = (yield* sql.unsafe<PreparationRow>(`SELECT ${preparationColumns} FROM ticket_account_preparations WHERE interaction_id=$1`, [interaction.id]))[0]
      if (previous !== undefined) {
        yield* identity(previous, interaction)
        yield* currentScope(previous, current)
        if (previous.request_hash !== interaction.requestHash) return yield* new Conflict({ message: "Ticket viewer interaction identity was reused" })
        return yield* currentAccountList(previous, current)
      }
      const rows = yield* sql<{ tag: string; name: string | null; townhall_level: number | null }>`SELECT selected.tag,player.name,player.townhall_level
        FROM unnest(${current.applicant_accounts}::text[]) WITH ORDINALITY AS selected(tag,position)
        LEFT JOIN basic_player player ON player.tag=selected.tag ORDER BY selected.position LIMIT 25`
      if (rows.length === 0) return yield* new NotFound({ message: "This ticket has no applicant accounts" })
      const stored = yield* Schema.decodeUnknownEffect(ViewerContext)({ accounts: rows.map((row) => ({
        tag: row.tag, name: (row.name ?? row.tag).slice(0,100), townHallLevel: row.townhall_level ?? 0,
      })) }).pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Ticket applicant account data is invalid" })))
      const id = crypto.randomUUID()
      const saved = (yield* sql<PreparationRow>`INSERT INTO ticket_account_preparations
        (id,interaction_id,request_hash,action,actor_user_id,server_id,channel_id,origin_message_id,ticket_id,panel_id,source_updated_at,context,expires_at)
        VALUES (${id}::uuid,${interaction.id},${interaction.requestHash},'view',${interaction.actorId},${interaction.guildId},${interaction.channelId},
          ${current.message_id},${current.id}::uuid,${current.panel_id}::uuid,${current.updated_at}::timestamptz,${JSON.stringify(stored)}::jsonb,now()+interval '5 minutes')
        ON CONFLICT (interaction_id) DO NOTHING RETURNING id::text,interaction_id,request_hash,action,actor_user_id,server_id,channel_id,
          origin_message_id,ticket_id::text,panel_id::text,button_id::text,source_updated_at::text,expires_at,context`)[0]
      const actual = saved ?? (yield* sql.unsafe<PreparationRow>(`SELECT ${preparationColumns} FROM ticket_account_preparations WHERE interaction_id=$1`, [interaction.id]))[0]
      if (actual === undefined) return yield* Effect.die(new Error("Ticket viewer preparation was not saved"))
      yield* identity(actual, interaction)
      yield* currentScope(actual, current)
      if (actual.request_hash !== interaction.requestHash) return yield* new Conflict({ message: "Ticket viewer interaction identity was reused" })
      return yield* currentAccountList(actual, current)
    }
    const prepared = (yield* sql.unsafe<PreparationRow>(`SELECT ${preparationColumns} FROM ticket_account_preparations WHERE id=$1::uuid FOR UPDATE`, [action.sessionId]))[0]
    if (prepared === undefined) return yield* new NotFound({ message: "Ticket account viewer session not found" })
    yield* identity(prepared, interaction)
    const current = yield* ticket(prepared.ticket_id!, interaction)
    yield* checkAuthorizedSource(current)
    yield* currentScope(prepared, current)
    const stored = yield* context(prepared)
    const account = stored.accounts.find((item) => item.tag === action.tag)
    if (account === undefined || !current.applicant_accounts.includes(action.tag)) return yield* new Forbidden({ message: "Selected account does not belong to this ticket viewer" })
    const result = accountSummary(current.id, prepared.id, account)
    const receipt = (yield* sql<ReceiptRow>`SELECT preparation_id::text,request_hash,result FROM ticket_account_receipts WHERE interaction_id=${interaction.id}`)[0]
    if (receipt !== undefined) {
      if (receipt.preparation_id !== prepared.id || receipt.request_hash !== interaction.requestHash) return yield* new Conflict({ message: "Ticket viewer selection identity was reused" })
      // The session snapshot is immutable; recomputing avoids decoding an
      // untrusted transport shape from the stored receipt before schema encode.
      return result
    }
    const saved = yield* sql`INSERT INTO ticket_account_receipts (interaction_id,preparation_id,request_hash,result)
      VALUES (${interaction.id},${prepared.id}::uuid,${interaction.requestHash},${JSON.stringify(result)}::jsonb)
      ON CONFLICT (interaction_id) DO NOTHING RETURNING interaction_id`
    if (saved.length === 0) {
      const concurrent = (yield* sql<ReceiptRow>`SELECT preparation_id::text,request_hash,result FROM ticket_account_receipts WHERE interaction_id=${interaction.id}`)[0]
      if (concurrent?.preparation_id !== prepared.id || concurrent.request_hash !== interaction.requestHash) {
        return yield* new Conflict({ message: "Ticket viewer selection identity was reused" })
      }
    }
    return result
  }))
}).pipe(
  Effect.flatMap((result) => Schema.decodeUnknownEffect(TicketAccountInteractionEndpoint.response)(result).pipe(
    Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Ticket account response failed contract validation" })))),
  Effect.catchTag("SqlError", (cause) => Effect.fail(new DatabaseFailure({ cause, message: "Ticket account runtime database operation failed" }))),
)

/** A fresh signed click may resume only its actor's unexpired preparation.
 * Resolve the original publication server-side; never accept client-supplied
 * panel, applicant or channel identities from the linking modal.
 */
export const resumeTicketAfterLink = (interaction: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  yield* requireFreshInteraction(interaction)
  const match = /^ck:ticket:resume:([0-9a-f-]{36})$/u.exec(interaction.data.custom_id ?? "")
  if (interaction.type !== 3 || interaction.data.component_type !== 2 || !match) return yield* new Forbidden({ message: "Invalid ticket continuation", reason: "wrong_message" })
  const sql = yield* SqlClient.SqlClient
  const prepared = (yield* sql.unsafe<PreparationRow>(`SELECT ${preparationColumns} FROM ticket_account_preparations WHERE id=$1::uuid`, [yield* uuid(match[1]!)]))[0]
  if (!prepared || prepared.action !== "link" || !prepared.button_id || prepared.actor_user_id !== interaction.actorId || prepared.server_id !== interaction.guildId || prepared.channel_id !== interaction.channelId) return yield* new Forbidden({ message: "This ticket continuation belongs to another user or server", reason: "wrong_message" })
  if (new Date(prepared.expires_at).getTime() <= Date.now()) return yield* new Conflict({ message: "Ticket continuation expired. Click the ticket panel again." })
  const savedContext = prepared.context !== null && typeof prepared.context === "object" ? prepared.context as { menuId?: unknown } : {}
  const menuId = typeof savedContext.menuId === "string" ? savedContext.menuId : undefined
  const source = yield* loadTicketPanelSource({ guildId: prepared.server_id, channelId: prepared.channel_id, messageId: prepared.origin_message_id, panelId: prepared.panel_id, buttonId: prepared.button_id, ...(menuId ? { menuId } : {}) })
  if (source.updated_at !== prepared.source_updated_at) return yield* new Conflict({ message: "Ticket settings changed. Click the ticket panel again." })
  return yield* prepareTicketOpen({ ...interaction, messageId: prepared.origin_message_id, data: menuId ? { component_type: 3, custom_id: menuId, values: [source.customId] } : { component_type: 2, custom_id: source.customId } })
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(new DatabaseFailure({ cause, message: "Ticket continuation lookup failed" }))))
