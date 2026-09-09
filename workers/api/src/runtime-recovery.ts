import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export type RecoveryKind = "ticket" | "panel"
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
  const id = cursor?.id ?? (kind === "ticket" ? "00000000-0000-0000-0000-000000000000" : "")
  const rows = kind === "ticket"
    ? yield* sql<{ id: string; queue: string; updated_at: string }>`
      SELECT operation.id::text, operation.server_id || ':' || operation.ticket_id::text AS queue,
        operation.updated_at::text
      FROM ticket_runtime_operations operation
      WHERE operation.state IN ('submitted','provisioning','reconciling')
        AND (operation.updated_at,operation.id) > (${after}::timestamptz,${id}::uuid)
        AND operation.updated_at <= ${through}::timestamptz
      ORDER BY operation.updated_at,operation.id LIMIT 101`
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
  return { jobs: batch.map(row => ({ id: row.id, queue: row.queue })),
    ...(rows.length > 100 && last ? { nextCursor: { updatedAt: last.updated_at, id: last.id, through } } : {}) } satisfies RecoveryPage
})
