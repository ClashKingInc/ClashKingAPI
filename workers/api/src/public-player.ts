import { PlayerBattlelogHistoryResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { correctTag } from "./home.js"
import { publicTag } from "./public-war.js"
import { parseHistoryTime } from "./public-time.js"
export { parseHistoryTime } from "./public-time.js"

const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "Player history query failed" })
export const isoTimestamp = (value: Date | string) => new Date(value).toISOString()
export const publicHistoryOptions = (query: URLSearchParams, defaultLimit = 50) => Effect.gen(function* () {
  const limit = query.has("limit") ? Number(query.get("limit")) : defaultLimit
  if (!Number.isInteger(limit) || limit < 1) return yield* new InvalidRequest({ message: "Invalid limit" })
  const start = yield* parseHistoryTime(query.get("time[after]"), new Date(0))
  const end = yield* parseHistoryTime(query.get("time[before]"), new Date(9_999_999_999_000))
  if (start > end) return yield* new InvalidRequest({ message: "Invalid time range" })
  return { start, end, limit: Math.min(500, limit) }
})

interface TimerRow {
  readonly event_type: string; readonly event_key: string; readonly expires_at: Date | string;
  readonly source_clan_tag: string | null; readonly opponent_tag: string | null; readonly war_type: string | null; readonly war_tag: string | null;
}
export const playerTimerFromRow = (row: TimerRow) => {
  let type: "war" | "cwl" | "capital"
  let rawClans: string[]
  if (row.event_type === "war") {
    if (row.source_clan_tag == null || row.opponent_tag == null) return undefined
    type = row.war_type?.toLowerCase() === "cwl" ? "cwl" : "war"
    rawClans = [row.source_clan_tag, row.opponent_tag]
  } else if (row.event_type === "raid" || row.event_type === "capital") {
    type = "capital"
    rawClans = [row.event_key]
  } else return undefined
  const clans = [...new Set(rawClans.map(correctTag).filter((tag) => tag && tag !== "#"))]
  if (!clans.length) return undefined
  return { type, expiresAt: isoTimestamp(row.expires_at), clans, ...(type === "cwl" && row.war_tag ? { warTag: correctTag(row.war_tag) } : {}) }
}
export const queryPlayerTimers = (rawTag: string) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<TimerRow>`SELECT timer.event_type, timer.event_key, timer.expires_at,
      schedule.source_clan_tag, schedule.opponent_tag, schedule.war_type, schedule.war_tag
    FROM player_timers timer LEFT JOIN war_schedule schedule
      ON timer.event_type = 'war' AND schedule.schedule_key = timer.event_key
    WHERE timer.player_tag = ${tag} AND timer.expires_at > now()
    ORDER BY timer.expires_at, timer.event_type, timer.event_key`.pipe(Effect.mapError(databaseFailure))
  return { items: rows.flatMap((row) => { const timer = playerTimerFromRow(row); return timer ? [timer] : [] }) }
})

export const queryPlayerBattlelog = (rawTag: string, query: URLSearchParams, now = new Date()) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag)
  const days = query.has("days") ? Number(query.get("days")) : 30
  if (!Number.isInteger(days) || days < 1) return yield* new InvalidRequest({ message: "Invalid days" })
  let start = yield* parseHistoryTime(query.get("start"), new Date(now.getTime() - Math.min(365, days) * 86_400_000))
  const end = yield* parseHistoryTime(query.get("end"), now)
  if (start > end) return yield* new InvalidRequest({ message: "Start must be before end" })
  start = new Date(Math.max(start.getTime(), end.getTime() - 365 * 86_400_000))
  const rawAttack = query.get("attack")?.trim()
  const attack = !rawAttack ? null : ["1", "t", "T", "TRUE", "true", "True"].includes(rawAttack) ? true
    : ["0", "f", "F", "FALSE", "false", "False"].includes(rawAttack) ? false : undefined
  if (attack === undefined) return yield* new InvalidRequest({ message: "Invalid attack boolean" })
  const rawLimit = Number(query.get("limit") ?? 100)
  const limit = Math.min(500, Math.max(1, Number.isInteger(rawLimit) ? rawLimit : 100))
  const type = query.get("type") ?? ""
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ readonly timestamp: Date | string } & Record<string, unknown>>`
    SELECT battle_id::text, player_tag, player_name, player_th AS player_townhall, opponent_tag,
      opponent_name, opponent_th AS opponent_townhall, battle_type, attack, stars, destruction_percentage,
      gold, elixir, dark_elixir, "timestamp", army_items, army_counts, duration, army_share_code
    FROM battlelogs WHERE player_tag = ${tag} AND "timestamp" >= ${start} AND "timestamp" <= ${end}
      AND (${type} = '' OR battle_type = ${type}) AND (${attack}::boolean IS NULL OR attack = ${attack}::boolean)
    ORDER BY "timestamp" DESC LIMIT ${limit}`.pipe(Effect.mapError(databaseFailure))
  return yield* Schema.decodeUnknownEffect(PlayerBattlelogHistoryResponse)({
    player_tag: tag, items: rows.map((row) => ({ ...row, timestamp: isoTimestamp(row.timestamp) })), count: rows.length,
    limit, time: { start: start.toISOString(), end: end.toISOString() },
  }).pipe(Effect.mapError(databaseFailure))
})
