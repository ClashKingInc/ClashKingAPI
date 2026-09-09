import { Effect } from "effect"
import { InvalidRequest, UpstreamUnavailable } from "./errors.js"

export const validateDiscordProfileImage = (value: string, field: string) => Effect.try({
  try: () => {
    const match = /^data:image\/[^;,]+;base64,([A-Za-z0-9+/]+={0,2})$/u.exec(value)
    if (match === null || match[1]!.length % 4 !== 0) throw new Error("Invalid image encoding")
    const decoded = atob(match[1]!)
    if (decoded.length === 0 || decoded.length > 10 * 1024 * 1024) throw new Error("Image size is outside limits")
    return value
  },
  catch: () => new InvalidRequest({ message: `${field} must be a valid image data URI no larger than 10 MB` }),
})

/** Fetch only Discord's own CDN; preserve configured bot branding on new webhooks. */
export const discordWebhookAvatar = (url: string | null | undefined) => url == null ? Effect.succeed(undefined) : Effect.tryPromise({
  try: async () => {
    const target = new URL(url)
    if (target.protocol !== "https:" || target.hostname !== "cdn.discordapp.com" || target.username || target.password || target.port) throw new Error("Invalid Discord CDN URL")
    const response = await fetch(target, { redirect: "error", signal: AbortSignal.timeout(10_000) })
    if (!response.ok || response.body === null) throw new Error("Discord avatar unavailable")
    const reader = response.body.getReader(), parts: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error("Discord avatar exceeds 8 MB") }
        parts.push(chunk.value)
      }
    } finally { reader.releaseLock() }
    if (size === 0) throw new Error("Discord avatar was empty")
    const type = response.headers.get("content-type")?.split(";")[0]
    if (type === undefined || !/^image\/(?:png|jpeg|gif|webp)$/u.test(type)) throw new Error("Discord avatar was not an image")
    let binary = ""
    for (const part of parts) for (let index = 0; index < part.length; index += 8192) binary += String.fromCharCode(...part.subarray(index, index + 8192))
    return `data:${type};base64,${btoa(binary)}`
  },
  catch: (cause) => new UpstreamUnavailable({ cause, message: "Discord bot avatar could not be loaded for webhook creation" }),
})
