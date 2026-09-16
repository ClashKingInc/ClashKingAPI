import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { UserPrincipal } from "./auth.js"
import { DatabaseFailure } from "./errors.js"

const WarActivity = Schema.Struct({
  state: Schema.String,
  startTime: Schema.String,
  endTime: Schema.String,
  clan: Schema.Struct({ tag: Schema.String, members: Schema.Array(Schema.Struct({ tag: Schema.String })) }),
})
const clashDate = (raw: string): Date | undefined => {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.000Z$/u.exec(raw)
  if (!match) return undefined
  const value = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`)
  return Number.isFinite(value.valueOf()) && value.toISOString().replaceAll("-", "").replaceAll(":", "") === raw ? value : undefined
}

/** Only server-returned current wars involving an owned, verified, enabled
 * account are activity hints. Tracking remains the sole schedule/timer writer. */
export const recordProxyWarActivity = (principal: UserPrincipal, path: string, body: unknown, now = new Date()) => Effect.gen(function* () {
  const match = /^\/proxy\/v1\/clans\/([^/]+)\/currentwar$/u.exec(path)
  if (!match) return
  const war = yield* Schema.decodeUnknownEffect(WarActivity)(body).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!war || (war.state !== "preparation" && war.state !== "inWar") || decodeURIComponent(match[1]!) !== war.clan.tag) return
  const start = clashDate(war.startTime), end = clashDate(war.endTime)
  if (!start || !end || end <= now || start >= end || start.valueOf() > now.valueOf() + 86_400_000) return
  const tags = war.clan.members.map((member) => member.tag)
  if (!tags.length) return
  const sql = yield* SqlClient.SqlClient
  // Do not fabricate a partial basic_clan profile from a war roster. Existing
  // full profiles come from global-clan tracking; neither timestamp can regress.
  yield* sql.unsafe(`UPDATE basic_clan SET
    last_active=GREATEST(last_active,$2::timestamptz),
    last_war_at=GREATEST(last_war_at,$2::timestamptz)
    WHERE tag=$1 AND EXISTS (
      SELECT 1 FROM player_links link
      JOIN mobile_notification_accounts preference
        ON preference.user_id=link.user_id AND preference.player_tag=link.tag
      WHERE link.user_id=$3 AND link.is_verified AND link.tag=ANY($4::text[])
        AND preference.enabled
    ) AND (last_active IS NULL OR last_active < $2::timestamptz
      OR last_war_at IS NULL OR last_war_at < $2::timestamptz)`,
  [war.clan.tag, start, principal.userId, tags]).pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "War activity hint could not be saved" })))
})
