import { TicketApplicationForm } from "@clashking/api-contracts"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import type { VerifiedRuntimeInteraction } from "./runtime-interaction.js"
import { advanceApprovalForm, approvalAnswers, approvalForm, initialApprovalProgress } from "./ticket-approval-form.js"

const id = "00000000-0000-4000-8000-000000000001"
const proof = (type: 3 | 5, data: VerifiedRuntimeInteraction["data"]): VerifiedRuntimeInteraction => ({
  type, data, id: "123", actorId: "124", actorLabel: "staff", actorRoleIds: [], guildId: "125", channelId: "126", messageId: "127",
  permissions: "32", requestHash: "a".repeat(64), signedAt: Date.now(),
})
const select = (value: string) => proof(3, { component_type: 3, custom_id: `ck:ticket:select:${id}`, values: [value] })
const modal = (page: number, fields: Array<{ customId: string; value: string }>) => proof(5, {
  custom_id: `ck:ticket:answers:${id}:${page}`, components: fields.map(field => ({ type: 1, components: [{ type: 4, custom_id: field.customId, value: field.value }] })),
})

describe("ticket approval forms", () => {
  it("offers all 25 templates with index identities independent of punctuation or Unicode names", () => {
    const templates = Array.from({ length: 25 }, (_, index) => ({ name: `Approved_${index} 🌍`, message: `Message ${index}` }))
    const form = approvalForm(id, templates.map(item => item.name), initialApprovalProgress())
    expect(Schema.is(TicketApplicationForm)(form)).toBe(true)
    expect(form.kind === "string_select" && form.options.at(-1)).toEqual({ label: "Approved_24 🌍", value: "24" })
    expect(advanceApprovalForm(id, initialApprovalProgress(), select("24"), templates)).toMatchObject({ stage: "complete", template: "Message 24", templateIndex: 24 })
    for (const value of ["25", "-1", "01", "1e0", "Approved_1 🌍"]) expect(() => advanceApprovalForm(id, initialApprovalProgress(), select(value), templates)).toThrow()
  })
  it("requires a continuation between modal pages and retains every answer without substitution", () => {
    const templates = [{ name: "approval", message: "{a}{b}{c}{d}{e}{f}{g}" }]
    let progress = advanceApprovalForm(id, initialApprovalProgress(), select("0"), templates)
    const form = approvalForm(id, ["approval"], progress)
    expect(Schema.is(TicketApplicationForm)(form)).toBe(true)
    progress = advanceApprovalForm(id, progress, modal(0, Array.from({ length: 5 }, (_, index) => ({ customId: `approval-field:${index}`, value: `{answer_${index}}` }))), templates)
    expect(progress.stage).toBe("continue")
    expect(() => advanceApprovalForm(id, progress, modal(1, []), templates)).toThrow("continuation")
    progress = advanceApprovalForm(id, progress, proof(3, { component_type: 2, custom_id: `ck:ticket:continue:${id}:1` }), templates)
    progress = advanceApprovalForm(id, progress, modal(1, [{ customId: "approval-field:5", value: "six" }, { customId: "approval-field:6", value: "seven" }]), templates)
    expect(approvalAnswers(progress)).toEqual({ a: "{answer_0}", b: "{answer_1}", c: "{answer_2}", d: "{answer_3}", e: "{answer_4}", f: "six", g: "seven" })
  })
  it("rejects duplicate, missing, unexpected, blank, oversized and stale-page fields", () => {
    const templates = [{ name: "approval", message: "{custom}" }]
    const progress = advanceApprovalForm(id, initialApprovalProgress(), select("0"), templates)
    for (const fields of [[], [{ customId: "wrong", value: "answer" }], [{ customId: "approval-field:0", value: " " }],
      [{ customId: "approval-field:0", value: "x".repeat(76) }], [{ customId: "approval-field:0", value: "one" }, { customId: "approval-field:0", value: "two" }]]) {
      expect(() => advanceApprovalForm(id, progress, modal(0, fields), templates)).toThrow()
    }
    expect(() => advanceApprovalForm(id, progress, modal(1, [{ customId: "approval-field:0", value: "answer" }]), templates)).toThrow()
    expect(() => approvalAnswers(progress)).toThrow("incomplete")
  })
  it("accepts Discord label-wrapped text inputs and prototype-like custom field names safely", () => {
    const templates = [{ name: "approval", message: "{__proto__}" }]
    const progress = advanceApprovalForm(id, initialApprovalProgress(), select("0"), templates)
    const complete = advanceApprovalForm(id, progress, proof(5, { custom_id: `ck:ticket:answers:${id}:0`, components: [
      { type: 18, component: { type: 4, custom_id: "approval-field:0", value: "literal" } },
    ] }), templates)
    expect(Object.hasOwn(approvalAnswers(complete), "__proto__")).toBe(true)
    expect(approvalAnswers(complete).__proto__).toBe("literal")
  })
  it("handles hundreds of distinct Unicode fields without truncating pages or values", () => {
    const names = Array.from({ length: 600 }, (_, index) => String.fromCharCode(0x4e00 + index))
    const templates = [{ name: "large", message: names.map(name => `{${name}}`).join("") }]
    let progress = advanceApprovalForm(id, initialApprovalProgress(), select("0"), templates)
    let pages = 0
    while (progress.stage !== "complete") {
      if (progress.stage === "continue") progress = advanceApprovalForm(id, progress, proof(3, { component_type: 2, custom_id: `ck:ticket:continue:${id}:${progress.page}` }), templates)
      const form = approvalForm(id, ["large"], progress)
      expect(Schema.is(TicketApplicationForm)(form)).toBe(true)
      if (form.kind !== "modal") throw new Error("Expected modal")
      progress = advanceApprovalForm(id, progress, modal(progress.page, form.fields.map(field => ({ customId: field.customId, value: "界".repeat(75) }))), templates)
      pages++
    }
    expect(pages).toBe(120)
    expect(Object.keys(approvalAnswers(progress))).toHaveLength(600)
    expect(progress.answers.every(answer => answer === "界".repeat(75))).toBe(true)
    expect(new TextEncoder().encode(JSON.stringify(progress)).byteLength).toBeGreaterThan(32768)
    expect(new TextEncoder().encode(JSON.stringify(progress)).byteLength).toBeLessThan(524288)
  })
})
