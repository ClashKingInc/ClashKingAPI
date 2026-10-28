import { Effect } from "effect"
import type { SqlClient } from "effect/sql"

export const rosterRoleInputs = (sql: SqlClient.SqlClient, serverId: string) => Effect.gen(function* () {
  const roles = yield* sql<{ id: string }>`SELECT DISTINCT id FROM (
    SELECT roster_role_id AS id FROM rosters WHERE server_id=${serverId}
    UNION SELECT setting.role_id FROM roster_member_group_settings setting WHERE setting.server_id=${serverId}
  ) configured WHERE id IS NOT NULL ORDER BY id`
  const owners = yield* sql<{ id: string }>`SELECT DISTINCT link.user_id AS id FROM roster_members member
    JOIN rosters roster ON roster.id=member.roster_id JOIN player_links link ON link.tag=member.tag
    WHERE roster.server_id=${serverId} AND link.user_id IS NOT NULL ORDER BY id`
  return { roles: roles.map(row=>row.id), owners: owners.map(row=>row.id) }
})
export const rosterRoleState = (sql: SqlClient.SqlClient, serverId: string, userId: string) => Effect.gen(function* () {
  const configured = yield* rosterRoleInputs(sql,serverId)
  const desired = yield* sql<{ id: string }>`SELECT DISTINCT id FROM (
    SELECT roster.roster_role_id AS id FROM rosters roster JOIN roster_members member ON member.roster_id=roster.id
      JOIN player_links link ON link.tag=member.tag WHERE roster.server_id=${serverId} AND link.user_id=${userId}
    UNION SELECT setting.role_id AS id FROM roster_member_group_settings setting
      JOIN roster_members member ON member.roster_id=setting.roster_id AND member.member_group_id=setting.member_group_id
      JOIN player_links link ON link.tag=member.tag WHERE setting.server_id=${serverId} AND link.user_id=${userId}
  ) earned WHERE id IS NOT NULL ORDER BY id`
  const desiredRoleIds=desired.map(row=>row.id)
  return { managedRoleIds: configured.roles, desiredRoleIds, fingerprint: JSON.stringify([configured.roles,desiredRoleIds]) }
})

/** Call in the roster/link transaction. Keep former role IDs and owners until
 * the pending job completes; deleting configuration must not lose cleanup work.
 * Cached holders are included so removing a member also removes an orphan role.
 */
export const queueRosterRoleRefresh = (sql: SqlClient.SqlClient, serverId: string, before: {roles: string[]; owners: string[]} = {roles:[],owners:[]}) => Effect.gen(function* () {
  const after = yield* rosterRoleInputs(sql,serverId)
  const roles=[...new Set([...before.roles,...after.roles])].sort()
  if(roles.length===0)return 0
  const owners=[...new Set([...before.owners,...after.owners])]
  const queued=yield* sql`INSERT INTO role_refresh_jobs(id,server_id,user_id,categories,roster_role_ids)
    SELECT 'roster:'||${serverId}||':'||subject.id,${serverId},subject.id,ARRAY['roster']::text[],${roles}::text[]
    FROM (SELECT unnest(${owners}::text[]) AS id UNION
      SELECT user_id FROM discord_cache.members WHERE guild_id=${serverId}
        AND COALESCE(data->'user'->>'bot','false')<>'true' AND COALESCE(data->'roles','[]'::jsonb) ?| ${roles}::text[]) subject
    WHERE EXISTS(SELECT 1 FROM servers WHERE id=${serverId} AND left_at IS NULL)
    ON CONFLICT(id) DO UPDATE SET roster_role_ids=ARRAY(SELECT DISTINCT unnest(
      CASE WHEN role_refresh_jobs.completed_at IS NULL THEN role_refresh_jobs.roster_role_ids ELSE ARRAY[]::text[] END || EXCLUDED.roster_role_ids) ORDER BY 1),
      completed_at=NULL,result=NULL,attempts=0,due_at=now(),revision=role_refresh_jobs.revision+1,updated_at=now()
    RETURNING id`
  return queued.length
})
