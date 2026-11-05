import { TicketButtonSettings } from "@clashking/api-contracts"
import { RuntimeUUID } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound } from "./errors.js"
import { panelInteractiveComponents } from "./ticket-panel-actions.js"

interface PanelRow {
  readonly id: string; readonly server_id: string; readonly name: string; readonly components: unknown; readonly data: unknown;
  readonly published_message: unknown; readonly updated_at: string; readonly publication_channel_id: string; readonly publication_message_id: string;
}
const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown> : {}

/** Scope must come from a verified opening proof or its actor-bound committed
 * preparation, never identities submitted independently by the caller. */
export const loadTicketPanelSource = (source: {
  readonly guildId: string; readonly channelId: string; readonly messageId: string | undefined;
  readonly panelId: string; readonly buttonId: string;
  readonly menuId?: string;
}) => Effect.gen(function* () {
  const parseId = (id: string) => Schema.decodeUnknownEffect(RuntimeUUID)(id).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid ticket panel or button ID" })))
  const panelId = yield* parseId(source.panelId), buttonId = yield* parseId(source.buttonId), sql = yield* SqlClient.SqlClient
  const panel = (yield* sql<PanelRow>`SELECT p.id::text,p.server_id,p.name,p.components,p.data,p.updated_at::text,
    COALESCE(effect.payload->'message',p.data->'legacy_publications'->${`${source.channelId}:${source.messageId ?? ""}`}->'message') AS published_message,
    publication.channel_id AS publication_channel_id,publication.message_id AS publication_message_id
    FROM ticket_panels p LEFT JOIN ticket_panel_publications publication ON publication.panel_id=p.id AND publication.server_id=p.server_id
      AND publication.state='active' AND publication.channel_id=${source.channelId} AND publication.message_id=${source.messageId ?? null}
    LEFT JOIN ticket_panel_publication_effects effect ON effect.effect_id=publication.effect_id
    WHERE p.id=${panelId}::uuid AND p.server_id=${source.guildId} AND p.archived_at IS NULL
      AND (publication.message_id IS NOT NULL OR p.data->'legacy_publications' ? ${`${source.channelId}:${source.messageId ?? ""}`})`)[0]
  if (!panel) return yield* new Forbidden({ message: "Ticket interaction does not belong to the active panel publication", reason: "wrong_message" })
  const customId = `ck:ticket:open:${panelId}:${buttonId}`
  const publishedComponents = object(panel.published_message).components
  if (source.menuId) {
    const menu = panelInteractiveComponents(publishedComponents).find(component => component.type === 3 && component.custom_id === source.menuId)
    if (!menu || !Array.isArray(menu.options) || !menu.options.some(option => object(option).value === customId)) return yield* new Forbidden({ message: "Ticket choice does not belong to this panel menu", reason: "wrong_message" })
  }
  else if (Array.isArray(publishedComponents) && !panelInteractiveComponents(publishedComponents).some(component => component.type === 2 && component.custom_id === customId)) return yield* new Forbidden({ message: "Ticket action is not a button on this panel", reason: "wrong_message" })
  const components = Array.isArray(panel.components) ? panel.components : []
  if (!components.some(value => object(value).id === buttonId && object(value).custom_id === customId)) {
    return yield* new NotFound({ message: "Ticket button no longer exists" })
  }
  const settings = yield* Schema.decodeUnknownEffect(TicketButtonSettings)(object(panel.data)[`${customId}_settings`]).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Ticket button configuration is invalid" })))
  return { ...panel, buttonId, customId, settings }
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(new DatabaseFailure({ cause, message: "Ticket panel source lookup is unavailable" }))))
