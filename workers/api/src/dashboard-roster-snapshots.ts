import { botEndpoints, dashboardEndpoints, DecimalSnowflake } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { Conflict, DatabaseFailure, InvalidRequest, NotFound, type ApiFailure } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { readBoundedJson } from "./request-body.js"
import { ServerAuthorization } from "./server-authorization.js"
import { loadRosterClashPlayer, rosterPlayerSnapshot } from "./dashboard-roster-refresh.js"

export const dashboardRosterSnapshotRoutes = [
  { method: "POST", path: "/v2/roster/refresh-batch" },
  { method: "POST", path: "/v2/roster/refresh-data" },
  { method: "POST", path: "/v2/server/:serverId/rosters/:rosterId/refresh" },
] as const

const database = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
  Effect.mapError((cause) => cause instanceof Conflict || cause instanceof NotFound || cause instanceof InvalidRequest
    ? cause : new DatabaseFailure({ cause, message: "Roster snapshot operation failed" })),
)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

const refreshData = (sql: SqlClient.SqlClient, bindings: WorkerBindings, serverId: string, rosterId: string) => Effect.gen(function* () {
  const cooldown = Number(bindings.ROSTER_REFRESH_COOLDOWN_MINUTES)
  if (!Number.isSafeInteger(cooldown) || cooldown < 1) {
    return yield* new DatabaseFailure({ cause: "Invalid ROSTER_REFRESH_COOLDOWN_MINUTES", message: "Roster refresh configuration is invalid" })
  }
  const refreshId = crypto.randomUUID()
  const claim = yield* database(sql.withTransaction(Effect.gen(function* () {
    const row = (yield* sql<{ last_refreshed_at: Date | null; refresh_started_at: Date | null }>`
      SELECT last_refreshed_at, refresh_started_at FROM rosters WHERE id = ${rosterId} AND server_id = ${serverId} FOR UPDATE
    `)[0]
    if (row === undefined) return yield* new NotFound({ message: "Roster not found" })
    const recent = (date: Date | null) => date !== null && date.getTime() + cooldown * 60_000 > Date.now()
    if (recent(row.last_refreshed_at)) return { lease: null, refreshedAt: row.last_refreshed_at!.toISOString() }
    if (recent(row.refresh_started_at)) return yield* new Conflict({ message: "Roster data refresh is already in progress" })
    const claimed = (yield* sql<{ lease: string }>`UPDATE rosters SET refresh_started_at = clock_timestamp()
      WHERE id = ${rosterId} RETURNING refresh_started_at::text AS lease`)[0]!
    return { lease: claimed.lease, refreshedAt: new Date().toISOString() }
  })))
  const base = { refreshId, scope: "data" as const, refreshedPlayers: 0, failedPlayers: 0, refreshedAt: claim.refreshedAt }
  if (claim.lease === null) return { ...base, status: "reused" as const, reused: true }
  const lease = claim.lease
  const work = Effect.gen(function* () {
    const members = yield* database(sql<{ tag: string; row_version: string }>`SELECT tag, xmin::text AS row_version FROM roster_members
      WHERE roster_id = ${rosterId} ORDER BY tag`)
    const results = yield* Effect.forEach(members, (member) => loadRosterClashPlayer(bindings, member.tag).pipe(
      Effect.map((player) => ({ member, player, missing: false })),
      Effect.catchTag("NotFound", () => Effect.succeed({ member, player: null, missing: true })),
      Effect.catchTag("UpstreamUnavailable", () => Effect.succeed({ member, player: null, missing: false })),
    ), { concurrency: 5 })
    return yield* database(sql.withTransaction(Effect.gen(function* () {
      const current = yield* sql`SELECT id FROM rosters WHERE id = ${rosterId} AND server_id = ${serverId}
        AND refresh_started_at = ${lease}::timestamptz FOR UPDATE`
      if (current.length !== 1) return yield* new Conflict({ message: "Roster refresh was superseded" })
      let refreshedPlayers = 0, failedPlayers = 0
      for (const result of results) {
        if (result.player === null && !result.missing) { failedPlayers++; continue }
        // Fence the exact row version observed before I/O, including rows with
        // no added_at. A concurrent edit or remove/re-add must survive.
        if (result.missing) {
          const removed = yield* sql`DELETE FROM roster_members WHERE roster_id = ${rosterId} AND tag = ${result.member.tag}
            AND xmin::text = ${result.member.row_version} RETURNING tag`
          refreshedPlayers += removed.length
          continue
        }
        const player = result.player!
        const snapshot = rosterPlayerSnapshot(player)
        const updated = yield* sql`UPDATE roster_members SET name = ${player.name}, townhall = ${player.townHallLevel},
          trophies = ${player.trophies}, current_clan_tag = ${player.clan?.tag ?? null}, current_clan_name = ${player.clan?.name ?? null},
          league_id = ${player.leagueTier?.id || null}, league_name = ${player.leagueTier?.name || null},
          hero_level_sum = ${snapshot.hero_level_sum}, max_percent = ${snapshot.max_percent},
          last_online = (SELECT max(seen_at) FROM player_online_events WHERE tag = ${player.tag}), refreshed_at = now()
          WHERE roster_id = ${rosterId} AND tag = ${player.tag} AND xmin::text = ${result.member.row_version} RETURNING tag`
        refreshedPlayers += updated.length
      }
      yield* sql`UPDATE roster_members member SET discord_user_id = linked.user_id,
        discord_username = CASE WHEN member.discord_user_id IS DISTINCT FROM linked.user_id THEN NULL ELSE member.discord_username END,
        discord_avatar_url = CASE WHEN member.discord_user_id IS DISTINCT FROM linked.user_id THEN NULL ELSE member.discord_avatar_url END
        FROM (SELECT m.tag, links.user_id FROM roster_members m LEFT JOIN player_links links ON links.tag = m.tag WHERE m.roster_id = ${rosterId}) linked
        WHERE member.roster_id = ${rosterId} AND member.tag = linked.tag
          AND member.discord_user_id IS DISTINCT FROM linked.user_id`
      const finished = (yield* sql<{ refreshed_at: Date }>`UPDATE rosters SET last_refreshed_at = now(), refresh_started_at = NULL,
        updated_at = now(), revision = revision + 1 WHERE id = ${rosterId} RETURNING last_refreshed_at AS refreshed_at`)[0]!
      return { ...base, status: "completed" as const, refreshedPlayers, failedPlayers, refreshedAt: finished.refreshed_at.toISOString(), reused: false }
    })))
  })
  return yield* work.pipe(Effect.ensuring(sql`UPDATE rosters SET refresh_started_at = NULL
    WHERE id = ${rosterId} AND refresh_started_at = ${lease}::timestamptz`.pipe(Effect.catch(() => Effect.void))))
})

export const dispatchDashboardRosterSnapshots = (request: Request, bindings: WorkerBindings): Effect.Effect<
  Response | undefined, ApiFailure, SqlClient.SqlClient | ServerAuthorization
> => Effect.gen(function* () {
  if (request.method !== "POST") return undefined
  const url = new URL(request.url)
  if (url.pathname === "/v2/roster/refresh-batch") {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
    }
    const endpoint = dashboardEndpoints.dashboardRosterRefreshBatch
    const body = yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(endpoint.body)),
      Effect.catchTag("SchemaError", () => Effect.fail(new InvalidRequest({ message: "Request body failed schema validation" }))))
    if (body.rosterIds.length < 1 || body.rosterIds.length > 25 || body.rosterIds.some((id) => !uuid.test(id))
      || new Set(body.rosterIds.map((id) => id.toLowerCase())).size !== body.rosterIds.length) {
      return yield* new InvalidRequest({ message: "1 to 25 unique roster UUIDs are required" })
    }
    yield* (yield* ServerAuthorization).require(request, body.serverId, { section: "rosters", write: true })
    const sql = yield* SqlClient.SqlClient
    const rosters = yield* Effect.forEach(body.rosterIds, (rosterId) => refreshData(sql, bindings, body.serverId, rosterId).pipe(
      Effect.map((result) => ({ rosterId, status: result.status, refreshedPlayers: result.refreshedPlayers,
        failedPlayers: result.failedPlayers, refreshedAt: result.refreshedAt })),
      Effect.catchTag("Conflict", () => Effect.succeed({ rosterId, status: "waiting" as const,
        message: "A roster refresh is already in progress; continue with the stored snapshot for this request." })),
    ))
    const encoded = yield* Schema.encodeUnknownEffect(endpoint.response)({ rosters }).pipe(
      Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Roster batch refresh response encoding failed" })),
    )
    return Response.json(encoded, { headers: { "cache-control": "no-store" } })
  }
  const path = /^\/v2\/server\/([^/]+)\/rosters\/([^/]+)\/refresh$/u.exec(url.pathname)
  if (path === null && url.pathname !== "/v2/roster/refresh-data") return undefined
  const endpoint = path === null ? dashboardEndpoints.dashboardRosterRefreshData : botEndpoints.refreshRoster
  const params = yield* Effect.try({
    try: () => path === null
      ? { serverId: url.searchParams.get("server_id") ?? "", rosterId: url.searchParams.get("roster_id") ?? "" }
      : { serverId: decodeURIComponent(path[1]!), rosterId: decodeURIComponent(path[2]!) },
    catch: () => new InvalidRequest({ message: "Path contains malformed percent encoding" }),
  })
  const serverId = yield* Schema.decodeUnknownEffect(DecimalSnowflake)(params.serverId).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "server_id must be a decimal Discord ID" })),
  )
  if (!uuid.test(params.rosterId)) return yield* new InvalidRequest({ message: "roster_id must be a UUID" })
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
  }
  const body = yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(endpoint.body)),
    Effect.catchTag("SchemaError", () => Effect.fail(new InvalidRequest({ message: "Request body failed schema validation" }))))
  yield* (yield* ServerAuthorization).require(request, serverId, { section: "rosters", write: true })
  const sql = yield* SqlClient.SqlClient
  const result = body.scope === "data" ? yield* refreshData(sql, bindings, serverId, params.rosterId)
    : yield* database(sql.withTransaction(Effect.gen(function* () {
    const roster = (yield* sql<{ roster_role_id: string | null }>`SELECT roster_role_id FROM rosters
      WHERE id = ${params.rosterId} AND server_id = ${serverId} FOR SHARE`)[0]
    if (roster === undefined) return yield* new NotFound({ message: "Roster not found" })
    if (roster.roster_role_id === null || roster.roster_role_id.trim() === "") {
      return yield* new Conflict({ message: "Roster role is not configured" })
    }
    const members = yield* sql<{ discord_user_id: string }>`SELECT DISTINCT discord_user_id FROM roster_members
      WHERE roster_id = ${params.rosterId} AND discord_user_id IS NOT NULL ORDER BY discord_user_id`
    return { refreshId: crypto.randomUUID(), scope: "role" as const, status: "ready", refreshedPlayers: 0, failedPlayers: 0,
      refreshedAt: new Date().toISOString(), reused: false, roleId: roster.roster_role_id, roleMemberUserIds: members.map((member) => member.discord_user_id) }
  })))
  const encoded = yield* Schema.encodeUnknownEffect(endpoint.response)(result).pipe(
    Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Roster refresh response encoding failed" })),
  )
  return Response.json(encoded, { headers: { "cache-control": "no-store" } })
})
