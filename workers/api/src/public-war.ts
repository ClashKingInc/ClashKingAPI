import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, InvalidRequest, NotFound } from "./errors.js"
import { correctTag } from "./home.js"
import { loadArchiveWars } from "./war-archive.js"
import { clashTime, officialArchiveWar, playerWarHistoryItem } from "./war-archive-model.js"
import { parseHistoryTime } from "./public-time.js"

export const publicTag = (raw: string) => {
  const tag = correctTag(raw)
  return tag && tag !== "#" ? Effect.succeed(tag) : Effect.fail(new InvalidRequest({ message: "Invalid player or clan tag" }))
}
const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "War history query failed" })
export const historyOptions = (query: URLSearchParams, defaultLimit: number) => Effect.gen(function* () {
  const type = query.get("type")?.trim().toLowerCase() ?? ""
  if (type && !["cwl", "random", "friendly"].includes(type)) return yield* new InvalidRequest({ message: "Invalid type" })
  const limit = query.has("limit") ? Number(query.get("limit")) : defaultLimit
  if (!Number.isInteger(limit) || limit < 1) return yield* new InvalidRequest({ message: "Invalid limit" })
  const start = yield* parseHistoryTime(query.get("time[after]"), new Date(0))
  const end = yield* parseHistoryTime(query.get("time[before]"), new Date(9_999_999_999_000))
  if (start > end) return yield* new InvalidRequest({ message: "Invalid time range" })
  return { start, end, type, types: type ? [type] : ["random", "friendly", "cwl"], limit: Math.min(500, limit) }
})

export const queryBasicWar = (rawTag: string) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{
    source_clan_tag: string; opponent_tag: string; prep_time: Date | string; end_time: Date | string;
    war_type: string; war_tag: string | null; source_public: boolean | null; opponent_public: boolean | null;
  }>`SELECT schedule.source_clan_tag, schedule.opponent_tag, schedule.prep_time, schedule.end_time,
       schedule.war_type, schedule.war_tag, source.public_war_log AS source_public, opponent.public_war_log AS opponent_public
     FROM war_schedule schedule LEFT JOIN basic_clan source ON source.tag = schedule.source_clan_tag
     LEFT JOIN basic_clan opponent ON opponent.tag = schedule.opponent_tag
     WHERE schedule.source_clan_tag = ${tag} OR schedule.opponent_tag = ${tag}
     ORDER BY schedule.end_time DESC LIMIT 1`.pipe(Effect.mapError(databaseFailure))
  const row = rows[0]
  if (!row) return null
  const source = { tag: row.source_clan_tag, publicWarLog: row.source_public }
  const opponent = { tag: row.opponent_tag, publicWarLog: row.opponent_public }
  return { clan: tag === row.opponent_tag ? opponent : source, opponent: tag === row.opponent_tag ? source : opponent,
    preparationStartTime: clashTime(row.prep_time), endTime: clashTime(row.end_time), type: row.war_type,
    ...(row.war_tag ? { warTag: correctTag(row.war_tag) } : {}) }
})

export const parsePreviousWarTime = (rawTime: string) => Effect.gen(function* () {
  if (!/^\d{8}T\d{6}\.\d{3}Z$/u.test(rawTime)) return yield* new InvalidRequest({ message: "Invalid endtime format" })
  const iso = rawTime.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/u, "$1-$2-$3T$4:$5:$6")
  const end = new Date(iso)
  if (!Number.isFinite(end.getTime()) || clashTime(end) !== rawTime) return yield* new InvalidRequest({ message: "Invalid endtime format" })
  return end
})
export const queryPreviousWar = (rawTag: string, rawTime: string) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag)
  const end = yield* parsePreviousWarTime(rawTime)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ war_id: string }>`SELECT war_id::text FROM wars
    WHERE (clan_tag = ${tag} OR opponent_tag = ${tag})
      AND end_time >= ${new Date(end.getTime() - 600_000)} AND end_time <= ${new Date(end.getTime() + 600_000)}
      AND war_type = ANY(${["random", "friendly", "cwl"]}::text[])
    ORDER BY abs(extract(epoch FROM end_time)::double precision - ${end.getTime() / 1000}) LIMIT 1`.pipe(Effect.mapError(databaseFailure))
  const id = rows[0]?.war_id
  if (!id) return yield* new NotFound({ message: "War not found" })
  const war = (yield* loadArchiveWars([id])).get(id)
  if (!war) return yield* new NotFound({ message: "War not found" })
  return officialArchiveWar(war, tag)
})

export const queryClanWars = (rawTag: string, query: URLSearchParams, warlog: boolean) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag)
  const options = yield* historyOptions(query, warlog ? 50 : 15)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ war_id: string }>`SELECT war_id::text FROM wars
    WHERE (clan_tag = ${tag} OR opponent_tag = ${tag}) AND end_time >= ${options.start} AND end_time <= ${options.end}
      AND war_type = ANY(${options.types}::text[]) ORDER BY end_time DESC LIMIT ${options.limit}`.pipe(Effect.mapError(databaseFailure))
  const archives = yield* loadArchiveWars(rows.map((row) => row.war_id))
  const wars = rows.flatMap(({ war_id }) => {
    const war = archives.get(war_id)
    return war ? [{ ...officialArchiveWar(war, tag), type: war.type }] : []
  })
  if (!warlog) return { items: wars.map(({ type: _type, ...war }) => war) }
  return { items: wars.filter((war) => war.state === "warEnded").map((war) => {
    const { members: _members, ...clan } = war.clan
    const { members: _opponentMembers, ...opponent } = war.opponent
    const difference = clan.stars - opponent.stars || clan.destructionPercentage - opponent.destructionPercentage
    return { result: difference > 0 ? "win" : difference < 0 ? "lose" : "tie", type: war.type,
      endTime: war.endTime, teamSize: war.teamSize, attacksPerMember: war.attacksPerMember ?? 1, clan, opponent }
  }) }
})

export const queryPlayerWarStats = (rawTag: string, query: URLSearchParams) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag)
  const options = yield* historyOptions(query, 15)
  const sql = yield* SqlClient.SqlClient
  const filtered = Boolean(options.type || query.get("time[after]")?.trim() || query.get("time[before]")?.trim())
  const rows = yield* (filtered
    ? sql<{ war_id: string }>`SELECT selected.war_id::text FROM player_war_history history
      CROSS JOIN LATERAL unnest(history.war_ids) WITH ORDINALITY AS selected(war_id, position)
      JOIN wars war ON war.war_id = selected.war_id
      WHERE history.player_tag = ${tag} AND war.end_time >= ${options.start} AND war.end_time <= ${options.end}
        AND (${options.type} = '' OR war.war_type = ${options.type}) ORDER BY selected.position DESC LIMIT ${options.limit}`
    : sql<{ war_id: string }>`SELECT selected.war_id::text FROM unnest((
        SELECT war_ids[GREATEST(cardinality(war_ids) - ${options.limit} + 1, 1):cardinality(war_ids)]
        FROM player_war_history WHERE player_tag = ${tag}
      )) WITH ORDINALITY AS selected(war_id, position) ORDER BY selected.position DESC`
  ).pipe(Effect.mapError(databaseFailure))
  const wars = yield* loadArchiveWars(rows.map((row) => row.war_id))
  return { items: rows.flatMap(({ war_id }) => {
    const war = wars.get(war_id)
    const item = war && playerWarHistoryItem(tag, war_id, war)
    return item ? [item] : []
  }) }
})
