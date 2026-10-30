import type { Schema } from "effect"

const record = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown, maximum: number, required = true) => typeof value === "string" && value.length <= maximum && (!required || value.trim().length > 0)
const integer = (value: unknown, minimum: number, maximum: number) => typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
const url = (value: unknown) => {
  if (typeof value !== "string") return false
  try { const parsed = new URL(value); return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password } catch { return false }
}

/** Discord message components only. Modal inputs are configured separately, never sent as message components. */
export function ticketMessageComponentsError(components: readonly Schema.JsonObject[], v2: boolean): string | undefined {
  let count = 0, characters = 0
  let error: string | undefined
  const fail = (message: string) => { error ??= message; return false }
  const labels: Record<number, string> = { 1: "Action row", 2: "Button", 3: "Select menu", 5: "User menu", 6: "Role menu", 7: "Mentionable menu", 8: "Channel menu", 9: "Section", 10: "Text display", 11: "Thumbnail", 12: "Media gallery", 14: "Separator", 17: "Container" }
  const label = (value: unknown, index: number) => `${labels[Number(record(value).type)] ?? "Component"} ${index + 1}`
  const ids = new Set<string>()
  const visit = (value: unknown, parent: number, depth: number, location: string): boolean => {
    const node = record(value), type = node.type
    if (++count > 40) return fail("The message has more than 40 components. Remove components before saving.")
    if (depth > 4) return fail(`${location} is nested too deeply. Move it closer to the top level.`)
    if (!integer(type, 1, 17)) return fail(`${location} has an unsupported component type.`)
    const allowed: Record<number, readonly string[]> = {
      1: ["components"], 2: ["style", "label", "emoji", "custom_id", "url", "disabled"],
      3: ["custom_id", "options", "placeholder", "min_values", "max_values", "disabled"],
      5: ["custom_id", "placeholder", "min_values", "max_values", "disabled", "default_values"],
      6: ["custom_id", "placeholder", "min_values", "max_values", "disabled", "default_values"],
      7: ["custom_id", "placeholder", "min_values", "max_values", "disabled", "default_values"],
      8: ["custom_id", "placeholder", "min_values", "max_values", "disabled", "default_values", "channel_types"],
      9: ["components", "accessory"], 10: ["content"], 11: ["media", "description", "spoiler"],
      12: ["items"], 14: ["divider", "spacing"], 17: ["components", "accent_color", "spoiler"],
    }
    if (!allowed[Number(type)] || Object.keys(node).some(key => !["type", "id", ...allowed[Number(type)]!].includes(key))) return fail(`${location} contains an unsupported type or field. Remove unsupported fields from the imported component.`)
    if (node.id !== undefined && !integer(node.id, 0, 2 ** 32 - 1)) return fail(`${location} has an invalid component ID. Use an integer from 0 to 4294967295.`)
    if (node.disabled !== undefined && typeof node.disabled !== "boolean") return fail(`${location} has an invalid disabled value. Use true or false.`)
    if (node.spoiler !== undefined && typeof node.spoiler !== "boolean") return fail(`${location} has an invalid spoiler value. Use true or false.`)
    if (!v2 && ![1, 2, 3, 5, 6, 7, 8].includes(Number(type))) return fail(`${location} requires Components v2. Change the message format or remove this component.`)
    if (parent === 0 && (v2 ? ![1, 9, 10, 12, 14, 17].includes(Number(type)) : type !== 1)) return fail(`${location} cannot be placed at the top level. Put buttons and menus inside an action row.`)
    if (parent === 1 && ![2, 3, 5, 6, 7, 8].includes(Number(type))) return fail(`${location} cannot be placed in an action row. Use a button or select menu.`)
    if (parent === 17 && ![1, 9, 10, 12, 14].includes(Number(type))) return fail(`${location} cannot be placed in an action row. Use a button or select menu.`)
    if (parent === 9 && type !== 10) return fail(`${location} cannot be placed inside a section. Sections contain only text displays.`)
    if (parent === -9 && ![2, 11].includes(Number(type))) return fail(`${location} needs a button or thumbnail as its section accessory.`)
    if ([2, 3, 5, 6, 7, 8].includes(Number(type)) && !(type === 2 && node.style === 5)) {
      if (!text(node.custom_id, 100) || ids.has(String(node.custom_id))) return fail(`${location} needs a unique action ID of at most 100 characters. Assign an action and remove duplicate IDs.`)
      ids.add(String(node.custom_id))
    }
    if (type === 1 || type === 17 || type === 9) {
      if (!Array.isArray(node.components) || !node.components.length) return fail(`${location} is empty. Add a child component inside it, or remove it before saving.`)
      if (type === 1 && (node.components.length > 5 || node.components.some(child => record(child).type !== 2) && node.components.length !== 1)) return fail(`${location} must contain up to five buttons or exactly one select menu. Split buttons and menus into separate rows.`)
      if (type === 9 && (node.components.length > 3 || !visit(node.accessory, -9, depth + 1, `${location} → Accessory`))) return fail(`${location} needs one to three text displays and a valid button or thumbnail accessory.`)
      if (type === 17 && node.accent_color != null && !integer(node.accent_color, 0, 0xffffff)) return fail(`${location} has an invalid accent colour. Choose a six-digit hex colour.`)
      return node.components.every((child, index) => visit(child, Number(type), depth + 1, `${location} → ${label(child, index)}`))
    }
    if (type === 2) {
      if (!integer(node.style, 1, 5)) return fail(`${location} needs a valid button style.`)
      if (!text(node.label, 80) && !Object.keys(record(node.emoji)).length) return fail(`${location} needs a label of at most 80 characters or an emoji.`)
      if (node.style === 5 ? !url(node.url) || node.custom_id !== undefined : node.url !== undefined) return fail(`${location} must use either a valid HTTP(S) link or a ticket action, not both.`)
      return true
    }
    if ([3, 5, 6, 7, 8].includes(Number(type))) {
      const minimum = node.min_values ?? 1, maximum = node.max_values ?? 1
      if (!integer(minimum, 0, 25) || !integer(maximum, 1, 25) || Number(minimum) > Number(maximum)
        || node.placeholder !== undefined && !text(node.placeholder, 150, false)) return fail(`${location} has invalid selection limits or a placeholder longer than 150 characters. The minimum must not exceed the maximum, and the maximum is 25.`)
      if (type === 3) {
        if (!Array.isArray(node.options) || !node.options.length || node.options.length > 25 || Number(maximum) > node.options.length) return fail(`${location} needs 1–25 options and cannot allow more selections than it has options.`)
        const values = new Set<string>()
        for (const raw of node.options) {
          const option = record(raw)
          if (!text(option.label, 100) || !text(option.value, 100) || values.has(String(option.value))
            || option.description !== undefined && !text(option.description, 100, false)) return fail(`${location} has invalid options. Each needs a label and unique value of at most 100 characters, with descriptions limited to 100 characters.`)
          values.add(String(option.value))
        }
      }
      return true
    }
    if (type === 10) { if (!text(node.content, 4000)) return fail(`${location} needs non-empty text of at most 4,000 characters.`); characters += String(node.content).length; return characters <= 4000 || fail("The message contains more than 4,000 characters across its text displays. Shorten the text before saving.") }
    if (type === 11) return url(record(node.media).url) && (node.description === undefined || text(node.description, 1024, false)) || fail(`${location} needs a valid HTTP(S) image URL and a description of at most 1,024 characters.`)
    if (type === 12) return Array.isArray(node.items) && node.items.length > 0 && node.items.length <= 10 && node.items.every(raw => {
      const item = record(raw)
      return url(record(item.media).url) && (item.description === undefined || text(item.description, 1024, false))
    }) || fail(`${location} needs 1–10 media items, each with a valid HTTP(S) URL and a description of at most 1,024 characters.`)
    return type === 14 && (node.spacing === undefined || [1, 2].includes(Number(node.spacing))) && (node.divider === undefined || typeof node.divider === "boolean") || fail(`${location} has invalid separator settings. Choose small or large spacing and a true or false divider.`)
  }
  if (!v2 && components.length > 5) return "Classic messages support at most five action rows. Remove an action row before saving."
  for (const [index, component] of components.entries()) {
    const location = label(component, index)
    if (!visit(component, 0, 0, location)) return error ?? `${location} is invalid. Check its required fields.`
  }
  return undefined
}
