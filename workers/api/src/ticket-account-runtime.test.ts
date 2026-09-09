import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { parseTicketAccountAction } from "./ticket-account-runtime.js"
import type { VerifiedRuntimeInteraction } from "./runtime-interaction.js"

const id = "20000000-0000-4000-8000-000000000001"
const interaction = (customId: string, overrides: Partial<VerifiedRuntimeInteraction> = {}): VerifiedRuntimeInteraction => ({
  id: "1234567890123456789", actorId: "2234567890123456789", actorLabel: "Viewer", actorRoleIds: [],
  guildId: "3234567890123456789", channelId: "4234567890123456789", messageId: "5234567890123456789",
  permissions: "0", requestHash: "a".repeat(64), signedAt: Date.now(), type: 3,
  data: { custom_id: customId, component_type: 2 }, ...overrides,
})

describe("ticket account control parsing", () => {
  it("accepts canonical initial buttons and session-bound single selections", async () => {
    expect(await Effect.runPromise(parseTicketAccountAction(interaction(`ck:ticket:accounts-view:${id}`))))
      .toEqual({ kind: "prepare", ticketId: id })
    expect(await Effect.runPromise(parseTicketAccountAction(interaction(`ck:ticket:account-view:${id}`, {
      data: { custom_id: `ck:ticket:account-view:${id}`, component_type: 3, values: ["#PYL"] },
    })))).toEqual({ kind: "select", sessionId: id, tag: "#PYL" })
  })
  it.each(["ticket_accounts", `ck:ticket:accounts-view:${id}:extra`, "ck:ticket:accounts-view:invalid"])("rejects noncanonical ID %s", async (customId) => {
    await expect(Effect.runPromise(parseTicketAccountAction(interaction(customId)))).rejects.toMatchObject({ _tag: "Forbidden" })
  })
  it("rejects absent source messages, wrong component types and multiple values", async () => {
    for (const proof of [
      interaction(`ck:ticket:accounts-view:${id}`, { messageId: undefined }),
      interaction(`ck:ticket:accounts-view:${id}`, { type: 5 }),
      interaction(`ck:ticket:account-view:${id}`, { data: { custom_id: `ck:ticket:account-view:${id}`, component_type: 3, values: ["#PYL", "#PYC"] } }),
    ]) await expect(Effect.runPromise(parseTicketAccountAction(proof))).rejects.toMatchObject({ _tag: "Forbidden" })
  })
  it("accepts preparation-bound linking buttons but rejects malformed controls", async () => {
    expect(await Effect.runPromise(parseTicketAccountAction(interaction(`ck:ticket:link:${id}`))))
      .toEqual({ kind: "link-form", preparationId: id })
    for (const proof of [
      interaction(`ck:ticket:link:${id}:extra`),
      interaction(`ck:ticket:link:${id}`, { messageId: undefined }),
      interaction(`ck:ticket:link:${id}`, { type: 5 }),
      interaction(`ck:ticket:link:${id}`, { data: { custom_id: `ck:ticket:link:${id}`, component_type: 3 } }),
    ]) await expect(Effect.runPromise(parseTicketAccountAction(proof))).rejects.toMatchObject({ _tag: "Forbidden" })
  })
  it("keeps link mutation gated while durable post-link effects are unresolved", async () => {
    await expect(Effect.runPromise(parseTicketAccountAction(interaction(`ck:ticket:link-submit:${id}`, { type: 5 })))).rejects.toMatchObject({ _tag: "Conflict" })
  })
})
