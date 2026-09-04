import { DecimalSnowflake, RuntimeUUID, TicketMessageEventEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { AuthIdentity } from "./auth.js"
import { DiscordApi } from "./discord-api.js"
import type { WorkerBindings } from "./environment.js"
import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, UpstreamUnavailable } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { wakeTicketOperation } from "./ticket-runtime.js"

type Event = typeof TicketMessageEventEndpoint.body.Type
type Bindings = Pick<WorkerBindings, "DISCORD_TICKET_NOTIFICATIONS_ENABLED" | "DISCORD_MAIN_APPLICATION_ID">
const ignored = { outcome: "ignored" as const }
const Identity = Schema.Struct({ id: DecimalSnowflake })
const Channel = Schema.Struct({ id: DecimalSnowflake, guild_id: DecimalSnowflake, topic: Schema.NullOr(Schema.String) })
const Message = Schema.Struct({ id: DecimalSnowflake, channel_id: DecimalSnowflake,
  author: Schema.Struct({ id: DecimalSnowflake, bot: Schema.optionalKey(Schema.Boolean) }),
  webhook_id: Schema.optionalKey(DecimalSnowflake) })
const decodeProvider = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(() => new UpstreamUnavailable({
    cause: "invalid_discord_identity", message: "Discord ticket notification identity is incomplete" })))
interface Ticket {
  id: string; server_id: string; panel_id: string; channel_id: string; status: string;
  applicant_user_id: string | null; opted_in_user_ids: string[] | null
}
interface Receipt { id: string; action: string; request_hash: string }

/** Accept IDs only. Signed Discord content and attachments never enter this journal. */
export const prepareTicketNotification = (event: Event, bindings: Bindings) => Effect.gen(function* () {
  if (bindings.DISCORD_TICKET_NOTIFICATIONS_ENABLED !== "true") return ignored
  if (!Schema.is(DecimalSnowflake)(bindings.DISCORD_MAIN_APPLICATION_ID)) {
    return yield* new UpstreamUnavailable({ cause: "missing_main_application", message: "Ticket notification application is not configured" })
  }
  if (event.application_id !== bindings.DISCORD_MAIN_APPLICATION_ID) return ignored
  const sql = yield* SqlClient.SqlClient
  const serialized = JSON.stringify({ id: event.id, guild_id: event.guild_id, channel_id: event.channel_id,
    author_id: event.author_id, application_id: event.application_id })
  const hash = yield* Effect.promise(async () => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(serialized))), byte => byte.toString(16).padStart(2, "0")).join(""))
  const replay = (row: Receipt) => row.action === "notify" && row.request_hash === hash
    ? Effect.succeed({ outcome: "accepted" as const, operationId: row.id })
    : Effect.fail(new Conflict({ message: "Ticket message event identity was reused" }))
  const previous = (yield* sql<Receipt>`SELECT id::text,action,request_hash FROM ticket_runtime_operations WHERE interaction_id=${event.id}`)[0]
  if (previous) return yield* replay(previous)
  const discord = yield* DiscordApi
  const application = yield* discord.request("/oauth2/applications/@me").pipe(Effect.flatMap(value => decodeProvider(Identity, value)))
  if (application.id !== bindings.DISCORD_MAIN_APPLICATION_ID) return yield* new Forbidden({ message: "Discord credential belongs to another application" })
  // This lookup proves the configured main bot still belongs to the guild,
  // matching the old dynamic OUR_GUILDS set rather than a privileged allowlist.
  const guild = yield* discord.request(`/guilds/${event.guild_id}`).pipe(Effect.flatMap(value => decodeProvider(Identity, value)))
  if (guild.id !== event.guild_id) return ignored
  const channel = yield* discord.request(`/channels/${event.channel_id}`).pipe(Effect.flatMap(value => decodeProvider(Channel, value)))
  if (channel.id !== event.channel_id || channel.guild_id !== event.guild_id) return ignored
  const topic = /^ClashKing ticket ([0-9a-f-]{36})$/u.exec(channel.topic ?? "")
  if (!topic || !Schema.is(RuntimeUUID)(topic[1])) return ignored
  const message = yield* discord.request(`/channels/${event.channel_id}/messages/${event.id}`).pipe(Effect.flatMap(value => decodeProvider(Message, value)))
  if (message.id !== event.id || message.channel_id !== event.channel_id || message.author.id !== event.author_id
    || message.author.bot === true || message.webhook_id !== undefined) return ignored
  return yield* sql.withTransaction(Effect.gen(function* () {
    const ticket = (yield* sql<Ticket>`SELECT id::text,server_id,panel_id::text,channel_id,status,applicant_user_id,opted_in_user_ids
      FROM tickets WHERE id=${topic[1]!}::uuid AND server_id=${event.guild_id} AND channel_id=${event.channel_id} FOR UPDATE`)[0]
    const raced = (yield* sql<Receipt>`SELECT id::text,action,request_hash FROM ticket_runtime_operations WHERE interaction_id=${event.id}`)[0]
    if (raced) return yield* replay(raced)
    if (!ticket || ticket.status === "delete" || ticket.applicant_user_id !== event.author_id) return ignored
    const users = [...new Set(ticket.opted_in_user_ids ?? [])].filter(id => id !== event.author_id)
    if (users.length === 0) return ignored
    if (users.some(id => !Schema.is(DecimalSnowflake)(id))) return yield* new DatabaseFailure({ cause: "invalid_subscriber", message: "Ticket subscribers are invalid" })
    const operationId = crypto.randomUUID()
    const context = { channelId: ticket.channel_id, previousStatus: ticket.status, action: { action: "notify" } }
    yield* sql`INSERT INTO ticket_runtime_operations(id,interaction_id,action,ticket_id,server_id,actor_user_id,panel_id,
      origin_channel_id,origin_message_id,context,request,request_hash,state,submission_interaction_id,submitted_request,submitted_request_hash)
      VALUES(${operationId}::uuid,${event.id},'notify',${ticket.id}::uuid,${ticket.server_id},${event.author_id},${ticket.panel_id}::uuid,
        ${ticket.channel_id},${event.id},${JSON.stringify(context)}::jsonb,${serialized}::jsonb,${hash},'submitted',${event.id},${serialized}::jsonb,${hash})`
    // Discord allows at most 100 explicit user mentions. Smaller pages also
    // leave ample space under its 2,000-character message limit.
    for (let offset = 0; offset < users.length; offset += 50) {
      const page = users.slice(offset, offset + 50), ordinal = offset / 50 * 2, key = `notify:${offset / 50}`
      const send = { channelId: ticket.channel_id, content: page.map(id => `<@${id}>`).join(" "), userMentions: page,
        nonce: `${event.id}:${offset / 50}` }
      const remove = { channelId: ticket.channel_id, messageEffectKey: key }
      yield* sql`INSERT INTO ticket_runtime_effects(operation_id,effect_key,ordinal,effect_type,request) VALUES
        (${operationId}::uuid,${key},${ordinal},'send_message',${JSON.stringify(send)}::jsonb),
        (${operationId}::uuid,${`${key}:delete`},${ordinal + 1},'delete_message',${JSON.stringify(remove)}::jsonb)`
    }
    return { outcome: "accepted" as const, operationId }
  }))
}).pipe(Effect.catchTag("NotFound", () => Effect.succeed(ignored)),
  Effect.catchTag("SqlError", cause => Effect.fail(new DatabaseFailure({ cause, message: "Ticket notification journal is unavailable" }))))

export const ticketNotificationRoutes = [{ method: "POST", path: "/v2/runtime/tickets/message-events" }] as const
export const dispatchTicketNotifications = (request: Request, bindings: WorkerBindings) => Effect.gen(function* () {
  if (request.method !== "POST" || new URL(request.url).pathname !== TicketMessageEventEndpoint.path) return undefined
  yield* (yield* AuthIdentity).requireBot(request)
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
  }
  const event = yield* readBoundedJson(request, 4096).pipe(Effect.flatMap(value =>
    Schema.decodeUnknownEffect(TicketMessageEventEndpoint.body)(value, { onExcessProperty: "error" })),
    Effect.catchTag("SchemaError", () => Effect.fail(new InvalidRequest({ message: "Invalid ticket message event" }))))
  const result = yield* prepareTicketNotification(event, bindings)
  if (result.outcome === "accepted") {
    const sql = yield* SqlClient.SqlClient
    const row = (yield* sql<{ ticket_id: string }>`SELECT ticket_id::text FROM ticket_runtime_operations WHERE id=${result.operationId}::uuid`)[0]
    if (!row) return yield* new DatabaseFailure({ cause: "missing_notification", message: "Ticket notification operation is unavailable" })
    yield* wakeTicketOperation(bindings, result.operationId, event.guild_id, row.ticket_id)
  }
  return Response.json(result, { headers: { "cache-control": "no-store" } })
})
