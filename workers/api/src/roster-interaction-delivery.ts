import { DecimalSnowflake } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DiscordApi } from "./discord-api.js"
import { DatabaseFailure, InvalidRequest, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { claimRosterEffect, isRosterEffectClaimCurrent, queueRosterRoleRepair, settleRosterEffect,
  type RosterEffectClaim, type RosterEffectSettlement } from "./roster-interaction-effect-store.js"

const RoleIntent = Schema.Struct({ actorUserId: DecimalSnowflake, roleId: DecimalSnowflake })
const MemberRoles = Schema.Struct({ user: Schema.Struct({ id: DecimalSnowflake }), roles: Schema.Array(DecimalSnowflake) })
const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "Unable to reconcile roster role" })

/** Reconcile against all current roster memberships in the guild. A role
 * shared by another roster/group is retained, and cached Discord IDs never
 * override current canonical account ownership. */
const desiredRosterRole = (sql: SqlClient.SqlClient, serverId: string, actorId: string, roleId: string) => Effect.gen(function* () {
  const row = (yield* sql<{ present: boolean }>`SELECT EXISTS (SELECT 1 FROM roster_members member
    JOIN rosters roster ON roster.id = member.roster_id JOIN player_links link ON link.tag = member.tag
    LEFT JOIN roster_member_group_settings settings ON settings.roster_id = member.roster_id AND settings.member_group_id = member.member_group_id
    WHERE roster.server_id = ${serverId} AND link.user_id = ${actorId}
      AND (roster.roster_role_id = ${roleId} OR settings.role_id = ${roleId})) AS present`)[0]
  return row?.present === true
})

/** Called after claiming, never inside a SQL transaction. The write is
 * idempotent; a fresh read and current desired-state comparison verify it. */
export const executeRosterRoleClaim = (claim: RosterEffectClaim, immediateRepair = true):
  Effect.Effect<boolean, ApiFailure, SqlClient.SqlClient | DiscordApi> => Effect.gen(function* () {
  if (claim.kind !== "role" || !(yield* isRosterEffectClaimCurrent(claim))) return false
  const sql = yield* SqlClient.SqlClient, discord = yield* DiscordApi
  let attemptedWrite = false
  const settle = (outcome: RosterEffectSettlement) => Effect.gen(function* () {
    const settled = yield* settleRosterEffect(claim, outcome)
    if (!settled && attemptedWrite) {
      const repairId = yield* queueRosterRoleRepair(claim)
      if (repairId !== undefined && immediateRepair) {
        const repair = yield* claimRosterEffect(repairId)
        if (repair !== undefined) yield* executeRosterRoleClaim(repair, false)
      }
    }
    return settled
  })
  return yield* Effect.gen(function* () {
    const intent = yield* Schema.decodeUnknownEffect(RoleIntent)(claim.payload).pipe(
      Effect.mapError(() => new InvalidRequest({ message: "Invalid roster role intent" })),
    )
    if (claim.scopeKey !== `role:${claim.serverId}:${intent.actorUserId}:${intent.roleId}`) {
      return yield* new InvalidRequest({ message: "Roster role scope does not match its intent" })
    }
    const desired = yield* desiredRosterRole(sql, claim.serverId, intent.actorUserId, intent.roleId)
    if (!(yield* isRosterEffectClaimCurrent(claim))) return false
    const memberPath = `/guilds/${claim.serverId}/members/${intent.actorUserId}`
    attemptedWrite = true
    yield* discord.request(`${memberPath}/roles/${intent.roleId}`, { method: desired ? "PUT" : "DELETE" }).pipe(
      Effect.catchTag("NotFound", error => desired ? Effect.fail(error) : Effect.succeed(undefined)),
    )
    const raw = yield* discord.request(memberPath).pipe(Effect.catchTag("NotFound", error => desired ? Effect.fail(error)
      : Effect.succeed({ user: { id: intent.actorUserId }, roles: [] })))
    const member = yield* Schema.decodeUnknownEffect(MemberRoles)(raw).pipe(
      Effect.mapError(cause => new UpstreamUnavailable({ cause, message: "Discord role verification failed validation" })),
    )
    if (member.user.id !== intent.actorUserId) return yield* new UpstreamUnavailable({ cause: undefined, message: "Discord role verification returned the wrong member" })
    const currentDesired = yield* desiredRosterRole(sql, claim.serverId, intent.actorUserId, intent.roleId)
    if (currentDesired !== desired || member.roles.includes(intent.roleId) !== currentDesired) {
      return yield* settle({ outcome: "retry", code: "role_state_changed", retryAfterMs: 1_000 })
    }
    return yield* settle({ outcome: "succeeded", result: { actorUserId: intent.actorUserId, roleId: intent.roleId, present: currentDesired } })
  }).pipe(
    Effect.catchTags({
      InvalidRequest: () => settle({ outcome: "failed", code: "invalid_role_intent" }),
      Forbidden: () => settle({ outcome: "failed", code: "discord_role_forbidden" }),
      NotFound: () => settle({ outcome: "failed", code: "discord_role_target_missing" }),
      RateLimited: error => settle({ outcome: "retry", code: "discord_rate_limit", retryAfterMs: error.retryAfterSeconds * 1_000 }),
      UpstreamUnavailable: () => settle({ outcome: "retry", code: "discord_role_unavailable", retryAfterMs: 5_000 }),
    }),
  )
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(databaseFailure(cause))))
