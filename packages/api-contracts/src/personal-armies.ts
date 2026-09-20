import { Schema } from "effect"

import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"

export const PersonalArmyShareCode = Schema.String.check(Schema.isPattern(/^[hidus0-9xpem_-]+$/u))
const ArmyUnit = Schema.Struct({ id: Schema.Int, quantity: Schema.Int })
const ArmySpell = Schema.Struct({ id: Schema.Int, quantity: Schema.Int, clanCastle: Schema.Boolean })
const ArmyEquipment = Schema.Struct({ equipmentId: Schema.Int, heroId: Schema.Int })
const ArmyPetAssignment = Schema.Struct({ petId: Schema.Int, heroId: Schema.Int })
export const PersonalArmy = Schema.Struct({
  shareCode: PersonalArmyShareCode,
  armyLink: Schema.String,
  mainTroops: Schema.Array(ArmyUnit),
  clanCastleTroops: Schema.Array(ArmyUnit),
  spells: Schema.Array(ArmySpell),
  heroes: Schema.Array(Schema.Int),
  equipment: Schema.Array(ArmyEquipment),
  petAssignments: Schema.Array(ArmyPetAssignment),
  siegeMachineId: Schema.NullOr(Schema.Int),
  savedAt: Schema.String,
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export const PersonalArmiesState = Schema.Struct({
  items: Schema.Array(PersonalArmy),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

const PersonalArmyErrors = [
  { status: 400, body: ErrorResponse },
  { status: 401, body: ErrorResponse },
  { status: 404, body: ErrorResponse },
] as const
const ArmyPath = Schema.Struct({ shareCode: PersonalArmyShareCode })

export const PersonalArmiesEndpoint = defineEndpoint({
  operationId: "getPersonalArmies", method: "GET", path: "/v2/armies/personal", auth: "user",
  summary: "List the authenticated user's saved armies", body: NoBody, bodyMode: "none",
  pathParams: NoPathParams, query: NoQuery, response: PersonalArmiesState, responseMode: "json", successStatus: 200,
  errors: PersonalArmyErrors,
})
export const SavePersonalArmyEndpoint = defineEndpoint({
  operationId: "savePersonalArmy", method: "PUT", path: "/v2/armies/personal/:shareCode", auth: "user",
  summary: "Save one known army composition", body: NoBody, bodyMode: "none", pathParams: ArmyPath, query: NoQuery,
  response: PersonalArmiesState, responseMode: "json", successStatus: 200, errors: PersonalArmyErrors,
})
export const DeletePersonalArmyEndpoint = defineEndpoint({
  operationId: "deletePersonalArmy", method: "DELETE", path: "/v2/armies/personal/:shareCode", auth: "user",
  summary: "Delete one saved army", body: NoBody, bodyMode: "none", pathParams: ArmyPath, query: NoQuery,
  response: PersonalArmiesState, responseMode: "json", successStatus: 200, errors: PersonalArmyErrors,
})

export const personalArmyEndpoints = {
  personalArmies: PersonalArmiesEndpoint,
  savePersonalArmy: SavePersonalArmyEndpoint,
  deletePersonalArmy: DeletePersonalArmyEndpoint,
} as const
