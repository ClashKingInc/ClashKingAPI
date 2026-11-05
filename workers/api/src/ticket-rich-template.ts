import { TicketPanelMessage, TicketMessageTemplate } from "@clashking/api-contracts"
import { Schema } from "effect"
import { approvalCustomFields, renderApprovalMessages, ticketApprovalTokens, type TicketApprovalToken } from "./ticket-approval-template.js"

/** Substitute human-readable fields only. IDs, option values, colors and URLs remain configuration. */
const mapText = (message: typeof TicketPanelMessage.Type, replace: (text: string) => string): unknown => {
  const walk = (value: unknown, path: readonly string[]): unknown => {
    if (Array.isArray(value)) return value.map(child => walk(child, path))
    if (value === null || typeof value !== "object") return value
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
      typeof child === "string" && (["content", "title", "description", "text", "label", "placeholder"].includes(key)
        || key === "name" && !path.includes("emoji") || key === "value" && path.includes("fields"))
        ? replace(child) : walk(child, [...path, key])]))
  }
  return walk(message, [])
}
export const ticketTemplateText = (message: typeof TicketPanelMessage.Type): string => {
  const parts: string[] = []
  mapText(message, text => { parts.push(text); return text })
  return parts.join("\n")
}
export const runtimeMessageTemplate = (template: typeof TicketMessageTemplate.Type) => ({
  name: template.name, message: ticketTemplateText(template.message), rich_message: template.message,
  question_labels: Object.fromEntries(template.questions.map(question => [question.key, question.label])),
})
export const ticketTemplateQuestionError = (template: typeof TicketMessageTemplate.Type): string | undefined => {
  if (new TextEncoder().encode(JSON.stringify(runtimeMessageTemplate(template))).byteLength > 200000) return "This message is too large for an interactive ticket message; shorten its text or media URLs"
  const fields = approvalCustomFields(ticketTemplateText(template.message))
  if (fields.length > 25) return "A message can ask at most 25 custom questions"
  if (template.questions.some(question => ticketApprovalTokens.includes(question.key as TicketApprovalToken) || !fields.includes(question.key))) return "Each question must match a custom placeholder in the message"
  return undefined
}
export const renderRichTicketTemplate = (message: typeof TicketPanelMessage.Type,
  builtins: Readonly<Partial<Record<TicketApprovalToken, string>>>, answers: Readonly<Record<string, string>>) =>
  Schema.decodeUnknownSync(TicketPanelMessage)(mapText(message, text => {
    if (!text.trim()) return text
    const chunks = renderApprovalMessages(text, builtins, answers)
    return chunks.join("")
  }), { onExcessProperty: "error" })
