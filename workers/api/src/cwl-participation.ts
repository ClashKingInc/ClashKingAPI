import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, InvalidRequest } from "./errors.js"

export const parseParticipationQuery = (query: URLSearchParams) => {
  for (const key of query.keys()) if (key !== "season" || query.getAll(key).length !== 1) throw new InvalidRequest({ message: `Unsupported CWL parameter: ${key}` })
  const season = query.get("season")
  if (season !== null && !/^\d{4}-(0[1-9]|1[0-2])$/u.test(season)) throw new InvalidRequest({ message: "season must use YYYY-MM" })
  return season
}
export interface CwlBucketRow {
  season: string; cwl_league_id: number; war_size: number; group_count: number;
  clan_count: number; registered_player_count: number; townhall_counts: { level: number; count: number }[];
  same_th_hitrates: null | { level: number; attacks: number; three_stars: number }[];
  finalized_wars: number; archived_wars: number; refreshed_at: Date | string;
}
export interface CwlHistoryRow { season: string; clan_count: number; registered_player_count: number; group_count: number }
export const participationResponse = (rows: readonly CwlBucketRow[], requested: string | null, historyRows: readonly CwlHistoryRow[] = []) => ({
  season: rows[0]?.season ?? requested,
  availableSeasons: historyRows.map(row => row.season),
  history: historyRows.map(row => ({ season: row.season, clanCount: Number(row.clan_count),
    registeredPlayerCount: Number(row.registered_player_count), groupCount: Number(row.group_count) })),
  clanCount: rows.reduce((n, row) => n + Number(row.clan_count), 0),
  registeredPlayerCount: rows.reduce((n, row) => n + Number(row.registered_player_count), 0),
  groupCount: rows.reduce((n, row) => n + Number(row.group_count), 0),
  items: rows.map(row => ({ leagueId: Number(row.cwl_league_id), warSize: Number(row.war_size),
    clanCount: Number(row.clan_count), registeredPlayerCount: Number(row.registered_player_count), groupCount: Number(row.group_count),
    townHallDistribution: row.townhall_counts,
    sameTownHallHitRates: row.same_th_hitrates?.map(hit => ({ level: Number(hit.level), attacks: Number(hit.attacks),
      threeStarAttacks: Number(hit.three_stars), threeStarRate: Number(hit.attacks) > 0 ? Number(hit.three_stars) / Number(hit.attacks) : null })) ?? null,
    finalizedWars: Number(row.finalized_wars), archivedWars: Number(row.archived_wars), calculatedAt: new Date(row.refreshed_at).toISOString(),
  })),
})
export const queryCwlParticipation = (query: URLSearchParams) => Effect.gen(function* () {
  const season = yield* Effect.try({ try: () => parseParticipationQuery(query),
    catch: cause => cause instanceof InvalidRequest ? cause : new InvalidRequest({ message: "Invalid CWL query" }) })
  const sql = yield* SqlClient.SqlClient
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const history = yield* sql.unsafe<CwlHistoryRow>(`SELECT season,sum(clan_count)::bigint clan_count,
      sum(registered_player_count)::bigint registered_player_count,sum(group_count)::bigint group_count
      FROM cwl_participation GROUP BY season ORDER BY season DESC`)
    const selected = season ?? history[0]?.season ?? null
    const rows = selected === null ? [] : yield* sql.unsafe<CwlBucketRow>(`SELECT * FROM cwl_participation
      WHERE season=$1 ORDER BY cwl_league_id DESC,war_size`, [selected])
    return participationResponse(rows, season, history)
  }))
}).pipe(Effect.mapError(cause => cause instanceof InvalidRequest ? cause : new DatabaseFailure({ cause, message: "CWL participation could not be read" })))
