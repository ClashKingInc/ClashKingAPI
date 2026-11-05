import { Effect } from "effect"
import { DiscordApi } from "./discord-api.js"
import { createLogWebhook } from "./discord-managed-resources.js"
import { Forbidden, UpstreamUnavailable } from "./errors.js"

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

/** Call with the server resource lock held, shared with log/AutoBoard writers.
 * Reuse any bot-owned incoming hook in the parent channel regardless of its name.
 * Never create a replacement after a failed list request: that can multiply hooks.
 */
export const reminderWebhook = (applicationId: string, serverId: string, channelId: string) => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const user = yield* discord.request("/users/@me")
  if (!record(user) || user.id !== applicationId) return yield* new Forbidden({ message: "Bot does not match the configured application" })
  const hooks = yield* discord.request(`/channels/${channelId}/webhooks`)
  if (!Array.isArray(hooks)) return yield* new UpstreamUnavailable({ message: "Unable to inspect channel webhooks", cause: "invalid list" })
  const hook = hooks.find(value => record(value) && value.type === 1 && value.guild_id === serverId
    && value.channel_id === channelId && (value.application_id === applicationId || (record(value.user) && value.user.id === applicationId))
    && typeof value.id === "string" && /^[1-9]\d*$/u.test(value.id))
  if (record(hook)) return { id: String(hook.id), created: undefined }
  const created = yield* createLogWebhook(serverId, channelId, "ClashKing")
  return { id: created.id, created }
})
