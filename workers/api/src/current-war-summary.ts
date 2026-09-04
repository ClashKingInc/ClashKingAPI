import { CurrentCwlGroup, CurrentWarSummary, ProxyWarResponse, type CwlMemberEnrichment, type EnrichedCwlGroup } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import type { WorkerBindings } from "./environment.js"
import { correctTag } from "./home.js"
import { readBoundedJson } from "./request-body.js"
import { lookupStaticItem } from "./static-metadata.js"

type Group = typeof CurrentCwlGroup.Type
type War = typeof ProxyWarResponse.Type
type Member = NonNullable<War["clan"]>["members"][number]
type GroupMember = Group["clans"][number]["members"][number]
type Enrichment = typeof CwlMemberEnrichment.Type
interface Score {
  stars: number; destruction: number; count: number; missed: number;
  buckets: Record<string, Record<string, number>>; positions: number[]; orders: number[]; levels: number[];
  ownLevels: number[]; otherLevels: number[];
}
interface MemberStats { townHall: number; positions: number[]; attack: Score; defense: Score }
interface ClanStats { stars: number; wars: number; attacks: number; missed: number; inflicted: number; taken: number; members: Map<string, MemberStats> }
const score = (): Score => ({ stars: 0, destruction: 0, count: 0, missed: 0, buckets: {}, positions: [], orders: [], levels: [], ownLevels: [], otherLevels: [] })
const memberStats = (townHall: number): MemberStats => ({ townHall, positions: [], attack: score(), defense: score() })
const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places
const average = (values: readonly number[]) => values.length ? round(values.reduce((total, value) => total + value, 0) / values.length, 1) : null
const matchup = (stats: Score, lower: boolean) => stats.ownLevels.reduce((total, own, index) => {
  const other = stats.otherLevels[index]
  return total + (other !== undefined && (lower ? other < own : other > own) ? 1 : 0)
}, 0)
const scoreFields = (stats: Score) => ({ stars: stats.stars, "3_stars": stats.buckets["3"] ?? {}, "2_stars": stats.buckets["2"] ?? {},
  "1_star": stats.buckets["1"] ?? {}, "0_star": stats.buckets["0"] ?? {}, total_destruction: round(stats.destruction) })
const memberEnrichment = (stats: MemberStats): Enrichment => ({
  avgMapPosition: average(stats.positions), avgOpponentPosition: average(stats.attack.positions), avgAttackOrder: average(stats.attack.orders),
  avgTownHallLevel: stats.townHall > 0 ? stats.townHall : null, avgOpponentTownHallLevel: average(stats.attack.levels),
  avgAttackerPosition: average(stats.defense.positions), avgDefenseOrder: average(stats.defense.orders), avgAttackerTownHallLevel: average(stats.defense.levels),
  attackLowerTHLevel: matchup(stats.attack, true), attackUpperTHLevel: matchup(stats.attack, false),
  defenseLowerTHLevel: matchup(stats.defense, true), defenseUpperTHLevel: matchup(stats.defense, false),
  attacks: { ...scoreFields(stats.attack), attack_count: stats.attack.count, missed_attacks: stats.attack.missed },
  defense: { ...scoreFields(stats.defense), defense_count: stats.defense.count, missed_defenses: stats.defense.missed },
})

const recordHit = (stats: Score, attack: NonNullable<Member["bestOpponentAttack"]>, own: Member, other: Member | undefined) => {
  stats.stars += attack.stars; stats.destruction += attack.destructionPercentage; stats.count++
  stats.orders.push(attack.order)
  if (!other) return
  stats.positions.push(other.mapPosition)
  if (other.townhallLevel <= 0) return
  const bucket = stats.buckets[String(attack.stars)] ??= {}
  bucket[String(other.townhallLevel)] = (bucket[String(other.townhallLevel)] ?? 0) + 1
  if (own.townhallLevel > 0) stats.ownLevels.push(own.townhallLevel)
  stats.otherLevels.push(other.townhallLevel); stats.levels.push(other.townhallLevel)
}

/** Matches the mobile Go enrichment, not historical CWL standings (which add win bonuses). */
export const enrichLeagueInfo = (group: Group, wars: readonly War[]): typeof EnrichedCwlGroup.Type => {
  const summaries = new Map<string, ClanStats>(group.clans.map((clan) => [clan.tag, {
    stars: 0, wars: 0, attacks: 0, missed: 0, inflicted: 0, taken: 0,
    members: new Map(clan.members.map((member) => [member.tag, memberStats(member.townHallLevel)])),
  }]))
  for (const war of wars) {
    if (war.state !== "inWar" && war.state !== "warEnded") continue
    for (const [clan, opponent] of [[war.clan, war.opponent], [war.opponent, war.clan]]) {
      if (!clan) continue
      const summary = summaries.get(clan.tag)
      if (!summary) continue
      summary.stars += clan.stars; summary.wars++
      const opponents = new Map(opponent?.members.map((member) => [member.tag, member]))
      for (const member of clan.members) {
        const stats = summary.members.get(member.tag) ?? memberStats(member.townhallLevel)
        summary.members.set(member.tag, stats)
        if (member.townhallLevel > 0) stats.townHall = member.townhallLevel
        stats.positions.push(member.mapPosition)
        const attack = member.attacks?.[0]
        if (attack) {
          recordHit(stats.attack, attack, member, opponents.get(attack.defenderTag))
          summary.inflicted += attack.destructionPercentage; summary.attacks++
        } else if (war.state === "warEnded") { stats.attack.missed++; summary.missed++ }
        const defense = member.bestOpponentAttack
        if (defense) {
          recordHit(stats.defense, defense, member, opponents.get(defense.attackerTag))
          summary.taken += defense.destructionPercentage
        } else stats.defense.missed++
      }
    }
  }
  // Go's map iteration makes exact ties unstable; tag order is a deterministic final tie-breaker.
  const ranks = new Map([...summaries].sort(([aTag, a], [bTag, b]) => b.stars - a.stars || b.inflicted - a.inflicted ||
    (aTag < bTag ? -1 : aTag > bTag ? 1 : 0)).map(([tag], index) => [tag, index + 1]))
  let totalStars = 0, totalDestruction = 0
  const warLeague = group.war_league || group.clans.find((clan) => clan.warLeague?.name)?.warLeague?.name
  const clans = group.clans.map((clan) => {
    const stats = summaries.get(clan.tag)!
    totalStars += stats.stars; totalDestruction += stats.inflicted
    const levels: Record<string, number> = {}
    for (const member of clan.members) if (member.townHallLevel > 0) levels[String(member.townHallLevel)] = (levels[String(member.townHallLevel)] ?? 0) + 1
    return { ...enrichClanLeagueIcons(clan),
      total_stars: stats.stars, attack_count: stats.attacks, missed_attacks: stats.missed, total_destruction: round(stats.taken),
      total_destruction_inflicted: round(stats.inflicted), wars_played: stats.wars, rank: ranks.get(clan.tag)!, town_hall_levels: levels,
      members: clan.members.map((member: GroupMember) => ({ ...member, ...memberEnrichment(stats.members.get(member.tag)!) })),
    }
  })
  const fallback = warLeague && leagueIcons(warLeague)
  return { ...group, ...(warLeague ? { war_league: warLeague } : {}), ...(fallback ? { iconUrls: mergeIcons(group.iconUrls, fallback) } : {}),
    clans, total_stars: totalStars, total_destruction: round(totalDestruction) }
}
const mergeIcons = (existing: { small?: string; medium?: string; tiny?: string } | undefined, fallback: { small?: string; medium?: string; tiny?: string }) => ({
  ...existing,
  ...(existing?.small || fallback.small ? { small: existing?.small || fallback.small! } : {}),
  ...(existing?.medium || fallback.medium ? { medium: existing?.medium || fallback.medium! } : {}),
  ...(existing?.tiny || fallback.tiny ? { tiny: existing?.tiny || fallback.tiny! } : {}),
})
const leagueIcons = (name: string) => lookupStaticItem("war_leagues", name)?.iconUrls ??
  (name.trim() === "Unranked" ? lookupStaticItem("league_tiers", "Unranked")?.iconUrls : undefined)
export const enrichClanLeagueIcons = <A extends { readonly warLeague?: { readonly id: number; readonly name: string; readonly iconUrls?: { readonly small?: string; readonly medium?: string; readonly tiny?: string } } }>(clan: A): A => {
  const league = clan.warLeague
  const fallback = league && leagueIcons(league.name)
  return league && fallback ? { ...clan, warLeague: { ...league, iconUrls: mergeIcons(league.iconUrls, fallback) } } : clan
}

export const extractLeagueWarTags = (group: Pick<Group, "rounds">): string[] => [...new Set(group.rounds.flatMap((round) =>
  round.warTags.map(correctTag).filter((tag) => tag !== "" && tag !== "#" && tag !== "#0")))]

/** CWL is active from day 1 at 08:00 UTC until day 11 at 08:00 UTC, exclusive. */
export const isCwlWindow = (now: Date): boolean => now.getTime() >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 8) &&
  now.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 11, 8)

const proxyJson = <A, I>(bindings: WorkerBindings, path: string, schema: Schema.Codec<A, I>) => Effect.gen(function* () {
  const response = yield* Effect.tryPromise({ try: (signal) => bindings.CLASH_PROXY.fetch(new Request(`https://clash-proxy.internal/v1/${path}`, { signal })), catch: (cause) => cause })
  if (!response.ok) {
    yield* Effect.tryPromise({ try: () => response.body?.cancel() ?? Promise.resolve(), catch: (cause) => cause })
    return null
  }
  return yield* Schema.decodeUnknownEffect(schema)(yield* readBoundedJson(response))
}).pipe(Effect.timeout("15 seconds"), Effect.catch(() => Effect.succeed(null)))

/** The current-war source is live Clash data; historical SQL archives are not a fallback. */
export const currentWarSummary = (bindings: WorkerBindings, rawTag: string, now = new Date()): Effect.Effect<typeof CurrentWarSummary.Type> => Effect.gen(function* () {
  const tag = correctTag(rawTag)
  const current = yield* proxyJson(bindings, `clans/${encodeURIComponent(tag)}/currentwar`, ProxyWarResponse)
  const isInWar = current !== null && current.state !== "" && current.state !== "notInWar"
  let leagueInfo: typeof EnrichedCwlGroup.Type | null = null
  let leagueWars: Array<War & { war_tag: string }> = []
  if (isCwlWindow(now)) {
    const group = yield* proxyJson(bindings, `clans/${encodeURIComponent(tag)}/currentwar/leaguegroup`, CurrentCwlGroup)
    if (group && group.state !== "" && group.state !== "notInWar") {
      const tags = extractLeagueWarTags(group)
      // Normal groups contain 28 wars; reject abusive provider payloads rather than fan out without a bound.
      if (tags.length <= 64) {
        const fetched = yield* Effect.forEach(tags, (warTag) => proxyJson(bindings, `clanwarleagues/wars/${encodeURIComponent(warTag)}`, ProxyWarResponse).pipe(
          Effect.map((war) => war && war.state !== "notInWar" ? { ...war, war_tag: warTag } : null),
        ), { concurrency: 10 })
        leagueWars = fetched.filter((war) => war !== null)
        leagueInfo = enrichLeagueInfo(group, leagueWars)
      }
    }
  }
  return { clan_tag: tag, isInWar, isInCwl: !isInWar && leagueInfo !== null,
    war_info: isInWar ? { state: "war", currentWarInfo: current!, bypass: false } : { state: "notInWar" },
    league_info: leagueInfo, war_league_infos: leagueWars }
})
