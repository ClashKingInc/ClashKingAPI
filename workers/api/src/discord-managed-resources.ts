import { DecimalSnowflake } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { Conflict, DatabaseFailure, NotFound, UpstreamUnavailable } from "./errors.js"

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

/** Serialize configuration writers for one server inside their SQL transaction. */
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

/** A failed COMMIT acknowledgement is not rollback proof; preserve for reconciliation. */
export const compensateCreatedDiscordResource = (proof: CreationProof) =>
  Effect.logWarning("Discord resource preserved after uncertain database outcome; reconciliation required", {
    resourceType: proof.type, resourceId: proof.id, serverId: proof.serverId,
  })
