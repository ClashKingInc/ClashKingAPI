import { Schema } from "effect"

import { strictObject } from "./strict-object.js"

import { defineEndpoint, NoBody, NoPathParams, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"
import { RuntimeInteractionProof } from "./persistent-runtime.js"

export const PersonalArmyShareCode = Schema.String.check(Schema.isPattern(/^[hidus0-9xpem_-]+$/u))
const ArmyUnit = Schema.Struct({ id: Schema.Int, quantity: Schema.Int })
const ArmySpell = Schema.Struct({ id: Schema.Int, quantity: Schema.Int, clanCastle: Schema.Boolean })
const ArmyEquipment = Schema.Struct({ equipmentId: Schema.Int, heroId: Schema.Int })
const ArmyPetAssignment = Schema.Struct({ petId: Schema.Int, heroId: Schema.Int })
export const PersonalArmy = strictObject(Schema.Struct({
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
  name: Schema.optionalKey(Schema.NullOr(Schema.String)),
  notes: Schema.optionalKey(Schema.NullOr(Schema.String)),
  minimumTownHall: Schema.optionalKey(Schema.NullOr(Schema.Int)),
}))
export const PersonalArmiesState = strictObject(Schema.Struct({
  items: Schema.Array(PersonalArmy),
}))
const BotArmyUnit = Schema.Struct({ id: Schema.Int, name: Schema.String, quantity: Schema.Int,
  section: Schema.Literals(["Troops", "Super Troops", "Spells", "Siege Machines", "Clan Castle"]) })
export const BotArmyPresentation = Schema.Struct({
  minimumTownHall: Schema.Int, troopSpace: Schema.Int, spellSpace: Schema.Int, clanCastleSpace: Schema.Int,
  metadataIncomplete: Schema.optionalKey(Schema.Boolean),
  units: Schema.Array(BotArmyUnit),
  heroes: Schema.Array(Schema.Struct({ id: Schema.Int, name: Schema.String,
    pet: Schema.optionalKey(Schema.String), equipment: Schema.Array(Schema.String) })),
})
export const BotArmyReply = strictObject(Schema.Struct({
  ...PersonalArmiesState.fields,
  shareCode: Schema.optionalKey(PersonalArmyShareCode),
  armyLink: Schema.optionalKey(Schema.String),
  saved: Schema.Boolean,
  presentation: Schema.optionalKey(BotArmyPresentation),
  name: Schema.optionalKey(Schema.String),
  notes: Schema.optionalKey(Schema.String),
  picker: Schema.optionalKey(Schema.Struct({
    options: Schema.Array(Schema.Struct({label: Schema.String, value: Schema.String, description: Schema.String, townhall: Schema.Int}))})),
}))
export const BotArmyInteractionEndpoint = defineEndpoint({
  operationId: "botArmyInteraction", method: "POST", path: "/v2/bot/armies/interaction", auth: "bot",
  summary: "Read or save the signed Discord actor's shared personal army library",
  body: RuntimeInteractionProof, bodyMode: "json", pathParams: NoPathParams, query: NoQuery,
  response: BotArmyReply, responseMode: "json", successStatus: 200,
})

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
export const UpdatePersonalArmyEndpoint = defineEndpoint({
  operationId: "updatePersonalArmy", method: "PATCH", path: "/v2/armies/personal/:shareCode", auth: "user",
  summary: "Edit the authenticated user's saved army name and notes", pathParams: ArmyPath, query: NoQuery,
  body: strictObject(Schema.Struct({
    name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    notes: Schema.NullOr(Schema.String.check(Schema.isMaxLength(450))),
  })), bodyMode: "json", response: PersonalArmiesState, responseMode: "json", successStatus: 200, errors: PersonalArmyErrors,
})

export const personalArmyEndpoints = {
  botArmyInteraction: BotArmyInteractionEndpoint,
  personalArmies: PersonalArmiesEndpoint,
  savePersonalArmy: SavePersonalArmyEndpoint,
  deletePersonalArmy: DeletePersonalArmyEndpoint,
  updatePersonalArmy: UpdatePersonalArmyEndpoint,
} as const
