import { dashboardEndpoints, DecimalSnowflake } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { DatabaseFailure, InvalidRequest, NotFound } from "./errors.js"
import { readBoundedJson } from "./request-body.js"
import { ServerAuthorization } from "./server-authorization.js"

export const dashboardRosterBonusRoutes = [
  { method: "PUT", path: "/v2/server/:serverId/cwl/:clanTag/bonus-recipients" },
] as const

const validSeason = (season: string): boolean => {
  if (!/^[2-9]\d{3}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/u.test(season)) return false
  const date = new Date(`${season.length === 7 ? `${season}-01` : season}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(season)
}

export const dispatchDashboardRosterBonuses = (request: Request) => Effect.gen(function* () {
  const url = new URL(request.url)
  const match = /^\/v2\/server\/([^/]+)\/cwl\/([^/]+)\/bonus-recipients$/u.exec(url.pathname)
  if (request.method !== "PUT" || match === null) return undefined
  const season = (url.searchParams.get("season") ?? "").trim()
  if (!validSeason(season)) return yield* new InvalidRequest({ message: "A valid YYYY-MM or YYYY-MM-DD season is required" })
  const path = yield* Effect.try({
    try: () => ({ serverId: decodeURIComponent(match[1]!), clanTag: decodeURIComponent(match[2]!) }),
    catch: () => new InvalidRequest({ message: "Path contains malformed percent encoding" }),
  })
  const serverId = yield* Schema.decodeUnknownEffect(DecimalSnowflake)(path.serverId).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "server_id must be a decimal Discord ID" })),
  )
  const normalizeTag = (tag: string) => `#${tag.trim().toUpperCase().replace(/^[#!]+/u, "").replaceAll("O", "0")}`
  const clanTag = normalizeTag(path.clanTag)
  if (clanTag === "#") return yield* new InvalidRequest({ message: "A clan tag is required" })
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
  }
  const endpoint = dashboardEndpoints.dashboardReplaceCwlBonusRecipients
  const body = yield* readBoundedJson(request).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(endpoint.body)),
    Effect.catchTag("SchemaError", () => Effect.fail(new InvalidRequest({ message: "Request body failed schema validation" }))),
  )
  const items = body.recipients.map((item) => ({ playerTag: normalizeTag(item.playerTag), medalCount: item.medalCount }))
  const seen = new Set<string>()
  for (const item of items) {
    if (item.playerTag === "#" || !Number.isInteger(item.medalCount) || item.medalCount < 0 || item.medalCount > 32767) {
      return yield* new InvalidRequest({ message: "Each recipient requires a playerTag and integer medalCount between 0 and 32767" })
    }
    if (seen.has(item.playerTag)) return yield* new InvalidRequest({ message: "Recipient player tags must be unique" })
    seen.add(item.playerTag)
  }
  // The canonical Go authorization maps /cwl/ to the settings section.
  yield* (yield* ServerAuthorization).require(request, serverId, { section: "settings", write: true })
  const sql = yield* SqlClient.SqlClient
  yield* sql.withTransaction(Effect.gen(function* () {
    const configured = yield* sql`SELECT tag FROM server_clans WHERE server_id = ${serverId} AND tag = ${clanTag} FOR SHARE`
    if (configured.length === 0) return yield* new NotFound({ message: "Clan is not configured for this server" })
    // Recipients are keyed by season/clan, not server. Lock their canonical
    // group so replacements from different configured servers cannot interleave.
    const groups = yield* sql<{ cwl_id: string }>`
      SELECT g.cwl_id FROM cwl_groups g JOIN cwl_group_clans clan ON clan.cwl_id = g.cwl_id
      WHERE g.season = ${season} AND clan.clan_tag = ${clanTag}
      ORDER BY g.cwl_id DESC LIMIT 1 FOR UPDATE OF g
    `
    const group = groups[0]
    if (group === undefined) return yield* new NotFound({ message: "Stored CWL group not found" })
    const members = yield* sql<{ tag: string }>`SELECT tag FROM cwl_group_members WHERE cwl_id = ${group.cwl_id} AND clan_tag = ${clanTag} FOR SHARE`
    const memberTags = new Set(members.map((member) => member.tag))
    for (const item of items) {
      if (!memberTags.has(item.playerTag)) return yield* new InvalidRequest({ message: `Recipient ${item.playerTag} is not in the stored CWL master roster` })
    }
    yield* sql`DELETE FROM cwl_bonus_recipients WHERE season = ${season} AND clan_tag = ${clanTag}`
    for (const item of items) {
      yield* sql`INSERT INTO cwl_bonus_recipients (season, clan_tag, player_tag, medal_count)
        VALUES (${season}, ${clanTag}, ${item.playerTag}, ${item.medalCount})`
    }
  })).pipe(Effect.mapError((cause) => cause instanceof InvalidRequest || cause instanceof NotFound
    ? cause : new DatabaseFailure({ cause, message: "CWL bonus replacement failed" })))
  const encoded = yield* Schema.encodeUnknownEffect(endpoint.response)({ items }).pipe(
    Effect.mapError((cause) => new DatabaseFailure({ cause, message: "CWL bonus response encoding failed" })),
  )
  return Response.json(encoded, { headers: { "cache-control": "no-store" } })
})
