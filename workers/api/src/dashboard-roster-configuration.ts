import { rosterRoleInputs, queueRosterRoleRefresh } from "./roster-role-refresh.js"
import { DashboardCreateRosterMemberGroupEndpoint, DashboardRosterMemberGroupsEndpoint,
  DashboardUpdateRosterMemberGroupEndpoint, DashboardDeleteRosterMemberGroupEndpoint,
  DashboardAssignRosterMemberGroupEndpoint, DashboardSetRosterRoleEndpoint, DashboardRefreshRosterRolesEndpoint } from "@clashking/api-contracts"
import { DecimalSnowflake, requireEndpointSuccessStatus } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { Conflict, DatabaseFailure, InvalidRequest, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { DiscordApi } from "./discord-api.js"
import { ServerAuthorization } from "./server-authorization.js"
import { readBoundedJson } from "./request-body.js"
import { lockRosterMembership } from "./dashboard-roster-membership.js"

const endpoints = [DashboardCreateRosterMemberGroupEndpoint, DashboardRosterMemberGroupsEndpoint,
  DashboardUpdateRosterMemberGroupEndpoint, DashboardDeleteRosterMemberGroupEndpoint, DashboardAssignRosterMemberGroupEndpoint, DashboardSetRosterRoleEndpoint, DashboardRefreshRosterRolesEndpoint] as const
export const dashboardRosterConfigurationRoutes = [
  {method:"PUT",path:"/v2/server/:serverId/rosters/:rosterId/role"},
  {method:"POST",path:"/v2/server/:serverId/rosters/:rosterId/role-refresh"},
  { method: "PATCH", path: "/v2/server/:serverId/rosters/:rosterId/member-label" },
  { method: "GET", path: "/v2/server/:serverId/roster-member-groups" },
  { method: "POST", path: "/v2/server/:serverId/roster-member-groups" },
  { method: "PATCH", path: "/v2/server/:serverId/roster-member-groups/:memberGroupId" },
  { method: "DELETE", path: "/v2/server/:serverId/roster-member-groups/:memberGroupId" },
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
  else if (endpoint.operationId === DashboardSetRosterRoleEndpoint.operationId || endpoint.operationId === DashboardRefreshRosterRolesEndpoint.operationId) {
    const rosterId=rawParams.rosterId!.toLowerCase()
    const body=endpoint.operationId===DashboardSetRosterRoleEndpoint.operationId ? yield* readBody(request,DashboardSetRosterRoleEndpoint.body) : undefined
    if(body?.roleId){
      const roles=yield* (yield* DiscordApi).request(`/guilds/${serverId}/roles`).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({id:DecimalSnowflake,managed:Schema.Boolean})))),Effect.catchTag("SchemaError",cause=>Effect.fail(new UpstreamUnavailable({cause,message:"Discord roles are invalid"}))))
      if(body.roleId===serverId||!roles.some(role=>role.id===body.roleId&&!role.managed))return yield* new InvalidRequest({message:"Choose an existing, unmanaged role other than everyone"})
    }
    result=yield* sql.withTransaction(Effect.gen(function*(){
      yield* lockServer(sql,serverId)
      yield* lockRosterMembership(sql,serverId,[rosterId])
      const before=yield* rosterRoleInputs(sql,serverId)
      if(body){
        if(body.memberGroupId && !(yield* listGroups(sql,serverId)).some(group=>group.id===body.memberGroupId))return yield* new InvalidRequest({message:"The label does not belong to this server"})
        const current = body.memberGroupId
          ? (yield* sql<{role_id:string|null}>`SELECT role_id FROM roster_member_group_settings WHERE roster_id=${rosterId}::uuid AND member_group_id=${body.memberGroupId}::uuid`)[0]?.role_id ?? null
          : (yield* sql<{role_id:string|null}>`SELECT roster_role_id AS role_id FROM rosters WHERE id=${rosterId}::uuid`)[0]!.role_id
        if(current===body.roleId)return {queued:0}
        if(body.memberGroupId){
          yield* sql`INSERT INTO roster_member_group_settings(roster_id,member_group_id,server_id,role_id)
            VALUES(${rosterId}::uuid,${body.memberGroupId}::uuid,${serverId},${body.roleId})
            ON CONFLICT(roster_id,member_group_id) DO UPDATE SET role_id=EXCLUDED.role_id`
        }else yield* sql`UPDATE rosters SET roster_role_id=${body.roleId} WHERE id=${rosterId}::uuid`
        yield* sql`UPDATE rosters SET revision=revision+1,updated_at=now() WHERE id=${rosterId}::uuid`
      }
      return {queued:yield* queueRosterRoleRefresh(sql,serverId,before)}
    }))
  }
  else if (endpoint.operationId === DashboardAssignRosterMemberGroupEndpoint.operationId) {
    const body = yield* readBody(request, DashboardAssignRosterMemberGroupEndpoint.body)
    const rosterId = rawParams.rosterId!.toLowerCase()
    const tags = [...new Set(body.playerTags)]
    const groupId = body.memberGroupId?.toLowerCase() ?? null
    result = yield* sql.withTransaction(Effect.gen(function* () {
      // Use the same server-then-roster lock order as configuration changes.
      // This prevents deleting a label between validation and assignment.
      yield* lockServer(sql, serverId)
      const oldRoleInputs = yield* rosterRoleInputs(sql,serverId)
      yield* lockRosterMembership(sql, serverId, [rosterId])
      const members = yield* sql`SELECT tag FROM roster_members WHERE roster_id = ${rosterId}::uuid AND tag = ANY(${tags}::text[])`
      if (members.length !== tags.length) return yield* new InvalidRequest({ message: "Every player must already belong to this roster" })
      if (groupId !== null) {
        const groups = yield* listGroups(sql, serverId)
        if (!groups.some(group => group.id === groupId)) return yield* new InvalidRequest({ message: "The label does not belong to this server" })
        // Manager assignment does not enable public signup or assign Discord roles.
        yield* sql`INSERT INTO roster_member_group_settings (roster_id, member_group_id, server_id)
          VALUES (${rosterId}::uuid, ${groupId}::uuid, ${serverId}) ON CONFLICT DO NOTHING`
      }
      yield* sql`UPDATE roster_members SET member_group_id = ${groupId}::uuid WHERE roster_id = ${rosterId}::uuid AND tag = ANY(${tags}::text[])`
      yield* sql`UPDATE rosters SET revision = revision + 1, updated_at = now() WHERE id = ${rosterId}::uuid`
      yield* sql`UPDATE roster_discord_publications SET needs_sync = true WHERE roster_id = ${rosterId}::uuid`
      yield* queueRosterRoleRefresh(sql,serverId,oldRoleInputs)
      return { updated: tags.length }
    }))
  }
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
  } else {
    const id = rawParams.memberGroupId!.toLowerCase()
    const body = request.method === "PATCH" ? yield* readBody(request, DashboardUpdateRosterMemberGroupEndpoint.body) : undefined
    result = yield* sql.withTransaction(Effect.gen(function* () {
      yield* lockServer(sql, serverId)
      const oldRoleInputs = yield* rosterRoleInputs(sql,serverId)
      const groups = yield* listGroups(sql, serverId)
      const current = groups.find((group) => group.id === id)
      if (current === undefined) return yield* new NotFound({ message: "Roster account group not found" })
      const attached = yield* sql<{ roster_id: string }>`SELECT roster_id::text FROM roster_member_group_settings
        WHERE server_id = ${serverId} AND member_group_id = ${id}::uuid ORDER BY roster_id`
      yield* lockRosterMembership(sql, serverId, attached.map((row) => row.roster_id))
      if (body === undefined) {
        const used = yield* sql`SELECT 1 FROM roster_members WHERE member_group_id = ${id}::uuid LIMIT 1`
        if (used.length > 0) return yield* new Conflict({ message: "Move this label's players to Main or another label before deleting it" })
        yield* sql`DELETE FROM roster_member_groups WHERE server_id = ${serverId} AND id = ${id}::uuid`
        yield* queueRosterRoleRefresh(sql,serverId,oldRoleInputs)
        return undefined
      }
      const name = body.name?.trim() ?? current.name
      if (groups.some((group) => group.id !== id && group.name === name)) return yield* new Conflict({ message: "Roster account group name already exists" })
      const rows = yield* sql<GroupRow>`UPDATE roster_member_groups SET name = ${name}, position = ${body.position ?? current.position}
        WHERE server_id = ${serverId} AND id = ${id}::uuid RETURNING id::text, name, position`
      yield* sql`UPDATE rosters SET revision = revision + 1, updated_at = now()
        WHERE id = ANY(${attached.map((row) => row.roster_id)}::uuid[])`
      yield* sql`UPDATE roster_discord_publications SET needs_sync = true WHERE roster_id = ANY(${attached.map((row) => row.roster_id)}::uuid[])`
      return { group: rows[0]! }
    }))
  }
  if (endpoint.responseMode === "none") return new Response(null, { status: requireEndpointSuccessStatus(endpoint), headers: { "cache-control": "no-store" } })
  const encoded = yield* Schema.encodeUnknownEffect(endpoint.response)(result).pipe(Effect.mapError(databaseFailure))
  return Response.json(encoded, { status: requireEndpointSuccessStatus(endpoint), headers: { "cache-control": "no-store" } })
}).pipe(Effect.catchTag("SqlError", (cause) => Effect.fail(databaseFailure(cause))))
