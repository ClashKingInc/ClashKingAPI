import { rosterRoleState } from "./roster-role-refresh.js"
import { gatewayHeartbeatFreshnessSeconds } from "./server-authorization.js"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { AuthIdentity } from "./auth.js"
import { DiscordApi } from "./discord-api.js"
import { readDashboardGatewayCollection } from "./dashboard-gateway-cache.js"
import type { WorkerBindings } from "./environment.js"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound, UpstreamUnavailable } from "./errors.js"
import { readBoundedJson } from "./request-body.js"

export const roleRefreshCategories = ["family", "clan", "leadership", "townhall", "builderhall", "league", "builder_league", "category", "nicknames", "tenure", "roster"] as const
const idPattern = /^[0-9]{15,20}$/u
const uuid = /^[0-9a-f-]{36}$/iu
const Member = Schema.Struct({ user: Schema.Struct({ id: Schema.String, bot: Schema.optionalKey(Schema.Boolean) }), roles: Schema.Array(Schema.String) })
const Roles = Schema.Array(Schema.Struct({ id: Schema.String, permissions: Schema.String }))
const Player = Schema.Struct({ tag: Schema.String, name: Schema.String, townHallLevel: Schema.Number,
  builderHallLevel: Schema.optionalKey(Schema.Number), trophies: Schema.optionalKey(Schema.Number),
  bestTrophies: Schema.optionalKey(Schema.Number), bestBuilderBaseTrophies: Schema.optionalKey(Schema.Number),
  warStars: Schema.optionalKey(Schema.Number), role: Schema.optionalKey(Schema.String),
  clan: Schema.optionalKey(Schema.Struct({ tag: Schema.String, name: Schema.String })),
  leagueTier: Schema.optionalKey(Schema.Struct({ name: Schema.String })),
  league: Schema.optionalKey(Schema.Struct({ name: Schema.String })), builderBaseLeague: Schema.optionalKey(Schema.Struct({ name: Schema.String })) })
const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
const snowflake = (value: unknown) => typeof value === "string" && idPattern.test(value)
const requireInput = (condition: boolean) => condition ? Effect.void : Effect.fail(new InvalidRequest({ message: "Invalid role refresh request" }))

export const refreshActorAllowed = (bindings: WorkerBindings, serverId: string, actor: string, staff: boolean) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const members = yield* Schema.decodeUnknownEffect(Schema.Array(Member))(yield* readDashboardGatewayCollection(bindings.DISCORD_CLIENT_ID, serverId, "members", [actor]))
  const member = members[0]
  if (!member || member.user.bot) return yield* new Forbidden({ message: "You must be a server member" })
  if (!staff) return
  const roles = yield* Schema.decodeUnknownEffect(Roles)(yield* readDashboardGatewayCollection(bindings.DISCORD_CLIENT_ID, serverId, "roles"))
  const discord = yield* DiscordApi
  const guild = object(yield* discord.request(`/guilds/${serverId}`))
  const settings = yield* sql<{ full_whitelist_role_id: string | null }>`SELECT full_whitelist_role_id FROM servers WHERE id=${serverId}`
  const permissions = roles.filter(role => role.id === serverId || member.roles.includes(role.id)).reduce((bits, role) => bits | BigInt(role.permissions), 0n)
  if (guild.owner_id !== actor && (permissions & (8n | 32n)) === 0n
    && !member.roles.includes(settings[0]?.full_whitelist_role_id ?? "")) return yield* new Forbidden({ message: "Manage Server or the configured whitelist role is required" })
})

export const enqueueManualRefresh = (bindings: WorkerBindings, serverId: string, body: Record<string, unknown>) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const actor = String(body.actorId ?? ""), requestId = String(body.requestId ?? "")
  const target = String(body.targetId ?? actor), kind = body.targetKind ?? "user"
  const categories = body.categories === undefined ? [...roleRefreshCategories] : body.categories
  const roleTreatment = body.roleTreatment ?? "both"
  yield* requireInput(snowflake(actor) && snowflake(requestId) && snowflake(target) && ["user", "role"].includes(String(kind))
    && Array.isArray(categories) && categories.length > 0 && categories.every(item => roleRefreshCategories.includes(item))
    && (body.preview === undefined || typeof body.preview === "boolean")
    && ["add", "remove", "both"].includes(String(roleTreatment)))
  yield* refreshActorAllowed(bindings, serverId, actor, kind === "role" || target !== actor)
  let users = [target]
  if (kind === "role") {
    const members = yield* Schema.decodeUnknownEffect(Schema.Array(Member))(yield* readDashboardGatewayCollection(bindings.DISCORD_CLIENT_ID, serverId, "members"))
    // Include currently eligible family members missing the role, as the legacy command did.
    const linked = yield* sql<{ user_id: string }>`SELECT DISTINCT links.user_id FROM player_links links
      JOIN basic_player player ON player.tag=links.tag JOIN server_clans clan ON clan.tag=player.clan_tag AND clan.server_id=${serverId}
      WHERE links.hidden=false AND links.user_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM server_roles rule WHERE rule.server_id=${serverId} AND rule.role_id=${target}
        AND ((rule.type='clan_role' AND rule.option='member' AND rule.clan_tag=clan.tag)
          OR (rule.type='family' AND rule.option='family')))`
    const eligible = new Set(linked.map(row => row.user_id))
    users = members.filter(member => !member.user.bot && (member.roles.includes(target) || eligible.has(member.user.id))).map(member => member.user.id)
  }
  yield* requireInput(users.length > 0 && users.length <= 3000)
  yield* sql.withTransaction(Effect.gen(function* () {
    for (const user of users) yield* sql`INSERT INTO role_refresh_jobs(id,server_id,user_id,request_id,actor_id,categories,preview,role_treatment)
      VALUES (${`manual:${requestId}:${user}`},${serverId},${user},${requestId},${actor},${[...new Set(categories as string[])]},${body.preview === true},${String(roleTreatment)}) ON CONFLICT(id) DO NOTHING`
  }))
  return { requestId, queued: users.length }
})

export const claimRefreshJobs = (requestId?: string, serverId?: string, includeTenure = false, includeRoster = false, includeRoleTreatment = false) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  // A single lease per member serializes manual and automatic refreshes. Token
  // fencing prevents a crashed/expired attempt acknowledging a newer revision.
  return yield* sql.withTransaction(Effect.gen(function* () {
    // Time passing is itself a tenure input. Schedule mismatched cached members
    // without requiring a game event or the independent game-autoeval setting.
    if (!requestId && includeTenure) yield* sql`INSERT INTO role_refresh_jobs(id,server_id,user_id,categories)
      SELECT 'tenure:'||server.id||':'||member.user_id,server.id,member.user_id,ARRAY['tenure']::text[]
      FROM servers server JOIN discord_cache.members member ON member.guild_id=server.id
      JOIN discord_cache.guilds guild ON guild.id=server.id
      JOIN discord_cache.gateway_shards shard ON shard.application_id=guild.application_id AND shard.shard_id=guild.shard_id
      CROSS JOIN LATERAL (SELECT CASE WHEN pg_input_is_valid(member.data->>'joined_at','timestamp with time zone')
        THEN (member.data->>'joined_at')::timestamptz END joined_at) joined
      LEFT JOIN LATERAL (SELECT rule.role_id FROM server_roles rule
        WHERE rule.server_id=server.id AND rule.type='status' AND rule.option ~ '^[0-9]{1,4}$'
          AND (CASE WHEN rule.option ~ '^[0-9]{1,4}$' THEN rule.option::int ELSE 0 END) BETWEEN 1 AND 1200
          AND joined.joined_at+make_interval(months=>(CASE WHEN rule.option ~ '^[0-9]{1,4}$' THEN rule.option::int ELSE 0 END))<=now()
        ORDER BY (CASE WHEN rule.option ~ '^[0-9]{1,4}$' THEN rule.option::int ELSE 0 END) DESC,rule.role_id LIMIT 1) earned ON true
      WHERE server.left_at IS NULL AND (${serverId ?? null}::text IS NULL OR server.id=${serverId ?? null})
        AND COALESCE(member.data->'user'->>'bot','false')<>'true' AND joined.joined_at IS NOT NULL
        AND guild.available AND guild.metadata_complete AND guild.members_complete
        AND guild.generation=shard.generation AND shard.healthy AND shard.heartbeat_at>now()-${gatewayHeartbeatFreshnessSeconds}*interval '1 second'
        AND EXISTS (SELECT 1 FROM server_roles rule WHERE rule.server_id=server.id AND rule.type='status'
          AND rule.option ~ '^[0-9]{1,4}$' AND (CASE WHEN rule.option ~ '^[0-9]{1,4}$' THEN rule.option::int ELSE 0 END) BETWEEN 1 AND 1200
          AND (COALESCE(rule.role_id=earned.role_id,false) IS DISTINCT FROM (COALESCE(member.data->'roles','[]'::jsonb) ? rule.role_id)))
        AND NOT EXISTS (SELECT 1 FROM role_refresh_jobs existing WHERE existing.id='tenure:'||server.id||':'||member.user_id
          AND ((existing.completed_at IS NULL AND (existing.attempts<12 OR existing.updated_at>=now()-interval '1 hour')) OR existing.completed_at>=now()-interval '1 hour'))
      ORDER BY server.id,member.user_id LIMIT 500
      ON CONFLICT(id) DO UPDATE SET completed_at=NULL,result=NULL,attempts=0,due_at=now(),revision=role_refresh_jobs.revision+1,updated_at=now()
      WHERE role_refresh_jobs.completed_at<now()-interval '1 hour' OR (role_refresh_jobs.attempts>=12 AND role_refresh_jobs.updated_at<now()-interval '1 hour')`
    yield* sql`DELETE FROM role_refresh_jobs WHERE id IN (SELECT id FROM role_refresh_jobs WHERE completed_at<now()-interval '7 days' ORDER BY completed_at LIMIT 100)`
    const candidates = yield* sql<{ id: string; server_id: string; user_id: string; revision: string; request_id: string | null; preview: boolean; categories: string[]; roster_role_ids: string[]; role_treatment: "add" | "remove" | "both" }>`
      SELECT job.id,job.server_id,job.user_id,job.revision::text,job.request_id,job.preview,job.categories,job.roster_role_ids,job.role_treatment FROM role_refresh_jobs job
      WHERE completed_at IS NULL AND due_at<=now() AND attempts<12
        AND (${includeRoster} OR NOT ('roster'=ANY(job.categories)))
        -- Older consumers apply both directions unconditionally. They must not
        -- claim a restricted policy and silently remove/add forbidden roles.
        AND (${includeRoleTreatment} OR job.role_treatment='both')
        AND (${requestId ?? null}::text IS NULL OR request_id=${requestId ?? null})
        AND (${serverId ?? null}::text IS NULL OR server_id=${serverId ?? null})
        AND NOT EXISTS(SELECT 1 FROM role_refresh_leases lease WHERE lease.server_id=job.server_id AND lease.user_id=job.user_id AND lease.expires_at>now())
      ORDER BY due_at,id LIMIT ${requestId ? 1 : 20} FOR UPDATE SKIP LOCKED`
    const jobs = []
    for (const row of candidates) {
      const lease = yield* sql<{ token: string; expires_at: string }>`INSERT INTO role_refresh_leases(server_id,user_id,job_id,revision,expires_at)
        VALUES(${row.server_id},${row.user_id},${row.id},${row.revision}::bigint,now()+interval '5 minutes')
        ON CONFLICT(server_id,user_id) DO UPDATE SET job_id=EXCLUDED.job_id,revision=EXCLUDED.revision,token=uuidv7(),expires_at=EXCLUDED.expires_at
        WHERE role_refresh_leases.expires_at<=now() RETURNING token::text,expires_at::text`
      if (lease[0]) {
        yield* sql`UPDATE role_refresh_jobs SET attempts=attempts+1 WHERE id=${row.id}`
        jobs.push({ ...row, token: lease[0].token, expires_at: lease[0].expires_at })
      }
    }
    return { jobs }
  }))
})

export const loadRefreshData = (bindings: WorkerBindings, serverId: string, userId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  // New servers have nullable formats. Match the dashboard defaults rather
  // than passing null to the bot's template renderer and failing the whole job.
  const settings = (yield* sql<Record<string, unknown>>`SELECT change_nickname,auto_eval_nickname,flair_non_family,
    COALESCE(nickname_rule,'[{player_clan_abbreviation}] {player_name}') AS nickname_rule,
    COALESCE(non_family_nickname_rule,'{player_name}') AS non_family_nickname_rule,
    autoeval_enabled FROM servers WHERE id=${serverId}`)[0]
  if (!settings) return yield* new NotFound({ message: "Server not found" })
  const rules = yield* sql<{ type: string; option: string; role_id: string; clan_tag: string | null }>`SELECT type,option,role_id,clan_tag FROM server_roles WHERE server_id=${serverId}`
  const clans = yield* sql<{ tag: string; category: string | null; abbreviation: string }>`SELECT clan.tag,category.name AS category,clan.abbreviation FROM server_clans clan LEFT JOIN server_clan_categories category ON category.id=clan.category_id WHERE clan.server_id=${serverId}`
  const links = yield* sql<{ tag: string; is_main: boolean; server_main: boolean }>`SELECT links.tag,links.is_main,COALESCE(settings.is_main AND settings.selected_by_user_id=links.user_id,false) AS server_main
    FROM player_links links LEFT JOIN player_links_settings settings ON settings.tag=links.tag AND settings.server_id=${serverId}
    WHERE links.user_id=${userId} AND links.hidden=false ORDER BY links.order_index,links.tag`
  if (links.length > 100) return yield* new InvalidRequest({ message: "Too many visible linked accounts" })
  const accounts = yield* Effect.forEach(links, link => Effect.gen(function* () {
    const response = yield* Effect.tryPromise({ try: signal => bindings.CLASH_PROXY.fetch(new Request(`http://clash-proxy.internal/v1/players/${encodeURIComponent(link.tag)}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) })),
      catch: cause => new UpstreamUnavailable({ cause, message: "Player data unavailable; refresh left unchanged" }) })
    if (!response.ok) { yield* Effect.promise(() => response.body?.cancel().catch(() => undefined) ?? Promise.resolve()); return yield* new UpstreamUnavailable({ cause: response.status, message: "Player data unavailable; refresh left unchanged" }) }
    const player = yield* Schema.decodeUnknownEffect(Player)(yield* readBoundedJson(response, 300_000))
    if (player.tag !== link.tag) return yield* new UpstreamUnavailable({ cause: "Mismatched player", message: "Player data unavailable; refresh left unchanged" })
    return player
  }), { concurrency: 5 })
  const roster = yield* rosterRoleState(sql,serverId,userId)
  return { settings, rules, clans, accounts, roster, mainTag: links.find(link => link.server_main)?.tag ?? links.find(link => link.is_main)?.tag ?? null }
})

export const setServerMainAccount = (serverId: string, userId: string, rawTag: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const tag = `#${rawTag.trim().toUpperCase().replace(/^#/u, "").replaceAll("O", "0")}`
  return yield* sql.withTransaction(Effect.gen(function* () {
    // The subject lock serializes two simultaneous main selections. Visibility
    // and ownership are checked under the link locks, never trusted from a menu.
    yield* sql`SELECT pg_advisory_xact_lock(hashtextextended(${`main:${serverId}:${userId}`},0))`
    const links = yield* sql<{ tag: string; hidden: boolean }>`SELECT tag,hidden FROM player_links WHERE user_id=${userId} FOR UPDATE`
    if (!links.some(link => link.tag === tag && !link.hidden)) return yield* new Forbidden({ message: "Choose one of your visible linked accounts" })
    yield* sql`UPDATE player_links_settings SET is_main=false WHERE server_id=${serverId} AND tag=ANY(${links.map(link => link.tag)}::text[])`
    yield* sql`INSERT INTO player_links_settings(tag,server_id,is_main,selected_by_user_id) VALUES(${tag},${serverId},true,${userId}) ON CONFLICT(tag,server_id) DO UPDATE SET is_main=true,selected_by_user_id=EXCLUDED.selected_by_user_id`
    return { tag }
  }))
})

export const finishRefreshJob = (body: Record<string, unknown>) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* requireInput(typeof body.id === "string" && typeof body.token === "string" && uuid.test(body.token) && typeof body.success === "boolean")
  return yield* sql.withTransaction(Effect.gen(function* () {
    const leases = yield* sql<{ revision: string }>`SELECT revision::text FROM role_refresh_leases WHERE job_id=${String(body.id)} AND token=${String(body.token)}::uuid AND expires_at>now() FOR UPDATE`
    if (!leases[0]) return { accepted: false }
    yield* sql`UPDATE role_refresh_jobs SET completed_at=CASE WHEN ${body.success === true} THEN now() ELSE NULL END,
      due_at=CASE WHEN ${body.success === true} THEN due_at ELSE now()+make_interval(secs=>LEAST(300,attempts*30)) END,
      result=${JSON.stringify(object(body.result))}::jsonb,updated_at=now()
      WHERE id=${String(body.id)} AND revision=${leases[0].revision}::bigint`
    yield* sql`DELETE FROM role_refresh_leases WHERE job_id=${String(body.id)} AND token=${String(body.token)}::uuid`
    return { accepted: true }
  }))
})

export const dispatchBotRoleRefresh = (request: Request, bindings: WorkerBindings) => Effect.gen(function* () {
  const url = new URL(request.url)
  if (!url.pathname.startsWith("/v2/bot/role-refresh")) return undefined
  const auth = yield* AuthIdentity
  yield* auth.requireBot(request)
  if (request.method === "GET" && url.pathname === "/v2/bot/role-refresh/capabilities") {
    return Response.json({ roleTreatment: true })
  }
  if (request.method === "POST" && url.pathname === "/v2/bot/role-refresh/claim") {
    const body = object(yield* readBoundedJson(request, 4096))
    yield* requireInput((body.requestId === undefined || snowflake(body.requestId)) && (body.serverId === undefined || snowflake(body.serverId)) && (body.includeTenure === undefined || typeof body.includeTenure === "boolean") && (body.includeRoster === undefined || typeof body.includeRoster === "boolean") && (body.includeRoleTreatment === undefined || typeof body.includeRoleTreatment === "boolean"))
    return Response.json(yield* claimRefreshJobs(body.requestId as string | undefined, body.serverId as string | undefined, body.includeTenure === true, body.includeRoster === true, body.includeRoleTreatment === true))
  }
  if (request.method === "POST" && url.pathname === "/v2/bot/role-refresh/validate") {
    const body = object(yield* readBoundedJson(request, 8192))
    yield* requireInput(typeof body.id === "string" && typeof body.token === "string" && uuid.test(body.token)
      && Array.isArray(body.accountTags) && body.accountTags.every(tag => typeof tag === "string"))
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ valid: boolean }>`SELECT true AS valid FROM role_refresh_jobs job
      JOIN role_refresh_leases lease ON lease.job_id=job.id AND lease.revision=job.revision
      JOIN servers server ON server.id=job.server_id
      WHERE job.id=${String(body.id)} AND lease.token=${String(body.token)}::uuid AND lease.expires_at>now()
        AND (job.request_id IS NOT NULL OR server.autoeval_enabled OR job.categories <@ ARRAY['tenure','roster']::text[])
        AND ARRAY(SELECT tag FROM player_links WHERE user_id=job.user_id AND hidden=false ORDER BY tag)
          = ARRAY(SELECT unnest(${body.accountTags as string[]}::text[]) ORDER BY 1)`
    if (rows.length > 0 && typeof body.rosterFingerprint === "string") {
      const job = (yield* sql<{server_id:string;user_id:string}>`SELECT server_id,user_id FROM role_refresh_jobs WHERE id=${String(body.id)}`)[0]
      if (!job || (yield* rosterRoleState(sql,job.server_id,job.user_id)).fingerprint !== body.rosterFingerprint) return Response.json({valid:false})
    }
    return Response.json({ valid: rows.length > 0 })
  }
  if (request.method === "POST" && url.pathname === "/v2/bot/role-refresh/complete") return Response.json(yield* finishRefreshJob(object(yield* readBoundedJson(request, 16_384))))
  const match = /^\/v2\/bot\/role-refresh\/([0-9]{15,20})\/(enqueue|data|main|status)$/u.exec(url.pathname)
  if (!match) return yield* new NotFound({ message: "Refresh route not found" })
  const serverId = match[1]!, action = match[2]!
  if (request.method === "POST") {
    const body = object(yield* readBoundedJson(request, 4096))
    if (action === "enqueue") return Response.json(yield* enqueueManualRefresh(bindings, serverId, body))
    if (action === "main") {
      yield* requireInput(snowflake(body.actorId) && typeof body.tag === "string")
      yield* refreshActorAllowed(bindings, serverId, String(body.actorId), false)
      return Response.json(yield* setServerMainAccount(serverId, String(body.actorId), String(body.tag)))
    }
  }
  if (request.method === "GET" && action === "data") {
    const user = url.searchParams.get("userId") ?? ""
    yield* requireInput(snowflake(user))
    return Response.json(yield* loadRefreshData(bindings, serverId, user))
  }
  if (request.method === "GET" && action === "status") {
    const actor = url.searchParams.get("actorId") ?? "", requestId = url.searchParams.get("requestId") ?? ""
    yield* requireInput(snowflake(actor) && snowflake(requestId))
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ user_id: string; completed_at: string | null; attempts: number; result: unknown }>`SELECT user_id,completed_at::text,attempts,result FROM role_refresh_jobs WHERE server_id=${serverId} AND request_id=${requestId} AND actor_id=${actor} ORDER BY user_id LIMIT 3000`
    return Response.json({ total: rows.length, completed: rows.filter(row => row.completed_at !== null).length,
      failed: rows.filter(row => row.completed_at === null && row.attempts >= 12).length, results: rows.filter(row => row.result !== null).slice(0, 10) })
  }
  return yield* new InvalidRequest({ message: "Invalid refresh method" })
}).pipe(Effect.mapError(cause => cause instanceof Forbidden || cause instanceof InvalidRequest || cause instanceof NotFound || cause instanceof UpstreamUnavailable
  ? cause : new DatabaseFailure({ cause, message: "Role refresh operation failed" })))
