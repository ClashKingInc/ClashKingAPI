import { TicketButtonSettings } from "@clashking/api-contracts"
import { TicketModalField } from "@clashking/api-contracts/deferred-runtime"
import { Schema } from "effect"
type Settings = typeof TicketButtonSettings.Type
export type TicketApplicationField = typeof TicketModalField.Type

export const ticketQuestionError = (settings: Pick<Settings, "application_questions" | "account_apply">): string | undefined => {
  const questions = settings.application_questions
  if (questions === undefined) return undefined
  if (questions.length > (settings.account_apply ? 4 : 5)) return "The modal supports five fields, including the account selector"
  const ids = new Set<string>()
  for (const question of questions) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/iu.test(question.id) || ids.has(question.id)
      || !question.label.trim() || question.label.length > 45) return "Questions need unique IDs and labels of 1–45 characters"
    ids.add(question.id)
    if (question.type === "single_select" && (!question.options.length || question.options.length > 25
      || question.options.some(option => !option.trim() || option.length > 100)
      || new Set(question.options).size !== question.options.length)) return "Dropdowns need 1–25 unique options of 1–100 characters"
    if (question.type !== "single_select" && question.options.length) return "Only dropdown questions can have custom options"
  }
  return undefined
}

export function ticketApplicationPages(settings: Settings, accounts: readonly { tag: string; label: string; townhall?: number }[]) {
  const error = ticketQuestionError(settings)
  if (error) throw new Error(error)
  const questions = settings.application_questions ?? settings.questions.filter(question => question.trim()).map((label, order) => ({
    id: `legacy-${order}`, label, order, type: "text" as const, required: true, options: [],
  }))
  const fields: TicketApplicationField[] = questions.map((question, index) => question.type === "text"
    ? { customId: `q:${index}`, label: question.label.slice(0, 45), required: question.required, style: "paragraph", maxLength: 500 }
    : { customId: `q:${index}`, label: question.label, required: question.required, style: "select",
      minValues: question.required ? 1 : 0, maxValues: 1,
      options: (question.type === "boolean" ? ["Yes", "No"] : question.options).map(label => ({ label, value: label })) })
  if (settings.account_apply) fields.unshift({ customId: "account", label: "Choose an account to apply with", required: true, style: "select",
    minValues: 1, maxValues: 1,
    options: accounts.map(account => ({ value: account.tag, label: account.label, description: account.tag,
      ...(account.townhall === undefined ? {} : { townhall: account.townhall }) })) })
  return { questions: questions.map(question => question.label), pages: Array.from({ length: Math.ceil(fields.length / 5) }, (_, page) => fields.slice(page * 5, page * 5 + 5)) }
}

export function ticketModalAnswers(page: readonly TicketApplicationField[], submitted: ReadonlyMap<string, { value?: string; values?: readonly string[] }>) {
  if ([...submitted.keys()].some(key => !page.some(field => field.customId === key))) throw new Error("Ticket form contains unexpected fields")
  const answers: Record<string, string> = {}
  let accounts: readonly string[] | undefined
  for (const field of page) {
    const input = submitted.get(field.customId)
    if (field.style === "select") {
      const values = input?.values ?? []
      if (input?.value !== undefined || values.length < field.minValues || values.length > field.maxValues
        || new Set(values).size !== values.length || values.some(value => !field.options.some(option => option.value === value))) throw new Error(`Invalid selection for ${field.customId}`)
      if (field.customId === "account") accounts = values
      else answers[field.customId] = values[0] ?? ""
    } else {
      const value = input?.value ?? ""
      if (input?.values !== undefined || value.length > field.maxLength || field.required && !value.trim()) throw new Error(`Invalid answer for ${field.customId}`)
      answers[field.customId] = value
    }
  }
  return { answers, ...(accounts === undefined ? {} : { accounts }) }
}

export const decodeTicketApplicationPages = Schema.Array(Schema.Array(TicketModalField))
