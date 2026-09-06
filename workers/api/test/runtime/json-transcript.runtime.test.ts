import { build } from "esbuild"
import { Miniflare, convertV4MiniflareOptions } from "miniflare"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { jsonTranscriptFixture } from "../fixtures/json-transcript.js"

const capability = "00000000-0000-4000-8000-000000000001"
const attachmentId = "00000000-0000-4000-8000-000000000002"
const path = `/v2/ticket-transcripts/${capability}`
let runtime: Miniflare
const read = (suffix = "", method = "GET") => runtime.dispatchFetch(`https://fixture.test${path}${suffix}`, { method })
const write = (action: string, payload: unknown) => runtime.dispatchFetch(`https://fixture.test/fixture/${action}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
})
beforeAll(async () => {
  const bundled = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import {storeTranscriptAttachment,storeTicketTranscript,readJsonTicketTranscript,jsonTranscriptStoragePrefix} from "./workers/api/src/ticket-json-transcript.ts";
      export default {async fetch(request,env) {
        const path = new URL(request.url).pathname;
        if (!path.startsWith("/fixture/")) {
          const bucket = request.headers.has("x-fixture-block-document-body") ? new Proxy(env.TICKETING, {
            get(target,key) {
              if(key === "get") return (name,...args) => {
                if(name.endsWith("/transcript.json")) throw new Error("Unnecessary full document transfer");
                return target.get(name,...args);
              };
              const value=target[key]; return typeof value === "function" ? value.bind(target) : value;
            }
          }) : env.TICKETING;
          return readJsonTicketTranscript(request,bucket);
        }
        const input = await request.json();
        try {
          if(path === "/fixture/attachment") {
            const bytes=new TextEncoder().encode(input.content);
            const body=input.bodyType === "buffer" ? bytes.buffer : input.bodyType === "blob" ? new Blob([bytes]) : input.bodyType === "stream" ? new Blob([bytes]).stream() : bytes;
            await storeTranscriptAttachment(env.TICKETING,input.capability,input.attachment,body);
          } else if(path === "/fixture/attachment-stored") {
            const prefix=await jsonTranscriptStoragePrefix(input.capability);
            return Response.json({stored:!!await env.TICKETING.head(prefix+"/attachments/"+input.attachmentId)});
          } else if(path === "/fixture/document") {
            return Response.json(await storeTicketTranscript(env.TICKETING,input.capability,input.document));
          } else if(path === "/fixture/corrupt") {
            const prefix=await jsonTranscriptStoragePrefix(input.capability);
            await env.TICKETING.put(prefix+"/transcript.json","corrupt");
          }
          return Response.json({ok:true});
        } catch(error) { return Response.json({error:String(error)}, {status:409}); }
      }};
    ` },
    bundle: true, write: false, format: "esm", platform: "browser", external: ["cloudflare:*"],
  })
  runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundled.outputFiles[0]!.text,
    compatibilityDate: "2026-08-22", compatibilityFlags: ["nodejs_compat"], r2Buckets: ["TICKETING"],
    outboundService: () => { throw new Error("Transcript storage must not contact a provider") },
  }))
})
afterAll(async () => { await runtime?.dispose() })

describe("new JSON transcripts with actual local R2/Workerd", () => {
  it("keeps missing, malformed, unsupported and old HTML URLs private", async () => {
    for (const suffix of ["", "/channel.html", "/thread.html", "/attachments/not-a-uuid", "?anything=1"]) {
      const response = await read(suffix)
      expect(response.status).toBe(404)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(response.headers.has("x-request-id")).toBe(false)
      expect(response.headers.has("access-control-allow-origin")).toBe(false)
    }
    expect((await read("", "POST")).status).toBe(404)
    const head = await read("", "HEAD")
    expect(head.status).toBe(404)
    expect(await head.text()).toBe("")
  })

  it("publishes JSON only after checksum-verified attachments and supports safe retries", async () => {
    const content = "attachment fixture"
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content))
    const sha256 = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("")
    const attachment = { id: attachmentId, filename: 'report\r\nInjected: yes\ud800.html', size: content.length, contentType: "text/html", sha256 }
    const document = { ...jsonTranscriptFixture, attachments: [attachment], channels: [{ ...jsonTranscriptFixture.channels[0], messages: [
      { ...jsonTranscriptFixture.channels[0]!.messages[0], attachmentIds: [attachmentId] },
    ] }] }
    // Neither the document nor an attachment is public before all storage succeeds.
    expect((await write("document", { capability, document })).status).toBe(409)
    expect((await read()).status).toBe(404)
    expect((await write("attachment", { capability, attachment, content: "tampered" })).status).toBe(409)
    expect((await write("attachment", { capability, attachment, content })).status).toBe(200)
    expect((await read(`/attachments/${attachmentId}`)).status).toBe(404)
    expect((await write("attachment", { capability, attachment, content })).status).toBe(200)
    expect((await write("document", { capability, document })).status).toBe(200)
    expect((await write("document", { capability, document })).status).toBe(200)
    expect((await write("document", { capability, document: { ...document, ticket: { ...document.ticket, number: "43" } } })).status).toBe(409)
    const response = await read()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(document)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(response.headers.get("content-disposition")).toContain("transcript.json")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    const download = await read(`/attachments/${attachmentId}`)
    expect(download.status).toBe(200)
    expect(await download.text()).toBe(content)
    expect(download.headers.get("content-type")).toBe("application/octet-stream")
    expect(download.headers.get("content-disposition")).toContain("%0D%0A")
    expect(download.headers.get("content-disposition")).toContain("%EF%BF%BD")
    expect(download.headers.has("injected")).toBe(false)
    expect((await read("/attachments/00000000-0000-4000-8000-000000000003")).status).toBe(404)
    for (const suffix of ["", `/attachments/${attachmentId}`]) {
      const head = await read(suffix, "HEAD")
      expect(head.status).toBe(200)
      expect(await head.text()).toBe("")
      const indexed = await runtime.dispatchFetch(`https://fixture.test${path}${suffix}`, {
        method: "HEAD", headers: { "x-fixture-block-document-body": "1" },
      })
      expect(indexed.status).toBe(200)
    }
    const indexedDownload = await runtime.dispatchFetch(`https://fixture.test${path}/attachments/${attachmentId}`, {
      headers: { "x-fixture-block-document-body": "1" },
    })
    expect(indexedDownload.status).toBe(200)
    expect(await indexedDownload.text()).toBe(content)
  })

  it("rejects oversized or incomplete JSON without exposing a partial transcript", async () => {
    const other = "00000000-0000-4000-8000-000000000004"
    const incomplete = { ...jsonTranscriptFixture, captureStartedAt: "2026-09-05T12:00:00Z" }
    expect((await write("document", { capability: other, document: incomplete })).status).toBe(409)
    const oversized = { ...jsonTranscriptFixture, channels: [{ ...jsonTranscriptFixture.channels[0], messages:
      Array.from({ length: 90 }, (_, index) => ({ ...jsonTranscriptFixture.channels[0]!.messages[0], id: String(1000 + index), content: "x".repeat(100_000) })),
    }] }
    const response = await write("document", { capability: other, document: oversized })
    expect(response.status).toBe(409)
    expect(await response.text()).toContain("JSON size limit")
    expect((await runtime.dispatchFetch(`https://fixture.test/v2/ticket-transcripts/${other}`)).status).toBe(404)
  })

  it.each(["view", "buffer", "blob", "stream"].flatMap(bodyType => [-1, 1].map(delta => ({ bodyType, delta }))))("rejects a $bodyType attachment size delta of $delta before storing an immutable object", async ({ bodyType, delta }) => {
    const isolated = `00000000-0000-4000-8000-0000000000${delta === -1 ? "1" : "2"}${["view", "buffer", "blob", "stream"].indexOf(bodyType)}`
    const content = "attachment fixture"
    const bytes = new TextEncoder().encode(content)
    const hash = await crypto.subtle.digest("SHA-256", bytes)
    const sha256 = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("")
    const attachment = { id: attachmentId, filename: "fixture.txt", size: bytes.byteLength + delta, contentType: "text/plain", sha256 }
    expect((await write("attachment", { capability: isolated, attachment, content, bodyType })).status).toBe(409)
    expect(await (await write("attachment-stored", { capability: isolated, attachmentId })).json()).toEqual({ stored: false })
    const corrected = { ...attachment, size: bytes.byteLength }
    expect((await write("attachment", { capability: isolated, attachment: corrected, content, bodyType })).status).toBe(200)
    expect((await write("attachment", { capability: isolated, attachment: corrected, content, bodyType })).status).toBe(200)
  })

  it("fails closed on corrupt storage and never falls back to HTML or another service", async () => {
    expect((await write("corrupt", { capability })).status).toBe(200)
    const response = await read()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ code: "upstream_unavailable", message: "Transcript unavailable" })
    expect((await read(`/attachments/${attachmentId}`)).status).toBe(503)
  })
})
