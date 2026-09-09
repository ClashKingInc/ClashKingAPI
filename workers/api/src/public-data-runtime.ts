import { expoEndpoints, type AnyEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { AuthIdentity } from "./auth.js"
import { InvalidRequest, UpstreamUnavailable } from "./errors.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { queryBasicWar, queryClanWars, queryPlayerWarStats, queryPreviousWar } from "./public-war.js"
import { queryPlayerTimers } from "./public-player.js"
import { queryJoinLeave } from "./public-join-leave.js"
import { queryPlayerLeaderboard, queryClanLeaderboard } from "./public-leaderboards.js"
import { queryPlayerSearch } from "./public-search.js"
import { queryPlayerChanges, queryClanChanges, queryClanRecords } from "./public-changes.js"
import { queryLeaderboardHistory, queryClanLeaderboardHistory, queryClanLegendHistory } from "./public-history.js"
import { queryPlayerCwlHistory, queryClanCwlSeasons } from "./public-cwl.js"

export const publicDataRuntimeRoutes = [
  { method: "GET", path: "/v2/player/:playerTag/cwl/history" },
  { method: "GET", path: "/v2/cwl/:clanTag/seasons" },
  { method: "GET", path: "/v2/player/search" },
  { method: "GET", path: "/v2/player/:playerTag/history/changes" },
  { method: "GET", path: "/v2/clan/:clanTag/history/changes" },
  { method: "GET", path: "/v2/clan/:clanTag/records" },
  { method: "GET", path: "/v2/leaderboard/history/:leaderboardType/:locationId/:date" },
  { method: "GET", path: "/v2/clan/:clanTag/history/leaderboards" },
  { method: "GET", path: "/v2/clan/:clanTag/history/leaderboards/summary" },
  { method: "GET", path: "/v2/clan/:clanTag/history/legends" },
  { method: "GET", path: "/v2/clan/:clanTag/history/legends/summary" },
  { method: "GET", path: "/v2/war/:clanTag/basic" },
  { method: "GET", path: "/v2/war/:clanTag/previous/:endTime" },
  { method: "GET", path: "/v2/clan/:clanTag/warlog" },
  { method: "GET", path: "/v2/clan/:clanTag/wars" },
  { method: "GET", path: "/v2/player/:playerTag/war/stats" },
  { method: "GET", path: "/v2/player/:playerTag/timers" },
  { method: "GET", path: "/v2/player/:playerTag/join-leave" },
  { method: "GET", path: "/v2/player/:playerTag/join-leave/totals" },
  { method: "GET", path: "/v2/clan/:clanTag/join-leave" },
  { method: "GET", path: "/v2/leaderboard/townhalls/:townhallLevel" },
  { method: "GET", path: "/v2/leaderboard/league/:leagueTierId" },
  { method: "GET", path: "/v2/leaderboard/:locationId/clan/donations" },
  { method: "GET", path: "/v2/leaderboard/:locationId/clan/war-wins" },
  { method: "GET", path: "/v2/leaderboard/clan/win-streak" },
] as const
const keys = new Set<string>(publicDataRuntimeRoutes.map((route) => `${route.method} ${route.path}`))
const endpoints: readonly AnyEndpoint[] = Object.values(expoEndpoints).filter((endpoint) => keys.has(`${endpoint.method} ${endpoint.path}`))

export const dispatchPublicData = (request: Request, bindings: WorkerBindings) => Effect.gen(function* () {
  const url = new URL(request.url)
  const actual = url.pathname.split("/")
  for (const endpoint of endpoints) {
    if (request.method !== endpoint.method) continue
    const segments = endpoint.path.split("/")
    if (segments.length !== actual.length || segments.some((part, index) => !part.startsWith(":") && part !== actual[index])) continue
    const path = yield* Effect.try({ try: () => Object.fromEntries(segments.flatMap((part, index) => part.startsWith(":") ? [[part.slice(1), decodeURIComponent(actual[index] ?? "")]] : [])), catch: () => new InvalidRequest({ message: "Malformed path encoding" }) })
    if (endpoint.auth !== "public") yield* (yield* AuthIdentity).requireUser(request)
    const numeric = new Set(["limit", "days", "top", "townhallLevel", "leagueTierId"])
    const typed = (entries: Iterable<readonly [string, string]>) => Object.fromEntries([...entries].map(([key, value]) => [key,
      numeric.has(key) ? (value.trim() ? Number(value) : NaN) : key === "attack"
        ? ["1", "t", "T", "TRUE", "true", "True"].includes(value) ? true : ["0", "f", "F", "FALSE", "false", "False"].includes(value) ? false : value
        : value]))
    yield* Schema.decodeUnknownEffect(endpoint.pathParams)(typed(Object.entries(path))).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid path parameters" })))
    yield* Schema.decodeUnknownEffect(endpoint.query)(typed(url.searchParams)).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid query parameters" })))
    const result = yield* executePublicData(endpoint.operationId, path, url.searchParams, bindings).pipe(Effect.provideService(WorkerEnvironment, bindings))
    const encoded = yield* Schema.encodeUnknownEffect(endpoint.response)(result).pipe(Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Stored public data does not match the response contract" })))
    return Response.json(encoded)
  }
  return undefined
})

const executePublicData = (operation: string, path: Readonly<Record<string, string>>, query: URLSearchParams, bindings: WorkerBindings) => Effect.gen(function* () {
  switch (operation) {
    case "getExpoPlayerCwlHistory": return yield* queryPlayerCwlHistory(path.playerTag ?? "", query)
    case "getExpoClanCwlSeasons": return yield* queryClanCwlSeasons(path.clanTag ?? "", query)
    case "searchExpoPlayers": return yield* queryPlayerSearch(bindings, query)
    case "getExpoPlayerChanges": return yield* queryPlayerChanges(path.playerTag ?? "", query)
    case "getExpoClanChanges": return yield* queryClanChanges(path.clanTag ?? "", query)
    case "getExpoClanRecords": return yield* queryClanRecords(path.clanTag ?? "")
    case "getExpoLeaderboardHistory": return yield* queryLeaderboardHistory(path.leaderboardType ?? "", path.locationId ?? "", path.date ?? "", bindings)
    case "getExpoClanLeaderboardHistory": return yield* queryClanLeaderboardHistory(path.clanTag ?? "", query, false)
    case "getExpoClanLeaderboardSummary": return yield* queryClanLeaderboardHistory(path.clanTag ?? "", query, true)
    case "getExpoClanLegendHistory": return yield* queryClanLegendHistory(path.clanTag ?? "", query, false)
    case "getExpoClanLegendSummary": return yield* queryClanLegendHistory(path.clanTag ?? "", query, true)
    case "getExpoWarBasic": return yield* queryBasicWar(path.clanTag ?? "")
    case "getExpoPreviousWar": return yield* queryPreviousWar(path.clanTag ?? "", path.endTime ?? "")
    case "getExpoClanWarlog": return yield* queryClanWars(path.clanTag ?? "", query, true)
    case "getExpoClanWars": return yield* queryClanWars(path.clanTag ?? "", query, false)
    case "getExpoPlayerWarStats": return yield* queryPlayerWarStats(path.playerTag ?? "", query)
    case "getExpoPlayerTimers": return yield* queryPlayerTimers(path.playerTag ?? "")
    case "getExpoPlayerJoinLeave": return yield* queryJoinLeave(path.playerTag ?? "", query, "player")
    case "getExpoPlayerJoinLeaveTotals": return yield* queryJoinLeave(path.playerTag ?? "", query, "player", true)
    case "getExpoClanJoinLeave": return yield* queryJoinLeave(path.clanTag ?? "", query, "clan")
    case "getExpoTownhallLeaderboard": return yield* queryPlayerLeaderboard(bindings, "townhall", path.townhallLevel ?? "", query)
    case "getExpoLeagueLeaderboard": return yield* queryPlayerLeaderboard(bindings, "league", path.leagueTierId ?? "", query)
    case "getExpoClanDonationsLeaderboard": return yield* queryClanLeaderboard("donations", path.locationId ?? "", query)
    case "getExpoClanWarWinsLeaderboard": return yield* queryClanLeaderboard("war_wins", path.locationId ?? "", query)
    case "getExpoClanWinStreakLeaderboard": return yield* queryClanLeaderboard("win_streak", "", query)
    default: return yield* Effect.die(new Error(`Missing public-data implementation: ${operation}`))
  }
})
