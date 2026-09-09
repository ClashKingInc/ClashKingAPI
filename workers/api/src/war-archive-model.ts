import { Schema } from "effect"
import type { WarResponse } from "@clashking/api-contracts"

// Go archives omit zero-valued clan/member fields. Defaults below implement that
// persisted format; required war identity/timing and attack fields stay strict.
const ArchiveAttack = Schema.Struct({ defenderTag: Schema.String, stars: Schema.Number, destructionPercentage: Schema.Number, duration: Schema.Number, order: Schema.Number })
const ArchiveMember = Schema.Struct({ tag: Schema.String, name: Schema.optionalKey(Schema.String), townhallLevel: Schema.optionalKey(Schema.Number), mapPosition: Schema.optionalKey(Schema.Number), attacks: Schema.optionalKey(Schema.Array(ArchiveAttack)) })
const ArchiveClan = Schema.Struct({ tag: Schema.String, name: Schema.optionalKey(Schema.String), badgeToken: Schema.optionalKey(Schema.String), clanLevel: Schema.optionalKey(Schema.Number), attacks: Schema.optionalKey(Schema.Number), stars: Schema.optionalKey(Schema.Number), destructionPercentage: Schema.optionalKey(Schema.Number), members: Schema.Array(ArchiveMember) })
export const ArchivedWar = Schema.Struct({ warTag: Schema.optionalKey(Schema.String), type: Schema.String, state: Schema.String, teamSize: Schema.Number, attacksPerMember: Schema.Number, preparationStartTime: Schema.String, startTime: Schema.optionalKey(Schema.NullOr(Schema.String)), endTime: Schema.String, battleModifier: Schema.optionalKey(Schema.String), clan: ArchiveClan, opponent: ArchiveClan })
export type ArchivedWar = typeof ArchivedWar.Type
export type ArchivedClan = typeof ArchiveClan.Type
export type ArchivedMember = typeof ArchiveMember.Type

// Persisted format comes from clashking_schemas/database/wararchive, not the
// API's hydrated Go struct. Type belongs to the SQL row; nil slices encode null.
const StoredMember = Schema.Struct({ tag: Schema.String, name: Schema.String, townhallLevel: Schema.Number, mapPosition: Schema.Number, attacks: Schema.NullOr(Schema.Array(ArchiveAttack)) })
const StoredClan = Schema.Struct({ tag: Schema.String, name: Schema.String, badgeToken: Schema.String, clanLevel: Schema.Number, attacks: Schema.Number, stars: Schema.Number, destructionPercentage: Schema.Number, members: Schema.NullOr(Schema.Array(StoredMember)) })
export const StoredArchivedWar = Schema.Struct({ warTag: Schema.optionalKey(Schema.String), state: Schema.String, teamSize: Schema.Number, attacksPerMember: Schema.Number, preparationStartTime: Schema.String, startTime: Schema.String, endTime: Schema.String, battleModifier: Schema.String, clan: StoredClan, opponent: StoredClan })
export const hydrateArchivedWar = (stored: typeof StoredArchivedWar.Type, warType: string): ArchivedWar => {
  const clan = (value: typeof StoredClan.Type) => ({ ...value, members: (value.members ?? []).map((member) => ({ ...member, attacks: member.attacks ?? [] })) })
  return { ...stored, type: warType, clan: clan(stored.clan), opponent: clan(stored.opponent) }
}

export const badgeUrls = (raw: string | null | undefined) => {
  const token = raw?.trim().replace(/\.png$/u, "") ?? ""
  const url = (size: number) => token ? `https://api-assets.clashofclans.com/badges/${size}/${token}.png` : ""
  return { small: url(70), medium: url(200), large: url(512) }
}
export const clashTime = (value: string | Date) => new Date(value).toISOString().replace(/[-:]/gu, "")
const officialState = (state: string) => {
  switch (state.trim().toLowerCase()) {
    case "notinwar": return "notInWar"
    case "preparation": return "preparation"
    case "inwar": return "inWar"
    case "ended": case "warended": return "warEnded"
    default: return state
  }
}
export const archiveMemberIdentity = (member: ArchivedMember) => ({ tag: member.tag, name: member.name ?? "", townhallLevel: member.townhallLevel ?? 0, mapPosition: member.mapPosition ?? 0 })
export const archiveClanIdentity = (clan: ArchivedClan) => ({ tag: clan.tag, name: clan.name ?? "", badgeUrls: badgeUrls(clan.badgeToken), clanLevel: clan.clanLevel ?? 0, attacks: clan.attacks ?? 0, stars: clan.stars ?? 0, destructionPercentage: clan.destructionPercentage ?? 0 })
const officialAttacks = (clan: ArchivedClan) => clan.members.flatMap((member) => (member.attacks ?? []).map((attack) => ({ ...attack, attackerTag: member.tag })))
const officialClan = (clan: ArchivedClan, opponent: ArchivedClan) => {
  const opposition = officialAttacks(opponent)
  return { ...archiveClanIdentity(clan), members: clan.members.map((member) => {
    const attacks = (member.attacks ?? []).map((attack) => ({ ...attack, attackerTag: member.tag }))
    const defenses = opposition.filter((attack) => attack.defenderTag === member.tag)
    const best = [...defenses].sort((a, b) => b.stars - a.stars || b.destructionPercentage - a.destructionPercentage || a.order - b.order)[0]
    return { ...archiveMemberIdentity(member), ...(attacks.length ? { attacks } : {}), opponentAttacks: defenses.length, ...(best ? { bestOpponentAttack: best } : {}) }
  }) }
}
export const officialArchiveWar = (war: ArchivedWar, clanTag: string): typeof WarResponse.Type => {
  const reversed = war.opponent.tag === clanTag && war.clan.tag !== clanTag
  const clan = reversed ? war.opponent : war.clan
  const opponent = reversed ? war.clan : war.opponent
  return {
    state: officialState(war.state), teamSize: war.teamSize,
    battleModifier: war.battleModifier ?? "", preparationStartTime: clashTime(war.preparationStartTime), endTime: clashTime(war.endTime),
    ...(war.startTime ? { startTime: clashTime(war.startTime), ...(war.type === "cwl" ? { warStartTime: clashTime(war.startTime) } : {}) } : {}),
    ...(war.type === "cwl" ? (war.warTag ? { tag: war.warTag } : {}) : { attacksPerMember: war.attacksPerMember }),
    clan: officialClan(clan, opponent), opponent: officialClan(opponent, clan),
  }
}
export const archiveAttackFacts = (warId: string, war: ArchivedWar) => [
  [war.clan, war.opponent], [war.opponent, war.clan],
].flatMap(([attacking, defending]) => {
  if (!attacking || !defending) return []
  const defenders = new Map(defending.members.map((member) => [member.tag, member]))
  return attacking.members.flatMap((attacker) => (attacker.attacks ?? []).map((attack) => {
    const defender = defenders.get(attack.defenderTag)
    return {
      warId, warEndTime: new Date(war.endTime), warType: war.type, warSize: war.teamSize,
      battleModifier: war.battleModifier ?? "", attackingClanTag: attacking.tag, defendingClanTag: defending.tag,
      attackerTag: attacker.tag, attackerName: attacker.name ?? "", defenderTag: defender?.tag ?? "", defenderName: defender?.name ?? "",
      attackerTownhall: attacker.townhallLevel ?? 0, defenderTownhall: defender?.townhallLevel ?? 0,
      attackerMapPosition: attacker.mapPosition ?? 0, defenderMapPosition: defender?.mapPosition ?? 0,
      stars: attack.stars, destructionPercentage: attack.destructionPercentage, duration: attack.duration, attackOrder: attack.order,
    }
  }))
})
export type ArchiveAttackFact = ReturnType<typeof archiveAttackFacts>[number]

export const playerWarHistoryItem = (tag: string, warId: string, war: ArchivedWar) => {
  let clan = war.clan, opponent = war.opponent
  let member = clan.members.find((value) => value.tag === tag)
  if (!member) {
    member = opponent.members.find((value) => value.tag === tag)
    if (!member) return undefined
    ;[clan, opponent] = [opponent, clan]
  }
  const facts = archiveAttackFacts(warId, war)
  const firstOrder = new Map<string, number>()
  for (const fact of facts) firstOrder.set(fact.defenderTag, Math.min(firstOrder.get(fact.defenderTag) ?? Infinity, fact.attackOrder))
  const entry = (fact: ArchiveAttackFact, attacking: boolean) => ({
    stars: fact.stars, destructionPercentage: fact.destructionPercentage, order: fact.attackOrder, duration: fact.duration,
    fresh: firstOrder.get(fact.defenderTag) === fact.attackOrder,
    player: attacking
      ? { tag: fact.defenderTag, name: fact.defenderName, townhallLevel: fact.defenderTownhall, mapPosition: fact.defenderMapPosition }
      : { tag: fact.attackerTag, name: fact.attackerName, townhallLevel: fact.attackerTownhall, mapPosition: fact.attackerMapPosition },
  })
  return {
    teamSize: war.teamSize, attacksPerMember: war.attacksPerMember,
    preparationStartTime: clashTime(war.preparationStartTime), endTime: clashTime(war.endTime),
    ...(war.startTime ? { startTime: clashTime(war.startTime) } : {}),
    clan: archiveClanIdentity(clan), opponent: archiveClanIdentity(opponent), type: war.type,
    player: archiveMemberIdentity(member),
    attacks: facts.filter((fact) => fact.attackerTag === tag).map((fact) => entry(fact, true)).sort((a, b) => a.order - b.order),
    defenses: facts.filter((fact) => fact.defenderTag === tag).map((fact) => entry(fact, false)).sort((a, b) => a.order - b.order),
  }
}
