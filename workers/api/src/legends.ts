import {
  LegendDaySummariesEndpoint,
  LegendDaySummariesResponse,
  LegendHistoricalRankRequest,
  LegendHistoricalRanksEndpoint,
  LegendHistoricalTrophyBucketsEndpoint,
  LegendRanksEndpoint,
  LegendRanksResponse,
  LegendTrophyBucketsResponse,
} from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import locations from "./data/search-locations.json"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { publicTag } from "./public-war.js"
import { readBoundedJson } from "./request-body.js"
import { attackTrophies, legendDefenseTrophies } from "./league-analytics.js"

interface RankRow {
  readonly tag: string
  readonly name: string
  readonly trophies: number
  readonly global_rank: number
  readonly clan_tag: string | null
  readonly clan_name: string | null
  readonly location_id: number | null
}
interface BucketRow { readonly minimum_trophies: number; readonly player_count: number }
interface DayBattleRow {
  readonly player_tag: string
  readonly battle_time: Date | string
  readonly direction: 1 | 2
  readonly stars: number
  readonly destruction_percentage: number | string
}

const failure = (cause: unknown) => new DatabaseFailure({ cause, message: "Legend ranking query failed" })
const decode = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(
  Effect.mapError(() => new InvalidRequest({ message: "Invalid Legend ranking request" })),
)
const date = (raw: string) => Effect.try({
  try: () => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(raw) || new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) !== raw) throw new Error("invalid")
    return raw
  },
  catch: () => new InvalidRequest({ message: "Invalid Legend day" }),
})
const uniqueTags = (tags: readonly string[]) => Effect.all(tags.map(publicTag)).pipe(
  Effect.map((values) => [...new Set(values)]),
)
const rankValue = (row: RankRow) => {
  const location = row.location_id === null ? undefined : locations.find((entry) => entry.id === row.location_id)
  return {
    tag: row.tag,
    name: row.name,
    trophies: Number(row.trophies),
    globalRank: Number(row.global_rank),
    ...(row.clan_tag === null || row.clan_name === null ? {} : { clan: { tag: row.clan_tag, name: row.clan_name } }),
    ...(location === undefined ? {} : { location }),
  }
}

const currentRanks = (raw: unknown) => Effect.gen(function* () {
  const body = yield* decode(LegendRanksEndpoint.body, raw)
  const tags = yield* uniqueTags(body.tags)
  if (tags.length === 0) return { items: [] }
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<RankRow>(`SELECT ranking.tag,ranking.name,ranking.trophies,ranking.global_rank,
    clan.tag clan_tag,clan.name clan_name,player.location_id
    FROM legend_rankings_current ranking
    LEFT JOIN basic_player player ON player.tag=ranking.tag
    LEFT JOIN basic_clan clan ON clan.tag=ranking.clan_tag
    WHERE ranking.tag=ANY($1::text[]) ORDER BY array_position($1::text[],ranking.tag)`, [tags]).pipe(Effect.mapError(failure))
  return { items: rows.map(rankValue) }
})

const historicalRanks = (raw: unknown) => Effect.gen(function* () {
  const body = yield* decode(LegendHistoricalRankRequest, raw)
  const day = yield* date(body.day)
  const tags = yield* uniqueTags(body.tags)
  if (tags.length === 0) return { items: [] }
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<RankRow>(`SELECT history.tag,player.name,history.trophies,history.global_rank,
    clan.tag clan_tag,clan.name clan_name,player.location_id
    FROM leaderboard_history_player_home history
    JOIN basic_player player ON player.tag=history.tag
    LEFT JOIN basic_clan clan ON clan.tag=player.clan_tag
    WHERE history.day=$1::date AND history.tag=ANY($2::text[])
    ORDER BY array_position($2::text[],history.tag)`, [day, tags]).pipe(Effect.mapError(failure))
  return { items: rows.map(rankValue) }
})

export const legendDaySummaries = (raw: unknown, now = new Date()) => Effect.gen(function* () {
  const body = yield* decode(LegendDaySummariesEndpoint.body, raw)
  const requestedDay = yield* date(body.day)
  const tags = yield* uniqueTags(body.tags)
  if (tags.length === 0) return { items: [] }
  const start = new Date(`${requestedDay}T05:10:00.000Z`)
  const dayMilliseconds = 86_400_000
  const end = new Date(start.valueOf() + dayMilliseconds)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<DayBattleRow>(`SELECT player_tag,battle_time,direction,stars,destruction_percentage
    FROM battles_ranked WHERE player_tag=ANY($1::text[]) AND battle_mode=2
    AND battle_time >= $2 AND battle_time < $3 ORDER BY array_position($1::text[],player_tag),battle_time,direction`,
  [tags, new Date(start.valueOf() - 2 * dayMilliseconds), end]).pipe(Effect.mapError(failure))
  const items = tags.map((tag) => {
    const playerRows = rows.filter((row) => row.player_tag === tag)
    const selected = playerRows.filter((row) => new Date(row.battle_time) >= start)
    const attacks = selected.filter((row) => row.direction === 1)
    const realDefenses = selected.filter((row) => row.direction === 2)
    const attackTotal = attacks.reduce((sum, row) => sum + attackTrophies(Number(row.stars), Number(row.destruction_percentage)), 0)
    let defenseTotal = realDefenses.reduce((sum, row) => sum + legendDefenseTrophies(Number(row.stars), Number(row.destruction_percentage)), 0)
    let defenseCount = realDefenses.length
    if (now >= end && defenseCount < 8) {
      const previous = playerRows.filter((row) => row.direction === 2 && new Date(row.battle_time) < start)
      if (previous.length > 0) {
        const automatic = Math.floor(previous.reduce((sum, row) => sum
          + legendDefenseTrophies(Number(row.stars), Number(row.destruction_percentage)), 0) / previous.length)
        defenseTotal += automatic * (8 - defenseCount)
        defenseCount = 8
      }
    }
    return { tag, attackTrophies: attackTotal, defenseTrophies: defenseTotal, netTrophies: attackTotal + defenseTotal,
      attacks: attacks.length, defenses: defenseCount }
  })
  return { items }
})

const buckets = (historyDay?: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = historyDay === undefined
    ? yield* sql.unsafe<BucketRow>(`SELECT floor(trophies/100.0)::integer*100 minimum_trophies,count(*)::integer player_count
      FROM legend_rankings_current GROUP BY 1 ORDER BY 1`, []).pipe(Effect.mapError(failure))
    : yield* sql.unsafe<BucketRow>(`SELECT floor(trophies/100.0)::integer*100 minimum_trophies,count(*)::integer player_count
      FROM leaderboard_history_player_home WHERE day=$1::date GROUP BY 1 ORDER BY 1`, [yield* date(historyDay)]).pipe(Effect.mapError(failure))
  return { items: rows.map((row) => ({ minimumTrophies: Number(row.minimum_trophies), maximumTrophies: Number(row.minimum_trophies) + 99, playerCount: Number(row.player_count) })) }
})

const response = <A>(schema: Schema.Codec<A, unknown, never, never>, value: A) => Schema.encodeUnknownEffect(schema)(value).pipe(
  Effect.map((body) => Response.json(body)),
  Effect.mapError(failure),
)

export const dispatchLegends = (request: Request) => Effect.gen(function* () {
  const url = new URL(request.url)
  if (request.method === "POST" && url.pathname === LegendRanksEndpoint.path) {
    return yield* response(LegendRanksResponse, yield* currentRanks(yield* readBoundedJson(request)))
  }
  if (request.method === "POST" && url.pathname === LegendHistoricalRanksEndpoint.path) {
    return yield* response(LegendRanksResponse, yield* historicalRanks(yield* readBoundedJson(request)))
  }
  if (request.method === "POST" && url.pathname === LegendDaySummariesEndpoint.path) {
    return yield* response(LegendDaySummariesResponse, yield* legendDaySummaries(yield* readBoundedJson(request)))
  }
  if (request.method === "GET" && url.pathname === "/v2/legends/trophy-buckets") {
    if (url.search !== "") return yield* new InvalidRequest({ message: "Legend trophy buckets do not accept query parameters" })
    return yield* response(LegendTrophyBucketsResponse, yield* buckets())
  }
  const match = /^\/v2\/legends\/trophy-buckets\/([^/]+)$/u.exec(url.pathname)
  if (request.method === "GET" && match !== null) {
    if (url.search !== "") return yield* new InvalidRequest({ message: "Legend trophy buckets do not accept query parameters" })
    return yield* response(LegendTrophyBucketsResponse, yield* buckets(decodeURIComponent(match[1]!)))
  }
  return undefined
})

export const legendRuntimeRoutes = [
  { method: "POST", path: LegendRanksEndpoint.path },
  { method: "POST", path: LegendHistoricalRanksEndpoint.path },
  { method: "POST", path: LegendDaySummariesEndpoint.path },
  { method: "GET", path: LegendHistoricalTrophyBucketsEndpoint.path },
  { method: "GET", path: "/v2/legends/trophy-buckets" },
] as const
