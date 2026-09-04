import { CwlSummaryExportEndpoint, PlayerWarStatsExportEndpoint } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, InvalidRequest, NotFound } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { forEachPlayerWar, readArchiveWar } from "./war-archive.js"
import { archiveAttackFacts, type ArchiveAttackFact } from "./war-archive-model.js"
import { createWarWorkbookStream, MAX_EXPORT_ROWS, MAX_EXPORT_WARS, safeExportFilename, XLSX_MIME, type ExportSheet } from "./war-export-workbook.js"

export const warExportRuntimeRoutes = [
  { method: "GET", path: "/v2/exports/war/cwl-summary" },
  { method: "POST", path: "/v2/exports/war/player-stats" },
] as const

const normalizeTag = (value: string): string => {
  const tag = value.trim().toUpperCase().replaceAll("O", "0").replace(/^[#!]+/u, "")
  return tag === "" ? "" : `#${tag}`
}
const decode = <A, I>(schema: Schema.Codec<A, I>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(
  Effect.mapError(() => new InvalidRequest({ message: "Export request failed schema validation" })),
)
const workbookResponse = (sheet: ExportSheet, filename: string) => Effect.try({
  try: () => new Response(createWarWorkbookStream(sheet), { headers: {
    "content-type": XLSX_MIME, "content-disposition": `attachment; filename="${safeExportFilename(filename)}"`,
    "cache-control": "no-store", "x-content-type-options": "nosniff",
  } }),
  catch: () => new InvalidRequest({ message: "Export exceeds the supported workbook size; request fewer hits or a narrower time range" }),
})

interface MemberTotals { name: string; tag: string; townHall: number; attacks: number; stars: number; destruction: number }
const exportCwl = (tag: string) => Effect.gen(function* () {
  if (tag === "") return yield* new InvalidRequest({ message: "tag is required" })
  const sql = yield* SqlClient.SqlClient
  const latest = (yield* sql<{ latest: Date | string | null; clan_name: string }>`
    SELECT max(end_time) AS latest, COALESCE((SELECT name FROM basic_clan WHERE tag=${tag}),${tag}) AS clan_name
    FROM wars WHERE (clan_tag=${tag} OR opponent_tag=${tag}) AND war_type='cwl'
  `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "CWL export lookup failed" }))))[0]
  if (!latest?.latest) return yield* new NotFound({ message: "No CWL data found for this clan" })
  const end = new Date(latest.latest)
  const monthStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  const monthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1))
  const season = end.toISOString().slice(0, 7)
  const references = yield* sql<{ war_id: string }>`SELECT war_id::text FROM wars
    WHERE (clan_tag=${tag} OR opponent_tag=${tag}) AND end_time>=${monthStart} AND end_time<=${monthEnd}
      AND war_type='cwl' ORDER BY end_time DESC LIMIT 100
  `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "CWL export war query failed" })))
  const players = new Map<string, MemberTotals>()
  let stars = 0, attacks = 0, destruction = 0
  // Preserve Go's 100-war latest-month window, retaining only player aggregates.
  for (const reference of references) {
    const entry = yield* readArchiveWar(reference.war_id)
    if (!entry) continue
    const clan = entry.war.clan.tag === tag ? entry.war.clan : entry.war.opponent
    for (const member of clan.members) {
      if (!member.attacks?.length) continue
      const totals = players.get(member.tag) ?? { name: member.name ?? "", tag: member.tag,
        townHall: member.townhallLevel ?? 0, attacks: 0, stars: 0, destruction: 0 }
      totals.townHall = Math.max(totals.townHall, member.townhallLevel ?? 0)
      for (const attack of member.attacks) {
        totals.attacks += 1; totals.stars += attack.stars; totals.destruction += attack.destructionPercentage
        attacks += 1; stars += attack.stars; destruction += attack.destructionPercentage
      }
      players.set(member.tag, totals)
    }
  }
  const rows: Array<Array<string | number>> = [
    [`CWL Summary for ${latest.clan_name} - Season ${season}`], [], ["Clan Information"],
    ["Clan Tag", tag], ["Clan Name", latest.clan_name], ["Season", season], ["League", "Unknown"],
    ["Stars", stars], ["Attacks", attacks], ["Destruction %", destruction], [], [], ["Member Performance"],
    ["Player Name", "Player Tag", "Town Hall", "Total Attacks", "Total Stars", "Average Stars", "Total Destruction %", "Average Destruction %", "Performance Score"],
  ]
  for (const member of [...players.values()].sort((a, b) => b.stars - a.stars || a.tag.localeCompare(b.tag))) {
    const averageStars = member.attacks > 0 ? member.stars / member.attacks : 0
    const averageDestruction = member.attacks > 0 ? member.destruction / member.attacks : 0
    rows.push([member.name, member.tag, member.townHall, member.attacks, member.stars, averageStars.toFixed(2),
      `${member.destruction.toFixed(1)}%`, `${averageDestruction.toFixed(1)}%`, (member.stars + averageDestruction / 100).toFixed(2)])
  }
  return yield* workbookResponse({ name: "CWL Summary", rows, titleColumns: 9, boldRows: [14], sectionRows: [3, 13], boldFirstColumnRows: [4, 5, 6, 7, 8, 9, 10] },
    `cwl_${latest.clan_name}_${season}.xlsx`)
})

/** Min-heap keeps only the newest requested hits while visiting one decoded war at a time. */
const retainRecentHit = (heap: Array<ArchiveAttackFact>, hit: ArchiveAttackFact, limit: number): void => {
  const time = (item: ArchiveAttackFact) => item.warEndTime.getTime()
  if (heap.length < limit) {
    heap.push(hit)
    let index = heap.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (time(heap[parent]!) <= time(heap[index]!)) break
      ;[heap[parent], heap[index]] = [heap[index]!, heap[parent]!]
      index = parent
    }
  } else if (time(hit) > time(heap[0]!)) {
    heap[0] = hit
    let index = 0
    for (;;) {
      const left = index * 2 + 1, right = left + 1
      if (left >= heap.length) break
      const smallest = right < heap.length && time(heap[right]!) < time(heap[left]!) ? right : left
      if (time(heap[index]!) <= time(heap[smallest]!)) break
      ;[heap[index], heap[smallest]] = [heap[smallest]!, heap[index]!]
      index = smallest
    }
  }
}

const exportPlayer = (body: typeof PlayerWarStatsExportEndpoint.body.Type) => Effect.gen(function* () {
  const tag = normalizeTag(body.player_tag)
  if (tag === "") return yield* new InvalidRequest({ message: "player_tag is required" })
  const limit = body.limit ?? 0
  if (limit > MAX_EXPORT_ROWS) return yield* new InvalidRequest({ message: `Export limit cannot exceed ${MAX_EXPORT_ROWS}` })
  const start = new Date((body.timestamp_start && body.timestamp_start > 0 ? Math.trunc(body.timestamp_start) : 0) * 1000)
  const end = new Date((body.timestamp_end && body.timestamp_end > 0 ? Math.trunc(body.timestamp_end) : 9_999_999_999) * 1000)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    return yield* new InvalidRequest({ message: "Invalid export time range" })
  }
  const hits: Array<ArchiveAttackFact> = []
  let warCount = 0
  yield* forEachPlayerWar([tag], start, end, (id, war) => Effect.gen(function* () {
    warCount += 1
    if (warCount > MAX_EXPORT_WARS) return yield* new InvalidRequest({ message: "Export exceeds 1000 wars; provide a narrower time range" })
    for (const hit of archiveAttackFacts(id, war)) {
      if (hit.attackerTag !== tag) continue
      if (limit > 0) retainRecentHit(hits, hit, limit)
      else {
        if (hits.length === MAX_EXPORT_ROWS) return yield* new InvalidRequest({ message: "Export exceeds 20000 hits; provide a limit or narrower time range" })
        hits.push(hit)
      }
    }
  }))
  if (!hits.length) return yield* new NotFound({ message: "No war hits found for this player" })
  hits.sort((a, b) => b.warEndTime.getTime() - a.warEndTime.getTime() || a.attackOrder - b.attackOrder)
  const rows: Array<Array<string | number>> = [
    [`War Statistics for ${hits[0]!.attackerName} (${tag})`], [],
    ["War Date", "Clan Tag", "Attacker Tag", "Attacker Name", "Attacker TH", "Defender Tag", "Defender TH", "Stars", "Destruction %", "Attack Order"],
  ]
  for (const hit of hits) rows.push([hit.warEndTime.toISOString().replace(".000Z", "Z"), hit.attackingClanTag, hit.attackerTag,
    hit.attackerName, hit.attackerTownhall, hit.defenderTag, hit.defenderTownhall, hit.stars, `${hit.destructionPercentage.toFixed(1)}%`, hit.attackOrder])
  return yield* workbookResponse({ name: "War Stats", rows, titleColumns: 10, boldRows: [3] }, `war_stats_${tag.replaceAll("#", "")}.xlsx`)
})

export const dispatchWarExports = (request: Request) => Effect.gen(function* () {
  const url = new URL(request.url)
  if (request.method === "GET" && url.pathname === CwlSummaryExportEndpoint.path) {
    const query = yield* decode(CwlSummaryExportEndpoint.query, Object.fromEntries(url.searchParams))
    return yield* exportCwl(normalizeTag(query.tag))
  }
  if (request.method === "POST" && url.pathname === PlayerWarStatsExportEndpoint.path) {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
    }
    return yield* exportPlayer(yield* decode(PlayerWarStatsExportEndpoint.body, yield* readBoundedJson(request)))
  }
  return undefined
})

export const warExportInternals = { retainRecentHit }
