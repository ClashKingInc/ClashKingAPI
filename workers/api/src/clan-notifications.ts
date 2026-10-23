import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import type { NotificationClanRequest } from "@clashking/api-contracts"
import type { UserPrincipal } from "./auth.js"
import { Conflict, InvalidRequest, Unauthenticated } from "./errors.js"
import { notifyTracking } from "./tracking-wake.js"

interface ClanRow {
  tag: string; war_notifications_enabled: boolean; raid_notifications_enabled: boolean
  war_active_until: Date | string | null; raid_active_until: Date | string | null
  war_tracked: boolean; raid_tracked: boolean
}
const iso = (date: Date | string | null) => date === null ? null : new Date(date).toISOString()
// Beta supports ten choices. Disabling beta preserves existing choices; only additions
// require room under the new allowance. No billing or subscription writes occur here.
export function clanNotificationLimit(beta: boolean, paid: boolean): number { return beta || paid ? 10 : 1 }
export function clanNotificationChangeAllowed(current: number, next: number, limit: number): boolean {
  return next <= limit || next <= current
}
export const getNotificationClans = (principal: UserPrincipal, beta = true) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const paid = (yield* sql<{ active: boolean }>`SELECT active FROM subscription_entitlements WHERE user_id=${principal.userId}`)[0]?.active === true
  const limit = clanNotificationLimit(beta, paid)
  const rows = yield* sql<ClanRow>`SELECT bookmark.tag, war_notifications_enabled, raid_notifications_enabled,
    war_active_until, raid_active_until, COALESCE(interest.war_tracked,false) AS war_tracked,
    COALESCE(interest.raid_tracked,false) AS raid_tracked
    FROM user_bookmarks bookmark LEFT JOIN clan_notification_tracking interest ON interest.tag=bookmark.tag
    WHERE bookmark.user_id=${principal.userId} AND entity_type='clan' ORDER BY order_index,bookmark.tag`
  return {
    clans: rows.map((row) => ({ tag: row.tag, warEnabled: row.war_notifications_enabled,
      raidEnabled: row.raid_notifications_enabled, warActiveUntil: iso(row.war_active_until),
      raidActiveUntil: iso(row.raid_active_until), warTracked: row.war_tracked, raidTracked: row.raid_tracked })),
    limits: { war: limit, raid: limit },
    usage: { war: rows.filter((row) => row.war_notifications_enabled).length,
      raid: rows.filter((row) => row.raid_notifications_enabled).length },
  }
})
export const putNotificationClan = (principal: UserPrincipal, rawTag: string, body: typeof NotificationClanRequest.Type, beta = true) => Effect.gen(function* () {
  const tag = `#${rawTag.trim().toUpperCase().replaceAll("O","0").replace(/^#+/u, "")}`
  if (!/^#[0289PYLQGRJCUV]{3,14}$/u.test(tag)) return yield* new InvalidRequest({ message: "Invalid clan tag" })
  if (body.removeBookmark && (body.warEnabled || body.raidEnabled)) return yield* new InvalidRequest({ message: "Turn off notifications before removing the bookmark" })
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    if ((yield* sql`SELECT user_id FROM auth_users WHERE user_id=${principal.userId} FOR UPDATE`).length === 0)
      return yield* new Unauthenticated({ message: "User session is no longer valid" })
    const current = yield* getNotificationClans(principal, beta)
    const existing = current.clans.find((clan) => clan.tag === tag)
    const war = current.usage.war - Number(existing?.warEnabled ?? false) + Number(body.warEnabled)
    const raid = current.usage.raid - Number(existing?.raidEnabled ?? false) + Number(body.raidEnabled)
    if (!clanNotificationChangeAllowed(current.usage.war, war, current.limits.war) ||
        !clanNotificationChangeAllowed(current.usage.raid, raid, current.limits.raid))
      return yield* new Conflict({ message: "Turn off existing clan notifications to make room for this clan" })
    if (body.removeBookmark) {
      yield* sql`DELETE FROM user_bookmarks WHERE user_id=${principal.userId} AND entity_type='clan' AND tag=${tag}`
    } else {
      yield* sql`INSERT INTO user_bookmarks (user_id,entity_type,tag,order_index,war_notifications_enabled,
        raid_notifications_enabled,war_active_until,raid_active_until)
        SELECT ${principal.userId},'clan',${tag},count(*)::integer,${body.warEnabled},${body.raidEnabled},
          CASE WHEN ${body.warEnabled} THEN now()+interval '7 days' END,
          CASE WHEN ${body.raidEnabled} THEN now()+interval '7 days' END
        FROM user_bookmarks WHERE user_id=${principal.userId} AND entity_type='clan'
        ON CONFLICT (user_id,entity_type,tag) DO UPDATE SET
          war_notifications_enabled=excluded.war_notifications_enabled,
          raid_notifications_enabled=excluded.raid_notifications_enabled,
          war_active_until=excluded.war_active_until,raid_active_until=excluded.raid_active_until`
      const newWar = body.warEnabled && !existing?.warEnabled
      const newRaid = body.raidEnabled && !existing?.raidEnabled
      yield* sql`INSERT INTO mobile_notification_preferences(user_id,war_state_enabled,war_reminders_enabled,
        raid_reminders_enabled,reminder_timings,raid_reminder_timings)
        VALUES (${principal.userId},${newWar},${newWar},${newRaid},ARRAY[60],ARRAY[60])
        ON CONFLICT(user_id) DO UPDATE SET
          war_state_enabled=mobile_notification_preferences.war_state_enabled OR ${newWar},
          war_reminders_enabled=mobile_notification_preferences.war_reminders_enabled OR ${newWar},
          raid_reminders_enabled=mobile_notification_preferences.raid_reminders_enabled OR ${newRaid},
          reminder_timings=CASE WHEN ${newWar} AND cardinality(mobile_notification_preferences.reminder_timings)=0
            THEN ARRAY[60] ELSE mobile_notification_preferences.reminder_timings END,
          raid_reminder_timings=CASE WHEN ${newRaid} AND cardinality(mobile_notification_preferences.raid_reminder_timings)=0
            THEN ARRAY[60] ELSE mobile_notification_preferences.raid_reminder_timings END`
    }
    yield* notifyTracking(sql, { kind: "mobile_reminder_config", userId: principal.userId })
    return yield* getNotificationClans(principal, beta)
  }))
})
