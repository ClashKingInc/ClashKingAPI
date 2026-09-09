import { DecimalSnowflake } from "@clashking/api-contracts"
import { RuntimeUUID } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { Forbidden, InvalidRequest } from "./errors.js"
import type { VerifiedRuntimeInteraction } from "./runtime-interaction.js"

export type TicketStaffAction =
  | { readonly action: "set_status"; readonly status: "open" | "sleep" | "closed" | "delete"; readonly ticketId?: string }
  | { readonly action: "assign" | "approve"; readonly ticketId: string }
  | { readonly action: "add_member"; readonly memberId: string }
  | { readonly action: "opt"; readonly enabled: boolean }

const StatusCommand = Schema.Struct({ type: Schema.Literal(1), name: Schema.Literal("status"), options: Schema.Tuple([
  Schema.Struct({ type: Schema.Literal(3), name: Schema.Literal("status"), value: Schema.Literals(["open", "sleep", "close", "delete"]) }),
]) })
const AddCommand = Schema.Struct({ type: Schema.Literal(1), name: Schema.Literal("add"), options: Schema.Tuple([
  Schema.Struct({ type: Schema.Literal(6), name: Schema.Literal("member"), value: DecimalSnowflake }),
]) })
const OptCommand = Schema.Struct({ type: Schema.Literal(1), name: Schema.Literal("opt"), options: Schema.Tuple([
  Schema.Struct({ type: Schema.Literal(3), name: Schema.Literal("opt"), value: Schema.Literals(["In", "Out"]) }),
]) })
const Commands = Schema.Tuple([Schema.Union([StatusCommand, AddCommand, OptCommand])])

/** Derive every mutation input from verified signed bytes, with no unsigned overrides. */
export const parseTicketStaffAction = (interaction: VerifiedRuntimeInteraction): Effect.Effect<TicketStaffAction, Forbidden | InvalidRequest> => Effect.gen(function* () {
  if (interaction.type === 3 && interaction.data.component_type === 2 && interaction.messageId !== undefined) {
    const match = /^ck:ticket:(close|delete|assign|approve):(.+)$/u.exec(interaction.data.custom_id ?? "")
    if (match === null) return yield* new Forbidden({ message: "A canonical ticket staff control is required" })
    const ticketId = yield* Schema.decodeUnknownEffect(RuntimeUUID)(match[2]).pipe(
      Effect.mapError(() => new InvalidRequest({ message: "Invalid ticket ID" })),
    )
    return match[1] === "close" || match[1] === "delete"
      ? { action: "set_status", status: match[1] === "close" ? "closed" : "delete", ticketId } as const
      : { action: match[1] as "assign" | "approve", ticketId } as const
  }
  if (interaction.type !== 2 || interaction.data.name !== "ticket") {
    return yield* new Forbidden({ message: "A canonical ticket staff command is required" })
  }
  const [command] = yield* Schema.decodeUnknownEffect(Commands)(interaction.data.options, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid ticket staff command options" })),
  )
  if (command.name === "status") return { action: "set_status", status: command.options[0].value === "close" ? "closed" : command.options[0].value } as const
  if (command.name === "add") return { action: "add_member", memberId: command.options[0].value } as const
  return { action: "opt", enabled: command.options[0].value === "In" } as const
})
