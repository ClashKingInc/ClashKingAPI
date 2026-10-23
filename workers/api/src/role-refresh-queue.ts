import { Effect } from "effect"
import { SqlClient } from "effect/sql"

/** Link ownership/visibility is an input change, so enabled servers must
 * reconcile even when no game-event trigger fires. Persist inside the link
 * transaction; preserve a pending leave grace window. */
export const queueSubjectRoleRefresh = (userId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO role_refresh_jobs(id,server_id,user_id)
    SELECT 'auto:' || server.id || ':' || ${userId},server.id,${userId}
    FROM servers server JOIN discord_cache.members member ON member.guild_id=server.id AND member.user_id=${userId}
    WHERE server.autoeval_enabled AND server.left_at IS NULL
    ON CONFLICT(id) DO UPDATE SET due_at=CASE WHEN role_refresh_jobs.completed_at IS NOT NULL THEN now()
      ELSE COALESCE(role_refresh_jobs.grace_until,now()) END,
      grace_until=CASE WHEN role_refresh_jobs.completed_at IS NOT NULL THEN NULL ELSE role_refresh_jobs.grace_until END,
      completed_at=NULL,result=NULL,attempts=0,revision=role_refresh_jobs.revision+1,updated_at=now()`
})
