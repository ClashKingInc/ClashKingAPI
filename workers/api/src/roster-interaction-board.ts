import { DecimalSnowflake } from "@clashking/api-contracts"
import { DeferredRosterBoardData, RuntimeUUID } from "@clashking/api-contracts/deferred-runtime"
import { Effect, Schema } from "effect"
import { InvalidRequest } from "./errors.js"

type Roster = typeof DeferredRosterBoardData.Type
type Member = Roster['members'][number]
export type RosterBoardMode = 'signup' | 'post' | 'static'
interface Embed {
  readonly title?: string
  readonly description: string
  readonly color: number
  readonly footer?: { readonly text: string }
  readonly image?: { readonly url: string }
}
type Button = { readonly type: 2; readonly style: 1 | 2 | 4; readonly label: string; readonly custom_id: string }
  | { readonly type: 2; readonly style: 5; readonly label: string; readonly url: string }
export interface RosterBoardMessage {
  readonly content: string
  readonly embeds: ReadonlyArray<Embed>
  readonly components: ReadonlyArray<{ readonly type: 1; readonly components: ReadonlyArray<Button> }>
  readonly allowed_mentions: { readonly parse: ReadonlyArray<never> }
}
const labels: Readonly<Record<string, string>> = {
  townhall: 'TH', name: 'NAME', tag: 'TAG', hitrate: 'HIT RATE', current_clan: 'CLAN',
  current_clan_tag: 'CLAN TAG', discord: 'DISCORD', hero_lvs: 'HEROES', trophies: 'TROPHIES', war_pref: 'WAR OPT',
}
const value = (member: Member, column: string): string | number | boolean | undefined | null => {
  switch (column) {
    case 'townhall': return member.townhall
    case 'name': return member.name
    case 'tag': return member.tag
    case 'hitrate': return member.hitrate
    case 'current_clan': return member.current_clan
    case 'current_clan_tag': return member.current_clan_tag
    case 'discord': return member.discord_username ?? member.discord
    case 'hero_lvs': return member.hero_level_sum
    case 'trophies': return member.trophies
    case 'war_pref': return member.war_pref
    case 'added_at': return member.added_at
    default: return undefined
  }
}
const clip = (text: string, limit: number) => {
  if (text.length <= limit) return text
  let end = limit - 1
  if (/[\uD800-\uDBFF]/.test(text.charAt(end - 1))) end--
  return `${text.slice(0, end)}…`
}
// User-owned cells cannot escape their inline-code row or form a mention.
const plain = (text: string, limit: number) => clip(Array.from(text, character => {
  const code = character.codePointAt(0)!
  return code < 32 || code === 127 ? ' ' : character
}).join('')
  .replace(/`/g, 'ˋ').replace(/@/g, '@\u200b').replace(/</g, '‹').replace(/>/g, '›').replace(/\|/g, '¦'), limit)
const heading = (text: string, limit: number) => plain(text, limit).replace(/[\\*_~]/g, '')
const imageUrl = (input: string | undefined) => {
  if (!input || input.length > 2048) return undefined
  try {
    const url = new URL(input)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}
const compare = (left: Member, right: Member, sort: Roster['sort']) => {
  for (const item of sort) {
    const a = value(left, item.columnId), b = value(right, item.columnId)
    // Unknown snapshots stay last in either direction, rather than appearing as zero.
    if (a == null && b != null) return 1
    if (a != null && b == null) return -1
    const order = typeof a === 'number' && typeof b === 'number' ? a - b
      : String(a ?? '').toLowerCase().localeCompare(String(b ?? '').toLowerCase(), 'en')
    if (order !== 0) return item.direction === 'asc' ? order : -order
  }
  return left.tag.localeCompare(right.tag, 'en')
}
const validTownHallLimits = (roster: Roster) => (roster.min_th === undefined || Number.isInteger(roster.min_th) && roster.min_th > 0)
  && (roster.max_th === undefined || Number.isInteger(roster.max_th) && roster.max_th > 0)
  && (roster.min_th === undefined || roster.max_th === undefined || roster.min_th <= roster.max_th)
const townHallIneligible = (member: Member, roster: Roster, now: number) => {
  const observed = member.refreshed_at === undefined ? NaN : Date.parse(member.refreshed_at)
  if (!validTownHallLimits(roster) || !Number.isInteger(member.townhall) || member.townhall <= 0 || !Number.isFinite(observed)
    || observed > now || now - observed > 15 * 60_000) return false
  return Number.isInteger(roster.min_th) && member.townhall < roster.min_th!
    || Number.isInteger(roster.max_th) && member.townhall > roster.max_th!
}

/** Pure presentation from a stored roster snapshot: no live Clash/Discord I/O.
 * Bounds include the combined 6000-character embed limit, not just each embed.
 * Oversized rosters disclose the omitted count and link to the full dashboard. */
export const renderRosterBoard = (roster: Roster, mode: RosterBoardMode, now: number):
  Effect.Effect<RosterBoardMessage, InvalidRequest> => Effect.gen(function* () {
  if (!Schema.is(RuntimeUUID)(roster.id) || !Schema.is(DecimalSnowflake)(roster.server_id) || !Number.isFinite(now)) {
    return yield* new InvalidRequest({ message: 'Invalid roster board identity or time' })
  }
  const columns = roster.columns.length === 0 ? ['townhall', 'name', 'tag', 'hero_lvs'] : roster.columns
  const sort: Roster['sort'] = roster.sort.length === 0 ? [
    { columnId: 'townhall', direction: 'desc' }, { columnId: 'name', direction: 'asc' },
    { columnId: 'hero_lvs', direction: 'desc' }, { columnId: 'tag', direction: 'asc' },
  ] : roster.sort
  if (columns.length > 10 || new Set(columns).size !== columns.length || columns.some(column => !Object.hasOwn(labels, column))
    || roster.sort.length > 10 || roster.sort.some(sort => !Object.hasOwn(labels, sort.columnId) && sort.columnId !== 'added_at')) {
    return yield* new InvalidRequest({ message: 'Roster board column or sort configuration requires repair' })
  }
  const groups = [...roster.member_groups].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id, 'en'))
  const groupIds = new Set(groups.map(group => group.id))
  if (roster.members.some(member => member.member_group_id !== null && !groupIds.has(member.member_group_id))) {
    return yield* new InvalidRequest({ message: 'Roster board contains an unconfigured member group' })
  }
  const url = `https://dash.clashk.ing/dashboard/rosters/detail?guildId=${roster.server_id}&rosterId=${roster.id}`
  const title = heading([roster.clan_name, roster.alias].filter(Boolean).join(' | '), 256)
  const introduction = [roster.description ? `**Info:** ${heading(roster.description, 400)}` : '',
    Number.isSafeInteger(roster.event_start_time) && roster.event_start_time! > 0 ? `**Starts:** <t:${roster.event_start_time}:f>` : '',
    `[View full roster](${url})`, `\`${columns.map(column => labels[column]).join(' | ')}\``,
  ].filter(Boolean).join('\n')
  const descriptions = [introduction]
  let used = introduction.length, shown = 0
  const sections = [{ name: 'Main', members: roster.members.filter(member => !member.is_substitute && member.member_group_id === null) },
    ...groups.map(group => ({ name: group.name, members: roster.members.filter(member => !member.is_substitute && member.member_group_id === group.id) })),
    { name: 'Substitutes', members: roster.members.filter(member => member.is_substitute) },
  ]
  const append = (line: string) => {
    if (used + line.length + 1 > 5200) return false
    const last = descriptions.length - 1
    if (descriptions[last]!.length + line.length + 1 > 4096) descriptions.push(line)
    else descriptions[last] += `\n${line}`
    used += line.length + 1
    return true
  }
  outer: for (const section of sections) {
    if (section.members.length === 0) continue
    const sorted = [...section.members].sort((a, b) => compare(a, b, sort))
    for (const [index, member] of sorted.entries()) {
      const cells = columns.map(column => {
        const current = value(member, column)
        return current == null ? '—' : column === 'war_pref' ? current ? 'In' : 'Out'
          : plain(`${current}${column === 'hitrate' ? '%' : ''}`, 60)
      })
      const warning = townHallIneligible(member, roster, now) ? ' ⚠ TH outside signup range' : ''
      const line = `${index === 0 ? `\n**${heading(section.name, 49)}**\n` : ''}\`${index + 1}. ${cells.join(' | ')}${warning}\``
      if (!append(line)) break outer
      shown++
    }
  }
  if (roster.members.length === 0) append('No roster members.')
  const counts = new Map<number, number>()
  for (const member of roster.members) counts.set(member.townhall, (counts.get(member.townhall) ?? 0) + 1)
  const distribution = clip([...counts].sort(([a], [b]) => b - a).map(([th, count]) => `TH${th}: ${count}`).join(' | '), 200)
  const footer = clip([`Showing ${shown} of ${roster.members.length} members${shown < roster.members.length ? ' — open the full roster for the remaining members.' : '.'}`,
    distribution, `TH ${roster.min_th ?? 'any'}–${roster.max_th ?? 'any'} | ${roster.capacity} account limit | Revision ${roster.revision}`,
    validTownHallLimits(roster) ? '' : 'Town Hall configuration needs repair; eligibility is unknown.',
  ].filter(Boolean).join('\n'), 500)
  const image = imageUrl(roster.image)
  const embeds = descriptions.map((description, index): Embed => ({
    description, color: 0x2b2d31, ...(index === 0 ? { title, ...(image ? { image: { url: image } } : {}) } : {}),
    ...(index === descriptions.length - 1 ? { footer: { text: footer } } : {}),
  }))
  const buttons: Button[] = []
  if (mode === 'signup') buttons.push(
    { type: 2, style: 1, label: 'Sign up', custom_id: `ck:roster:signup:${roster.id}` },
    { type: 2, style: 4, label: 'Remove me', custom_id: `ck:roster:remove:${roster.id}` },
  )
  if (mode !== 'static') buttons.push(
    { type: 2, style: 2, label: 'Refresh', custom_id: `ck:roster:refresh:${roster.id}` },
    { type: 2, style: 5, label: 'Open roster', url },
  )
  if (mode !== 'static' && roster.clan_tag !== undefined && /^#[0289PYLQGRJCUV]{3,15}$/.test(roster.clan_tag)) {
    buttons.push({ type: 2, style: 5, label: 'Open Clan',
      url: `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${encodeURIComponent(roster.clan_tag)}` })
  }
  return { content: '', embeds, components: buttons.length ? [{ type: 1, components: buttons }] : [], allowed_mentions: { parse: [] } }
})
