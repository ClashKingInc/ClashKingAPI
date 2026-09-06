import { describe, expect, it, vi } from "vitest"
import { isTranscriptRequest, readTicketTranscript, type TranscriptReadBucket } from "./ticket-transcript-runtime.js"
import { transcriptStoragePrefix } from "./ticket-transcript-format.js"
import { ticketTranscriptEndpoints } from "@clashking/api-contracts"
import { ticketTranscriptRoutes } from "./ticket-transcript-runtime.js"

const capability = "00000000-0000-4000-8000-000000000001"
const attachmentId = "00000000-0000-4000-8000-000000000002"
const request = (path = "channel.html", id = capability) => new Request(`https://api.clashk.ing/v2/ticket-transcripts/${id}/${path}`)
type ObjectBody = NonNullable<Awaited<ReturnType<TranscriptReadBucket["get"]>>>
const stored = (prefix: string, kind: string, body: string, customMetadata: Record<string,string> = {}): ObjectBody => ({
  size: new TextEncoder().encode(body).byteLength,body: new Blob([body]).stream(),
  customMetadata:{transcriptPrefix:prefix,transcriptKind:kind,transcriptVersion:"1",...customMetadata},
})
const fixture = async (hasThread = true) => {
  const prefix = await transcriptStoragePrefix(capability)
  const entries = new Map<string,() => ObjectBody>([
    [`${prefix}/manifest.json`,() => stored(prefix,"manifest",JSON.stringify({version:1,complete:true,channel:true,thread:hasThread}))],
    [`${prefix}/channel.html`,() => stored(prefix,"channel","<!doctype html><p>Channel</p>")],
    [`${prefix}/thread.html`,() => stored(prefix,"thread","<!doctype html><p>Private thread</p>")],
    [`${prefix}/attachments/${attachmentId}`,() => stored(prefix,"attachment","<script>download only</script>",{filename:'../../evil"\r\nX-Injected: true.html'})],
  ])
  const get = vi.fn(async (key: string) => entries.get(key)?.() ?? null)
  return {prefix,entries,get}
}

describe("private R2 transcript capability reader", () => {
  it("keeps this preserved HTML implementation separate from the active JSON contracts", () => {
    expect(ticketTranscriptRoutes.filter(route => route.path.endsWith(".html"))).toHaveLength(2)
    expect(Object.values(ticketTranscriptEndpoints).some(endpoint => endpoint.path.endsWith(".html"))).toBe(false)
    expect(Object.values(ticketTranscriptEndpoints).every(endpoint => endpoint.auth === "public")).toBe(true)
  })
  it("serves completed channel and private thread as inert HTML without authentication or external redirects", async () => {
    const bucket = await fixture()
    for (const path of ["channel.html","thread.html"]) {
      const response = await readTicketTranscript(request(path),bucket)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
      expect(response.headers.get("content-security-policy")).toContain("sandbox allow-downloads")
      expect(response.headers.get("cache-control")).toContain("no-store")
      expect(response.headers.get("referrer-policy")).toBe("no-referrer")
      expect(response.headers.has("location")).toBe(false)
      expect(response.headers.has("access-control-allow-origin")).toBe(false)
      expect(response.headers.has("set-cookie")).toBe(false)
      expect(await response.text()).toContain("<!doctype html>")
    }
    expect(bucket.get.mock.calls.flat().join("")).not.toContain(capability)
  })
  it("never serves any partial export, absent thread or object from another transcript", async () => {
    const bucket = await fixture(false)
    expect((await readTicketTranscript(request("thread.html"),bucket)).status).toBe(404)
    bucket.entries.set(`${bucket.prefix}/channel.html`,()=>stored("other-transcript","channel","wrong"))
    expect((await readTicketTranscript(request(),bucket)).status).toBe(404)
    bucket.entries.delete(`${bucket.prefix}/manifest.json`)
    for (const path of ["channel.html",`attachments/${attachmentId}`]) expect((await readTicketTranscript(request(path),bucket)).status).toBe(404)
    bucket.entries.set(`${bucket.prefix}/manifest.json`,()=>stored(bucket.prefix,"manifest",JSON.stringify({version:1,complete:false,channel:true,thread:true})))
    expect((await readTicketTranscript(request(),bucket)).status).toBe(404)
  })
  it("streams attachment bodies under the same capability as non-active downloads", async () => {
    const bucket = await fixture()
    const response = await readTicketTranscript(request(`attachments/${attachmentId}`),bucket)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/octet-stream")
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="attachment"; filename\*=UTF-8''/u)
    expect(response.headers.get("content-disposition")).not.toMatch(/[\r\n]/u)
    expect(response.headers.has("x-injected")).toBe(false)
    expect(await response.text()).toBe("<script>download only</script>")
    expect((await readTicketTranscript(request(`attachments/${attachmentId}`,crypto.randomUUID()),bucket)).status).toBe(404)
  })
  it("rejects guessing, listing, traversal, encoded aliases and wrong methods before R2 access", async () => {
    const bucket = await fixture()
    const invalid = [request("manifest.json"),request("attachments"),request("channel.html","123"),request("%63hannel.html"),
      request(`attachments/${attachmentId}/extra`),request("attachments/%2e%2e"),new Request(request(),{method:"POST"}),
      new Request(`https://api.clashk.ing/v2/ticket-transcripts/${capability}/`)]
    for (const input of invalid) expect((await readTicketTranscript(input,bucket)).status).toBe(404)
    expect(bucket.get).not.toHaveBeenCalled()
  })
  it("preserves boundary emoji and sanitizes malformed Unicode in attachment filenames", async () => {
    const bucket = await fixture()
    for (const filename of ["a".repeat(179)+"😀.png","bad\ud800file\udfff.html",'../x"\r\nInjected.html']) {
      bucket.entries.set(`${bucket.prefix}/attachments/${attachmentId}`,()=>stored(bucket.prefix,"attachment","download",{filename}))
      const response = await readTicketTranscript(request(`attachments/${attachmentId}`),bucket)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toBe("application/octet-stream")
      expect(response.headers.get("content-disposition")).toMatch(/^attachment;/u)
      expect(await response.text()).toBe("download")
      if (filename.startsWith("a")) expect(response.headers.get("content-disposition")).toContain("%F0%9F%98%80")
      if (filename.startsWith("bad")) expect(response.headers.get("content-disposition")).toContain("bad_file_.html")
    }
  })
  it("fails closed on corrupt/oversized manifests and hides storage exceptions", async () => {
    const bucket = await fixture()
    bucket.entries.set(`${bucket.prefix}/manifest.json`,()=>stored(bucket.prefix,"manifest","x".repeat(4097)))
    expect((await readTicketTranscript(request(),bucket)).status).toBe(404)
    bucket.entries.set(`${bucket.prefix}/manifest.json`,()=>stored(bucket.prefix,"manifest","bad json"))
    expect((await readTicketTranscript(request(),bucket)).status).toBe(503)
    const log = vi.spyOn(console,"log"), error = vi.spyOn(console,"error")
    try {
      const response = await readTicketTranscript(request(),{get:async()=>{throw new Error("secret "+capability)}})
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({code:"upstream_unavailable",message:"Transcript unavailable"})
      expect(log).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    } finally { log.mockRestore();error.mockRestore() }
  })
  it("classifies malformed transcript namespace paths for quiet handling without granting access", () => {
    for (const path of ["/v2/ticket-transcripts/secret", "/v2/%74icket-transcripts/secret", "/V2/TICKET-TRANSCRIPTS/secret", "/v2/%zz"]) {
      expect(isTranscriptRequest(new Request("https://api.clashk.ing"+path))).toBe(true)
    }
    expect(isTranscriptRequest(new Request("https://api.clashk.ing/v2/health"))).toBe(false)
    expect(isTranscriptRequest(new Request("https://api.clashk.ing/v2/ticket-transcripts-extra"))).toBe(false)
  })
})
