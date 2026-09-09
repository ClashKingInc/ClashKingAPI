import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure } from "./errors.js"
import { isoTimestamp, publicHistoryOptions } from "./public-player.js"
import { publicTag } from "./public-war.js"

export interface JoinLeaveRow {
  readonly time: Date | string; readonly type: string; readonly clan_tag: string; readonly player_tag: string;
  readonly player_name: string | null; readonly townhall_level: number; readonly clan_name: string | null;
}
const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "Join and leave history query failed" })
const ascending = (a: JoinLeaveRow, b: JoinLeaveRow) => new Date(a.time).getTime() - new Date(b.time).getTime() ||
  (a.type === b.type ? a.clan_tag.localeCompare(b.clan_tag) : a.type === "leave" ? -1 : 1)

export const correctedJoinLeaveEvents = (rows: readonly JoinLeaveRow[]) => {
  const remaining = [...rows].sort(ascending)
  const corrected: JoinLeaveRow[] = []
  while (remaining.length) {
    const event = remaining.shift()
    if (!event) break
    corrected.push(event)
    if (event.type !== "join") continue
    const leaveIndex = remaining.findIndex((candidate) => candidate.type === "leave" && candidate.player_tag === event.player_tag && candidate.clan_tag === event.clan_tag)
    if (leaveIndex < 0) continue
    const leave = remaining.splice(leaveIndex, 1)[0]
    if (leave) corrected.push({ ...leave, time: remaining.find((candidate) => candidate.type === "join")?.time ?? leave.time })
  }
  corrected.sort(ascending)
  return corrected
}

export const joinLeaveClanTotals = (rows: readonly JoinLeaveRow[], now = new Date()) => {
  const corrected = correctedJoinLeaveEvents(rows)
  const totals = new Map<string, { clan: { name: string; tag: string }; visits: number; minutes: number }>()
  const get = (event: JoinLeaveRow) => {
    let total = totals.get(event.clan_tag)
    if (!total) { total = { clan: { tag: event.clan_tag, name: event.clan_name ?? "" }, visits: 0, minutes: 0 }; totals.set(event.clan_tag, total) }
    if (!total.clan.name) total.clan.name = event.clan_name ?? ""
    return total
  }
  let active: JoinLeaveRow | undefined
  const interval = (event: JoinLeaveRow, end: Date | string) => {
    const minutes = Math.trunc((new Date(end).getTime() - new Date(event.time).getTime()) / 60_000)
    if (event.clan_tag && minutes > 0) get(event).minutes += minutes
  }
  for (const event of corrected) {
    if (event.type === "join") {
      if (event.clan_tag) get(event).visits++
      if (active) interval(active, event.time)
      active = event
    } else if (event.type === "leave" && active?.clan_tag === event.clan_tag) {
      interval(active, event.time)
      active = undefined
    }
  }
  if (active) interval(active, now)
  return [...totals.values()].sort((a, b) => b.minutes - a.minutes || a.clan.tag.localeCompare(b.clan.tag))
}

export const queryJoinLeave = (rawTag: string, query: URLSearchParams, scope: "player" | "clan", totals = false) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag)
  const { start, end, limit } = yield* publicHistoryOptions(totals ? new URLSearchParams() : query)
  const sql = yield* SqlClient.SqlClient
  const column = scope === "player" ? sql`jl.player_tag` : sql`jl.clan_tag`
  const rows = yield* sql<JoinLeaveRow>`SELECT jl."time", jl."type", jl.clan_tag, jl.player_tag, jl.player_name, jl.townhall_level, bc.name AS clan_name
    FROM join_leave_history jl LEFT JOIN basic_clan bc ON bc.tag = jl.clan_tag
    WHERE ${column} = ${tag} AND jl."time" >= ${start} AND jl."time" <= ${end}
    ORDER BY jl."time" DESC, jl.player_tag ASC, jl.clan_tag ASC, jl."type" ASC ${totals ? sql`` : sql`LIMIT ${limit}`}`.pipe(Effect.mapError(databaseFailure))
  if (totals) return { items: joinLeaveClanTotals(rows) }
  const counts = yield* sql<{ available: string; unique_players: string }>`SELECT count(*)::text AS available, count(DISTINCT jl.player_tag)::text AS unique_players
    FROM join_leave_history jl WHERE ${column} = ${tag} AND jl."time" >= ${new Date(0)} AND jl."time" <= ${new Date(9_999_999_999_000)}`.pipe(Effect.mapError(databaseFailure))
  return { items: rows.map((row) => ({
    time: isoTimestamp(row.time), type: row.type, tag: row.player_tag,
    ...(row.player_name ? { name: row.player_name } : {}), ...(row.townhall_level ? { townHallLevel: row.townhall_level } : {}),
    ...(scope === "player" ? { clan: { name: row.clan_name ?? "", tag: row.clan_tag } } : {}),
  })), available: Number(counts[0]?.available ?? 0), ...(scope === "clan" ? { uniquePlayers: Number(counts[0]?.unique_players ?? 0) } : {}) }
})
