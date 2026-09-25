import { Effect } from "effect"
import { InvalidRequest } from "./errors.js"

export interface RosterQuestion { id: string; label: string; type: "text" | "boolean" | "single_select"; required: boolean; order: number; options: string[] }
export const normalizeRosterQuestions = (raw: unknown) => Effect.try({
  try: (): RosterQuestion[] => {
    if (!Array.isArray(raw) || raw.length > 4) throw Error()
    const ids = new Set<string>()
    return raw.map((item, order) => {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(item.id)
        || ["account", "account_selector", "player", "player_selector"].includes(item.id.toLowerCase()) || ids.has(item.id)
        || typeof item.label !== "string" || !item.label.trim() || item.label.length > 45
        || !["text", "boolean", "single_select"].includes(item.type) || typeof item.required !== "boolean") throw Error()
      ids.add(item.id)
      const options = item.options ?? []
      if (!Array.isArray(options) || (item.type === "single_select" ? options.length < 1 || options.length > 25 : options.length !== 0)
        || options.some(value => typeof value !== "string" || !value.trim() || value.length > 100)
        || new Set(options).size !== options.length) throw Error()
      return { id: item.id, label: item.label.trim(), type: item.type, required: item.required, order, options }
    })
  },
  catch: () => new InvalidRequest({ message: "Use up to four questions with unique IDs, labels of 1–45 characters, and up to 25 unique dropdown options of 1–100 characters" }),
})
