import { Effect } from "effect"
import { mediaContentType, validMediaFilename } from "./dashboard-upload.js"
import { NotFound, UpstreamUnavailable } from "./errors.js"

export const mediaRuntimeRoutes = [{ method: "GET", path: "/v2/media/:filename" }] as const
export const dispatchMedia = (request: Request, bindings: { readonly MEDIA: Pick<R2Bucket, "get"> }) => Effect.gen(function* () {
  const match = /^\/v2\/media\/([^/]+)$/u.exec(new URL(request.url).pathname)
  if (request.method !== "GET" || match === null) return undefined
  const filename = match[1]!
  if (!validMediaFilename(filename)) return yield* new NotFound({ message: "Media not found" })
  const object = yield* Effect.tryPromise({
    try: () => bindings.MEDIA.get(`uploads/${filename}`),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Media storage is unavailable" }),
  })
  if (!object) return yield* new NotFound({ message: "Media not found" })
  if (object.customMetadata?.visibility !== "public-media" || object.customMetadata.filename !== filename) {
    yield* Effect.promise(() => object.body.cancel())
    return yield* new NotFound({ message: "Media not found" })
  }
  // Never trust caller-controlled MIME metadata; active formats are downloads.
  const contentType = mediaContentType(filename)
  const headers = new Headers({
    "content-type": contentType, "content-length": String(object.size), etag: object.httpEtag,
    "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "content-disposition": `${contentType === "application/octet-stream" ? "attachment" : "inline"}; filename="${filename}"`,
  })
  if (request.headers.get("if-none-match") === object.httpEtag) {
    yield* Effect.promise(() => object.body.cancel())
    headers.delete("content-length")
    return new Response(null, { status: 304, headers })
  }
  return new Response(object.body, { headers })
})
