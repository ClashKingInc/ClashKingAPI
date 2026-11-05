import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { DiscordApi } from "./discord-api.js"
import { DatabaseFailure, Forbidden } from "./errors.js"
import { requireFreshInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"
import { loadTicketPanelSource } from "./ticket-panel-source.js"
import { requireTicketChannel } from "./ticket-category.js"

// A click has its own receipt: application forms and account linking may never
// finish, and those failures must not roll back the initial click log.
export const enqueueTicketButtonClick = (interaction: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    const prior = (yield* sql<{id:string;request_hash:string;panel_id:string}>`SELECT id::text,request_hash,panel_id::text
      FROM ticket_button_click_logs WHERE interaction_id=${interaction.id}`)[0]
    if (prior) {
      if (prior.request_hash !== interaction.requestHash) return yield* new Forbidden({message:"Interaction replay differs",reason:"wrong_message"})
      return {id:prior.id,panelId:prior.panel_id}
    }
    yield* requireFreshInteraction(interaction)
    const menu = interaction.data.component_type === 3
    const selected = menu && interaction.data.values?.length === 1 ? interaction.data.values[0] : interaction.data.custom_id
    const match = /^ck:ticket:open:([0-9a-f-]{36}):([0-9a-f-]{36})$/iu.exec(selected ?? "")
    if (interaction.type !== 3 || ![2,3].includes(interaction.data.component_type ?? 0) || !interaction.messageId || !match) {
      return yield* new Forbidden({message:"A canonical ticket panel button is required",reason:"wrong_message"})
    }
    const panel = yield* loadTicketPanelSource({guildId:interaction.guildId,channelId:interaction.channelId,
      messageId:interaction.messageId,panelId:match[1]!,buttonId:match[2]!,...(menu ? {menuId:interaction.data.custom_id} : {})})
    const data = panel.data as Record<string,unknown>
    const channel = data.ticket_button_click_log
    if (typeof channel !== "string" || !/^[1-9][0-9]{0,19}$/u.test(channel)) return undefined
    const button = Array.isArray(panel.components) ? panel.components.find(value =>
      typeof value === "object" && value !== null && "id" in value && value.id === panel.buttonId) : undefined
    const label = typeof button === "object" && button !== null && "label" in button && typeof button.label === "string"
      ? button.label : "Ticket"
    const cleanLabel = (value:string) => value.replaceAll(/[*_`~<>]/gu, "").replaceAll(/[\r\n]/gu, " ").slice(0,100)
    const content = `🖱️ <@${interaction.actorId}> clicked the **${cleanLabel(label)}** button on the **${cleanLabel(panel.name)}** panel.`
    const row = (yield* sql<{id:string;panel_id:string;request_hash:string}>`INSERT INTO ticket_button_click_logs
      (interaction_id,request_hash,server_id,panel_id,channel_id,content)
      VALUES(${interaction.id},${interaction.requestHash},${interaction.guildId},${match[1]!}::uuid,${channel},${content})
      ON CONFLICT(interaction_id) DO UPDATE SET interaction_id=EXCLUDED.interaction_id
      RETURNING id::text,panel_id::text,request_hash`)[0]!
    if (row.request_hash !== interaction.requestHash) return yield* new Forbidden({message:"Interaction replay differs",reason:"wrong_message"})
    return {id:row.id,panelId:row.panel_id}
  }))
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Ticket click log storage is unavailable"}))))

export const runTicketButtonClickLog = (id:string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, discord = yield* DiscordApi
  // Serialize delivery and reconcile a lost response by its original nonce.
  return yield* sql.withTransaction(Effect.gen(function* () {
    const row = (yield* sql<{interaction_id:string;server_id:string;channel_id:string;content:string;state:string}>`
      SELECT interaction_id,server_id,channel_id,content,state FROM ticket_button_click_logs WHERE id=${id}::uuid FOR UPDATE`)[0]
    if (!row || row.state !== "pending") return true
    const sent = yield* Effect.gen(function* () {
      yield* requireTicketChannel(row.server_id,row.channel_id)
      const history = yield* discord.request(`/channels/${row.channel_id}/messages?limit=100`)
      const prior = Array.isArray(history) && history.some(message=> typeof message === "object" && message !== null && "nonce" in message && String(message.nonce) === row.interaction_id)
      if (!prior) yield* discord.request(`/channels/${row.channel_id}/messages`,{method:"POST",body:{content:row.content,
        nonce:row.interaction_id,enforce_nonce:true,allowed_mentions:{parse:[]}}})
      return "sent" as const
    }).pipe(Effect.catch(error=>error._tag === "Forbidden" || error._tag === "NotFound" ? Effect.succeed("failed" as const) : Effect.fail(error)))
    yield* sql`UPDATE ticket_button_click_logs SET state=${sent},updated_at=clock_timestamp() WHERE id=${id}::uuid`
    return true
  }))
})
