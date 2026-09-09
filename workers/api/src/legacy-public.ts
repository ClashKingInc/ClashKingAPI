import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { loadArchiveWars } from "./war-archive.js"
import { badgeUrls, clashTime, type ArchivedClan, type ArchivedMember, type ArchivedWar } from "./war-archive-model.js"

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "content-type": "application/json; charset=utf-8" } })
const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "Legacy public data query failed" })
const archiveAttack = (attackerTag: string, attack: NonNullable<ArchivedMember["attacks"]>[number]) => ({ ...attack, attackerTag })
const memberIdentity = (member: ArchivedMember, opponentAttacks?: number) => ({
  tag: member.tag, name: member.name ?? "", townhallLevel: member.townhallLevel ?? 0, mapPosition: member.mapPosition ?? 0,
  ...(opponentAttacks === undefined ? {} : { opponentAttacks }),
})
const attacksByDefender = (clan: ArchivedClan) => {
  const result = new Map<string, ReturnType<typeof archiveAttack>[]>()
  for (const member of clan.members) for (const attack of member.attacks ?? []) {
    const values = result.get(attack.defenderTag) ?? []
    values.push(archiveAttack(member.tag, attack))
    result.set(attack.defenderTag, values)
  }
  return result
}
const legacyClan = (clan: ArchivedClan, opponent: ArchivedClan, includeMembers: boolean) => {
  const result = {
    tag: clan.tag, name: clan.name ?? "", badgeUrls: badgeUrls(clan.badgeToken), clanLevel: clan.clanLevel ?? 0,
    attacks: clan.attacks ?? 0, stars: clan.stars ?? 0, destructionPercentage: clan.destructionPercentage ?? 0,
  }
  if (!includeMembers) return result
  const defenses = attacksByDefender(opponent)
  return { ...result, members: clan.members.map((member) => {
    const against = defenses.get(member.tag) ?? []
    const best = [...against].sort((a, b) => b.stars - a.stars || b.destructionPercentage - a.destructionPercentage || a.order - b.order)[0]
    const attacks = (member.attacks ?? []).map((attack) => archiveAttack(member.tag, attack))
    return { ...memberIdentity(member, against.length), ...(attacks.length ? { attacks } : {}), ...(best ? { bestOpponentAttack: best } : {}) }
  }) }
}
const normalizeState = (state: string) => {
  switch (state.trim().toLowerCase()) {
    case "notinwar": return "notInWar"
    case "inwar": return "inWar"
    case "ended": case "warended": return "warEnded"
    default: return state
  }
}
export const legacyWar = (war: ArchivedWar, includeMembers: boolean) => ({
  state: normalizeState(war.state), teamSize: war.teamSize,
  ...(war.type === "cwl" ? {} : { attacksPerMember: war.attacksPerMember }),
  ...(war.battleModifier ? { battleModifier: war.battleModifier } : {}),
  preparationStartTime: clashTime(war.preparationStartTime),
  ...(war.startTime ? { startTime: clashTime(war.startTime), ...(war.type === "cwl" ? { warStartTime: clashTime(war.startTime) } : {}) } : {}),
  endTime: clashTime(war.endTime), clan: legacyClan(war.clan, war.opponent, includeMembers),
  opponent: legacyClan(war.opponent, war.clan, includeMembers),
  ...(war.type === "cwl" && war.warTag ? { tag: war.warTag } : {}),
})

export const fixLegacyTag = (raw: string) => {
  let decoded = raw
  try { decoded = decodeURIComponent(raw) } catch { /* retain the path value */ }
  const tag = decoded.trim().toUpperCase().replace(/^#/u, "").replace(/[^A-Z0-9]+/gu, "").replaceAll("O", "0")
  return tag ? `#${tag}` : ""
}
const integer = (query: URLSearchParams, name: string, fallback: number) => {
  const raw = query.get(name)
  if (raw === null || raw === "") return fallback
  if (!/^-?\d+(?:\.0+)?$/u.test(raw)) throw new InvalidRequest({ message: `${name} must be an integer`, status: 422 })
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) throw new InvalidRequest({ message: `${name} must be an integer`, status: 422 })
  return value
}
const match = (path: string, pattern: RegExp) => pattern.exec(path)?.slice(1).map((value) => decodeURIComponent(value))
const legacyDate = (value: Date | string) => `${new Date(value).toISOString().slice(0, -1)}000`

interface JoinLeaveRow { readonly time: Date | string; readonly type: string; readonly clan_tag: string; readonly player_tag: string; readonly player_name: string | null; readonly townhall_level: number; readonly clan_name: string | null }
const correctedPlayerEvents = (source: readonly JoinLeaveRow[]) => {
  const events = [...source]
  const corrected: JoinLeaveRow[] = []
  while (events.length) {
    const event = events.shift()!
    corrected.push(event)
    if (event.type !== "join") continue
    const index = events.findIndex((candidate) => candidate.type === "leave" && candidate.player_tag === event.player_tag && candidate.clan_tag === event.clan_tag)
    if (index < 0) continue
    const leave = events.splice(index, 1)[0]!
    corrected.push({ ...leave, time: events.find((candidate) => candidate.type === "join")?.time ?? leave.time })
  }
  return corrected.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime() ||
    (a.type === b.type ? 0 : a.type === "leave" ? -1 : 1))
}
const joinLeave = (tag: string, query: URLSearchParams, scope: "clan" | "player") => Effect.gen(function* () {
  const start = new Date(integer(query, "timestamp_start", 0) * 1000)
  const end = new Date(integer(query, "time_stamp_end", 9_999_999_999) * 1000)
  const limit = integer(query, "limit", 250)
  if (limit <= 0) return { items: [] }
  const sql = yield* SqlClient.SqlClient
  const column = scope === "player" ? sql`jl.player_tag` : sql`jl.clan_tag`
  const rows = yield* sql<JoinLeaveRow>`SELECT jl."time", jl."type", jl.clan_tag, jl.player_tag, jl.player_name,
    jl.townhall_level, clan.name AS clan_name FROM join_leave_history jl
    LEFT JOIN basic_clan clan ON clan.tag = jl.clan_tag WHERE ${column} = ${tag}
    AND jl."time" >= ${start} AND jl."time" <= ${end}
    ORDER BY jl."time" ${scope === "player" ? sql`ASC` : sql`DESC`} LIMIT ${limit}`.pipe(Effect.mapError(databaseFailure))
  const ordered = scope === "player" ? correctedPlayerEvents(rows).reverse() : rows
  return { items: ordered.map((row) => ({ name: row.player_name ?? "", tag: row.player_tag, th: row.townhall_level,
    time: legacyDate(row.time), clan: row.clan_tag, type: row.type, ...(scope === "player" ? { clan_name: row.clan_name ?? "" } : {}) })) }
})

const queryWarIds = (tag: string, query: URLSearchParams, player: boolean) => Effect.gen(function* () {
  const start = new Date(integer(query, "timestamp_start", 0) * 1000)
  const end = new Date(integer(query, "timestamp_end", player ? 2_527_625_513 : 9_999_999_999) * 1000)
  let limit = integer(query, "limit", 50)
  if (limit <= 0) return []
  if (player) limit = Math.min(limit, 100)
  const sql = yield* SqlClient.SqlClient
  return yield* (player
    ? sql<{ war_id: string }>`SELECT selected.war_id::text FROM player_war_history history
      CROSS JOIN LATERAL unnest(history.war_ids) selected(war_id) JOIN wars war ON war.war_id = selected.war_id
      WHERE history.player_tag = ${tag} AND war.prep_time >= ${start} AND war.prep_time <= ${end}
      ORDER BY war.prep_time DESC, war.war_id DESC LIMIT ${limit}`
    : sql<{ war_id: string }>`SELECT war_id::text FROM wars WHERE (clan_tag = ${tag} OR opponent_tag = ${tag})
      AND prep_time >= ${start} AND prep_time <= ${end} ORDER BY end_time DESC LIMIT ${limit}`
  ).pipe(Effect.mapError(databaseFailure), Effect.map((rows) => rows.map((row) => row.war_id)))
})
const buildPlayerWarHit = (tag: string, war: ArchivedWar) => {
  let own = war.clan, opponent = war.opponent, member = own.members.find((value) => value.tag === tag)
  if (!member) { member = opponent.members.find((value) => value.tag === tag); [own, opponent] = [opponent, own] }
  if (!member) return undefined
  const first = new Map<string, number>()
  for (const clan of [war.clan, war.opponent]) for (const attacker of clan.members) for (const attack of attacker.attacks ?? []) first.set(attack.defenderTag, Math.min(first.get(attack.defenderTag) ?? Infinity, attack.order))
  const ownHits = attacksByDefender(own), opponentMembers = new Map(opponent.members.map((value) => [value.tag, value]))
  const attacks = (member.attacks ?? []).map((attack) => {
    const defender = opponentMembers.get(attack.defenderTag) ?? { tag: "" }
    return { ...archiveAttack(member!.tag, attack), fresh: first.get(attack.defenderTag) === attack.order,
      defender: memberIdentity(defender, ownHits.get(defender.tag)?.length ?? 0), attack_order: attack.order }
  })
  const defenses = opponent.members.flatMap((attacker) => (attacker.attacks ?? []).filter((attack) => attack.defenderTag === tag).map((attack) => ({
    ...archiveAttack(attacker.tag, attack), fresh: first.get(tag) === attack.order,
    attacker: memberIdentity(attacker, ownHits.get(attacker.tag)?.length ?? 0), attack_order: attack.order,
  }))).sort((a, b) => a.order - b.order)
  return { war_data: { ...legacyWar(war, false), type: war.type }, member_data: memberIdentity(member, defenses.length), attacks, defenses }
}

interface CwlGroupRow { readonly cwl_id: string; readonly season: string; readonly state: string; readonly rounds: unknown }
interface CwlClanRow { readonly clan_tag: string; readonly name: string; readonly clan_level: number; readonly badge_token: string; readonly member_tag: string | null; readonly member_name: string | null; readonly town_hall: number | null }
const decodeRounds = (raw: unknown): string[][] => {
  const value = typeof raw === "string" ? JSON.parse(raw) as unknown : raw
  if (!Array.isArray(value)) return []
  return value.map((round) => Array.isArray(round) ? round.filter((tag): tag is string => typeof tag === "string")
    : typeof round === "object" && round !== null && Array.isArray((round as { warTags?: unknown }).warTags)
      ? (round as { warTags: unknown[] }).warTags.filter((tag): tag is string => typeof tag === "string") : [])
}
const cwlGroup = (tag: string, season: string, hydrate: boolean) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const groups = yield* sql<CwlGroupRow>`SELECT groups.cwl_id, groups.season, groups.state, groups.rounds
    FROM cwl_groups groups JOIN cwl_group_clans clan ON clan.cwl_id = groups.cwl_id
    WHERE clan.clan_tag = ${tag} AND groups.season = ${season} ORDER BY groups.cwl_id DESC LIMIT 1`.pipe(Effect.mapError(databaseFailure))
  const group = groups[0]
  if (!group) return undefined
  const rows = yield* sql<CwlClanRow>`SELECT clan.clan_tag, clan.name, clan.clan_level, clan.badge_token,
    member.tag AS member_tag, member.name AS member_name, member.town_hall FROM cwl_group_clans clan
    LEFT JOIN cwl_group_members member ON member.cwl_id = clan.cwl_id AND member.clan_tag = clan.clan_tag
    WHERE clan.cwl_id = ${group.cwl_id} ORDER BY clan.clan_tag, member.tag`.pipe(Effect.mapError(databaseFailure))
  const clans: Array<{ tag: string; name: string; clanLevel: number; badgeUrls: ReturnType<typeof badgeUrls>; members: Array<{ tag: string; name: string; townHallLevel: number }> }> = []
  const index = new Map<string, number>()
  for (const row of rows) {
    let position = index.get(row.clan_tag)
    if (position === undefined) { position = clans.length; index.set(row.clan_tag, position); clans.push({ tag: row.clan_tag, name: row.name, clanLevel: row.clan_level, badgeUrls: badgeUrls(row.badge_token), members: [] }) }
    if (row.member_tag) clans[position]!.members.push({ tag: row.member_tag, name: row.member_name ?? "", townHallLevel: row.town_hall ?? 0 })
  }
  const rounds = decodeRounds(group.rounds)
  if (!hydrate) return { state: group.state, season: group.season, clans, rounds: rounds.map((warTags) => ({ warTags })) }
  const tags = [...new Set(rounds.flat().filter((warTag) => warTag && warTag !== "#0"))]
  const warRows = tags.length ? yield* sql<{ war_id: string; war_tag: string }>`SELECT war_id::text, war_tag FROM wars WHERE war_type = 'cwl' AND war_tag = ANY(${tags}::text[])`.pipe(Effect.mapError(databaseFailure)) : []
  const wars = yield* loadArchiveWars(warRows.map((row) => row.war_id))
  const byTag = new Map(warRows.flatMap((row) => { const war = wars.get(row.war_id); return war ? [[row.war_tag, { ...legacyWar(war, true), season: group.season }] as const] : [] }))
  return { state: group.state, season: group.season, clans, rounds: rounds.map((warTags) => ({ warTags: warTags.map((warTag) => byTag.get(warTag) ?? { tag: warTag }) })) }
})
export const normalizeLegacySeason = (season: string) => {
  const normalized = /^\d{4}-\d{2}$/u.test(season) ? `${season}-01` : season
  const parsed = /^\d{4}-\d{2}-\d{2}$/u.test(normalized) ? new Date(`${normalized}T00:00:00Z`) : undefined
  return parsed && !Number.isNaN(parsed.getTime()) && parsed < new Date("2026-06-14T00:00:00Z") ? normalized.slice(0, 7) : season
}
export const dispatchLegacyPublic = (request: Request) => Effect.gen(function* () {
  if (request.method !== "GET") return undefined
  const url = new URL(request.url), path = url.pathname
  let values = match(path, /^\/player\/([^/]+)\/warhits$/u)
  if (values) {
    const tag = fixLegacyTag(values[0]!), ids = yield* queryWarIds(tag, url.searchParams, true), wars = yield* loadArchiveWars(ids)
    return json({ items: ids.flatMap((id) => { const war = wars.get(id); const item = war && buildPlayerWarHit(tag, war); return item ? [item] : [] }) })
  }
  values = match(path, /^\/player\/([^/]+)\/join-leave$/u)
  if (values) return json(yield* joinLeave(fixLegacyTag(values[0]!), url.searchParams, "player"))
  values = match(path, /^\/clan\/([^/]+)\/join-leave$/u)
  if (values) return json(yield* joinLeave(fixLegacyTag(values[0]!), url.searchParams, "clan"))
  values = match(path, /^\/war\/([^/]+)\/previous$/u)
  if (values) {
    const ids = yield* queryWarIds(fixLegacyTag(values[0]!), url.searchParams, false), wars = yield* loadArchiveWars(ids)
    return json({ items: ids.flatMap((id) => { const war = wars.get(id); return war ? [legacyWar(war, true)] : [] }) })
  }
  values = match(path, /^\/war\/([^/]+)\/previous\/([^/]+)$/u)
  if (values) {
    const raw = values[1]!, target = /^\d{8}T\d{6}\.000Z$/u.test(raw) ? new Date(raw.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.000Z$/u, "$1-$2-$3T$4:$5:$6.000Z")) : new Date(NaN)
    if (Number.isNaN(target.getTime())) return yield* new InvalidRequest({ message: "invalid end_time", status: 422 })
    const sql = yield* SqlClient.SqlClient, tag = fixLegacyTag(values[0]!)
    const rows = yield* sql<{ war_id: string }>`SELECT war_id::text FROM wars WHERE (clan_tag = ${tag} OR opponent_tag = ${tag})
      AND end_time >= ${new Date(target.getTime() - 300_000)} AND end_time <= ${new Date(target.getTime() + 300_000)}
      ORDER BY abs(extract(epoch FROM end_time)::double precision - ${target.getTime() / 1000}), war_id LIMIT 1`.pipe(Effect.mapError(databaseFailure))
    const id = rows[0]?.war_id, wars = id ? yield* loadArchiveWars([id]) : new Map()
    return id && wars.get(id) ? json(legacyWar(wars.get(id)!, true)) : json({ detail: "War Not Found" }, 404)
  }
  values = match(path, /^\/cwl\/([^/]+)\/group$/u)
  if (values) {
    const now = new Date(), season = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
    const group = yield* cwlGroup(fixLegacyTag(values[0]!), season, false)
    return json(group ? { data: group } : null)
  }
  values = match(path, /^\/cwl\/([^/]+)\/([^/]+)$/u)
  if (values) {
    const group = yield* cwlGroup(fixLegacyTag(values[0]!), normalizeLegacySeason(values[1]!), true)
    return group ? json(group) : json({ detail: "No CWL Data Found" }, 404)
  }
  return undefined
})
