import { RosterActionEndpoint, type RuntimeInteractionProof, type EndpointResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Conflict, DatabaseFailure, Forbidden, type ApiFailure } from "./errors.js"
import { createRosterForm, renderRosterForm } from "./roster-interaction-forms.js"
import { verifyRosterInteraction } from "./roster-interaction-identity.js"
import { lockRosterMembership } from "./roster-interaction-membership.js"
import { readRosterReceipt } from "./roster-interaction-store.js"
import { requireFreshInteraction } from "./runtime-interaction.js"
import { readRosterPreparationConfiguration } from "./roster-interaction-configuration.js"

const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "Unable to prepare roster interaction" })

/** No Discord token or raw signed payload is persisted. Confirmation rechecks ownership and admission. */
export const prepareRosterAction = (
  proof: typeof RuntimeInteractionProof.Type,
  configuration: { readonly DISCORD_PUBLIC_KEY: string; readonly DISCORD_APPLICATION_ID: string },
): Effect.Effect<EndpointResponse<typeof RosterActionEndpoint>, ApiFailure, SqlClient.SqlClient> => Effect.gen(function* () {
  const { interaction, control } = yield* verifyRosterInteraction(proof, configuration)
  if (control.kind !== "action" || control.rosterId === undefined
    || (control.action !== "signup" && control.action !== "remove" && control.action !== "sub")
    || interaction.messageId === undefined) {
    return yield* new Forbidden({ message: "A roster participation button is required", reason: "wrong_message" })
  }
  const { rosterId, action } = control
  const messageId = interaction.messageId
  const sql = yield* SqlClient.SqlClient
  const previous = yield* readRosterReceipt(sql, undefined, interaction)
  if (previous !== undefined) return previous
  yield* requireFreshInteraction(interaction)
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${interaction.actorId} FOR SHARE`
    yield* sql`INSERT INTO subject_mutation_locks (subject_id) VALUES (${interaction.actorId}) ON CONFLICT (subject_id) DO NOTHING`
    yield* sql`SELECT subject_id FROM subject_mutation_locks WHERE subject_id = ${interaction.actorId} FOR UPDATE`
    yield* lockRosterMembership(sql, interaction.guildId, [rosterId])
    const replay = yield* readRosterReceipt(sql, undefined, interaction)
    if (replay !== undefined) return replay
    yield* requireFreshInteraction(interaction)
    const publication = (yield* sql<{ id: string }>`SELECT id::text FROM roster_publications
      WHERE roster_id = ${control.rosterId}::uuid AND server_id = ${interaction.guildId}
        AND channel_id = ${interaction.channelId} AND message_id = ${messageId}
        AND state = 'active' AND mode = 'signup' FOR SHARE`)[0]
    if (publication === undefined) return yield* new Forbidden({ message: "This message is not an active roster signup board", reason: "wrong_message" })
    // Holding the actor mutex stabilizes canonical links without taking tag locks
    // after a subject lock. No membership is changed during preparation.
    const accounts = yield* sql<{ tag: string; label: string }>`SELECT link.tag, left(COALESCE(NULLIF(player.name, ''), link.tag), 100) AS label
      FROM player_links link LEFT JOIN basic_player player ON player.tag = link.tag
      JOIN rosters roster ON roster.id = ${rosterId}::uuid
      LEFT JOIN player_profile_details profile ON profile.player_tag = link.tag
      WHERE link.user_id = ${interaction.actorId} AND (
        (${control.action} = 'remove' AND EXISTS (SELECT 1 FROM roster_members member WHERE member.roster_id = ${control.rosterId}::uuid AND member.tag = link.tag))
        OR (${control.action} <> 'remove' AND NOT EXISTS (SELECT 1 FROM roster_members member WHERE member.roster_id = ${control.rosterId}::uuid AND member.tag = link.tag)))
      AND (${action} = 'remove' OR profile.player_tag IS NULL OR profile.townhall_level <= 0
        OR profile.observed_at < clock_timestamp() - interval '15 minutes' OR profile.observed_at > clock_timestamp()
        OR ((roster.min_townhall IS NULL OR profile.townhall_level >= roster.min_townhall)
          AND (roster.max_townhall IS NULL OR profile.townhall_level <= roster.max_townhall)))
      ORDER BY link.tag LIMIT 626`
    if (accounts.length === 0) return yield* new Conflict({ message: control.action === "remove"
      ? "None of your linked accounts are on this roster" : "No linked accounts are available to add to this roster" })
    // One page selector offers 25 pages of 25 accounts without silently dropping choices.
    if (accounts.length > 625) return yield* new Conflict({ message: "This roster action exceeds 625 account choices; use the dashboard to select accounts" })
    const current = action === "remove" ? { groups: [], questions: [], fingerprint: null }
      : yield* readRosterPreparationConfiguration(sql, interaction.guildId, rosterId)
    const cursor = yield* createRosterForm({ accounts, groups: action === "signup" ? current.groups : [], questions: current.questions })
    const draft = { ...cursor.draft, configurationFingerprint: current.fingerprint }
    const operationId = crypto.randomUUID()
    const operation = (yield* sql<{ expires_at: Date | string }>`INSERT INTO roster_runtime_operations
      (id, roster_id, server_id, actor_user_id, action, source_publication_id, channel_id, initial_interaction_id, draft)
      VALUES (${operationId}::uuid, ${control.rosterId}::uuid, ${interaction.guildId}, ${interaction.actorId}, ${control.action},
        ${publication.id}::uuid, ${interaction.channelId}, ${interaction.id}, ${JSON.stringify(draft)}::jsonb) RETURNING expires_at`)[0]!
    const form = yield* renderRosterForm(operationId, action, cursor)
    const result = yield* Schema.decodeUnknownEffect(RosterActionEndpoint.response)({ outcome: "ready", operationId,
      rosterId: control.rosterId, action: control.action, expiresAt: new Date(operation.expires_at).toISOString(), form }).pipe(Effect.mapError(databaseFailure))
    yield* sql`INSERT INTO roster_runtime_receipts (interaction_id, request_hash, operation_id, actor_user_id, server_id, operation_version, response)
      VALUES (${interaction.id}, ${interaction.requestHash}, ${operationId}::uuid, ${interaction.actorId}, ${interaction.guildId}, 1, ${JSON.stringify(result)}::jsonb)`
    return result
  }))
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(databaseFailure(cause))))
