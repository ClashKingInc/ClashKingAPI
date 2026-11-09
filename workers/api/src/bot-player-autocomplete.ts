import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"

export const dispatchBotPlayerAutocomplete = (request: Request) => Effect.gen(function* () {
  const url = new URL(request.url), match = /^\/v2\/bot\/servers\/(\d+)\/player-autocomplete$/u.exec(url.pathname)
  if (!match) return undefined
  yield* (yield* AuthIdentity).requireBot(request)
  const query = (url.searchParams.get("query") ?? "").trim()
  if (request.method !== "GET" || query.length > 100 || [...url.searchParams.keys()].some(key => key !== "query")) {
    return yield* new InvalidRequest({ message: "Provide a player name or tag of up to 100 characters" })
  }
  const sql = yield* SqlClient.SqlClient
  // Read the bounded linked-clan rosters, not global player search or Discord
  // account links. DISTINCT also handles a player moving between snapshots.
  const items = yield* sql<{ tag: string; name: string; townHallLevel: number; clanName: string }>`
    WITH roster AS (
      SELECT DISTINCT ON (member.tag) member.tag, COALESCE(member.name, member.tag) AS name,
        COALESCE(member.town_hall, 0) AS "townHallLevel", clan.name AS "clanName"
      FROM server_clans scoped JOIN basic_clan clan ON clan.tag = scoped.tag
      CROSS JOIN LATERAL jsonb_to_recordset(clan.members) AS member(tag text, name text, town_hall integer)
      WHERE scoped.server_id = ${match[1]} AND member.tag IS NOT NULL
      ORDER BY member.tag, clan.tag
    )
    SELECT * FROM roster
    WHERE ${query} = '' OR strpos(lower(name), lower(${query})) > 0 OR strpos(lower(tag), lower(${query})) > 0
    ORDER BY "townHallLevel" DESC, name, tag LIMIT 25
  `.pipe(Effect.mapError(cause => new DatabaseFailure({ cause, message: "Linked clan player suggestions are unavailable" })))
  return Response.json({ items })
})
