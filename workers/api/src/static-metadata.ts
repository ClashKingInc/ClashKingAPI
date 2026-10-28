import { Effect } from "effect"

import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"

interface RawStaticItem {
  readonly _id?: number; readonly name?: string; readonly TID?: { readonly name?: string }; readonly village?: string; readonly type?: string
  readonly is_flying?: boolean; readonly housing_space?: number
  readonly production_building?: string; readonly production_building_level?: number; readonly super_troop?: unknown; readonly is_seasonal?: boolean; readonly hero?: string
  readonly levels?: ReadonlyArray<{ readonly level?: number; readonly required_townhall?: number | null }>
}
interface StaticItem {
  readonly id: number | null; readonly name: string; readonly tid: string; readonly village: string; readonly type: string
  readonly isFlying: boolean | null; readonly housingSpace: number | null
  readonly isSuperTroop: boolean; readonly isSeasonal: boolean; readonly productionBuilding: string; readonly productionBuildingLevel: number; readonly hero: string
  readonly levels: ReadonlyArray<{ readonly level: number; readonly townHall: number | null }>
}

const categories = new Set(["buildings", "traps", "troops", "guardians", "spells", "heroes", "pets", "equipment", "decorations", "obstacles",
  "sceneries", "skins", "capital_house_parts", "capital_leagues", "helpers", "war_leagues", "league_tiers", "builder_leagues", "achievements"])
const villageCategories = new Set(["buildings", "traps", "troops", "spells", "heroes"])
const levelCategories = new Set(["buildings", "traps", "troops", "guardians", "spells", "heroes", "pets", "equipment", "helpers", "achievements"])
const locales = new Set(["EN", "AR", "CN", "CNT", "DE", "ES", "FA", "FI", "FR", "ID", "IT", "JP", "KR", "MS", "NL", "NO", "PL", "PT", "RU", "TH", "TR", "VI"])
const loadedSections = new Map<string, ReadonlyArray<StaticItem>>()
const upstream = (cause: unknown, message: string) => new UpstreamUnavailable({ cause, message })

const decodeSection = (value: unknown, category: string): ReadonlyArray<StaticItem> => {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { items?: unknown }).items)) throw new Error(`Invalid ${category} static-data object`)
  return (value as { items: ReadonlyArray<RawStaticItem> }).items.map((item) => {
    if (typeof item.name !== "string" || (item._id !== undefined && !Number.isSafeInteger(item._id))) throw new Error(`Invalid ${category} static-data item`)
    return { id: item._id ?? null, name: item.name, tid: item.TID?.name ?? "", village: item.village ?? "", type: item.type ?? "",
      isFlying: typeof item.is_flying === "boolean" ? item.is_flying : null,
      housingSpace: Number.isSafeInteger(item.housing_space) && item.housing_space! > 0 ? item.housing_space! : null,
      isSuperTroop: item.super_troop !== undefined, isSeasonal: item.is_seasonal === true, productionBuilding: item.production_building ?? "",
      productionBuildingLevel: item.production_building_level ?? 0, hero: item.hero ?? "",
      levels: (item.levels ?? []).map((level) => ({ level: level.level ?? 0, townHall: level.required_townhall ?? null })) }
  })
}
const readJson = <A>(bindings: Pick<WorkerBindings, "ASSETS">, key: string): Effect.Effect<A, UpstreamUnavailable> => Effect.tryPromise({
  try: async () => { const object = await bindings.ASSETS.get(key); if (object === null) throw new Error(`Missing R2 object ${key}`); return await object.json<A>() },
  catch: (cause) => upstream(cause, `Static metadata '${key}' is unavailable`),
})

/** Load only the bound R2 sections needed here; local development can seed unpublished JSONs. */
export const prepareStaticMetadata = (bindings: Pick<WorkerBindings, "ASSETS">, requested: ReadonlyArray<string>) => Effect.gen(function* () {
  const unique = [...new Set(requested)]
  for (const category of unique) if (!categories.has(category)) return yield* new NotFound({ message: `Static category '${category}' not found` })
  yield* Effect.forEach(unique, (category) => readJson<unknown>(bindings, `static_data/${category}.json`).pipe(
      Effect.flatMap((value) => Effect.try({
        try: () => loadedSections.set(category, decodeSection(value, category)),
        catch: (cause) => upstream(cause, `Static metadata '${category}' is invalid`),
      })),
      Effect.asVoid,
    ), { concurrency: "unbounded", discard: true })
})
const section = (category: string): ReadonlyArray<StaticItem> => loadedSections.get(category) ?? []

export interface StaticItemReference {
  readonly id: number; readonly name: string; readonly isSuperTroop: boolean
  readonly iconUrls?: { readonly tiny: string; readonly small: string; readonly medium: string; readonly large: string }
}
export const lookupStaticItem = (category: string, idOrName: number | string): StaticItemReference | undefined => {
  const item = section(category).find((candidate) => typeof idOrName === "number" ? candidate.id === idOrName : candidate.name === idOrName.trim())
  return item === undefined || item.id === null ? undefined : { id: item.id, name: item.name, isSuperTroop: item.isSuperTroop }
}
export const hasStaticItemId = (category: string, id: number): boolean => section(category).some((item) => item.id === id)

/** Army previews use the same bound metadata as the other API surfaces. */
export const lookupArmyStaticItem = (category: string, id: number) => {
  const item = section(category).find(candidate => candidate.id === id)
  if (!item) return undefined
  const building = section("buildings").find(candidate => candidate.name === item.productionBuilding && candidate.village === "home")
  const unlock = building?.levels.find(level => level.level === item.productionBuildingLevel)?.townHall
  const levelMinimum = Math.min(...item.levels.map(level => level.townHall ?? Infinity))
  return { id, name: item.name, village: item.village, housingSpace: item.housingSpace ?? 0,
    superTroop: item.isSuperTroop, siegeMachine: item.productionBuilding === "Workshop", hero: item.hero,
    minimumTownHall: item.isSuperTroop ? Math.max(11, Number.isFinite(levelMinimum) ? levelMinimum : 1)
      : unlock ?? (Number.isFinite(levelMinimum) ? levelMinimum : 1) }
}

/** Released home-village troop weights for ranked army classification. */
export const rankedTroopWeights = (): ReadonlyArray<{ id: number; flying: boolean; housing: number }> =>
  section("troops").filter((item) => item.id !== null && item.village === "home" && item.isFlying !== null && item.housingSpace !== null)
    .map((item) => ({ id: item.id!, flying: item.isFlying!, housing: item.housingSpace! }))

export interface StaticNameQuery {
  readonly locale?: string | undefined; readonly name?: string | undefined; readonly village?: string | undefined
  readonly type?: string | undefined; readonly category?: string | undefined
}
export const staticNames = (category: string, query: StaticNameQuery = {}) => Effect.gen(function* () {
  const bindings = yield* WorkerEnvironment
  yield* prepareStaticMetadata(bindings, [category])
  const locale = (query.locale ?? "").toUpperCase()
  if (locale !== "" && !locales.has(locale)) return yield* new InvalidRequest({ message: `Invalid static locale '${locale}'` })
  const translations = locale === "" || locale === "EN" ? undefined : yield* readJson<Readonly<Record<string, string>>>(bindings, `translations/${locale}.json`)
  const name = (query.name ?? "").toLowerCase(), village = (query.village ?? "").toLowerCase(), names: string[] = []
  for (const item of section(category)) {
    const translated = translations?.[item.tid] || item.name
    if (name !== "" && !translated.toLowerCase().includes(name)) continue
    if (village !== "" && villageCategories.has(category) && item.village.toLowerCase() !== village) continue
    if (query.type && category === "buildings" && item.type !== query.type) continue
    if (query.category && category === "troops" && query.category !== "") continue
    if (translated !== "") names.push(translated)
  }
  return names
})
export const staticMaxLevel = (category: string, idOrName: string) => Effect.gen(function* () {
  const bindings = yield* WorkerEnvironment
  if (!levelCategories.has(category)) return yield* new InvalidRequest({ message: `Static category '${category}' does not support levels` })
  yield* prepareStaticMetadata(bindings, [category])
  const items = section(category), id = /^[+-]?\d+$/u.test(idOrName) ? Number(idOrName) : undefined
  const item = (id === undefined ? undefined : items.find((entry) => entry.id === id)) ?? items.find((entry) => entry.name.toLowerCase() === idOrName.toLowerCase())
  if (item === undefined) return yield* new NotFound({ message: `Static item '${idOrName}' not found in '${category}'` })
  const maximum = Math.max(0, ...item.levels.map(({ level }) => level))
  if (maximum === 0) return yield* new NotFound({ message: `Static item '${idOrName}' has no levels` })
  return { name: item.name, max_level: maximum }
})

export type RosterStaticSection = "troops" | "spells" | "heroes"
export const maxLevelAtTownHall = (category: RosterStaticSection, name: string, townHall: number): number => {
  const village = category === "spells" ? "" : "home"
  const item = section(category).find((candidate) => candidate.name.toLowerCase() === name.toLowerCase() && candidate.village === village)
  return Math.max(0, ...(item?.levels ?? []).filter((level) => level.townHall !== null && level.townHall <= townHall).map(({ level }) => level))
}
const rosterItems = (category: RosterStaticSection) => section(category).filter((item) => {
  if (category === "heroes") return item.village === "home"
  if (category === "spells") return !item.isSeasonal && item.productionBuildingLevel > 0
  return item.village === "home" && !item.isSuperTroop && !item.isSeasonal && item.productionBuilding !== "Workshop" && item.productionBuildingLevel > 0
})
export interface RosterProgressUnit { readonly name: string; readonly level: number; readonly village?: string | undefined }
export interface RosterProgressPlayer {
  readonly townHallLevel: number; readonly troops: ReadonlyArray<RosterProgressUnit>; readonly spells: ReadonlyArray<RosterProgressUnit>; readonly heroes: ReadonlyArray<RosterProgressUnit>
}
const isHome = (unit: RosterProgressUnit): boolean => !unit.village || unit.village === "home"
export const rosterHeroLevelSum = (heroes: ReadonlyArray<RosterProgressUnit>): number => heroes.filter(isHome).reduce((sum, hero) => sum + hero.level, 0)
export const rosterHeroNames = (): ReadonlyArray<string> => rosterItems("heroes").map((item) => item.name)
/** Hero-only progress, using the same released names and TH maxima as roster hero totals. */
export const calculateRosterHeroPercent = (townHall: number, heroes: ReadonlyArray<RosterProgressUnit>): number | undefined => {
  const names = rosterHeroNames()
  if (names.length === 0) return undefined
  const levels = new Map(heroes.filter(isHome).map(hero => [hero.name, hero.level]))
  let current = 0, maximum = 0
  for (const name of names) {
    const max = maxLevelAtTownHall("heroes", name, townHall)
    if (max === 0) continue
    const level = levels.get(name) ?? 0
    current += Number.isFinite(level) ? Math.max(0, Math.min(level, max)) : 0
    maximum += max
  }
  return maximum === 0 ? 100 : current / maximum * 100
}
export const calculateRosterMaxPercent = (player: RosterProgressPlayer): number => {
  let currentLevels = 0, maximumLevels = 0
  for (const category of ["troops", "spells", "heroes"] as const) {
    const units = category === "spells" ? player[category] : player[category].filter(isHome), current = new Map(units.map((unit) => [unit.name, unit.level]))
    for (const item of rosterItems(category)) {
      const maximum = maxLevelAtTownHall(category, item.name, player.townHallLevel)
      if (maximum === 0) continue
      currentLevels += Math.min(current.get(item.name) || 1, maximum); maximumLevels += maximum
    }
  }
  return maximumLevels === 0 ? 0 : Math.round(currentLevels / maximumLevels * 10_000) / 100
}

export const staticMetadataSectionsForPath = (pathname: string): ReadonlyArray<string> => {
  if (pathname === "/v2/runtime/tickets/open/prepare" || /^\/v2\/runtime\/ticket-operations\/[^/]+\/advance$/u.test(pathname)) return ["heroes"]
  const staticMatch = pathname.match(/^\/v2\/static\/([^/]+)\//u)
  if (staticMatch?.[1]) { try { return [decodeURIComponent(staticMatch[1])] } catch { return [] } }
  if (pathname === "/v2/bot/players/upgrade-progress") return ["troops", "heroes", "spells", "pets", "equipment"]
  if (/^\/v2\/player\/[^/]+\/history\/changes$/u.test(pathname)) return ["troops", "heroes", "spells", "pets", "equipment"]
  if (pathname === "/v2/player/search" || /^\/v2\/player\/[^/]+\/(?:legend-history|ranked\/\d+\/|league\/history|leaderboard-history\/)/u.test(pathname)) return ["league_tiers"]
  if (/^\/v2\/(?:ranked\/|leaderboard\/|stats\/league\/)/u.test(pathname)) return ["league_tiers"]
  if (pathname === "/v2/stats/legend/days") return ["league_tiers", "heroes", "pets", "equipment", "troops", "spells"]
  if (pathname === "/v2/stats/ranked") return ["troops"]
  // CWL history resolves league names by ID. Load metadata for this route family
  // even on a cold worker; another clan request must not be a prerequisite.
  if (pathname.startsWith("/v2/cwl/")) return ["war_leagues"]
  if (/^\/v2\/(?:clan\/search|clan\/[^/]+\/(?:cached|rankings|cwl)|player\/[^/]+\/cwl)/u.test(pathname)) return ["war_leagues", "capital_leagues"]
  return []
}
