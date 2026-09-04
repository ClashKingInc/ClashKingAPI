import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import metadata from "./static-metadata-data.json"
import { calculateRosterMaxPercent, lookupStaticItem, maxLevelAtTownHall, rosterHeroLevelSum,
  staticMaxLevel, staticMetadataSource, staticNames } from "./static-metadata.js"

describe("pinned clashy.go static metadata", () => {
  it("records immutable dependency provenance and the exact regular-unit constants", () => {
    expect(staticMetadataSource.version).toBe("v0.1.13")
    expect(staticMetadataSource.sum).toBe("h1:qzuYat2eW6HEF0Oy9Iip6Zzy43XuNo+TBb+fLAA7YWw=")
    expect(staticMetadataSource.staticSha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(metadata.roster.troops).toHaveLength(32)
    expect(metadata.roster.spells).toHaveLength(18)
    expect(metadata.roster.heroes).toHaveLength(6)
    expect(metadata.roster.troops).not.toContain("Super Barbarian")
    expect(metadata.roster.troops).not.toContain("Wall Wrecker")
    expect(metadata.roster.troops).not.toContain("Giant Giant")
  })

  it.each([
    ["troops", "Barbarian", 2, 0], ["troops", "Barbarian", 3, 2], ["troops", "Barbarian", 5, 3],
    ["spells", "Lightning Spell", 5, 4], ["heroes", "Archer Queen", 9, 30], ["heroes", "Archer Queen", 18, 110],
  ] as const)("uses canonical %s/%s TH%s maximum %s", (section, name, th, maximum) => {
    expect(maxLevelAtTownHall(section, name, th)).toBe(maximum)
  })

  it("returns zero for unknown names and clamps eligible maxed units to 100 percent", () => {
    expect(maxLevelAtTownHall("troops", "invented troop", 18)).toBe(0)
    const units = (names: string[]) => names.map((name) => ({ name, level: 999, village: "home" }))
    expect(calculateRosterMaxPercent({ townHallLevel: 18, troops: units(metadata.roster.troops),
      spells: units(metadata.roster.spells), heroes: units(metadata.roster.heroes) })).toBe(100)
  })

  it("preserves Go's level-one missing-unit floor and excludes temporary, siege, super and builder entries", () => {
    const absent = { townHallLevel: 18, troops: [], spells: [], heroes: [] }
    // Pinned source has 56 eligible regular units and 917 summed maximum levels at TH18.
    expect(calculateRosterMaxPercent(absent)).toBe(6.11)
    expect(calculateRosterMaxPercent({ ...absent, townHallLevel: 9 })).toBe(26)
    expect(calculateRosterMaxPercent({ ...absent, troops: [
      { name: "Super Barbarian", level: 999 }, { name: "Wall Wrecker", level: 999 },
      { name: "Giant Giant", level: 999 }, { name: "Barbarian", level: 999, village: "builderBase" },
    ], heroes: [{ name: "Battle Machine", level: 999, village: "builderBase" }] })).toBe(6.11)
    expect(rosterHeroLevelSum([{ name: "Archer Queen", level: 90 }, { name: "Barbarian King", level: 95, village: "home" },
      { name: "Battle Machine", level: 35, village: "builderBase" }])).toBe(185)
  })

  it("translates before name filtering and applies only category-supported filters", async () => {
    expect(await Effect.runPromise(staticNames("troops", { locale: "es", name: "bárbaro", village: "home" }))).toContain("Bárbaro")
    expect(await Effect.runPromise(staticNames("troops", { name: "barbarian", village: "builderBase" }))).toEqual(["Raged Barbarian"])
    expect(await Effect.runPromise(staticNames("pets", { village: "builderBase" })))
      .toEqual(await Effect.runPromise(staticNames("pets")))
    expect(await Effect.runPromise(staticNames("spells", { village: "home" }))).toEqual([])
  })

  it("rejects unknown categories/locales and resolves max levels by exact ID or case-insensitive name", async () => {
    await expect(Effect.runPromise(staticNames("unknown"))).rejects.toMatchObject({ _tag: "NotFound" })
    await expect(Effect.runPromise(staticNames("troops", { locale: "xx" }))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(Effect.runPromise(staticMaxLevel("skins", "skin"))).rejects.toMatchObject({ _tag: "InvalidRequest" })
    await expect(Effect.runPromise(staticMaxLevel("troops", "unknown"))).rejects.toMatchObject({ _tag: "NotFound" })
    expect(await Effect.runPromise(staticMaxLevel("troops", "4000000"))).toEqual({ name: "Barbarian", max_level: 13 })
    expect(await Effect.runPromise(staticMaxLevel("troops", "barbarian"))).toEqual({ name: "Barbarian", max_level: 13 })
  })

  it("provides detached ID references without inventing absent pinned-snapshot icons", () => {
    expect(lookupStaticItem("league_tiers", 105000001)).toEqual({ id: 105000001, name: "Skeleton League 1", isSuperTroop: false })
    expect(lookupStaticItem("league_tiers", " Skeleton League 1 ")).toEqual(lookupStaticItem("league_tiers", 105000001))
    expect(lookupStaticItem("builder_leagues", 44000001)?.name).toBe("Wood League IV")
    expect(lookupStaticItem("troops", 4000000)?.isSuperTroop).toBe(false)
    const superTroop = metadata.sections.troops.find((item) => item.isSuperTroop)!
    expect(lookupStaticItem("troops", superTroop.id)?.isSuperTroop).toBe(true)
    expect(lookupStaticItem("troops", -1)).toBeUndefined()
  })
})
