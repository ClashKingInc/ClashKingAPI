import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { InitializationEndpoint, InitializationResponse, InitializationPlayer } from "../../../packages/api-contracts/src/initialization.js"
import { ProxyPlayerResponse, ProxyClanResponse, ProxyCapitalRaidSeasonsResponse, ProxyWarlogResponse } from "../../../packages/api-contracts/src/proxy.js"
import { AuthIdentity } from "./auth.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { DatabaseFailure, InvalidRequest, UpstreamUnavailable } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { publicTag } from "./public-war.js"
import { lookupStaticItem } from "./static-metadata.js"
import { queryMobilePlayerRankingsBatch, queryPlayerLegendHistoryBatch } from "./public-player-extra.js"
import { currentWarSummary } from "./current-war-summary.js"
import { queryInitializationWarStats } from "./initialization-war-stats.js"

const proxyFailure = (cause: unknown) => new UpstreamUnavailable({ cause, message: "Initialization Clash data is unavailable" })
/** Go initialization is best-effort for individual live Clash lookups. HTTP
 * failures omit that item; malformed success payloads remain contract failures. */
export const initializationProxy = <S extends Schema.Codec<unknown, unknown, never, never>>(bindings: WorkerBindings, path: string, schema: S) => Effect.gen(function* () {
  // Workerd supports only manual/follow. Reject redirects via the status check
  // below; redirect:"error" throws before the service binding receives a request.
  const response = yield* Effect.tryPromise({ try: (signal) => bindings.CLASH_PROXY.fetch(new Request(`https://clash-proxy.internal/v1/${path}`, { signal, redirect: "manual", headers: { accept: "application/json" } })), catch: proxyFailure }).pipe(
    Effect.timeout("20 seconds"), Effect.catch(() => Effect.succeed(undefined)),
  )
  if (response === undefined) return undefined
  if (response.status !== 200) { yield* Effect.promise(() => response.body?.cancel().catch(() => undefined) ?? Promise.resolve()); return undefined }
  const payload = yield* readBoundedJson(response, 4 * 1024 * 1024).pipe(Effect.mapError(proxyFailure))
  return yield* Schema.decodeUnknownEffect(schema)(payload).pipe(Effect.mapError(proxyFailure))
}).pipe(Effect.timeout("20 seconds"), Effect.catchTag("TimeoutError", () => Effect.succeed(undefined)))

export const initializationWindow = (now: Date) => {
  const start = new Date(now)
  start.setUTCMonth(start.getUTCMonth() - 6)
  // The Go assembler uses Unix seconds at its query and response boundary.
  start.setUTCMilliseconds(0)
  const end = new Date(now); end.setUTCMilliseconds(0)
  return { start, end }
}
const enrichClanIcons = (clan: typeof ProxyClanResponse.Type): typeof ProxyClanResponse.Type => {
  const enrich = <T extends { id: number; name: string }>(league: T, category: string) => {
    const item = lookupStaticItem(category, league.id)
    return item?.iconUrls ? { ...league, iconUrls: item.iconUrls } : league
  }
  return { ...clan, ...(clan.warLeague ? { warLeague: enrich(clan.warLeague, "war_leagues") } : {}),
    ...(clan.capitalLeague ? { capitalLeague: enrich(clan.capitalLeague, "capital_leagues") } : {}),
    memberList: clan.memberList.map((member) => ({ ...member, ...(member.leagueTier ? { leagueTier: enrich(member.leagueTier, "league_tiers") } : {}),
      ...(member.builderBaseLeague ? { builderBaseLeague: enrich(member.builderBaseLeague, "builder_leagues") } : {}) })) }
}
export const initializeMobileAccount = (rawTags: readonly string[], userId: string, bindings: WorkerBindings, now = new Date()) => Effect.gen(function* () {
  const normalized = yield* Effect.forEach(rawTags.filter((tag) => tag.trim() !== ""), publicTag)
  const tags = [...new Set(normalized)]
  if (!tags.length) return yield* new InvalidRequest({ message: "player_tags cannot be empty" })
  const window = initializationWindow(now)
  const [basics, rankings, legends] = yield* Effect.all([
    Effect.forEach(tags, (tag) => initializationProxy(bindings, `players/${encodeURIComponent(tag)}`, ProxyPlayerResponse), { concurrency: 5 }),
    queryMobilePlayerRankingsBatch(tags), queryPlayerLegendHistoryBatch(tags, 10),
  ], { concurrency: 3 })
  const players_basic = basics.filter((item): item is typeof ProxyPlayerResponse.Type => item !== undefined)
  const basicByTag = new Map(players_basic.map((player) => [player.tag, player]))
  const clan_tags = [...new Set(players_basic.flatMap((player) => player.clan ? [player.clan.tag] : []))]
  const sql = yield* SqlClient.SqlClient
  const timerRows = yield* sql<{ player_tag: string; source_clan_tag: string }>`SELECT timer.player_tag, schedule.source_clan_tag
    FROM player_timers timer JOIN war_schedule schedule ON schedule.schedule_key = timer.event_key
    WHERE timer.event_type = 'war' AND timer.expires_at > now() AND timer.player_tag = ANY(${tags}::text[])
    GROUP BY timer.player_tag, schedule.source_clan_tag`.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Initialization timers failed" })))
  const contexts = new Map<string, string>()
  for (const tag of tags) {
    const clans = [...new Set(timerRows.filter((row) => row.player_tag === tag).map((row) => row.source_clan_tag))]
    const current = basicByTag.get(tag)?.clan?.tag
    if (clans.length && (!current || !clans.includes(current))) contexts.set(tag, clans[0]!)
  }
  const allClans = [...new Set([...clan_tags, ...contexts.values()])]
  const [summaries, details, capital, logs, stats] = yield* Effect.all([
    Effect.forEach(allClans, (tag) => currentWarSummary(bindings, tag, now), { concurrency: 3 }),
    Effect.forEach(clan_tags, (tag) => initializationProxy(bindings, `clans/${encodeURIComponent(tag)}`, ProxyClanResponse).pipe(Effect.map((clan) => clan ? [tag, enrichClanIcons(clan)] as const : undefined)), { concurrency: 3 }),
    Effect.forEach(clan_tags, (tag) => initializationProxy(bindings, `clans/${encodeURIComponent(tag)}/capitalraidseasons?limit=10`, ProxyCapitalRaidSeasonsResponse).pipe(Effect.map((value) => ({ clan_tag: tag, history: value?.items ?? [] }))), { concurrency: 3 }),
    Effect.forEach(clan_tags, (tag) => initializationProxy(bindings, `clans/${encodeURIComponent(tag)}/warlog`, ProxyWarlogResponse).pipe(Effect.map((value) => ({ clan_tag: tag, items: value?.items ?? [] }))), { concurrency: 3 }),
    queryInitializationWarStats(tags, clan_tags, window.start, window.end),
  ], { concurrency: 2 })
  const summaryByTag = new Map(summaries.map((summary) => [summary.clan_tag, summary]))
  const players: Array<typeof InitializationPlayer.Type> = tags.map((tag) => {
    const contextTag = contexts.get(tag), summary = contextTag ? summaryByTag.get(contextTag) : undefined
    return { tag, legends_by_season: {}, legend_eos_ranking: legends.get(tag) ?? [], rankings: rankings.get(tag)!,
      war_data: summary ? { ...summary, ...(summary.war_info.currentWarInfo ? { currentWarInfo: summary.war_info.currentWarInfo } : {}) } : {} }
  })
  const response: typeof InitializationResponse.Type = { players, players_basic,
    clans: { clan_details: Object.fromEntries(details.filter((entry) => entry !== undefined)), clan_stats: {},
      war_data: clan_tags.flatMap((tag) => { const summary = summaryByTag.get(tag); return summary ? [summary] : [] }),
      capital_data: capital, war_log_data: logs, clan_war_stats: stats.clan_war_stats, cwl_data: [] },
    war_stats: stats.war_stats, clan_tags, metadata: { total_players: tags.length, total_clans: clan_tags.length, fetch_time: now.toISOString().replace(/\.\d{3}Z$/u, "Z"), user_id: userId } }
  return yield* Schema.decodeUnknownEffect(InitializationResponse)(response).pipe(Effect.mapError(proxyFailure))
})

export const initializationRuntimeRoutes = [{ method: "POST", path: "/v2/initialization" }] as const
export const dispatchInitialization = (request: Request, bindings: WorkerBindings) => Effect.gen(function* () {
  if (request.method !== "POST" || new URL(request.url).pathname !== InitializationEndpoint.path) return undefined
  const user = yield* (yield* AuthIdentity).requireUser(request)
  const body = yield* readBoundedJson(request)
  const input = yield* Schema.decodeUnknownEffect(InitializationEndpoint.body)(body).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid initialization payload" })))
  const response = yield* initializeMobileAccount(input.player_tags, user.userId, bindings).pipe(Effect.provideService(WorkerEnvironment, bindings))
  return Response.json(response)
})
