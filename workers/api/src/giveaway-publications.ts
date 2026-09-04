import { GiveawayPublicationPayload, type GiveawayPublicationClaimEndpoint, type GiveawayPublicationCompleteEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Conflict, DatabaseFailure, InvalidRequest, NotFound } from "./errors.js"
import { resolveEndingGiveaway } from "./giveaway-outcomes.js"

type Kind = "start" | "update" | "end" | "reroll"
interface Publication {
  readonly effect_id: string; readonly giveaway_id: string; readonly kind: Kind; readonly state: string
  readonly source_message_id: string | null; readonly start_time: string; readonly payload: unknown
  readonly claim_token: string | null; readonly result_message_id: string | null; readonly expired: boolean; readonly ready: boolean
}
type ClaimResponse = typeof GiveawayPublicationClaimEndpoint.response.Type
type Completion = typeof GiveawayPublicationCompleteEndpoint.body.Type
const hash = (value: string) => Effect.promise(async () => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join(""))
const databaseFailure = (cause?: unknown) => new DatabaseFailure({ cause, message: "Giveaway publication storage is unavailable" })

/** Must run inside the caller's giveaway row transaction (also used by reroll). */
export const enqueueGiveawayPublication = (giveawayId: string, kind: Kind,
  reroll?: { readonly operationId: string; readonly winnerIds: readonly string[]; readonly replacedIds: readonly string[]; readonly actorLabel: string; readonly occurredAt: string },
) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const identity = (yield* sql<{ server_id: string; channel_id: string | null; start_time: string; updated_at: string; message_id: string | null; status: string }>`
    SELECT server_id,channel_id,start_time::text,updated_at::text,message_id,status FROM giveaways WHERE id=${giveawayId}`)[0]
  if (!identity) return yield* new NotFound({ message: "Giveaway not found" })
  if (!identity.channel_id || (kind !== "start" && !identity.message_id)) return yield* new Conflict({ message: "Giveaway publication destination is incomplete" })
  if (kind === "start" && identity.message_id !== null) return yield* new Conflict({ message: "Giveaway already has a published message" })
  const occurrence = kind === "update" ? identity.updated_at : kind === "reroll" ? reroll?.operationId : "initial"
  if (occurrence === undefined) return yield* new InvalidRequest({ message: "Reroll operation identity is required" })
  const effectId = yield* hash(JSON.stringify([giveawayId, identity.server_id, identity.channel_id, identity.start_time, kind, occurrence]))
  const prior = (yield* sql<{ effect_id: string }>`SELECT effect_id FROM giveaway_publication_effects WHERE effect_id=${effectId}`)[0]
  if (prior) return prior.effect_id
  if (kind === "start" || kind === "end") {
    const conflicting = yield* sql`SELECT effect_id FROM giveaway_publication_effects WHERE giveaway_id=${giveawayId} AND kind=${kind} LIMIT 1`
    if (conflicting.length) return yield* new Conflict({ message: "Giveaway occurrence changed; publication requires reconciliation" })
  }
  // Build and size-check the complete snapshot in SQL before transferring it to
  // the Worker, including arbitrarily large legacy winners arrays.
  const data = (yield* sql<{ payload: unknown; bytes: number }>`WITH snapshot AS (
    SELECT jsonb_build_object('version',1,'occurred_at',${reroll?.occurredAt ?? new Date().toISOString()}::text,
      'giveaway',jsonb_build_object('id',id,'server_id',server_id,'channel_id',channel_id,'message_id',message_id,
        'prize',prize,'status',status,'end_time',end_time,'winners',winners,'mentions',to_jsonb(mentions),
        'text_above_embed',text_above_embed,'text_in_embed',text_in_embed,'text_on_end',text_on_end,
        'image_url',CASE WHEN image_url ~ '^[a-z0-9_-]+[.](png|jpg|jpeg|gif|webp)$' THEN 'https://api.clashk.ing/v2/media/giveaway_' || image_url ELSE NULL END,
        'entry_count',jsonb_array_length(entries)),
      'winner_ids',CASE WHEN ${kind}='reroll' THEN ${JSON.stringify(reroll?.winnerIds ?? [])}::jsonb
        WHEN ${kind}='end' THEN COALESCE((SELECT jsonb_agg(winner->>'user_id') FROM jsonb_array_elements(winners_list) winner
          WHERE COALESCE(winner->>'status','winner')='winner'),'[]'::jsonb) ELSE '[]'::jsonb END,
      'replaced_user_ids',${JSON.stringify(reroll?.replacedIds ?? [])}::jsonb,'reason',${kind === "reroll" ? "dashboard_reroll" : ""}::text,
      'actor_label',${reroll?.actorLabel ?? ""}::text) AS value FROM giveaways WHERE id=${giveawayId}
    ) SELECT CASE WHEN octet_length(value::text)<=262144 THEN value ELSE NULL END AS payload,
      octet_length(value::text) AS bytes FROM snapshot`)[0]
  if (!data || data.bytes > 262_144) return yield* new Conflict({ message: "Giveaway publication exceeds the supported Discord payload size" })
  const payload = yield* Schema.decodeUnknownEffect(GiveawayPublicationPayload)(data.payload).pipe(
    Effect.mapError(() => new Conflict({ message: "Giveaway publication data is invalid" })),
  )
  yield* sql`INSERT INTO giveaway_publication_effects(effect_id,giveaway_id,server_id,channel_id,kind,start_time,
    source_updated_at,source_message_id,payload_version,payload)
    SELECT ${effectId},id,server_id,channel_id,${kind},start_time,updated_at,message_id,1,${JSON.stringify(payload)}::jsonb
    FROM giveaways WHERE id=${giveawayId}`
  return effectId
})

export const prepareGiveawayPublication = (giveawayId: string, kind: "start" | "update" | "end") => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  if (kind === "end" && !(yield* resolveEndingGiveaway(giveawayId))) return { outcome: "pending" as const }
  return yield* sql.withTransaction(Effect.gen(function* () {
    const row = (yield* sql<{ status: string; due: boolean }>`SELECT status,
      CASE WHEN ${kind}='end' THEN end_time <= clock_timestamp() ELSE start_time <= clock_timestamp() END AS due
      FROM giveaways WHERE id=${giveawayId} FOR UPDATE`)[0]
    if (!row) return yield* new NotFound({ message: "Giveaway not found" })
    if (!row.due || (kind === "end" ? row.status !== "ended" : row.status !== "ongoing")) return yield* new Conflict({ message: "Giveaway is not ready for this publication" })
    // Once start succeeded, return the same receipt instead of treating its new
    // message_id as permission to create another message.
    if (kind === "start") {
      const prior = (yield* sql<{ effect_id: string }>`SELECT effect_id FROM giveaway_publication_effects p JOIN giveaways g
        ON g.id=p.giveaway_id AND g.server_id=p.server_id AND g.channel_id=p.channel_id AND g.start_time=p.start_time
        WHERE p.giveaway_id=${giveawayId} AND p.kind='start' LIMIT 1`)[0]
      if (prior) return { outcome: "ready" as const, effectId: prior.effect_id }
    }
    return { outcome: "ready" as const, effectId: yield* enqueueGiveawayPublication(giveawayId,kind) }
  }))
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(databaseFailure(cause))))

export const claimGiveawayPublication = (giveawayId: string, effectId: string): Effect.Effect<ClaimResponse, Conflict | DatabaseFailure | NotFound, SqlClient.SqlClient> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql`SELECT id FROM giveaways WHERE id=${giveawayId} FOR UPDATE`
    const row = (yield* sql<Publication>`SELECT effect_id,giveaway_id,kind,state,source_message_id,start_time::text,payload,
      claim_token::text,result_message_id,lease_expires_at <= clock_timestamp() AS expired,next_attempt_at <= clock_timestamp() AS ready
      FROM giveaway_publication_effects WHERE effect_id=${effectId} AND giveaway_id=${giveawayId} FOR UPDATE`)[0]
    if (!row) return yield* new NotFound({ message: "Publication not found" })
    if (row.state === "succeeded") return { outcome: "complete" as const }
    if (row.state === "ambiguous" || row.state === "failed") return { outcome: row.state } as const
    if (row.state === "sending" && !row.expired) return { outcome: "pending" as const }
    if (row.state === "pending" && !row.ready) return { outcome: "pending" as const }
    if (row.state === "sending" && row.kind !== "update") {
      yield* sql`UPDATE giveaway_publication_effects SET state='ambiguous',last_error='expired_create_claim',updated_at=clock_timestamp() WHERE effect_id=${effectId}`
      return { outcome: "ambiguous" as const }
    }
    const busy = yield* sql`SELECT effect_id FROM giveaway_publication_effects WHERE giveaway_id=${giveawayId}
      AND effect_id<>${effectId} AND state='sending' AND lease_expires_at>clock_timestamp() LIMIT 1`
    if (busy.length) return { outcome: "pending" as const }
    const valid = (yield* sql<{ valid: boolean }>`SELECT EXISTS(SELECT 1 FROM giveaways g JOIN giveaway_publication_effects p
      ON g.id=p.giveaway_id AND g.server_id=p.server_id AND g.channel_id=p.channel_id AND g.start_time=p.start_time
      AND g.message_id IS NOT DISTINCT FROM p.source_message_id AND g.updated_at=p.source_updated_at
      WHERE p.effect_id=${effectId} AND ((p.kind IN ('end','reroll') AND g.status='ended') OR (p.kind IN ('start','update') AND g.status='ongoing'))) AS valid`)[0]?.valid
    if (!valid) {
      yield* sql`UPDATE giveaway_publication_effects SET state='failed',last_error='source_identity_changed',updated_at=clock_timestamp() WHERE effect_id=${effectId}`
      return { outcome: "failed" as const }
    }
    const payload = yield* Schema.decodeUnknownEffect(GiveawayPublicationPayload)(row.payload).pipe(Effect.mapError(() => new Conflict({ message: "Stored publication payload is invalid" })))
    const claimToken = crypto.randomUUID()
    yield* sql`UPDATE giveaway_publication_effects SET state='sending',claim_token=${claimToken}::uuid,claimed_at=clock_timestamp(),
      lease_expires_at=clock_timestamp()+interval '90 seconds',attempt_count=attempt_count+1,updated_at=clock_timestamp() WHERE effect_id=${effectId}`
    return { outcome: "claimed" as const, claimToken, effect: { effectId,kind:row.kind,sourceMessageId:row.source_message_id,startTime:new Date(row.start_time).toISOString(),payload } }
  }))
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(databaseFailure(cause))))

export const completeGiveawayPublication = (giveawayId: string, effectId: string, body: Completion) => Effect.gen(function* () {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(body.claimToken)) return yield* new InvalidRequest({ message: "Invalid publication claim token" })
  if (body.outcome === "succeeded" && !body.messageId) return yield* new InvalidRequest({ message: "Successful publication requires its Discord message ID" })
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql`SELECT id FROM giveaways WHERE id=${giveawayId} FOR UPDATE`
    const row = (yield* sql<Publication>`SELECT effect_id,giveaway_id,kind,state,source_message_id,start_time::text,payload,
      claim_token::text,result_message_id,lease_expires_at<=clock_timestamp() AS expired,next_attempt_at<=clock_timestamp() AS ready
      FROM giveaway_publication_effects WHERE effect_id=${effectId} AND giveaway_id=${giveawayId} FOR UPDATE`)[0]
    if (!row) return yield* new NotFound({ message: "Publication not found" })
    if (row.claim_token !== body.claimToken) return yield* new Conflict({ message: "Publication claim is no longer owned by this executor" })
    if (body.outcome === "retry") {
      if (body.messageId !== undefined || body.failureReason === undefined ||
        (body.failureReason === "source_update_uncertain" && row.kind !== "update" && row.kind !== "end") ||
        !["source_update_uncertain", "rate_limited"].includes(body.failureReason)) {
        return yield* new InvalidRequest({ message: "Retry outcome is invalid for this publication effect" })
      }
      if (row.state !== "sending") return yield* new Conflict({ message: "Only a currently claimed publication can be retried" })
      const delay = body.retryAfterSeconds ?? 5
      yield* sql`UPDATE giveaway_publication_effects SET state='pending',next_attempt_at=clock_timestamp()+(${delay}*interval '1 second'),
        last_error=${body.failureReason},updated_at=clock_timestamp() WHERE effect_id=${effectId} AND claim_token=${body.claimToken}::uuid`
      return { outcome: "pending" as const }
    }
    if (row.result_message_id !== null && row.result_message_id !== body.messageId) return yield* new Conflict({ message: "Publication resource identity cannot change" })
    if (row.state === "succeeded" || row.state === "failed") {
      if (row.state !== body.outcome) return yield* new Conflict({ message: "Publication outcome is already committed" })
      return { outcome: row.state } as const
    }
    if (row.state !== "sending" && row.state !== "ambiguous") return yield* new Conflict({ message: "Publication was not claimed" })
    if (row.kind === "update" && body.messageId !== undefined && body.messageId !== row.source_message_id) return yield* new Conflict({ message: "Update cannot replace the original message identity" })
    const valid = (yield* sql<{ valid: boolean }>`SELECT EXISTS(SELECT 1 FROM giveaways g JOIN giveaway_publication_effects p
      ON g.id=p.giveaway_id AND g.server_id=p.server_id AND g.channel_id=p.channel_id AND g.start_time=p.start_time
      AND g.message_id IS NOT DISTINCT FROM p.source_message_id WHERE p.effect_id=${effectId}) AS valid`)[0]?.valid
    // Preserve returned resource evidence even if the source was deleted or
    // edited. Expired create claims never authorize another POST.
    const outcome = body.outcome === "succeeded" && (!valid || row.expired || row.state === "ambiguous") ? "ambiguous" as const : body.outcome
    yield* sql`UPDATE giveaway_publication_effects SET state=${outcome},result_message_id=COALESCE(result_message_id,${body.messageId ?? null}),
      last_error=${outcome === "ambiguous" ? "discord_result_requires_reconciliation" : body.failureReason ?? null},updated_at=clock_timestamp()
      WHERE effect_id=${effectId} AND claim_token=${body.claimToken}::uuid`
    if (outcome === "succeeded" && row.kind === "start") yield* sql`UPDATE giveaways SET message_id=${body.messageId!},
      updated_at=clock_timestamp() WHERE id=${giveawayId}`
    // Never clear updated here: entries accepted during delivery must trigger
    // another count refresh through the existing scheduler's locked transition.
    return { outcome }
  }))
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(databaseFailure(cause))))

export const pendingGiveawayPublications = (limit = 10) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const items = yield* sql<{ giveawayId: string; effectId: string }>`SELECT giveaway_id AS "giveawayId",effect_id AS "effectId"
    FROM (SELECT DISTINCT ON (giveaway_id) giveaway_id,effect_id,updated_at FROM giveaway_publication_effects
      WHERE (state='pending' AND next_attempt_at<=clock_timestamp()) OR (state='sending' AND lease_expires_at<=clock_timestamp())
      ORDER BY giveaway_id,updated_at,effect_id) oldest_per_giveaway ORDER BY updated_at,effect_id LIMIT ${limit}`
  return { items }
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(databaseFailure(cause))))
