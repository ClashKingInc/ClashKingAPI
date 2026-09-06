import { GiveawayEnterEndpoint, GiveawayPublicationClaimEndpoint, GiveawayPublicationCompleteEndpoint,
  GiveawayPublicationPendingEndpoint, GiveawayPublicationPrepareEndpoint, RuntimeGiveawayId, RuntimeInteractionProof,
  TicketOperationAdvanceEndpoint, TicketOperationStatusEndpoint,TicketPanelPublicationPrepareEndpoint,
  TicketPanelPublicationStatusEndpoint } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { AuthIdentity } from "./auth.js"
import type { DeferredRuntimeBindings } from "./environment.js"
import { Forbidden, InvalidRequest, UpstreamUnavailable } from "./errors.js"
import { advanceTicketStaff, prepareTicketStaff } from "./ticket-staff-runtime.js"
import { enterGiveaway } from "./giveaway-runtime.js"
import { readBoundedJson } from "./request-body.js"
import { verifyRuntimeInteraction } from "./runtime-interaction.js"
import { claimGiveawayPublication, completeGiveawayPublication, pendingGiveawayPublications, prepareGiveawayPublication } from "./giveaway-publications.js"
import { advanceTicketOperation, prepareTicketOpen, ticketOperationStatus, wakeTicketOperation } from "./ticket-runtime.js"
import { prepareTicketPanelPublication,ticketPanelPublicationStatus } from "./ticket-panel-publications.js"
import { ticketAccountInteraction } from "./ticket-account-runtime.js"

export const persistentRuntimeRoutes = [
  { method: "POST", path: "/v2/runtime/giveaways/:giveawayId/entries", operation: "giveawayEnter" },
  { method: "POST", path: "/v2/runtime/giveaways/:giveawayId/publications/prepare", operation: "giveawayPublicationPrepare" },
  { method: "POST", path: "/v2/runtime/giveaways/:giveawayId/publications/:effectId/claim", operation: "giveawayPublicationClaim" },
  { method: "POST", path: "/v2/runtime/giveaways/:giveawayId/publications/:effectId/complete", operation: "giveawayPublicationComplete" },
  { method: "POST", path: "/v2/runtime/giveaway-publications/pending", operation: "giveawayPublicationPending" },
  { method: "POST", path: "/v2/runtime/tickets/open/prepare", operation: "ticketOpenPrepare" },
  { method: "POST", path: "/v2/runtime/tickets/approve/prepare", operation: "ticketApprovePrepare" },
  { method: "POST", path: "/v2/runtime/ticket-operations/:operationId/advance", operation: "ticketOperationAdvance" },
  { method: "POST", path: "/v2/runtime/tickets/actions", operation: "ticketAction" },
  { method: "POST", path: "/v2/runtime/tickets/accounts", operation: "ticketAccountInteraction" },
  { method: "POST", path: "/v2/runtime/ticket-operations/:operationId/status", operation: "ticketOperationStatus" },
  { method: "POST", path: "/v2/runtime/ticket-panel-publications/prepare", operation: "ticketPanelPublicationPrepare" },
  { method: "POST", path: "/v2/runtime/ticket-panel-publications/:effectId/status", operation: "ticketPanelPublicationStatus" },
] as const

export const dispatchPersistentRuntime = (request: Request, bindings: DeferredRuntimeBindings) => Effect.gen(function* () {
  const path = new URL(request.url).pathname
  const match = /^\/v2\/runtime\/giveaways\/([^/]+)\/entries$/u.exec(path)
  const publication = /^\/v2\/runtime\/giveaways\/([^/]+)\/publications\/(prepare|([0-9a-f]{64})\/(claim|complete))$/u.exec(path)
  const pending = path === "/v2/runtime/giveaway-publications/pending"
  const ticketPrepare = path === "/v2/runtime/tickets/open/prepare"
  const ticketApprove = path === "/v2/runtime/tickets/approve/prepare"
  const ticketAction = path === "/v2/runtime/tickets/actions"
  const ticketAccounts = path === "/v2/runtime/tickets/accounts"
  const ticketOperation = /^\/v2\/runtime\/ticket-operations\/([0-9a-f-]{36})\/(advance|status)$/iu.exec(path)
  const panelPrepare=path==="/v2/runtime/ticket-panel-publications/prepare"
  const panelStatus=/^\/v2\/runtime\/ticket-panel-publications\/([0-9a-f]{64})\/status$/u.exec(path)
  if (request.method !== "POST" || (match === null && publication === null && !pending && !ticketPrepare &&
    !ticketApprove && !ticketAction && !ticketAccounts && ticketOperation === null && !panelPrepare && panelStatus === null)) return undefined
  const auth = yield* AuthIdentity
  yield* auth.requireBot(request)
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
  }
  if (ticketPrepare || ticketApprove || ticketAction || ticketAccounts || ticketOperation !== null) {
    const raw = yield* readBoundedJson(request, 2 * 1_048_576 + 1024)
    const proof = yield* Schema.decodeUnknownEffect(RuntimeInteractionProof)(raw).pipe(
      Effect.mapError(() => new InvalidRequest({ message:"Invalid Discord interaction proof" })),
    )
    const interaction = yield* verifyRuntimeInteraction(proof,bindings)
    if (ticketAccounts) return Response.json(yield* ticketAccountInteraction(interaction), { headers: { "cache-control":"no-store" } })
    if (ticketApprove) return yield* new Forbidden({ message:"Ticket approval template runtime is not ready" })
    if (ticketAction) {
      const result = yield* prepareTicketStaff(interaction)
      if (result.outcome === "accepted") yield* wakeTicketOperation(bindings,result.operationId,interaction.guildId,result.ticketId)
      return Response.json(result,{headers:{"cache-control":"no-store"}})
    }
    if (ticketPrepare) {
      const result = yield* prepareTicketOpen(interaction)
      if (result.outcome === "accepted") yield* wakeTicketOperation(bindings,result.operationId,interaction.guildId,result.ticketId)
      return Response.json(result,{ headers:{ "cache-control":"no-store" } })
    }
    const operationId = ticketOperation![1]!
    if (ticketOperation![2] === "advance") {
      yield* Schema.decodeUnknownEffect(TicketOperationAdvanceEndpoint.body)(raw).pipe(
        Effect.mapError(() => new InvalidRequest({ message:"Invalid ticket operation advance" })),
      )
      const staffResult = yield* advanceTicketStaff(operationId,interaction)
      const result = staffResult ?? (yield* advanceTicketOperation(operationId,interaction))
      if (result.outcome === "accepted") yield* wakeTicketOperation(bindings,result.operationId,interaction.guildId,result.ticketId)
      return Response.json(result,{ headers:{ "cache-control":"no-store" } })
    }
    yield* Schema.decodeUnknownEffect(TicketOperationStatusEndpoint.body)(raw).pipe(
      Effect.mapError(() => new InvalidRequest({ message:"Invalid ticket operation status request" })),
    )
    const result = yield* ticketOperationStatus(operationId,interaction)
    if (["submitted","provisioning","reconciling"].includes(result.state)) {
      yield* wakeTicketOperation(bindings,result.operationId,interaction.guildId,result.ticketId)
    }
    return Response.json(result,{ headers:{ "cache-control":"no-store" } })
  }
  if(panelPrepare||panelStatus!==null){
    const raw=yield* readBoundedJson(request,2*1_048_576+1024)
    const proof=yield* Schema.decodeUnknownEffect(panelPrepare?TicketPanelPublicationPrepareEndpoint.body:TicketPanelPublicationStatusEndpoint.body)(raw).pipe(
      Effect.mapError(()=>new InvalidRequest({ message:"Invalid ticket panel publication interaction proof" })))
    const interaction=yield* verifyRuntimeInteraction(proof,bindings)
    if(panelPrepare){
      yield* Schema.decodeUnknownEffect(TicketPanelPublicationPrepareEndpoint.body)(raw).pipe(
        Effect.mapError(()=>new InvalidRequest({ message:"Invalid ticket panel publication request" })))
      const result=yield* prepareTicketPanelPublication(interaction)
      yield* Effect.tryPromise({ try:()=>bindings.TICKET_RUNTIME.getByName(`${interaction.guildId}:panel:${result.panelId}`).wake(result.effectId),
        catch:cause=>new UpstreamUnavailable({ cause,message:"Ticket panel publication coordinator is unavailable" }) })
      return Response.json(result,{ headers:{ "cache-control":"no-store" } })
    }
    yield* Schema.decodeUnknownEffect(TicketPanelPublicationStatusEndpoint.body)(raw).pipe(
      Effect.mapError(()=>new InvalidRequest({ message:"Invalid ticket panel publication status request" })))
    const result=yield* ticketPanelPublicationStatus(panelStatus![1]!,interaction)
    if(result.state==="pending"||result.state==="executing"||result.state==="uncertain")yield* Effect.tryPromise({
      try:()=>bindings.TICKET_RUNTIME.getByName(`${interaction.guildId}:panel:${result.panelId}`).wake(result.effectId),
      catch:cause=>new UpstreamUnavailable({ cause,message:"Ticket panel publication coordinator is unavailable" }) })
    return Response.json(result,{ headers:{ "cache-control":"no-store" } })
  }
  const giveawayId = pending ? "" : yield* Schema.decodeUnknownEffect(RuntimeGiveawayId)(match?.[1] ?? publication?.[1]).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid giveaway ID" })),
  )
  if (pending || publication !== null) {
    const raw = yield* readBoundedJson(request, 8192)
    const decode = <A>(schema: Schema.Codec<A,unknown,never,never>) => Schema.decodeUnknownEffect(schema)(raw).pipe(
      Effect.mapError(() => new InvalidRequest({ message: "Invalid giveaway publication request" })),
    )
    let result: unknown
    if (pending) result = yield* pendingGiveawayPublications((yield* decode(GiveawayPublicationPendingEndpoint.body)).limit)
    else if (publication?.[2] === "prepare") result = yield* prepareGiveawayPublication(giveawayId,(yield* decode(GiveawayPublicationPrepareEndpoint.body)).kind)
    else if (publication?.[4] === "claim") {
      yield* decode(GiveawayPublicationClaimEndpoint.body)
      result = yield* claimGiveawayPublication(giveawayId,publication[3]!)
    } else result = yield* completeGiveawayPublication(giveawayId,publication![3]!,yield* decode(GiveawayPublicationCompleteEndpoint.body))
    return Response.json(result, { headers: { "cache-control": "no-store" } })
  }
  const raw = yield* readBoundedJson(request, 2 * 1_048_576 + 1024)
  const proof = yield* Schema.decodeUnknownEffect(RuntimeInteractionProof)(raw).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid Discord interaction proof" })),
  )
  const interaction = yield* verifyRuntimeInteraction(proof, bindings)
  const result = yield* enterGiveaway(giveawayId, interaction)
  const body = yield* Schema.encodeEffect(GiveawayEnterEndpoint.response)(result).pipe(Effect.orDie)
  return Response.json(body, { headers: { "cache-control": "no-store" } })
})
