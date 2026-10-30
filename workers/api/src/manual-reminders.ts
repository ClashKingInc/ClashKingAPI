import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { DatabaseFailure, NotFound } from "./errors.js"
import { notifyTracking } from "./tracking-wake.js"

type Selection = { readonly reminderId: string } | { readonly clanTag: string; readonly type: string }

/** Best-effort request only. Tracking rechecks configuration before delivery. */
export const requestManualReminders = (sql: SqlClient.SqlClient, serverId: string, selection: Selection) =>
  sql.withTransaction(Effect.gen(function* () {
    const rows = yield* sql<{ id: string }>`
      SELECT id::text FROM reminders
      WHERE server_id = ${serverId} AND disabled = false
        AND (${"reminderId" in selection ? selection.reminderId : null}::uuid IS NULL OR id = ${"reminderId" in selection ? selection.reminderId : null}::uuid)
        AND (${ "clanTag" in selection ? selection.clanTag : null }::text IS NULL OR clan_tag = ${"clanTag" in selection ? selection.clanTag : null})
        AND (${ "type" in selection ? selection.type : null }::text IS NULL OR type_name = ${"type" in selection ? selection.type : null})
        -- A retired numeric ID must not be revived by a mismatched legacy name.
        AND type <> 4
        AND type_name IN ('War', 'Clan Capital', 'Clan Games', 'roster')
        AND NULLIF(channel_id, '') IS NOT NULL
        AND (type_name <> 'roster' OR NULLIF(roster_id, '') IS NOT NULL)
      ORDER BY id FOR SHARE
    `
    if (rows.length === 0) return yield* new NotFound({ message: "No enabled, supported reminder matches this request" })
    for (const row of rows) yield* notifyTracking(sql, { kind: "reminder_send", serverId, reminderId: row.id })
    return { accepted: rows.length }
  })).pipe(Effect.catchTag("SqlError", cause => Effect.fail(new DatabaseFailure({ cause, message: "Manual reminder request failed" }))))
