import { DecimalSnowflake } from "@clashking/api-contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity, type ApiPrincipal } from "./auth.js"
import { DiscordApi } from "./discord-api.js"
import { DiscordCredentials } from "./discord-credentials.js"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"

const Guilds = Schema.Array(Schema.Struct({
  id: DecimalSnowflake,
  owner: Schema.Boolean,
  permissions: Schema.String,
}))
const Member = Schema.Struct({ roles: Schema.Array(DecimalSnowflake) })

export interface ServerAccess {
  readonly manager: boolean
  readonly principal: ApiPrincipal
  readonly sections: Readonly<Record<string, "manage" | "view">>
}

export interface ServerAccessRequirement {
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

      const resolve = Effect.fn("ServerAuthorization.resolve")(function* (request: Request, serverId: string) {
        yield* Schema.decodeUnknownEffect(DecimalSnowflake)(serverId).pipe(
          Effect.mapError(() => new InvalidRequest({ message: "server_id must be a decimal-string Discord snowflake" })),
        )
        const principal = yield* auth.requireUserOrBot(request)
        if (principal.kind === "bot") return { principal, manager: true, sections: {} }
        const accessToken = yield* credentials.accessToken(principal.userId, principal.deviceId)
        const guilds = yield* discord.request("/users/@me/guilds?limit=200", { oauthAccessToken: accessToken }).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Guilds)),
          Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Discord guild authorization failed" })),
        )
        const guild = guilds.find((candidate) => candidate.id === serverId)
        if (guild !== undefined && discordGuildManager(guild)) return { principal, manager: true, sections: {} }

        const sql = yield* SqlClient.SqlClient
        const users = yield* sql<{ user_id: string }>`
          SELECT user_id FROM auth_users WHERE user_id = ${principal.userId} AND provider = 'discord'
        `.pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Discord identity lookup failed" })))
        const discordUserId = users[0]?.user_id
        if (discordUserId === undefined) return { principal, manager: false, sections: {} }
        const member = yield* discord.request(`/guilds/${serverId}/members/${discordUserId}`).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Member)),
          Effect.catch((cause) => cause instanceof NotFound || cause instanceof Forbidden
            ? Effect.succeed({ roles: [] as ReadonlyArray<string> })
            : Effect.fail(new UpstreamUnavailable({ cause, message: "Discord member authorization failed" }))),
        )
        if (member.roles.length === 0) return { principal, manager: false, sections: {} }
        const grants = yield* sql.unsafe<{ section: string; access_level: "manage" | "view" }>(`
          SELECT section, CASE WHEN bool_or(access_level = 'manage') THEN 'manage' ELSE 'view' END AS access_level
          FROM dashboard_role_grants WHERE server_id = $1 AND role_id = ANY($2::text[]) GROUP BY section
        `, [serverId, [...member.roles]]).pipe(
          Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Dashboard role grants are unavailable" })),
        )
        return { principal, manager: false, sections: Object.fromEntries(grants.map((grant) => [grant.section, grant.access_level])) }
      })

      const require = Effect.fn("ServerAuthorization.require")(function* (
        request: Request,
        serverId: string,
        requirement: ServerAccessRequirement,
      ) {
        const access = yield* resolve(request, serverId)
        if (!serverAccessAllows(access, requirement)) {
          return yield* new Forbidden({ message: "You do not have access to this dashboard section" })
        }
        return access
      })

      return { resolve, require }
    }),
  )
}
