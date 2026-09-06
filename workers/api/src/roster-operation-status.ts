import { RosterOperationStatusEndpoint, RuntimeUUID, type RuntimeInteractionProof } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, Forbidden, NotFound } from "./errors.js"
import { verifyRosterInteraction } from "./roster-interaction-identity.js"
import { requireFreshInteraction } from "./runtime-interaction.js"

interface StatusRow {
  readonly id: string; readonly roster_id: string; readonly server_id: string; readonly actor_user_id: string
  readonly channel_id: string; readonly action: string; readonly state: string; readonly message_id: string | null
}
const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "Roster operation status is unavailable" })

/** Read-only status resolution. The caller may wake the returned authorized
 * target after SQL completes, and sends only `response` over HTTP. */
export const resolveRosterOperationStatus = (operationId: string, proof: typeof RuntimeInteractionProof.Type,
  configuration: { readonly DISCORD_PUBLIC_KEY: string; readonly DISCORD_APPLICATION_ID: string },
  expectedControl: "status" | "publication-status" = "status") => Effect.gen(function* () {
  const { interaction, control } = yield* verifyRosterInteraction(proof, configuration)
  if (!Schema.is(RuntimeUUID)(operationId) || control.kind !== expectedControl
    || control.operationId !== operationId.toLowerCase()) {
    return yield* new Forbidden({ message: "A matching roster status control is required", reason: "wrong_message" })
  }
  // A status request reads current state rather than replaying an accepted
  // mutation receipt. Every poll therefore needs a fresh signed interaction.
  yield* requireFreshInteraction(interaction)
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql<StatusRow>`SELECT operation.id::text,operation.roster_id::text,operation.server_id,
    operation.actor_user_id,operation.channel_id,operation.action,operation.state,publication.message_id
    FROM roster_runtime_operations operation
    LEFT JOIN roster_publications publication ON publication.roster_id=operation.roster_id
      AND publication.server_id=operation.server_id AND publication.channel_id=operation.channel_id
      AND ((operation.action='publish' AND publication.creator_operation_id=operation.id)
        OR (operation.action<>'publish' AND publication.id=operation.source_publication_id))
    WHERE operation.id=${operationId.toLowerCase()}::uuid`)[0]
  if (row === undefined) return yield* new NotFound({ message: "Roster operation not found" })
  if (row.actor_user_id !== interaction.actorId || row.server_id !== interaction.guildId || row.channel_id !== interaction.channelId
    || (row.action === "publish") !== (expectedControl === "publication-status")) {
    return yield* new Forbidden({ message: "Roster operation does not belong to this actor, channel or control", reason: "wrong_message" })
  }
  const response = yield* Schema.decodeUnknownEffect(RosterOperationStatusEndpoint.response)({
    operationId: row.id, rosterId: row.roster_id, action: row.action, state: row.state, channelId: row.channel_id,
    ...(row.message_id === null ? {} : { messageId: row.message_id }),
    // Stored effect failures can contain provider details. Status intentionally
    // exposes a fixed safe message, never draft answers, snapshots or errors.
    ...(row.state === "failed" ? { failure: "Roster synchronization failed" } : {}),
  }).pipe(Effect.mapError(databaseFailure))
  return { response, serverId: row.server_id, rosterId: row.roster_id,
    shouldWake: row.state === "submitted" || row.state === "provisioning" || row.state === "reconciling" }
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(databaseFailure(cause))))

export interface RosterRecoveryCursor {
  readonly updatedAt: string
  readonly operationId: string
  readonly through: string
}

/** Bounded keyset pages, not repeatedly the oldest hundred jobs. A scan retains
 * its PostgreSQL timestamp watermark so active retries cannot extend it forever.
 * The scheduler must carry nextCursor across its bounded work batches and start
 * a fresh scan after exhaustion; no mutation/attempt timestamp is required here. */
export const pendingRosterOperations = (cursor?: RosterRecoveryCursor) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const through = cursor?.through ?? (yield* sql<{ value: string }>`SELECT clock_timestamp()::text AS value`)[0]!.value
  const rows = yield* sql<{ id: string; server_id: string; roster_id: string; updated_at: string }>`
    SELECT operation.id::text,operation.server_id,operation.roster_id::text,operation.updated_at::text FROM roster_runtime_operations operation
    WHERE operation.state IN ('submitted','provisioning','reconciling') AND operation.updated_at<=${through}::timestamptz
      AND ${cursor === undefined ? sql`TRUE` : sql`(operation.updated_at,operation.id)>(${cursor.updatedAt}::timestamptz,${cursor.operationId}::uuid)`}
    ORDER BY operation.updated_at,operation.id LIMIT 101`
  const page = rows.slice(0,100), last = page.at(-1)
  return {
    jobs: page.map(row => ({ id: row.id, server_id: row.server_id, roster_id: row.roster_id })),
    nextCursor: rows.length > 100 && last !== undefined
      ? { updatedAt: last.updated_at, operationId: last.id, through } : undefined,
  }
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(databaseFailure(cause))))
