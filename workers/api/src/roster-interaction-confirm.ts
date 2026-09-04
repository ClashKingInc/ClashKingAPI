import { RosterOperationAdvanceEndpoint, type RuntimeInteractionProof, type EndpointResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Conflict, DatabaseFailure, Forbidden, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { advanceRosterForm, RosterFormCursorSchema } from "./roster-interaction-forms.js"
import { assertRosterDraftCurrent } from "./roster-interaction-configuration.js"
import { verifyRosterInteraction } from "./roster-interaction-identity.js"
import { assertRosterMembershipLimits, lockRosterAdmissionOwners, lockRosterMembership } from "./roster-interaction-membership.js"
import { enqueueRosterEffects } from "./roster-interaction-effects.js"
import { readRosterReceipt } from "./roster-interaction-store.js"
import { requireFreshInteraction, type VerifiedRuntimeInteraction } from "./runtime-interaction.js"
import { assertSignupEligibility, loadDiscordIdentity } from "./dashboard-roster-runtime.js"
import { loadRosterClashPlayer, rosterPlayerSnapshot } from "./dashboard-roster-refresh.js"
import type { DiscordApi } from "./discord-api.js"
import type { WorkerBindings } from "./environment.js"

interface ConfirmationRow {
  readonly roster_id: string; readonly server_id: string; readonly actor_user_id: string; readonly channel_id: string
  readonly action: string; readonly state: string; readonly version: number; readonly stage: string
  readonly question_index: number; readonly draft: unknown; readonly expired: boolean
  readonly source_publication_id: string; readonly publication_state: string
}
const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "Unable to confirm roster interaction" })
const checkScope = (row: ConfirmationRow, interaction: VerifiedRuntimeInteraction) =>
  row.actor_user_id === interaction.actorId && row.server_id === interaction.guildId && row.channel_id === interaction.channelId
    ? Effect.void : Effect.fail(new Forbidden({ message: "Roster operation does not belong to this actor or channel", reason: "wrong_message" }))
const loadConfirmation = (sql: SqlClient.SqlClient, operationId: string, lock: boolean) => sql<ConfirmationRow>`
  SELECT operation.roster_id::text, operation.server_id, operation.actor_user_id, operation.channel_id,
    operation.action, operation.state, operation.version, operation.stage, operation.question_index, operation.draft,
    operation.expires_at <= clock_timestamp() AS expired, operation.source_publication_id::text,
    publication.state AS publication_state
  FROM roster_runtime_operations operation JOIN roster_publications publication ON publication.id = operation.source_publication_id
  WHERE operation.id = ${operationId}::uuid ${lock ? sql`FOR UPDATE OF operation FOR SHARE OF publication` : sql``}`
const cursorFrom = (row: ConfirmationRow) => Schema.decodeUnknownEffect(RosterFormCursorSchema)({
  stage: row.stage, version: row.version, questionIndex: row.question_index, draft: row.draft,
}).pipe(Effect.mapError(databaseFailure))
const requirePreparing = (row: ConfirmationRow) => row.expired || row.state !== "preparing" || row.publication_state !== "active"
  ? Effect.fail(new Conflict({ message: "Roster form expired, completed, or its board was archived" })) : Effect.void

/** Confirmation owns its transaction: tag locks MUST precede every subject
 * lock. Never invoke this from advanceRosterDraft's subject-held transaction. */
export const confirmRosterOperation = (operationId: string, proof: typeof RuntimeInteractionProof.Type,
  configuration: { readonly DISCORD_PUBLIC_KEY: string; readonly DISCORD_APPLICATION_ID: string },
  bindings?: Pick<WorkerBindings, "CLASH_PROXY">):
  Effect.Effect<EndpointResponse<typeof RosterOperationAdvanceEndpoint>, ApiFailure, SqlClient.SqlClient | DiscordApi> => Effect.gen(function* () {
  const { interaction, control } = yield* verifyRosterInteraction(proof, configuration)
  if (control.kind !== "advance" || control.step !== "submit" || control.operationId !== operationId) {
    return yield* new Forbidden({ message: "A matching roster confirmation button is required", reason: "wrong_message" })
  }
  const sql = yield* SqlClient.SqlClient
  const previous = yield* readRosterReceipt(sql, operationId, interaction)
  if (previous !== undefined) return previous
  yield* requireFreshInteraction(interaction)
  const initial = (yield* loadConfirmation(sql, operationId, false))[0]
  if (initial === undefined) return yield* new NotFound({ message: "Roster preparation not found" })
  yield* checkScope(initial, interaction)
  // A competing exact confirmation may commit between our first receipt lookup
  // and this read. Its receipt is visible with its terminal preparation state.
  if (initial.state !== "preparing") {
    const committed = yield* readRosterReceipt(sql, operationId, interaction)
    if (committed !== undefined) return committed
  }
  yield* requirePreparing(initial)
  if (initial.action !== "signup" && initial.action !== "sub" && initial.action !== "remove") {
    return yield* new Conflict({ message: "This roster operation does not accept membership confirmation" })
  }
  const action = initial.action
  const initialCursor = yield* cursorFrom(initial)
  yield* advanceRosterForm(operationId, action, initialCursor, interaction)
  const tags = initialCursor.draft.selectedTags
  if (tags.length === 0 || new Set(tags).size !== tags.length) return yield* new Conflict({ message: "Roster confirmation has no valid account selection" })
  let identity = { username: interaction.actorLabel, avatarUrl: "" }
  let players: ReadonlyArray<ReturnType<typeof rosterPlayerSnapshot>> = []
  if (action !== "remove") {
    const owned = yield* sql<{ tag: string }>`SELECT tag FROM player_links WHERE user_id = ${interaction.actorId} AND tag = ANY(${tags}::text[])`
    if (owned.length !== tags.length) return yield* new Forbidden({ message: "You no longer own every selected account" })
    if (bindings === undefined) return yield* new UpstreamUnavailable({ cause: undefined, message: "Roster admission lookup is not configured" })
    // External evidence is gathered before any transaction or membership lock.
    identity = yield* loadDiscordIdentity(initial.server_id, interaction.actorId).pipe(Effect.catchTag("NotFound", () =>
      Effect.fail(new Forbidden({ message: "You must belong to the Discord server to join its roster" }))))
    players = yield* Effect.forEach(tags, tag => loadRosterClashPlayer(bindings, tag).pipe(Effect.map(rosterPlayerSnapshot)), { concurrency: 4 })
  }
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql`SELECT user_id FROM auth_users WHERE user_id = ${interaction.actorId} FOR SHARE`
    const owners = yield* lockRosterAdmissionOwners(sql, tags, [interaction.actorId])
    yield* lockRosterMembership(sql, initial.server_id, [initial.roster_id])
    const replay = yield* readRosterReceipt(sql, operationId, interaction)
    if (replay !== undefined) return replay
    yield* requireFreshInteraction(interaction)
    const row = (yield* loadConfirmation(sql, operationId, true))[0]
    if (row === undefined) return yield* new NotFound({ message: "Roster preparation not found" })
    yield* checkScope(row, interaction)
    yield* requirePreparing(row)
    const cursor = yield* cursorFrom(row)
    if (row.version !== initial.version || JSON.stringify(cursor.draft) !== JSON.stringify(initialCursor.draft)) {
      return yield* new Conflict({ message: "Roster form changed during confirmation" })
    }
    if (tags.some(tag => owners.get(tag) !== interaction.actorId)) return yield* new Forbidden({ message: "You no longer own every selected account" })
    yield* assertRosterDraftCurrent(sql, row, cursor)
    const next = yield* advanceRosterForm(operationId, action, cursor, interaction)
    const members = yield* sql<{ tag: string; member_group_id: string | null; role_id: string | null }>`
      SELECT member.tag, member.member_group_id::text, settings.role_id FROM roster_members member
      LEFT JOIN roster_member_group_settings settings ON settings.roster_id = member.roster_id AND settings.member_group_id = member.member_group_id
      WHERE member.roster_id = ${row.roster_id}::uuid AND member.tag = ANY(${tags}::text[]) ORDER BY member.tag`
    if (action === "remove" ? members.length !== tags.length : members.length !== 0) {
      return yield* new Conflict({ message: "Selected roster membership changed; start a new form" })
    }
    const roster = (yield* sql<{ roster_role_id: string | null; min_townhall: number | null; max_townhall: number | null;
      signup_scope: "clan-only" | "family-wide"; clan_tag: string | null; server_id: string }>`
      SELECT roster_role_id, min_townhall, max_townhall, signup_scope, clan_tag, server_id FROM rosters WHERE id = ${row.roster_id}::uuid`)[0]!
    let groupRoleId: string | null = null
    const groupId = action === "signup" && cursor.draft.selectedGroup !== "main" ? cursor.draft.selectedGroup : null
    if (action === "signup" && (cursor.draft.selectedGroup === null
      || groupId !== null && !cursor.draft.groups.some(group => group.id === groupId))) {
      return yield* new Conflict({ message: "The selected signup group is unavailable" })
    }
    if (groupId !== null) {
      const group = (yield* sql<{ role_id: string | null }>`SELECT role_id FROM roster_member_group_settings
        WHERE roster_id = ${row.roster_id}::uuid AND member_group_id = ${groupId}::uuid AND signup_enabled`)[0]
      if (group === undefined) return yield* new Conflict({ message: "The selected signup group is unavailable" })
      groupRoleId = group.role_id
    }
    if (action === "remove") yield* sql`DELETE FROM roster_members WHERE roster_id = ${row.roster_id}::uuid AND tag = ANY(${tags}::text[])`
    else {
      for (const player of players) {
        yield* assertSignupEligibility(sql, roster, player)
        yield* sql`INSERT INTO roster_members (roster_id, tag, name, townhall, trophies, current_clan_tag, current_clan_name,
          signup_answers, discord_user_id, discord_username, discord_avatar_url, refreshed_at, hero_level_sum, max_percent,
          league_id, league_name, member_group_id, is_substitute, position)
          VALUES (${row.roster_id}::uuid, ${player.tag}, ${player.name}, ${player.townhall}, ${player.trophies},
            NULLIF(${player.current_clan_tag}, ''), NULLIF(${player.current_clan}, ''), ${JSON.stringify(cursor.draft.answers)}::jsonb,
            ${interaction.actorId}, NULLIF(${identity.username}, ''), NULLIF(${identity.avatarUrl}, ''), ${player.refreshed_at}::timestamptz,
            ${player.hero_level_sum}, ${player.max_percent}, ${player.league_id ?? null}, ${player.league_name ?? null},
            ${groupId}::uuid, ${action === "sub"}, COALESCE((SELECT max(position) + 1 FROM roster_members WHERE roster_id = ${row.roster_id}::uuid), 0))`
      }
      yield* assertRosterMembershipLimits(sql, [row.roster_id], [interaction.actorId])
    }
    yield* sql`UPDATE rosters SET revision = revision + 1, updated_at = clock_timestamp() WHERE id = ${row.roster_id}::uuid`
    const snapshot = { action, actorUserId: interaction.actorId, tags, groupId, answers: cursor.draft.answers,
      ...(action === "remove" ? { removed: members } : { players }) }
    yield* sql`UPDATE roster_runtime_operations SET state = 'submitted', stage = 'done', version = ${next.version},
      draft = ${JSON.stringify(next.draft)}::jsonb, accepted_snapshot = ${JSON.stringify(snapshot)}::jsonb,
      submitted_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = ${operationId}::uuid`
    const roles = [...new Set([roster.roster_role_id, groupRoleId, ...members.map(member => member.role_id)].filter((role): role is string => role !== null))]
    yield* enqueueRosterEffects(sql, row.server_id, operationId, [
      { kind: "board", scopeKey: `board:${row.source_publication_id}`, payload: { publicationId: row.source_publication_id } },
      ...roles.map(roleId => ({ kind: "role" as const, scopeKey: `role:${row.server_id}:${interaction.actorId}:${roleId}`,
        payload: { actorUserId: interaction.actorId, roleId } })),
    ])
    const result = yield* Schema.decodeUnknownEffect(RosterOperationAdvanceEndpoint.response)({ outcome: "accepted", operationId,
      rosterId: row.roster_id, action: row.action, state: "submitted", statusCustomId: `ck:roster:status:${operationId}` }).pipe(Effect.mapError(databaseFailure))
    yield* sql`INSERT INTO roster_runtime_receipts (interaction_id, request_hash, operation_id, actor_user_id, server_id, operation_version, response)
      VALUES (${interaction.id}, ${interaction.requestHash}, ${operationId}::uuid, ${interaction.actorId}, ${interaction.guildId}, ${next.version}, ${JSON.stringify(result)}::jsonb)`
    return result
  }))
}).pipe(Effect.catchTag("SqlError", cause => Effect.fail(databaseFailure(cause))))
