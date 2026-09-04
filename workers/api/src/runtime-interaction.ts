import { DecimalSnowflake, RuntimeInteractionProof } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { Forbidden, InvalidRequest, PayloadTooLarge, Unauthenticated, UpstreamUnavailable } from "./errors.js"

const InteractionMember = Schema.Struct({
  permissions: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^\d{1,32}$/u))),
  roles: Schema.optionalKey(Schema.Array(DecimalSnowflake)),
  user: Schema.Struct({ id: DecimalSnowflake, username: Schema.optionalKey(Schema.String),
    global_name: Schema.optionalKey(Schema.NullOr(Schema.String)) }),
})
const InteractionCommon = {
  id: DecimalSnowflake,
  application_id: DecimalSnowflake,
  guild_id: DecimalSnowflake,
  channel_id: DecimalSnowflake,
  member: InteractionMember,
  message: Schema.optionalKey(Schema.Struct({ id: DecimalSnowflake })),
} as const
const Interaction = Schema.Union([
  Schema.Struct({ ...InteractionCommon,type:Schema.Literal(2),data:Schema.Struct({
    name:Schema.String.check(Schema.isMinLength(1),Schema.isMaxLength(32)),
    options:Schema.optionalKey(Schema.Array(Schema.Unknown)),
  }) }),
  Schema.Struct({ ...InteractionCommon,type:Schema.Literal(3),data:Schema.Struct({
    custom_id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    component_type: Schema.optionalKey(Schema.Number),
    values: Schema.optionalKey(Schema.Array(Schema.String)),
  }) }),
  Schema.Struct({ ...InteractionCommon,type:Schema.Literal(5),data:Schema.Struct({
    custom_id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    components: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  }) }),
])

interface VerifiedInteractionData {
  readonly name?: string
  readonly options?: readonly unknown[]
  readonly custom_id?: string
  readonly component_type?: number
  readonly values?: readonly string[]
  readonly components?: readonly unknown[]
}

export interface VerifiedRuntimeInteraction {
  readonly id: string
  readonly actorId: string
  readonly actorLabel: string
  readonly actorRoleIds: readonly string[]
  readonly guildId: string
  readonly channelId: string
  readonly messageId: string | undefined
  readonly type: 2 | 3 | 5
  readonly data: VerifiedInteractionData
  readonly permissions: string
  readonly requestHash: string
  readonly signedAt: number
}

const hexBytes = (value: string) => Uint8Array.from(value.match(/.{2}/gu) ?? [], (pair) => parseInt(pair, 16))
export const verifyRuntimeInteraction = (
  proof: typeof RuntimeInteractionProof.Type,
  configuration: { readonly DISCORD_PUBLIC_KEY: string; readonly DISCORD_APPLICATION_ID: string },
) => Effect.gen(function* () {
  if (!/^[0-9a-f]{64}$/iu.test(configuration.DISCORD_PUBLIC_KEY) || !/^\d{1,20}$/u.test(configuration.DISCORD_APPLICATION_ID)) {
    return yield* new UpstreamUnavailable({ cause: undefined, message: "Discord interaction verification is not configured" })
  }
  const { rawBody, timestamp, signature } = proof.interaction
  const encoded = new TextEncoder().encode(rawBody)
  if (encoded.byteLength > 1_048_576) return yield* new PayloadTooLarge({ message: "Discord interaction exceeds 1048576 bytes" })
  // Reject lone UTF-16 surrogates: re-encoding must never change signed input.
  if (new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(encoded) !== rawBody) {
    return yield* new InvalidRequest({ message: "Discord interaction must be valid UTF-8" })
  }
  const verified = yield* Effect.tryPromise({
    try: async () => {
      const key = await crypto.subtle.importKey("raw", hexBytes(configuration.DISCORD_PUBLIC_KEY), "Ed25519", false, ["verify"])
      return crypto.subtle.verify("Ed25519", key, hexBytes(signature), new TextEncoder().encode(timestamp + rawBody))
    },
    catch: () => new Unauthenticated({ message: "Invalid Discord interaction signature" }),
  })
  if (!verified) return yield* new Unauthenticated({ message: "Invalid Discord interaction signature" })
  const payload = yield* Effect.try({ try: () => JSON.parse(rawBody) as unknown, catch: () => new InvalidRequest({ message: "Invalid Discord interaction JSON" }) })
  const interaction = yield* Schema.decodeUnknownEffect(Interaction)(payload).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "A guild component or modal interaction is required" })),
  )
  if (interaction.application_id !== configuration.DISCORD_APPLICATION_ID) return yield* new Forbidden({ message: "Discord application mismatch" })
  const requestHash = yield* Effect.promise(async () => [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoded))].map((byte) => byte.toString(16).padStart(2, "0")).join(""))
  return {
    id: interaction.id, actorId: interaction.member.user.id,
    actorLabel: interaction.member.user.global_name ?? interaction.member.user.username ?? interaction.member.user.id,
    actorRoleIds: interaction.member.roles ?? [], guildId: interaction.guild_id,
    channelId: interaction.channel_id, messageId: interaction.message?.id, type: interaction.type,
    data: interaction.data,permissions:interaction.member.permissions ?? "0",requestHash, signedAt: Number(timestamp) * 1000,
  } satisfies VerifiedRuntimeInteraction
})

/** Call only after looking up an exact committed receipt; old proofs cannot start work. */
export const requireFreshInteraction = (interaction: VerifiedRuntimeInteraction, now = Date.now()) =>
  Number.isSafeInteger(interaction.signedAt) && interaction.signedAt <= now + 30_000 && interaction.signedAt >= now - 300_000
    ? Effect.void
    : Effect.fail(new Unauthenticated({ message: "Discord interaction has expired" }))
