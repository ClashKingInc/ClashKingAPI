import { dashboardEndpoints, DecimalSnowflake, type EndpointResponse } from "@clashking/api-contracts"
import { Effect, Option, Schema } from "effect"

import { DiscordApi } from "./discord-api.js"
import type { WorkerBindings } from "./environment.js"
import { UpstreamUnavailable, type ApiFailure } from "./errors.js"

type ProfileBindings = Pick<WorkerBindings, "DISCORD_CLIENT_ID" | "DISCORD_API_ORIGIN"> & {
  readonly API_CACHE: Pick<WorkerBindings["API_CACHE"], "get" | "put">
}

const globalProfileTtlSeconds = 15 * 60
const optionalText = Schema.optionalKey(Schema.NullOr(Schema.String))
const BotUser = Schema.Struct({
  id: DecimalSnowflake, username: Schema.optionalKey(Schema.String), global_name: optionalText,
  avatar: optionalText, banner: optionalText,
})
const BotMember = Schema.Struct({
  nick: optionalText, avatar: optionalText, banner: optionalText, bio: optionalText, user: BotUser,
})
const BotApplication = Schema.Struct({
  name: Schema.String, description: Schema.optionalKey(Schema.String), bot: BotUser,
})
const CachedApplication = Schema.Struct({ observedAt: Schema.Number, profile: BotApplication })

// Cache outages must not hold up a valid live profile. This is a per-operation
// wait budget, not a new freshness policy; a late KV write can still complete.
const optionalCache = <A>(operation: Effect.Effect<A, unknown>) => operation.pipe(
  Effect.timeoutOption("250 millis"),
  Effect.map(Option.getOrUndefined),
  Effect.catch(() => Effect.succeed(undefined)),
  Effect.catchDefect(() => Effect.succeed(undefined)),
)

const decodeDiscord = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError((cause) => new UpstreamUnavailable({
    cause, message: "Discord response failed schema validation",
  })))

const globalCacheKey = (bindings: ProfileBindings, botId: string): string | undefined => {
  // Keep application identities and upstream environments isolated even when a
  // development deployment shares a cache namespace. Never put tokens in keys.
  const applicationId = bindings.DISCORD_CLIENT_ID?.trim()
  const origin = bindings.DISCORD_API_ORIGIN?.replace(/\/+$/u, "")
  if (!applicationId || !origin || !bindings.API_CACHE) return undefined
  return `dashboard:bot-global-profile:v1:${encodeURIComponent(origin)}:${encodeURIComponent(applicationId)}:${botId}`
}

const globalProfile = (bindings: ProfileBindings, botId: string) => Effect.gen(function* () {
  const key = globalCacheKey(bindings, botId)
  if (key !== undefined) {
    const cached = yield* optionalCache(Effect.tryPromise(() => bindings.API_CACHE.get(key, "json")).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(CachedApplication)),
    ))
    if (cached !== undefined) {
      const age = Date.now() - cached.observedAt
      // Check age in addition to the KV expiry: an old replica, corrupt value,
      // or changed storage settings must not extend the legacy 15-minute limit.
      if (cached.profile.bot.id === botId && Number.isSafeInteger(cached.observedAt)
          && age >= 0 && age < globalProfileTtlSeconds * 1_000) {
        return cached.profile
      }
    }
  }
  const discord = yield* DiscordApi
  const profile = yield* decodeDiscord(BotApplication, yield* discord.request("/oauth2/applications/@me"))
  // A rotated or mismatched bot credential must never combine another bot's
  // inherited fields with the live guild member's identity or image URL paths.
  if (profile.bot.id !== botId) {
    return yield* new UpstreamUnavailable({
      cause: new Error("Discord application bot does not match the current guild member"),
      message: "Discord bot profile identity mismatch",
    })
  }
  if (key !== undefined) {
    yield* optionalCache(Effect.tryPromise(() => bindings.API_CACHE.put(key, JSON.stringify({
      observedAt: Date.now(), profile,
    }), { expirationTtl: globalProfileTtlSeconds })))
  }
  return profile
})

/**
 * Read and render the profile using the same current-member response as Go.
 * Generic member GET/cache entries omit per-guild bio/banner profile fields.
 *
 * Only the read-only global fallback uses KV (the legacy 15-minute lifetime).
 * The Go adapter's five-minute mutable guild cache is deliberately not copied:
 * KV is eventually consistent, so even a completed cache write/invalidation can
 * show the old profile on the next GET. Guild reads stay live, and edits return
 * Discord's PATCH response directly. A future guild cache needs a consistent
 * owner; do not replace this with module-level state or the generic member cache.
 */
export const discordBotProfile = (
  bindings: ProfileBindings,
  serverId: string,
  payload: Readonly<Record<string, unknown>>,
): Effect.Effect<EndpointResponse<typeof dashboardEndpoints.botGuildProfile>, ApiFailure, DiscordApi> => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const member = yield* decodeDiscord(BotMember, yield* discord.request(`/guilds/${serverId}/members/@me`, {
    method: "PATCH", body: payload,
  }))
  const nick = member.nick?.trim() ? member.nick : null
  const bio = member.bio?.trim() ? member.bio : null
  const avatarInherited = member.avatar === null || member.avatar === undefined
  const bannerInherited = member.banner === null || member.banner === undefined
  const global = nick !== null && bio !== null && !avatarInherited && !bannerInherited
    ? undefined : yield* globalProfile(bindings, member.user.id)
  const userId = member.user.id
  const avatar = member.avatar ?? global?.bot.avatar
  const banner = member.banner ?? global?.bot.banner
  const inheritedName = global?.bot.global_name?.trim() ? global.bot.global_name : global?.bot.username || global?.name || ""
  return {
    name: nick ?? inheritedName,
    avatar_url: avatar === null || avatar === undefined ? null
      : `https://cdn.discordapp.com/${avatarInherited ? `avatars/${userId}` : `guilds/${serverId}/users/${userId}/avatars`}/${avatar}.png?size=512`,
    banner_url: banner === null || banner === undefined ? null
      : `https://cdn.discordapp.com/${bannerInherited ? `banners/${userId}` : `guilds/${serverId}/users/${userId}/banners`}/${banner}.png?size=1024`,
    bio: bio ?? global?.description ?? "",
    name_inherited: nick === null,
    avatar_inherited: avatarInherited,
    banner_inherited: bannerInherited,
    bio_inherited: bio === null,
  }
})
