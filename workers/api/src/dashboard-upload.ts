import { Effect } from "effect"
import { InvalidRequest, PayloadTooLarge, UpstreamUnavailable } from "./errors.js"

export const MAX_DASHBOARD_UPLOAD = 25 * 1024 * 1024
export interface MediaUploadBindings { readonly MEDIA?: Pick<R2Bucket, "put"> }
export const CDN_UPLOAD_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "mov", "webm", "mp3", "ogg", "wav", "pdf", "txt", "json"] as const
const embedFilename = /^embed_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z0-9]+)$/u

export const mediaFileUrl = (filename: string) => `https://api.clashk.ing/v2/media/${encodeURIComponent(filename)}`
export const validMediaFilename = (filename: string) => {
  const extension = embedFilename.exec(filename)?.[1]
  return /^(?:base|giveaway)_[a-z0-9_-]+\.(?:png|jpg|jpeg|gif|webp)$/u.test(filename) ||
    Boolean(extension && CDN_UPLOAD_EXTENSIONS.some((allowed) => allowed === extension))
}
export const mediaContentType = (filename: string): string => ({
  png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",
  mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",mp3:"audio/mpeg",ogg:"audio/ogg",wav:"audio/wav",
}[filename.split(".").at(-1)!] ?? "application/octet-stream")

/** New uploads are isolated in MEDIA; no provider fallback or arbitrary key writes. */
export const uploadMediaFile = (bindings: MediaUploadBindings, filename: string, file: File) => Effect.tryPromise({
  try: async () => {
    if (!validMediaFilename(filename)) {
      throw new InvalidRequest({ message: "Invalid upload filename" })
    }
    if (file.size > MAX_DASHBOARD_UPLOAD) throw new PayloadTooLarge({ message: "File exceeds the 25 MB limit" })
    if (!bindings.MEDIA) throw new Error("R2 media storage is not configured")
    const url = mediaFileUrl(filename)
    const uploaded = await bindings.MEDIA.put(`uploads/${filename}`, file.stream(), {
      httpMetadata: { contentType: mediaContentType(filename), cacheControl: "public, max-age=31536000, immutable" },
      customMetadata: { visibility: "public-media", filename }, onlyIf: { etagDoesNotMatch: "*" },
    })
    if (uploaded === null) throw new Error("Media object already exists")
    return { url, filename }
  },
  catch: (cause) => cause instanceof InvalidRequest || cause instanceof PayloadTooLarge ? cause : new UpstreamUnavailable({ cause, message: "File upload failed" }),
})

/** Limit streamed multipart bytes before parsing; a missing Content-Length cannot bypass the cap. */
export const readDashboardMultipart = (request: Request, maxBytes = MAX_DASHBOARD_UPLOAD + 1024 * 1024) => Effect.tryPromise({
  try: async () => {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) throw new InvalidRequest({ message: "Content-Type must be multipart/form-data", status: 415 })
    const length = request.headers.get("content-length")
    if (length !== null && /^\d+$/u.test(length) && Number(length) > maxBytes) {
      await request.body?.cancel()
      throw new PayloadTooLarge({ message: "Multipart request exceeds the upload limit" })
    }
    if (request.body === null) throw new InvalidRequest({ message: "Multipart body is required" })
    const reader = request.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > maxBytes) { await reader.cancel(); throw new PayloadTooLarge({ message: "Multipart request exceeds the upload limit" }) }
        chunks.push(new Uint8Array(chunk.value))
      }
    } finally { reader.releaseLock() }
    return await new Response(new Blob(chunks), { headers: { "content-type": request.headers.get("content-type")! } }).formData()
  },
  catch: (cause) => cause instanceof InvalidRequest || cause instanceof PayloadTooLarge ? cause : new InvalidRequest({ message: "Invalid multipart form data" }),
})
