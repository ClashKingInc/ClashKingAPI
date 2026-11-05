import { Effect } from "effect"
import { InvalidRequest, UpstreamUnavailable } from "./errors.js"

type Json = Record<string, unknown>
type Ranking = { timestamp: string; total: number; limit: number; offset: number; teams: { rank: number; team_id: number; team: string; logo_url: string | null; elo: number }[] }
type Cached = { value: unknown; fetchedAt: string; expires: number }
const cache = new Map<string, Cached>()
const pending = new Map<string, Promise<Cached>>()
const rankHints = new Map<number, { timestamp: string; team: Ranking["teams"][number]; expires: number }>()
const origin = "https://api.competitiveclash.network"
const object = (value: unknown): value is Json => !!value && typeof value === "object" && !Array.isArray(value)
const time = (value: unknown) => typeof value === "string" ? Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`) : NaN

async function cached(key: string, ttl: number, load: () => Promise<unknown>): Promise<Cached> {
  const previous = cache.get(key)
  if (previous && previous.expires > Date.now()) return previous
  const active = pending.get(key)
  if (active) return active
  const request = load().then(value => {
    const result = { value, fetchedAt: new Date().toISOString(), expires: Date.now() + ttl }
    if (cache.size >= 64) cache.delete(cache.keys().next().value!)
    cache.set(key, result)
    return result
  }).finally(() => pending.delete(key))
  pending.set(key, request)
  return request
}

async function upstream(path: string, query: Record<string, string>) {
  const url = new URL(path, origin)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) })
  // These two provider feeds explicitly use 404 for a valid empty window.
  if (response.status === 404 && path === "/teams/matches") return []
  if (response.status === 404 && path === "/teams/upcoming_matches") return { upcoming_matches: [] }
  if (!response.ok) throw new Error(`CCN HTTP ${response.status}`)
  return await response.json() as unknown
}

function ranking(value: unknown): Ranking {
  if (!object(value) || !Array.isArray(value.teams) || typeof value.total !== "number" || typeof value.timestamp !== "string") throw new Error("Invalid CCN Elo ranking")
  for (const team of value.teams) if (!object(team) || typeof team.team_id !== "number" || typeof team.rank !== "number" || typeof team.team !== "string" || typeof team.elo !== "number") throw new Error("Invalid CCN Elo team")
  return value as Ranking
}

async function topTeamMatches() {
  const top = await cached("ranking:top50", 120_000, async () => ranking(await upstream("/teams/elo/ranking", { limit: "50", offset: "0" })))
  const teams = (top.value as Ranking).teams
  const now = Date.now()
  const tasks = teams.flatMap(team => (["recent", "upcoming"] as const).map(kind => ({ team, kind })))
  const recent = new Map<string, Json>(), upcoming = new Map<string, Json>()
  const failures: { teamId: number; kind: string }[] = []
  let cursor = 0
  // One shared fan-out per cache window, not 100 provider calls per phone.
  // Six workers bound upstream concurrency; a failed team does not erase others.
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++]!
      try {
        const isRecent = task.kind === "recent"
        // CCN's match filters currently compare naive UTC datetimes and fail
        // with timezone-suffixed ISO values. Keep UTC, omit only the suffix.
        // Upcoming defaults its lower bound to provider time. Sending our
        // earlier request-start time can be rejected as already in the past.
        const query = { team_id: String(task.team.team_id), limit: "5", ...(isRecent ? { after: new Date(now - 30 * 86_400_000).toISOString().slice(0, 19) } : { include_streams: "true" }), before: new Date(now + (isRecent ? 0 : 30) * 86_400_000).toISOString().slice(0, 19) }
        const data = await upstream(isRecent ? "/teams/matches" : "/teams/upcoming_matches", query)
        const rows = isRecent ? data : object(data) ? data.upcoming_matches : null
        if (!Array.isArray(rows)) throw new Error("Invalid CCN match list")
        for (const row of rows) {
          if (!object(row)) continue
          const key = isRecent ? row.match_id : row.ccn_match_id ?? (row.source_match_id ? `${row.source}:${row.source_match_id}` : row.upcoming_match_id)
          if (key == null) continue // Without an ID we cannot safely deduplicate mirrored team feeds.
          ;(isRecent ? recent : upcoming).set(String(key), row)
        }
      } catch { failures.push({ teamId: task.team.team_id, kind: task.kind }) }
    }
  }))
  if (failures.length === tasks.length) throw new Error("CCN match feeds unavailable")
  return { teams, recent: [...recent.values()].sort((a, b) => time(b.preparation_start) - time(a.preparation_start)), upcoming: [...upcoming.values()].sort((a, b) => time(a.match_date) - time(b.match_date)), failures, windowDays: 30 }
}

async function currentTeamRanking(teamId: number) {
  const hint = rankHints.get(teamId)
  if (hint && hint.expires > Date.now()) return { timestamp: hint.timestamp, team: hint.team }
  const snapshot = await cached("ranking:all", 120_000, async () => {
    const first = ranking(await upstream("/teams/elo/ranking", { limit: "500", offset: "0" }))
    const teams = [...first.teams]
    // Share one complete snapshot across team pages. Preserve provider ranks
    // (including ties), and pin later pages to the first page's timestamp.
    for (let offset = 500; offset < first.total; offset += 2500) {
      const offsets = Array.from({ length: 5 }, (_, i) => offset + i * 500).filter(value => value < first.total)
      const pages = await Promise.all(offsets.map(value => upstream("/teams/elo/ranking", { limit: "500", offset: String(value), timestamp: first.timestamp }).then(ranking)))
      teams.push(...pages.flatMap(page => page.teams))
    }
    return { timestamp: first.timestamp, teams }
  })
  const data = snapshot.value as { timestamp: string; teams: Ranking["teams"] }
  return { timestamp: data.timestamp, team: data.teams.find(team => team.team_id === teamId) ?? null }
}

async function rankingPage(offset: string, timestamp: string | null, movement: boolean) {
  const page = ranking(await upstream("/teams/elo/ranking", { limit: "50", offset, ...(timestamp ? { timestamp } : {}) }))
  if (!timestamp || Date.now() - time(timestamp) < 120_000) {
    for (const team of page.teams) rankHints.set(team.team_id, { timestamp: page.timestamp, team, expires: Date.now() + 120_000 })
    for (const [id, hint] of rankHints) if (hint.expires <= Date.now()) rankHints.delete(id)
  }
  // The main list must not wait for a full historical ladder. Clients request
  // this optional enrichment separately after the visible page has loaded.
  if (!movement) return page
  try {
    const reference = new Date(time(page.timestamp) - 30 * 86_400_000).toISOString()
    const changes = await cached(`ranking:changes30:${reference.slice(0, 10)}`, 600_000, async () => {
      const first = ranking(await upstream("/teams/elo/ranking", { limit: "500", offset: "0", timestamp: reference }))
      const teams = [...first.teams]
      for (let start = 500; start < first.total; start += 2500) {
        const offsets = Array.from({ length: 5 }, (_, i) => start + i * 500).filter(value => value < first.total)
        const pages = await Promise.all(offsets.map(value => upstream("/teams/elo/ranking", { limit: "500", offset: String(value), timestamp: first.timestamp }).then(ranking)))
        teams.push(...pages.flatMap(item => item.teams))
      }
      return teams
    })
    const byId = new Map((changes.value as Ranking["teams"]).map(team => [team.team_id, team.rank]))
    // Compare source ranks (including ties), not Elo points. Absence in the
    // earlier ladder is unranked/new to that ladder, never zero movement.
    return { ...page, teams: page.teams.map(team => ({ ...team, previousRank30d: byId.get(team.team_id) ?? null, rankMovement30d: byId.has(team.team_id) ? byId.get(team.team_id)! - team.rank : null, newToRanking30d: !byId.has(team.team_id) })) }
  } catch {
    // Optional movement must never prevent the primary ranking from loading.
    return page
  }
}

export const competitiveElo = (request: Request, resource: "elo" | "elo-matches" | "elo-team") => Effect.gen(function* () {
  if (request.method !== "GET") return yield* new InvalidRequest({ message: "GET required" })
  const input = new URL(request.url)
  const offset = input.searchParams.get("offset") ?? "0"
  const timestamp = input.searchParams.get("timestamp")
  const movement = input.searchParams.get("movement") === "1"
  const teamId = input.searchParams.get("teamId")
  if (resource === "elo-team" && (!teamId || !/^[1-9]\d{0,9}$/.test(teamId))) return yield* new InvalidRequest({ message: "Valid teamId required" })
  if (!/^\d{1,5}$/.test(offset) || Number(offset) > 20_000 || (timestamp !== null && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) > Date.now()))) return yield* new InvalidRequest({ message: "Invalid Elo pagination or timestamp" })
  const key = resource === "elo-team" ? `ranking:team:${teamId}` : resource === "elo-matches" ? "matches:top50" : `ranking:${timestamp ?? "current"}:${offset}:${movement ? "movement" : "base"}`
  const result = yield* Effect.tryPromise({
    try: () => cached(key, resource === "elo-matches" ? 300_000 : 120_000, resource === "elo-team" ? () => currentTeamRanking(Number(teamId)) : resource === "elo-matches" ? topTeamMatches : () => rankingPage(offset, timestamp, movement)),
    catch: cause => new UpstreamUnavailable({ cause, message: "CCN is temporarily unavailable" }),
  })
  return Response.json({ source: "ccn", fetchedAt: result.fetchedAt, data: result.value }, { headers: { "Cache-Control": "public, max-age=60" } })
})
