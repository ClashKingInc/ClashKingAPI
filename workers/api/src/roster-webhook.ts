import { Effect } from "effect"
import { DiscordApi } from "./discord-api.js"
import { Forbidden, UpstreamUnavailable } from "./errors.js"

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null
const valid = (value: unknown, applicationId: string, serverId: string) => record(value)
  && value.type === 1 && value.application_id === applicationId && value.guild_id === serverId
  && typeof value.id === "string" && /^[0-9]{1,20}$/u.test(value.id)
  && typeof value.token === "string" && value.token.length > 0 && typeof value.channel_id === "string"

export const rosterWebhook = (applicationId: string, serverId: string, channelId: string, webhookId?: string) => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const channel = yield* discord.request(`/channels/${channelId}`)
  if (!record(channel) || channel.guild_id !== serverId || ![0, 5, 10, 11, 12].includes(Number(channel.type))) {
    return yield* new Forbidden({ message: "Select a text channel in this server" })
  }
  const thread = [10, 11, 12].includes(Number(channel.type))
  const parent = thread ? channel.parent_id : channelId
  if (typeof parent !== "string" || !/^[0-9]{1,20}$/u.test(parent)) {
    return yield* new Forbidden({ message: "Thread has no valid parent channel" })
  }
  let hook: unknown
  let identity: { username: string; avatar_url: string } | undefined
  if (webhookId) hook = yield* discord.request(`/webhooks/${webhookId}`)
  else {
    const user = yield* discord.request("/users/@me")
    if (!record(user) || user.id !== applicationId || typeof user.username !== "string") return yield* new Forbidden({ message: "Bot profile does not match the configured application" })
    const member = yield* discord.request(`/guilds/${serverId}/members/${applicationId}`)
    if (!record(member)) return yield* new UpstreamUnavailable({ cause: "invalid member", message: "Unable to load bot server profile" })
    const username = typeof member.nick === "string" && member.nick.trim() ? member.nick : typeof user.global_name === "string" && user.global_name.trim() ? user.global_name : user.username
    const guildAvatar = typeof member.avatar === "string" ? member.avatar : undefined
    const avatar = guildAvatar ?? (typeof user.avatar === "string" ? user.avatar : undefined)
    const avatar_url = avatar ? `https://cdn.discordapp.com/${guildAvatar ? `guilds/${serverId}/users/${applicationId}/avatars` : `avatars/${applicationId}`}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}?size=512`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(applicationId) >> 22n) % 6n)}.png`
    identity = { username: username.slice(0, 80), avatar_url }
    const hooks = yield* discord.request(`/channels/${parent}/webhooks`)
    if (!Array.isArray(hooks)) return yield* new UpstreamUnavailable({ message: "Discord returned invalid webhooks", cause: "invalid webhook list" })
    hook = hooks.find(value => valid(value, applicationId, serverId) && value.channel_id === parent && ["ClashKing Rosters", identity!.username].includes(String(value.name)))
    if (!hook) hook = yield* discord.request(`/channels/${parent}/webhooks`, { method: "POST", body: { name: identity.username } })
  }
  if (!valid(hook, applicationId, serverId) || !record(hook) || hook.channel_id !== parent || (webhookId && hook.id !== webhookId)) {
    // Never include the upstream object: it contains a secret webhook token.
    return yield* new Forbidden({ message: "Roster webhook must belong to this application and channel" })
  }
  return { identity, id: String(hook.id), path: `/webhooks/${hook.id}/${encodeURIComponent(String(hook.token))}`,
    query: `with_components=true${thread ? `&thread_id=${channelId}` : ""}` }
})
