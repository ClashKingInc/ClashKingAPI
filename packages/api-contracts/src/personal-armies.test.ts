import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { DeletePersonalArmyEndpoint, PersonalArmiesEndpoint, PersonalArmiesState, SavePersonalArmyEndpoint } from "./personal-armies.js"

describe("personal army contracts", () => {
  it("publishes authenticated list, bodyless save, and delete routes", () => {
    expect(PersonalArmiesEndpoint).toMatchObject({ auth: "user", method: "GET", path: "/v2/armies/personal" })
    expect(SavePersonalArmyEndpoint).toMatchObject({ auth: "user", method: "PUT", path: "/v2/armies/personal/:shareCode", bodyMode: "none" })
    expect(DeletePersonalArmyEndpoint).toMatchObject({ auth: "user", method: "DELETE", path: "/v2/armies/personal/:shareCode" })
  })

  it("uses share codes as identity and exposes the immutable composition", () => {
    const state = { items: [{ shareCode: "u1x0", armyLink: "https://link.clashofclans.com/en?action=CopyArmy&army=u1x0",
      mainTroops: [{ id: 1, quantity: 1 }], clanCastleTroops: [],
      spells: [{ id: 2, quantity: 1, clanCastle: false }], heroes: [28_000_000],
      equipment: [{ equipmentId: 90_000_000, heroId: 28_000_000 }],
      petAssignments: [{ petId: 73_000_000, heroId: 28_000_000 }], siegeMachineId: null,
      savedAt: "2026-09-20T00:00:00.000Z" }] }
    expect(Schema.decodeUnknownSync(PersonalArmiesState)(state)).toEqual(state)
    expect(() => Schema.decodeUnknownSync(PersonalArmiesState)({ items: [{ ...state.items[0], shareCode: "" }] })).toThrow()
    expect(() => Schema.decodeUnknownSync(PersonalArmiesState)({ items: [{ ...state.items[0], name: "obsolete" }] })).toThrow()
  })
})
