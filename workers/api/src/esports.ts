import { Effect } from "effect"
import { InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import { competitiveElo } from "./esports-elo.js"
const json = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } })
const cache = new Map<string, { until: number; value: unknown; fetchedAt: string }>()
const ccnPending = new Map<string, Promise<{ value: unknown; fetchedAt: string }>>()
const ccnResources: Record<string, { path: string; query?: Record<string, string> }> = {
  events: { path: "/worlds/events" }, divisions: { path: "/worlds/events/{eventId}/divisions" }, segments: { path: "/worlds/events/{eventId}/segments" },
  teams: { path: "/worlds/events/segments/{segmentId}/teams" }, standings: { path: "/worlds/events/segments/{segmentId}/standings" }, records: { path: "/worlds/events/segments/{segmentId}/records" },
  leaderboard: { path: "/worlds/leaderboard", query: { segmentId: "segment_id" } }, player: { path: "/players/basicinfo", query: { playerTag: "player" } },
  clan: { path: "/clans/info", query: { clanTag: "clan" } }, team: { path: "/teams/basicinfo", query: { teamId: "team_id" } },
  "team-search": { path: "/teams/search", query: { search: "search_str" } }, "team-matches": { path: "/teams/matches", query: { teamId: "team_id" } },
  "team-upcoming": { path: "/teams/upcoming_matches", query: { teamId: "team_id" } }, "clan-matches": { path: "/clans/matches", query: { clanTag: "clantag" } },
}
export const ccn = (request: Request, resource: string) => Effect.gen(function* () {
  if (resource === "elo" || resource === "elo-matches" || resource === "elo-team") return yield* competitiveElo(request, resource)
  if (request.method !== "GET") return yield* new InvalidRequest({ message: "GET required" })
  const config = ccnResources[resource]
  if (!config) return yield* new NotFound({ message: "Unknown public CCN resource" })
  const input = new URL(request.url), target = new URL(config.path.replace(/\{(\w+)\}/gu, (_, key: string) => encodeURIComponent(input.searchParams.get(key) ?? "")), "https://api.competitiveclash.network")
  for (const key of [...config.path.matchAll(/\{(\w+)\}/gu)].map(match => match[1]!)) if (!/^\d+$/u.test(input.searchParams.get(key) ?? "")) return yield* new InvalidRequest({ message: `${key} must be a positive integer` })
  for (const [key, upstream] of Object.entries(config.query ?? {})) {
    const value = input.searchParams.get(key)?.trim()
    if (!value || value.length > 100) return yield* new InvalidRequest({ message: `${key} is required` })
    target.searchParams.set(upstream, value)
  }
  // CCN omits broadcast metadata by default. Request it for every upcoming
  // team view as well as the aggregated feed; completed matches lack this field.
  if (resource === "team-upcoming") target.searchParams.set("include_streams", "true")
  // Only this fixed allowlist reaches CCN. Never forward caller credentials,
  // arbitrary upstream paths, linkage operations, tokens or auth parameters.
  const key = target.toString(), stored = cache.get(key)
  if (stored && stored.until > Date.now()) return json({ source: "ccn", fetchedAt: stored.fetchedAt, data: stored.value })
  const { value, fetchedAt } = yield* Effect.tryPromise({ try: async () => {
    let pending = ccnPending.get(key)
    if (!pending) {
      pending = (async () => {
        // Full ladder standings contain thousands of rows and CCN can spend
        // over 15 seconds producing them. Keep the larger budget specific to
        // historical standings/records so basic discovery still fails fast.
        const timeout = resource === "standings" || resource === "records" ? 30_000 : 10_000
        const response = await fetch(target, { signal: AbortSignal.timeout(timeout), headers: { Accept: "application/json" } })
        // A provider 404 is absence, not a successful cache entry. Transient
        // provider failures must remain retryable instead of hiding fresh data.
        if (response.status === 404) return { value: null, fetchedAt: new Date().toISOString() }
        if (!response.ok) throw new Error(`CCN HTTP ${response.status}`)
        const value: unknown = await response.json(), fetchedAt = new Date().toISOString()
        if (cache.size >= 500) cache.delete(cache.keys().next().value!)
        cache.set(key, { until: Date.now() + 60_000, value, fetchedAt })
        return { value, fetchedAt }
      })()
      ccnPending.set(key, pending)
      void pending.finally(() => ccnPending.delete(key)).catch(() => {})
    }
    return pending
  }, catch: cause => new UpstreamUnavailable({ cause, message: "CCN is temporarily unavailable" }) })
  return json({ source: "ccn", fetchedAt, data: value })
})


export const dispatchEsports = (request: Request) => Effect.gen(function* () {
  const parts=new URL(request.url).pathname.split("/").filter(Boolean)
  if(parts[0]!=="v2" || parts[1]!=="esports" || parts[2]!=="ccn" || parts.length!==4) return undefined
  return yield* ccn(request,parts[3]!)
})
