import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import type { LegendHistoryItem } from "@clashking/api-contracts"
import { DatabaseFailure, InvalidRequest } from "./errors.js"
import { publicTag } from "./public-war.js"
import { parsePlayerHistoryWindow } from "./league-analytics-query.js"
import { legendHistoryWindow } from "./legend-season.js"
import { lookupStaticItem } from "./static-metadata.js"
import { badgeUrls } from "./war-archive-model.js"

interface HistoryRow {
  season: string; player_tag: string; player_name: string; exp_level: number; trophies: number;
  attack_wins: number; defense_wins: number; rank: number; clan_tag: string | null;
  clan_name: string | null; clan_badge_token: string | null; league_tier_id: number | null;
  league_id: number | null; league_snapshot: unknown; population: number | null;
}
type HistoryItem = typeof LegendHistoryItem.Type
const failure = (cause: unknown) => new DatabaseFailure({ cause, message: "Legend history query failed" })
const object = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value === "string") { try { return object(JSON.parse(value)) } catch { return undefined } }
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function historicalLeague(row: HistoryRow, namespace: "legacy" | "tier"): NonNullable<HistoryItem["league"]> | null {
  const id = namespace === "tier" ? row.league_tier_id : row.league_id
  if (id == null || id <= 0) return null
  const raw = object(object(row.league_snapshot)?.[namespace === "tier" ? "leagueTier" : "league"])
  const supplied = raw?.id === id ? raw : undefined
  // Source labels/icons win. A tier-only catalog is never used for legacy IDs.
  // If legacy source metadata was lost, retain its ID with an unknown label.
  const fallback = namespace === "tier" ? lookupStaticItem("league_tiers", id) : undefined
  const name = typeof supplied?.name === "string" ? supplied.name : fallback?.name
  const icons = object(supplied?.iconUrls) ?? object(fallback?.iconUrls)
  const iconUrls = Object.fromEntries(["tiny", "small", "medium", "large"].flatMap(key => typeof icons?.[key] === "string" ? [[key, icons[key]]] : [])) as Record<string, string>
  return { id, namespace, ...(name === undefined ? {} : { name }), ...(Object.keys(iconUrls).length ? { iconUrls } : {}) }
}

function item(row: HistoryRow): HistoryItem {
  const window = legendHistoryWindow(row.season), tier = historicalLeague(row, "tier")
  return {
    name: row.player_name, tag: row.player_tag, season: row.season,
    seasonStart: window?.start.toISOString() ?? null, seasonEnd: window?.end.toISOString() ?? null,
    league: tier ?? historicalLeague(row, "legacy"), population: row.population,
    expLevel: row.exp_level, trophies: row.trophies, attackWins: row.attack_wins,
    defenseWins: row.defense_wins, rank: row.rank,
    ...(row.clan_tag !== null || row.clan_name !== null || row.clan_badge_token !== null ? { clan: {
      ...(row.clan_name ? { name: row.clan_name } : {}), ...(row.clan_tag ? { tag: row.clan_tag } : {}),
      ...(row.clan_badge_token ? { badgeUrls: badgeUrls(row.clan_badge_token) } : {}),
    } } : {}),
    // Existing Bot consumers use leagueTier; keep that compatibility field only
    // for an actually recorded tier, never for the legacy namespace.
    ...(tier ? { leagueTier: { id: tier.id, ...(tier.name === undefined ? {} : { name: tier.name }), ...(tier.iconUrls ? { iconUrls: tier.iconUrls } : {}) } } : {}),
  }
}

export const legendHistoryOrder = (value: { season: string; seasonEnd?: string | null }): number => {
  if (value.seasonEnd) return Date.parse(value.seasonEnd)
  // This orders retained date labels without claiming a season boundary.
  const label = /^\d{4}-\d{2}-\d{2}$/u.test(value.season) ? Date.parse(value.season) : Number.NaN
  return Number.isFinite(label) ? label : 0
}

const historyRows = (tags: readonly string[]) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  if (!tags.length) return [] as readonly HistoryRow[]
  return yield* sql<HistoryRow>`
    WITH requested AS MATERIALIZED (
      SELECT * FROM legend_history WHERE player_tag = ANY(${[...tags]}::text[])
    ), populations AS MATERIALIZED (
      SELECT seasons.season, highest.rank AS population
      FROM (SELECT DISTINCT season FROM requested) seasons
      LEFT JOIN LATERAL (
        SELECT rank FROM legend_history
        WHERE season = seasons.season
        ORDER BY rank DESC LIMIT 1
      ) highest ON true
    )
    SELECT requested.*, populations.population
    FROM requested LEFT JOIN populations USING (season)
  `.pipe(Effect.mapError(failure))
})

export const queryCanonicalLegendHistory = (rawTags: readonly string[], query = new URLSearchParams(), now = new Date(), limit?: number) => Effect.gen(function* () {
  const tags = [...new Set(yield* Effect.all(rawTags.map(publicTag)))], bounded = query.has("time[after]") || query.has("time[before]")
  const range = bounded ? yield* parsePlayerHistoryWindow(query, now) : undefined
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)) return yield* new InvalidRequest({ message: "Invalid Legend history limit" })
  const result = new Map<string, HistoryItem[]>(tags.map(tag => [tag, []]))
  const rows = yield* historyRows(tags)
  for (const row of rows) {
    const window = legendHistoryWindow(row.season)
    if (window && window.end > now) continue
    // Unknown legacy boundaries remain visible as raw archive identifiers, but
    // cannot truthfully match an explicit time range.
    if (range && (!window || window.end < range.start || window.end > range.end)) continue
    result.get(row.player_tag)!.push(item(row))
  }
  for (const [tag, items] of result) {
    items.sort((a, b) => legendHistoryOrder(b) - legendHistoryOrder(a) || b.season.localeCompare(a.season))
    if (limit !== undefined) result.set(tag, items.slice(0, limit))
  }
  return result
})

export const queryCanonicalLegendSeason = (season: string, limit: number, now = new Date()) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const window = legendHistoryWindow(season)
  if (window && window.end > now) return { items: [] as HistoryItem[] }
  const rows = yield* sql<HistoryRow>`SELECT history.*, highest.rank AS population
    FROM legend_history history
    LEFT JOIN LATERAL (
      SELECT rank FROM legend_history WHERE season = ${season} ORDER BY rank DESC LIMIT 1
    ) highest ON true
    WHERE history.season = ${season} ORDER BY history.rank LIMIT ${limit}`.pipe(Effect.mapError(failure))
  return { items: rows.map(item) }
})
