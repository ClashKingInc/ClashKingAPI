import { RuntimeUUID, TicketButtonSettings } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound } from "./errors.js"

interface PanelRow {
  readonly id: string; readonly server_id: string; readonly name: string; readonly components: unknown; readonly data: unknown;
  readonly updated_at: string; readonly publication_channel_id: string; readonly publication_message_id: string;
}
const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
  ? value as Record<string, unknown> : {}

/** Scope must come from a verified opening proof or its actor-bound committed
 * preparation, never identities submitted independently by the caller. */
export const loadTicketPanelSource = (source: {
  readonly guildId: string; readonly channelId: string; readonly messageId: string | undefined;
  readonly panelId: string; readonly buttonId: string;
}) => Effect.gen(function* () {
  const parseId = (id: string) => Schema.decodeUnknownEffect(RuntimeUUID)(id).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid ticket panel or button ID" })))
  const panelId = yield* parseId(source.panelId), buttonId = yield* parseId(source.buttonId), sql = yield* SqlClient.SqlClient
  const panel = (yield* sql<PanelRow>`SELECT p.id::text,p.server_id,p.name,p.components,p.data,p.updated_at::text,
    publication.channel_id AS publication_channel_id,publication.message_id AS publication_message_id
    FROM ticket_panels p JOIN ticket_panel_publications publication ON publication.panel_id=p.id AND publication.server_id=p.server_id
      AND publication.state='active' AND publication.source_updated_at=p.updated_at
    WHERE p.id=${panelId}::uuid AND p.server_id=${source.guildId} AND p.archived_at IS NULL
      AND publication.channel_id=${source.channelId} AND publication.message_id=${source.messageId ?? null}`)[0]
  if (!panel) return yield* new Forbidden({ message: "Ticket interaction does not belong to the active panel publication", reason: "wrong_message" })
  const customId = `ck:ticket:open:${panelId}:${buttonId}`
  const components = Array.isArray(panel.components) ? panel.components : []
  if (!components.some(value => object(value).id === buttonId && object(value).custom_id === customId)) {
    return yield* new NotFound({ message: "Ticket button no longer exists" })
  }
  const settings = yield* Schema.decodeUnknownEffect(TicketButtonSettings)(object(panel.data)[`${customId}_settings`]).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Ticket button configuration is invalid" })))
  return { ...panel, buttonId, customId, settings }
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(new DatabaseFailure({ cause, message: "Ticket panel source lookup is unavailable" }))))
