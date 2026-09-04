import {
  BotClanCachedEndpoint, BotClanRankingsEndpoint, BotCwlGroupEndpoint,
  BotCwlLeaderboardEndpoint, BotCwlRankingHistoryEndpoint, type AnyEndpoint,
} from "@clashking/api-contracts"
import { Effect, Schema, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"

import locations from "../../../internal/routes/search_locations.json"
import { DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { ensureCwlLeagueIds } from "./public-cwl.js"
import { publicTag } from "./public-war.js"
import { lookupStaticItem } from "./static-metadata.js"
import { badgeUrls, officialArchiveWar } from "./war-archive-model.js"
import { readArchiveWar } from "./war-archive.js"

const maxResponseBytes = 8 * 1024 * 1024
const encoder = new TextEncoder()
const failure = (cause: unknown) => cause instanceof UpstreamUnavailable ? cause : new DatabaseFailure({ cause, message: "Clan data query failed" })
const tooLarge = () => new UpstreamUnavailable({ cause: "response_size_limit", message: "Stored clan response exceeds the supported size limit" })
const collect = <A, E>(stream: Stream.Stream<A, E>) => Effect.gen(function* () {
  const rows: A[] = []
  let bytes = 2
  yield* Stream.runForEach(stream, (row) => Effect.gen(function* () {
    bytes += encoder.encode(JSON.stringify(row)).byteLength + 1
    if (bytes > maxResponseBytes) return yield* tooLarge()
    rows.push(row)
  })).pipe(Effect.mapError(failure))
  return rows
})
const leagueReference = (category: string, id: number) => {
  if (category === "war_leagues" && id === 48_000_000) return { id, name: "Unranked" }
  const item = lookupStaticItem(category, id)
  return item === undefined ? undefined : { id, name: item.name }
}
const league = (category: string, id: number) => leagueReference(category, id) ?? { id, name: "" }
const roundsSchema = Schema.Array(Schema.Array(Schema.String))
const rounds = (value: unknown) => Schema.decodeUnknownEffect(roundsSchema)(value).pipe(Effect.mapError(failure))

interface CachedClan {
  name: string; tag: string; description: string; clan_level: number; clan_points: number; capital_gold_total: string;
  location_id: number | null; cwl_league_id: number; capital_league_id: number | null; public_war_log: boolean;
  war_wins: number; war_win_streak: number; member_count: number; badge_token: string; troops_donated: number;
  troops_received: number; members: unknown; last_active: Date | string | null;
}
export const queryCachedClan = (rawTag: string) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), sql = yield* SqlClient.SqlClient
  const row = (yield* sql<CachedClan>`SELECT name, tag, description, clan_level, clan_points, capital_gold_total::text,
    location_id, cwl_league_id, capital_league_id, public_war_log, war_wins, war_win_streak, member_count, badge_token,
    troops_donated, troops_received, members, last_active FROM basic_clan WHERE tag = ${tag}`.pipe(Effect.mapError(failure)))[0]
  if (!row) return null
  const capitalGold = Number(row.capital_gold_total)
  if (!Number.isSafeInteger(capitalGold)) return yield* new UpstreamUnavailable({ cause: "unsafe_integer", message: "Cached clan capital gold exceeds the numeric response range" })
  const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
  const members = Array.isArray(row.members) ? row.members.flatMap((value: unknown) => {
    const member = object(value)
    return member ? [{ tag: typeof member.tag === "string" ? member.tag : "", name: typeof member.name === "string" ? member.name : "",
      townHallLevel: typeof member.town_hall === "number" ? Math.trunc(member.town_hall) : 0 }] : []
  }) : []
  return { name: row.name, tag: row.tag, badgeUrls: badgeUrls(row.badge_token), description: row.description,
    clanLevel: row.clan_level, clanPoints: row.clan_points, capitalGoldTotal: capitalGold,
    ...(row.location_id === null ? {} : { location: locations.find((item) => item.id === row.location_id) ?? { id: row.location_id, name: "", isCountry: false } }),
    warLeague: league("war_leagues", row.cwl_league_id),
    ...(row.capital_league_id === null ? {} : { capitalLeague: league("capital_leagues", row.capital_league_id) }),
    publicWarLog: row.public_war_log, warWins: row.war_wins, warWinStreak: row.war_win_streak, memberCount: row.member_count,
    troopsDonated: row.troops_donated, troopsReceived: row.troops_received,
    ...(row.last_active === null ? {} : { lastActive: new Date(row.last_active).toISOString() }), members }
})

export const queryClanRankings = (rawTag: string) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), sql = yield* SqlClient.SqlClient
  const profile = (yield* sql<{ name: string; badge_token: string; clan_points: number; builder_base_points: number; capital_points: number }>`
    SELECT name, badge_token, clan_points, builder_base_points, capital_points FROM basic_clan WHERE tag = ${tag}`.pipe(Effect.mapError(failure)))[0]
  const placements = yield* collect(sql<{ ranking_type: string; locationId: string; rank: number; points: number }>`
    SELECT ranking_type, location_id AS "locationId", rank, points FROM clan_rankings_current WHERE clan_tag = ${tag}
    ORDER BY CASE ranking_type WHEN 'home' THEN 1 WHEN 'builder_base' THEN 2 WHEN 'capital' THEN 3 END,
      CASE WHEN location_id = 'global' THEN 0 ELSE 1 END, location_id`.stream)
  const category = (kind: string, points: number) => ({ points, placements: placements.filter((row) => row.ranking_type === kind).map(({ ranking_type: _type, ...placement }) => placement) })
  return { name: profile?.name ?? null, tag, badge: profile?.badge_token.trim() ? badgeUrls(profile.badge_token).large : null,
    homeVillage: category("home", profile?.clan_points ?? 0), builderBase: category("builder_base", profile?.builder_base_points ?? 0),
    clanCapital: category("capital", profile?.capital_points ?? 0) }
})

interface Standing {
  clan_tag: string; season: string; cwl_league_id: number; war_size: number; stars: number; destruction: number;
  wins: number; losses: number; ties: number; wars_finished: number; total_clans_in_group: number;
  group_rank: number | null; global_rank: number | null; updated_at: Date | string;
}
const standing = (row: Standing) => ({ clanTag: row.clan_tag, season: row.season, cwlLeagueId: row.cwl_league_id,
  warSize: row.war_size, stars: row.stars, destruction: Number(row.destruction), wins: row.wins, losses: row.losses, ties: row.ties,
  warsFinished: row.wars_finished, totalClansInGroup: row.total_clans_in_group,
  ...(row.group_rank === null ? {} : { groupRank: row.group_rank }), ...(row.global_rank === null ? {} : { globalRank: row.global_rank }),
  updatedAt: new Date(row.updated_at).toISOString().replace(".000Z", "Z") })

export const queryCwlLeaderboard = (rawLeague: string, query: URLSearchParams) => Effect.gen(function* () {
  const id = Number(rawLeague), size = Number(query.get("team_size")), season = query.get("season")?.trim() ?? ""
  if (!/^\d+$/u.test(rawLeague) || !Number.isSafeInteger(id) || id < 1 || !/^\d+$/u.test(query.get("team_size") ?? "") || !Number.isSafeInteger(size) || size < 1 || !season) {
    return yield* new InvalidRequest({ message: "Positive league_id and team_size, and season are required" })
  }
  const sql = yield* SqlClient.SqlClient
  const rows = yield* collect(sql<Standing>`SELECT clan_tag, season, cwl_league_id, war_size, stars, destruction::float8,
    wins, losses, ties, wars_finished, total_clans_in_group, group_rank, global_rank, updated_at
    FROM cwl_standings WHERE season = ${season} AND cwl_league_id = ${id} AND war_size = ${size}
    ORDER BY global_rank NULLS LAST, group_rank NULLS LAST, clan_tag`.stream)
  return { season, cwlLeagueId: id, warSize: size, items: rows.map(standing) }
})

interface HistoryRow {
  season: string; cwl_league_id: number | null; state: string; war_size: number | null; rounds: unknown;
  clan_tag: string; name: string; clan_level: number; badge_token: string;
  members: ReadonlyArray<{ tag: string; name: string; townHallLevel: number }>; standing: Standing | null;
}
export const queryCwlClanRankingHistory = (rawTag: string) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), sql = yield* SqlClient.SqlClient
  const rows = yield* collect(sql<HistoryRow>`SELECT g.season, g.cwl_league_id, g.state, g.war_size, g.rounds,
    clan.clan_tag, clan.name, clan.clan_level, clan.badge_token,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('tag', member.tag, 'name', member.name, 'townHallLevel', member.town_hall) ORDER BY member.tag)
      FROM cwl_group_members member WHERE member.cwl_id = clan.cwl_id AND member.clan_tag = clan.clan_tag), '[]'::jsonb) AS members,
    CASE WHEN saved.cwl_id IS NULL THEN NULL ELSE to_jsonb(saved) END AS standing
    FROM cwl_groups g JOIN cwl_group_clans clan ON clan.cwl_id = g.cwl_id
    LEFT JOIN cwl_standings saved ON saved.cwl_id = clan.cwl_id AND saved.clan_tag = clan.clan_tag
    WHERE clan.clan_tag = ${tag} ORDER BY g.season DESC, g.cwl_id DESC`.stream)
  const items = yield* Effect.forEach(rows, (row) => Effect.gen(function* () {
    const tags = yield* rounds(row.rounds)
    return { season: row.season, state: row.state, ...(row.cwl_league_id === null ? {} : { cwlLeagueId: row.cwl_league_id }),
      ...(row.war_size === null ? {} : { warSize: row.war_size }), rounds: tags.map((warTags) => ({ warTags })),
      clan: { clanTag: row.clan_tag, name: row.name, clanLevel: row.clan_level, badgeToken: row.badge_token, members: row.members },
      ...(row.standing === null ? {} : { standing: standing(row.standing) }) }
  }))
  return { clanTag: tag, items }
})

export const queryStoredCwlGroup = (rawTag: string, query: URLSearchParams) => Effect.gen(function* () {
  const tag = yield* publicTag(rawTag), season = query.get("season")?.trim() ?? ""
  if (season && (!/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/u.test(season)
    || !Number.isFinite(Date.parse(season)) || new Date(season).toISOString().slice(0, season.length) !== season)) {
    return yield* new InvalidRequest({ message: "A valid YYYY-MM or YYYY-MM-DD season is required" })
  }
  yield* ensureCwlLeagueIds(tag)
  const sql = yield* SqlClient.SqlClient
  const group = (yield* sql<{ cwl_id: string; season: string; state: string; rounds: unknown; cwl_league_id: number | null }>`
    SELECT g.cwl_id, g.season, g.state, g.rounds, g.cwl_league_id FROM cwl_groups g
    JOIN cwl_group_clans clan ON clan.cwl_id = g.cwl_id WHERE clan.clan_tag = ${tag} AND (${season} = '' OR g.season = ${season})
    ORDER BY g.season DESC, g.cwl_id DESC LIMIT 1`.pipe(Effect.mapError(failure)))[0]
  if (!group) return yield* new NotFound({ message: "Stored CWL group not found" })
  if (encoder.encode(JSON.stringify(group)).byteLength > maxResponseBytes) return yield* tooLarge()
  const tags = yield* rounds(group.rounds)
  const clans = yield* collect(sql<{ tag: string; name: string; clanLevel: number; badge_token: string; members: HistoryRow["members"] }>`
    SELECT clan.clan_tag AS tag, clan.name, clan.clan_level AS "clanLevel", clan.badge_token,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('tag', member.tag, 'name', member.name, 'townHallLevel', member.town_hall) ORDER BY member.tag)
        FROM cwl_group_members member WHERE member.cwl_id = clan.cwl_id AND member.clan_tag = clan.clan_tag), '[]'::jsonb) AS members
    FROM cwl_group_clans clan WHERE clan.cwl_id = ${group.cwl_id} ORDER BY clan.clan_tag`.stream)
  const warLeague = group.cwl_league_id === null ? null : leagueReference("war_leagues", group.cwl_league_id) ?? null
  const base = { state: group.state, season: group.season, warLeague,
    clans: clans.map(({ badge_token, ...clan }) => ({ ...clan, badgeUrls: badgeUrls(badge_token) })),
    rounds: tags.map((warTags) => ({ warTags: warTags.map((tag) => ({ tag })) })) }
  let bytes = encoder.encode(JSON.stringify(base)).byteLength
  if (bytes > maxResponseBytes) return yield* tooLarge()
  const frequencies = new Map<string, number>()
  for (const round of tags) for (const warTag of round) if (warTag && warTag !== "#0") frequencies.set(warTag, (frequencies.get(warTag) ?? 0) + 1)
  const refs = yield* collect(sql<{ war_id: string; clan_tag: string; war_tag: string }>`SELECT war_id::text, clan_tag, war_tag
    FROM wars WHERE war_type = 'cwl' AND war_tag = ANY(${[...frequencies.keys()]}::text[])`.stream)
  const wars = new Map<string, object>()
  const sizes = new Map<string, number>()
  for (const ref of refs) {
    const archive = yield* readArchiveWar(ref.war_id)
    if (!archive) continue
    const { battleModifier: _modifier, ...war } = officialArchiveWar(archive.war, ref.clan_tag)
    const value = { ...war, season: group.season }
    const valueBytes = encoder.encode(JSON.stringify(value)).byteLength
    const previousBytes = sizes.get(ref.war_tag) ?? encoder.encode(JSON.stringify({ tag: ref.war_tag })).byteLength
    bytes += (valueBytes - previousBytes) * (frequencies.get(ref.war_tag) ?? 1)
    if (bytes > maxResponseBytes) return yield* tooLarge()
    wars.set(ref.war_tag, value)
    sizes.set(ref.war_tag, valueBytes)
  }
  return { ...base,
    rounds: tags.map((warTags) => ({ warTags: warTags.map((warTag) => wars.get(warTag) ?? { tag: warTag }) })) }
})

export const publicClanExtraRuntimeRoutes = [
  { method: "GET", path: "/v2/clan/:tag/rankings" }, { method: "GET", path: "/v2/clan/:tag/cached" },
  { method: "GET", path: "/v2/cwl/:tag/ranking-history" }, { method: "GET", path: "/v2/cwl/:tag/group" },
  { method: "GET", path: "/v2/leaderboard/cwl/:leagueId" },
] as const
export const dispatchPublicClanExtra = (request: Request, _bindings: WorkerBindings) => Effect.gen(function* () {
  if (request.method !== "GET") return undefined
  const url = new URL(request.url), path = url.pathname
  let endpoint: AnyEndpoint, value: unknown
  const clan = /^\/v2\/clan\/([^/]+)\/(rankings|cached)$/u.exec(path)
  const cwl = /^\/v2\/cwl\/([^/]+)\/(ranking-history|group)$/u.exec(path)
  const leaderboard = /^\/v2\/leaderboard\/cwl\/([^/]+)$/u.exec(path)
  const parameter = (raw: string) => Effect.try({ try: () => decodeURIComponent(raw), catch: () => new InvalidRequest({ message: "Invalid path encoding" }) })
  if (clan) {
    const tag = yield* parameter(clan[1]!)
    endpoint = clan[2] === "cached" ? BotClanCachedEndpoint : BotClanRankingsEndpoint
    value = yield* (clan[2] === "cached" ? queryCachedClan(tag) : queryClanRankings(tag))
  } else if (cwl) {
    const tag = yield* parameter(cwl[1]!)
    endpoint = cwl[2] === "group" ? BotCwlGroupEndpoint : BotCwlRankingHistoryEndpoint
    value = yield* (cwl[2] === "group" ? queryStoredCwlGroup(tag, url.searchParams) : queryCwlClanRankingHistory(tag))
  } else if (leaderboard) {
    endpoint = BotCwlLeaderboardEndpoint
    value = yield* queryCwlLeaderboard(yield* parameter(leaderboard[1]!), url.searchParams)
  } else return undefined
  const encoded = yield* Schema.encodeUnknownEffect(endpoint.response)(value).pipe(Effect.orDie)
  const body = JSON.stringify(encoded)
  if (encoder.encode(body).byteLength > maxResponseBytes) return yield* tooLarge()
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8" } })
})
