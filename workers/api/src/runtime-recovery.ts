import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export type RecoveryKind = "ticket" | "panel" | "dashboard"
export interface RecoveryCursor {
  readonly updatedAt: string
  readonly id: string
  readonly through: string
}
export interface RecoveryJob { readonly id: string; readonly queue: string }
export interface RecoveryPage { readonly jobs: readonly RecoveryJob[]; readonly nextCursor?: RecoveryCursor }

/** Read-only, bounded inventory. Preserve PostgreSQL timestamp precision and
 * freeze the scan watermark so retry writes cannot extend a scan indefinitely. */
export const pendingRuntimePage = (kind: RecoveryKind, cursor?: RecoveryCursor) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const through = cursor?.through ?? (yield* sql<{ through: string }>`SELECT clock_timestamp()::text AS through`)[0]!.through
  const after = cursor?.updatedAt ?? "-infinity"
  const id = cursor?.id ?? (kind !== "panel" ? "00000000-0000-0000-0000-000000000000" : "")
  const rows = kind === "dashboard"
    ? yield* sql<{ id: string; queue: string; updated_at: string }>`
      SELECT id::text,server_id || ':' || ticket_id::text AS queue,updated_at::text FROM ticket_dashboard_jobs
      WHERE (state IN ('pending','running') OR (state='completed' AND (
        jsonb_array_length(COALESCE(result->'pending_logs','[]'::jsonb))>0 OR
        jsonb_array_length(COALESCE(result->'retired_transcript_paths','[]'::jsonb))>0)))
        AND (updated_at,id)>(${after}::timestamptz,${id}::uuid)
        AND updated_at<=${through}::timestamptz ORDER BY updated_at,id LIMIT 101`
    : kind === "ticket"
    ? yield* sql<{ id: string; queue: string; updated_at: string }>`
      SELECT pending.id,pending.queue,pending.updated_at::text FROM (
      SELECT 'click:' || click.id::text AS id,click.server_id || ':panel:' || click.panel_id::text AS queue,click.updated_at
      FROM ticket_button_click_logs click WHERE click.state='pending'
      UNION ALL
      SELECT operation.id::text, operation.server_id || ':' || operation.ticket_id::text AS queue,
        operation.updated_at
      FROM ticket_runtime_operations operation
      WHERE operation.state IN ('submitted','provisioning','reconciling')
      ) pending WHERE (pending.updated_at,pending.id)>(${after}::timestamptz,${id})
        AND pending.updated_at<=${through}::timestamptz ORDER BY pending.updated_at,pending.id LIMIT 101`
    : yield* sql<{ id: string; queue: string; updated_at: string }>`
      SELECT publication.effect_id AS id, publication.server_id || ':panel:' || publication.panel_id::text AS queue,
        publication.updated_at::text
      FROM ticket_panel_publication_effects publication
      WHERE ((publication.state='pending' AND publication.next_attempt_at<=${through}::timestamptz)
          OR (publication.state='executing' AND publication.lease_expires_at<=${through}::timestamptz)
          OR publication.state='uncertain')
        AND (publication.updated_at,publication.effect_id) > (${after}::timestamptz,${id})
        AND publication.updated_at <= ${through}::timestamptz
      ORDER BY publication.updated_at,publication.effect_id LIMIT 101`
  const batch = rows.slice(0,100), last = batch.at(-1)
  return { jobs: batch.map(row => ({ id: kind === "dashboard" ? `dashboard:${row.id}` : row.id, queue: row.queue })),
    ...(rows.length > 100 && last ? { nextCursor: { updatedAt: last.updated_at, id: last.id, through } } : {}) } satisfies RecoveryPage
})
