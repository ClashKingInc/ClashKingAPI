import { dashboardEndpoints } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { AuthIdentity } from "./auth.js"
import { CDN_UPLOAD_EXTENSIONS, MAX_DASHBOARD_UPLOAD, readDashboardMultipart, uploadMediaFile, type MediaUploadBindings } from "./dashboard-upload.js"
import { InvalidRequest, PayloadTooLarge, UpstreamUnavailable } from "./errors.js"

export const cdnUploadRuntimeRoutes = [{ method: "POST", path: "/v2/cdn/upload" }] as const

/** Auth precedes multipart parsing; the shared reader counts actual bytes before formData(). */
export const dispatchCdnUpload = (request: Request, bindings: MediaUploadBindings) => Effect.gen(function* () {
  const descriptor = dashboardEndpoints.dashboardCdnUpload
  if (request.method !== descriptor.method || new URL(request.url).pathname !== descriptor.path) return undefined
  const auth = yield* AuthIdentity
  yield* auth.requireUser(request)
  const form = yield* readDashboardMultipart(request)
  const file = form.get("file")
  if (!(file instanceof File)) return yield* new InvalidRequest({ message: "File is required" })
  if (file.size > MAX_DASHBOARD_UPLOAD) return yield* new PayloadTooLarge({ message: "File exceeds the 25 MB limit" })
  const extension = /\.([^./\\]+)$/u.exec(file.name)?.[1]?.toLowerCase() ?? "bin"
  if (!CDN_UPLOAD_EXTENSIONS.some((allowed) => allowed === extension)) {
    return yield* new InvalidRequest({ message: `Unsupported file extension: .${extension}`, status: 415 })
  }
  const filename = `embed_${crypto.randomUUID()}.${extension}`
  const uploaded = yield* uploadMediaFile(bindings, filename, file)
  const response = yield* Schema.decodeUnknownEffect(descriptor.response)(uploaded).pipe(
    Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Invalid upload response" })),
  )
  return Response.json(response, { status: descriptor.successStatus, headers: { "cache-control": "no-store" } })
})
