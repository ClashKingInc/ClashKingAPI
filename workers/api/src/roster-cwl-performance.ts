import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { DatabaseFailure } from "./errors.js"
import { forEachArchiveWar } from "./war-archive.js"
import { archiveAttackFacts } from "./war-archive-model.js"

interface Totals {
  completedWars: number; attacks: number; triples: number; attackStars: number;
  attackDestruction: number; defenses: number; concededTriples: number;
  defenseStars: number; defenseDestruction: number; expectedAttacks: number;
}
const empty = (): Totals => ({ completedWars: 0, attacks: 0, triples: 0, attackStars: 0,
  attackDestruction: 0, defenses: 0, concededTriples: 0, defenseStars: 0, defenseDestruction: 0, expectedAttacks: 0 })
const present = (v: Totals) => ({ ...v,
  missedAttacks: v.completedWars ? Math.max(0, v.expectedAttacks - v.attacks) : null,
  hitRate: v.attacks ? 100 * v.triples / v.attacks : null,
  averageStarsPerWar: v.completedWars ? v.attackStars / v.completedWars : null,
  averageStars: v.attacks ? v.attackStars / v.attacks : null,
  averageDestruction: v.attacks ? v.attackDestruction / v.attacks : null,
  concededTripleRate: v.defenses ? 100 * v.concededTriples / v.defenses : null,
  averageStarsConceded: v.defenses ? v.defenseStars / v.defenses : null,
  averageDestructionConceded: v.defenses ? v.defenseDestruction / v.defenses : null,
  completionPercent: v.expectedAttacks ? 100 * Math.min(v.attacks, v.expectedAttacks) / v.expectedAttacks : null,
})

/** The caller authorizes tags. Seasons come from group round identities, never
 * war end-months (a delayed round can cross a month boundary). A participant
 * must appear in a completed war lineup, including a lineup with zero attacks. */
export const queryRosterCwlPerformance = (tags: readonly string[], seasonCount: number, now: Date, options: { sinceSeason?: string; clanTags?: readonly string[] } = {}) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  // A family-scoped request already identifies the relevant groups. Starting
  // from every player's lifetime wars also expands years of opponents' groups
  // and defeats chunk/index pruning for an otherwise small calendar request.
  const rows = yield* (options.clanTags !== undefined ? sql<{ player_tag: string; season: string; war_id: string }>`
    WITH candidate_groups AS MATERIALIZED (
      SELECT DISTINCT groups.cwl_id, left(groups.season, 7) AS season, groups.rounds
      FROM cwl_group_clans membership JOIN cwl_groups groups ON groups.cwl_id = membership.cwl_id
      WHERE membership.clan_tag = ANY(${[...(options.clanTags ?? [])]}::text[])
        AND (${options.sinceSeason ?? null}::text IS NULL OR left(groups.season, 7) >= ${options.sinceSeason ?? null})
    ), round_tags AS MATERIALIZED (
      SELECT DISTINCT groups.season, tag.value AS war_tag
      FROM candidate_groups groups
      CROSS JOIN LATERAL jsonb_array_elements(groups.rounds) round(value)
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(round.value) = 'array' THEN round.value
          ELSE COALESCE(round.value->'warTags', '[]'::jsonb) END
      ) tag(value)
    ), roster_wars AS MATERIALIZED (
      SELECT history.player_tag, unnest(history.war_ids) AS war_id
      FROM player_war_history history WHERE history.player_tag = ANY(${[...tags]}::text[])
    )
    SELECT DISTINCT history.player_tag, groups.season, war.war_id::text
    FROM round_tags groups JOIN wars war ON war.war_tag = groups.war_tag
    JOIN roster_wars history ON history.war_id = war.war_id
    WHERE war.war_type = 'cwl' AND lower(war.state) IN ('warended', 'ended') AND war.end_time <= ${now}
      AND (war.clan_tag = ANY(${[...(options.clanTags ?? [])]}::text[]) OR war.opponent_tag = ANY(${[...(options.clanTags ?? [])]}::text[]))
    ORDER BY season DESC, war_id DESC
  ` : sql<{ player_tag: string; season: string; war_id: string }>`
    WITH selected_wars AS MATERIALIZED (
      SELECT DISTINCT history.player_tag, war.war_id, war.war_tag, war.clan_tag, war.opponent_tag
      FROM player_war_history history
      CROSS JOIN LATERAL unnest(history.war_ids) AS ids(war_id)
      JOIN wars war ON war.war_id = ids.war_id
      WHERE history.player_tag = ANY(${[...tags]}::text[])
        AND war.war_type = 'cwl' AND lower(war.state) IN ('warended', 'ended') AND war.end_time <= ${now}
        AND (${options.clanTags === undefined} OR war.clan_tag = ANY(${[...(options.clanTags ?? [])]}::text[])
          OR war.opponent_tag = ANY(${[...(options.clanTags ?? [])]}::text[]))
    ), relevant_clans AS (
      SELECT clan_tag FROM selected_wars UNION SELECT opponent_tag FROM selected_wars
    ), candidate_groups AS MATERIALIZED (
      SELECT DISTINCT groups.cwl_id, left(groups.season, 7) AS season, groups.rounds
      FROM relevant_clans clan
      JOIN cwl_group_clans membership ON membership.clan_tag = clan.clan_tag
      JOIN cwl_groups groups ON groups.cwl_id = membership.cwl_id
      WHERE (${options.sinceSeason ?? null}::text IS NULL OR left(groups.season, 7) >= ${options.sinceSeason ?? null})
    ), round_tags AS MATERIALIZED (
      SELECT DISTINCT groups.season, tag.value AS war_tag
      FROM candidate_groups groups
      CROSS JOIN LATERAL jsonb_array_elements(groups.rounds) round(value)
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(round.value) = 'array' THEN round.value
          ELSE COALESCE(round.value->'warTags', '[]'::jsonb) END
      ) tag(value)
    )
    SELECT DISTINCT war.player_tag, groups.season, war.war_id::text
    FROM selected_wars war JOIN round_tags groups ON groups.war_tag = war.war_tag
    ORDER BY season DESC, war_id DESC
  `).pipe(Effect.mapError(cause => new DatabaseFailure({ cause, message: "Unable to load participating CWL seasons" })))
  const byWar = new Map<string, typeof rows[number][]>()
  for (const row of rows) {
    const list = byWar.get(row.war_id) ?? []; list.push(row); byWar.set(row.war_id, list)
  }
  const seasons = new Map(tags.map(tag => [tag, new Map<string, Totals>()]))
  // Process newest seasons first. Verify lineups before counting a season, so a
  // stale index or a registered-but-benched player cannot displace a real one.
  for (const season of [...new Set(rows.map(row => row.season))].sort().reverse()) {
    const eligible = rows.filter(row => row.season === season && seasons.get(row.player_tag)!.size < seasonCount)
    if (!eligible.length) continue
    const wanted = new Set(eligible.map(row => row.player_tag))
    // Expand rounds only for clans referenced by these players, not the global
    // CWL corpus. Calendar filtering uses the CWL season, not war end-month.
    yield* forEachArchiveWar([...new Set(eligible.map(row => row.war_id))], (id, war) => Effect.sync(() => {
      if (war.type !== "cwl" || !["warended", "ended"].includes(war.state.toLowerCase())) return
      const facts = archiveAttackFacts(id, war)
      for (const row of byWar.get(id) ?? []) {
        if (row.season !== season || !wanted.has(row.player_tag)) continue
        // Filter the player's actual historical side, not their current clan
        // or merely the opponent. Playing against the family does not qualify.
        const side = [war.clan, war.opponent].find(side => side.members.some(member => member.tag === row.player_tag))
        if (!side || options.clanTags !== undefined && !options.clanTags.includes(side.tag)) continue
        const playerSeasons = seasons.get(row.player_tag)!
        const total = playerSeasons.get(season) ?? empty()
        total.completedWars++; total.expectedAttacks++ // CWL allows one attack per lineup.
        for (const fact of facts) {
          if (fact.attackerTag === row.player_tag) {
            total.attacks++; total.triples += fact.stars === 3 ? 1 : 0;
            total.attackStars += fact.stars; total.attackDestruction += fact.destructionPercentage
          }
          if (fact.defenderTag === row.player_tag) {
            total.defenses++; total.concededTriples += fact.stars === 3 ? 1 : 0;
            total.defenseStars += fact.stars; total.defenseDestruction += fact.destructionPercentage
          }
        }
        playerSeasons.set(season, total)
      }
    }))
  }
  return new Map(tags.map(tag => {
    const entries = [...seasons.get(tag)!.entries()].sort(([a], [b]) => b.localeCompare(a))
    const summary = empty()
    for (const [, total] of entries) for (const key of Object.keys(summary) as (keyof Totals)[]) summary[key] += total[key]
    return [tag, { requestedSeasons: seasonCount, observedSeasons: entries.length,
      coverage: "observed_completed_lineups", lateAttacks: null, lateAttackTimingAvailable: false,
      summary: present(summary), seasons: entries.map(([season, total]) => ({ season, ...present(total) })) }] as const
  }))
})
