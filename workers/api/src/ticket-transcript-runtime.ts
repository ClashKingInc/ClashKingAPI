import { Schema } from "effect"
import { TranscriptCapability, TranscriptManifest, transcriptSecurityHeaders, transcriptStoragePrefix } from "./ticket-transcript-format.js"

type TranscriptObject = Pick<R2ObjectBody, "body" | "size" | "customMetadata">
export interface TranscriptReadBucket { get(key: string): Promise<TranscriptObject | null> }
export const ticketTranscriptRoutes = [
  {method:"GET",path:"/v2/ticket-transcripts/:capability/channel.html"},
  {method:"GET",path:"/v2/ticket-transcripts/:capability/thread.html"},
  {method:"GET",path:"/v2/ticket-transcripts/:capability/attachments/:attachmentId"},
] as const

// Cover malformed/encoded namespace spellings too: never log a supplied bearer
// credential merely because it failed routing. This check grants no access.
export const isTranscriptRequest = (request: Request): boolean => {
  let path = new URL(request.url).pathname
  try { path = decodeURIComponent(path) } catch { return true }
  return /^\/v2\/ticket-transcripts(?:\/|$)/iu.test(path)
}
const unavailable = (status: number) => Response.json({code:status === 404 ? "not_found" : "upstream_unavailable",
  message:status === 404 ? "Transcript not found" : "Transcript unavailable"}, {
  status, headers: transcriptSecurityHeaders(),
})
const cancel = async (object: TranscriptObject | null) => { await object?.body.cancel().catch(() => undefined) }
const owns = (object: TranscriptObject, prefix: string, kind: string) => object.customMetadata?.transcriptPrefix === prefix
  && object.customMetadata.transcriptKind === kind && object.customMetadata.transcriptVersion === "1"

/** Standalone public capability handler: no auth, SQL, logging, redirects or CORS.
 * A trusted exporter must publish the complete manifest LAST, after every body
 * and copied attachment is durable. There is deliberately no listing endpoint.
 */
export const readTicketTranscript = async (request: Request, bucket: TranscriptReadBucket): Promise<Response> => {
  const match = /^\/v2\/ticket-transcripts\/([^/]+)\/(channel\.html|thread\.html|attachments\/([^/]+))$/u.exec(new URL(request.url).pathname)
  if (request.method !== "GET" || match === null || !Schema.is(TranscriptCapability)(match[1])
    || (match[3] !== undefined && !Schema.is(TranscriptCapability)(match[3]))) return unavailable(404)
  try {
    const prefix = await transcriptStoragePrefix(match[1])
    const manifestObject = await bucket.get(`${prefix}/manifest.json`)
    if (manifestObject === null) return unavailable(404)
    if (manifestObject.size > 4096 || !owns(manifestObject, prefix, "manifest")) {
      await cancel(manifestObject)
      return unavailable(404)
    }
    const manifest = await new Response(manifestObject.body).json()
    if (!Schema.is(TranscriptManifest)(manifest) || (match[2] === "thread.html" && !manifest.thread)) return unavailable(404)
    const object = await bucket.get(`${prefix}/${match[2]}`)
    if (object === null) return unavailable(404)
    const attachment = match[3] !== undefined
    if (!owns(object, prefix, attachment ? "attachment" : match[2] === "channel.html" ? "channel" : "thread")) {
      await cancel(object)
      return unavailable(404)
    }
    const headers = transcriptSecurityHeaders()
    headers.set("content-length", String(object.size))
    headers.set("content-type", attachment ? "application/octet-stream" : "text/html; charset=utf-8")
    if (attachment) {
      // Preserve the original display name as UTF-8, but never interpolate it
      // into an HTTP quoted-string or let an uploaded MIME type become active.
      const filename = Array.from(object.customMetadata?.filename ?? "attachment").slice(0, 180)
        .map(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === "/" || character === "\\"
          || (character.length === 1 && character.charCodeAt(0) >= 0xd800 && character.charCodeAt(0) <= 0xdfff) ? "_" : character).join("")
      const encoded = encodeURIComponent(filename).replaceAll(/['()*]/gu, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
      headers.set("content-disposition", `attachment; filename="attachment"; filename*=UTF-8''${encoded}`)
    } else headers.set("content-disposition", "inline")
    return new Response(object.body, { headers })
  } catch {
    // Storage/parse errors may contain an object key or source credentials.
    // Deliberately do not propagate their message/cause to logs or the client.
    return unavailable(503)
  }
}
