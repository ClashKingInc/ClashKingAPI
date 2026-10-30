import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, Forbidden, InvalidRequest, Unauthenticated } from "./errors.js"
import { legendSeasonFinish } from "./legend-season.js"

/** Bot-only, bounded summaries. Snapshot dates are part of the response: a
 * retained rank snapshot must never be presented as today's live ranking. */
export const dispatchBotLegendStats = (request: Request) => Effect.gen(function* () {
  const url = new URL(request.url)
  if (url.pathname !== "/v2/bot/legends/stats") return undefined
  yield* (yield* AuthIdentity).requireBot(request)
  const type = url.searchParams.get("type") ?? "cutoffs"
  const rawLimit = url.searchParams.get("limit") ?? "50"
  if (request.method !== "GET" || !["cutoffs", "winners", "streaks"].includes(type)
    || !/^[1-9][0-9]?$/u.test(rawLimit) || Number(rawLimit) > 50
    || [...url.searchParams.keys()].some(key => !["type", "limit"].includes(key))
    || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1))
    return yield* new InvalidRequest({ message: "Invalid Legend statistics request" })
  const sql = yield* SqlClient.SqlClient
  if (type === "streaks") {
    const rows = yield* sql<{ tag: string; name: string; streak: number; observedSince: string; lastAttackAt: string; resetObserved: boolean }>`
      SELECT state.player_tag tag, coalesce(player.name, state.player_tag) name,
             state.current_streak::integer streak,
             state.observed_since::text "observedSince", state.last_attack_at::text "lastAttackAt",
             (state.last_non_triple_at IS NOT NULL) "resetObserved"
      FROM legend_attack_streaks state
      LEFT JOIN basic_player player ON player.tag=state.player_tag
      WHERE state.current_streak > 0
      ORDER BY state.current_streak DESC, state.last_attack_at DESC, state.player_tag
      LIMIT ${Number(rawLimit)}`
    return Response.json({ items: rows })
  }
  if (type === "cutoffs") {
    const latest = yield* sql<{ snapshot_day: string | null }>`SELECT max(day)::text AS snapshot_day FROM legend_rankings_history`
    const day = latest[0]?.snapshot_day ?? null
    if (!day) return Response.json({ day: null, items: [] })
    const rows = yield* sql<{ rank: number; trophies: number }>`SELECT global_rank rank,trophies
      FROM legend_rankings_history WHERE day=${day}::date
      AND global_rank=ANY(ARRAY[1,5,25,50,100,200,500,1000,2500,5000,10000,25000,50000,100000,250000])
      ORDER BY global_rank`
    return Response.json({ day, items: rows })
  }
  const rows = yield* sql<{ season: string; tag: string; name: string; trophies: number }>`
    SELECT season,player_tag tag,player_name name,trophies FROM legend_history
    WHERE rank=1 ORDER BY season DESC LIMIT 100`
  const now = Date.now()
  const items = rows.filter(row => Number.isFinite(legendSeasonFinish(row.season)) && legendSeasonFinish(row.season) <= now)
    .sort((a,b) => legendSeasonFinish(b.season)-legendSeasonFinish(a.season)).slice(0,Number(rawLimit))
  return Response.json({ items })
}).pipe(Effect.mapError(cause => cause instanceof Forbidden || cause instanceof InvalidRequest || cause instanceof Unauthenticated
  ? cause : new DatabaseFailure({ cause, message: "Legend statistics query failed" })))
