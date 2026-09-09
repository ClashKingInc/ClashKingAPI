import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { publicTag } from "./public-war.js"
import { publicHistoryOptions, isoTimestamp } from "./public-player.js"
import { lookupStaticItem } from "./static-metadata.js"

const failure = (cause: unknown) => new DatabaseFailure({ cause, message: "Change history query failed" })
const types = ["", "troop_level", "super_troop_boost", "hero_level", "spell_level", "pet_level", "equipment_level", "townhall_level", "best_trophies", "best_builder_base_trophies", "exp_level", "war_preference", "name"]
const aliases: Record<string, readonly number[]> = {
  troops: [1, 2], heroes: [3], spells: [4], pets: [5], heroequipment: [6], town_hall_level: [7], bestversustrophies: [9],
}
export const playerChangeTypes = (raw: string | null) => Effect.try({ try: () => {
  const value = raw?.trim().toLowerCase().replaceAll("-", "_") ?? ""
  if (!value) throw new Error("Type is required")
  const alias = Object.hasOwn(aliases, value) ? aliases[value] : undefined
  if (alias) return alias
  const id = /^\d+$/u.test(value) ? Number(value) : types.findIndex((type) => type === value || type.replaceAll("_", "") === value)
  if (id < 1 || id > 12) throw new Error("Type must be a change type name or ID from 1 to 12")
  return [id]
}, catch: (cause) => new InvalidRequest({ message: cause instanceof Error ? cause.message : "Invalid type" }) })
const catalog: Record<number, readonly [string, number]> = { 1: ["troops", 4_000_000], 2: ["troops", 4_000_000], 3: ["heroes", 28_000_000], 4: ["spells", 26_000_000], 5: ["pets", 73_000_000], 6: ["equipment", 90_000_000] }
interface PlayerChangeRow { event_time: Date | string; townhall_level: number | null; change_type: number; item_id: number | null; previous_value: string; current_value: string }
export const playerChangeFromRow = (row: PlayerChangeRow) => Effect.try({ try: () => {
  const type = types[row.change_type]
  if (!type) throw new Error("Unknown stored change type")
  const mapping = catalog[row.change_type]
  const item = mapping && row.item_id !== null ? lookupStaticItem(mapping[0], mapping[1] + row.item_id) : undefined
  const value = (raw: string) => {
    if (row.change_type === 12) return raw
    if (row.change_type === 11) { if (raw === "0") return "out"; if (raw === "1") return "in"; throw new Error("Invalid stored war preference") }
    const result = Number(raw)
    if (!/^[+-]?\d+$/u.test(raw) || !Number.isSafeInteger(result)) throw new Error("Invalid stored numeric change")
    return result
  }
  return { time: isoTimestamp(row.event_time), townhall_level: row.townhall_level, type,
    ...(row.item_id !== null ? { item: { name: item && (row.change_type !== 2 || item.isSuperTroop) ? item.name : "Unknown", id: row.item_id } } : {}),
    ...(row.change_type === 2 ? {} : { previous: value(row.previous_value), current: value(row.current_value) }),
  }
}, catch: failure })
export const queryPlayerChanges = (rawTag: string, query: URLSearchParams) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), changeTypes = yield* playerChangeTypes(query.get("type"))
  const options = yield* publicHistoryOptions(query)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<PlayerChangeRow>`SELECT event_time, townhall_level, change_type, item_id, previous_value, current_value
    FROM player_change_history WHERE player_tag = ${tag} AND change_type = ANY(${changeTypes}::smallint[])
      AND event_time >= ${options.start} AND event_time <= ${options.end} ORDER BY event_time DESC LIMIT ${options.limit}`.pipe(Effect.mapError(failure))
  return { items: yield* Effect.forEach(rows, playerChangeFromRow) }
})
export const queryClanChanges = (rawTag: string, query: URLSearchParams) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag)
  const rawType = query.get("type") ?? ""
  if (!["", "description", "clanLevel"].includes(rawType)) return yield* new InvalidRequest({ message: "Invalid type" })
  const type = rawType === "clanLevel" ? "clan_level" : rawType
  const options = yield* publicHistoryOptions(query), sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ event_time: Date | string; change_type: string; previous_value: unknown; current_value: unknown }>`
    SELECT event_time, change_type, previous_value, current_value FROM clan_change_history WHERE clan_tag = ${tag}
      AND change_type IN ('description', 'clan_level') AND (${type} = '' OR change_type = ${type})
      AND event_time >= ${options.start} AND event_time <= ${options.end} ORDER BY event_time DESC LIMIT ${options.limit}`.pipe(Effect.mapError(failure))
  return { items: yield* Effect.forEach(rows, (row) => Effect.gen(function* () {
    const previous = yield* Schema.decodeUnknownEffect(Schema.Json)(row.previous_value).pipe(Effect.mapError(failure))
    const current = yield* Schema.decodeUnknownEffect(Schema.Json)(row.current_value).pipe(Effect.mapError(failure))
    return { time: isoTimestamp(row.event_time), type: row.change_type === "clan_level" ? "clanLevel" : row.change_type, previous, current }
  })) }
})
export const queryClanRecords = (rawTag: string) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ clan_points: number; clan_points_at: Date | string | null; war_win_streak: number; war_win_streak_at: Date | string | null }>`
    SELECT clan_points, clan_points_at, war_win_streak, war_win_streak_at FROM clan_records WHERE tag = ${tag}`.pipe(Effect.mapError(failure))
  const row = rows[0]
  return { ...(row?.clan_points_at ? { clanPoints: { value: row.clan_points, time: isoTimestamp(row.clan_points_at) } } : {}),
    ...(row?.war_win_streak_at ? { warWinStreak: { value: row.war_win_streak, time: isoTimestamp(row.war_win_streak_at) } } : {}) }
})
