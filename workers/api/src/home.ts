import type { HomeActivityRequest, HomeActivityResponse } from "@clashking/api-contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

import type { ApiPrincipal } from "./auth.js"
import { DatabaseFailure, Forbidden, InvalidRequest } from "./errors.js"

interface LinkRow {
  readonly clan_tag: string | null
  readonly tag: string
}

interface ActivityRow {
  readonly clan_name: string | null
  readonly clan_tag: string
  readonly event_type: string
  readonly occurred_at: Date | string
  readonly player_name: string | null
  readonly player_tag: string
  readonly townhall_level: number | null
}

export const correctTag = (raw: string): string => {
  const normalized = raw.trim().toUpperCase().replaceAll("O", "0").replaceAll(/[^A-Z0-9#]/gu, "")
  if (normalized.length === 0 || normalized.startsWith("#")) return normalized
  return `#${normalized}`
}

const isoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

interface ValidatedHomeActivityRequest {
  readonly accountId: string
  readonly limit: number
  readonly mappings: ReadonlyArray<{
    readonly clanTag: string | null
    readonly playerTag: string
  }>
}

export const validateHomeActivityRequest = (
  request: HomeActivityRequest,
  principal: ApiPrincipal,
): Effect.Effect<ValidatedHomeActivityRequest, Forbidden | InvalidRequest> => Effect.gen(function* () {
  const accountId = request.account_id.trim()
  if (accountId.length === 0) {
    return yield* new InvalidRequest({ message: "Invalid link subject" })
  }
  if (principal.kind === "user" && principal.userId !== accountId) {
    return yield* new Forbidden({ message: "You cannot query activity for another user" })
  }
  if (request.mappings.length === 0) {
    return yield* new InvalidRequest({ message: "At least one player mapping is required" })
  }
  if (request.mappings.length > 100) {
    return yield* new InvalidRequest({ message: "Too many player mappings" })
  }

  const mappings = request.mappings.map((mapping) => ({
    playerTag: correctTag(mapping.player_tag),
    clanTag: mapping.clan_tag === null ? null : correctTag(mapping.clan_tag),
  }))
  if (mappings.some(({ playerTag, clanTag }) =>
    playerTag.length === 0 || clanTag !== null && clanTag.length === 0,
  )) {
    return yield* new InvalidRequest({ message: "Player and clan tags must not be empty" })
  }
  if (new Set(mappings.map(({ playerTag }) => playerTag)).size !== mappings.length) {
    return yield* new InvalidRequest({ message: "Duplicate player_tag" })
  }
  const limit = Math.max(1, Math.min(100, request.limit === undefined || request.limit === 0
    ? 25
    : Math.trunc(request.limit)))

  return { accountId, limit, mappings }
})

export const queryHomeActivity = (
  request: HomeActivityRequest,
  principal: ApiPrincipal,
): Effect.Effect<
  HomeActivityResponse,
  DatabaseFailure | Forbidden | InvalidRequest,
  SqlClient.SqlClient
> => Effect.gen(function* () {
  const { accountId, limit, mappings } = yield* validateHomeActivityRequest(request, principal)
  const sql = yield* SqlClient.SqlClient

  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`
    const playerTags = mappings.map(({ playerTag }) => playerTag)
    const links = yield* sql<LinkRow>`
      SELECT links.tag, players.clan_tag
      FROM player_links AS links
      LEFT JOIN basic_player AS players ON players.tag = links.tag
      WHERE links.user_id = ${accountId}
        AND links.is_verified = true
        AND links.tag = ANY(${playerTags}::text[])
    `
    if (links.length !== mappings.length) {
      return yield* new Forbidden({
        message: "Every submitted player must be a verified link owned by the account",
      })
    }
    const storedClans = new Map(links.map((row) => [
      correctTag(row.tag),
      row.clan_tag === null ? null : correctTag(row.clan_tag),
    ]))
    const clanTags = new Set<string>()
    for (const mapping of mappings) {
      if (mapping.clanTag === null) continue
      if (storedClans.get(mapping.playerTag) !== mapping.clanTag) {
        return yield* new InvalidRequest({
          message: "Submitted clan does not match the player's current clan",
        })
      }
      clanTags.add(mapping.clanTag)
    }
    if (clanTags.size === 0) return { items: [] }

    const rows = yield* sql<ActivityRow>`
      SELECT joins."time" AS occurred_at,
             joins."type" AS event_type,
             joins.player_tag,
             joins.clan_tag,
             joins.player_name,
             clans.name AS clan_name,
             joins.townhall_level
      FROM join_leave_history AS joins
      LEFT JOIN basic_clan AS clans ON clans.tag = joins.clan_tag
      WHERE joins.clan_tag = ANY(${[...clanTags]}::text[])
      ORDER BY occurred_at DESC, player_tag ASC, event_type ASC
      LIMIT ${limit}
    `
    return {
      items: rows.map((row) => ({
        type: "join_leave" as const,
        timestamp: isoString(row.occurred_at),
        event_type: row.event_type,
        player_tag: row.player_tag,
        clan_tag: row.clan_tag,
        ...(row.player_name === null ? {} : { player_name: row.player_name }),
        ...(row.clan_name === null ? {} : { clan_name: row.clan_name }),
        ...(row.townhall_level === null ? {} : { townhall_level: row.townhall_level }),
      })),
    }
  })).pipe(
    Effect.mapError((cause) =>
      cause instanceof Forbidden || cause instanceof InvalidRequest
        ? cause
        : new DatabaseFailure({ cause, message: "Home activity query failed" }),
    ),
  )
}).pipe(Effect.withSpan("HomeActivity.query"))
