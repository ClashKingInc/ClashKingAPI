import type { InitializationAttack, InitializationMember, InitializationPlayerWar, InitializationPlayerWarStats, InitializationClanWarStats, InitializationWarData } from "../../../packages/api-contracts/src/initialization.js"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { readArchiveWar, MAX_ARCHIVE_PAGE_BYTES } from "./war-archive.js"
import { officialArchiveWar, type ArchivedWar } from "./war-archive-model.js"

type Attack = typeof InitializationAttack.Type
type Member = typeof InitializationMember.Type
type PlayerWar = typeof InitializationPlayerWar.Type
interface Aggregate { name: string; tag: string; townhallLevel: number; attacks: Attack[]; defenses: Attack[]; wars: PlayerWar[] }
const newAggregate = (member: Member): Aggregate => ({ name: member.name, tag: member.tag, townhallLevel: member.townhallLevel, attacks: [], defenses: [], wars: [] })
const starsTemplate = () => ({ "0": 0, "1": 0, "2": 0, "3": 0 })
const matchupStats = (attacks: readonly Attack[], defense: boolean) => {
  const groups = new Map<string, { count: number; stars: number; destruction: number; starsCount: ReturnType<typeof starsTemplate> }>()
  const starsCount = starsTemplate()
  for (const attack of attacks) {
    const stars = String(attack.stars) as keyof typeof starsCount
    starsCount[stars] = (starsCount[stars] ?? 0) + 1
    const own = defense ? attack.defender?.townhallLevel ?? 0 : attack.attacker.townhallLevel
    const enemy = defense ? attack.attacker.townhallLevel : attack.defender?.townhallLevel ?? 0
    const key = `${own}vs${enemy}`
    const group = groups.get(key) ?? { count: 0, stars: 0, destruction: 0, starsCount: starsTemplate() }
    group.count++; group.stars += attack.stars; group.destruction += attack.destructionPercentage
    group.starsCount[stars] = (group.starsCount[stars] ?? 0) + 1
    groups.set(key, group)
  }
  return { starsCount, matchups: Object.fromEntries([...groups].map(([key, group]) => [key, {
    count: group.count, averageStars: Math.round(group.stars / group.count * 100) / 100,
    averageDestruction: Math.round(group.destruction / group.count * 100) / 100, starsCount: group.starsCount,
  }])) }
}
export const initializationWarStats = (aggregate: Aggregate): typeof InitializationPlayerWarStats.Type["stats"] => {
  const bucket = (type: string) => {
    const attacks = aggregate.attacks.filter((attack) => type === "all" || attack.war_type === type)
    const defenses = aggregate.defenses.filter((attack) => type === "all" || attack.war_type === type)
    const wars = aggregate.wars.filter((war) => type === "all" || war.war_data.type === type)
    const attackStats = matchupStats(attacks, false), defenseStats = matchupStats(defenses, true)
    return { warsCounts: wars.length, totalAttacks: attacks.length, totalDefenses: defenses.length,
      missedAttacks: wars.reduce((sum, war) => sum + war.missedAttacks, 0), missedDefenses: wars.reduce((sum, war) => sum + war.missedDefenses, 0),
      starsCount: attackStats.starsCount, starsCountDef: defenseStats.starsCount, byEnemyTownhall: attackStats.matchups, byEnemyTownhallDef: defenseStats.matchups }
  }
  return { all: bucket("all"), random: bucket("random"), cwl: bucket("cwl"), friendly: bucket("friendly") }
}
export const initializationWarMembers = (id: string, war: ArchivedWar) => {
  const official = officialArchiveWar(war, war.clan.tag)
  const mini = (member: typeof official.clan.members[number]) => ({ name: member.name, tag: member.tag, townhallLevel: member.townhallLevel, mapPosition: member.mapPosition, opponentAttacks: member.opponentAttacks ?? 0 })
  const members = [...official.clan.members, ...official.opponent.members]
  const byTag = new Map(members.map((member) => [member.tag, member]))
  const firstOrders = new Map<string, number>()
  for (const member of members) for (const attack of member.attacks ?? []) if (attack.order && attack.defenderTag) firstOrders.set(attack.defenderTag, Math.min(firstOrders.get(attack.defenderTag) ?? Infinity, attack.order))
  const attacks = members.flatMap((member) => (member.attacks ?? []).map((attack): Attack => {
    const defender = byTag.get(attack.defenderTag)
    return { ...attack, attacker: mini(member), ...(defender ? { defender: mini(defender) } : {}), attack_order: attack.order,
      fresh: !!attack.order && firstOrders.get(attack.defenderTag) === attack.order, war_type: war.type }
  }))
  const data = new Map<string, Member>(members.map((member) => [member.tag, { ...mini(member), attacks: attacks.filter((attack) => attack.attackerTag === member.tag), defenses: attacks.filter((attack) => attack.defenderTag === member.tag) }]))
  const { members: _clanMembers, ...clan } = official.clan
  const { members: _opponentMembers, ...opponent } = official.opponent
  const clean: typeof InitializationWarData.Type = { ...official, clan, opponent, war_id: id, type: war.type }
  return { clean, data, original: byTag }
}

/** Selected pages are bounded per target; retain projections rather than full
 * archives, and reject a page before accumulated output exceeds 8 MiB. */
export const queryInitializationWarStats = (players: readonly string[], clans: readonly string[], start: Date, end: Date) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const refs = new Map<string, { id: string; prep: Date | string; end: Date | string }>()
  const add = (rows: readonly { war_id: string; prep_time: Date | string; end_time: Date | string }[]) => {
    for (const row of rows) {
      refs.set(row.war_id, { id: row.war_id, prep: row.prep_time, end: row.end_time })
    }
  }
  for (const player of players) add(yield* sql<{ war_id: string; prep_time: Date | string; end_time: Date | string }>`SELECT war_id::text, prep_time, end_time FROM wars
    WHERE prep_time >= ${start} AND prep_time <= ${end} AND war_id IN (SELECT unnest(war_ids) FROM player_war_history WHERE player_tag = ${player})
    ORDER BY prep_time DESC LIMIT 50`.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Initialization player wars failed" }))))
  for (const clan of clans) add(yield* sql<{ war_id: string; prep_time: Date | string; end_time: Date | string }>`SELECT war_id::text, prep_time, end_time FROM wars
    WHERE prep_time >= ${start} AND prep_time <= ${end} AND (clan_tag = ${clan} OR opponent_tag = ${clan})
    ORDER BY prep_time DESC LIMIT 50`.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Initialization clan wars failed" }))))
  const playerAggregates = new Map<string, Aggregate>()
  const playerCounts = new Map<string, number>()
  const clanCounts = new Map<string, number>()
  const clanAggregates = new Map(clans.map((tag) => [tag, { players: new Map<string, Aggregate>(), wars: [] as Array<typeof InitializationClanWarStats.Type.wars[number]> }]))
  let bytes = 0
  for (const ref of [...refs.values()].sort((a, b) => new Date(b.prep).getTime() - new Date(a.prep).getTime())) {
    const entry = yield* readArchiveWar(ref.id, ref.end)
    if (!entry) continue
    const { clean, data, original } = initializationWarMembers(ref.id, entry.war)
    const addMember = (store: Map<string, Aggregate>, member: Member) => {
      const aggregate = store.get(member.tag) ?? newAggregate(member)
      aggregate.name ||= member.name; aggregate.townhallLevel = Math.max(aggregate.townhallLevel, member.townhallLevel)
      aggregate.attacks.push(...member.attacks); aggregate.defenses.push(...member.defenses)
      const source = original.get(member.tag)
      const playerWar = { war_data: clean, members: [member], missedAttacks: Math.max(0, (clean.attacksPerMember ?? 0) - (source?.attacks?.length ?? 0)), missedDefenses: source?.bestOpponentAttack ? 0 : 1 }
      aggregate.wars.push(playerWar); store.set(member.tag, aggregate)
      bytes += new TextEncoder().encode(JSON.stringify(playerWar)).byteLength
    }
    for (const tag of players) {
      const member = data.get(tag)
      if (member && (playerCounts.get(tag) ?? 0) < 50) { addMember(playerAggregates, member); playerCounts.set(tag, (playerCounts.get(tag) ?? 0) + 1) }
    }
    for (const clan of [entry.war.clan, entry.war.opponent]) if (clanAggregates.has(clan.tag) && (clanCounts.get(clan.tag) ?? 0) < 50) {
      clanCounts.set(clan.tag, (clanCounts.get(clan.tag) ?? 0) + 1)
      const aggregate = clanAggregates.get(clan.tag)!
      const members = clan.members.flatMap((member) => { const item = data.get(member.tag); return item ? [item] : [] })
      for (const member of members) addMember(aggregate.players, member)
      const clanWar = { war_data: clean, members }
      aggregate.wars.push(clanWar); bytes += new TextEncoder().encode(JSON.stringify(clanWar)).byteLength
    }
    if (bytes > MAX_ARCHIVE_PAGE_BYTES) return yield* new InvalidRequest({ message: "Initialization war history exceeds the response size limit; initialize fewer accounts" })
  }
  const result = (aggregate: Aggregate): typeof InitializationPlayerWarStats.Type => ({ name: aggregate.name, tag: aggregate.tag, townhallLevel: aggregate.townhallLevel,
    stats: initializationWarStats(aggregate), timeRange: { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) }, wars: aggregate.wars })
  return { war_stats: players.flatMap((tag) => { const value = playerAggregates.get(tag); return value ? [result(value)] : [] }),
    clan_war_stats: clans.map((tag) => { const value = clanAggregates.get(tag)!; return { clan_tag: tag, players: [...value.players.values()].sort((a, b) => a.tag < b.tag ? -1 : 1).map(result), wars: value.wars } }) }
})
