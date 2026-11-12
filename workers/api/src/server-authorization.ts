import { DecimalSnowflake } from "@clashking/api-contracts"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"

import { AuthIdentity, type ApiPrincipal, type UserPrincipal } from "./auth.js"
import { DiscordApi } from "./discord-api.js"
import { DiscordCredentials } from "./discord-credentials.js"
import { WorkerEnvironment } from "./environment.js"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"

const Guilds = Schema.Array(Schema.Struct({
  id: DecimalSnowflake,
  owner: Schema.Boolean,
  permissions: Schema.String,
}))
export const gatewayHeartbeatFreshnessSeconds = 45

interface GatewayAccessRow {
  readonly guild_id: string
  readonly guild_data: unknown
  readonly members_complete: boolean
  readonly member_roles: ReadonlyArray<string>
  readonly role_permissions: ReadonlyArray<string>
}

const CachedGuild = Schema.Struct({ owner_id: Schema.optionalKey(Schema.NullOr(DecimalSnowflake)) })

/** Loads only current, healthy metadata for one application generation. Missing
 * rows are retryable because an unavailable or incomplete Gateway cache cannot
 * safely prove either access or absence. */
const loadGatewayAccess = (
  applicationId: string,
  userId: string,
  guildIds: ReadonlyArray<string>,
) => Effect.gen(function* () {
  const ids = [...new Set(guildIds)]
  if (ids.length === 0) return new Map<string, GatewayAccessRow & { readonly owner: boolean }>()
  if (!/^\d+$/u.test(applicationId)) return yield* new UpstreamUnavailable({ cause: "Missing Discord application scope", message: "Discord authorization cache is temporarily unavailable" })
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<GatewayAccessRow>`
    SELECT guild.id AS guild_id,
      CASE WHEN jsonb_typeof(guild.data) = 'object' THEN jsonb_build_object('owner_id', guild.data->'owner_id')
        ELSE guild.data END AS guild_data, guild.members_complete,
      COALESCE(member_roles.roles, ARRAY[]::text[]) AS member_roles,
      COALESCE(role_permissions.permissions, ARRAY[]::text[]) AS role_permissions
    FROM discord_cache.guilds guild
    JOIN discord_cache.gateway_shards shard
      ON (shard.application_id, shard.shard_id) = (guild.application_id, guild.shard_id)
    LEFT JOIN discord_cache.members member ON member.guild_id = guild.id AND member.user_id = ${userId}
    LEFT JOIN LATERAL (
      SELECT array_agg(value) AS roles
      FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(member.data->'roles') = 'array'
        THEN member.data->'roles' ELSE '[]'::jsonb END) value
    ) member_roles ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(role.data->>'permissions') FILTER (WHERE role.data->>'permissions' ~ '^[0-9]+$') AS permissions
      FROM discord_cache.roles role
      WHERE role.guild_id = guild.id AND role.id = ANY(COALESCE(member_roles.roles, ARRAY[]::text[]))
    ) role_permissions ON true
    WHERE guild.id = ANY(${ids}::text[])
      AND guild.application_id = ${applicationId}
      AND guild.generation = shard.generation
      AND guild.available AND guild.metadata_complete AND shard.healthy
      AND shard.heartbeat_at > clock_timestamp() - ${gatewayHeartbeatFreshnessSeconds} * interval '1 second'
  `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Discord authorization cache could not be read" })))
  if (rows.length !== ids.length) return yield* new UpstreamUnavailable({ cause: "Gateway metadata is not ready", message: "Discord authorization cache is temporarily unavailable" })
  const result = new Map<string, GatewayAccessRow & { readonly owner: boolean }>()
  for (const row of rows) {
    const guild = yield* Schema.decodeUnknownEffect(CachedGuild)(row.guild_data).pipe(
      Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Discord authorization cache is temporarily unavailable" })),
    )
    result.set(row.guild_id, { ...row, owner: guild.owner_id === userId })
  }
  return result
})

const roleIsManager = (permissions: ReadonlyArray<string>): boolean => permissions.some((value) => {
  if (!/^\d+$/u.test(value)) return false
  const bits = BigInt(value)
  return (bits & 8n) !== 0n || (bits & 32n) !== 0n
})

/** Reuse a just-fetched OAuth list. This is internal server code, never caller
 * supplied claims. Only guilds with configured grants need a member lookup. */
export const resolveListedGuildAccess = (
  principal: ApiPrincipal,
  applicationId: string,
  guilds: ReadonlyArray<typeof Guilds.Type[number]>,
) => Effect.gen(function* () {
  const result = new Map<string, ServerAccess>()
  for (const guild of guilds) result.set(guild.id, { principal, manager: discordGuildManager(guild), sections: {} })
  if (principal.kind !== "user") return result
  const candidates = guilds.filter((guild) => !result.get(guild.id)!.manager).map((guild) => guild.id)
  if (candidates.length === 0) return result
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ server_id: string; role_id: string; section: string; access_level: "manage" | "view" }>`
    SELECT grant_row.server_id, grant_row.role_id, grant_row.section, grant_row.access_level
    FROM dashboard_role_grants grant_row
    WHERE grant_row.server_id = ANY(${candidates}::text[])
      AND EXISTS(SELECT 1 FROM auth_users WHERE user_id = ${principal.userId} AND provider = 'discord')
  `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Dashboard role grants are unavailable" })))
  // Fresh OAuth already proves manager permissions. Only delegated grants need
  // Gateway roles; an unrelated stale shard must not block the manager list.
  // Actual server operations still perform their independent cache checks.
  const delegatedIds = [...new Set(rows.map((row) => row.server_id))]
  const cache = yield* loadGatewayAccess(applicationId, principal.userId, delegatedIds)
  for (const serverId of delegatedIds) {
    if (!cache.get(serverId)!.members_complete) {
      return yield* new UpstreamUnavailable({ cause: "Gateway members are not ready", message: "Discord authorization cache is temporarily unavailable" })
    }
    const memberRoles = cache.get(serverId)!.member_roles
    const sections: Record<string, "manage" | "view"> = {}
    for (const grant of rows) if (grant.server_id === serverId && memberRoles.includes(grant.role_id)) {
      if (sections[grant.section] !== "manage") sections[grant.section] = grant.access_level
    }
    result.set(serverId, { principal, manager: false, sections, discordRoles: memberRoles })
  }
  return result
})

export interface ServerAccess {
  readonly manager: boolean
  readonly principal: ApiPrincipal
  readonly sections: Readonly<Record<string, "manage" | "view">>
  /** Internal successful Discord observation; never accepted from callers. */
  readonly discordRoles?: ReadonlyArray<string>
}

export interface ServerAccessRequirement {
  readonly freshOauthManager?: boolean
  readonly managerOnly?: boolean
  readonly section?: string
  readonly write?: boolean
}

export const serverAccessAllows = (
  access: Pick<ServerAccess, "manager" | "sections">,
  requirement: ServerAccessRequirement,
): boolean => {
  if (access.manager) return true
  if (requirement.managerOnly === true) return false
  if (requirement.section === undefined || requirement.section.length === 0) {
    return Object.keys(access.sections).length > 0
  }
  const level = access.sections[requirement.section]
  return level === "manage" || requirement.write !== true && level === "view"
}

export const discordGuildManager = (guild: { readonly owner: boolean; readonly permissions: string }): boolean => {
  if (guild.owner) return true
  if (!/^\d+$/u.test(guild.permissions)) return false
  const permissions = BigInt(guild.permissions)
  return (permissions & 8n) !== 0n || (permissions & 32n) !== 0n
}

export class ServerAuthorization extends Context.Service<
  ServerAuthorization,
  {
    readonly requireBotActor: (request:Request,serverId:string,actorId:string,requirement:ServerAccessRequirement)=>Effect.Effect<ServerAccess,ApiFailure,SqlClient.SqlClient>
    readonly resolve: (request: Request, serverId: string) => Effect.Effect<ServerAccess, ApiFailure, SqlClient.SqlClient>
    readonly require: (
      request: Request,
      serverId: string,
      requirement: ServerAccessRequirement,
    ) => Effect.Effect<ServerAccess, ApiFailure, SqlClient.SqlClient>
  }
>()("clashking/ServerAuthorization") {
  static readonly layer = Layer.effect(
    ServerAuthorization,
    Effect.gen(function* () {
      const auth = yield* AuthIdentity
      const discord = yield* DiscordApi
      const credentials = yield* DiscordCredentials
      const bindings = Option.getOrUndefined(yield* Effect.serviceOption(WorkerEnvironment))

      const resolveUnscoped = Effect.fn("ServerAuthorization.resolve")(function* (request: Request, serverId: string, freshOauthManager = false, actor?:UserPrincipal) {
        yield* Schema.decodeUnknownEffect(DecimalSnowflake)(serverId).pipe(
          Effect.mapError(() => new InvalidRequest({ message: "server_id must be a decimal-string Discord snowflake" })),
        )
        const principal = actor ?? (yield* auth.requireUserOrBot(request))
        if (principal.kind === "bot") return { principal, manager: true, sections: {} }
        const applicationId = bindings?.DISCORD_CLIENT_ID?.trim() ?? ""
        const cached = yield* loadGatewayAccess(applicationId, principal.userId, [serverId])
        const gateway = cached.get(serverId)!
        if (freshOauthManager) {
          const accessToken = yield* credentials.accessToken(principal.userId, principal.deviceId)
          const guilds = yield* discord.request("/users/@me/guilds?limit=200&with_counts=true", { oauthAccessToken: accessToken }).pipe(
            Effect.flatMap((value) => Schema.decodeUnknownEffect(Guilds)(value).pipe(
              Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Discord guild authorization response is invalid" })))),
          )
          const guild = guilds.find((candidate) => candidate.id === serverId)
          return { principal, manager: guild !== undefined && discordGuildManager(guild), sections: {} }
        }
        let claims = { manager: gateway.owner || roleIsManager(gateway.role_permissions), roles: gateway.member_roles }
        if (!gateway.owner && !gateway.members_complete) {
          // A large guild may have no complete member snapshot. Verify this
          // actor directly instead of denying every non-owner or trusting a
          // potentially stale cached membership. Discord still owns the proof.
          const [member, roles] = yield* Effect.all([
            discord.request(`/guilds/${serverId}/members/${principal.userId}`).pipe(
              Effect.flatMap(value => Schema.decodeUnknownEffect(Schema.Struct({ roles: Schema.Array(DecimalSnowflake) }))(value))),
            discord.request(`/guilds/${serverId}/roles`).pipe(
              Effect.flatMap(value => Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({id: DecimalSnowflake, permissions: Schema.String})))(value))),
          ], {concurrency: 2}).pipe(Effect.mapError(cause => cause instanceof NotFound
            ? new Forbidden({message: "You are not a member of this server"})
            : cause instanceof Forbidden ? cause : new UpstreamUnavailable({cause,message:"Discord authorization could not be verified"})))
          const memberRoles = new Set([serverId, ...member.roles])
          claims = {manager:roleIsManager(roles.filter(role => memberRoles.has(role.id)).map(role => role.permissions)), roles: member.roles}
        }
        if (claims.manager || claims.roles.length === 0) return { principal, manager: claims.manager, sections: {} }
        const sql = yield* SqlClient.SqlClient
        const grants = yield* sql.unsafe<{ section: string; access_level: "manage" | "view" }>(`
          SELECT section, CASE WHEN bool_or(access_level = 'manage') THEN 'manage' ELSE 'view' END AS access_level
          FROM dashboard_role_grants WHERE server_id = $1 AND role_id = ANY($2::text[]) GROUP BY section
        `, [serverId, [...claims.roles]]).pipe(
          Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Dashboard role grants are unavailable" })),
        )
        return { principal, manager: false, sections: Object.fromEntries(grants.map((grant) => [grant.section, grant.access_level])) }
      })

      const resolve = Effect.fn("ServerAuthorization.scopedResolve")(function* (request: Request,serverId:string,freshOauthManager=false) {
        const access=yield* resolveUnscoped(request,serverId,freshOauthManager)
        const scope=access.principal.kind==="user"?access.principal.dashboardScope:undefined
        if(!scope)return access
        if(scope.serverId!==serverId)return yield* new Forbidden({message:"Dashboard session is limited to another server"})
        if(scope.permissions.manager)return access
        const sections:Record<string,"view"|"manage">={}
        for(const [section,ceiling]of Object.entries(scope.permissions.sections)){
          const current=access.manager?"manage":(access.sections as Readonly<Record<string,"view"|"manage">>)[section]
          if(current)sections[section]=current==="manage"&&ceiling==="manage"?"manage":"view"
        }
        return {...access,manager:false,sections}
      })

      const require = Effect.fn("ServerAuthorization.require")(function* (
        request: Request,
        serverId: string,
        requirement: ServerAccessRequirement,
      ) {
        const access = yield* resolve(request, serverId, requirement.freshOauthManager === true)
        if (!serverAccessAllows(access, requirement)) {
          return yield* new Forbidden({ message: "You do not have access to this dashboard section" })
        }
        return access
      })

      const requireBotActor = Effect.fn("ServerAuthorization.requireBotActor")(function*(request:Request,serverId:string,actorId:string,requirement:ServerAccessRequirement){
        // Only the authenticated interaction service can assert a Discord actor.
        // Resolve that actor through the SAME current Gateway/role-grant rules
        // as Dashboard; the bot credential itself never grants actor access.
        yield* auth.requireBot(request)
        yield* Schema.decodeUnknownEffect(DecimalSnowflake)(actorId).pipe(Effect.mapError(()=>new InvalidRequest({message:"Invalid Discord actor"})))
        const access=yield* resolveUnscoped(request,serverId,false,{kind:"user",userId:actorId})
        if(!serverAccessAllows(access,requirement))return yield* new Forbidden({message:requirement.section==="links"?"You need Dashboard Links manage permission":`You need Dashboard ${requirement.section === "panels" ? "Panels" : requirement.section} manage permission`,reason:"roles"})
        return access
      })
      return { resolve, require, requireBotActor }
    }),
  )
}
