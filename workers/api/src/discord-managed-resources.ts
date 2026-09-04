import { DecimalSnowflake } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { Conflict, DatabaseFailure, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"

const Channel = Schema.Struct({ id: DecimalSnowflake, guild_id: DecimalSnowflake, type: Schema.Number })
const Webhook = Schema.Struct({ id: DecimalSnowflake, guild_id: DecimalSnowflake, channel_id: DecimalSnowflake, type: Schema.Number })
const proofBrand: unique symbol = Symbol("Discord creation proof")
interface CreationProof {
  readonly [proofBrand]: true
  readonly id: string
  readonly serverId: string
  readonly type: "channel" | "webhook"
  readonly feature: "server_countdown" | "server_log"
  readonly channelId?: string
}
const decode = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Discord resource response failed schema validation" })))

/** Call inside the same transaction as every attachment/replacement/removal. */
export const lockServerDiscordResources = (serverId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ id: string }>`SELECT id FROM servers WHERE id = ${serverId} FOR UPDATE`
  if (rows.length !== 1) return yield* new NotFound({ message: "Server not found" })
}).pipe(Effect.mapError((cause) => cause instanceof NotFound ? cause : new DatabaseFailure({ cause, message: "Discord resource server lock failed" })))

export const createCountdownChannel = (serverId: string, name: string) => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const channel = yield* decode(Channel, yield* discord.request(`/guilds/${serverId}/channels`, { method: "POST", body: {
    name, type: 2, permission_overwrites: [{ id: serverId, type: 0, allow: "1024", deny: "1048576" }],
  } }))
  if (channel.guild_id !== serverId || channel.type !== 2) return yield* new UpstreamUnavailable({ cause: channel.id, message: "Created countdown channel has unexpected guild or type" })
  return { [proofBrand]: true, id: channel.id, serverId, type: "channel", feature: "server_countdown" } as const satisfies CreationProof
})

export const createLogWebhook = (serverId: string, channelId: string, name: string, avatar?: string) => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const parent = yield* decode(Channel, yield* discord.request(`/channels/${channelId}`))
  if (parent.guild_id !== serverId || ![0, 5, 15].includes(parent.type)) return yield* new Conflict({ message: "Webhook parent no longer belongs to the selected server or channel type" })
  const webhook = yield* decode(Webhook, yield* discord.request(`/channels/${channelId}/webhooks`, { method: "POST", body: { name, ...(avatar === undefined ? {} : { avatar }) } }))
  if (webhook.guild_id !== serverId || webhook.channel_id !== channelId || webhook.type !== 1) return yield* new UpstreamUnavailable({ cause: webhook.id, message: "Created webhook has unexpected guild, channel or type" })
  return { [proofBrand]: true, id: webhook.id, serverId, channelId, type: "webhook", feature: "server_log" } as const satisfies CreationProof
})

/** Only current-operation HTTP-create proof is accepted; reuse must never call this. */
export const recordCreatedDiscordResource = (proof: CreationProof) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO discord_managed_resources (resource_type, resource_id, server_id, creation_feature) VALUES (${proof.type}, ${proof.id}, ${proof.serverId}, ${proof.feature})`
}).pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Discord resource creation provenance could not be saved" })))

const inspect = (type: "channel" | "webhook", id: string, serverId: string, expectedChannelId?: string) => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const raw = yield* discord.request(type === "channel" ? `/channels/${id}` : `/webhooks/${id}`).pipe(Effect.catch((failure) => failure instanceof NotFound ? Effect.succeed(undefined) : Effect.fail(failure)))
  if (raw === undefined) return "missing" as const
  if (type === "channel") {
    const channel = yield* decode(Channel, raw)
    return channel.id === id && channel.guild_id === serverId && channel.type === 2 ? "owned" as const : "foreign" as const
  }
  const hook = yield* decode(Webhook, raw)
  if (hook.id !== id || hook.guild_id !== serverId || hook.type !== 1 || expectedChannelId !== undefined && hook.channel_id !== expectedChannelId) return "foreign" as const
  const parent = yield* decode(Channel, yield* discord.request(`/channels/${hook.channel_id}`))
  return parent.guild_id === serverId && [0, 5, 15].includes(parent.type) ? "owned" as const : "foreign" as const
})

/** A failed COMMIT acknowledgement is not rollback proof; preserve for reconciliation. */
export const compensateCreatedDiscordResource = (proof: CreationProof) =>
  Effect.logWarning("Discord resource preserved after uncertain database outcome; reconciliation required", {
    resourceType: proof.type, resourceId: proof.id, serverId: proof.serverId,
  })

// PostgreSQL renders escaped Unicode JSON strings decoded in jsonb output. A
// substring hit is deliberately conservative (even an opaque URL preserves it).
// These are the canonical configuration-bearing tables from schema 001–012.
const referenceTables = ["server_countdowns", "server_logs", "autoboards", "rosters", "reminders", "server_welcome_panels", "servers", "giveaways", "bases", "roster_automation_rules", "ticket_panel", "ticket_panel_buttons", "ticket_panels", "tickets", "server_custom_embeds"] as const
const hasReferences = (id: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const table of referenceTables) {
    const rows = yield* sql.unsafe<{ used: boolean }>(`SELECT EXISTS(SELECT 1 FROM ${table} AS config WHERE strpos(to_jsonb(config)::text, $1) > 0) AS used`, [id])
    if (rows[0]?.used !== false) return true
  }
  return false
})

export interface DiscordCleanupRequirement {
  readonly serverId: string
  readonly id: string
  readonly type: "channel" | "webhook"
  /** Must be true only after every configuration writer uses the server lock. */
  readonly writersSerialized: boolean
}

/** Existing/unproven resources are preserved; caller keeps the server lock held. */
export const cleanupManagedDiscordResource = (input: DiscordCleanupRequirement): Effect.Effect<"deleted" | "preserved", ApiFailure, SqlClient.SqlClient | DiscordApi> => Effect.gen(function* () {
  if (!input.writersSerialized) return "preserved" as const
  const sql = yield* SqlClient.SqlClient
  const feature = input.type === "channel" ? "server_countdown" : "server_log"
  const ledger = yield* sql<{ resource_id: string }>`SELECT resource_id FROM discord_managed_resources WHERE resource_type = ${input.type} AND resource_id = ${input.id} AND server_id = ${input.serverId} AND creation_feature = ${feature} FOR UPDATE`
  if (ledger.length !== 1 || (yield* hasReferences(input.id))) return "preserved" as const
  const state = yield* inspect(input.type, input.id, input.serverId)
  if (state === "foreign") return "preserved" as const
  if (state === "owned") {
    const discord = yield* DiscordApi
    yield* discord.request(input.type === "channel" ? `/channels/${input.id}` : `/webhooks/${input.id}`, { method: "DELETE" }).pipe(Effect.catch((failure) => failure instanceof NotFound ? Effect.succeed(undefined) : Effect.fail(failure)))
  }
  yield* sql`DELETE FROM discord_managed_resources WHERE resource_type = ${input.type} AND resource_id = ${input.id} AND server_id = ${input.serverId} AND creation_feature = ${feature}`
  return "deleted" as const
}).pipe(Effect.mapError((cause) => cause instanceof Conflict || cause instanceof DatabaseFailure || cause instanceof NotFound || cause instanceof UpstreamUnavailable || typeof cause === "object" && cause !== null && "_tag" in cause && ["Forbidden", "InvalidRequest", "RateLimited"].includes(String(cause._tag)) ? cause as ApiFailure : new DatabaseFailure({ cause, message: "Managed Discord resource cleanup failed" })))
