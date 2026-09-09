import { Schema } from "effect"
import { describe, expect, it, vi } from "vitest"
import { TranscriptCapability, renderTranscriptMessage, transcriptHtmlStream, transcriptSecurityHeaders, transcriptStoragePrefix, type TranscriptMessage } from "./ticket-transcript-format.js"

const capability = "00000000-0000-4000-8000-000000000001"
const message: TranscriptMessage = { id:"123",author:{id:"124",name:"Alice",bot:false},timestamp:"2026-09-04T00:00:00Z",
  editedTimestamp:null,type:0,content:"Hello",embeds:[],attachments:[],stickers:[],reactions:[] }

describe("inert bounded transcript format", () => {
  it("accepts only canonical random UUIDv4 capabilities and stores their SHA256 digest", async () => {
    expect(Schema.is(TranscriptCapability)(crypto.randomUUID())).toBe(true)
    for (const invalid of ["123",capability.toUpperCase().replace("4000", "7000"),"../"+capability, capability+"/channel.html"]) {
      expect(Schema.is(TranscriptCapability)(invalid)).toBe(false)
      await expect(transcriptStoragePrefix(invalid)).rejects.toThrow("Invalid transcript capability")
    }
    const prefix = await transcriptStoragePrefix(capability)
    expect(prefix).toMatch(/^transcripts\/[a-f0-9]{64}$/u)
    expect(prefix).not.toContain(capability)
    expect(await transcriptStoragePrefix(capability)).toBe(prefix)
    expect(await transcriptStoragePrefix(crypto.randomUUID())).not.toBe(prefix)
  })
  it("escapes all message fields and permits only generated relative attachment URLs", () => {
    const attack = '<script>alert("x")</script><img src="https://outside.invalid/a"> & @everyone'
    const html = renderTranscriptMessage({...message,author:{...message.author,name:"<img onerror=alert(1)>"},content:attack,
      embeds:[{title:attack,description:attack,footer:attack,url:"javascript:alert(1)",fields:[{name:attack,value:attack}]}],
      attachments:[{id:capability,filename:'"><svg onload=alert(1)>.html',size:42}],stickers:["<svg onload=alert(1)>"],reactions:[{name:"<script>",count:2}]})
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("<svg")
    expect(html).toContain("&lt;script&gt;")
    expect(html.match(/href="[^"]+"/gu)).toEqual([`href="attachments/${capability}"`])
    expect(html).toContain("&amp; @everyone")
    expect(() => renderTranscriptMessage({...message,attachments:[{id:'" onclick="bad',filename:"x",size:1}]})).toThrow()
    expect(() => renderTranscriptMessage({...message,content:"x".repeat(4001)})).toThrow()
  })
  it("streams one message per pull and closes its source on cancellation", async () => {
    const next = vi.fn(async () => ({value:message,done:false as const})), stop = vi.fn(async () => ({done:true as const,value:undefined}))
    const stream = transcriptHtmlStream({title:"<unsafe>",document:"channel",hasThread:true,messages:{[Symbol.asyncIterator]:()=>({next,return:stop})}})
    expect(next).not.toHaveBeenCalled()
    const reader = stream.getReader()
    const head = new TextDecoder().decode((await reader.read()).value)
    expect(head).toContain("&lt;unsafe&gt;")
    expect(head).toContain('href="thread.html"')
    expect(head).not.toContain(capability)
    expect(next).not.toHaveBeenCalled()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("Hello")
    expect(next).toHaveBeenCalledTimes(1)
    await reader.cancel()
    expect(stop).toHaveBeenCalledTimes(1)
  })
  it("finishes valid documents and replaces source failures with non-sensitive errors", async () => {
    async function* messages() { yield message }
    const html = await new Response(transcriptHtmlStream({title:"Ticket",document:"thread",hasThread:true,messages:messages()})).text()
    expect(html).toContain('href="channel.html"')
    expect(html.endsWith("</main></body></html>")).toBe(true)
    const next = async (): Promise<IteratorResult<TranscriptMessage>> => { throw new Error("secret capability "+capability) }
    const broken = transcriptHtmlStream({title:"Ticket",document:"channel",hasThread:false,messages:{[Symbol.asyncIterator]:()=>({next})}})
    await expect(new Response(broken).text()).rejects.toThrow(/^Transcript rendering failed$/u)
  })
  it("disables referrers, caches, indexing, active content, frames and external resources", () => {
    const headers = transcriptSecurityHeaders()
    expect(headers.get("cache-control")).toContain("no-store")
    expect(headers.get("referrer-policy")).toBe("no-referrer")
    expect(headers.get("content-security-policy")).toBe("sandbox allow-downloads; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
    expect(headers.get("x-robots-tag")).toContain("noindex")
    expect(headers.get("x-content-type-options")).toBe("nosniff")
  })
})
