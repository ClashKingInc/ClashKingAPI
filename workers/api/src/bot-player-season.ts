import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { BotPlayerSeasonEndpoint } from "@clashking/api-contracts"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { publicTag } from "./public-war.js"
import { trophySeason } from "./public-history.js"

// Aggregate game statistics only. Do not extend this response with hidden
// links, online activity, or private join/leave events for a public Bot embed.
export const dispatchBotPlayerSeason = (request: Request) => Effect.gen(function* () {
  const url = new URL(request.url), match = /^\/v2\/bot\/players\/([^/]+)\/season-stats$/u.exec(url.pathname)
  if (!match) return undefined
  yield* (yield* AuthIdentity).requireBot(request)
  if (request.method !== "GET" || url.search) return yield* new InvalidRequest({ message: "Invalid player season request" })
  const raw = yield* Effect.try({try: () => decodeURIComponent(match[1]!),catch: () => new InvalidRequest({message:"Invalid player tag"})})
  const tag = yield* publicTag(raw), sql = yield* SqlClient.SqlClient, season = trophySeason(new Date())
  const fail = (cause: unknown) => new DatabaseFailure({cause,message:"Player season query failed"})
  const loot = (yield* sql<{ count: number; gold: string; elixir: string; dark: string }>`SELECT count(*)::integer count,
    COALESCE(sum((looted_resources->>'gold')::bigint),0)::text gold,
    COALESCE(sum((looted_resources->>'elixir')::bigint),0)::text elixir,
    COALESCE(sum((looted_resources->>'darkElixir')::bigint),0)::text dark
    FROM battles_farming WHERE player_tag=${tag} AND battle_time>=${season.start} AND battle_time<${season.end}`.pipe(Effect.mapError(fail)))[0]!
  const stats = (yield* sql<{ count: number; games: string; capital: string }>`SELECT count(*)::integer count,
    COALESCE(sum(delta) FILTER(WHERE stat_type='clan_games'),0)::text games,
    COALESCE(sum(delta) FILTER(WHERE stat_type='capital_gold_donated'),0)::text capital
    FROM player_stat_changes WHERE player_tag=${tag} AND event_time>=${season.start} AND event_time<${season.end}`.pipe(Effect.mapError(fail)))[0]!
  const value={start:season.start.toISOString(),end:season.end.toISOString(),recordedBattles:loot.count,
    gold:Number(loot.gold),elixir:Number(loot.elixir),darkElixir:Number(loot.dark),clanGames:Number(stats.games),capitalDonated:Number(stats.capital),statObservations:stats.count}
  const encoded = yield* Schema.encodeUnknownEffect(BotPlayerSeasonEndpoint.response)(value).pipe(Effect.mapError(fail))
  return Response.json(encoded)
})
