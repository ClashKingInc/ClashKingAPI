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

class AvatarLoadError extends Error {
  constructor(readonly code: string) { super(code) }
}

const validImageSignature = (type: string, bytes: Uint8Array): boolean => {
  const starts = (...magic: number[]) => magic.every((byte, index) => bytes[index] === byte)
  switch (type) {
    case "image/png": return starts(137, 80, 78, 71, 13, 10, 26, 10)
    case "image/jpeg": return starts(255, 216, 255)
    case "image/gif": return starts(71, 73, 70, 56, 55, 97) || starts(71, 73, 70, 56, 57, 97)
    case "image/webp": return starts(82, 73, 70, 70) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80
    default: return false
  }
}

const readAvatar = async (response: Response): Promise<string> => {
  if (response.body === null) throw new AvatarLoadError("empty_body")
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()
  if (!type || !/^image\/(?:png|jpeg|gif|webp)$/u.test(type)) throw new AvatarLoadError("invalid_content_type")
  const reader = response.body.getReader(), parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new AvatarLoadError("image_too_large") }
      parts.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  if (size === 0) throw new AvatarLoadError("empty_body")
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
  if (!validImageSignature(type, bytes)) throw new AvatarLoadError("invalid_image_signature")
  let binary = ""
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
  return `data:${type};base64,${btoa(binary)}`
}

/** Fetch only Discord's CDN, retry transient failures, and keep webhook branding mandatory when configured. */
export const discordWebhookAvatar = (url: string | null | undefined) => url == null ? Effect.succeed(undefined) : Effect.tryPromise({
  try: async () => {
    let target: URL
    try { target = new URL(url) } catch { throw new AvatarLoadError("invalid_cdn_url") }
    if (target.protocol !== "https:" || target.hostname !== "cdn.discordapp.com" || target.username || target.password || target.port) throw new AvatarLoadError("invalid_cdn_url")
    for (let attempt = 0; attempt < 3; attempt++) {
      let response: Response
      try {
        response = await fetch(target, { redirect: "error", signal: AbortSignal.timeout(4_000) })
      } catch {
        if (attempt === 2) throw new AvatarLoadError("cdn_network_failure")
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        if ((response.status === 429 || response.status >= 500) && attempt < 2) continue
        throw new AvatarLoadError(`cdn_http_${response.status}`)
      }
      return readAvatar(response)
    }
    throw new AvatarLoadError("cdn_unavailable")
  },
  catch: (cause) => {
    const reason = cause instanceof AvatarLoadError ? cause.code : "unexpected_failure"
    return new UpstreamUnavailable({ cause: new AvatarLoadError(reason), message: `Discord bot avatar could not be loaded for webhook creation (${reason})` })
  },
})
