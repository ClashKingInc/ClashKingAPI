import { DecimalSnowflake } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { DiscordApi } from "./discord-api.js"
import { InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"

const DestinationChannel = Schema.Struct({ id: DecimalSnowflake, type: Schema.Number, guild_id: Schema.optionalKey(DecimalSnowflake), parent_id: Schema.optionalKey(Schema.NullOr(DecimalSnowflake)) })
const invalid = (field: string, message: string) => new InvalidRequest({ message: "Invalid Discord destination", details: [{ field, message }] })

export const discordDestinationId = (value: unknown, field: string) =>
  typeof value === "string" && /^[1-9]\d*$/u.test(value)
    ? Effect.succeed(value)
    : Effect.fail(invalid(field, "must be a valid Discord snowflake"))

/** Shared by logs, reminders and autoboards; IDs remain decimal strings throughout. */
export const validateDiscordDestination = (serverId: string, channelId: string, threadId: string | null) => Effect.gen(function* () {
  yield* discordDestinationId(channelId, "channel_id")
  if (threadId !== null) yield* discordDestinationId(threadId, "thread_id")
  const discord = yield* DiscordApi
  const getChannel = (id: string, field: string) => discord.request(`/channels/${id}`).pipe(
    Effect.catch((error) => error instanceof NotFound ? Effect.fail(invalid(field, "Discord channel was not found")) : Effect.fail(error)),
    Effect.flatMap((value) => Schema.decodeUnknownEffect(DestinationChannel)(value).pipe(
      Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Discord channel response failed schema validation" })),
    )),
  )
  const parent = yield* getChannel(channelId, "channel_id")
  if (parent.guild_id !== serverId) return yield* invalid("channel_id", "must belong to the requested server")
  if (![0, 5, 15].includes(parent.type)) return yield* invalid("channel_id", "must be a text, announcement, or forum channel")
  if (threadId === null) {
    if (parent.type === 15) return yield* invalid("thread_id", "is required when channel_id is a forum channel")
    return
  }
  const thread = yield* getChannel(threadId, "thread_id")
  if (![10, 11, 12].includes(thread.type)) return yield* invalid("thread_id", "must identify a Discord thread or forum post")
  if (thread.guild_id !== serverId) return yield* invalid("thread_id", "must belong to the requested server")
  if (thread.parent_id !== parent.id) return yield* invalid("thread_id", "must belong to channel_id")
})
