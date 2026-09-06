import { Schema } from "effect"
import { TicketTranscriptDocument, TranscriptAttachment, TranscriptCapability } from "@clashking/api-contracts"

// This is storage/serving only. Discord collection, publication and channel
// deletion are deliberately absent and belong in the reviewed Bot plan.
export const ticketJsonTranscriptRoutes = [
  { method: "GET", path: "/v2/ticket-transcripts/:capability" },
  { method: "GET", path: "/v2/ticket-transcripts/:capability/attachments/:attachmentId" },
] as const
export const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024
const MAX_INDEX_BYTES = 256 * 1024
/** Count JSON UTF-8 bytes without constructing the JSON string or cloning its
 * objects. Input is producer-owned plain JSON; executable getters/toJSON,
 * cycles and extreme nesting are rejected before the recursive schema decoder. */
export function assertTranscriptJsonBudget(input: unknown, maximumBytes = MAX_TRANSCRIPT_BYTES): void {
  let bytes = 0
  const active = new WeakSet<object>()
  const add = (count: number) => {
    bytes += count
    if (bytes > maximumBytes) throw new Error("Transcript exceeds the JSON size limit")
  }
  const string = (value: string) => {
    // Every UTF-16 code unit needs at least one JSON byte, even surrogate pairs.
    if (value.length > maximumBytes - bytes) throw new Error("Transcript exceeds the JSON size limit")
    add(2)
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index)
      if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) add(2)
      else if (code < 32) add(6)
      else if (code < 128) add(1)
      else if (code < 2048) add(2)
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length &&
          value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) { add(4); index++ }
      else add(code >= 0xd800 && code <= 0xdfff ? 6 : 3)
    }
  }
  const visit = (value: unknown, depth: number): void => {
    if (depth > 64) throw new Error("Transcript JSON nesting limit exceeded")
    if (value === null) return add(4)
    if (typeof value === "string") return string(value)
    if (typeof value === "boolean") return add(value ? 4 : 5)
    if (typeof value === "number" && Number.isFinite(value)) return add(String(value).length)
    if (typeof value !== "object" || active.has(value)) throw new Error("Transcript must contain plain acyclic JSON")
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null && !(Array.isArray(value) && prototype === Array.prototype)) {
      throw new Error("Transcript must contain plain JSON objects")
    }
    const serializer = Object.getOwnPropertyDescriptor(value, "toJSON")
    if (serializer && (!("value" in serializer) || typeof serializer.value === "function")) throw new Error("Transcript must not contain custom JSON serializers")
    active.add(value)
    add(2)
    if (Array.isArray(value)) {
      if (value.length > maximumBytes - bytes) throw new Error("Transcript exceeds the JSON size limit")
      for (let index = 0; index < value.length; index++) {
        if (index > 0) add(1)
        const item = Object.getOwnPropertyDescriptor(value, String(index))
        if (!item || !("value" in item)) throw new Error("Transcript arrays must contain plain JSON values")
        visit(item.value, depth + 1)
      }
    } else {
      let first = true
      for (const key in value) if (Object.hasOwn(value, key)) {
        const item = Object.getOwnPropertyDescriptor(value, key)!
        if (!("value" in item)) throw new Error("Transcript must not contain getters")
        if (!first) add(1)
        first = false
        string(key)
        add(1)
        visit(item.value, depth + 1)
      }
    }
    active.delete(value)
  }
  visit(input, 0)
}
const decodeIndex = Schema.decodeUnknownSync(Schema.Struct({
  size: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: MAX_TRANSCRIPT_BYTES })),
  sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u)),
  attachments: Schema.Array(TranscriptAttachment).check(Schema.isMaxLength(100)),
}))
const decode = Schema.decodeUnknownSync(TicketTranscriptDocument)
const decodeAttachment = Schema.decodeUnknownSync(TranscriptAttachment)
const decodeCapability = Schema.decodeUnknownSync(TranscriptCapability)
const namespace = "/v2/ticket-transcripts"
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("")
const digest = async (bytes: BufferSource) => hex(await crypto.subtle.digest("SHA-256", bytes))
export const createTranscriptCapability = () => crypto.randomUUID()
export const jsonTranscriptStoragePrefix = async (capability: string) =>
  `transcripts/json-v1/${await digest(new TextEncoder().encode(decodeCapability(capability)))}`
const metadata = (kind: string) => ({ format: "clashking-json-v1", kind })
const isObject = (object: R2Object, kind: string) => object.customMetadata?.format === "clashking-json-v1" && object.customMetadata.kind === kind
const attachmentMatches = (object: R2Object, attachment: TranscriptAttachment) =>
  isObject(object, "attachment") && object.size === attachment.size &&
  object.checksums.sha256 !== undefined && hex(object.checksums.sha256) === attachment.sha256

/** Trusted producer helper; not a public upload route and cannot contact Discord. */
export async function storeTranscriptAttachment(bucket: R2Bucket, capability: string, input: unknown,
  body: ReadableStream | ArrayBuffer | ArrayBufferView | Blob): Promise<void> {
  const attachment = decodeAttachment(input)
  const prefix = await jsonTranscriptStoragePrefix(capability)
  const key = `${prefix}/attachments/${attachment.id}`
  const options: R2PutOptions = {
    onlyIf: { etagDoesNotMatch: "*" }, sha256: attachment.sha256,
    httpMetadata: { contentType: "application/octet-stream" }, customMetadata: metadata("attachment"),
  }
  let result: R2Object | null
  if (body instanceof ReadableStream) {
    // R2 must never commit a body whose length disagrees with the document.
    // FixedLengthStream bounds streaming uploads without buffering the file.
    const fixed = new FixedLengthStream(attachment.size)
    const abort = new AbortController()
    const piped = body.pipeTo(fixed.writable, { signal: abort.signal }).then(
      () => undefined, cause => ({ cause }),
    )
    try {
      result = await bucket.put(key, fixed.readable, options)
      if (result) {
        const failure = await piped
        if (failure) throw failure.cause
      }
    } finally {
      // Conditional retries can finish without consuming the supplied body.
      abort.abort()
      await piped
    }
  } else {
    const size = body instanceof Blob ? body.size : body.byteLength
    if (size !== attachment.size) throw new Error("Transcript attachment size mismatch")
    result = await bucket.put(key, body, options)
  }
  // Same-byte retries are safe; a reused identifier cannot overwrite content.
  const stored = result ?? await bucket.head(key)
  if (!stored || !attachmentMatches(stored, attachment)) throw new Error("Transcript attachment storage conflict")
}

/** Publish the small immutable index last; readers cannot access staging data. */
export async function storeTicketTranscript(bucket: R2Bucket, capability: string, input: unknown): Promise<{ path: string }> {
  assertTranscriptJsonBudget(input)
  const document = decode(input)
  const bytes = new TextEncoder().encode(JSON.stringify(document))
  if (bytes.byteLength > MAX_TRANSCRIPT_BYTES) throw new Error("Transcript exceeds the JSON size limit")
  const prefix = await jsonTranscriptStoragePrefix(capability)
  for (const attachment of document.attachments) {
    const object = await bucket.head(`${prefix}/attachments/${attachment.id}`)
    if (!object || !attachmentMatches(object, attachment)) throw new Error("Transcript attachment is not stored")
  }
  const sha256 = await digest(bytes)
  const key = `${prefix}/transcript.json`
  const result = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: "*" }, sha256,
    httpMetadata: { contentType: "application/json" }, customMetadata: metadata("document"),
  })
  const stored = result ?? await bucket.head(key)
  if (!stored || !isObject(stored, "document") || stored.size !== bytes.byteLength ||
      !stored.checksums.sha256 || hex(stored.checksums.sha256) !== sha256) throw new Error("Transcript storage conflict")
  const indexBytes = new TextEncoder().encode(JSON.stringify({ size: bytes.byteLength, sha256, attachments: document.attachments }))
  if (indexBytes.byteLength > MAX_INDEX_BYTES) throw new Error("Transcript index size limit")
  const indexHash = await digest(indexBytes)
  const indexKey = `${prefix}/index.json`
  const indexResult = await bucket.put(indexKey, indexBytes, {
    onlyIf: { etagDoesNotMatch: "*" }, sha256: indexHash,
    httpMetadata: { contentType: "application/json" }, customMetadata: metadata("index"),
  })
  const index = indexResult ?? await bucket.head(indexKey)
  if (!index || !isObject(index, "index") || index.size !== indexBytes.byteLength ||
      !index.checksums.sha256 || hex(index.checksums.sha256) !== indexHash) throw new Error("Transcript index storage conflict")
  return { path: `${namespace}/${capability}` }
}

export function isJsonTranscriptRequest(request: Request): boolean {
  const path = new URL(request.url).pathname
  // Invalid and former HTML paths stay inside the quiet boundary too.
  return path === namespace || path.startsWith(`${namespace}/`)
}
const safeHeaders = () => new Headers({
  "cache-control": "no-store", "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow, noarchive",
  "content-security-policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
})
const failure = (status: 404 | 503, head: boolean) => {
  const headers = safeHeaders()
  headers.set("content-type", "application/json")
  return new Response(head ? null : JSON.stringify({
    code: status === 404 ? "not_found" : "upstream_unavailable",
    message: status === 404 ? "Transcript not found" : "Transcript unavailable",
  }), { status, headers })
}
async function readDocument(bucket: R2Bucket, prefix: string) {
  const object = await bucket.get(`${prefix}/transcript.json`)
  if (!object) return null
  if (!isObject(object, "document") || object.size > MAX_TRANSCRIPT_BYTES || object.httpMetadata?.contentType !== "application/json") {
    await object.body.cancel()
    throw new Error("Invalid transcript object")
  }
  const bytes = await object.arrayBuffer()
  if (bytes.byteLength !== object.size || !object.checksums.sha256 || await digest(bytes) !== hex(object.checksums.sha256)) {
    throw new Error("Invalid transcript checksum")
  }
  return { document: decode(JSON.parse(new TextDecoder().decode(bytes))), bytes }
}

async function readIndex(bucket: R2Bucket, prefix: string) {
  const object = await bucket.get(`${prefix}/index.json`)
  if (!object) return null
  if (!isObject(object, "index") || object.size > MAX_INDEX_BYTES || object.httpMetadata?.contentType !== "application/json") {
    await object.body.cancel()
    throw new Error("Invalid transcript index")
  }
  const bytes = await object.arrayBuffer()
  if (bytes.byteLength !== object.size || !object.checksums.sha256 || await digest(bytes) !== hex(object.checksums.sha256)) throw new Error("Invalid transcript index checksum")
  const index = decodeIndex(JSON.parse(new TextDecoder().decode(bytes)))
  // A metadata read detects replacement/corruption without transferring the
  // complete document for every attachment or HEAD request.
  const document = await bucket.head(`${prefix}/transcript.json`)
  if (!document || !isObject(document, "document") || document.size !== index.size ||
      document.httpMetadata?.contentType !== "application/json" || !document.checksums.sha256 ||
      hex(document.checksums.sha256) !== index.sha256) throw new Error("Transcript index document mismatch")
  return index
}

/** No SQL, credentials, logs, request-ID reflection, HTML rendering or listing. */
export async function readJsonTicketTranscript(request: Request, bucket: R2Bucket): Promise<Response> {
  const head = request.method === "HEAD"
  const url = new URL(request.url)
  const match = /^\/v2\/ticket-transcripts\/([^/]+)(?:\/attachments\/([^/]+))?$/.exec(url.pathname)
  if (!match || (!head && request.method !== "GET") || url.search) return failure(404, head)
  let capability: string
  let attachmentId: string | undefined
  try {
    capability = decodeCapability(match[1])
    if (match[2]) attachmentId = decodeCapability(match[2])
  } catch { return failure(404, head) }
  try {
    const prefix = await jsonTranscriptStoragePrefix(capability)
    const saved = await readIndex(bucket, prefix)
    if (!saved) return failure(404, head)
    const headers = safeHeaders()
    if (!attachmentId) {
      headers.set("content-type", "application/json; charset=utf-8")
      headers.set("content-disposition", 'attachment; filename="transcript.json"')
      headers.set("content-length", String(saved.size))
      if (head) return new Response(null, { headers })
      const document = await readDocument(bucket, prefix)
      if (!document || await digest(document.bytes) !== saved.sha256) return failure(503, head)
      return new Response(document.bytes, { headers })
    }
    const attachment = saved.attachments.find(value => value.id === attachmentId)
    if (!attachment) return failure(404, head)
    const bodyObject = head ? null : await bucket.get(`${prefix}/attachments/${attachmentId}`)
    const object = head ? await bucket.head(`${prefix}/attachments/${attachmentId}`) : bodyObject
    if (!object || !attachmentMatches(object, attachment)) {
      if (bodyObject) await bodyObject.body.cancel()
      return failure(503, head)
    }
    headers.set("content-type", "application/octet-stream")
    // Metadata never becomes a header verbatim (filenames can contain CR/LF).
    // JSON permits lone surrogates; replace them only in the UTF-8 header name.
    const filename = encodeURIComponent(attachment.filename.toWellFormed()).replaceAll(/[!'()*]/g, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)
    headers.set("content-disposition", `attachment; filename="attachment"; filename*=UTF-8''${filename}`)
    headers.set("content-length", String(object.size))
    return new Response(bodyObject?.body ?? null, { headers })
  } catch { return failure(503, head) }
}
