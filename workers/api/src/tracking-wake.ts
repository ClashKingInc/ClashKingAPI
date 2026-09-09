import type { SqlClient } from "effect/unstable/sql"

export const trackingWakeChannel = "clashking_tracking_wake_v1"

export type TrackingWake =
  | { readonly kind: "guild_reactivated"; readonly serverId: string }
  | { readonly kind: "mobile_reminder_config"; readonly userId: string }
  | { readonly kind: "reminder_config"; readonly clanTag: string; readonly reminderType: string }

/** PostgreSQL emits NOTIFY only after the surrounding transaction commits.
 * Tracking treats this as a fast hint; periodic reconciliation recovers a
 * missed notification when no listener is connected. */
export const notifyTracking = (sql: SqlClient.SqlClient, event: TrackingWake) =>
  sql`SELECT pg_notify(${trackingWakeChannel}, ${JSON.stringify({ v: 1, ...event })})`
