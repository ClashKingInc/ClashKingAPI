import { InvalidRequest } from "./errors.js"

export const ticketApprovalTokens = [
  "ticket_count", "ticket_status", "ticket_emoji_status", "ticket_channel_mention", "user_name", "user_mention",
  "server_name", "server_member_count", "account_name", "account_th", "account_heroes", "clan_name", "clan_level",
  "clan_badge_emoji", "clan_link", "clan_location", "clan_member_count", "clan_leader", "clan_leader_mention",
  "clan_tag", "clan_war_league", "clan_capital_league",
] as const
export type TicketApprovalToken = typeof ticketApprovalTokens[number]
const known = new Set<string>(ticketApprovalTokens)
const tokens = /\{([^{}\r\n]+)\}/gu

/** Parse only the saved template, never text returned by a player or Discord. */
export const approvalCustomFields = (template: string): ReadonlyArray<string> => {
  const result: string[] = []
  for (const match of template.matchAll(tokens)) {
    const token = match[1]!
    if (!known.has(token) && !result.includes(token)) result.push(token)
  }
  return result
}

/** Preserve every distinct custom field, in order, across Discord's five-field pages. */
export const approvalFieldPages = (template: string) => {
  const fields = approvalCustomFields(template)
  return Array.from({ length: Math.ceil(fields.length / 5) }, (_, page) => fields.slice(page * 5, page * 5 + 5).map((token, index) => ({
    token, customId: `approval-field:${page * 5 + index}`, label: `{${token}}`.slice(0, 45),
    required: true as const, style: "short" as const, maxLength: 75,
  })))
}

/** One substitution pass prevents account names and answers from injecting more fields. */
export const renderApprovalMessages = (
  template: string,
  builtins: Readonly<Partial<Record<TicketApprovalToken, string>>>,
  answers: Readonly<Record<string, string>>,
): ReadonlyArray<string> => {
  const rendered = template.replace(tokens, (_, token: string) => {
    const values = known.has(token) ? builtins : answers
    if (!Object.hasOwn(values, token)) throw new InvalidRequest({ message: `Ticket approval field is unresolved: ${token}` })
    const value = values[token as keyof typeof values]
    if (typeof value !== "string") throw new InvalidRequest({ message: "Ticket approval field value must be text" })
    if (!known.has(token) && (value.length === 0 || value.length > 75)) {
      throw new InvalidRequest({ message: "Ticket approval custom fields require 1 to 75 characters" })
    }
    return value
  })
  if (rendered.trim() === "") throw new InvalidRequest({ message: "Ticket approval message is empty" })
  const parts: string[] = []
  for (let offset = 0; offset < rendered.length;) {
    let end = Math.min(offset + 2000, rendered.length)
    // Never split a Unicode surrogate pair at Discord's UTF-16 boundary.
    if (end < rendered.length && /[\uD800-\uDBFF]/u.test(rendered[end - 1]!)) end--
    parts.push(rendered.slice(offset, end)); offset = end
  }
  return parts
}
