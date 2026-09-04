import { DashboardRosterSignupQuestion } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { Conflict, NotFound } from "./errors.js"
import type { RosterFormCursor } from "./roster-interaction-forms.js"

/** Read under the canonical roster lock. Membership revisions deliberately do
 * not invalidate forms, but admission rules and offered configuration do. */
export const readRosterPreparationConfiguration = (sql: SqlClient.SqlClient, serverId: string, rosterId: string) => Effect.gen(function* () {
  const roster = (yield* sql<{ signup_questions: unknown; signup_scope: string }>`SELECT signup_questions, signup_scope,
    clan_tag, min_townhall, max_townhall, capacity, max_accounts_per_user, roster_role_id
    FROM rosters WHERE id = ${rosterId}::uuid AND server_id = ${serverId}`)[0]
  if (roster === undefined) return yield* new NotFound({ message: "Roster not found" })
  const settings = yield* sql<{ id: string; label: string; signup_enabled: boolean; role_id: string | null; position: number }>`
    SELECT groups.id::text, groups.name AS label, settings.signup_enabled, settings.role_id, settings.position
    FROM roster_member_group_settings settings
    JOIN roster_member_groups groups ON groups.id = settings.member_group_id AND groups.server_id = settings.server_id
    WHERE settings.roster_id = ${rosterId}::uuid AND settings.server_id = ${serverId}
    ORDER BY settings.position, groups.id LIMIT 26`
  const groups = settings.filter(group => group.signup_enabled).map(({ id, label }) => ({ id, label }))
  if (settings.length > 25 || groups.length > 24) return yield* new Conflict({
    message: "This roster has more than 24 enabled signup groups; repair its group configuration",
  })
  const questions = yield* Schema.decodeUnknownEffect(Schema.Array(DashboardRosterSignupQuestion))(roster.signup_questions).pipe(
    Effect.mapError(() => new Conflict({ message: "The roster signup questions are invalid" })),
  )
  const clans = roster.signup_scope === "family-wide" ? yield* sql<{ tag: string }>`
    SELECT tag FROM server_clans WHERE server_id = ${serverId} ORDER BY tag` : []
  const fingerprint = yield* Effect.promise(async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ roster, settings, clans })))
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")
  })
  return { fingerprint, groups, questions }
})

/** Exact committed receipts bypass this check; newly signed steps never do. */
export const assertRosterDraftCurrent = (sql: SqlClient.SqlClient,
  scope: { server_id: string; roster_id: string; actor_user_id: string; action: string }, cursor: RosterFormCursor) => Effect.gen(function* () {
  const tags = cursor.draft.accounts.map(account => account.tag)
  const owned = yield* sql<{ tag: string }>`SELECT tag FROM player_links WHERE user_id = ${scope.actor_user_id} AND tag = ANY(${tags}::text[])`
  if (owned.length !== tags.length) return yield* new Conflict({ message: "Roster account ownership changed; start a new form" })
  // Removal must remain available after TH, capacity, questions, or groups change.
  if (scope.action === "remove") return
  const current = yield* readRosterPreparationConfiguration(sql, scope.server_id, scope.roster_id)
  if (cursor.draft.configurationFingerprint !== current.fingerprint) return yield* new Conflict({ message: "Roster signup configuration changed; start a new form" })
})
