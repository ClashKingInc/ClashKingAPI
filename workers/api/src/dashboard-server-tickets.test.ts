import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { TicketButton, TicketPanel, UpdateApproveMessagesRequest } from "@clashking/api-contracts"
import { nextTicketButtonCustomId } from "./dashboard-server-tickets.js"

describe("retained Dashboard ticket configuration", () => {
  it("uses the original name and millisecond button identity without collisions", () => {
    const button = { custom_id: "Apply_123", label: "Join", type: 2, style: 1 }
    expect(nextTicketButtonCustomId("Apply", [], 123)).toBe("Apply_123")
    expect(nextTicketButtonCustomId("Apply", [button], 123)).toBe("Apply_124")
  })

  it("decodes original panels and buttons without speculative UUID identities", () => {
    const button = { custom_id: "Apply_123", label: "Join", type: 2, style: 1 }
    expect(Schema.decodeUnknownSync(TicketButton)(button)).toEqual(button)
    const panel = { name: "Apply", server_id: "123456789012345678", components: [button], button_settings: {}, approve_messages: [] }
    expect(Schema.decodeUnknownSync(TicketPanel)(panel)).toEqual(panel)
  })

  it("accepts baseline approval arrays for handler normalization, including blank names", () => {
    const value = { messages: [{ name: "", message: "Ignored" }, { name: " Welcome ", message: "" }, { name: "Later", message: "Ignored" }] }
    expect(Schema.decodeUnknownSync(UpdateApproveMessagesRequest)(value)).toEqual(value)
  })
})
