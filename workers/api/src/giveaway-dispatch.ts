import { GiveawayEnterEndpoint, GiveawayPublicationClaimEndpoint, GiveawayPublicationCompleteEndpoint,
 GiveawayPublicationPendingEndpoint, GiveawayPublicationPrepareEndpoint, RuntimeGiveawayId, RuntimeInteractionProof } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { AuthIdentity } from "./auth.js"
import type { WorkerBindings } from "./environment.js"
import { InvalidRequest } from "./errors.js"
import { enterGiveaway } from "./giveaway-runtime.js"
import { claimGiveawayPublication, completeGiveawayPublication, pendingGiveawayPublications, prepareGiveawayPublication } from "./giveaway-publications.js"
import { readBoundedJson } from "./request-body.js"
import { verifyRuntimeInteraction } from "./runtime-interaction.js"

/** Giveaway-only runtime; the ticket reference runtime remains unmounted. */
export const dispatchGiveawayRuntime = (request: Request, bindings: WorkerBindings) => Effect.gen(function* () {
 const path = new URL(request.url).pathname
 const entry = /^\/v2\/runtime\/giveaways\/([^/]+)\/entries$/u.exec(path)
 const publication = /^\/v2\/runtime\/giveaways\/([^/]+)\/publications\/(prepare|([0-9a-f]{64})\/(claim|complete))$/u.exec(path)
 const pending = path === "/v2/runtime/giveaway-publications/pending"
 if (request.method !== "POST" || (!entry && !publication && !pending)) return undefined
 const auth = yield* AuthIdentity
 yield* auth.requireBot(request)
 if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
 const id = pending ? "" : yield* Schema.decodeUnknownEffect(RuntimeGiveawayId)(entry?.[1] ?? publication?.[1]).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid giveaway ID" })))
 const raw = yield* readBoundedJson(request, entry ? 2 * 1_048_576 + 1024 : 8192)
 const decode = <A>(schema: Schema.Codec<A, unknown, never, never>) => Schema.decodeUnknownEffect(schema)(raw).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid giveaway runtime request" })))
 let result: unknown
 if (pending) result = yield* pendingGiveawayPublications((yield* decode(GiveawayPublicationPendingEndpoint.body)).limit)
 else if (entry) {
   const interaction = yield* verifyRuntimeInteraction(yield* decode(RuntimeInteractionProof), bindings)
   result = yield* Schema.encodeEffect(GiveawayEnterEndpoint.response)(yield* enterGiveaway(id, interaction)).pipe(Effect.orDie)
 } else if (publication?.[2] === "prepare") result = yield* prepareGiveawayPublication(id, (yield* decode(GiveawayPublicationPrepareEndpoint.body)).kind, bindings.GIVEAWAY_MEDIA_ORIGIN)
 else if (publication?.[4] === "claim") {
   yield* decode(GiveawayPublicationClaimEndpoint.body)
   result = yield* claimGiveawayPublication(id, publication[3]!)
 } else result = yield* completeGiveawayPublication(id, publication![3]!, yield* decode(GiveawayPublicationCompleteEndpoint.body))
 return Response.json(result, { headers: { "cache-control": "no-store" } })
})
