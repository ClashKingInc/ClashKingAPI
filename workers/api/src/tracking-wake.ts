import type { SqlClient } from "effect/sql"

export const trackingWakeChannel = "clashking_tracking_wake_v1"

export type TrackingWake =
  | { readonly kind: "guild_reactivated"; readonly serverId: string }
  | { readonly kind: "mobile_reminder_config"; readonly userId: string }
  | { readonly kind: "reminder_config"; readonly clanTag: string; readonly reminderType: string }
  | { readonly kind: "reminder_send"; readonly serverId: string; readonly reminderId: string }

/** PostgreSQL emits NOTIFY only after the surrounding transaction commits.
 * Tracking treats this as a fast hint; periodic reconciliation recovers a
 * missed configuration notification when no listener is connected. Manual
 * reminder sends are best-effort and are not recovered or delivery receipts. */
export const notifyTracking = (sql: SqlClient.SqlClient, event: TrackingWake) =>
  sql`SELECT pg_notify(${trackingWakeChannel}, ${JSON.stringify(event)})`
