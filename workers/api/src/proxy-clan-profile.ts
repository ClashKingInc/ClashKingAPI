import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import type { UserPrincipal } from "./auth.js"
import { ClashClanProfile, normalizeClashClanProfile } from "./clash-clan-profile.js"
import { DatabaseFailure } from "./errors.js"

/** Seed a complete missing clan profile from the successful profile response
 * already requested by this user. Existing tracking-owned profiles are never
 * overwritten, and eligibility requires an explicitly enabled verified member. */
export const seedObservedClanProfile = (principal: UserPrincipal, path: string, body: unknown) => Effect.gen(function* () {
  const match = /^\/proxy\/v1\/clans\/([^/]+)$/u.exec(path)
  if (!match) return
  let requestedTag: string
  try { requestedTag = decodeURIComponent(match[1]!) } catch { return }
  const decoded = yield* Schema.decodeUnknownEffect(ClashClanProfile)(body).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!decoded || decoded.tag !== requestedTag) return
  const clan = normalizeClashClanProfile(decoded)
  const memberTags = clan.members.map((member) => member.tag)
  if (memberTags.length === 0) return
  const sql = yield* SqlClient.SqlClient
  yield* sql`INSERT INTO basic_clan
    (tag,name,description,clan_level,location_id,cwl_league_id,capital_league_id,public_war_log,
      war_wins,war_win_streak,clan_points,member_count,badge_token,troops_donated,troops_received,members,last_active)
    SELECT ${clan.tag},${clan.name},${clan.description},${clan.clanLevel},${clan.locationId},${clan.warLeagueId},
      ${clan.capitalLeagueId},${clan.publicWarLog},${clan.warWins},${clan.warWinStreak},${clan.clanPoints},
      ${clan.memberCount},${clan.badgeToken},${clan.donated},${clan.received},${JSON.stringify(clan.members)}::jsonb,now()
    WHERE EXISTS (
      SELECT 1 FROM player_links link
      JOIN mobile_notification_accounts preference
        ON preference.user_id=link.user_id AND preference.player_tag=link.tag
      WHERE link.user_id=${principal.userId} AND link.is_verified AND preference.enabled
        AND link.tag=ANY(${memberTags}::text[])
    ) ON CONFLICT (tag) DO NOTHING`
    .pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Observed clan profile could not be seeded" })))
})
