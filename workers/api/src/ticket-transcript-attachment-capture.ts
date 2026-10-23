import type { TranscriptAttachment } from "@clashking/api-contracts"
import { storeTranscriptAttachment } from "./ticket-json-transcript.js"

export interface AttachmentBudget { bytes: number; count: number }
const maximumFileBytes = 8 * 1024 * 1024
/** Copy only Discord-owned attachment URLs. Bound bytes as they arrive, not just from provider headers. */
export async function captureTranscriptAttachment(bucket: R2Bucket, capability: string, input: Record<string, unknown>, budget: AttachmentBudget): Promise<TranscriptAttachment | undefined> {
  if (typeof input.url !== "string" || typeof input.size !== "number" || !Number.isInteger(input.size) || input.size < 0 || input.size > maximumFileBytes
    || budget.count >= 100 || budget.bytes + input.size > 32 * 1024 * 1024) return undefined
  let url: URL
  try { url = new URL(input.url) } catch { return undefined }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname)
    || !/^\/attachments\/\d+\/\d+\//u.test(url.pathname)) return undefined
  // Workerd supports manual/follow, not redirect:error. Never follow a redirect
  // from an allowed Discord URL to an attacker-controlled or private host.
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) })
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error("Discord attachment redirect refused") }
  if ([403, 404].includes(response.status)) { await response.body?.cancel(); return undefined }
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error("Discord attachment is unavailable") }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > input.size || size > maximumFileBytes) throw new Error("Attachment exceeded its declared size")
      chunks.push(next.value)
    }
  } finally { await reader.cancel() }
  if (size !== input.size) throw new Error("Attachment size mismatch")
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  const attachment = { id: crypto.randomUUID(), filename: typeof input.filename === "string" ? input.filename.slice(0, 255) || "attachment" : "attachment",
    contentType: typeof input.content_type === "string" ? input.content_type.slice(0, 200) : "application/octet-stream", size,
    sha256: [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("") }
  await storeTranscriptAttachment(bucket, capability, attachment, bytes)
  budget.bytes += size; budget.count++
  return attachment
}
