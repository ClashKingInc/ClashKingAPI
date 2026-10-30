import { ServerAnalyticsEndpoint, type EndpointResponse } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { badgeUrls } from "./war-archive-model.js"
import { lookupStaticItem, prepareStaticMetadata } from "./static-metadata.js"
import { cwlSummary, cwlStandings, loadCwlGroupsByIds, loadCwlWars, type CwlGroup, type CwlWar } from "./public-cwl.js"

type Mutable<T> = T extends readonly (infer A)[] ? Mutable<A>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T
type Report = Mutable<EndpointResponse<typeof ServerAnalyticsEndpoint>>
type Metrics = Report["totals"]
export const emptyAnalyticsMetrics = (): Metrics => ({ gold: 0, elixir: 0, darkElixir: 0, attacks: 0, donated: 0, received: 0,
  active: 0, upgrades: 0, joins: 0, leaves: 0, capital: 0, clanGames: 0 })
const dayOf = (value: Date | string) => new Date(value).toISOString().slice(0, 10)
const iso = (value: Date | string) => new Date(value).toISOString()
export const analyticsWindow = (start: string, end: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(start) || !/^\d{4}-\d{2}-\d{2}$/u.test(end)) throw new Error("Use UTC calendar dates")
  const from = new Date(`${start}T00:00:00Z`), until = new Date(`${end}T00:00:00Z`)
  if (!Number.isFinite(+from) || !Number.isFinite(+until) || dayOf(from) !== start || dayOf(until) !== end || +until <= +from || +until - +from > 186 * 86_400_000) throw new Error("Select between 1 and 186 days")
  if (+until > Date.now() + 86_400_000) throw new Error("The range cannot include future days")
  return { from, until }
}
type Movement = Report["movements"][number]
/** Only simultaneous observations are classified as transfers; nearby events remain independent. */
export const analyticsMovement = (events: readonly Movement[], current: ReadonlySet<string>) => {
  const groups = new Map<string, Movement[]>()
  for (const event of events) {
    const key = `${event.tag}:${event.time}`
    groups.set(key, [...(groups.get(key) ?? []), event])
  }
  let arrivals = 0, departures = 0, transfers = 0
  const joined = new Set<string>()
  for (const group of groups.values()) {
    const joins = group.filter(event => event.type === "join"), leaves = group.filter(event => event.type === "leave")
    const transfer = Math.min(joins.length, leaves.length)
    transfers += transfer; arrivals += joins.length - transfer; departures += leaves.length - transfer
    if (joins.length > transfer) joined.add(group[0]!.tag)
  }
  return { arrivals, departures, transfers, arrivalsStillPresent: [...joined].filter(tag => current.has(tag)).length }
}
/** Observed family presence at day 30, not continuous membership or exact join time. */
export const analyticsRetention = (events: readonly Movement[], from: Date, until: Date, now: Date) => {
  const ordered = [...events].sort((a,b) => Date.parse(a.time)-Date.parse(b.time) || (a.type === b.type ? a.clanTag.localeCompare(b.clanTag) : a.type === "leave" ? -1 : 1))
  const leaveTimes = new Set(ordered.filter(event=>event.type==="leave").map(event=>`${event.tag}:${event.time}`))
  const cohorts = new Map<string, number>()
  for (const event of ordered) if (event.type === "join" && Date.parse(event.time)>=+from && Date.parse(event.time)<+until && !leaveTimes.has(`${event.tag}:${event.time}`) && !cohorts.has(event.tag)) cohorts.set(event.tag,Date.parse(event.time))
  let eligible=0,retained=0,immature=0
  const byPlayer = new Map<string,Movement[]>()
  for (const event of ordered) byPlayer.set(event.tag,[...(byPlayer.get(event.tag)??[]),event])
  for (const [tag,joined] of cohorts) {
    const horizon=joined+30*86_400_000
    if (horizon>+now) {immature++;continue}
    eligible++
    const present = new Set<string>()
    for (const event of byPlayer.get(tag)??[]) if (Date.parse(event.time)>=joined && Date.parse(event.time)<=horizon) {
      if (event.type==="join") present.add(event.clanTag); else present.delete(event.clanTag)
    }
    if (present.size>0) retained++
  }
  return {eligible,retained,immature}
}
interface ClanRow { tag: string; name: string; badge_token: string; members: unknown; war_wins: number; war_win_streak: number; clan_points: number; cwl_league_id: number }
interface Fact { day: Date | string; player_tag: string; clan_tag: string; metric: keyof Metrics; value: number | string }
const records = (value: unknown): readonly Record<string, unknown>[] => Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null) : []
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0
export const analyticsTownHall = (roster: number, profile: number) => roster > 0 ? roster : Math.max(0, profile)
/** Prefer materialized standings; use archived results only when that season is missing. */
export const analyticsCwlHistory = (standings: Report["cwl"], groups: readonly CwlGroup[], wars: ReadonlyMap<string, CwlWar>, tags: readonly string[]) => {
  const rows = new Map(standings.map(row => [`${row.clanTag}:${row.season.slice(0,7)}`, row]))
  for (const group of [...groups].sort((a,b)=>b.season.localeCompare(a.season))) for (const tag of tags) {
    if (!group.clan_tags.includes(tag)) continue
    const season = group.season.slice(0,7), key = `${tag}:${season}`
    if (rows.has(key) || !group.cwl_league_id) continue
    const summary = cwlSummary(group,wars,tag)
    if (summary) rows.set(key,{clanTag:tag,season,leagueId:group.cwl_league_id,stars:summary.stars,wins:summary.rounds.won,
      rank:cwlStandings(group,wars).complete ? summary.rank : null})
  }
  return [...rows.values()].sort((a,b)=>a.season.localeCompare(b.season)||a.clanTag.localeCompare(b.clanTag))
}
const database = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.mapError(cause => new DatabaseFailure({ cause, message: "Analytics query failed" })))

export const readServerAnalytics = (input: DashboardServerOperationInput) => Effect.gen(function* () {
  const query = yield* Schema.decodeUnknownEffect(ServerAnalyticsEndpoint.query)(input.query).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid analytics filters" })))
  const window = yield* Effect.try({ try: () => analyticsWindow(query.start, query.end), catch: cause => new InvalidRequest({ message: cause instanceof Error ? cause.message : "Invalid range" }) })
  const serverId = String(input.path.serverId), sql = yield* SqlClient.SqlClient
  const available = yield* database(sql<ClanRow>`SELECT c.tag,c.name,c.badge_token,c.members,c.war_wins,c.war_win_streak,c.clan_points,c.cwl_league_id
    FROM server_clans sc JOIN basic_clan c ON c.tag=sc.tag WHERE sc.server_id=${serverId} ORDER BY c.name,c.tag`)
  const requested = query.clans ? [...new Set(query.clans.split(",").map(tag => tag.trim().toUpperCase()))] : available.map(clan => clan.tag)
  if (requested.some(tag => !available.some(clan => clan.tag === tag))) return yield* new InvalidRequest({ message: "Selected clan is not in this server" })
  if (requested.length > 100) return yield* new InvalidRequest({ message: "Select at most 100 clans" })
  const selected = available.filter(clan => requested.includes(clan.tag))
  const clans: Report["clans"][number][] = selected.map(clan => ({ name: clan.name, tag: clan.tag, badge: badgeUrls(clan.badge_token).small,
    members: records(clan.members).length, warWins: clan.war_wins, warWinStreak: clan.war_win_streak, points: clan.clan_points,
    cwlLeagueId: clan.cwl_league_id, metrics: emptyAnalyticsMetrics() }))
  const players = new Map<string, Report["players"][number]>()
  for (const clan of selected) for (const member of records(clan.members)) {
    if (typeof member.tag !== "string" || players.has(member.tag)) continue
    players.set(member.tag, { name: typeof member.name === "string" ? member.name : member.tag, tag: member.tag, clanTag: clan.tag,
      townHall: numeric(member.townHallLevel ?? member.townhall_level ?? member.town_hall), leagueId: numeric((member.leagueTier as { id?: number } | undefined)?.id ?? (member.league as { id?: number } | undefined)?.id) || null,
      trophies: numeric(member.trophies), currentMember: true, metrics: emptyAnalyticsMetrics() })
  }
  const tags = [...players.keys()], current = new Set(tags)
  if (tags.length > 5000) return yield* new InvalidRequest({message: "Select at most 5,000 accounts"})
  if (tags.length) {
    const profiles = yield* database(sql<{tag: string; league_id: number | null; trophies: number; townhall_level: number}>`SELECT tag,league_id,trophies,townhall_level FROM basic_player WHERE tag=ANY(${tags}::text[])`)
    for (const profile of profiles) { const player = players.get(profile.tag)!; player.leagueId = profile.league_id; player.trophies = profile.trophies; player.townHall = analyticsTownHall(player.townHall,profile.townhall_level) }
  }
  const totals = emptyAnalyticsMetrics(), days = new Map<string, Metrics>()
  for (let time = +window.from; time < +window.until; time += 86_400_000) days.set(dayOf(new Date(time)), emptyAnalyticsMetrics())
  const report: Report = { serverId, generatedAt: new Date().toISOString(), start: query.start, end: query.end, attribution: "current_roster",
    totals, clans, days: [], players: [], progress: [], movements: [], movement: { arrivals: 0, departures: 0, transfers: 0, arrivalsStillPresent: 0 }, retention:{eligible:0,retained:0,immature:0}, leagues:[], legends:[], cwl: [], rankings: [] }
  if (selected.length === 0) { report.days = [...days].map(([day, metrics]) => ({ day, metrics })); return report }
  // Aggregate in PostgreSQL rather than transferring the raw battle/event history to the browser.
  const stats = yield* database(sql<Fact>`SELECT (event_time AT TIME ZONE 'UTC')::date AS day,player_tag,clan_tag,
    CASE stat_type WHEN 'capital_gold_donated' THEN 'capital' WHEN 'clan_games' THEN 'clanGames' ELSE stat_type END AS metric,sum(delta)::text AS value
    FROM player_stat_changes WHERE clan_tag=ANY(${requested}::text[]) AND event_time>=${window.from} AND event_time<${window.until}
    AND stat_type IN ('donated','received','capital_gold_donated','clan_games') GROUP BY 1,2,3,4`)
  const activity = yield* database(sql<Fact>`SELECT (seen_at AT TIME ZONE 'UTC')::date AS day,tag AS player_tag,clan_tag,'active' AS metric,1 AS value
    FROM player_online_events WHERE clan_tag=ANY(${requested}::text[]) AND seen_at>=${window.from} AND seen_at<${window.until} GROUP BY 1,2,3`)
  const loot = tags.length === 0 ? [] : yield* database(sql<{day: Date | string; player_tag: string; gold: string; elixir: string; dark: string; attacks: string}>`
    SELECT (battle_time AT TIME ZONE 'UTC')::date AS day,player_tag,
    sum(COALESCE((looted_resources->>'gold')::bigint,0))::text AS gold,
    sum(COALESCE((looted_resources->>'elixir')::bigint,0))::text AS elixir,
    sum(COALESCE((looted_resources->>'darkElixir')::bigint,0))::text AS dark,count(*)::text AS attacks
    FROM battles_farming WHERE player_tag=ANY(${tags}::text[]) AND battle_time>=${window.from} AND battle_time<${window.until} GROUP BY 1,2`)
  const progress = tags.length === 0 ? [] : yield* database(sql<{day: Date | string; player_tag: string; type: number; levels: string; events: string}>`
    SELECT (event_time AT TIME ZONE 'UTC')::date AS day,player_tag,change_type AS type,
    sum(GREATEST(current_value::bigint-previous_value::bigint,0))::text AS levels,count(*)::text AS events
    FROM player_change_history WHERE player_tag=ANY(${tags}::text[]) AND event_time>=${window.from} AND event_time<${window.until}
    AND change_type IN (1,3,4,5,6,7) AND current_value ~ '^[0-9]+$' AND previous_value ~ '^[0-9]+$'
    AND current_value::bigint>previous_value::bigint GROUP BY 1,2,3`)
  const retentionEnd = new Date(Math.min(Date.now(),+window.until+30*86_400_000))
  const movements = yield* database(sql<{time: Date | string; type: string; clan_tag: string; player_name: string; player_tag: string; townhall_level: number}>`
    SELECT DISTINCT time,type,clan_tag,player_name,player_tag,townhall_level FROM join_leave_history
    WHERE clan_tag=ANY(${requested}::text[]) AND time>=${window.from} AND time<=${retentionEnd} ORDER BY time,player_tag,clan_tag,type LIMIT 20001`)
  if (movements.length > 20000) return yield* new InvalidRequest({ message: "Too many movements; select a shorter range or fewer clans" })
  const history = movements.map(row => ({ time: iso(row.time), type: row.type, clanTag: row.clan_tag, name: row.player_name || row.player_tag, tag: row.player_tag, townHall: row.townhall_level }))
  report.movements = history.filter(event=>Date.parse(event.time)<+window.until)
  report.retention = analyticsRetention(history,window.from,window.until,new Date())
  report.movement = analyticsMovement(report.movements, current)
  const facts: Fact[] = [...stats, ...activity]
  for (const row of loot) for (const [metric, value] of [["gold", row.gold], ["elixir", row.elixir], ["darkElixir", row.dark], ["attacks", row.attacks]] as const)
    facts.push({ day: row.day, player_tag: row.player_tag, clan_tag: players.get(row.player_tag)!.clanTag, metric, value })
  const progressTotals = new Map<number, {type: number; levels: number; events: number}>()
  for (const row of progress) {
    facts.push({ day: row.day, player_tag: row.player_tag, clan_tag: players.get(row.player_tag)!.clanTag, metric: "upgrades", value: row.levels })
    const total = progressTotals.get(row.type) ?? {type: row.type, levels: 0, events: 0}
    total.levels += Number(row.levels); total.events += Number(row.events); progressTotals.set(row.type,total)
  }
  report.progress = [...progressTotals.values()].sort((a,b) => b.levels-a.levels)
  const active = new Set<string>(), clanActive = new Map<string, Set<string>>(), dailyActive = new Map<string, Set<string>>()
  const byClan = new Map(clans.map(clan => [clan.tag,clan]))
  for (const fact of facts) {
    const day = dayOf(fact.day), bucket = days.get(day), clan = byClan.get(fact.clan_tag)
    if (!bucket || !clan) continue
    if (!players.has(fact.player_tag)) players.set(fact.player_tag, {name: fact.player_tag, tag: fact.player_tag, clanTag: fact.clan_tag, townHall: 0, leagueId: null, trophies: 0, currentMember: false, metrics: emptyAnalyticsMetrics()})
    const player = players.get(fact.player_tag)!, value = Number(fact.value)
    if (fact.metric === "active") {
      active.add(fact.player_tag)
      const clanSet = clanActive.get(clan.tag) ?? new Set<string>(); clanSet.add(fact.player_tag); clanActive.set(clan.tag,clanSet)
      const daySet = dailyActive.get(day) ?? new Set<string>(); daySet.add(fact.player_tag); dailyActive.set(day,daySet)
      player.metrics.active = 1
    } else { totals[fact.metric] += value; bucket[fact.metric] += value; clan.metrics[fact.metric] += value; player.metrics[fact.metric] += value }
  }
  totals.active = active.size
  for (const clan of clans) clan.metrics.active = clanActive.get(clan.tag)?.size ?? 0
  for (const [day,set] of dailyActive) days.get(day)!.active = set.size
  for (const movement of report.movements) {
    const metric = movement.type === "join" ? "joins" : "leaves"
    totals[metric]++; days.get(dayOf(movement.time))![metric]++; byClan.get(movement.clanTag)!.metrics[metric]++
  }
  // Resolve former contributors without exposing account ownership or hidden Discord links.
  const former = [...players.keys()].filter(tag => !current.has(tag))
  if (former.length) {
    const names = yield* database(sql<{tag: string; name: string; townhall_level: number}>`SELECT tag,name,townhall_level FROM basic_player WHERE tag=ANY(${former}::text[])`)
    for (const name of names) { const player = players.get(name.tag)!; player.name = name.name; player.townHall = name.townhall_level }
  }
  report.cwl = (yield* database(sql<{clan_tag: string; season: string; cwl_league_id: number; stars: number; wins: number; group_rank: number | null}>`
    SELECT clan_tag,season,cwl_league_id,stars,wins,group_rank FROM cwl_standings WHERE clan_tag=ANY(${requested}::text[])
    AND season>=${query.start.slice(0,7)} AND season<=${query.end.slice(0,7)} ORDER BY season,clan_tag`))
    .map(row => ({clanTag: row.clan_tag, season: row.season, leagueId: row.cwl_league_id, stars: row.stars, wins: row.wins, rank: row.group_rank}))
  const archivedIds = yield* database(sql<{cwl_id:string}>`SELECT DISTINCT g.cwl_id FROM cwl_groups g
    JOIN cwl_group_clans c ON c.cwl_id=g.cwl_id WHERE c.clan_tag=ANY(${requested}::text[])
    AND left(g.season,7)>=${query.start.slice(0,7)} AND left(g.season,7)<=${dayOf(new Date(+window.until-1)).slice(0,7)}`)
  if (archivedIds.length) {
    const groups = yield* loadCwlGroupsByIds(archivedIds.map(row=>row.cwl_id))
    const wars = yield* loadCwlWars(groups)
    report.cwl = analyticsCwlHistory(report.cwl,groups,wars,requested)
  }
  report.rankings = (yield* database(sql<{clan_tag: string; ranking_type: string; rank: number; points: number}>`
    SELECT clan_tag,ranking_type,rank,points FROM clan_rankings_current WHERE clan_tag=ANY(${requested}::text[]) AND location_id='global' ORDER BY rank`))
    .map(row => ({clanTag: row.clan_tag, type: row.ranking_type, rank: row.rank, points: row.points}))
  const leagueCounts = new Map<number,number>()
  for (const player of players.values()) if (player.currentMember && player.leagueId !== null) leagueCounts.set(player.leagueId,(leagueCounts.get(player.leagueId)??0)+1)
  if ([...leagueCounts.keys()].some(id=>id>=105000000 && !lookupStaticItem("league_tiers",id)))
    yield* prepareStaticMetadata(input.bindings,["league_tiers"]).pipe(Effect.catch(()=>Effect.void))
  report.leagues = [...leagueCounts].flatMap(([id,count])=>{
    const name=lookupStaticItem("league_tiers",id)?.name ?? (id===29000022?"Legend League":undefined)
    return name ? [{id,name,count}] : []
  }).sort((a,b)=>b.id-a.id)
  if (tags.length) report.legends=(yield* database(sql<{player_name: string; player_tag: string; season: string; rank: number; trophies: number}>`
    SELECT player_name,player_tag,season,rank,trophies FROM legend_history WHERE player_tag=ANY(${tags}::text[])
    AND season>=${query.start.slice(0,7)} AND season<=${query.end.slice(0,7)} ORDER BY rank,season DESC,player_tag LIMIT 100`))
    .map(row=>({name:row.player_name,tag:row.player_tag,season:row.season,rank:row.rank,trophies:row.trophies}))
  report.days = [...days].map(([day,metrics]) => ({day,metrics})); report.players = [...players.values()]
  return report
})
