import { RosterOperationAdvanceEndpoint, RuntimeUUID, type EndpointResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Conflict, DatabaseFailure, Forbidden, NotFound, type ApiFailure } from "./errors.js"
import { advanceRosterForm, renderRosterForm, RosterFormCursorSchema } from "./roster-interaction-forms.js"
import { requireFreshInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"
import { lockRosterMembership } from "./roster-interaction-membership.js"
import { assertRosterDraftCurrent } from "./roster-interaction-configuration.js"

type Response = EndpointResponse<typeof RosterOperationAdvanceEndpoint>
interface OperationRow {
  readonly id: string
  readonly roster_id: string
  readonly server_id: string
  readonly actor_user_id: string
  readonly channel_id: string
  readonly action: string
  readonly state: string
  readonly stage: string
  readonly version: number
  readonly question_index: number
  readonly draft: unknown
  readonly expires_at: Date | string
  readonly expired: boolean
  readonly publication_state: string
}
const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "Unable to persist roster interaction" })
const isUUID = Schema.is(RuntimeUUID)
const response = (value: unknown) => Schema.decodeUnknownEffect(RosterOperationAdvanceEndpoint.response)(value).pipe(
  Effect.mapError(databaseFailure),
)

/** Must run only after independent signature verification, including for expired exact replays. */
export const readRosterReceipt = (sql: SqlClient.SqlClient, operationId: string | undefined, interaction: VerifiedRuntimeInteraction) => Effect.gen(function* () {
  const row = (yield* sql<{ operation_id: string; actor_user_id: string; server_id: string; request_hash: string; response: unknown }>`
    SELECT operation_id::text, actor_user_id, server_id, request_hash, response
    FROM roster_runtime_receipts WHERE interaction_id = ${interaction.id}
  `)[0]
  if (row === undefined) return undefined
  if ((operationId !== undefined && row.operation_id !== operationId) || row.actor_user_id !== interaction.actorId
    || row.server_id !== interaction.guildId || row.request_hash !== interaction.requestHash) {
    return yield* new Conflict({ message: "Discord interaction ID was already used for different roster input" })
  }
  return yield* response(row.response)
})

const checkScope = (row: Pick<OperationRow, "actor_user_id" | "server_id" | "channel_id">, interaction: VerifiedRuntimeInteraction) =>
  row.actor_user_id === interaction.actorId && row.server_id === interaction.guildId && row.channel_id === interaction.channelId
    ? Effect.void : Effect.fail(new Forbidden({ message: "Roster operation does not belong to this actor or channel", reason: "wrong_message" }))

/** Advances preparation only. Confirmation is handled by the atomic membership/effect transaction. */
export const advanceRosterDraft = (operationId: string, interaction: VerifiedRuntimeInteraction):
  Effect.Effect<Response, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  if (!isUUID(operationId)) return yield* new NotFound({ message: "Roster operation not found" })
  const sql = yield* SqlClient.SqlClient
  const previous = yield* readRosterReceipt(sql, operationId, interaction)
  if (previous !== undefined) return previous
  yield* requireFreshInteraction(interaction)
  const scope = (yield* sql<Pick<OperationRow, "roster_id" | "server_id" | "actor_user_id" | "channel_id">>`
    SELECT roster_id::text, server_id, actor_user_id, channel_id FROM roster_runtime_operations WHERE id = ${operationId}::uuid
  `)[0]
  if (scope === undefined) return yield* new NotFound({ message: "Roster operation not found" })
  yield* checkScope(scope, interaction)
  return yield* sql.withTransaction(Effect.gen(function* () {
    // Match identity deletion and bot subject writes; no fake auth account is created.
    yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${interaction.actorId} FOR SHARE`
    yield* sql`INSERT INTO subject_mutation_locks (subject_id) VALUES (${interaction.actorId}) ON CONFLICT (subject_id) DO NOTHING`
    yield* sql`SELECT subject_id FROM subject_mutation_locks WHERE subject_id = ${interaction.actorId} FOR UPDATE`
    yield* lockRosterMembership(sql, scope.server_id, [scope.roster_id])
    const replay = yield* readRosterReceipt(sql, operationId, interaction)
    if (replay !== undefined) return replay
    yield* requireFreshInteraction(interaction)
    const row = (yield* sql<OperationRow>`SELECT operation.id::text, operation.roster_id::text, operation.server_id,
      operation.actor_user_id, operation.channel_id, operation.action, operation.state, operation.stage,
      operation.version, operation.question_index, operation.draft, operation.expires_at,
      operation.expires_at <= clock_timestamp() AS expired, publication.state AS publication_state
      FROM roster_runtime_operations operation JOIN roster_publications publication ON publication.id = operation.source_publication_id
      WHERE operation.id = ${operationId}::uuid FOR UPDATE OF operation FOR SHARE OF publication
    `)[0]
    if (row === undefined) return yield* new NotFound({ message: "Roster preparation not found" })
    yield* checkScope(row, interaction)
    if (row.expired || row.state !== "preparing" || row.publication_state !== "active") {
      return yield* new Conflict({ message: "Roster form expired, completed, or its board was archived" })
    }
    if (row.action !== "signup" && row.action !== "remove" && row.action !== "sub") {
      return yield* new Conflict({ message: "This roster operation does not accept signup forms" })
    }
    const cursor = yield* Schema.decodeUnknownEffect(RosterFormCursorSchema)({ stage: row.stage, version: row.version,
      questionIndex: row.question_index, draft: row.draft }).pipe(Effect.mapError(databaseFailure))
    yield* assertRosterDraftCurrent(sql, row, cursor)
    const next = yield* advanceRosterForm(operationId, row.action, cursor, interaction)
    if (next.stage === "done") return yield* new Conflict({ message: "Roster confirmation requires atomic membership application" })
    const form = yield* renderRosterForm(operationId, row.action, next)
    const result = yield* response({ outcome: "ready", operationId, rosterId: row.roster_id, action: row.action,
      expiresAt: new Date(row.expires_at).toISOString(), form })
    const changed = yield* sql<{ id: string }>`UPDATE roster_runtime_operations SET stage = ${next.stage}, version = ${next.version},
      question_index = ${next.questionIndex}, draft = ${JSON.stringify(next.draft)}::jsonb, updated_at = clock_timestamp()
      WHERE id = ${operationId}::uuid AND version = ${row.version} AND state = 'preparing' RETURNING id::text`
    if (changed.length !== 1) return yield* new Conflict({ message: "Roster form changed during preparation" })
    yield* sql`INSERT INTO roster_runtime_receipts (interaction_id, request_hash, operation_id, actor_user_id, server_id, operation_version, response)
      VALUES (${interaction.id}, ${interaction.requestHash}, ${operationId}::uuid, ${interaction.actorId}, ${interaction.guildId}, ${next.version}, ${JSON.stringify(result)}::jsonb)`
    return result
  }))
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(databaseFailure(cause))))
