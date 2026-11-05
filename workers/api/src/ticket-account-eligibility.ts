import type { TicketButtonSettings } from "@clashking/api-contracts"
import { calculateRosterHeroPercent, type RosterProgressUnit } from "./static-metadata.js"

export const ticketAccountEligible = (account: { readonly townhall_level: number | null; readonly heroes: unknown },
  settings: typeof TicketButtonSettings.Type): boolean => {
  if (!settings.account_apply) return true
  if (account.townhall_level === null || account.townhall_level < settings.th_min) return false
  const required = settings.hero_min_percent ?? 0
  if (required === 0) return true
  const heroes: RosterProgressUnit[] = []
  for (const value of Array.isArray(account.heroes) ? account.heroes : []) {
    if (typeof value !== "object" || value === null) continue
    const hero = value as Record<string, unknown>
    if (typeof hero.name === "string" && typeof hero.level === "number" && hero.village === "home") {
      heroes.push({ name: hero.name, level: hero.level, village: "home" })
    }
  }
  const percent = calculateRosterHeroPercent(account.townhall_level, heroes)
  return percent !== undefined && percent >= required
}
