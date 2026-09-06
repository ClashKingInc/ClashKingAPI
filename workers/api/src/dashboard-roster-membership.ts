// Retained Dashboard membership coordination. Only baseline roster fields and
// the approved tag/subject mutexes are used; deferred Bot capacity/group rules
// remain outside the active API.
import { Effect } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import { Conflict, DatabaseFailure, InvalidRequest, NotFound } from "./errors.js"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "Unable to serialize roster membership" })

/** Call inside the writer transaction, before reading members or changing
 * configuration. Every writer uses canonical rows in UUID order, including
 * removals. A caller holding a subject lock must acquire it before this lock.
 */
export const lockRosterMembership = (sql: SqlClient.SqlClient, serverId: string, rosterIds: ReadonlyArray<string>) => Effect.gen(function* () {
  if (rosterIds.some((id) => !uuid.test(id))) return yield* new InvalidRequest({ message: "Invalid roster UUID" })
  const ids = [...new Set(rosterIds.map((id) => id.toLowerCase()))].sort()
  const rows = yield* sql<{ id: string; revision: number | string; max_accounts_per_user: number | null }>`
    SELECT id::text, revision, max_accounts_per_user FROM rosters
    WHERE server_id = ${serverId} AND id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE
  `
  if (rows.length !== ids.length) return yield* new NotFound({ message: "Roster not found" })
  return rows
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(databaseFailure(cause))))

/** Acquire before any roster row, and after an authenticated actor row when
 * applicable. Tag mutexes freeze transfers; subject mutexes freeze the affected
 * owners' other links, including removals that do not acquire tag mutexes.
 */
export const lockRosterAdmissionOwners = (sql: SqlClient.SqlClient, tags: ReadonlyArray<string>, actorIds: ReadonlyArray<string> = []) => Effect.gen(function* () {
  const orderedTags = [...new Set(tags)].sort()
  if (orderedTags.some((tag) => !/^#[A-Z0-9]+$/u.test(tag))) return yield* new InvalidRequest({ message: "Invalid roster player tag" })
  for (const tag of orderedTags) {
    yield* sql`INSERT INTO player_link_mutation_locks (tag) VALUES (${tag}) ON CONFLICT (tag) DO NOTHING`
    yield* sql`SELECT tag FROM player_link_mutation_locks WHERE tag = ${tag} FOR UPDATE`
  }
  const owners = yield* sql<{ tag: string; user_id: string | null }>`SELECT tag, user_id FROM player_links WHERE tag = ANY(${orderedTags}::text[])`
  const subjects = [...new Set([...actorIds, ...owners.flatMap((row) => row.user_id === null ? [] : [row.user_id])])].sort()
  for (const subject of subjects) {
    yield* sql`INSERT INTO subject_mutation_locks (subject_id) VALUES (${subject}) ON CONFLICT (subject_id) DO NOTHING`
    yield* sql`SELECT subject_id FROM subject_mutation_locks WHERE subject_id = ${subject} FOR UPDATE`
  }
  // An unlink can finish while we wait for its subject, so use only the reread.
  const current = yield* sql<{ tag: string; user_id: string | null }>`SELECT tag, user_id FROM player_links WHERE tag = ANY(${orderedTags}::text[])`
  if (current.some((row) => row.user_id !== null && !subjects.includes(row.user_id))) {
    return yield* new Conflict({ message: "Roster account ownership changed; retry the admission" })
  }
  return new Map(current.flatMap((row) => row.user_id === null ? [] : [[row.tag, row.user_id] as const]))
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(databaseFailure(cause))))

export const assertRosterMembershipLimits = (sql: SqlClient.SqlClient, rosterIds: ReadonlyArray<string>, affectedOwnerIds?: ReadonlyArray<string>) => Effect.gen(function* () {
  const invalid = yield* sql`SELECT id FROM rosters WHERE id = ANY(${rosterIds}::uuid[])
    AND max_accounts_per_user IS NOT NULL AND max_accounts_per_user <= 0 LIMIT 1`
  if (invalid.length > 0) return yield* new Conflict({ message: "Roster per-user limit configuration is invalid", reason: "invalid_configuration" })
  // Ownership comes only from canonical links. User-supplied cached identity
  // cannot split one owner's accounts across fictitious Discord identities.
  const exceeded = yield* sql`SELECT roster.id FROM rosters roster
    JOIN roster_members member ON member.roster_id = roster.id
    JOIN player_links link ON link.tag = member.tag
    WHERE roster.id = ANY(${rosterIds}::uuid[]) AND roster.max_accounts_per_user IS NOT NULL AND link.user_id IS NOT NULL
      AND (${affectedOwnerIds === undefined} OR link.user_id = ANY(${affectedOwnerIds ?? []}::text[]))
    GROUP BY roster.id, roster.max_accounts_per_user, link.user_id
    HAVING count(*) > roster.max_accounts_per_user LIMIT 1`
  if (exceeded.length > 0) return yield* new Conflict({ message: "Roster account limit per Discord user would be exceeded" })
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(databaseFailure(cause))))
