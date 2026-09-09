import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, UpstreamUnavailable } from "./errors.js"
import type { StatsCwlRequest } from "./stats-internal.js"
import type { ArchiveDailyMetric } from "./stats-archive.js"

/** Uploaded coverage, histograms, pending wars and league attribution share one
 * PostgreSQL snapshot. Never interpret an unbackfilled CWL pack as zero attacks.
 */
export const queryCwlArchiveDaily = (start: Date, endExclusive: Date, request: StatsCwlRequest) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const seasons = request.seasons ?? []
  const league = request.cwl_league_id ?? null
  const rows = yield* sql<{ complete: boolean; league_complete: boolean; daily: ReadonlyArray<ArchiveDailyMetric> }>`
    WITH packs AS MATERIALIZED (
      SELECT pack.*, (
        jsonb_typeof(pack.stats->'byDay') = 'object'
        AND EXISTS (SELECT 1 FROM jsonb_each(pack.stats->'byDay'))
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_each(pack.stats->'byDay') day
          WHERE jsonb_typeof(day.value->'warsByType') IS DISTINCT FROM 'object'
            OR (day.key >= ${start.toISOString().slice(0, 10)} AND day.key < ${endExclusive.toISOString().slice(0, 10)}
              AND (${seasons.length} = 0 OR left(day.key, 7) = ANY(${seasons}::text[]))
              AND COALESCE((day.value#>>'{warsByType,cwl}')::bigint, 0) > 0)
        )
      ) AS proven_no_cwl
      FROM war_archive_packs pack WHERE pack.status = 'uploaded'
        AND pack.last_end_time >= ${start} AND pack.first_end_time < ${endExclusive}
    ), pack_coverage AS (
      SELECT COALESCE(bool_and(proven_no_cwl OR COALESCE(
        stats#>'{cwl,version}' = '1'::jsonb AND stats#>'{cwl,coverage,complete}' = 'true'::jsonb, false)), true) AS complete,
        COALESCE(bool_and(proven_no_cwl OR COALESCE(stats#>'{cwl,coverage,leagueComplete}' = 'true'::jsonb, false)), true) AS league_complete
      FROM packs
    ), pack_matchups AS (
      SELECT day.key AS day, league_entry.key AS league_id,
        split_part(matchup.key, ':', 1)::integer AS attacker_th,
        split_part(matchup.key, ':', 2)::integer AS defender_th,
        (matchup.value->>'attacks')::bigint AS attacks,
        (matchup.value#>>'{zeroStars,attacks}')::bigint AS zero_stars,
        (matchup.value#>>'{oneStars,attacks}')::bigint AS one_stars,
        (matchup.value#>>'{twoStars,attacks}')::bigint AS two_stars,
        (matchup.value#>>'{threeStars,attacks}')::bigint AS three_stars,
        (matchup.value#>>'{zeroStars,destructionPercent}')::bigint
          + (matchup.value#>>'{oneStars,destructionPercent}')::bigint
          + (matchup.value#>>'{twoStars,destructionPercent}')::bigint
          + 100 * (matchup.value#>>'{threeStars,attacks}')::bigint AS destruction
      FROM packs CROSS JOIN LATERAL jsonb_each(stats#>'{cwl,byDay}') day
      CROSS JOIN LATERAL jsonb_each(day.value->'byLeague') league_entry
      CROSS JOIN LATERAL jsonb_each(league_entry.value) matchup
      WHERE day.key >= ${start.toISOString().slice(0, 10)} AND day.key < ${endExclusive.toISOString().slice(0, 10)}
        AND (${seasons.length} = 0 OR left(day.key, 7) = ANY(${seasons}::text[]))
    ), pending_wars AS MATERIALIZED (
      SELECT pending.payload, to_char(war.end_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        attribution.league_id
      FROM war_archive_pending pending JOIN wars war ON war.war_id = pending.war_id AND war.end_time = pending.end_time
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(groups.cwl_id) > 0 AND count(groups.cwl_league_id) = count(groups.cwl_id)
          AND min(groups.cwl_league_id) > 0 AND count(DISTINCT groups.cwl_league_id) = 1
          THEN min(groups.cwl_league_id) ELSE NULL END AS league_id
        FROM cwl_group_clans home JOIN cwl_groups groups ON groups.cwl_id = home.cwl_id
        JOIN cwl_group_clans away ON away.cwl_id = home.cwl_id AND away.clan_tag = war.opponent_tag
        WHERE home.clan_tag = war.clan_tag AND war.war_tag <> '' AND war.war_tag <> '#0'
          AND groups.rounds @> jsonb_build_array(jsonb_build_array(war.war_tag))
      ) attribution ON true
      WHERE war.war_type = 'cwl' AND pending.end_time >= ${start} AND pending.end_time < ${endExclusive}
        AND (${seasons.length} = 0 OR to_char(war.end_time AT TIME ZONE 'UTC', 'YYYY-MM') = ANY(${seasons}::text[]))
    ), pending_attacks AS (
      SELECT pending.day, COALESCE(pending.league_id::text, 'unknown') AS league_id,
        (attacker.value->>'townhallLevel')::integer AS attacker_th,
        (defender.value->>'townhallLevel')::integer AS defender_th,
        (attack.value->>'stars')::integer AS stars,
        (attack.value->>'destructionPercentage')::bigint AS destruction
      FROM pending_wars pending CROSS JOIN LATERAL (VALUES
        (pending.payload->'clan', pending.payload->'opponent'),
        (pending.payload->'opponent', pending.payload->'clan')
      ) side(attacking, defending)
      CROSS JOIN LATERAL jsonb_array_elements(side.attacking->'members') attacker
      CROSS JOIN LATERAL jsonb_array_elements(attacker.value->'attacks') attack
      JOIN LATERAL jsonb_array_elements(side.defending->'members') defender ON defender.value->>'tag' = attack.value->>'defenderTag'
    ), outcomes AS (
      SELECT * FROM pack_matchups UNION ALL
      SELECT day, league_id, attacker_th, defender_th, 1,
        (stars = 0)::integer, (stars = 1)::integer, (stars = 2)::integer, (stars = 3)::integer, destruction
      FROM pending_attacks
    ), daily AS (
      SELECT day AS date, sum(attacks)::float8 AS sample_size,
        sum(one_stars + 2 * two_stars + 3 * three_stars)::float8 / NULLIF(sum(attacks), 0) AS average_stars,
        sum(destruction)::float8 / NULLIF(sum(attacks), 0) AS average_destruction,
        sum(zero_stars)::float8 / NULLIF(sum(attacks), 0) AS zero_star_rate,
        sum(one_stars)::float8 / NULLIF(sum(attacks), 0) AS one_star_rate,
        sum(two_stars)::float8 / NULLIF(sum(attacks), 0) AS two_star_rate,
        sum(three_stars)::float8 / NULLIF(sum(attacks), 0) AS three_star_rate
      FROM outcomes
      WHERE (${league}::integer IS NULL OR league_id = ${league}::text)
        AND (${request.townhall_level ?? null}::integer IS NULL OR attacker_th = ${request.townhall_level ?? null})
        AND (${request.opponent_townhall_level ?? null}::integer IS NULL OR defender_th = ${request.opponent_townhall_level ?? null})
        AND (NOT ${request.equal_townhalls ?? true}::boolean OR attacker_th = defender_th)
      GROUP BY day HAVING sum(attacks) > 0
    )
    SELECT coverage.complete, coverage.league_complete AND NOT EXISTS (
      SELECT 1 FROM pending_wars WHERE league_id IS NULL
    ) AS league_complete, COALESCE((SELECT jsonb_agg(daily ORDER BY date) FROM daily), '[]'::jsonb) AS daily
    FROM pack_coverage coverage
  `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "CWL statistics query failed" })))
  const result = rows[0]
  if (!result?.complete || league !== null && !result.league_complete) {
    return yield* new UpstreamUnavailable({ cause: "archive_coverage_incomplete", message: league !== null
      ? "CWL league statistics require complete archive coverage and league attribution"
      : "CWL statistics require complete archive coverage" })
  }
  return result.daily
})
