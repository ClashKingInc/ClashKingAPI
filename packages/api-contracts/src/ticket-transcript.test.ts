import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { endpoints, TicketTranscriptDocument } from "./index.js"
import { jsonTranscriptFixture } from "../../../workers/api/test/fixtures/json-transcript.js"

const decode = Schema.decodeUnknownSync(TicketTranscriptDocument)
describe("new JSON transcript contracts", () => {
  it("retains structured embeds and plain text without a HTML endpoint", () => {
    expect(decode(jsonTranscriptFixture)).toEqual(jsonTranscriptFixture)
    expect(endpoints.ticketTranscript.responseMode).toBe("json")
    expect(Object.values(endpoints).filter(endpoint => endpoint.path.includes("ticket-transcripts")).map(endpoint => endpoint.path)).toEqual([
      "/v2/ticket-transcripts/:capability", "/v2/ticket-transcripts/:capability/attachments/:attachmentId",
    ])
  })
  it.each([undefined, "<html>old export</html>", { ...jsonTranscriptFixture, schemaVersion: 2 },
    { ...jsonTranscriptFixture, captureStartedAt: "2026-09-05T12:00:00Z" },
    { ...jsonTranscriptFixture, channels: [...jsonTranscriptFixture.channels, ...jsonTranscriptFixture.channels] },
    { ...jsonTranscriptFixture, channels: [{ ...jsonTranscriptFixture.channels[0], messages: [
      { ...jsonTranscriptFixture.channels[0]!.messages[0], attachmentIds: ["00000000-0000-4000-8000-000000000002"] },
    ] }] },
  ])("rejects unsupported/incomplete data %#", value => { expect(() => decode(value)).toThrow() })
  it("accepts explicitly limited history without claiming all history was exported", () => {
    expect(decode({ ...jsonTranscriptFixture, channels: [{ ...jsonTranscriptFixture.channels[0], historyComplete: false }] }).channels[0]!.historyComplete).toBe(false)
  })
  it.each(["2026-02-30T00:00:00Z", "2025-02-29T00:00:00Z", "1900-02-29T00:00:00Z", "2026-04-31T00:00:00Z",
    "2026-09-04T24:00:00Z", "2026-09-04T12:00:00", "2026-09-04T12:00:00+24:00"])("rejects impossible or ambiguous timestamp %s", createdAt => {
    expect(() => decode({ ...jsonTranscriptFixture, channels: [{ ...jsonTranscriptFixture.channels[0], messages: [
      { ...jsonTranscriptFixture.channels[0]!.messages[0], createdAt },
    ] }] })).toThrow()
  })
  it.each(["2024-02-29T00:00:00Z", "2000-02-29T23:59:59.123456+05:30", "2026-09-04T12:00:00-05:00"])("accepts calendar-valid timestamp %s", createdAt => {
    expect(decode({ ...jsonTranscriptFixture, channels: [{ ...jsonTranscriptFixture.channels[0], messages: [
      { ...jsonTranscriptFixture.channels[0]!.messages[0], createdAt },
    ] }] }).channels[0]!.messages[0]!.createdAt).toBe(createdAt)
  })
  it("bounds messages across the entire ticket, including its thread", () => {
    const message = jsonTranscriptFixture.channels[0]!.messages[0]!
    const messages = Array.from({ length: 2_000 }, (_, index) => ({ ...message, id: String(index + 1) }))
    const channel = { ...jsonTranscriptFixture.channels[0]!, messages }
    expect(decode({ ...jsonTranscriptFixture, channels: [channel] }).channels[0]!.messages).toHaveLength(2_000)
    expect(() => decode({ ...jsonTranscriptFixture, channels: [channel, { ...channel, id: "999", messages: [{ ...message, id: "2001" }] }] })).toThrow()
  })
  it("bounds attachment count and total bytes, not only each file", () => {
    const attachment = { id: "00000000-0000-4000-8000-000000000002", filename: "fixture.bin", size: 512 * 1024 * 1024, sha256: "a".repeat(64), contentType: "application/octet-stream" }
    const make = (attachments: typeof attachment[]) => ({ ...jsonTranscriptFixture, attachments,
      channels: [{ ...jsonTranscriptFixture.channels[0], messages: [{ ...jsonTranscriptFixture.channels[0]!.messages[0], attachmentIds: attachments.map(value => value.id) }] }] })
    expect(decode(make([attachment])).attachments).toHaveLength(1)
    expect(() => decode(make([attachment, { ...attachment, id: "00000000-0000-4000-8000-000000000003", size: 1 }]))).toThrow()
    const many = Array.from({ length: 101 }, (_, index) => ({ ...attachment, size: 1, id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` }))
    expect(decode(make(many.slice(0, 100))).attachments).toHaveLength(100)
    expect(() => decode(make(many))).toThrow()
  })
})
