import { Effect, Schema } from "effect"
import { DiscordApi } from "./discord-api.js"

const User = Schema.Struct({
  id: Schema.String,
  username: Schema.String,
  global_name: Schema.optionalKey(Schema.NullOr(Schema.String)),
  avatar: Schema.optionalKey(Schema.NullOr(Schema.String)),
  discriminator: Schema.optionalKey(Schema.String),
})
type Actor = { added_by_username: string; added_by_avatar_url: string }
const profiles = new Map<string, { expires: number; actor?: Actor }>()

/** Display-only enrichment after server authorization. A moderator leaving the
 * guild must not erase their identity from existing moderation records. */
export const moderationActors = (applicationId: string, userIds: readonly string[]) => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const wanted = [...new Set(userIds)].filter(id => /^\d{15,22}$/u.test(id))
  const entries = yield* Effect.forEach(wanted, id => Effect.gen(function* () {
    const key = `${applicationId}:${id}`
    const cached = profiles.get(key)
    if (cached && cached.expires > Date.now()) return [id, cached.actor] as const
    const user = yield* discord.request(`/users/${id}`).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(User)),
      Effect.timeout("3 seconds"),
      Effect.catch(() => Effect.succeed(undefined)),
    )
    const actor = user?.id === id ? {
      added_by_username: user.global_name?.trim() || user.username,
      added_by_avatar_url: user.avatar
        ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}`
        : `https://cdn.discordapp.com/embed/avatars/${user.discriminator && user.discriminator !== "0" ? Number(user.discriminator) % 5 : Number((BigInt(id) >> 22n) % 6n)}.png`,
    } : cached?.actor
    if (profiles.size >= 2_000) profiles.delete(profiles.keys().next().value!)
    profiles.set(key, { expires: Date.now() + (user ? 300_000 : 30_000), ...(actor ? { actor } : {}) })
    return [id, actor] as const
  }), { concurrency: 4 }).pipe(
    // A long moderation history must not cause one REST round-trip per actor
    // to hold the page open. The records are authoritative even if names lag.
    Effect.timeout("4 seconds"),
    Effect.catch(() => Effect.succeed(wanted.map(id => [id, profiles.get(`${applicationId}:${id}`)?.actor] as const))),
  )
  return new Map(entries)
})
