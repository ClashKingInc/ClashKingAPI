import { readFileSync, writeFileSync } from 'node:fs'
import { createArchiveDecoder } from '../workers/api/src/war-archive-codec.ts'
const root = '.local/scoped-import'
const decode = createArchiveDecoder(new WebAssembly.Module(readFileSync('node_modules/@bokuweb/zstd-wasm/dist/esm/zstd.wasm')), readFileSync('workers/api/assets/war-json.zdict'))
const wars = readFileSync(`${root}/wars.jsonl`, 'utf8').trim().split('\n').map(JSON.parse)
const offsets = JSON.parse(readFileSync(`${root}/local-archive-offsets.json`))
const packs = {}
// Match Tracking's internal/wararchive PackStats, using only the copied wars.
for (const row of wars) {
  const locator = offsets[row.war_id]
  if (!locator || locator.packId !== row.archive_pack_id) throw Error('Missing local archive locator')
  const bytes = readFileSync(`${root}/frames/${row.war_id}.zstd`)
  const raw = decode(bytes), war = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))
  if (war.clan.tag !== row.clan_tag || war.opponent.tag !== row.opponent_tag || new Date(war.endTime).getTime() !== new Date(row.end_time).getTime()) throw Error(`Archive identity mismatch: ${row.war_id}`)
  const pack = packs[locator.packId] ??= { war_count: 0, attack_count: 0, raw_bytes: 0, compressed_bytes: 0, first_end_time: row.end_time, last_end_time: row.end_time, stats: { byDay: {} } }
  pack.war_count++; pack.raw_bytes += raw.length; pack.compressed_bytes += bytes.length
  if (new Date(row.end_time) < new Date(pack.first_end_time)) pack.first_end_time = row.end_time
  if (new Date(row.end_time) > new Date(pack.last_end_time)) pack.last_end_time = row.end_time
  const day = pack.stats.byDay[new Date(war.endTime).toISOString().slice(0, 10)] ??= { warsByType: {}, totalAttacks: 0, totalMissedAttacks: 0, warsBySize: {}, regularHitRates: {}, regularByWarSize: {} }
  const type = row.war_type || 'random', size = String(war.teamSize)
  day.warsByType[type] = (day.warsByType[type] ?? 0) + 1
  day.warsBySize[size] = (day.warsBySize[size] ?? 0) + 1
  for (const [clan, opponent] of [[war.clan, war.opponent], [war.opponent, war.clan]]) {
    const attacks = clan.members.flatMap(m => m.attacks ?? [])
    pack.attack_count += attacks.length; day.totalAttacks += attacks.length
    day.totalMissedAttacks += Math.max(0, (war.teamSize || Math.max(war.clan.members.length, war.opponent.members.length)) * (war.attacksPerMember || 1) - attacks.length)
    if (type !== 'random') continue
    const defenders = new Map(opponent.members.map(m => [m.tag, m.townhallLevel ?? 0]))
    for (const member of clan.members) for (const attack of member.attacks ?? []) {
      const key = `${member.townhallLevel ?? 0}:${defenders.get(attack.defenderTag) ?? 0}`
      const hit = day.regularHitRates[key] ??= { attacks: 0, zeroStars: { attacks: 0, destructionPercent: 0, durationSeconds: 0 }, oneStars: { attacks: 0, destructionPercent: 0, durationSeconds: 0 }, twoStars: { attacks: 0, destructionPercent: 0, durationSeconds: 0 }, threeStars: { attacks: 0, durationSeconds: 0 } }
      hit.attacks++
      const outcome = hit[['zeroStars', 'oneStars', 'twoStars', 'threeStars'][attack.stars] ?? 'zeroStars']
      outcome.attacks++; outcome.durationSeconds += Math.trunc(attack.duration)
      if ('destructionPercent' in outcome) outcome.destructionPercent += Math.trunc(attack.destructionPercentage)
    }
  }
  if (type === 'random') {
    const value = day.regularByWarSize[size] ??= { wars: 0, totalStars: 0, townhalls: {}, ties: 0, wins: 0, losses: 0 }
    value.wars++; value.totalStars += (war.clan.stars ?? 0) + (war.opponent.stars ?? 0)
    for (const clan of [war.clan, war.opponent]) for (const member of clan.members) value.townhalls[member.townhallLevel ?? 0] = (value.townhalls[member.townhallLevel ?? 0] ?? 0) + 1
    if ((war.clan.stars ?? 0) === (war.opponent.stars ?? 0) && (war.clan.destructionPercentage ?? 0) === (war.opponent.destructionPercentage ?? 0)) value.ties += 2
    else { value.wins++; value.losses++ }
  }
}
writeFileSync(`${root}/local-pack-metadata.json`, JSON.stringify(packs), { mode: 0o600 })
console.log(JSON.stringify({ validatedWars: wars.length, packs: Object.keys(packs).length, attacks: Object.values(packs).reduce((n, p) => n + p.attack_count, 0) }))
