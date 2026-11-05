import { TicketButtonSettings, TicketPanelMessage } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DatabaseFailure, Forbidden, InvalidRequest } from "./errors.js"
import { panelInteractiveComponents } from "./ticket-panel-actions.js"
import { requireFreshInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const legacyTicketPanelId = (value: string) => /^.{1,75}_(?:0|\d{10})$/u.test(value)

/** Adopt only the exact button proven by a fresh, signed bot-authored message.
 * Publication proof and source-ID aliases stay inside the existing panel JSON. */
export const adoptLegacyTicketPanel = (interaction: VerifiedRuntimeInteraction, applicationId: string) => Effect.gen(function* () {
  const oldId = interaction.data.custom_id ?? ""
  if (!legacyTicketPanelId(oldId)) return interaction
  yield* requireFreshInteraction(interaction)
  if (interaction.type !== 3 || interaction.data.component_type !== 2 || !interaction.messageId
    || interaction.messageAuthorId !== applicationId || !interaction.messageSnapshot) {
    return yield* new Forbidden({ message: "Legacy ticket adoption requires the original bot-authored button message", reason: "wrong_message" })
  }
  const signedButton = panelInteractiveComponents(interaction.messageSnapshot.components).find(button => button.type === 2 && button.custom_id === oldId && button.disabled !== true)
  if (!signedButton) return yield* new Forbidden({ message: "Legacy button is absent from the signed message", reason: "wrong_message" })
  const snapshot = interaction.messageSnapshot
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    const rows = yield* sql<{id:string;components:unknown;data:unknown}>`SELECT p.id::text,p.components,p.data FROM ticket_panels p
      WHERE p.server_id=${interaction.guildId} AND p.archived_at IS NULL AND (
        p.data->'legacy_button_ids' ? ${oldId} OR EXISTS(SELECT 1 FROM ticket_panel_buttons old
          WHERE old.panel_id=p.id AND old.server_id=p.server_id AND old.custom_id=${oldId}))
      ORDER BY p.id LIMIT 2 FOR UPDATE`
    if (rows.length !== 1) return yield* new Forbidden({ message: "Legacy ticket button has no unambiguous stored panel identity", reason: "wrong_message" })
    const panel = rows[0]!, data = object(panel.data), aliases = { ...object(data.legacy_button_ids) }
    if (typeof aliases[oldId] !== "string") {
      const buttons = yield* sql<{id:string;custom_id:string}>`SELECT id::text,custom_id FROM ticket_panel_buttons WHERE panel_id=${panel.id}::uuid AND server_id=${interaction.guildId}`
      const components = Array.isArray(panel.components) ? panel.components.map(object) : []
      for (const button of buttons) {
        const canonical = components.find(component => component.id === button.id)
        if (canonical && typeof canonical.custom_id === "string") aliases[button.custom_id] = canonical.custom_id
      }
    }
    const canonicalId = aliases[oldId]
    if (typeof canonicalId !== "string" || !canonicalId.startsWith(`ck:ticket:open:${panel.id}:`)) {
      return yield* new Forbidden({ message: "Legacy ticket button cannot be matched to its stored action", reason: "wrong_message" })
    }
    if (object(data.legacy_publications)[`${interaction.channelId}:${interaction.messageId}`] !== undefined) {
      return { ...interaction, data: { ...interaction.data, custom_id: canonicalId } }
    }
    const remap = (value: unknown): unknown => Array.isArray(value) ? value.map(remap) : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.entries(object(value)).map(([key,child]) => [key,key === "custom_id" && typeof child === "string" && aliases[child] ? aliases[child] : remap(child)])) : value
    const message = yield* Schema.decodeUnknownEffect(TicketPanelMessage)({ ...snapshot,
      components: remap(snapshot.components ?? []) }).pipe(Effect.mapError(() => new InvalidRequest({ message: "Legacy panel message cannot be represented safely" })))
    const publications = { ...object(data.legacy_publications), [`${interaction.channelId}:${interaction.messageId}`]: { message } }
    const updated: Record<string,unknown> = { ...data, legacy_button_ids: aliases, legacy_publications: publications, panel_message: data.panel_message ?? message }
    // Normalize nullable Python-era settings through the current public contract.
    const saved = object(updated[`${canonicalId}_settings`])
    const normalized: Record<string,unknown> = { questions:[],mod_role:[],no_ping_mod_role:[],private_thread:false,th_min:0,num_apply:1,naming:"",account_apply:false,player_info:false,apply_clans:[],roles_to_add:[],roles_to_remove:[],townhall_requirements:{},...saved }
    for (const key of ["questions","mod_role","no_ping_mod_role","apply_clans","roles_to_add","roles_to_remove"] as const) {
      const value = normalized[key]
      normalized[key] = value === null ? [] : typeof value === "string" ? [value] : value
      if (key !== "questions" && Array.isArray(normalized[key])) normalized[key] = normalized[key].map(String)
    }
    if (normalized.townhall_requirements === null) normalized.townhall_requirements = {}
    const settings = yield* Schema.decodeUnknownEffect(TicketButtonSettings)(normalized).pipe(Effect.mapError(() => new InvalidRequest({ message: "Legacy ticket settings require review" })))
    updated[`${canonicalId}_settings`] = settings
    yield* sql`UPDATE ticket_panels SET data=${JSON.stringify(updated)}::jsonb,updated_at=clock_timestamp() WHERE id=${panel.id}::uuid`
    return { ...interaction, data: { ...interaction.data, custom_id: canonicalId } }
  }))
}).pipe(Effect.catchTag("SqlError",cause=>Effect.fail(new DatabaseFailure({cause,message:"Legacy ticket adoption failed"}))))
