import { Effect, Schema } from "effect"
import { DecimalSnowflake } from "@clashking/api-contracts"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { DatabaseFailure, Forbidden, InvalidRequest, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { prepareRosterBoardSnapshot } from "./roster-interaction-board-store.js"
import { RosterBoardIntent, RosterBoardObservation } from "./roster-interaction-board-message.js"
import { enqueueRosterEffects } from "./roster-interaction-effects.js"
import { claimRosterEffect, isRosterEffectClaimCurrent, settleRosterEffect, type RosterEffectClaim, type RosterEffectSettlement } from "./roster-interaction-effect-store.js"
import { queueRosterBoardRepair } from "./roster-interaction-board-recovery.js"
import type { RosterBoardMode } from "./roster-interaction-board.js"
const ChannelIdentity = Schema.Struct({ id: DecimalSnowflake, guild_id: DecimalSnowflake })

/** Preparation and actual message delivery are separate persisted effects.
 * Every outbound attempt reuses the immutable snapshot payload, so retries do
 * not redraw a different roster revision without a requested board refresh. */
export const executeRosterBoardClaim = (claim: RosterEffectClaim, immediateRepair = true):
  Effect.Effect<boolean, ApiFailure, SqlClient.SqlClient | DiscordApi> => Effect.gen(function* () {
  if (claim.kind !== 'board' || !(yield* isRosterEffectClaimCurrent(claim))) return false
  const sql = yield* SqlClient.SqlClient
  let attemptedWrite = false
  const settle = (outcome: RosterEffectSettlement) => Effect.gen(function* () {
    const accepted = yield* settleRosterEffect(claim, outcome)
    if (!accepted && attemptedWrite) {
      const repairId = yield* queueRosterBoardRepair(claim)
      const repair = repairId !== undefined && immediateRepair ? yield* claimRosterEffect(repairId) : undefined
      if (repair !== undefined) yield* executeRosterBoardClaim(repair, false)
    }
    return accepted
  })
  return yield* Effect.gen(function* () {
    const intent = yield* Schema.decodeUnknownEffect(RosterBoardIntent)(claim.payload).pipe(Effect.mapError(() =>
      new InvalidRequest({ message: 'Invalid roster board intent' })))
    if (claim.scopeKey !== `board:${intent.publicationId}`) return yield* new InvalidRequest({ message: 'Board scope does not match publication' })
    const publication = (yield* sql<{ roster_id: string; channel_id: string; message_id: string; mode: RosterBoardMode; state: string }>`
      SELECT publication.roster_id::text, publication.channel_id, publication.message_id, publication.mode, publication.state
      FROM roster_publications publication JOIN roster_runtime_operations operation ON operation.id = ${claim.operationId}::uuid
      WHERE publication.id = ${intent.publicationId}::uuid AND publication.server_id = ${claim.serverId}
        AND operation.server_id = publication.server_id AND operation.roster_id = publication.roster_id`)[0]
    if (publication === undefined) return yield* new InvalidRequest({ message: 'Board publication does not match operation' })
    if (publication.state !== 'active') return yield* settleRosterEffect(claim, { outcome: 'succeeded', result: { archived: true } })
    if (intent.snapshot === undefined) {
      const snapshot = yield* prepareRosterBoardSnapshot(claim.serverId, publication.roster_id, publication.mode, Date.now())
      return yield* sql.withTransaction(Effect.gen(function* () {
        yield* sql`SELECT scope_key FROM roster_runtime_effect_scopes WHERE scope_key = ${claim.scopeKey}
          AND server_id = ${claim.serverId} FOR UPDATE`
        if (!(yield* isRosterEffectClaimCurrent(claim))) return false
        yield* enqueueRosterEffects(sql, claim.serverId, claim.operationId, [{ kind: 'board', scopeKey: claim.scopeKey,
          payload: { publicationId: intent.publicationId, snapshot: { revision: snapshot.revision, message: snapshot.message } },
        }])
        const prepared = (yield* sql<{ id: string }>`SELECT id::text FROM roster_runtime_effects WHERE operation_id = ${claim.operationId}::uuid
          AND scope_key = ${claim.scopeKey} AND state = 'pending' ORDER BY ordinal DESC LIMIT 1`)[0]!
        return yield* settleRosterEffect(claim, { outcome: 'succeeded', result: { preparedEffectId: prepared.id } })
      }))
    }
    const discord = yield* DiscordApi
    const channel = yield* Schema.decodeUnknownEffect(ChannelIdentity)(yield* discord.request(`/channels/${publication.channel_id}`))
      .pipe(Effect.mapError(cause => new UpstreamUnavailable({ cause, message: 'Discord board channel lookup failed validation' })))
    if (channel.id !== publication.channel_id || channel.guild_id !== claim.serverId) {
      return yield* new Forbidden({ message: 'Roster board channel does not belong to this server' })
    }
    if (!(yield* isRosterEffectClaimCurrent(claim))) return false
    const path = `/channels/${publication.channel_id}/messages/${publication.message_id}`
    attemptedWrite = true
    yield* discord.request(path, { method: 'PATCH', body: intent.snapshot.message })
    const observed = yield* Schema.decodeUnknownEffect(RosterBoardObservation)(yield* discord.request(path)).pipe(Effect.mapError(cause =>
      new UpstreamUnavailable({ cause, message: 'Discord board verification failed validation' })))
    const expected = yield* Schema.decodeUnknownEffect(RosterBoardObservation)({ id: publication.message_id,
      channel_id: publication.channel_id, ...intent.snapshot.message }).pipe(Effect.mapError(cause =>
      new UpstreamUnavailable({ cause, message: 'Persisted board snapshot failed verification' })))
    if (JSON.stringify(observed) !== JSON.stringify(expected)) return yield* settle({
      outcome: 'retry', code: 'board_observation_mismatch', retryAfterMs: 1000,
    })
    return yield* settle({ outcome: 'succeeded', result: { publicationId: intent.publicationId,
      messageId: publication.message_id, revision: intent.snapshot.revision } })
  }).pipe(Effect.catchTags({
    InvalidRequest: () => settle({ outcome: 'failed', code: 'invalid_board_intent' }),
    Forbidden: () => settle({ outcome: 'failed', code: 'discord_board_forbidden' }),
    NotFound: () => settle({ outcome: 'failed', code: 'discord_board_missing' }),
    RateLimited: error => settle({ outcome: 'retry', code: 'discord_rate_limit', retryAfterMs: error.retryAfterSeconds * 1000 }),
    UpstreamUnavailable: () => settle({ outcome: 'retry', code: 'discord_board_unavailable', retryAfterMs: 5000 }),
  }))
}).pipe(Effect.catchTag('SqlError', cause => Effect.fail(new DatabaseFailure({ cause, message: 'Unable to deliver roster board' }))))
