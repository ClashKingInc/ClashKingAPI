import { DashboardCreateRosterMemberGroupEndpoint, DashboardRosterMemberGroupsEndpoint,
  DashboardUpdateRosterMemberGroupEndpoint, DashboardDeleteRosterMemberGroupEndpoint,
  DashboardReplaceRosterMemberGroupsEndpoint, DecimalSnowflake } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Conflict, DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { ServerAuthorization } from "./server-authorization.js"
import { DiscordApi } from "./discord-api.js"
import { readBoundedJson } from "./request-body.js"
import { lockRosterMembership } from "./roster-interaction-membership.js"

const endpoints = [DashboardCreateRosterMemberGroupEndpoint, DashboardRosterMemberGroupsEndpoint,
  DashboardUpdateRosterMemberGroupEndpoint, DashboardDeleteRosterMemberGroupEndpoint, DashboardReplaceRosterMemberGroupsEndpoint] as const
export const dashboardRosterConfigurationRoutes = [
  { method: "GET", path: "/v2/server/:serverId/roster-member-groups" },
  { method: "POST", path: "/v2/server/:serverId/roster-member-groups" },
  { method: "PATCH", path: "/v2/server/:serverId/roster-member-groups/:memberGroupId" },
  { method: "DELETE", path: "/v2/server/:serverId/roster-member-groups/:memberGroupId" },
  { method: "PUT", path: "/v2/server/:serverId/rosters/:rosterId/member-groups" },
] as const
interface GroupRow { readonly id: string; readonly name: string; readonly position: number }
const databaseFailure = (cause: unknown) => new DatabaseFailure({ cause, message: "Roster configuration operation failed" })
const invalidInput = () => new InvalidRequest({ message: "Roster configuration failed schema validation" })
const readBody = <S extends Schema.Top>(request: Request, schema: S) => Effect.gen(function* () {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
  }
  return yield* readBoundedJson(request).pipe(Effect.flatMap(Schema.decodeUnknownEffect(schema)), Effect.catchTag("SchemaError", () => Effect.fail(invalidInput())))
})
const lockServer = (sql: SqlClient.SqlClient, serverId: string) => Effect.gen(function* () {
  const rows = yield* sql`SELECT id FROM servers WHERE id = ${serverId} FOR UPDATE`
  if (rows.length !== 1) return yield* new NotFound({ message: "Server not found" })
})
const listGroups = (sql: SqlClient.SqlClient, serverId: string) => sql<GroupRow>`SELECT id::text, name, position
  FROM roster_member_groups WHERE server_id = ${serverId} ORDER BY position, id`

export const validateRosterRoleReferences = (serverId: string, roleIds: ReadonlyArray<string>) => Effect.gen(function* () {
  if (roleIds.length === 0) return
  const discord = yield* DiscordApi
  const roles = yield* discord.request(`/guilds/${serverId}/roles`).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ id: DecimalSnowflake, managed: Schema.Boolean })))),
    Effect.catchTag("SchemaError", (cause) => Effect.fail(new UpstreamUnavailable({ cause, message: "Discord role data failed validation" }))),
  )
  const assignable = new Set(roles.filter((role) => !role.managed && role.id !== serverId).map((role) => role.id))
  if (roleIds.some((id) => !assignable.has(id))) return yield* new InvalidRequest({ message: "A roster role is missing, managed, or @everyone" })
})

export const dispatchDashboardRosterConfiguration = (request: Request): Effect.Effect<
  Response | undefined, ApiFailure, SqlClient.SqlClient | ServerAuthorization | DiscordApi
> => Effect.gen(function* () {
  const parts = new URL(request.url).pathname.split("/")
  const endpoint = endpoints.find((candidate) => candidate.method === request.method
    && candidate.path.split("/").length === parts.length
    && candidate.path.split("/").every((part, index) => part.startsWith(":") || part === parts[index]))
  if (endpoint === undefined) return undefined
  const rawParams = yield* Effect.try({ try: () => Object.fromEntries(endpoint.path.split("/").flatMap((part, index) =>
    part.startsWith(":") ? [[part.slice(1), decodeURIComponent(parts[index]!)]] : [])), catch: invalidInput })
  const { serverId } = yield* Schema.decodeUnknownEffect(endpoint.pathParams)(rawParams).pipe(Effect.mapError(invalidInput))
  yield* (yield* ServerAuthorization).require(request, serverId, { section: "rosters", write: request.method !== "GET" })
  const sql = yield* SqlClient.SqlClient
  let result: unknown
  if (endpoint.operationId === DashboardRosterMemberGroupsEndpoint.operationId) result = { items: yield* listGroups(sql, serverId) }
  else if (request.method === "POST") {
    const body = yield* readBody(request, DashboardCreateRosterMemberGroupEndpoint.body)
    result = yield* sql.withTransaction(Effect.gen(function* () {
      yield* lockServer(sql, serverId)
      const groups = yield* listGroups(sql, serverId)
      if (groups.length >= 25) return yield* new Conflict({ message: "A server may have at most 25 roster account groups" })
      const name = body.name.trim()
      if (groups.some((group) => group.name === name)) return yield* new Conflict({ message: "Roster account group name already exists" })
      const rows = yield* sql<GroupRow>`INSERT INTO roster_member_groups (server_id, name, position)
        VALUES (${serverId}, ${name}, ${body.position ?? groups.length}) RETURNING id::text, name, position`
      return { group: rows[0]! }
    }))
  } else if (request.method === "PUT") {
    const rosterId = rawParams.rosterId!.toLowerCase()
    const body = yield* readBody(request, DashboardReplaceRosterMemberGroupsEndpoint.body)
    const groups = body.groups.map((group) => ({ ...group, member_group_id: group.member_group_id.toLowerCase() }))
    const ids = groups.map((group) => group.member_group_id)
    if (new Set(ids).size !== ids.length) return yield* invalidInput()
    yield* validateRosterRoleReferences(serverId, groups.flatMap((group) => group.role_id === null ? [] : [group.role_id]))
    result = yield* sql.withTransaction(Effect.gen(function* () {
      yield* lockServer(sql, serverId)
      yield* lockRosterMembership(sql, serverId, [rosterId])
      const available = new Set((yield* listGroups(sql, serverId)).map((group) => group.id))
      if (ids.some((id) => !available.has(id))) return yield* new InvalidRequest({ message: "An account group does not belong to this server" })
      // Omitted settings still referenced by a member are retained but no
      // longer offered for signup. Never silently reassign those members.
      yield* sql`UPDATE roster_member_group_settings SET signup_enabled = false
        WHERE roster_id = ${rosterId}::uuid AND NOT (member_group_id = ANY(${ids}::uuid[]))`
      yield* sql`DELETE FROM roster_member_group_settings setting WHERE roster_id = ${rosterId}::uuid
        AND NOT (member_group_id = ANY(${ids}::uuid[])) AND NOT EXISTS
        (SELECT 1 FROM roster_members member WHERE member.roster_id = setting.roster_id AND member.member_group_id = setting.member_group_id)`
      for (const group of groups) {
        yield* sql`INSERT INTO roster_member_group_settings (roster_id, member_group_id, server_id, signup_enabled, position, role_id)
          VALUES (${rosterId}::uuid, ${group.member_group_id}::uuid, ${serverId}, ${group.signup_enabled}, ${group.position}, ${group.role_id})
          ON CONFLICT (roster_id, member_group_id) DO UPDATE SET signup_enabled = EXCLUDED.signup_enabled,
            position = EXCLUDED.position, role_id = EXCLUDED.role_id`
      }
      const settings = yield* sql<{ id: string; name: string; position: number; signup_enabled: boolean; role_id: string | null }>`
        SELECT setting.member_group_id::text AS id, account_group.name, setting.position, setting.signup_enabled, setting.role_id
        FROM roster_member_group_settings setting JOIN roster_member_groups account_group ON account_group.id = setting.member_group_id
        WHERE setting.roster_id = ${rosterId}::uuid ORDER BY setting.position, setting.member_group_id`
      if (settings.length > 25) return yield* new Conflict({ message: "Existing roster account group configuration exceeds the supported limit", reason: "invalid_configuration" })
      const encoded = yield* Schema.encodeUnknownEffect(DashboardReplaceRosterMemberGroupsEndpoint.response)({ groups: settings }).pipe(Effect.mapError(databaseFailure))
      yield* sql`UPDATE rosters SET revision = revision + 1, updated_at = now() WHERE id = ${rosterId}::uuid`
      return encoded
    }))
  } else {
    const id = rawParams.memberGroupId!.toLowerCase()
    const body = request.method === "PATCH" ? yield* readBody(request, DashboardUpdateRosterMemberGroupEndpoint.body) : undefined
    result = yield* sql.withTransaction(Effect.gen(function* () {
      yield* lockServer(sql, serverId)
      const groups = yield* listGroups(sql, serverId)
      const current = groups.find((group) => group.id === id)
      if (current === undefined) return yield* new NotFound({ message: "Roster account group not found" })
      const attached = yield* sql<{ roster_id: string }>`SELECT roster_id::text FROM roster_member_group_settings
        WHERE server_id = ${serverId} AND member_group_id = ${id}::uuid ORDER BY roster_id`
      yield* lockRosterMembership(sql, serverId, attached.map((row) => row.roster_id))
      if (body === undefined) {
        if (attached.length > 0) return yield* new Conflict({ message: "Disable or unassign this account group before deleting it" })
        yield* sql`DELETE FROM roster_member_groups WHERE server_id = ${serverId} AND id = ${id}::uuid`
        return undefined
      }
      const name = body.name?.trim() ?? current.name
      if (groups.some((group) => group.id !== id && group.name === name)) return yield* new Conflict({ message: "Roster account group name already exists" })
      const rows = yield* sql<GroupRow>`UPDATE roster_member_groups SET name = ${name}, position = ${body.position ?? current.position}
        WHERE server_id = ${serverId} AND id = ${id}::uuid RETURNING id::text, name, position`
      yield* sql`UPDATE rosters SET revision = revision + 1, updated_at = now()
        WHERE id = ANY(${attached.map((row) => row.roster_id)}::uuid[])`
      return { group: rows[0]! }
    }))
  }
  if (endpoint.responseMode === "none") return new Response(null, { status: endpoint.successStatus, headers: { "cache-control": "no-store" } })
  const encoded = yield* Schema.encodeUnknownEffect(endpoint.response)(result).pipe(Effect.mapError(databaseFailure))
  return Response.json(encoded, { status: endpoint.successStatus, headers: { "cache-control": "no-store" } })
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(databaseFailure(cause))))
