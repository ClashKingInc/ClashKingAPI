import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { readBoundedJson } from "./request-body.js"
import { DatabaseFailure, InvalidRequest } from "./errors.js"

export const dispatchBotPlayerAutocomplete = (request: Request) => Effect.gen(function* () {
  const url = new URL(request.url), match = /^\/v2\/bot\/servers\/(\d+)\/player-autocomplete$/u.exec(url.pathname)
  const personal = /^\/v2\/bot\/users\/(\d+)\/search-suggestions$/u.exec(url.pathname)
  const legends = url.pathname === "/v2/bot/legends/player-autocomplete"
  if (!match && !personal && !legends) return undefined
  yield* (yield* AuthIdentity).requireBot(request)
  const sql = yield* SqlClient.SqlClient
  if (personal && request.method === "POST") {
    const raw = yield* readBoundedJson(request)
    const body = raw as Record<string, unknown>
    if (!body || (body.type !== "player" && body.type !== "clan") || typeof body.tag !== "string" || !/^#[0289PYLQGRJCUV]{3,15}$/u.test(body.tag) || typeof body.name !== "string" || body.name.length > 100) return yield* new InvalidRequest({message:"Invalid recent search"})
    const data = {name:body.name,tag:body.tag,...(Number.isInteger(body.townHallLevel) && Number(body.townHallLevel)>0 ? {townHallLevel:body.townHallLevel} : {})}
    // Reuse the app's history, not another Bot-only history. Record only completed
    // profile reads; autocomplete never writes. The Bot authenticates the actor.
    yield* sql.withTransaction(Effect.gen(function*(){
      yield* sql`DELETE FROM user_recent_searches WHERE user_id=${personal[1]} AND entity_type=${body.type} AND tag=${body.tag}`
      yield* sql`INSERT INTO user_recent_searches(user_id,entity_type,tag,data,created_at) VALUES(${personal[1]},${body.type},${body.tag},${JSON.stringify(data)}::jsonb,now())`
    })).pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Recent search could not be saved"})))
    return Response.json({ok:true})
  }
  const query = (url.searchParams.get("query") ?? "").trim()
  if (request.method !== "GET" || query.length > 100 || [...url.searchParams.keys()].some(key => !["query","type","legendsOnly"].includes(key))) {
    return yield* new InvalidRequest({ message: "Provide a player name or tag of up to 100 characters" })
  }
  const legendsOnly = url.searchParams.get("legendsOnly") === "true"
  if (personal) {
    const type = url.searchParams.get("type")
    if (type !== "player" && type !== "clan") return yield* new InvalidRequest({message:"Choose player or clan suggestions"})
    // Bound history before joining profiles; the existing user/tag indexes serve
    // both mobile and Bot suggestions. No per-keystroke official API requests.
    const items = yield* sql<{name:string;tag:string;townHallLevel:number}>`
      WITH candidates AS (
        (SELECT tag,data,0 AS priority,created_at AS seen FROM user_recent_searches
          WHERE user_id=${personal[1]} AND entity_type=${type} AND created_at>now()-interval '90 days' ORDER BY created_at DESC LIMIT 100)
        UNION ALL
        (SELECT tag,'{}'::jsonb,1,created_at FROM user_bookmarks WHERE user_id=${personal[1]} AND entity_type=${type} ORDER BY order_index,created_at LIMIT 100)
        UNION ALL
        (SELECT tag,'{}'::jsonb,2,'epoch'::timestamptz FROM player_links WHERE user_id=${personal[1]} AND ${type}='player' AND is_verified AND NOT hidden LIMIT 100)
      ), unique_candidates AS (
        SELECT DISTINCT ON(tag) * FROM candidates ORDER BY tag,priority,seen DESC
      ), named AS (
        SELECT c.tag,COALESCE(p.name,cl.name,c.data->>'name',c.tag) AS name,
          COALESCE(p.townhall_level,CASE WHEN c.data->>'townHallLevel' ~ '^[0-9]{1,2}$' THEN (c.data->>'townHallLevel')::int END,0) AS "townHallLevel",p.league_id,c.priority,c.seen
        FROM unique_candidates c
        LEFT JOIN basic_player p ON ${type}='player' AND p.tag=c.tag
        LEFT JOIN basic_clan cl ON ${type}='clan' AND cl.tag=c.tag
      ) SELECT name,tag,"townHallLevel" FROM named
      WHERE (NOT ${legendsOnly} OR league_id=105000036)
        AND (${query}='' OR strpos(lower(name),lower(${query}))>0 OR strpos(lower(tag),lower(${query}))>0)
      ORDER BY priority,seen DESC,name,tag LIMIT 25
    `.pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Personal suggestions are unavailable"})))
    return Response.json({items})
  }
  if (legends) {
    const items = yield* sql<{name:string;tag:string;townHallLevel:number}>`
      SELECT COALESCE(NULLIF(r.player_name,''),p.name,r.player_tag) AS name,r.player_tag AS tag,COALESCE(p.townhall_level,0) AS "townHallLevel"
      FROM legend_rankings_current r LEFT JOIN basic_player p ON p.tag=r.player_tag
      WHERE (${query}='' OR strpos(lower(r.player_name),lower(${query}))>0 OR strpos(lower(r.player_tag),lower(${query}))>0)
      ORDER BY r.rank,r.player_tag LIMIT 25
    `.pipe(Effect.mapError(cause=>new DatabaseFailure({cause,message:"Legend suggestions are unavailable"})))
    return Response.json({items})
  }
  // Read the bounded linked-clan rosters, not global player search or Discord
  // account links. DISTINCT also handles a player moving between snapshots.
  const items = yield* sql<{ tag: string; name: string; townHallLevel: number; clanName: string }>`
    WITH roster AS (
      SELECT DISTINCT ON (member.tag) member.tag, COALESCE(member.name, member.tag) AS name,
        COALESCE(member.town_hall, p.townhall_level, 0) AS "townHallLevel", clan.name AS "clanName"
      FROM server_clans scoped JOIN basic_clan clan ON clan.tag = scoped.tag
      CROSS JOIN LATERAL jsonb_to_recordset(clan.members) AS member(tag text, name text, town_hall integer)
      LEFT JOIN basic_player p ON p.tag=member.tag
      WHERE scoped.server_id = ${match![1]} AND member.tag IS NOT NULL AND (NOT ${legendsOnly} OR p.league_id=105000036)
      ORDER BY member.tag, clan.tag
    )
    SELECT * FROM roster
    WHERE ${query} = '' OR strpos(lower(name), lower(${query})) > 0 OR strpos(lower(tag), lower(${query})) > 0
    ORDER BY "townHallLevel" DESC, name, tag LIMIT 25
  `.pipe(Effect.mapError(cause => new DatabaseFailure({ cause, message: "Linked clan player suggestions are unavailable" })))
  return Response.json({ items })
})
