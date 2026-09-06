import { ApproveMessages } from "@clashking/api-contracts"
import { TicketApplicationForm } from "@clashking/api-contracts/deferred-runtime"
import { Schema } from "effect"
import { Conflict, InvalidRequest } from "./errors.js"
import type { VerifiedRuntimeInteraction } from "./runtime-interaction.js"
import { approvalCustomFields, approvalFieldPages } from "./ticket-approval-template.js"

export const ApprovalProgress = Schema.Struct({
  stage: Schema.Literals(["select", "modal", "continue", "complete"]),
  page: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  template: Schema.String.check(Schema.isMaxLength(2000)),
  templateIndex: Schema.NullOr(Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 24 }))),
  answers: Schema.Array(Schema.String.check(Schema.isMaxLength(75))),
})
export type ApprovalProgress = typeof ApprovalProgress.Type
export const initialApprovalProgress = (): ApprovalProgress => ({ stage: "select", page: 0, template: "", templateIndex: null, answers: [] })

/** Indices are scoped to the immutable panel revision, never parsed from names. */
export const approvalForm = (id: string, names: readonly string[], progress: ApprovalProgress): typeof TicketApplicationForm.Type => {
  if (progress.stage === "select") return {
    kind: "string_select", customId: `ck:ticket:select:${id}`, content: "Choose the message to send to this ticket.",
    placeholder: "Select message", minValues: 1, maxValues: 1,
    options: names.map((name, index) => ({ label: name, value: String(index) })),
  }
  if (progress.stage === "continue") return {
    kind: "continue", customId: `ck:ticket:continue:${id}:${progress.page}`,
    content: "Continue to the next page of custom message fields.", label: "Continue",
  }
  const page = approvalFieldPages(progress.template)[progress.page]
  if (progress.stage !== "modal" || !page) throw new Conflict({ message: "Ticket approval form is no longer available" })
  return { kind: "modal", customId: `ck:ticket:answers:${id}:${progress.page}`, title: "Custom message fields",
    fields: page.map(({ token: _token, ...field }) => field) }
}

const modalValues = (components: readonly unknown[] | undefined): Map<string, string> => {
  const values = new Map<string, string>()
  const visit = (value: unknown, depth: number): void => {
    if (depth > 5) throw new InvalidRequest({ message: "Ticket approval form nesting is invalid" })
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return }
    if (typeof value !== "object" || value === null) throw new InvalidRequest({ message: "Ticket approval form component is invalid" })
    const record = value as Record<string, unknown>
    if (record.type === 1 && Array.isArray(record.components)) { visit(record.components, depth + 1); return }
    if (record.type === 18 && typeof record.component === "object" && record.component !== null) { visit(record.component, depth + 1); return }
    if (record.type !== 4 || typeof record.custom_id !== "string" || typeof record.value !== "string" || values.has(record.custom_id)) {
      throw new InvalidRequest({ message: "Ticket approval form contains invalid or duplicate fields" })
    }
    values.set(record.custom_id, record.value)
  }
  if (!components) throw new InvalidRequest({ message: "Ticket approval form fields are missing" })
  visit(components, 0)
  return values
}

/** SQL callers must first establish actor/guild/channel, freshness and current panel revision. */
export const advanceApprovalForm = (
  id: string, progress: ApprovalProgress, interaction: VerifiedRuntimeInteraction,
  templates: typeof ApproveMessages.Type,
): ApprovalProgress => {
  if (progress.stage === "select") {
    const selected = interaction.data.values
    if (interaction.type !== 3 || interaction.data.component_type !== 3 || interaction.data.custom_id !== `ck:ticket:select:${id}` ||
      selected?.length !== 1 || !/^(?:[0-9]|1[0-9]|2[0-4])$/u.test(selected[0]!)) {
      throw new InvalidRequest({ message: "A matching approval template selection is required" })
    }
    const index = Number(selected[0]), template = templates[index]?.message
    if (template === undefined) throw new InvalidRequest({ message: "Selected approval template is not available" })
    return { stage: approvalCustomFields(template).length ? "modal" : "complete", page: 0, template, templateIndex: index, answers: [] }
  }
  if (progress.stage === "continue") {
    if (interaction.type !== 3 || interaction.data.component_type !== 2 || interaction.data.custom_id !== `ck:ticket:continue:${id}:${progress.page}`) {
      throw new InvalidRequest({ message: "A matching approval continuation is required" })
    }
    return { ...progress, stage: "modal" }
  }
  if (progress.stage !== "modal" || interaction.type !== 5 || interaction.data.custom_id !== `ck:ticket:answers:${id}:${progress.page}`) {
    throw new InvalidRequest({ message: "A matching approval form page is required" })
  }
  const pages = approvalFieldPages(progress.template), page = pages[progress.page]
  if (!page || progress.answers.length !== progress.page * 5) throw new Conflict({ message: "Ticket approval form progress is invalid" })
  const values = modalValues(interaction.data.components)
  if (values.size !== page.length || [...values.keys()].some(key => !page.some(field => field.customId === key))) {
    throw new InvalidRequest({ message: "Ticket approval form contains missing or unexpected fields" })
  }
  const answers = [...progress.answers]
  for (const field of page) {
    const value = values.get(field.customId)!
    if (!value.trim() || value.length > field.maxLength) throw new InvalidRequest({ message: "Ticket approval custom fields require 1 to 75 characters" })
    answers.push(value)
  }
  return { ...progress, answers, page: progress.page + 1, stage: progress.page + 1 === pages.length ? "complete" : "continue" }
}

export const approvalAnswers = (progress: ApprovalProgress): Readonly<Record<string, string>> => {
  const fields = approvalCustomFields(progress.template)
  if (progress.stage !== "complete" || fields.length !== progress.answers.length) throw new Conflict({ message: "Ticket approval answers are incomplete" })
  return Object.fromEntries(fields.map((field, index) => [field, progress.answers[index]!]))
}
