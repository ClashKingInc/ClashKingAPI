import { Schema } from "effect"
import { defineEndpoint, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"
import { DecimalSnowflake } from "./discord.js"

/** The original signed UTF-8 body, never reserialized, logged, or persisted. */
export const RuntimeInteractionProof = Schema.Struct({
  interaction: Schema.Struct({
    rawBody: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_048_576)),
    signature: Schema.String.check(Schema.isPattern(/^[0-9a-fA-F]{128}$/u)),
    timestamp: Schema.String.check(Schema.isPattern(/^[0-9]{1,16}$/u)),
  }),
})

export const RuntimeGiveawayId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,80}$/u))
export const RuntimeUUID = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
)
export const GiveawayEnterResponse = Schema.Struct({
  giveawayId: RuntimeGiveawayId,
  outcome: Schema.Literals(["entered", "already_entered"]),
  entryCount: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
})
export const GiveawayEntryRejection = Schema.Literals(["roles", "avatar", "linked_account", "not_member", "not_open", "invalid_configuration", "wrong_message"])
export const GiveawayEntryError = Schema.Struct({ ...ErrorResponse.fields, reason: GiveawayEntryRejection })
export const GiveawayEnterEndpoint = defineEndpoint({
  auth: "bot", body: RuntimeInteractionProof, bodyMode: "json", method: "POST",
  operationId: "giveawayEnter", path: "/v2/runtime/giveaways/:giveawayId/entries",
  pathParams: Schema.Struct({ giveawayId: RuntimeGiveawayId }), query: NoQuery,
  response: GiveawayEnterResponse, responseMode: "json", successStatus: 200,
  summary: "Enter a giveaway using an independently verified Discord interaction",
  errors: [
    { status: 403, body: Schema.Union([GiveawayEntryError, ErrorResponse]) },
    { status: 409, body: Schema.Union([GiveawayEntryError, ErrorResponse]) },
    ...[400, 401, 404, 413, 415, 429, 503].map((status) => ({ status, body: ErrorResponse })),
  ],
})

export const GiveawayPublicationKind = Schema.Literals(["start", "update", "end", "reroll"])
export const GiveawayPublicationPayload = Schema.Struct({
  version: Schema.Literal(1),
  occurred_at: Schema.String,
  giveaway: Schema.Struct({
    id: RuntimeGiveawayId, server_id: DecimalSnowflake, channel_id: DecimalSnowflake,
    message_id: Schema.NullOr(DecimalSnowflake), prize: Schema.String,
    status: Schema.Literals(["scheduled", "ongoing", "ended"]), end_time: Schema.String,
    winners: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
    mentions: Schema.Array(Schema.String), text_above_embed: Schema.String,
    text_in_embed: Schema.String, text_on_end: Schema.String, image_url: Schema.NullOr(Schema.String),
    entry_count: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  }),
  winner_ids: Schema.Array(DecimalSnowflake),
  replaced_user_ids: Schema.Array(DecimalSnowflake),
  reason: Schema.String,
  actor_label: Schema.String,
})
export const GiveawayPublicationEffectId = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u))
const PublicationPath = Schema.Struct({ giveawayId: RuntimeGiveawayId, effectId: GiveawayPublicationEffectId })
const PublicationErrors = [400, 401, 404, 409, 413, 429, 503].map((status) => ({ status, body: ErrorResponse }))
export const GiveawayPublicationPrepareEndpoint = defineEndpoint({
  auth: "bot", body: Schema.Struct({ kind: Schema.Literals(["start", "update", "end"]) }), bodyMode: "json", method: "POST",
  operationId: "giveawayPublicationPrepare", path: "/v2/runtime/giveaways/:giveawayId/publications/prepare",
  pathParams: Schema.Struct({ giveawayId: RuntimeGiveawayId }), query: NoQuery,
  response: Schema.Union([
    Schema.Struct({ outcome: Schema.Literal("pending") }),
    Schema.Struct({ outcome: Schema.Literal("ready"), effectId: GiveawayPublicationEffectId }),
  ]), responseMode: "json", successStatus: 200,
  summary: "Prepare an authoritative giveaway publication and resume bounded winner resolution", errors: PublicationErrors,
})
export const GiveawayPublicationClaimEndpoint = defineEndpoint({
  auth: "bot", body: Schema.Struct({}), bodyMode: "json", method: "POST",
  operationId: "giveawayPublicationClaim", path: "/v2/runtime/giveaways/:giveawayId/publications/:effectId/claim",
  pathParams: PublicationPath, query: NoQuery,
  response: Schema.Union([
    Schema.Struct({ outcome: Schema.Literals(["pending", "complete", "ambiguous", "failed"]) }),
    Schema.Struct({ outcome: Schema.Literal("claimed"), claimToken: Schema.String,
      effect: Schema.Struct({ effectId: GiveawayPublicationEffectId, kind: GiveawayPublicationKind,
        sourceMessageId: Schema.NullOr(DecimalSnowflake), startTime: Schema.String, payload: GiveawayPublicationPayload }) }),
  ]), responseMode: "json", successStatus: 200,
  summary: "Claim a persisted giveaway Discord effect before any external write", errors: PublicationErrors,
})
export const GiveawayPublicationCompleteEndpoint = defineEndpoint({
  auth: "bot", body: Schema.Struct({ claimToken: Schema.String,
    outcome: Schema.Literals(["succeeded", "ambiguous", "failed", "retry"]), messageId: Schema.optionalKey(DecimalSnowflake),
    failureReason: Schema.optionalKey(Schema.Literals(["payload_validation", "http_rejected", "transport_uncertain", "source_update_uncertain", "rate_limited"])),
    retryAfterSeconds: Schema.optionalKey(Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 300 }))),
  }), bodyMode: "json", method: "POST",
  operationId: "giveawayPublicationComplete", path: "/v2/runtime/giveaways/:giveawayId/publications/:effectId/complete",
  pathParams: PublicationPath, query: NoQuery,
  response: Schema.Struct({ outcome: Schema.Literals(["succeeded", "ambiguous", "failed", "pending"]) }),
  responseMode: "json", successStatus: 200,
  summary: "Record a fenced Discord effect result, including uncertain success", errors: PublicationErrors,
})
export const GiveawayPublicationPendingEndpoint = defineEndpoint({
  auth: "bot", body: Schema.Struct({ limit: Schema.optionalKey(Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 50 }))) }),
  bodyMode: "json", method: "POST", operationId: "giveawayPublicationPending", path: "/v2/runtime/giveaway-publications/pending",
  pathParams: Schema.Struct({}), query: NoQuery,
  response: Schema.Struct({ items: Schema.Array(Schema.Struct({ giveawayId: RuntimeGiveawayId, effectId: GiveawayPublicationEffectId })) }),
  responseMode: "json", successStatus: 200,
  summary: "Discover a bounded oldest-first batch of durable giveaway publications", errors: PublicationErrors,
})

export const TicketRuntimeState = Schema.Literals(["preparing", "submitted", "provisioning", "reconciling", "completed", "failed"])
export const TicketRuntimeAction = Schema.Literals(["open", "set_status", "assign", "approve", "add_member", "opt", "notify"])
const DiscordCustomId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))
export const TicketTextField = Schema.Struct({
  customId: DiscordCustomId, label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(45)),
  required: Schema.Boolean, style: Schema.Literals(["short", "paragraph"]),
  maxLength: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 4000 })),
})
const TicketAccountSelectFormBase = Schema.Struct({
  kind: Schema.Literal("account_select"), customId: DiscordCustomId,
  content: Schema.String.check(Schema.isMaxLength(2000)),
  placeholder: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(150)),
  minValues: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 25 })),
  maxValues: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 25 })),
  options: Schema.Array(Schema.Struct({
    value: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  })).check(Schema.isMinLength(1), Schema.isMaxLength(25)),
})
export const TicketAccountSelectForm = TicketAccountSelectFormBase.check(Schema.makeFilter((form) =>
  form.minValues <= form.maxValues && form.maxValues <= form.options.length
    ? undefined : "account select bounds must fit the supplied options"))
export const TicketModalForm = Schema.Struct({
  kind: Schema.Literal("modal"), customId: DiscordCustomId,
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(45)),
  fields: Schema.Array(TicketTextField).check(Schema.isMinLength(1), Schema.isMaxLength(5)),
})
export const TicketContinueForm = Schema.Struct({
  kind: Schema.Literal("continue"), customId: DiscordCustomId,
  content: Schema.String.check(Schema.isMaxLength(2000)),
  label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
})
export const TicketStringSelectForm = Schema.Struct({
  kind: Schema.Literal("string_select"), customId: DiscordCustomId,
  content: Schema.String.check(Schema.isMaxLength(2000)),
  placeholder: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(150)),
  minValues: Schema.Literal(1), maxValues: Schema.Literal(1),
  options: Schema.Array(Schema.Struct({
    value: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    description: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))),
  })).check(Schema.isMinLength(1), Schema.isMaxLength(25)),
})
export const TicketApplicationForm = Schema.Union([TicketAccountSelectForm, TicketStringSelectForm, TicketModalForm, TicketContinueForm])
const TicketReadyResponse = Schema.Struct({ outcome: Schema.Literal("ready"), operationId: RuntimeUUID,
  ticketId: RuntimeUUID, action: Schema.Literals(["open", "approve", "assign"]), expiresAt: Schema.String, form: TicketApplicationForm })
const TicketAcceptedResponse = Schema.Struct({ outcome: Schema.Literals(["accepted", "complete"]),
  operationId: RuntimeUUID, ticketId: RuntimeUUID, state: TicketRuntimeState })
/** A scoped preparation exists, but no ticket or opening operation exists yet. */
export const TicketLinkRequiredResponse = Schema.Struct({ outcome: Schema.Literal("link_required"),
  preparationId: RuntimeUUID, expiresAt: Schema.String,
  content: Schema.String.check(Schema.isMaxLength(2000)),
  link: Schema.Struct({ customId: DiscordCustomId,
    label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)) }),
})
const TicketOperationErrors = [400, 401, 403, 404, 409, 413, 415, 429, 503].map((status) => ({ status, body: ErrorResponse }))
export const TicketOpenPrepareEndpoint = defineEndpoint({
  auth: "bot", body: RuntimeInteractionProof, bodyMode: "json", method: "POST",
  operationId: "ticketOpenPrepare", path: "/v2/runtime/tickets/open/prepare",
  pathParams: Schema.Struct({}), query: NoQuery,
  response: Schema.Union([TicketReadyResponse, TicketAcceptedResponse, TicketLinkRequiredResponse]), responseMode: "json", successStatus: 200,
  summary: "Prepare or directly accept a canonical ticket-opening interaction", errors: TicketOperationErrors,
})
export const TicketApprovePrepareEndpoint = defineEndpoint({
  auth: "bot", body: RuntimeInteractionProof, bodyMode: "json", method: "POST",
  operationId: "ticketApprovePrepare", path: "/v2/runtime/tickets/approve/prepare",
  pathParams: Schema.Struct({}), query: NoQuery,
  response: Schema.Union([TicketReadyResponse, TicketAcceptedResponse]), responseMode: "json", successStatus: 200,
  summary: "Prepare or directly accept a canonical ticket approval interaction", errors: TicketOperationErrors,
})
export const TicketOperationAdvanceEndpoint = defineEndpoint({
  auth: "bot", body: RuntimeInteractionProof, bodyMode: "json", method: "POST",
  operationId: "ticketOperationAdvance", path: "/v2/runtime/ticket-operations/:operationId/advance",
  pathParams: Schema.Struct({ operationId: RuntimeUUID }), query: NoQuery,
  response: Schema.Union([TicketReadyResponse, TicketAcceptedResponse]), responseMode: "json", successStatus: 200,
  summary: "Advance a signed ticket account selection, questionnaire page, or continuation", errors: TicketOperationErrors,
})
export const TicketActionEndpoint = defineEndpoint({
  auth: "bot", body: RuntimeInteractionProof, bodyMode: "json", method: "POST",
  operationId: "ticketAction", path: "/v2/runtime/tickets/actions",
  pathParams: Schema.Struct({}), query: NoQuery,
  response: Schema.Union([TicketReadyResponse, TicketAcceptedResponse]), responseMode: "json", successStatus: 200,
  summary: "Accept a signed ticket status, assignment, close, or delete action", errors: TicketOperationErrors,
})
export const TicketOperationStatusEndpoint = defineEndpoint({
  auth: "bot", body: RuntimeInteractionProof, bodyMode: "json", method: "POST",
  operationId: "ticketOperationStatus", path: "/v2/runtime/ticket-operations/:operationId/status",
  pathParams: Schema.Struct({ operationId: RuntimeUUID }), query: NoQuery,
  response: Schema.Struct({ operationId: RuntimeUUID, ticketId: RuntimeUUID, state: TicketRuntimeState, action: TicketRuntimeAction,
    channelId: Schema.optionalKey(DecimalSnowflake), threadId: Schema.optionalKey(DecimalSnowflake),
    failure: Schema.optionalKey(Schema.String) }), responseMode: "json", successStatus: 200,
  summary: "Wake and read an idempotent ticket operation", errors: TicketOperationErrors,
})
export const TicketPanelPublicationEffectId = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u))
export const TicketPanelPublicationState = Schema.Literals(["pending","executing","uncertain","succeeded","failed"])
export const TicketPanelPublicationPrepareEndpoint = defineEndpoint({
  auth:"bot",body:RuntimeInteractionProof,bodyMode:"json",method:"POST",
  operationId:"ticketPanelPublicationPrepare",path:"/v2/runtime/ticket-panel-publications/prepare",
  pathParams:Schema.Struct({}),query:NoQuery,
  response:Schema.Struct({ effectId:TicketPanelPublicationEffectId,panelId:RuntimeUUID,state:TicketPanelPublicationState,
    statusCustomId:DiscordCustomId }),
  responseMode:"json",successStatus:200,summary:"Journal and wake an API-owned canonical ticket panel publication",
  errors:TicketOperationErrors,
})
export const TicketPanelPublicationStatusEndpoint = defineEndpoint({
  auth:"bot",body:RuntimeInteractionProof,bodyMode:"json",method:"POST",
  operationId:"ticketPanelPublicationStatus",path:"/v2/runtime/ticket-panel-publications/:effectId/status",
  pathParams:Schema.Struct({ effectId:TicketPanelPublicationEffectId }),query:NoQuery,
  response:Schema.Struct({ effectId:TicketPanelPublicationEffectId,panelId:RuntimeUUID,state:TicketPanelPublicationState,
    statusCustomId:DiscordCustomId,messageId:Schema.optionalKey(DecimalSnowflake) }),responseMode:"json",successStatus:200,
  summary:"Wake and read an API-owned ticket panel publication",errors:TicketOperationErrors,
})

const TicketViewerAccount = Schema.Struct({
  tag: Schema.String.check(Schema.isPattern(/^#[A-Z0-9]+$/u)),
  name: Schema.String.check(Schema.isMaxLength(100)),
  townHallLevel: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
})
export const TicketAccountInteractionEndpoint = defineEndpoint({
  auth: "bot", body: RuntimeInteractionProof, bodyMode: "json", method: "POST",
  operationId: "ticketAccountInteraction", path: "/v2/runtime/tickets/accounts",
  pathParams: Schema.Struct({}), query: NoQuery,
  response: Schema.Union([
    Schema.Struct({ outcome: Schema.Literal("form"), preparationId: RuntimeUUID,
      expiresAt: Schema.String, form: TicketModalForm }),
    Schema.Struct({ outcome: Schema.Literal("linked"), preparationId: RuntimeUUID,
      accountTag: TicketViewerAccount.fields.tag, content: Schema.String.check(Schema.isMaxLength(2000)) }),
    Schema.Struct({ outcome: Schema.Literal("accounts"), ticketId: RuntimeUUID, sessionId: RuntimeUUID,
      expiresAt: Schema.String, content: Schema.String.check(Schema.isMaxLength(2000)),
      accounts: Schema.Array(TicketViewerAccount).check(Schema.isMinLength(1), Schema.isMaxLength(25)),
      select: Schema.Struct({ customId: DiscordCustomId,
        placeholder: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(150)),
        options: Schema.Array(Schema.Struct({ label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
          value: TicketViewerAccount.fields.tag })).check(Schema.isMinLength(1), Schema.isMaxLength(25)),
        minValues: Schema.Literal(1), maxValues: Schema.Literal(1) }),
    }),
    Schema.Struct({ outcome: Schema.Literal("account"), ticketId: RuntimeUUID, sessionId: RuntimeUUID,
      content: Schema.String.check(Schema.isMaxLength(2000)), account: TicketViewerAccount }),
  ]), responseMode: "json", successStatus: 200,
  summary: "View or link accounts through an independently verified, scoped ticket account session", errors: TicketOperationErrors,
})

export const persistentRuntimeEndpoints = {
  giveawayEnter: GiveawayEnterEndpoint,
  giveawayPublicationPrepare: GiveawayPublicationPrepareEndpoint,
  giveawayPublicationClaim: GiveawayPublicationClaimEndpoint,
  giveawayPublicationComplete: GiveawayPublicationCompleteEndpoint,
  giveawayPublicationPending: GiveawayPublicationPendingEndpoint,
  ticketOpenPrepare: TicketOpenPrepareEndpoint,
  ticketApprovePrepare: TicketApprovePrepareEndpoint,
  ticketOperationAdvance: TicketOperationAdvanceEndpoint,
  ticketAction: TicketActionEndpoint,
  ticketAccountInteraction: TicketAccountInteractionEndpoint,
  ticketOperationStatus: TicketOperationStatusEndpoint,
  ticketPanelPublicationPrepare:TicketPanelPublicationPrepareEndpoint,
  ticketPanelPublicationStatus:TicketPanelPublicationStatusEndpoint,
} as const

export const persistentRuntimeReadinessBlockers = {
  ticketApprovePrepare:"Approval template runtime and integrated staff proof remain incomplete",
  ticketAction:"Ticket deletion transcript runtime and integrated staff proof remain incomplete",
} as const satisfies Partial<Record<keyof typeof persistentRuntimeEndpoints,string>>
