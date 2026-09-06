import { RuntimeInteractionProof, RuntimeUUID } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { Forbidden } from "./errors.js"
import { verifyRuntimeInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"

const isUUID = Schema.is(RuntimeUUID)
const isBoardAction = Schema.is(Schema.Literals(["signup", "remove", "sub", "refresh"]))
const isStep = Schema.is(Schema.Literals(["accounts", "group", "choice", "answers", "continue", "submit"]))
const isPublicationCommand = Schema.is(Schema.Struct({
  name: Schema.Literal("roster"),
  options: Schema.Array(Schema.Struct({ name: Schema.Literal("post"), type: Schema.Literal(1),
    options: Schema.Array(Schema.Struct({ name: Schema.Literals(["roster", "type"]), type: Schema.Literal(3), value: Schema.String }))
      .check(Schema.isMinLength(2), Schema.isMaxLength(2)),
  })).check(Schema.isMinLength(1), Schema.isMaxLength(1)),
}))
const isPublicationMode = Schema.is(Schema.Literals(["Signup", "Post", "Static"]))
const publicationModes = { Signup: "signup", Post: "post", Static: "static" } as const

/** Verification deliberately precedes receipt lookup; freshness is checked after exact replay lookup. */
export const verifyRosterInteraction = (
  proof: typeof RuntimeInteractionProof.Type,
  configuration: { readonly DISCORD_PUBLIC_KEY: string; readonly DISCORD_APPLICATION_ID: string },
) => Effect.gen(function* () {
  const interaction: VerifiedRuntimeInteraction = yield* verifyRuntimeInteraction(proof, configuration)
  if (interaction.type === 2 && isPublicationCommand(interaction.data)) {
    const options = interaction.data.options[0]?.options ?? []
    const rosterId = options.find((option) => option.name === "roster")?.value
    const mode = options.find((option) => option.name === "type")?.value
    if (isUUID(rosterId) && isPublicationMode(mode)) {
      return { interaction, control: { kind: "publish" as const, rosterId: rosterId.toLowerCase(), mode: publicationModes[mode] } }
    }
  }
  const parts = interaction.data.custom_id?.split(":") ?? []
  if (parts[0] !== "ck" || parts[1] !== "roster" || !isUUID(parts[3])) {
    return yield* new Forbidden({ message: "A canonical roster control is required", reason: "wrong_message" })
  }
  const id = parts[3].toLowerCase()
  if (parts.length === 4 && isBoardAction(parts[2]) && interaction.type === 3
    && interaction.data.component_type === 2 && interaction.messageId !== undefined) {
    return { interaction, control: { kind: "action" as const, action: parts[2], rosterId: id } }
  }
  if (parts.length === 4 && (parts[2] === "status" || parts[2] === "publication-status")
    && interaction.type === 3 && interaction.data.component_type === 2) {
    return { interaction, control: { kind: parts[2], operationId: id } }
  }
  if (parts.length === 5 && isStep(parts[2]) && /^[1-9][0-9]{0,9}$/u.test(parts[4] ?? "")) {
    const step = parts[2], version = Number(parts[4])
    const matchesType = step === "answers" ? interaction.type === 5
      : interaction.type === 3 && interaction.data.component_type === (step === "continue" || step === "submit" ? 2 : 3)
    if (matchesType && version <= 2_147_483_647) {
      return { interaction, control: { kind: "advance" as const, step, operationId: id, version } }
    }
  }
  return yield* new Forbidden({ message: "A canonical roster control is required", reason: "wrong_message" })
})
