import { DeferredRosterBoardData } from "@clashking/api-contracts/deferred-runtime"
import { Effect } from "effect"
import { expect, it } from "vitest"
import { renderRosterBoard } from "./roster-interaction-board.js"

const rosterId = '019eb56a-5615-7334-8013-526a7ee0ace1'
const groupId = '019eb56a-5615-7334-8013-526a7ee0ace2'
const now = Date.parse('2026-09-04T07:20:00Z')
const member = (name: string, tag: string): typeof DeferredRosterBoardData.Type.members[number] => ({
  name, tag, townhall: 16, hero_level_sum: 300, member_group_id: null, is_substitute: false,
})
const fixture = (): typeof DeferredRosterBoardData.Type => ({
  id: rosterId, server_id: '123456789012345678', alias: 'CWL Team', capacity: 50,
  roster_role_id: null, roster_type: 'clan', signup_scope: 'clan-only', clan_tag: '#CLAN',
  columns: ['townhall', 'name', 'tag'], sort: [{ columnId: 'name', direction: 'asc' }],
  member_groups: [{ id: groupId, name: 'War Team', position: 0, signup_enabled: false, role_id: null }],
  members: [], revision: 12, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(),
})

it('retains the default TH/name/tag/heroes columns and highest-TH-first ordering', async () => {
  const result = await Effect.runPromise(renderRosterBoard({ ...fixture(), columns: [], sort: [], members: [
    member('Alpha', '#A'), { ...member('Zulu', '#Z'), townhall: 17 },
  ] }, 'signup', now))
  const text = result.embeds.map(embed => embed.description).join('\n')
  expect(text).toContain('TH | NAME | TAG | HEROES')
  expect(text.indexOf('Zulu')).toBeLessThan(text.indexOf('Alpha'))
})

it('renders sorted main, retained groups, and substitutes without mutating the source', async () => {
  const roster = { ...fixture(), description: 'Bring both attacks', event_start_time: 1788516000, members: [
    member('Zulu', '#Z'), { ...member('Sub', '#S'), is_substitute: true, member_group_id: groupId },
    member('Alpha', '#A'), { ...member('Grouped', '#G'), member_group_id: groupId },
  ] }
  const original = JSON.stringify(roster)
  const result = await Effect.runPromise(renderRosterBoard(roster, 'signup', now))
  const text = result.embeds.map(embed => embed.description).join('\n')
  expect(text.indexOf('Alpha')).toBeLessThan(text.indexOf('Zulu'))
  expect(text).toContain('**War Team**')
  expect(text).toContain('**Substitutes**')
  expect(text).toContain('<t:1788516000:f>')
  expect(text).toContain('Bring both attacks')
  expect(JSON.stringify(roster)).toBe(original)
  expect(result.allowed_mentions).toEqual({ parse: [] })
})

it.each(['signup', 'post', 'static'] as const)('keeps only the approved %s controls', async mode => {
  const result = await Effect.runPromise(renderRosterBoard(fixture(), mode, now))
  const buttons = result.components.flatMap(row => row.components)
  const ids = buttons.flatMap(button => 'custom_id' in button ? [button.custom_id] : [])
  expect(ids).toEqual(mode === 'signup'
    ? ['signup', 'remove', 'refresh'].map(action => `ck:roster:${action}:${rosterId}`)
    : mode === 'post' ? [`ck:roster:refresh:${rosterId}`] : [])
  expect(result.embeds[0]!.description).toContain('No roster members.')
})

it('bounds every embed and discloses exactly how many members do not fit', async () => {
  const roster = { ...fixture(), alias: 'A'.repeat(1000), description: 'D'.repeat(10000),
    columns: ['name', 'tag', 'current_clan', 'discord'], members: Array.from({ length: 250 }, (_, index) => ({
      ...member(`Player ${index} ${'X'.repeat(200)}`, `#${index}`), current_clan: 'Clan'.repeat(100), discord_username: 'Discord'.repeat(100),
    })) }
  const result = await Effect.runPromise(renderRosterBoard(roster, 'signup', now))
  expect(result.embeds.length).toBeLessThanOrEqual(10)
  expect(result.embeds.every(embed => embed.description.length <= 4096 && (embed.title?.length ?? 0) <= 256)).toBe(true)
  expect(result.embeds.reduce((sum, embed) => sum + embed.description.length + (embed.title?.length ?? 0) + (embed.footer?.text.length ?? 0), 0)).toBeLessThanOrEqual(6000)
  expect(result.embeds.at(-1)!.footer!.text).toMatch(/Showing \d+ of 250 members/)
  expect(result.components.flatMap(row => row.components)).toContainEqual(expect.objectContaining({
    style: 5, url: `https://dash.clashk.ing/dashboard/rosters/detail?guildId=123456789012345678&rosterId=${rosterId}`,
  }))
})

it('neutralizes member markdown, suppresses mentions, and ignores unsafe image URLs', async () => {
  const result = await Effect.runPromise(renderRosterBoard({ ...fixture(), image: 'javascript:alert(1)',
    members: [member('`\n@everyone <@123456789012345678>', '#TAG')],
  }, 'signup', now))
  const text = result.embeds.map(embed => embed.description).join('\n')
  expect(text).not.toContain('<@123456789012345678>')
  expect(text).not.toContain('@everyone')
  expect(result.embeds[0]!.image).toBeUndefined()
})

it('rejects unknown configuration rather than silently substituting columns or groups', async () => {
  for (const roster of [
    { ...fixture(), columns: ['Legacy Column'] },
    { ...fixture(), sort: [{ columnId: 'unknown', direction: 'asc' as const }] },
    { ...fixture(), members: [{ ...member('Orphan', '#ORPHAN'), member_group_id: '019eb56a-5615-7334-8013-526a7ee0ace3' }] },
  ]) await expect(Effect.runPromise(renderRosterBoard(roster, 'signup', now))).rejects.toThrow()
})

it('highlights only fresh-confirmed TH ineligibility and keeps every member and removal control', async () => {
  const roster = { ...fixture(), min_th: 17, members: [
    { ...member('Fresh', '#F'), refreshed_at: new Date(now - 1000).toISOString() },
    { ...member('Stale', '#S'), refreshed_at: new Date(now - 900001).toISOString() },
    { ...member('Future', '#U'), refreshed_at: new Date(now + 1).toISOString() },
    member('Unknown', '#N'),
  ] }
  const result = await Effect.runPromise(renderRosterBoard(roster, 'signup', now))
  const text = result.embeds.map(embed => embed.description).join('\n')
  expect(text.match(/⚠ TH outside signup range/g)).toHaveLength(1)
  for (const name of ['Fresh', 'Stale', 'Future', 'Unknown']) expect(text).toContain(name)
  expect(result.embeds.at(-1)!.footer!.text).toContain('Showing 4 of 4 members')
  expect(result.components[0]!.components).toContainEqual(expect.objectContaining({ custom_id: `ck:roster:remove:${rosterId}` }))
})

it.each(['signup', 'post', 'static'] as const)('preserves the clan deep link for %s without reviving the token editor', async mode => {
  const result = await Effect.runPromise(renderRosterBoard({ ...fixture(), clan_tag: '#2PP' }, mode, now))
  const buttons = result.components.flatMap(row => row.components)
  if (mode === 'static') expect(buttons).toEqual([])
  else {
    expect(buttons).toContainEqual({ type: 2, style: 5, label: 'Open Clan',
      url: 'https://link.clashofclans.com/en?action=OpenClanProfile&tag=%232PP' })
    expect(buttons.length).toBeLessThanOrEqual(5)
  }
})

it.each([{ min_th: 0 }, { max_th: -1 }, { min_th: 18, max_th: 17 }])('does not label a member ineligible under invalid limits %j', async limits => {
  const result = await Effect.runPromise(renderRosterBoard({ ...fixture(), ...limits, columns: ['tag'], members: [
    { ...member('Hidden name', '#VISIBLE'), refreshed_at: new Date(now).toISOString() },
  ] }, 'signup', now))
  const text = result.embeds.map(embed => embed.description).join('\n')
  expect(text).toContain('#VISIBLE')
  expect(text).not.toContain('Hidden name')
  expect(text).not.toContain('⚠ TH outside signup range')
  expect(result.embeds.at(-1)!.footer!.text).toContain('Town Hall configuration needs repair')
})
