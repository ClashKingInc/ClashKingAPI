import { Effect } from "effect"

import { InvalidRequest, NotFound } from "./errors.js"
import metadata from "./static-metadata-data.json"

interface StaticItem {
  readonly id: number | null
  readonly name: string
  readonly village: string
  readonly type: string
  readonly category: string
  readonly icon: string
  readonly isSuperTroop: boolean
  readonly names: Readonly<Record<string, string | null | undefined>>
  readonly levels: ReadonlyArray<{ readonly level: number; readonly townHall: number | null }>
}
const sections: Readonly<Record<string, ReadonlyArray<StaticItem>>> = metadata.sections
const categories = new Set(Object.keys(sections).filter((category) => category !== "builder_leagues"))
const villageCategories = new Set(["buildings", "traps", "troops", "spells", "heroes"])
const levelCategories = new Set(["buildings", "traps", "troops", "guardians", "spells", "heroes", "pets", "equipment", "helpers", "achievements"])
const locales = new Set(["EN", "AR", "CN", "CNT", "DE", "ES", "FA", "FI", "FR", "ID", "IT", "JP", "KR", "MS", "NL", "NO", "PL", "PT", "RU", "TH", "TR", "VI"])

/** The immutable release source; no runtime download or dirty sibling dependency. */
export const staticMetadataSource = Object.freeze({ ...metadata.source })

export interface StaticItemReference {
  readonly id: number
  readonly name: string
  readonly isSuperTroop: boolean
  readonly iconUrls?: { readonly tiny: string; readonly small: string; readonly medium: string; readonly large: string }
}

/** A detached projection for history/search enrichment; absent icons stay absent. */
export const lookupStaticItem = (category: string, idOrName: number | string): StaticItemReference | undefined => {
  const item = sections[category]?.find((candidate) => typeof idOrName === "number" ? candidate.id === idOrName : candidate.name === idOrName.trim())
  if (item === undefined || item.id === null) return undefined
  const icon = item.icon.replace(/^\//u, "")
  const url = icon === "" ? undefined : `https://coc-assets.clashk.ing/${icon}`
  return { id: item.id, name: item.name, isSuperTroop: item.isSuperTroop,
    ...(url === undefined ? {} : { iconUrls: { tiny: url, small: url, medium: url, large: url } }) }
}

/** True only for numeric identifiers present in the pinned static release. */
export const hasStaticItemId = (category: string, id: number): boolean =>
  sections[category]?.some((item) => item.id === id) ?? false

export interface StaticNameQuery {
  readonly locale?: string | undefined
  readonly name?: string | undefined
  readonly village?: string | undefined
  readonly type?: string | undefined
  readonly category?: string | undefined
}

/** Mirrors category-aware filtering and translation-before-name-filtering in staticdata.go. */
export const staticNames = (category: string, query: StaticNameQuery = {}): Effect.Effect<ReadonlyArray<string>, InvalidRequest | NotFound> => {
  if (!categories.has(category)) return Effect.fail(new NotFound({ message: `Static category '${category}' not found` }))
  const locale = (query.locale ?? "").toUpperCase()
  if (locale !== "" && !locales.has(locale)) return Effect.fail(new InvalidRequest({ message: `Invalid static locale '${locale}'` }))
  const name = (query.name ?? "").toLowerCase()
  const village = (query.village ?? "").toLowerCase()
  const names: Array<string> = []
  for (const item of sections[category] ?? []) {
    const translated = locale === "" ? item.name : item.names[locale] || item.name
    if (name !== "" && !translated.toLowerCase().includes(name)) continue
    if (village !== "" && villageCategories.has(category) && item.village.toLowerCase() !== village) continue
    if (query.type && category === "buildings" && item.type !== query.type) continue
    if (query.category && category === "troops" && item.category !== query.category) continue
    if (translated !== "") names.push(translated)
  }
  return Effect.succeed(names)
}

export const staticMaxLevel = (category: string, idOrName: string): Effect.Effect<{ readonly name: string; readonly max_level: number }, InvalidRequest | NotFound> => {
  if (!levelCategories.has(category)) return Effect.fail(new InvalidRequest({ message: `Static category '${category}' does not support levels` }))
  const items = sections[category] ?? []
  const id = /^[+-]?\d+$/u.test(idOrName) ? Number(idOrName) : undefined
  const item = (id === undefined ? undefined : items.find((entry) => entry.id === id)) ??
    items.find((entry) => entry.name.toLowerCase() === idOrName.toLowerCase())
  if (item === undefined) return Effect.fail(new NotFound({ message: `Static item '${idOrName}' not found in '${category}'` }))
  const maximum = Math.max(0, ...item.levels.map(({ level }) => level))
  if (maximum === 0) return Effect.fail(new NotFound({ message: `Static item '${idOrName}' has no levels` }))
  return Effect.succeed({ name: item.name, max_level: maximum })
}

export type RosterStaticSection = "troops" | "spells" | "heroes"
const rosterLookup = new Map<string, StaticItem>()
for (const section of ["troops", "spells", "heroes"] as const) {
  for (const item of sections[section] ?? []) {
    // As in clashy.LoadStaticData, later entries replace earlier duplicate names.
    rosterLookup.set(`${section}|${item.village}|${item.name.toLowerCase()}`, item)
  }
}

export const maxLevelAtTownHall = (section: RosterStaticSection, name: string, townHall: number): number => {
  const village = section === "spells" ? "" : "home"
  const item = rosterLookup.get(`${section}|${village}|${name.toLowerCase()}`)
  return Math.max(0, ...(item?.levels ?? []).filter((level) => level.townHall !== null && level.townHall <= townHall).map(({ level }) => level))
}

export interface RosterProgressUnit {
  readonly name: string
  readonly level: number
  readonly village?: string | undefined
}
export interface RosterProgressPlayer {
  readonly townHallLevel: number
  readonly troops: ReadonlyArray<RosterProgressUnit>
  readonly spells: ReadonlyArray<RosterProgressUnit>
  readonly heroes: ReadonlyArray<RosterProgressUnit>
}
const isHome = (unit: RosterProgressUnit): boolean => !unit.village || unit.village === "home"

export const rosterHeroLevelSum = (heroes: ReadonlyArray<RosterProgressUnit>): number =>
  heroes.filter(isHome).reduce((sum, hero) => sum + hero.level, 0)

/** Exact roster_progress.go denominator: regular troops, regular spells, home heroes only. */
export const calculateRosterMaxPercent = (player: RosterProgressPlayer): number => {
  let currentLevels = 0
  let maximumLevels = 0
  for (const section of ["troops", "spells", "heroes"] as const) {
    const units = section === "spells" ? player[section] : player[section].filter(isHome)
    const current = new Map(units.map((unit) => [unit.name, unit.level]))
    for (const name of metadata.roster[section]) {
      const maximum = maxLevelAtTownHall(section, name, player.townHallLevel)
      if (maximum === 0) continue
      currentLevels += Math.min(current.get(name) || 1, maximum)
      maximumLevels += maximum
    }
  }
  return maximumLevels === 0 ? 0 : Math.round(currentLevels / maximumLevels * 10_000) / 100
}
