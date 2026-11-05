import { BotArmyPresentation } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import type { WorkerBindings } from "./environment.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { normalizeArmyLink } from "./army-link.js"
import { savePersonalArmy } from "./mobile-persistence.js"
import { lookupArmyStaticItem, prepareStaticMetadata } from "./static-metadata.js"

type Unit = { id: number; quantity: number }
interface Composition {
  mainTroops: Unit[]; clanCastleTroops: Unit[]; spells: Array<Unit & { clanCastle: boolean }>;
  heroes: number[]; equipment: Array<{ heroId: number; equipmentId: number }>;
  petAssignments: Array<{ heroId: number; petId: number }>; siegeMachineId: number | null
}
const invalid = (message: string) => new InvalidRequest({ message })

export const prepareBotArmy = (raw: string, bindings: WorkerBindings) => Effect.gen(function* () {
  yield* prepareStaticMetadata(bindings, ["troops", "spells", "heroes", "pets", "equipment", "buildings"])
  return yield* Effect.try({ try: () => {
    const shareCode = normalizeArmyLink(raw)
    if (`https://link.clashofclans.com/en?action=CopyArmy&army=${encodeURIComponent(shareCode)}`.length > 512) {
      throw invalid("This army link is too long for a Discord Copy Army button (maximum 512 characters)")
    }
    const composition: Composition = { mainTroops: [], clanCastleTroops: [], spells: [], heroes: [], equipment: [], petAssignments: [], siegeMachineId: null }
    const presentation: typeof BotArmyPresentation.Type = { units: [], heroes: [], minimumTownHall: 1, troopSpace: 0, spellSpace: 0, clanCastleSpace: 0 }
    // Build mutable rows before returning the readonly contract.
    const units: Array<typeof presentation.units[number]> = [], heroes: Array<typeof presentation.heroes[number]> = []
    let minimumTownHall = 1, troopSpace = 0, spellSpace = 0, clanCastleSpace = 0
    let metadataIncomplete = false
    const lookup = (category: string, id: number) => {
      if (!Number.isSafeInteger(id) || id > 2_147_483_647) throw invalid(`Invalid ${category} ID ${id}`)
      const item = lookupArmyStaticItem(category, id)
      if (item && (category === "troops" || category === "heroes") && item.village !== "home") throw invalid(`Unsupported ${category} ID ${id}`)
      if (item) return { ...item, known: true }
      // Game IDs can arrive before our asset release. Keep the exact IDs in the
      // canonical copy/save data; missing display metadata is not an invalid army.
      // Zero weights are unknown, not free capacity: mark all totals incomplete.
      metadataIncomplete = true
      const label = ({ troops: "troop", spells: "spell", heroes: "hero", pets: "pet", equipment: "equipment" } as Record<string, string>)[category] ?? "item"
      return { id, name: `Unknown ${label} (${id})`, housingSpace: 0, superTroop: false, siegeMachine: false,
        hero: "", minimumTownHall: 1, known: false }
    }
    const pets = new Set<number>(), equipment = new Set<number>()
    const siegeOptions: Unit[] = []
    for (const [, marker, body] of shareCode.matchAll(/([hidus])([^hidus]*)/gu)) {
      for (const entry of body!.split("-")) {
        if (marker === "h") {
          const match = /^(\d+)(?:m(\d+))?(?:p(\d+))?(?:e(\d+(?:_\d+)*))?$/u.exec(entry)!
          const hero = lookup("heroes", 28000000 + Number(match[1]))
          if (composition.heroes.includes(hero.id)) throw invalid("An army cannot contain the same hero twice")
          composition.heroes.push(hero.id); minimumTownHall = Math.max(minimumTownHall, hero.minimumTownHall)
          let pet: string | undefined
          if (match[3] !== undefined) {
            const item = lookup("pets", 73000000 + Number(match[3]))
            if (pets.has(item.id)) throw invalid("A pet cannot be assigned to multiple heroes")
            pets.add(item.id); pet = item.name; composition.petAssignments.push({ heroId: hero.id, petId: item.id })
            minimumTownHall = Math.max(minimumTownHall, item.minimumTownHall)
          }
          const names: string[] = [], codes = match[4]?.split("_") ?? []
          if (codes.length > 2) throw invalid("A hero can equip at most two equipment items")
          for (const code of codes) {
            const item = lookup("equipment", 90000000 + Number(code))
            if (equipment.has(item.id) || (hero.known && item.hero && item.hero !== hero.name)) throw invalid("Invalid hero equipment assignment")
            equipment.add(item.id); names.push(item.name); composition.equipment.push({ heroId: hero.id, equipmentId: item.id })
            minimumTownHall = Math.max(minimumTownHall, item.minimumTownHall)
          }
          heroes.push({ id: hero.id, name: hero.name, ...(pet ? { pet } : {}), equipment: names })
          continue
        }
        const [quantityText, idText] = entry.split("x"), quantity = Number(quantityText)
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw invalid("Army quantities must be between 1 and 1000")
        const spell = marker === "s" || marker === "d", clanCastle = marker === "i" || marker === "d"
        const item = lookup(spell ? "spells" : "troops", (spell ? 26000000 : 4000000) + Number(idText))
        const unit = { id: item.id, quantity }
        const section = clanCastle ? "Clan Castle" : spell ? "Spells" : item.siegeMachine ? "Siege Machines" : item.superTroop ? "Super Troops" : "Troops"
        units.push({ ...unit, name: item.name, section })
        if (spell) { composition.spells.push({ ...unit, clanCastle }); if (!clanCastle) spellSpace += item.housingSpace * quantity }
        else if (clanCastle) { composition.clanCastleTroops.push(unit); if (!item.siegeMachine) clanCastleSpace += item.housingSpace * quantity }
        else if (item.siegeMachine) siegeOptions.push(unit)
        else { composition.mainTroops.push(unit); troopSpace += item.housingSpace * quantity }
        if (!clanCastle) minimumTownHall = Math.max(minimumTownHall, item.minimumTownHall)
      }
    }
    // CopyArmy can carry several siege choices, unlike a recorded battle's one
    // deployed siege. Only populate the singular field when it is unambiguous;
    // otherwise retain every option in the unit rows and the canonical link.
    if (siegeOptions.length === 1 && siegeOptions[0]!.quantity === 1) composition.siegeMachineId = siegeOptions[0]!.id
    else composition.mainTroops.push(...siegeOptions)
    composition.mainTroops.sort((a,b) => a.id-b.id)
    // Generous transport/display safety limits, not fabricated Town Hall capacities.
    // Released metadata exposes unit weights but not camp/spell/CC capacity curves.
    const clanCastleSpellSpace = composition.spells.filter(spell => spell.clanCastle).reduce((sum, spell) => sum + lookup("spells", spell.id).housingSpace * spell.quantity, 0)
    if (troopSpace > 1000 || spellSpace > 100 || clanCastleSpace > 200 || clanCastleSpellSpace > 100) {
      throw invalid("Army exceeds supported preview size limits")
    }
    // Match the canonical ordering enforced by army_component_rows_valid.
    composition.spells.sort((a,b) => a.id-b.id || Number(a.clanCastle)-Number(b.clanCastle))
    composition.equipment.sort((a,b) => a.equipmentId-b.equipmentId)
    composition.petAssignments.sort((a,b) => a.petId-b.petId)
    return { shareCode, composition, presentation: { units, heroes, minimumTownHall, troopSpace, spellSpace, clanCastleSpace, metadataIncomplete } }
  }, catch: error => error instanceof InvalidRequest ? error : invalid("Invalid army composition") })
})

/** Register and save atomically; a failed user lookup cannot leave a new composition behind. */
export const savePreparedBotArmy = (actor: string, prepared: Effect.Success<ReturnType<typeof prepareBotArmy>>, metadata?: { name: string | null; notes: string | null }) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, c = prepared.composition
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql`INSERT INTO army_compositions(share_code,main_troops,clan_castle_troops,spells,heroes,equipment,pet_assignments,siege_machine_id)
      VALUES(${prepared.shareCode},${JSON.stringify(c.mainTroops)}::jsonb,${JSON.stringify(c.clanCastleTroops)}::jsonb,
        ${JSON.stringify(c.spells)}::jsonb,${c.heroes}::integer[],${JSON.stringify(c.equipment)}::jsonb,${JSON.stringify(c.petAssignments)}::jsonb,${c.siegeMachineId})
      ON CONFLICT(share_code) DO NOTHING`
    return yield* savePersonalArmy(actor, prepared.shareCode, metadata)
  })).pipe(Effect.catchTag("SqlError", cause => Effect.fail(new DatabaseFailure({ cause, message: "Army save failed" }))))
})
