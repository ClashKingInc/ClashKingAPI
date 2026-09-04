import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { VerifiedRuntimeInteraction } from "./runtime-interaction.js"
import { parseTicketStaffAction } from "./ticket-staff-actions.js"

const interaction = (data: VerifiedRuntimeInteraction["data"], type: 2 | 3 = 2): VerifiedRuntimeInteraction => ({
  id: "123456789012345678", actorId: "223456789012345678", actorLabel: "Staff", actorRoleIds: [],
  guildId: "323456789012345678", channelId: "423456789012345678", messageId: "523456789012345678",
  permissions: "0", requestHash: "a".repeat(64), signedAt: Date.now(), type, data,
})
const command = (name: string, option: string, value: unknown, type = 3) => interaction({ name: "ticket", options: [
  { type: 1, name, options: [{ type, name: option, value }] },
] })
describe("signed ticket staff action grammar", () => {
  it.each(["open", "sleep", "close", "delete"])("preserves status %s", async (status) => {
    expect(await Effect.runPromise(parseTicketStaffAction(command("status", "status", status))))
      .toEqual({ action: "set_status", status: status === "close" ? "closed" : status })
  })
  it("allows only actor-owned opt and a signed member snowflake for add", async () => {
    expect(await Effect.runPromise(parseTicketStaffAction(command("opt", "opt", "In")))).toEqual({ action: "opt", enabled: true })
    expect(await Effect.runPromise(parseTicketStaffAction(command("opt", "opt", "Out")))).toEqual({ action: "opt", enabled: false })
    expect(await Effect.runPromise(parseTicketStaffAction(command("add", "member", "623456789012345678", 6))))
      .toEqual({ action: "add_member", memberId: "623456789012345678" })
  })
  it("rejects extra targets, duplicate options, wrong option types, and legacy controls", async () => {
    const extra = command("opt", "opt", "In")
    const invalid = [
      { ...extra, data: { name: "ticket", options: [{ type: 1, name: "opt", options: [
        { type: 3, name: "opt", value: "In" }, { type: 6, name: "member", value: "623456789012345678" },
      ] }] } },
      command("add", "member", Number("623456789012345678"), 6), command("add", "member", "623456789012345678", 3),
      command("status", "status", "closed"), interaction({ component_type: 2, custom_id: "close_ticket" }, 3),
      { ...extra, data: { ...extra.data, options: [...extra.data.options!, ...extra.data.options!] } },
    ]
    for (const value of invalid) await expect(Effect.runPromise(parseTicketStaffAction(value))).rejects.toBeDefined()
  })
  it.each(["close", "delete", "assign", "approve"])("binds %s to canonical ticket UUID", async (action) => {
    const ticketId = "70000000-0000-4000-8000-000000000001"
    const result = await Effect.runPromise(parseTicketStaffAction(interaction({ component_type: 2, custom_id: `ck:ticket:${action}:${ticketId}` }, 3)))
    expect(result).toEqual(action === "close" || action === "delete"
      ? { action: "set_status", status: action === "close" ? "closed" : "delete", ticketId } : { action, ticketId })
  })
})
