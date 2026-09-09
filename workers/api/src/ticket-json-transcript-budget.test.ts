import { describe, expect, it, vi } from "vitest"
import { assertTranscriptJsonBudget, isJsonTranscriptRequest, storeTicketTranscript } from "./ticket-json-transcript.js"
import { jsonTranscriptFixture } from "../test/fixtures/json-transcript.js"

describe("transcript JSON preflight budget", () => {
  it("keeps encoded, case-varied and malformed transcript namespaces inside the quiet boundary", () => {
    for (const path of ["/v2/ticket-transcripts/secret", "/v2/ticket%2Dtranscripts/secret", "/V2/TICKET-TRANSCRIPTS/secret", "/v2/%zz"]) {
      expect(isJsonTranscriptRequest(new Request(`https://api.clashk.ing${path}`))).toBe(true)
    }
    expect(isJsonTranscriptRequest(new Request("https://api.clashk.ing/v2/health"))).toBe(false)
    expect(isJsonTranscriptRequest(new Request("https://api.clashk.ing/v2/ticket-transcripts-extra"))).toBe(false)
  })

  it.each([
    null, true, false, 0, -0, 1e30, "plain", "é漢字😀\ud800\udfff\u0000\b\f\n\r\t\\\"",
    { unicode: "😀", values: [1, true, null, { empty: [] }] },
  ])("counts the exact serialized UTF-8 bytes without allocating the serialized value %#", value => {
    const size = new TextEncoder().encode(JSON.stringify(value)).byteLength
    expect(() => assertTranscriptJsonBudget(value, size)).not.toThrow()
    expect(() => assertTranscriptJsonBudget(value, size - 1)).toThrow("JSON size limit")
  })

  it("rejects oversized nested embeds before decoding, JSON serialization or R2 access", async () => {
    const nested = { items: Array(100).fill("x".repeat(100_000)) }
    const input = { ...jsonTranscriptFixture, channels: [{ ...jsonTranscriptFixture.channels[0], messages: [
      { ...jsonTranscriptFixture.channels[0]!.messages[0], embeds: [nested] },
    ] }] }
    const stringify = vi.spyOn(JSON, "stringify")
    const head = vi.fn(), put = vi.fn()
    try {
      await expect(storeTicketTranscript({ head, put } as unknown as R2Bucket,
        "00000000-0000-4000-8000-000000000001", input)).rejects.toThrow("JSON size limit")
      expect(stringify).not.toHaveBeenCalled()
      expect(head).not.toHaveBeenCalled()
      expect(put).not.toHaveBeenCalled()
    } finally { stringify.mockRestore() }
  })

  it("rejects cycles, excessive nesting, sparse arrays and executable properties without invoking them", () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(() => assertTranscriptJsonBudget(cyclic)).toThrow("acyclic")
    let deep: unknown = null
    for (let index = 0; index < 66; index++) deep = { child: deep }
    expect(() => assertTranscriptJsonBudget(deep)).toThrow("nesting")
    expect(() => assertTranscriptJsonBudget(Array(5))).toThrow("plain JSON")
    const getter = vi.fn(() => "secret")
    expect(() => assertTranscriptJsonBudget(Object.defineProperty({}, "value", { enumerable: true, get: getter }))).toThrow("getters")
    const toJSON = vi.fn(() => "bypass")
    expect(() => assertTranscriptJsonBudget(Object.defineProperty([], "toJSON", { value: toJSON }))).toThrow("serializers")
    expect(getter).not.toHaveBeenCalled()
    expect(toJSON).not.toHaveBeenCalled()
  })

  it("permits repeated references when they are not cycles and rejects oversized sparse arrays immediately", () => {
    const shared = { value: "same" }
    expect(() => assertTranscriptJsonBudget([shared, shared])).not.toThrow()
    expect(() => assertTranscriptJsonBudget(Array(100_000_000))).toThrow("JSON size limit")
  })
})
