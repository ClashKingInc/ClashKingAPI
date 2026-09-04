import { TicketLinkRequiredResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Conflict, DatabaseFailure } from "./errors.js"
import type { VerifiedRuntimeInteraction } from "./runtime-interaction.js"

interface Preparation {
  readonly id: string; readonly interaction_id: string; readonly request_hash: string; readonly action: string;
  readonly actor_user_id: string; readonly server_id: string; readonly channel_id: string; readonly origin_message_id: string;
  readonly panel_id: string; readonly button_id: string | null; readonly expires_at: string;
}
const response = (row: Preparation) => Schema.decodeUnknownEffect(TicketLinkRequiredResponse)({
  outcome:"link_required",preparationId:row.id,expiresAt:new Date(row.expires_at).toISOString(),
  content:"Link an account first. Once you are done, open a ticket again.",
  link:{customId:`ck:ticket:link:${row.id}`,label:"Link an account"},
}).pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Stored ticket linking preparation is invalid"})))

/** Caller holds the canonical panel row transaction lock. Exact replay
 * returns the immutable preparation even after expiry; using its form still
 * requires current source scope, a fresh signed interaction and an unexpired row.
 */
export const replayTicketLinkPreparation = (interaction: VerifiedRuntimeInteraction, panelId: string, buttonId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql<Preparation>`SELECT id::text,interaction_id,request_hash,action,actor_user_id,server_id,channel_id,
    origin_message_id,panel_id::text,button_id::text,expires_at::text FROM ticket_account_preparations WHERE interaction_id=${interaction.id}`)[0]
  if (row === undefined) return undefined
  if (row.action !== "link" || row.actor_user_id !== interaction.actorId || row.server_id !== interaction.guildId
    || row.channel_id !== interaction.channelId || row.origin_message_id !== interaction.messageId || row.panel_id !== panelId
    || row.button_id !== buttonId || row.request_hash !== interaction.requestHash) {
    return yield* new Conflict({message:"Ticket opening interaction identity was reused"})
  }
  return yield* response(row)
})

/** No ticket, operation, account mutation or role effect is created here. */
export const prepareTicketLink = (interaction: VerifiedRuntimeInteraction, panel: {
  readonly id: string; readonly buttonId: string; readonly updated_at: string;
}) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql<Preparation>`INSERT INTO ticket_account_preparations
    (id,interaction_id,request_hash,action,actor_user_id,server_id,channel_id,origin_message_id,panel_id,button_id,source_updated_at,context)
    VALUES (${crypto.randomUUID()}::uuid,${interaction.id},${interaction.requestHash},'link',${interaction.actorId},${interaction.guildId},
      ${interaction.channelId},${interaction.messageId!},${panel.id}::uuid,${panel.buttonId}::uuid,${panel.updated_at}::timestamptz,'{}'::jsonb)
    RETURNING id::text,interaction_id,request_hash,action,actor_user_id,server_id,channel_id,origin_message_id,panel_id::text,button_id::text,expires_at::text`)[0]
  if (row === undefined) return yield* new DatabaseFailure({cause:undefined,message:"Ticket linking preparation was not saved"})
  return yield* response(row)
})
