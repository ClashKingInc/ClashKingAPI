import type { StatsWarRequest } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure } from "./errors.js"

export interface ArchiveDailyMetric {
  readonly date: string
  readonly sample_size: number
  readonly average_stars: number
  readonly average_destruction: number
  readonly zero_star_rate: number
  readonly one_star_rate: number
  readonly two_star_rate: number
  readonly three_star_rate: number
}

/** One statement sees uploaded packs and pending wars in the same MVCC snapshot.
 * Current PackStats stores random-war outcomes by day and attacker:defender TH;
 * three-star destruction is exactly100 and intentionally not stored separately.
 */
export const queryRegularArchiveDaily = (
  start: Date,
  endExclusive: Date,
  request: StatsWarRequest,
) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql<ArchiveDailyMetric>`
    WITH pack_matchups AS (
      SELECT day.key AS day,
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
      FROM war_archive_packs pack
      CROSS JOIN LATERAL jsonb_each(pack.stats->'byDay') day
      CROSS JOIN LATERAL jsonb_each(day.value->'regularHitRates') matchup
      WHERE pack.status = 'uploaded' AND pack.last_end_time >= ${start} AND pack.first_end_time < ${endExclusive}
        AND day.key::date >= ${start.toISOString().slice(0, 10)}::date
        AND day.key::date < ${endExclusive.toISOString().slice(0, 10)}::date
    ), pending_attacks AS (
      SELECT to_char(war.end_time AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
        (attacker.value->>'townhallLevel')::integer AS attacker_th,
        (defender.value->>'townhallLevel')::integer AS defender_th,
        (attack.value->>'stars')::integer AS stars,
        (attack.value->>'destructionPercentage')::bigint AS destruction
      FROM war_archive_pending pending
      JOIN wars war ON war.war_id = pending.war_id AND war.end_time = pending.end_time
      CROSS JOIN LATERAL (VALUES
        (pending.payload->'clan', pending.payload->'opponent'),
        (pending.payload->'opponent', pending.payload->'clan')
      ) side(attacking, defending)
      CROSS JOIN LATERAL jsonb_array_elements(side.attacking->'members') attacker
      CROSS JOIN LATERAL jsonb_array_elements(attacker.value->'attacks') attack
      JOIN LATERAL jsonb_array_elements(side.defending->'members') defender
        ON defender.value->>'tag' = attack.value->>'defenderTag'
      WHERE war.war_type = 'random' AND pending.end_time >= ${start} AND pending.end_time < ${endExclusive}
    ), outcomes AS (
      SELECT day, attacker_th, defender_th, attacks, zero_stars, one_stars, two_stars, three_stars, destruction
      FROM pack_matchups
      UNION ALL
      SELECT day, attacker_th, defender_th, 1,
        (stars = 0)::integer, (stars = 1)::integer, (stars = 2)::integer, (stars = 3)::integer, destruction
      FROM pending_attacks
    )
    SELECT day AS date, sum(attacks)::float8 AS sample_size,
      sum(one_stars + 2 * two_stars + 3 * three_stars)::float8 / NULLIF(sum(attacks), 0) AS average_stars,
      sum(destruction)::float8 / NULLIF(sum(attacks), 0) AS average_destruction,
      sum(zero_stars)::float8 / NULLIF(sum(attacks), 0) AS zero_star_rate,
      sum(one_stars)::float8 / NULLIF(sum(attacks), 0) AS one_star_rate,
      sum(two_stars)::float8 / NULLIF(sum(attacks), 0) AS two_star_rate,
      sum(three_stars)::float8 / NULLIF(sum(attacks), 0) AS three_star_rate
    FROM outcomes
    WHERE (${request.townhall_level ?? null}::integer IS NULL OR attacker_th = ${request.townhall_level ?? null})
      AND (${request.opponent_townhall_level ?? null}::integer IS NULL OR defender_th = ${request.opponent_townhall_level ?? null})
      AND (NOT ${request.equal_townhalls ?? true}::boolean OR attacker_th = defender_th)
    GROUP BY day HAVING sum(attacks) > 0 ORDER BY day
  `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Regular war statistics query failed" })))
})
