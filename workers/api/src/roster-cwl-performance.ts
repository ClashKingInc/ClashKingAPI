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
export const queryRosterCwlPerformance = (tags: readonly string[], seasonCount: number, now: Date) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ player_tag: string; season: string; war_id: string }>`
    SELECT DISTINCT history.player_tag, left(groups.season, 7) AS season, war.war_id::text
    FROM player_war_history history
    CROSS JOIN LATERAL unnest(history.war_ids) AS ids(war_id)
    JOIN wars war ON war.war_id = ids.war_id
    JOIN cwl_groups groups ON EXISTS (
      SELECT 1 FROM jsonb_array_elements(groups.rounds) round(value)
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(round.value) = 'array' THEN round.value
          ELSE COALESCE(round.value->'warTags', '[]'::jsonb) END
      ) tag(value) WHERE tag.value = war.war_tag
    )
    WHERE history.player_tag = ANY(${[...tags]}::text[])
      AND war.war_type = 'cwl' AND lower(war.state) IN ('warended', 'ended') AND war.end_time <= ${now}
    ORDER BY season DESC, war_id DESC
  `.pipe(Effect.mapError(cause => new DatabaseFailure({ cause, message: "Unable to load participating CWL seasons" })))
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
    yield* forEachArchiveWar([...new Set(eligible.map(row => row.war_id))], (id, war) => Effect.sync(() => {
      if (war.type !== "cwl" || !["warended", "ended"].includes(war.state.toLowerCase())) return
      const facts = archiveAttackFacts(id, war)
      for (const row of byWar.get(id) ?? []) {
        if (row.season !== season || !wanted.has(row.player_tag)) continue
        if (![...war.clan.members, ...war.opponent.members].some(member => member.tag === row.player_tag)) continue
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
