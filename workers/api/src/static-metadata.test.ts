import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"

import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { calculateRosterMaxPercent, hasStaticItemId, lookupStaticItem, maxLevelAtTownHall, prepareStaticMetadata,
  staticMaxLevel, staticMetadataSectionsForPath, staticNames } from "./static-metadata.js"

const sections: Readonly<Record<string, unknown>> = {
  troops: { items: [
    { _id: 4_000_000, name: "Barbarian", TID: { name: "TID_BARBARIAN" }, village: "home", production_building: "Barracks", production_building_level: 1,
      levels: [{ level: 1, required_townhall: 3 }, { level: 2, required_townhall: 3 }] },
    { _id: 4_000_026, name: "Super Barbarian", TID: { name: "TID_SUPER_BARBARIAN" }, village: "home", production_building: "Barracks", production_building_level: 1,
      super_troop: { original_id: 4_000_000 }, levels: [{ level: 2, required_townhall: 3 }] },
  ] },
  spells: { items: [{ _id: 26_000_000, name: "Lightning Spell", TID: { name: "TID_LIGHTNING" }, production_building: "Spell Factory", production_building_level: 1,
    levels: [{ level: 1, required_townhall: 5 }] }] },
  heroes: { items: [{ _id: 28_000_000, name: "Barbarian King", TID: { name: "TID_KING" }, village: "home", levels: [{ level: 1, required_townhall: 4 }] }] },
  league_tiers: { items: [{ _id: 105_000_001, name: "Skeleton League 1", TID: { name: "TID_SKELETON" } }] },
}
const get = vi.fn(async (key: string) => {
  const value = key.startsWith("static_data/") ? sections[key.slice(12, -5)] : key === "translations/ES.json" ? { TID_BARBARIAN: "Bárbaro" } : undefined
  return value === undefined ? null : { json: async () => value }
})
const bindings = { ASSETS: { get } } as unknown as WorkerBindings
const run = <A, E>(effect: Effect.Effect<A, E, WorkerEnvironment>) => Effect.runPromise(effect.pipe(Effect.provideService(WorkerEnvironment, bindings)))

describe("R2 static metadata", () => {
  it("loads only requested split sections and translates through the requested locale object", async () => {
    await run(prepareStaticMetadata(bindings, ["troops"]))
    expect(lookupStaticItem("troops", 4_000_000)).toEqual({ id: 4_000_000, name: "Barbarian", isSuperTroop: false })
    expect(lookupStaticItem("troops", "Super Barbarian")?.isSuperTroop).toBe(true)
    expect(hasStaticItemId("league_tiers", 105_000_001)).toBe(false)
    expect(await run(staticNames("troops", { locale: "es", name: "bárbaro", village: "home" }))).toEqual(["Bárbaro"])
    expect(get).toHaveBeenCalledWith("translations/ES.json")
  })

  it("uses released level data and excludes super troops from roster progress", async () => {
    await run(prepareStaticMetadata(bindings, ["troops", "spells", "heroes"]))
    expect(maxLevelAtTownHall("troops", "Barbarian", 3)).toBe(2)
    expect(await run(staticMaxLevel("troops", "4000000"))).toEqual({ name: "Barbarian", max_level: 2 })
    expect(calculateRosterMaxPercent({ townHallLevel: 5, troops: [{ name: "Barbarian", level: 2 }], spells: [], heroes: [] })).toBe(100)
  })

  it("selects only the R2 sections relevant to each route", () => {
    expect(staticMetadataSectionsForPath("/v2/static/troops/names")).toEqual(["troops"])
    expect(staticMetadataSectionsForPath("/v2/player/%23TAG/history/changes")).toEqual(["troops", "heroes", "spells", "pets", "equipment"])
    expect(staticMetadataSectionsForPath("/v2/health")).toEqual([])
  })
})
