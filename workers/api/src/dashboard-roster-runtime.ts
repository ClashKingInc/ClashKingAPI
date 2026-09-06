import { Context, Data, Effect, Layer, Schema } from "effect"
import {
  botEndpoints, dashboardEndpoints, DashboardRosterMetricQueryRequest, DashboardRosterViewPreviewRequest, RosterCapacity,
  type DashboardRosterViewSpec, type DashboardRosterViewResultRow, type AnyEndpoint,
} from "@clashking/api-contracts"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity, type ApiPrincipal } from "./auth.js"
import { DiscordApi } from "./discord-api.js"
import { ServerAuthorization } from "./server-authorization.js"
import {
  Conflict,
  DatabaseFailure,
  Forbidden,
  InvalidRequest,
  NotFound,
  PayloadTooLarge,
  UpstreamUnavailable,
  type ApiFailure,
} from "./errors.js"
import { WorkerEnvironment, type WorkerBindings } from "./environment.js"
import { normalizeRosterMetricParameters, presentRosterView, queryDynamicRosterMetric, rosterSnapshotMetricKeys, validateRosterViewSpec } from "./dashboard-roster-metrics.js"
import { readBoundedJson } from "./request-body.js"
import { hydrateRosterMember, loadRosterClashPlayer, rosterPlayerSnapshot } from "./dashboard-roster-refresh.js"
import { assertRosterMembershipLimits, lockRosterAdmissionOwners, lockRosterMembership } from "./dashboard-roster-membership.js"

type RosterAuth = "bot" | "public" | "user-or-bot"

interface RosterRoute {
  readonly auth: RosterAuth
  readonly method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT"
  readonly operation: string
  readonly path: string
}

const routes = [
  { method: "POST", path: "/v2/roster/members/query", operation: "membersQuery", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster/account-groups/query", operation: "accountGroupsQuery", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster/membership-changes/validate", operation: "validateMembershipChanges", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster/membership-changes", operation: "applyMembershipChanges", auth: "user-or-bot" },
  { method: "PUT", path: "/v2/roster/questionnaire", operation: "putQuestionnaire", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster/refresh", operation: "refreshRosters", auth: "user-or-bot" },
  { method: "GET", path: "/v2/roster/missing-members", operation: "missingMembers", auth: "user-or-bot" },
  { method: "GET", path: "/v2/roster/metrics", operation: "listMetrics", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster/metrics/query", operation: "queryMetric", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster/views/preview", operation: "previewView", auth: "user-or-bot" },
  { method: "GET", path: "/v2/roster/views", operation: "listViews", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster/views", operation: "createView", auth: "user-or-bot" },
  { method: "GET", path: "/v2/roster/views/shared/:viewId", operation: "sharedView", auth: "user-or-bot" },
  { method: "GET", path: "/v2/roster/views/:viewId", operation: "getView", auth: "user-or-bot" },
  { method: "PATCH", path: "/v2/roster/views/:viewId", operation: "updateView", auth: "user-or-bot" },
  { method: "DELETE", path: "/v2/roster/views/:viewId", operation: "deleteView", auth: "user-or-bot" },
  { method: "GET", path: "/v2/roster/server/:serverId/members", operation: "serverClanMembers", auth: "user-or-bot" },
  { method: "GET", path: "/v2/roster/:serverId/list", operation: "listRosters", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster/:rosterId/clone", operation: "cloneRoster", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster/:rosterId/members", operation: "manageMembers", auth: "user-or-bot" },
  { method: "PATCH", path: "/v2/roster/:rosterId/members/:memberTag", operation: "updateMember", auth: "user-or-bot" },
  { method: "DELETE", path: "/v2/roster/:rosterId/members/:memberTag", operation: "removeMember", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster/:rosterId/members/:memberTag/refresh", operation: "refreshMember", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster", operation: "createRoster", auth: "user-or-bot" },
  { method: "GET", path: "/v2/roster/:rosterId", operation: "getRoster", auth: "user-or-bot" },
  { method: "PATCH", path: "/v2/roster/:rosterId", operation: "updateRoster", auth: "user-or-bot" },
  { method: "DELETE", path: "/v2/roster/:rosterId", operation: "deleteRoster", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster-group", operation: "createGroup", auth: "user-or-bot" },
  { method: "GET", path: "/v2/roster-group/list", operation: "listGroups", auth: "user-or-bot" },
  { method: "GET", path: "/v2/roster-group/:groupId", operation: "getGroup", auth: "user-or-bot" },
  { method: "PATCH", path: "/v2/roster-group/:groupId", operation: "updateGroup", auth: "user-or-bot" },
  { method: "DELETE", path: "/v2/roster-group/:groupId", operation: "deleteGroup", auth: "user-or-bot" },
  { method: "POST", path: "/v2/roster-automation", operation: "createAutomation", auth: "user-or-bot" },
  { method: "GET", path: "/v2/roster-automation/list", operation: "listAutomations", auth: "user-or-bot" },
  { method: "PATCH", path: "/v2/roster-automation/:automationId", operation: "updateAutomation", auth: "user-or-bot" },
  { method: "DELETE", path: "/v2/roster-automation/:automationId", operation: "deleteAutomation", auth: "user-or-bot" },
  { method: "POST", path: "/v2/server/:serverId/rosters/:rosterId/discord-identity/refresh", operation: "refreshDiscordIdentity", auth: "user-or-bot" },
  { method: "GET", path: "/v2/server/:serverId/rosters/:rosterId/signup-form", operation: "signupForm", auth: "user-or-bot" },
  { method: "POST", path: "/v2/server/:serverId/rosters/:rosterId/submissions", operation: "submitSignup", auth: "user-or-bot" },
  { method: "GET", path: "/v2/server/:serverId/rosters/:rosterId/missing-members", operation: "builderMissingMembers", auth: "user-or-bot" },
  { method: "GET", path: "/v2/server/:serverId/rosters/:rosterId", operation: "getBuilderRoster", auth: "user-or-bot" },
  { method: "GET", path: "/v2/server/:serverId/rosters", operation: "listBuilderRosters", auth: "user-or-bot" },
  { method: "GET", path: "/v2/public/rosters/:publicShareId", operation: "publicRoster", auth: "public" },
] as const satisfies ReadonlyArray<RosterRoute>

export const dashboardRosterRuntimeRoutes = routes.map(({ method, path }) => ({ method, path }))

interface RouteMatch {
  readonly route: (typeof routes)[number]
  readonly params: Readonly<Record<string, string>>
}

export interface DashboardRosterOperationInput {
  readonly bindings: WorkerBindings
  readonly params: Readonly<Record<string, string>>
  readonly principal?: ApiPrincipal
  readonly request: Request
  readonly url: URL
}

const json = (body: unknown, status = 200): Response => Response.json(body, {
  status,
  headers: { "cache-control": "no-store" },
})

const database = <A>(message: string, effect: Effect.Effect<A, unknown, never>) => effect.pipe(
  Effect.mapError((cause) => new DatabaseFailure({ cause, message })),
)

const decodeJson = (request: Pick<Request, "headers" | "body">) => readBoundedJson(request).pipe(
  Effect.flatMap((value) => isRecord(value)
    ? Effect.succeed(value)
    : Effect.fail(new InvalidRequest({ message: "Request body must be a JSON object" }))),
)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined

const stringArray = (value: unknown): ReadonlyArray<string> => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string")
  : []

const boolValue = (value: string | null, fallback = false): boolean => {
  if (value === null) return fallback
  if (value === "true") return true
  if (value === "false") return false
  return fallback
}

const validScheduledAt = (value: unknown): value is string => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  && Number.isFinite(Date.parse(value))

const normalizeTag = (value: string): string => {
  const tag = value.trim().replace(/^#/u, "").toUpperCase()
  return tag.length === 0 ? "" : `#${tag}`
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const discordSnowflakePattern = /^[0-9]{1,20}$/u

const requireString = (value: unknown, field: string): Effect.Effect<string, InvalidRequest> => {
  const parsed = stringValue(value)
  return parsed === undefined
    ? Effect.fail(new InvalidRequest({ message: `${field} is required` }))
    : Effect.succeed(parsed)
}

const requireRosterBatch = (body: Record<string, unknown>) => Effect.gen(function* () {
  const serverId = yield* requireString(body.serverId, "serverId")
  if (!discordSnowflakePattern.test(serverId)) {
    return yield* new InvalidRequest({ message: "serverId must be a decimal Discord ID" })
  }
  const rosterIds = stringArray(body.rosterIds)
  if (rosterIds.length < 1 || rosterIds.length > 25 || rosterIds.some((id) => !uuidPattern.test(id))) {
    return yield* new InvalidRequest({ message: "rosterIds must contain 1 to 25 UUIDs" })
  }
  if (new Set(rosterIds).size !== rosterIds.length) {
    return yield* new InvalidRequest({ message: "rosterIds must be unique" })
  }
  return { serverId, rosterIds }
})

interface RosterRow {
  readonly alias: string
  readonly clan_tag: string | null
  readonly created_at: Date | string
  readonly description: string | null
  readonly display_column_ids: ReadonlyArray<string> | null
  readonly event_start_time: number | string | null
  readonly group_id: string | null
  readonly id: string
  readonly image_url: string | null
  readonly max_accounts_per_user: number | null
  readonly max_townhall: number | null
  readonly message_id: string | null
  readonly public_share_id: string | null
  readonly last_refreshed_at: Date | string | null
  readonly min_signups: number | null
  readonly min_townhall: number | null
  readonly recurrence_day_of_month: number | null
  readonly recurrence_days: number | null
  readonly revision: number | string
  readonly roster_type: "clan" | "family"
  readonly server_id: string
  readonly signup_questions: unknown
  readonly signup_scope: "clan-only" | "family-wide"
  readonly sort_configuration: unknown
  readonly updated_at: Date | string
  readonly webhook_id: string | null
}

interface RosterMemberRow {
  readonly discord_avatar_url: string | null
  readonly discord_user_id: string | null
  readonly discord_username: string | null
  readonly current_clan_name: string | null
  readonly current_clan_tag: string | null
  readonly hero_level_sum: number
  readonly last_online: Date | string | null
  readonly league_id: number | null
  readonly league_name: string | null
  readonly max_percent: number | string | null
  readonly name: string
  readonly refreshed_at: Date | string | null
  readonly signup_answers: unknown
  readonly tag: string
  readonly townhall: number
  readonly trophies: number | null
  readonly war_preference: boolean | null
}

const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : value
const optional = <K extends string>(key: K, value: unknown) => value === null || value === undefined
  ? {}
  : { [key]: value } as Record<K, unknown>

const memberJson = (row: RosterMemberRow) => ({
  tag: row.tag,
  name: row.name,
  townhall: row.townhall,
  hero_level_sum: row.hero_level_sum,
  answers: row.signup_answers ?? {},
  ...optional("trophies", row.trophies),
  ...optional("current_clan", row.current_clan_name),
  ...optional("current_clan_tag", row.current_clan_tag),
  ...optional("league_id", row.league_id),
  ...optional("league_name", row.league_name),
  ...optional("max_percent", row.max_percent === null ? null : Number(row.max_percent)),
  ...optional("war_pref", row.war_preference),
  ...optional("discord", row.discord_user_id),
  ...optional("discord_username", row.discord_username),
  ...optional("discord_avatar_url", row.discord_avatar_url),
  ...optional("last_online", row.last_online === null ? null : iso(row.last_online)),
  ...optional("refreshed_at", row.refreshed_at === null ? null : iso(row.refreshed_at)),
})

const builderMemberJson = (row: RosterMemberRow) => ({
  playerTag: row.tag,
  playerName: row.name,
  clanTag: row.current_clan_tag,
  clanName: row.current_clan_name,
  townhall: row.townhall,
  trophies: row.trophies,
  leagueId: row.league_id,
  leagueName: row.league_name,
  heroLevelSum: row.hero_level_sum,
  maxPercent: row.max_percent === null ? null : Number(row.max_percent),
  warPreference: row.war_preference,
  discordUserId: row.discord_user_id,
  discordUsername: row.discord_username,
  discordAvatarUrl: row.discord_avatar_url,
  lastOnline: row.last_online === null ? null : iso(row.last_online),
  refreshedAt: row.refreshed_at === null ? null : iso(row.refreshed_at),
  answers: row.signup_answers ?? {},
})

const loadMembers = (sql: SqlClient.SqlClient, rosterId: string) => database(
  "Unable to load roster members",
  sql<RosterMemberRow>`
    SELECT tag, name, townhall, trophies, current_clan_name, current_clan_tag,
           league_id, league_name, hero_level_sum, max_percent, war_preference,
           discord_user_id, discord_username, discord_avatar_url, last_online,
           refreshed_at, signup_answers
    FROM roster_members
    WHERE roster_id = ${rosterId}::uuid
    ORDER BY position, tag
  `,
)

const loadRosters = (
  sql: SqlClient.SqlClient,
  filters: { readonly clanTag?: string; readonly groupId?: string; readonly rosterId?: string; readonly serverId?: string },
) => Effect.gen(function* () {
  if (filters.rosterId !== undefined && !uuidPattern.test(filters.rosterId)) {
    return yield* new InvalidRequest({ message: "invalid roster_id" })
  }
  return yield* database("Unable to load rosters", sql<RosterRow>`
  SELECT id::text, server_id, group_id, clan_tag, alias, description,
         roster_type, signup_scope, min_townhall, max_townhall, min_signups,
         max_accounts_per_user, display_column_ids, sort_configuration,
         webhook_id, message_id, image_url, event_start_time, recurrence_days,
         recurrence_day_of_month, signup_questions, public_share_id, last_refreshed_at, created_at, updated_at, revision
  FROM rosters
  WHERE (${filters.serverId ?? null}::text IS NULL OR server_id = ${filters.serverId ?? null})
    AND (${filters.rosterId ?? null}::uuid IS NULL OR id = ${filters.rosterId ?? null}::uuid)
    AND (${filters.groupId ?? null}::text IS NULL OR group_id = ${filters.groupId ?? null})
    AND (${filters.clanTag ?? null}::text IS NULL OR clan_tag = ${filters.clanTag ?? null})
  ORDER BY updated_at DESC
  `)
})

const rosterJson = (row: RosterRow, members: ReadonlyArray<RosterMemberRow>) => ({
  id: row.id,
  server_id: row.server_id,
  alias: row.alias,
  roster_type: row.roster_type,
  signup_scope: row.signup_scope,
  members: members.map(memberJson),
  columns: row.display_column_ids ?? [],
  sort: row.sort_configuration ?? [],
  created_at: iso(row.created_at),
  updated_at: iso(row.updated_at),
  revision: Number(row.revision),
  ...optional("group_id", row.group_id),
  ...optional("clan_tag", row.clan_tag),
  ...optional("description", row.description),
  ...optional("min_th", row.min_townhall),
  ...optional("max_th", row.max_townhall),
  ...optional("min_signups", row.min_signups),
  ...optional("max_accounts_per_user", row.max_accounts_per_user),
  ...optional("webhook_id", row.webhook_id),
  ...optional("message_id", row.message_id),
  ...optional("image", row.image_url),
  ...optional("event_start_time", row.event_start_time === null ? null : Number(row.event_start_time)),
  ...optional("recurrence_days", row.recurrence_days),
  ...optional("recurrence_day_of_month", row.recurrence_day_of_month),
  signup_questions: row.signup_questions ?? [],
})

export const loadRosterJson = (sql: SqlClient.SqlClient, rosterId: string, serverId?: string) => Effect.gen(function* () {
  if (!uuidPattern.test(rosterId)) return yield* new InvalidRequest({ message: "invalid roster_id" })
  const rows = yield* loadRosters(sql, { rosterId, ...(serverId === undefined ? {} : { serverId }) })
  const row = rows[0]
  if (row === undefined) return yield* new NotFound({ message: "Roster not found" })
  return rosterJson(row, yield* loadMembers(sql, row.id))
})

const requireServerId = (input: DashboardRosterOperationInput, body?: Record<string, unknown>) => {
  const value = input.params.serverId
    ?? input.url.searchParams.get("server_id")
    ?? stringValue(body?.serverId)
    ?? stringValue(body?.server_id)
  if (value === undefined || !discordSnowflakePattern.test(value)) {
    return Effect.fail(new InvalidRequest({ message: "server_id must be a decimal Discord ID" }))
  }
  return Effect.succeed(value)
}

export const rosterMetrics = [
  { id: "player.name", label: "Player", valueType: "string", kind: "snapshot", description: "Player name", cacheTtlSeconds: 0 },
  { id: "player.tag", label: "Player tag", valueType: "string", kind: "snapshot", description: "Canonical player tag", cacheTtlSeconds: 0 },
  { id: "clan.name", label: "Clan", valueType: "string", kind: "snapshot", description: "Current clan name", cacheTtlSeconds: 0 },
  { id: "clan.tag", label: "Clan tag", valueType: "string", kind: "snapshot", description: "Current clan tag", cacheTtlSeconds: 0 },
  { id: "player.townhall", label: "Town Hall", valueType: "number", kind: "snapshot", description: "Town Hall level", cacheTtlSeconds: 0 },
  { id: "player.trophies", label: "Trophies", valueType: "number", kind: "snapshot", description: "Current trophies", cacheTtlSeconds: 0 },
  { id: "player.league", label: "League", valueType: "string", kind: "snapshot", description: "Current league", cacheTtlSeconds: 0 },
  { id: "player.league_trophies", label: "League + Trophies", valueType: "json", kind: "presentation", description: "Current league badge and trophy count", cacheTtlSeconds: 0 },
  { id: "player.heroes", label: "Heroes", valueType: "number", kind: "snapshot", description: "Sum of current home-village hero levels", cacheTtlSeconds: 0 },
  { id: "player.max_percent", label: "Maxed", valueType: "number", kind: "snapshot", description: "Upgrade completion percentage", cacheTtlSeconds: 0 },
  { id: "player.war_preference", label: "War preference", valueType: "boolean", kind: "snapshot", description: "Current war preference", cacheTtlSeconds: 0 },
  { id: "player.last_online", label: "Last online", valueType: "time", kind: "snapshot", description: "Last observed activity", cacheTtlSeconds: 0 },
  { id: "discord.username", label: "Discord", valueType: "string", kind: "snapshot", description: "Stored Discord username", cacheTtlSeconds: 0 },
  { id: "signup.answer", label: "Signup answer", valueType: "json", kind: "snapshot", description: "Answer selected by a roster-scoped questionId parameter", cacheTtlSeconds: 0 },
  { id: "roster.name", label: "Roster", valueType: "string", kind: "presentation", description: "Roster alias", cacheTtlSeconds: 0 },
  { id: "view.rank", label: "Rank", valueType: "number", kind: "presentation", description: "Rank after sorting", cacheTtlSeconds: 0 },
  { id: "view.computed", label: "Computed value", valueType: "json", kind: "presentation", description: "A value computed transiently by the roster assistant from authorized tool data; the saved replay prompt is its authoritative recipe", cacheTtlSeconds: 0 },
  { id: "war.hit_rate", label: "Hit rate", valueType: "number", kind: "historical", description: "War hit rate with a replayable windowDays parameter", cacheTtlSeconds: 900, dependsOn: ["player.tag"] },
  { id: "cwl.stars", label: "CWL stars", valueType: "number", kind: "historical", description: "CWL stars with a replayable seasonOffset parameter", cacheTtlSeconds: 900, dependsOn: ["player.tag"] },
  { id: "trophies.delta", label: "Trophy delta", valueType: "number", kind: "historical", description: "Trophy delta with a replayable windowDays parameter", cacheTtlSeconds: 900, dependsOn: ["player.tag"] },
  { id: "benchmark.th_hit_rate_delta", label: "TH benchmark delta", valueType: "number", kind: "derived", description: "Hit-rate difference from the Town Hall benchmark with a replayable windowDays parameter", cacheTtlSeconds: 900, dependsOn: ["war.hit_rate", "player.townhall"] },
  { id: "war.hit_rate.30d", label: "Hit rate (30d)", valueType: "number", kind: "historical", description: "Trailing 30-day war hit rate", cacheTtlSeconds: 900, dependsOn: ["player.tag"] },
  { id: "cwl.stars.current", label: "CWL stars", valueType: "number", kind: "historical", description: "Current-season CWL stars", cacheTtlSeconds: 900, dependsOn: ["player.tag"] },
  { id: "benchmark.th_hit_rate_delta.30d", label: "TH benchmark delta", valueType: "number", kind: "derived", description: "Hit-rate difference from the Town Hall benchmark", cacheTtlSeconds: 900, dependsOn: ["war.hit_rate.30d", "player.townhall"] },
  { id: "trophies.delta.7d", label: "Trophy delta (7d)", valueType: "number", kind: "historical", description: "Trailing seven-day trophy change", cacheTtlSeconds: 900, dependsOn: ["player.tag"] },
] as const

export class DashboardRosterOperations extends Context.Service<
  DashboardRosterOperations,
  {
    readonly execute: (
      operation: string,
      input: DashboardRosterOperationInput,
    ) => Effect.Effect<Response, ApiFailure>
  }
>()("clashking/DashboardRosterOperations") {
  static readonly layer = Layer.effect(
    DashboardRosterOperations,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const discord = yield* DiscordApi
      const execute = Effect.fn("DashboardRosterOperations.execute")(function* (
        operation: string,
        input: DashboardRosterOperationInput,
      ) {
        // Clash I/O is outside the short membership transaction. The roster
        // and resulting membership limits are rechecked after its row lock.
        if (operation === "manageMembers") input = yield* prepareMemberSnapshots(input)
        const signupIdentity = operation === "submitSignup"
          ? yield* prepareSignupIdentity(sql, input).pipe(Effect.provideService(DiscordApi, discord)) : undefined
        const effect = executeRosterOperation(sql, operation, input, signupIdentity).pipe(Effect.provideService(DiscordApi, discord))
        if (!transactionalOperations.has(operation)) return yield* effect
        const serialized = Effect.gen(function* () {
          if (destinationOperations.has(operation)) {
            const serverId = yield* requireServerId(input)
            const locked = yield* database("Unable to lock roster destinations", sql<{ readonly id: string }>`SELECT id FROM servers WHERE id = ${serverId} FOR UPDATE`)
            if (locked.length !== 1) return yield* new NotFound({ message: "Server not found" })
          }
          return yield* effect
        })
        return yield* sql.withTransaction(serialized).pipe(Effect.mapError((cause) =>
          cause instanceof Conflict || cause instanceof DatabaseFailure || cause instanceof Forbidden || cause instanceof InvalidRequest
            || cause instanceof NotFound || cause instanceof UpstreamUnavailable || cause instanceof PayloadTooLarge
            ? cause
            : new DatabaseFailure({ cause, message: "Roster transaction failed" }),
        ))
      })
      return DashboardRosterOperations.of({ execute })
    }),
  )
}

// Roster webhooks and automation destinations participate in the same guild
// row lock as managed-resource cleanup; this module never deletes Discord resources.
const destinationOperations = new Set([
  "createRoster", "updateRoster", "deleteRoster", "cloneRoster", "deleteGroup",
  "createAutomation", "updateAutomation", "deleteAutomation",
])

const transactionalOperations = new Set([
  "createRoster", "updateRoster", "deleteRoster", "cloneRoster", "manageMembers", "updateMember", "removeMember",
  "createGroup", "updateGroup", "deleteGroup", "createAutomation", "updateAutomation", "deleteAutomation",
  "createView", "updateView", "deleteView", "putQuestionnaire", "submitSignup",
  "refreshRosters", "refreshMember",
])

const executeRosterOperation = (
  sql: SqlClient.SqlClient,
  operation: string,
  input: DashboardRosterOperationInput,
  signupIdentity?: PreparedSignupIdentity,
): Effect.Effect<Response, ApiFailure, DiscordApi> => Effect.gen(function* () {
  switch (operation) {
    case "listMetrics":
      return json({ items: rosterMetrics })
    case "queryMetric":
      return yield* queryMetric(sql, input)
    case "previewView":
      return yield* previewView(sql, input)
    case "getRoster": {
      const serverId = yield* requireServerId(input)
      return json({ roster: yield* loadRosterJson(sql, input.params.rosterId ?? "", serverId) })
    }
    case "listRosters": {
      const serverId = yield* requireServerId(input)
      const rows = yield* loadRosters(sql, {
        serverId,
        ...(input.url.searchParams.get("group_id") === null ? {} : { groupId: input.url.searchParams.get("group_id") as string }),
        ...(input.url.searchParams.get("clan_tag") === null ? {} : { clanTag: input.url.searchParams.get("clan_tag") as string }),
      })
      const rosters = yield* Effect.forEach(rows, (row) => loadMembers(sql, row.id).pipe(
        Effect.map((members) => rosterJson(row, members)),
      ))
      return json({ rosters, count: rosters.length })
    }
    case "createRoster":
      return yield* createRoster(sql, input)
    case "updateRoster":
      return yield* updateRoster(sql, input)
    case "deleteRoster":
      return yield* deleteRoster(sql, input)
    case "cloneRoster":
      return yield* cloneRoster(sql, input)
    case "manageMembers":
      return yield* manageMembers(sql, input)
    case "updateMember":
      return yield* updateMember(sql, input)
    case "removeMember":
      return yield* removeMember(sql, input)
    case "refreshMember":
      return yield* refreshMember(sql, input)
    case "refreshRosters":
      return yield* refreshRosters(sql, input)
    case "membersQuery":
      return yield* queryMembers(sql, input)
    case "accountGroupsQuery":
      return yield* queryAccountGroups(sql, input)
    case "createGroup":
      return yield* createGroup(sql, input)
    case "listGroups":
      return yield* listGroups(sql, input)
    case "getGroup":
      return yield* getGroup(sql, input)
    case "updateGroup":
      return yield* updateGroup(sql, input)
    case "deleteGroup":
      return yield* deleteGroup(sql, input)
    case "createAutomation":
      return yield* createAutomation(sql, input)
    case "listAutomations":
      return yield* listAutomations(sql, input)
    case "updateAutomation":
      return yield* updateAutomation(sql, input)
    case "deleteAutomation":
      return yield* deleteAutomation(sql, input)
    case "listViews":
      return yield* listViews(sql, input)
    case "getView":
      return yield* getView(sql, input)
    case "sharedView":
      return yield* sharedView(sql, input)
    case "createView":
      return yield* createView(sql, input)
    case "updateView":
      return yield* updateView(sql, input)
    case "deleteView":
      return yield* deleteView(sql, input)
    case "putQuestionnaire":
      return yield* putQuestionnaire(sql, input)
    case "signupForm":
      return yield* signupForm(sql, input)
    case "submitSignup":
      return yield* submitSignup(sql, input, signupIdentity)
    case "builderMissingMembers":
      return yield* builderMissingMembers(sql, input)
    case "listBuilderRosters":
      return yield* listBuilderRosters(sql, input)
    case "getBuilderRoster":
      return yield* getBuilderRoster(sql, input)
    case "publicRoster":
      return yield* publicRoster(sql, input)
    case "validateMembershipChanges":
      return yield* validateMembershipChanges(sql, input)
    case "applyMembershipChanges":
      return yield* applyMembershipChanges(sql, input)
    case "refreshDiscordIdentity":
      return yield* refreshDiscordIdentity(sql, input)
    case "serverClanMembers":
      return yield* serverClanMembers(sql, input)
    case "missingMembers":
      return yield* missingMembers(sql, input)
    default:
      return yield* new NotFound({ message: "Roster operation not found" })
  }
})

const persistMember = (
  sql: SqlClient.SqlClient,
  rosterId: string,
  member: Record<string, unknown>,
  position: number,
): Effect.Effect<void, DatabaseFailure | InvalidRequest> => {
  const tag = normalizeTag(String(member.tag ?? ""))
  if (tag.length === 0) return Effect.fail(new InvalidRequest({ message: "member tag is required" }))
  return database("Unable to save roster member", sql`
    INSERT INTO roster_members (
      roster_id, tag, name, townhall, trophies, current_clan_name, current_clan_tag,
      league_id, league_name, hero_level_sum, max_percent, war_preference,
      discord_user_id, discord_username, discord_avatar_url, last_online,
      refreshed_at, signup_answers, position
    ) VALUES (
      ${rosterId}::uuid, ${tag}, ${String(member.name ?? "")}, ${Number(member.townhall ?? 0)},
      ${member.trophies ?? null}, NULLIF(${String(member.current_clan ?? "")}, ''),
      NULLIF(${String(member.current_clan_tag ?? "")}, ''), ${member.league_id ?? null},
      NULLIF(${String(member.league_name ?? "")}, ''), ${Number(member.hero_level_sum ?? 0)},
      ${member.max_percent ?? null}, ${member.war_pref ?? null},
      NULLIF(${String(member.discord ?? "")}, ''), NULLIF(${String(member.discord_username ?? "")}, ''),
      NULLIF(${String(member.discord_avatar_url ?? "")}, ''), ${member.last_online ?? null},
      ${member.refreshed_at ?? null}, ${JSON.stringify(member.answers ?? {})}::jsonb, ${position}
    )
    ON CONFLICT (roster_id, tag) DO UPDATE SET
      name = EXCLUDED.name, townhall = EXCLUDED.townhall, trophies = EXCLUDED.trophies,
      current_clan_name = EXCLUDED.current_clan_name, current_clan_tag = EXCLUDED.current_clan_tag,
      league_id = EXCLUDED.league_id, league_name = EXCLUDED.league_name,
      hero_level_sum = EXCLUDED.hero_level_sum, max_percent = EXCLUDED.max_percent,
      war_preference = EXCLUDED.war_preference,
      discord_user_id = COALESCE(EXCLUDED.discord_user_id, roster_members.discord_user_id),
      discord_username = COALESCE(EXCLUDED.discord_username, roster_members.discord_username),
      discord_avatar_url = COALESCE(EXCLUDED.discord_avatar_url, roster_members.discord_avatar_url),
      last_online = EXCLUDED.last_online, refreshed_at = EXCLUDED.refreshed_at,
      signup_answers = EXCLUDED.signup_answers, position = EXCLUDED.position
  `).pipe(Effect.asVoid)
}

const createRoster = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  yield* validateRosterLimits(body)
  const serverId = yield* requireServerId(input, body)
  const alias = yield* requireString(body.alias, "alias")
  const rosterType = body.roster_type === "family" ? "family" : "clan"
  const signupScope = body.signup_scope === "family-wide" ? "family-wide" : "clan-only"
  const members = Array.isArray(body.members)
    ? body.members.filter((item): item is Record<string, unknown> => isRecord(item))
    : []
  const owners = yield* lockRosterAdmissionOwners(sql, members.map((member) => normalizeTag(String(member.tag ?? ""))))
  const id = crypto.randomUUID()
  yield* database("Unable to create roster", sql`
    INSERT INTO rosters (
      id, server_id, group_id, clan_tag, alias, description, roster_type, signup_scope, max_accounts_per_user,
      display_column_ids, sort_configuration, signup_questions, created_at, updated_at
    ) VALUES (
      ${id}::uuid, ${serverId}, NULLIF(${String(body.group_id ?? "")}, ''),
      NULLIF(${String(body.clan_tag ?? "")}, ''), ${alias}, NULLIF(${String(body.description ?? "")}, ''),
      ${rosterType}, ${signupScope}, ${body.max_accounts_per_user ?? null},
      ARRAY[]::text[], '[]'::jsonb, '[]'::jsonb, now(), now()
    )
  `)
  yield* lockRosterMembership(sql, serverId, [id])
  yield* Effect.forEach(members, (member, index) => persistMember(sql, id, member, index), { concurrency: 1 })
  yield* assertRosterMembershipLimits(sql, [id], [...owners.values()])
  return json({
    message: "Roster created successfully",
    roster_id: id,
    roster: yield* loadRosterJson(sql, id, serverId),
  }, 201)
})

const updateRoster = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  yield* validateRosterLimits(body)
  const serverId = yield* requireServerId(input)
  const id = input.params.rosterId ?? ""
  yield* lockRosterMembership(sql, serverId, [id])
  const current = yield* loadRosters(sql, { rosterId: id, serverId })
  const row = current[0]
  if (row === undefined) return yield* new NotFound({ message: "Roster not found" })
  const webhookId = body.webhook_id === undefined ? row.webhook_id : stringValue(body.webhook_id) ?? null
  const messageId = body.message_id === undefined ? row.message_id : stringValue(body.message_id) ?? null
  if ((webhookId === null) !== (messageId === null)) {
    return yield* new InvalidRequest({ message: "webhook_id and message_id must be set or cleared together" })
  }
  if (webhookId !== null && (!discordSnowflakePattern.test(webhookId) || !discordSnowflakePattern.test(messageId ?? ""))) {
    return yield* new InvalidRequest({ message: "webhook_id and message_id must be decimal Discord IDs" })
  }
  yield* database("Unable to update roster", sql`
    UPDATE rosters SET
      alias = ${String(body.alias ?? row.alias)},
      description = ${body.description === undefined ? row.description : body.description},
      roster_type = ${String(body.roster_type ?? row.roster_type)},
      signup_scope = ${String(body.signup_scope ?? row.signup_scope)},
      clan_tag = ${body.clan_tag === undefined ? row.clan_tag : body.clan_tag},
      group_id = ${body.group_id === undefined ? row.group_id : body.group_id},
      min_townhall = ${body.min_th === undefined ? row.min_townhall : body.min_th},
      max_townhall = ${body.max_th === undefined ? row.max_townhall : body.max_th},
      min_signups = ${body.min_signups === undefined ? row.min_signups : body.min_signups},
      max_accounts_per_user = ${body.max_accounts_per_user === undefined ? row.max_accounts_per_user : body.max_accounts_per_user},
      display_column_ids = ${body.columns === undefined ? row.display_column_ids ?? [] : stringArray(body.columns)},
      sort_configuration = ${JSON.stringify(body.sort === undefined ? row.sort_configuration ?? [] : body.sort)}::jsonb,
      webhook_id = ${webhookId}, message_id = ${messageId},
      image_url = ${body.image === undefined ? row.image_url : body.image},
      event_start_time = ${body.event_start_time === undefined ? row.event_start_time : body.event_start_time},
      recurrence_days = ${body.recurrence_days === undefined ? row.recurrence_days : body.recurrence_days},
      recurrence_day_of_month = ${body.recurrence_day_of_month === undefined ? row.recurrence_day_of_month : body.recurrence_day_of_month},
      signup_questions = ${JSON.stringify(body.signup_questions === undefined ? row.signup_questions ?? [] : body.signup_questions)}::jsonb,
      revision = revision + 1, updated_at = now()
    WHERE id = ${id}::uuid AND server_id = ${serverId}
  `)
  if (body.max_accounts_per_user !== undefined) yield* assertRosterMembershipLimits(sql, [id])
  return json({ message: "Roster updated", roster: yield* loadRosterJson(sql, id, serverId) })
})

const validateRosterLimits = (body: Record<string, unknown>) =>
  body.max_accounts_per_user !== undefined && body.max_accounts_per_user !== null && !Schema.is(RosterCapacity)(body.max_accounts_per_user)
    ? Effect.fail(new InvalidRequest({ message: "Roster per-user limit must be a positive integer or null" }))
    : Effect.void

const deleteRoster = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const id = input.params.rosterId ?? ""
  if (!uuidPattern.test(id)) return yield* new InvalidRequest({ message: "invalid roster_id" })
  yield* lockRosterMembership(sql, serverId, [id])
  if (boolValue(input.url.searchParams.get("members_only"))) {
    yield* loadRosterJson(sql, id, serverId)
    const rows = yield* database("Unable to clear roster members", sql<{ readonly deleted: number }>`
      WITH deleted AS (DELETE FROM roster_members WHERE roster_id = ${id}::uuid RETURNING 1)
      SELECT count(*)::int AS deleted FROM deleted
    `)
    if ((rows[0]?.deleted ?? 0) === 0) yield* loadRosterJson(sql, id, serverId)
    yield* database("Unable to update roster", sql`UPDATE rosters SET revision = revision + 1, updated_at = now() WHERE id = ${id}::uuid AND server_id = ${serverId}`)
    return json({ message: "Roster members cleared" })
  }
  const rows = yield* database("Unable to delete roster", sql<{ readonly id: string }>`
    DELETE FROM rosters WHERE id = ${id}::uuid AND server_id = ${serverId} RETURNING id::text
  `)
  if (rows.length === 0) return yield* new NotFound({ message: "Roster not found" })
  return json({ message: "Roster deleted successfully" })
})

const cloneRoster = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const targetServerId = yield* requireServerId(input)
  const source = yield* loadRosters(sql, { rosterId: input.params.rosterId ?? "" })
  const scope = source[0]
  if (scope === undefined) return yield* new NotFound({ message: "Source roster not found" })
  const proposedMembers = body.copy_members === true ? yield* loadMembers(sql, scope.id) : []
  const proposedTags = new Set(proposedMembers.map((member) => member.tag))
  const owners = yield* lockRosterAdmissionOwners(sql, [...proposedTags])
  yield* lockRosterMembership(sql, scope.server_id, [scope.id])
  const row = (yield* loadRosters(sql, { rosterId: scope.id, serverId: scope.server_id }))[0]!
  const members = body.copy_members === true ? yield* loadMembers(sql, row.id) : []
  if (members.some((member) => !proposedTags.has(member.tag))) {
    return yield* new Conflict({ message: "Source roster membership changed during cloning; retry" })
  }
  const sameServer = targetServerId === row.server_id
  const id = crypto.randomUUID()
  const alias = stringValue(body.new_alias) ?? row.alias
  yield* database("Unable to clone roster", sql`
    INSERT INTO rosters (
      id, server_id, group_id, clan_tag, alias, description, roster_type, signup_scope,
      min_townhall, max_townhall, min_signups, max_accounts_per_user,
      display_column_ids, sort_configuration, webhook_id, message_id, image_url,
      event_start_time, recurrence_days, recurrence_day_of_month, signup_questions,
      created_at, updated_at
    ) VALUES (
      ${id}::uuid, ${targetServerId}, ${sameServer ? row.group_id : null}, ${row.clan_tag}, ${alias}, ${row.description},
      ${row.roster_type}, ${row.signup_scope}, ${row.min_townhall}, ${row.max_townhall},
      ${row.min_signups}, ${row.max_accounts_per_user}, ${row.display_column_ids ?? []},
      ${JSON.stringify(row.sort_configuration ?? [])}::jsonb, NULL, NULL,
      ${row.image_url}, ${row.event_start_time}, ${row.recurrence_days}, ${row.recurrence_day_of_month},
      ${JSON.stringify(row.signup_questions ?? [])}::jsonb, now(), now()
    )
  `)
  yield* lockRosterMembership(sql, targetServerId, [id])
  if (members.length > 0) {
    yield* database("Unable to clone roster members", sql`
      INSERT INTO roster_members (
        roster_id, tag, name, townhall, trophies, current_clan_name, current_clan_tag,
        league_id, league_name, hero_level_sum, max_percent, war_preference,
        discord_user_id, discord_username, discord_avatar_url, last_online,
        refreshed_at, signup_answers, position
      ) SELECT ${id}::uuid, tag, name, townhall, trophies, current_clan_name, current_clan_tag,
               league_id, league_name, hero_level_sum, max_percent, war_preference,
               discord_user_id, discord_username, discord_avatar_url, last_online,
               refreshed_at, signup_answers, position
        FROM roster_members WHERE roster_id = ${row.id}::uuid
    `)
  }
  yield* assertRosterMembershipLimits(sql, [id], members.flatMap((member) => {
    const owner = owners.get(member.tag)
    return owner === undefined ? [] : [owner]
  }))
  return json({
    message: "Roster cloned successfully", new_roster_id: id, new_alias: alias,
    target_server_id: targetServerId, source_server_id: row.server_id,
    members_copied: members.length, roster: yield* loadRosterJson(sql, id, targetServerId),
  }, 201)
})

const manageMembers = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const serverId = yield* requireServerId(input)
  const rosterId = input.params.rosterId ?? ""
  const source = Array.isArray(body.members) && body.members.length > 0 ? body.members : body.add
  const members = Array.isArray(source) ? source.filter((item): item is Record<string, unknown> => isRecord(item)) : []
  const owners = body.operation === "remove" ? new Map<string, string>()
    : yield* lockRosterAdmissionOwners(sql, members.map((member) => normalizeTag(String(member.tag ?? ""))))
  yield* lockRosterMembership(sql, serverId, [rosterId])
  yield* loadRosterJson(sql, rosterId, serverId)
  if (body.operation === "remove") {
    const tags = stringArray(body.player_tags).map(normalizeTag)
    yield* database("Unable to remove roster members", sql`
      DELETE FROM roster_members WHERE roster_id = ${rosterId}::uuid AND tag = ANY(${tags}::text[])
    `)
  } else {
    const current = yield* loadMembers(sql, rosterId)
    const existingTags = new Set(current.map((member) => member.tag))
    const admittedOwners = members.flatMap((member) => {
      const tag = normalizeTag(String(member.tag ?? "")), owner = owners.get(tag)
      return existingTags.has(tag) || owner === undefined ? [] : [owner]
    })
    yield* Effect.forEach(members, (member, index) => persistMember(sql, rosterId, member, current.length + index), { concurrency: 1 })
    yield* assertRosterMembershipLimits(sql, [rosterId], admittedOwners)
  }
  yield* database("Unable to revise roster", sql`UPDATE rosters SET revision = revision + 1, updated_at = now() WHERE id = ${rosterId}::uuid`)
  return json({ message: "Members updated" })
})

const prepareMemberSnapshots = (input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  if (body.operation !== "remove") {
    const source = Array.isArray(body.members) && body.members.length > 0 ? body.members : body.add
    const members = Array.isArray(source) ? source.filter(isRecord) : []
    body.members = yield* Effect.forEach(members, (member) => hydrateRosterMember(input.bindings, member), { concurrency: 5 })
  }
  return { ...input, request: new Request(input.request.url, { method: input.request.method,
    headers: input.request.headers, body: JSON.stringify(body) }) }
})

const updateMember = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const serverId = yield* requireServerId(input)
  const rosterId = input.params.rosterId ?? ""
  yield* lockRosterMembership(sql, serverId, [rosterId])
  yield* loadRosterJson(sql, rosterId, serverId)
  const tag = normalizeTag(input.params.memberTag ?? "")
  const rows = yield* database("Unable to update roster member", sql<{ readonly tag: string }>`
    UPDATE roster_members SET signup_answers = ${JSON.stringify(body.answers ?? {})}::jsonb
    WHERE roster_id = ${rosterId}::uuid AND tag = ${tag}
    RETURNING tag
  `)
  if (rows.length === 0) return yield* new NotFound({ message: "Member not found in roster" })
  return json({ message: "Member updated" })
})

const removeMember = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const rosterId = input.params.rosterId ?? ""
  yield* lockRosterMembership(sql, serverId, [rosterId])
  yield* loadRosterJson(sql, rosterId, serverId)
  const tag = normalizeTag(input.params.memberTag ?? "")
  yield* database("Unable to remove roster member", sql`DELETE FROM roster_members WHERE roster_id = ${rosterId}::uuid AND tag = ${tag}`)
  yield* database("Unable to revise roster", sql`UPDATE rosters SET revision = revision + 1, updated_at = now() WHERE id = ${rosterId}::uuid`)
  return json({ message: "Member removed from roster" })
})

const refreshMember = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const rosterId = input.params.rosterId ?? ""
  yield* loadRosterJson(sql, rosterId, serverId)
  const members = yield* loadMembers(sql, rosterId)
  const position = members.findIndex((member) => member.tag === normalizeTag(input.params.memberTag ?? ""))
  const member = members[position]
  if (member === undefined) return yield* new NotFound({ message: "Member not found in roster" })
  const hydrated = yield* hydrateRosterMember(input.bindings, memberJson(member))
  yield* persistMember(sql, rosterId, hydrated, position)
  yield* database("Unable to revise refreshed roster", sql`UPDATE rosters SET revision = revision + 1, updated_at = now() WHERE id = ${rosterId}::uuid`)
  return json({ message: "Member refreshed", member: hydrated })
})

const refreshRosters = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const rosterId = input.url.searchParams.get("roster_id")
  const groupId = input.url.searchParams.get("group_id")
  const rows = yield* loadRosters(sql, { serverId, ...(rosterId ? { rosterId } : groupId ? { groupId } : {}) })
  const rosters: Array<ReturnType<typeof rosterJson>> = []
  for (const row of rows) {
    const members = yield* loadMembers(sql, row.id)
    for (const [position, member] of members.entries()) {
      const hydrated = yield* hydrateRosterMember(input.bindings, memberJson(member))
      yield* persistMember(sql, row.id, hydrated, position)
    }
    yield* database("Unable to revise refreshed roster", sql`UPDATE rosters SET revision = revision + 1, updated_at = now() WHERE id = ${row.id}::uuid`)
    rosters.push(yield* loadRosterJson(sql, row.id, serverId))
  }
  return json({ message: `Refreshed ${rosters.length} roster(s)`, refreshed_rosters: rosters })
})


const queryMembers = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const { serverId, rosterIds } = yield* requireRosterBatch(body)
  const fields = stringArray(body.fields)
  const allowed = new Set([
    "playerName", "playerTag", "townhall", "trophies", "clanName", "clanTag",
    "leagueId", "leagueName", "heroLevelSum", "maxPercent", "warPreference",
    "lastOnline", "discordUsername", "signupAnswers",
  ])
  const unsupported = fields.find((field) => !allowed.has(field))
  if (unsupported !== undefined) return yield* new InvalidRequest({ message: `Unsupported roster field: ${unsupported}` })
  const rosters = yield* loadRosters(sql, { serverId })
  const valid = new Set(rosters.map((row) => row.id))
  if (rosterIds.some((id) => !valid.has(id))) {
    return yield* new InvalidRequest({ message: "One or more rosterIds do not belong to this server" })
  }
  const rows: Array<Record<string, unknown>> = []
  for (const rosterId of rosterIds) {
    const members = yield* loadMembers(sql, rosterId)
    for (const member of members) {
      const source = builderMemberJson(member)
      const row: Record<string, unknown> = { rosterId, playerTag: source.playerTag }
      for (const field of fields) {
        row[field] = field === "signupAnswers"
          ? source.answers
          : source[field as keyof typeof source]
      }
      rows.push(row)
    }
  }
  return json({ rows })
})

const queryAccountGroups = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const { serverId, rosterIds } = yield* requireRosterBatch(body)
  const rosters = yield* loadRosters(sql, { serverId })
  const valid = new Set(rosters.map((row) => row.id))
  if (rosterIds.some((id) => !valid.has(id))) {
    return yield* new InvalidRequest({ message: "One or more rosterIds do not belong to this server" })
  }
  const owners = new Map<string, Array<{ rosterId: string; playerTag: string; playerName: string }>>()
  for (const rosterId of rosterIds) {
    for (const member of yield* loadMembers(sql, rosterId)) {
      if (member.discord_user_id === null) continue
      const accounts = owners.get(member.discord_user_id) ?? []
      accounts.push({ rosterId, playerTag: member.tag, playerName: member.name })
      owners.set(member.discord_user_id, accounts)
    }
  }
  const groups = [...owners.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([, accounts], index) => ({ group: index + 1, accounts }))
  return json({ groups, note: "Accounts in one group share a linked Discord owner; unlinked accounts are omitted." })
})

const jsonMetricValue = (value: unknown) => Schema.decodeUnknownEffect(Schema.Json)(value ?? null).pipe(
  Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Roster metric snapshot contains an invalid JSON value" })),
)

const metricRosterRows = (sql: SqlClient.SqlClient, serverId: string, rosterIds: readonly string[]) => Effect.gen(function* () {
  yield* requireRosterBatch({ serverId, rosterIds })
  const rosters = yield* loadRosters(sql, { serverId })
  const byId = new Map(rosters.map((row) => [row.id, row]))
  const selected: RosterRow[] = []
  for (const id of rosterIds) {
    const row = byId.get(id)
    if (row === undefined) return yield* new InvalidRequest({ message: "One or more rosterIds do not belong to this server" })
    selected.push(row)
  }
  return selected
})

const dynamicMetric = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput, rosterId: string, metricId: string, parameters: Readonly<Record<string, typeof Schema.Json.Type>> = {}) =>
  queryDynamicRosterMetric(rosterId, metricId, parameters).pipe(
    Effect.provideService(SqlClient.SqlClient, sql), Effect.provideService(WorkerEnvironment, input.bindings),
  )

const queryMetric = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* Schema.decodeUnknownEffect(DashboardRosterMetricQueryRequest)(yield* decodeJson(input.request)).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid roster metric query" })),
  )
  const serverId = yield* requireServerId(input)
  if (!rosterMetrics.some((metric) => metric.id === body.metricId)) return yield* new InvalidRequest({ message: `Unknown roster metric: ${body.metricId}` })
  const rosters = yield* metricRosterRows(sql, serverId, body.rosterIds)
  const rows: Array<{ rosterId: string; playerTag: string; value: typeof Schema.Json.Type }> = []
  const questionId = body.parameters?.questionId
  if (body.metricId === "signup.answer" && (typeof questionId !== "string" || !/^[a-z][a-z0-9_]{0,47}$/u.test(questionId))) {
    return yield* new InvalidRequest({ message: "signup.answer requires a valid questionId parameter" })
  }
  for (const roster of rosters) {
    const key = rosterSnapshotMetricKeys[body.metricId]
    if (key !== undefined || body.metricId === "signup.answer") {
      for (const member of yield* loadMembers(sql, roster.id)) {
        const source: Readonly<Record<string, unknown>> = builderMemberJson(member)
        const value = key === undefined && typeof questionId === "string" && isRecord(source.answers) ? source.answers[questionId] : source[key ?? ""]
        rows.push({ rosterId: roster.id, playerTag: member.tag, value: yield* jsonMetricValue(value) })
      }
    } else {
      const values = yield* dynamicMetric(sql, input, roster.id, body.metricId, body.parameters)
      for (const [playerTag, value] of [...values].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) rows.push({ rosterId: roster.id, playerTag, value })
    }
  }
  return json({ metricId: body.metricId, parameters: normalizeRosterMetricParameters(body.metricId, body.parameters), rows, cached: false, evaluatedAt: new Date().toISOString() })
})

const previewView = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* Schema.decodeUnknownEffect(DashboardRosterViewPreviewRequest)(yield* decodeJson(input.request)).pipe(
    Effect.mapError(() => new InvalidRequest({ message: "Invalid roster view preview" })),
  )
  const write = yield* viewWrite({ name: body.name, sourceCode: body.sourceCode, sourceVersion: body.sourceVersion })
  const spec: typeof DashboardRosterViewSpec.Type = { schemaVersion: 1, columns: body.columns, filters: body.filters, sort: body.sort,
    highlights: body.highlights, ...(body.limit === null ? {} : { limit: body.limit }) }
  yield* validateRosterViewSpec(spec, new Set(rosterMetrics.map((metric) => metric.id)))
  const rosters = yield* metricRosterRows(sql, body.serverId, body.rosterIds)
  const rows: Array<typeof DashboardRosterViewResultRow.Type> = []
  if (body.rows !== undefined) {
    if (body.rows.length > 500) return yield* new InvalidRequest({ message: "Roster view previews support at most 500 computed rows" })
    const columns = new Set(spec.columns.map((column) => column.id))
    for (const row of body.rows) {
      if (!body.rosterIds.includes(row.rosterId) || row.playerTag.trim().length === 0) return yield* new InvalidRequest({ message: "Computed view rows must reference an attached roster and playerTag" })
      if (Object.keys(row.values).some((key) => !columns.has(key))) return yield* new InvalidRequest({ message: "Computed view row contains an unknown column" })
      if (row.highlight !== undefined && row.highlight !== null && !/^#[0-9A-Fa-f]{6}$/u.test(row.highlight)) return yield* new InvalidRequest({ message: "Computed row highlight must be a six-digit hex color" })
      rows.push(row)
    }
  } else {
    for (const roster of rosters) {
      const dynamic = new Map<string, ReadonlyMap<string, number | null>>()
      const recipes = new Map<string, ReadonlyMap<string, number | null>>()
      for (const column of spec.columns) {
        const metric = rosterMetrics.find((item) => item.id === column.metricId)
        if (metric?.kind === "historical" || metric?.kind === "derived") {
          const parameters = normalizeRosterMetricParameters(column.metricId, column.parameters)
          const recipe = JSON.stringify([column.metricId, parameters])
          let values = recipes.get(recipe)
          if (values === undefined) {
            values = yield* dynamicMetric(sql, input, roster.id, column.metricId, parameters)
            recipes.set(recipe, values)
          }
          dynamic.set(column.id, values)
        }
      }
      for (const member of yield* loadMembers(sql, roster.id)) {
        const source: Readonly<Record<string, unknown>> = builderMemberJson(member)
        const values: Record<string, typeof Schema.Json.Type> = {}
        for (const column of spec.columns) {
          if (column.metricId === "roster.name") values[column.id] = roster.alias
          else if (column.metricId === "player.league_trophies") values[column.id] = { leagueId: member.league_id, leagueName: member.league_name, trophies: member.trophies }
          else if (column.metricId === "signup.answer") values[column.id] = yield* jsonMetricValue(isRecord(source.answers) ? source.answers[String(column.parameters?.questionId)] : null)
          else {
            const key = rosterSnapshotMetricKeys[column.metricId]
            values[column.id] = yield* jsonMetricValue(key === undefined ? dynamic.get(column.id)?.get(member.tag) : source[key])
          }
        }
        rows.push({ rosterId: roster.id, playerTag: member.tag, values })
      }
    }
  }
  const now = new Date().toISOString()
  const viewId = body.viewId ?? ""
  return json({
    view: { id: viewId, shareId: "", serverId: body.serverId, ...write, createdBy: "", spec, createdAt: now, updatedAt: now },
    result: { viewId, rosterIds: body.rosterIds, schemaVersion: 1, rows: presentRosterView(rows, spec), cachedMetricIds: [], evaluatedAt: now },
  })
})

interface GroupRow {
  readonly alias: string | null
  readonly created_at: Date | string
  readonly description: string
  readonly group_id: string
  readonly max_accounts_per_user: number | null
  readonly min_signups: number | null
  readonly name: string
  readonly server_id: string
  readonly updated_at: Date | string
}

const groupJson = (row: GroupRow) => ({
  group_id: row.group_id, server_id: row.server_id, name: row.name,
  description: row.description, created_at: iso(row.created_at), updated_at: iso(row.updated_at),
  ...optional("alias", row.alias), ...optional("max_accounts_per_user", row.max_accounts_per_user),
  ...optional("min_signups", row.min_signups),
})

const loadGroups = (sql: SqlClient.SqlClient, serverId: string, groupId?: string) => database(
  "Unable to load roster groups",
  sql<GroupRow>`
    SELECT group_id, server_id, name, alias, description, max_accounts_per_user,
           min_signups, created_at, updated_at
    FROM roster_groups
    WHERE server_id = ${serverId} AND (${groupId ?? null}::text IS NULL OR group_id = ${groupId ?? null})
    ORDER BY updated_at DESC
  `,
)

const createGroup = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const serverId = yield* requireServerId(input, body)
  const name = yield* requireString(body.name, "name")
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12)
  const rows = yield* database("Unable to create roster group", sql<GroupRow>`
    INSERT INTO roster_groups (
      group_id, server_id, name, alias, description, max_accounts_per_user,
      min_signups, created_at, updated_at
    ) VALUES (
      ${id}, ${serverId}, ${name}, NULLIF(${String(body.alias ?? "")}, ''),
      ${String(body.description ?? "")}, ${body.max_accounts_per_user ?? null},
      ${body.min_signups ?? null}, now(), now()
    ) RETURNING group_id, server_id, name, alias, description, max_accounts_per_user,
      min_signups, created_at, updated_at
  `)
  const row = rows[0]
  if (row === undefined) return yield* new DatabaseFailure({ cause: "missing RETURNING row", message: "Unable to create roster group" })
  return json({ message: "Roster group created", group_id: id, group: groupJson(row) }, 201)
})

const listGroups = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const items = (yield* loadGroups(sql, serverId)).map(groupJson)
  return json({ items, count: items.length })
})

const getGroup = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const groupId = input.params.groupId ?? ""
  const row = (yield* loadGroups(sql, serverId, groupId))[0]
  if (row === undefined) return yield* new NotFound({ message: "Roster group not found" })
  const rosterRows = yield* loadRosters(sql, { serverId, groupId })
  const rosters = yield* Effect.forEach(rosterRows, (roster) => loadMembers(sql, roster.id).pipe(
    Effect.map((members) => rosterJson(roster, members)),
  ))
  return json({ group: { ...groupJson(row), rosters } })
})

const updateGroup = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const serverId = yield* requireServerId(input)
  const groupId = input.params.groupId ?? ""
  const current = (yield* loadGroups(sql, serverId, groupId))[0]
  if (current === undefined) return yield* new NotFound({ message: "Roster group not found" })
  const rows = yield* database("Unable to update roster group", sql<GroupRow>`
    UPDATE roster_groups SET
      name = ${String(body.name ?? current.name)},
      alias = ${body.alias === undefined ? current.alias : body.alias},
      description = ${body.description === undefined ? current.description : String(body.description ?? "")},
      max_accounts_per_user = ${body.max_accounts_per_user === undefined ? current.max_accounts_per_user : body.max_accounts_per_user},
      min_signups = ${body.min_signups === undefined ? current.min_signups : body.min_signups},
      updated_at = now()
    WHERE group_id = ${groupId} AND server_id = ${serverId}
    RETURNING group_id, server_id, name, alias, description, max_accounts_per_user,
      min_signups, created_at, updated_at
  `)
  return json({ message: "Group updated", group: groupJson(rows[0] ?? current) })
})

const deleteGroup = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const groupId = input.params.groupId ?? ""
  const exists = (yield* loadGroups(sql, serverId, groupId))[0]
  if (exists === undefined) return yield* new NotFound({ message: "Roster group not found" })
  const rows = yield* database("Unable to detach roster group", sql<{ readonly id: string }>`
    UPDATE rosters SET group_id = NULL, updated_at = now()
    WHERE group_id = ${groupId} AND server_id = ${serverId}
    RETURNING id::text
  `)
  yield* database("Unable to delete roster group automation", sql`DELETE FROM roster_automation_rules WHERE group_id = ${groupId} AND server_id = ${serverId}`)
  yield* database("Unable to delete roster group", sql`DELETE FROM roster_groups WHERE group_id = ${groupId} AND server_id = ${serverId}`)
  return json({ message: "Roster group deleted successfully", affected_rosters: rows.length })
})

interface AutomationRow {
  readonly action_type: string
  readonly active: boolean
  readonly automation_id: string
  readonly created_at: Date | string
  readonly discord_channel_id: string | null
  readonly executed: boolean
  readonly executed_at: number | string | null
  readonly execution_status: string | null
  readonly group_id: string | null
  readonly last_missed_at: number | string | null
  readonly last_triggered_at: number | string | null
  readonly ping_type: string | null
  readonly roster_id: string | null
  readonly scheduled_at: Date | string
  readonly server_id: string
  readonly trigger_type: string
  readonly updated_at: Date | string
}

const automationJson = (row: AutomationRow) => ({
  automation_id: row.automation_id, server_id: row.server_id, action_type: row.action_type,
  trigger_type: row.trigger_type, scheduled_at: iso(row.scheduled_at), active: row.active,
  executed: row.executed, created_at: iso(row.created_at), updated_at: iso(row.updated_at),
  ...optional("roster_id", row.roster_id), ...optional("group_id", row.group_id),
  ...optional("discord_channel_id", row.discord_channel_id),
  ...(row.ping_type === null ? {} : { options: { ping_type: row.ping_type } }),
  ...optional("executed_at", row.executed_at === null ? null : Number(row.executed_at)),
  ...optional("last_triggered_at", row.last_triggered_at === null ? null : Number(row.last_triggered_at)),
  ...optional("execution_status", row.execution_status),
  ...optional("last_missed_at", row.last_missed_at === null ? null : Number(row.last_missed_at)),
})

const loadAutomations = (
  sql: SqlClient.SqlClient,
  serverId: string,
  filters: { readonly activeOnly?: boolean; readonly automationId?: string; readonly groupId?: string; readonly rosterId?: string },
) => database("Unable to load roster automation", sql<AutomationRow>`
  SELECT automation_id, server_id, roster_id::text, group_id, action_type,
    trigger_type, scheduled_at, discord_channel_id, ping_type, enabled AS active, executed,
    executed_at, last_triggered_at, execution_status, last_missed_at, created_at, updated_at
  FROM roster_automation_rules
  WHERE server_id = ${serverId}
    AND (${filters.automationId ?? null}::text IS NULL OR automation_id = ${filters.automationId ?? null})
    AND (${filters.rosterId ?? null}::uuid IS NULL OR roster_id = ${filters.rosterId ?? null}::uuid)
    AND (${filters.groupId ?? null}::text IS NULL OR group_id = ${filters.groupId ?? null})
    AND (${filters.activeOnly ?? false} = false OR enabled)
  ORDER BY created_at DESC
`)

// Both callers run inside the existing operation transaction and guild lock.
// Hold target rows until commit so ownership cannot change after validation.
const lockAutomationTargets = (sql: SqlClient.SqlClient, serverId: string, rawRosterId: unknown, rawGroupId: unknown) => Effect.gen(function* () {
  const rosterId = rawRosterId === undefined || rawRosterId === null ? null : rawRosterId
  const groupId = rawGroupId === undefined || rawGroupId === null ? null : rawGroupId
  if (rosterId !== null && (typeof rosterId !== "string" || !uuidPattern.test(rosterId))) {
    return yield* new InvalidRequest({ message: "roster_id must be a UUID" })
  }
  if (groupId !== null && (typeof groupId !== "string" || groupId.trim() === "")) {
    return yield* new InvalidRequest({ message: "group_id must be a nonempty string" })
  }
  if (rosterId !== null) {
    const rows = yield* database("Unable to lock automation roster target", sql`SELECT id FROM rosters
      WHERE id = ${rosterId}::uuid AND server_id = ${serverId} FOR UPDATE`)
    if (rows.length !== 1) return yield* new NotFound({ message: "Roster automation target not found" })
  }
  if (groupId !== null) {
    const rows = yield* database("Unable to lock automation group target", sql`SELECT group_id FROM roster_groups
      WHERE group_id = ${groupId} AND server_id = ${serverId} FOR UPDATE`)
    if (rows.length !== 1) return yield* new NotFound({ message: "Roster automation group not found" })
  }
  return { rosterId, groupId }
})

const createAutomation = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const serverId = yield* requireServerId(input, body)
  const actionType = yield* requireString(body.action_type, "action_type")
  const scheduledAt = yield* requireString(body.scheduled_at, "scheduled_at")
  if (!validScheduledAt(scheduledAt)) {
    return yield* new InvalidRequest({ message: "scheduled_at must be an RFC3339 timestamp" })
  }
  const targets = yield* lockAutomationTargets(sql, serverId, body.roster_id, body.group_id)
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12)
  const rows = yield* database("Unable to create roster automation", sql<AutomationRow>`
    INSERT INTO roster_automation_rules (
      automation_id, server_id, roster_id, group_id, action_type, trigger_type,
      scheduled_at, discord_channel_id, ping_type, enabled, executed, created_at, updated_at
    ) VALUES (
      ${id}, ${serverId}, ${targets.rosterId}::uuid, ${targets.groupId},
      ${actionType}, ${String(body.trigger_type ?? "")}, ${scheduledAt}::timestamptz,
      ${body.discord_channel_id ?? null}, ${isRecord(body.options) ? body.options.ping_type ?? null : null},
      true, false, now(), now()
    ) RETURNING automation_id, server_id, roster_id::text, group_id, action_type,
      trigger_type, scheduled_at, discord_channel_id, ping_type, enabled AS active, executed,
      executed_at, last_triggered_at, execution_status, last_missed_at, created_at, updated_at
  `)
  const row = rows[0]
  if (row === undefined) return yield* new DatabaseFailure({ cause: "missing RETURNING row", message: "Unable to create roster automation" })
  return json({ message: "Automation rule created", automation_id: id, rule: automationJson(row) }, 201)
})

const listAutomations = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const rosterId = input.url.searchParams.get("roster_id") ?? ""
  const groupId = input.url.searchParams.get("group_id") ?? ""
  const activeOnly = input.url.searchParams.get("active_only")
  if (activeOnly !== null && activeOnly !== "true" && activeOnly !== "false") return yield* new InvalidRequest({ message: "invalid active_only" })
  if (rosterId !== "" && !uuidPattern.test(rosterId)) return yield* new InvalidRequest({ message: "invalid roster_id" })
  const rules = (yield* loadAutomations(sql, serverId, {
    activeOnly: boolValue(activeOnly, true),
    ...(rosterId.length === 0 ? {} : { rosterId }), ...(groupId.length === 0 ? {} : { groupId }),
  })).map(automationJson)
  return json({ items: rules, rules, count: rules.length, server_id: serverId, roster_id: rosterId, group_id: groupId })
})

const updateAutomation = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const serverId = yield* requireServerId(input)
  const id = input.params.automationId ?? ""
  const locked = yield* database("Unable to lock roster automation", sql`SELECT automation_id FROM roster_automation_rules
    WHERE automation_id = ${id} AND server_id = ${serverId} FOR UPDATE`)
  if (locked.length !== 1) return yield* new NotFound({ message: "Automation rule not found" })
  const current = (yield* loadAutomations(sql, serverId, { automationId: id }))[0]
  if (current === undefined) return yield* new NotFound({ message: "Automation rule not found" })
  if (body.scheduled_at !== undefined && !validScheduledAt(body.scheduled_at)) {
    return yield* new InvalidRequest({ message: "scheduled_at must be an RFC3339 timestamp" })
  }
  const targets = yield* lockAutomationTargets(sql, serverId,
    body.roster_id === undefined ? current.roster_id : body.roster_id,
    body.group_id === undefined ? current.group_id : body.group_id)
  const rows = yield* database("Unable to update roster automation", sql<AutomationRow>`
    UPDATE roster_automation_rules SET
      roster_id = ${targets.rosterId}::uuid,
      group_id = ${targets.groupId},
      action_type = ${String(body.action_type ?? current.action_type)},
      trigger_type = ${String(body.trigger_type ?? current.trigger_type)},
      scheduled_at = ${body.scheduled_at === undefined ? current.scheduled_at : body.scheduled_at}::timestamptz,
      discord_channel_id = ${body.discord_channel_id === undefined ? current.discord_channel_id : body.discord_channel_id},
      ping_type = ${body.options === undefined ? current.ping_type : isRecord(body.options) ? body.options.ping_type ?? null : null},
      enabled = ${body.active === undefined ? current.active : body.active},
      updated_at = now()
    WHERE automation_id = ${id} AND server_id = ${serverId}
    RETURNING automation_id, server_id, roster_id::text, group_id, action_type,
      trigger_type, scheduled_at, discord_channel_id, ping_type, enabled AS active, executed,
      executed_at, last_triggered_at, execution_status, last_missed_at, created_at, updated_at
  `)
  return json({ message: "Automation updated", rule: automationJson(rows[0] ?? current) })
})

const deleteAutomation = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const rows = yield* database("Unable to delete roster automation", sql<{ readonly automation_id: string }>`
    DELETE FROM roster_automation_rules
    WHERE automation_id = ${input.params.automationId ?? ""} AND server_id = ${serverId}
    RETURNING automation_id
  `)
  if (rows.length === 0) return yield* new NotFound({ message: "Automation rule not found" })
  return json({ message: "Automation rule deleted" })
})

interface ViewRow {
  readonly created_at: Date | string
  readonly created_by_discord_user_id: string
  readonly id: string
  readonly name: string
  readonly server_id: string
  readonly share_id: string
  readonly source_code: string
  readonly source_version: number
  readonly updated_at: Date | string
}

export const viewJson = (row: ViewRow) => ({
  id: row.id, shareId: row.share_id, serverId: row.server_id, name: row.name,
  sourceCode: row.source_code, sourceVersion: row.source_version,
  createdBy: row.created_by_discord_user_id, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
})

export const loadViews = (sql: SqlClient.SqlClient, serverId?: string, viewId?: string, shareId?: string) => database(
  "Unable to load roster views",
  sql<ViewRow>`
    SELECT id::text, share_id, server_id, name, source_code, source_version,
      created_by_discord_user_id, created_at, updated_at
    FROM roster_views
    WHERE (${serverId ?? null}::text IS NULL OR server_id = ${serverId ?? null})
      AND (${viewId ?? null}::uuid IS NULL OR id = ${viewId ?? null}::uuid)
      AND (${shareId ?? null}::text IS NULL OR share_id = ${shareId ?? null})
    ORDER BY updated_at DESC
  `,
)

const listViews = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  return json((yield* loadViews(sql, serverId)).map(viewJson))
})

const getView = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const row = (yield* loadViews(sql, serverId, input.params.viewId))[0]
  if (row === undefined) return yield* new NotFound({ message: "Roster view not found" })
  return json(viewJson(row))
})

const sharedView = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const shareId = input.params.viewId ?? ""
  if (!/^[A-Za-z0-9_-]{10,16}$/u.test(shareId)) return yield* new InvalidRequest({ message: "Invalid shareId" })
  const row = (yield* loadViews(sql, undefined, undefined, shareId))[0]
  if (row === undefined) return yield* new NotFound({ message: "Roster view not found" })
  return json(viewJson(row))
})

const viewWrite = (body: Record<string, unknown>) => Effect.gen(function* () {
  const name = yield* requireString(body.name, "name")
  const sourceCode = yield* requireString(body.sourceCode, "sourceCode")
  if (name.length > 80 || sourceCode.length > 65_536 || body.sourceVersion !== 1) {
    return yield* new InvalidRequest({ message: "Saved roster views require name, sourceCode, and sourceVersion 1" })
  }
  return { name, sourceCode, sourceVersion: 1 }
})

const createView = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const write = yield* viewWrite(body)
  const serverId = yield* requireServerId(input)
  if (input.principal?.kind !== "user") return yield* new Forbidden({ message: "A Discord identity is required for roster management" })
  const creator = yield* database("Unable to resolve Discord identity", sql<{ readonly user_id: string }>`
    SELECT user_id FROM auth_users WHERE user_id = ${input.principal.userId} AND provider = 'discord'
  `)
  if (creator.length === 0) return yield* new Forbidden({ message: "A Discord identity is required for roster management" })
  const rows = yield* database("Unable to create roster view", sql<ViewRow>`
    INSERT INTO roster_views (server_id, name, source_code, source_version, created_by_discord_user_id)
    VALUES (${serverId}, ${write.name}, ${write.sourceCode}, ${write.sourceVersion}, ${input.principal.userId})
    RETURNING id::text, share_id, server_id, name, source_code, source_version,
      created_by_discord_user_id, created_at, updated_at
  `)
  const row = rows[0]
  if (row === undefined) return yield* new DatabaseFailure({ cause: "missing RETURNING row", message: "Unable to create roster view" })
  return json(viewJson(row), 201)
})

const updateView = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const write = yield* viewWrite(yield* decodeJson(input.request))
  const serverId = yield* requireServerId(input)
  const rows = yield* database("Unable to update roster view", sql<ViewRow>`
    UPDATE roster_views SET name = ${write.name}, source_code = ${write.sourceCode},
      source_version = ${write.sourceVersion}, updated_at = now()
    WHERE id = ${input.params.viewId ?? ""}::uuid AND server_id = ${serverId}
    RETURNING id::text, share_id, server_id, name, source_code, source_version,
      created_by_discord_user_id, created_at, updated_at
  `)
  const row = rows[0]
  if (row === undefined) return yield* new NotFound({ message: "Roster view not found" })
  return json(viewJson(row))
})

const deleteView = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const rows = yield* database("Unable to delete roster view", sql<{ readonly id: string }>`
    DELETE FROM roster_views WHERE id = ${input.params.viewId ?? ""}::uuid AND server_id = ${serverId}
    RETURNING id::text
  `)
  if (rows.length === 0) return yield* new NotFound({ message: "Roster view not found" })
  return new Response(null, { status: 204 })
})

interface Question {
  readonly id: string
  readonly label: string
  readonly options: ReadonlyArray<string>
  readonly order: number
  readonly required: boolean
  readonly type: "boolean" | "single_select" | "text"
}

const questionsFrom = (value: unknown): ReadonlyArray<Question> => {
  if (!Array.isArray(value)) return []
  const questions: Question[] = []
  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.label !== "string"
      || !["text", "boolean", "single_select"].includes(String(item.type))) continue
    questions.push({
      id: item.id, label: item.label, type: item.type as Question["type"],
      options: stringArray(item.options), order: typeof item.order === "number" ? item.order : index, required: item.required === true,
    })
  }
  return questions
}

const questionnaire = (questions: ReadonlyArray<Question>) => ({
  accountSelector: { id: "account", type: "account", required: true }, questions,
})

const putQuestionnaire = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const serverId = yield* requireServerId(input)
  const rosterId = input.url.searchParams.get("roster_id") ?? ""
  const questions = questionsFrom(body.questions).map((question, order) => ({ ...question, order }))
  if (!Array.isArray(body.questions) || questions.length !== body.questions.length || questions.length > 4
    || new Set(questions.map((question) => question.id)).size !== questions.length
    || questions.some((question) => !/^[a-z][a-z0-9_]{0,47}$/u.test(question.id)
      || question.id === "account" || question.label.trim().length === 0 || new TextEncoder().encode(question.label).length > 160
      || question.type === "single_select" && (question.options.length < 1 || question.options.length > 20)
      || question.type !== "single_select" && question.options.length !== 0)) {
    return yield* new InvalidRequest({ message: "A questionnaire requires up to four valid unique questions" })
  }
  yield* database("Unable to lock roster questionnaire", sql`SELECT id FROM rosters WHERE id = ${rosterId}::uuid AND server_id = ${serverId} FOR UPDATE`)
  const roster = (yield* loadRosters(sql, { serverId, rosterId }))[0]
  if (roster === undefined) return yield* new NotFound({ message: "Roster not found" })
  const previous = questionsFrom(roster.signup_questions)
  const incompatible = previous.filter((old) => {
    const next = questions.find((question) => question.id === old.id)
    return next === undefined || next.type !== old.type
  }).map((question) => question.id)
  const affected = incompatible.length === 0 ? [] : yield* database("Unable to clear incompatible roster answers", sql<{ readonly tag: string }>`
    UPDATE roster_members SET signup_answers = signup_answers - ${incompatible}::text[]
    WHERE roster_id = ${rosterId}::uuid AND signup_answers ?| ${incompatible}::text[]
    RETURNING tag
  `)
  yield* database("Unable to update roster questionnaire", sql`
    UPDATE rosters SET signup_questions = ${JSON.stringify(questions)}::jsonb, updated_at = now()
    WHERE id = ${rosterId}::uuid AND server_id = ${serverId}
  `)
  return json({ questionnaire: questionnaire(questions), affectedMemberCount: affected.length })
})

const signupForm = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const row = (yield* loadRosters(sql, { serverId, rosterId: input.params.rosterId ?? "" }))[0]
  if (row === undefined) return yield* new NotFound({ message: "Roster not found" })
  return json(questionnaire(questionsFrom(row.signup_questions)))
})

interface PreparedSignupIdentity {
  readonly ownerId: string
  readonly username: string
  readonly avatarUrl: string
  readonly player?: ReturnType<typeof rosterPlayerSnapshot>
}

const requireSignupOwner = (ownerId: string | undefined, input: DashboardRosterOperationInput, body: Record<string, unknown>) => {
  if (ownerId === undefined) return Effect.fail(new Forbidden({ message: "Selected account is not linked" }))
  if (input.principal?.kind === "user" && ownerId !== input.principal.userId
    || input.principal?.kind === "bot" && body.discordUserId !== undefined && body.discordUserId !== ownerId) {
    return Effect.fail(new Forbidden({ message: "Discord user does not own the selected account" }))
  }
  return Effect.succeed(ownerId)
}

const prepareSignupIdentity = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request.clone())
  const serverId = yield* requireServerId(input)
  const tag = normalizeTag(yield* requireString(body.playerTag, "playerTag"))
  const link = (yield* database("Unable to load account ownership", sql<{ user_id: string | null }>`SELECT user_id FROM player_links WHERE tag = ${tag}`))[0]
  const ownerId = yield* requireSignupOwner(link?.user_id ?? undefined, input, body)
  const existing = (yield* database("Unable to load existing signup", sql<{ discord_username: string | null; discord_avatar_url: string | null }>`
    SELECT member.discord_username, member.discord_avatar_url FROM roster_members member JOIN rosters roster ON roster.id = member.roster_id
    WHERE roster.id = ${input.params.rosterId ?? ""}::uuid AND roster.server_id = ${serverId} AND member.tag = ${tag}
  `))[0]
  let username = stringValue(body.discordUsername) ?? "", avatarUrl = stringValue(body.discordAvatarUrl) ?? ""
  if (input.principal?.kind === "user" || username.length === 0 || existing === undefined) {
    username = existing?.discord_username ?? ""
    avatarUrl = existing?.discord_avatar_url ?? ""
    const identity = yield* loadDiscordIdentity(serverId, ownerId).pipe(Effect.catchTag("NotFound", () => existing === undefined
      ? Effect.fail(new Forbidden({ message: "You must belong to the Discord server to join its roster" })) : Effect.succeed(undefined)))
    if (identity !== undefined) { username = identity.username; avatarUrl = identity.avatarUrl }
  }
  const player = existing === undefined ? rosterPlayerSnapshot(yield* loadRosterClashPlayer(input.bindings, tag)) : undefined
  return { ownerId, username, avatarUrl, ...(player === undefined ? {} : { player }) }
})

export const assertSignupEligibility = (sql: SqlClient.SqlClient,
  roster: Pick<RosterRow, "min_townhall" | "max_townhall" | "signup_scope" | "clan_tag" | "server_id">,
  player: ReturnType<typeof rosterPlayerSnapshot>) => Effect.gen(function* () {
  const minimum = roster.min_townhall, maximum = roster.max_townhall
  if (!Number.isInteger(player.townhall) || player.townhall <= 0
    || minimum !== null && (!Number.isInteger(minimum) || minimum <= 0)
    || maximum !== null && (!Number.isInteger(maximum) || maximum <= 0)
    || minimum !== null && maximum !== null && minimum > maximum) {
    return yield* new Conflict({ message: "Roster Town Hall eligibility is not configured correctly", reason: "invalid_configuration" })
  }
  if (minimum !== null && player.townhall < minimum || maximum !== null && player.townhall > maximum) {
    return yield* new Forbidden({ message: "Selected account does not meet the roster Town Hall limits" })
  }
  if (roster.signup_scope === "clan-only") {
    if (roster.clan_tag === null || roster.clan_tag === "") return yield* new Conflict({ message: "Roster clan must be configured before signup", reason: "invalid_configuration" })
    if (player.current_clan_tag !== roster.clan_tag) return yield* new Forbidden({ message: "Selected account must belong to the roster clan" })
  } else if (roster.signup_scope === "family-wide") {
    const clan = yield* database("Unable to check roster family membership", sql`SELECT tag FROM server_clans
      WHERE server_id = ${roster.server_id} AND tag = ${player.current_clan_tag}`)
    if (clan.length === 0) return yield* new Forbidden({ message: "Selected account must belong to a server family clan" })
  } else return yield* new Conflict({ message: "Roster signup scope is invalid", reason: "invalid_configuration" })
})

const submitSignup = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput, identity: PreparedSignupIdentity | undefined) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const serverId = yield* requireServerId(input)
  const rosterId = input.params.rosterId ?? ""
  const tag = normalizeTag(yield* requireString(body.playerTag, "playerTag"))
  if (input.principal?.kind === "user") {
    const user = yield* database("Unable to lock signup actor", sql`SELECT user_id FROM auth_users WHERE user_id = ${input.principal.userId} FOR SHARE`)
    if (user.length === 0) return yield* new Forbidden({ message: "Signup actor is no longer active" })
  }
  const owners = yield* lockRosterAdmissionOwners(sql, [tag], input.principal?.kind === "user" ? [input.principal.userId] : [])
  const ownerId = yield* requireSignupOwner(owners.get(tag), input, body)
  if (identity === undefined || identity.ownerId !== ownerId) return yield* new Conflict({ message: "Account ownership changed during signup; retry" })
  yield* lockRosterMembership(sql, serverId, [rosterId])
  const roster = (yield* loadRosters(sql, { serverId, rosterId }))[0]
  if (roster === undefined) return yield* new NotFound({ message: "Roster not found" })
  const questions = questionsFrom(roster.signup_questions)
  const answers = isRecord(body.answers) ? body.answers : {}
  if (Object.keys(answers).some((key) => !questions.some((question) => question.id === key))) {
    return yield* new InvalidRequest({ message: "Unknown roster answer key" })
  }
  for (const question of questions) {
    const value = answers[question.id]
    if (question.required && (value === undefined || value === null || question.type !== "boolean" && String(value).trim().length === 0)) {
      return yield* new InvalidRequest({ message: `Missing required roster answer: ${question.id}` })
    }
    if (value !== undefined && (question.type === "boolean" ? typeof value !== "boolean"
      : question.type === "text" ? typeof value !== "string"
      : typeof value !== "string" || !question.options.includes(value))) {
      return yield* new InvalidRequest({ message: `Invalid answer for roster question: ${question.id}` })
    }
  }
  const existing = yield* database("Unable to check existing signup", sql`SELECT tag FROM roster_members WHERE roster_id = ${rosterId}::uuid AND tag = ${tag}`)
  if (existing.length === 0) {
    if (identity.player === undefined) return yield* new Conflict({ message: "Roster membership changed during signup; retry" })
    yield* assertSignupEligibility(sql, roster, identity.player)
  }
  const player = identity.player
  const rows = existing.length > 0 ? yield* database("Unable to update roster signup", sql<{ readonly signup_answers: unknown }>`
    UPDATE roster_members SET signup_answers = ${JSON.stringify(answers)}::jsonb, discord_user_id = ${ownerId},
      discord_username = NULLIF(${identity.username}, ''), discord_avatar_url = NULLIF(${identity.avatarUrl}, '')
    WHERE roster_id = ${rosterId}::uuid AND tag = ${tag} RETURNING signup_answers
  `) : yield* database("Unable to submit roster signup", sql<{ readonly signup_answers: unknown }>`
    INSERT INTO roster_members (
      roster_id, tag, name, townhall, trophies, current_clan_tag, current_clan_name,
      signup_answers, discord_user_id, discord_username, discord_avatar_url, refreshed_at, hero_level_sum, max_percent, league_id, league_name
    ) VALUES (${rosterId}::uuid, ${tag}, ${player?.name}, ${player?.townhall},
      ${player?.trophies}, NULLIF(${player?.current_clan_tag}, ''), NULLIF(${player?.current_clan}, ''), ${JSON.stringify(answers)}::jsonb,
      ${ownerId}, NULLIF(${identity.username}, ''), NULLIF(${identity.avatarUrl}, ''), ${player?.refreshed_at}::timestamptz,
      ${player?.hero_level_sum}, ${player?.max_percent}, ${player?.league_id ?? null}, ${player?.league_name ?? null})
    RETURNING signup_answers
  `)
  if (rows.length === 0) return yield* new NotFound({ message: "Selected account snapshot is unavailable" })
  yield* assertRosterMembershipLimits(sql, [rosterId], existing.length === 0 ? [ownerId] : [])
  yield* database("Unable to revise signup roster", sql`UPDATE rosters SET revision = revision + 1, updated_at = now() WHERE id = ${rosterId}::uuid`)
  const now = new Date().toISOString()
  return json({ submission: { id: `${rosterId}:${tag}`, rosterId, playerTag: tag, answers: rows[0]?.signup_answers ?? {}, createdAt: now, updatedAt: now } }, 201)
})

const builderMissingMembers = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const rosterId = input.params.rosterId ?? ""
  const row = (yield* loadRosters(sql, { serverId, rosterId }))[0]
  if (row === undefined) return yield* new NotFound({ message: "Roster not found" })
  if (row.clan_tag === null) return json({ code: "conflict", message: "Roster clan is not configured" }, 409)
  const members = yield* loadMembers(sql, rosterId)
  const items = members.filter((member) => member.current_clan_tag !== row.clan_tag).map((member) => ({
    playerTag: member.tag, playerName: member.name, townhall: member.townhall, trophies: member.trophies,
    clanTag: member.current_clan_tag, clanName: member.current_clan_name, discordUserId: member.discord_user_id,
  }))
  return json({ items, count: items.length })
})

const builderRosterJson = (row: RosterRow, members: ReadonlyArray<RosterMemberRow>) => ({
  minTownhall: row.min_townhall, maxTownhall: row.max_townhall,
  id: row.id, serverId: row.server_id, alias: row.alias, description: row.description,
  clanTag: row.clan_tag, displayColumnIds: row.display_column_ids ?? [],
  publicShareId: row.public_share_id, refreshedAt: row.last_refreshed_at === null ? null : iso(row.last_refreshed_at),
  sortConfiguration: row.sort_configuration ?? [], webhookId: row.webhook_id, messageId: row.message_id,
  questionnaire: questionnaire(questionsFrom(row.signup_questions)), memberCount: members.length,
  revision: Number(row.revision), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
})

const listBuilderRosters = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const rows = yield* loadRosters(sql, { serverId })
  const items = yield* Effect.forEach(rows, (row) => loadMembers(sql, row.id).pipe(Effect.map((members) => builderRosterJson(row, members))))
  return json({ items })
})

const getBuilderRoster = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const row = (yield* loadRosters(sql, { serverId, rosterId: input.params.rosterId ?? "" }))[0]
  if (row === undefined) return yield* new NotFound({ message: "Roster not found" })
  const members = yield* loadMembers(sql, row.id)
  return json({ roster: { ...builderRosterJson(row, members), members: members.map(builderMemberJson) } })
})

const publicRoster = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const rows = yield* database("Unable to load public roster", sql<{
    readonly id: string; readonly public_share_id: string; readonly alias: string;
    readonly description: string | null; readonly clan_name: string | null;
    readonly min_townhall: number | null; readonly max_townhall: number | null;
    readonly clan_tag: string | null; readonly badge_token: string | null; readonly updated_at: Date | string;
  }>`
    SELECT roster.id::text, roster.public_share_id, roster.alias, NULLIF(roster.description, '') AS description,
      clan.name AS clan_name, roster.clan_tag, clan.badge_token, roster.updated_at, roster.min_townhall, roster.max_townhall
    FROM rosters roster LEFT JOIN basic_clan clan ON clan.tag = roster.clan_tag
    WHERE roster.public_share_id = ${input.params.publicShareId ?? ""} AND roster.public_enabled
  `)
  const row = rows[0]
  if (row === undefined) return yield* new NotFound({ message: "Public roster not found" })
  const members = (yield* loadMembers(sql, row.id)).map((member) => ({
    playerTag: member.tag, name: member.name, townhall: member.townhall,
    refreshedAt: member.refreshed_at === null ? null : iso(member.refreshed_at),
    ...optional("currentClanName", member.current_clan_name), ...optional("currentClanTag", member.current_clan_tag),
  }))
  return Response.json({
    id: row.public_share_id, name: row.alias, updatedAt: iso(row.updated_at), members,
    minTownhall: row.min_townhall, maxTownhall: row.max_townhall,
    ...optional("description", row.description), ...optional("clanName", row.clan_name),
    ...optional("clanTag", row.clan_tag),
    ...optional("clanBadgeUrl", row.badge_token === null ? null : `https://badges.clashk.ing/512/${row.badge_token.replace(/\.png$/u, "")}.png`),
  }, { headers: { "cache-control": "public, max-age=60" } })
})

interface MembershipChange {
  readonly action: "add" | "move" | "remove"
  readonly fromRosterId: string
  readonly playerTag: string
  readonly reason: string
  readonly toRosterId: string
}

class RosterConflict extends Data.TaggedError("RosterConflict")<{ readonly message: string }> {}

const readChanges = (value: unknown) => Effect.gen(function* () {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1000) {
    return yield* new InvalidRequest({ message: "Membership proposals require 1 to 1000 changes" })
  }
  const changes: MembershipChange[] = []
  for (const item of value) {
    if (!isRecord(item) || !["add", "move", "remove"].includes(String(item.action)) || typeof item.playerTag !== "string") {
      return yield* new InvalidRequest({ message: "Membership action must be add, remove, or move and requires playerTag" })
    }
    const change: MembershipChange = {
      action: item.action as MembershipChange["action"], playerTag: normalizeTag(item.playerTag),
      fromRosterId: stringValue(item.fromRosterId) ?? "", toRosterId: stringValue(item.toRosterId) ?? "",
      reason: [...(stringValue(item.reason) ?? "")].slice(0, 80).join(""),
    }
    if (change.playerTag.length === 0 || change.action === "add" && (change.fromRosterId !== "" || change.toRosterId === "")
      || change.action === "remove" && (change.fromRosterId === "" || change.toRosterId !== "")
      || change.action === "move" && (change.fromRosterId === "" || change.toRosterId === "" || change.fromRosterId === change.toRosterId)) {
      return yield* new InvalidRequest({ message: "Membership change has invalid source or destination" })
    }
    changes.push(change)
  }
  const keys = changes.map((change) => `${change.action}|${change.playerTag}|${change.fromRosterId}|${change.toRosterId}`)
  if (new Set(keys).size !== keys.length) return yield* new InvalidRequest({ message: "Membership proposal contains a duplicate change" })
  return changes
})

const membershipContext = (sql: SqlClient.SqlClient, serverId: string, rosterIds: ReadonlyArray<string>) => Effect.gen(function* () {
  if (rosterIds.length < 1 || rosterIds.length > 25 || rosterIds.some((id) => !uuidPattern.test(id))) {
    return yield* new InvalidRequest({ message: "Proposal rosterIds must contain 1 to 25 UUIDs" })
  }
  const rows = yield* database("Unable to load membership context", sql<{ readonly id: string; readonly alias: string; readonly revision: number | string }>`
    SELECT id::text, alias, revision FROM rosters WHERE server_id = ${serverId} AND id = ANY(${rosterIds}::uuid[])
  `)
  if (rows.length !== rosterIds.length) return yield* new InvalidRequest({ message: "One or more proposal rosters are not attached to this server" })
  const memberships = new Map<string, Set<string>>()
  for (const row of rows) memberships.set(row.id, new Set((yield* loadMembers(sql, row.id)).map((member) => member.tag)))
  return { rows, memberships }
})

const membershipConflict = (changes: ReadonlyArray<MembershipChange>, memberships: ReadonlyMap<string, ReadonlySet<string>>): string | undefined => {
  for (const change of changes) {
    if (change.fromRosterId !== "" && !memberships.has(change.fromRosterId)
      || change.toRosterId !== "" && !memberships.has(change.toRosterId)) return "Membership change references an unattached roster"
    if (change.action !== "add" && !memberships.get(change.fromRosterId)?.has(change.playerTag)) return "Player is not in the source roster"
    if (change.action !== "remove" && memberships.get(change.toRosterId)?.has(change.playerTag)) return "Player is already in the destination roster"
  }
  return undefined
}

const validateMembershipChanges = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const { serverId, rosterIds } = yield* requireRosterBatch(body)
  const changes = yield* readChanges(body.changes)
  const { rows, memberships } = yield* membershipContext(sql, serverId, rosterIds)
  const conflict = membershipConflict(changes, memberships)
  if (conflict !== undefined) return json({ code: "conflict", message: conflict }, 409)
  const affected = new Set(changes.flatMap((change) => [change.fromRosterId, change.toRosterId]).filter(Boolean))
  const aliases = new Map(rows.map((row) => [row.id, row.alias]))
  const expectedRevisions = Object.fromEntries(rows.filter((row) => affected.has(row.id)).map((row) => [row.id, Number(row.revision)]))
  const counts = { add: 0, move: 0, remove: 0 }
  for (const change of changes) counts[change.action] += 1
  return json({
    type: "membershipProposal", changes, expectedRevisions, generatedAt: new Date().toISOString(), counts,
    items: changes.map((change) => ({
      action: change.action, playerTag: change.playerTag, fromRoster: aliases.get(change.fromRosterId) ?? "",
      toRoster: aliases.get(change.toRosterId) ?? "", reason: change.reason,
    })),
  })
})

const applyMembershipChanges = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const serverId = yield* requireString(body.serverId, "serverId")
  const changes = yield* readChanges(body.changes)
  const rosterIds = [...new Set(changes.flatMap((change) => [change.fromRosterId, change.toRosterId]).filter(Boolean))].sort()
  const expected = isRecord(body.expectedRevisions) ? body.expectedRevisions : {}
  if (Object.keys(expected).length !== rosterIds.length || rosterIds.some((id) => typeof expected[id] !== "number")) {
    return yield* new InvalidRequest({ message: "Expected revisions must exactly cover every affected roster" })
  }
  const { rows, memberships } = yield* membershipContext(sql, serverId, rosterIds)
  const conflict = membershipConflict(changes, memberships)
  if (conflict !== undefined) return json({ code: "conflict", message: conflict }, 409)
  if (rows.some((row) => Number(row.revision) !== expected[row.id])) {
    return json({ code: "conflict", message: "Roster data has changed since this proposal was created" }, 409)
  }
  return yield* sql.withTransaction(Effect.gen(function* () {
    const admissions = changes.filter((change) => change.action !== "remove")
    const owners = yield* lockRosterAdmissionOwners(sql, admissions.map((change) => change.playerTag))
    const locked = yield* lockRosterMembership(sql, serverId, rosterIds)
    if (locked.length !== rosterIds.length || locked.some((row) => Number(row.revision) !== expected[row.id])) {
      return yield* new RosterConflict({ message: "Roster data has changed since this proposal was created" })
    }
    for (const change of changes) {
      if (change.action === "add") {
        const inserted = yield* sql<{ readonly tag: string }>`
          INSERT INTO roster_members (roster_id, tag, name, townhall, trophies, current_clan_tag, position)
          SELECT ${change.toRosterId}::uuid, player.tag, player.name, player.townhall_level, player.trophies, player.clan_tag,
            COALESCE((SELECT max(position) + 1 FROM roster_members WHERE roster_id = ${change.toRosterId}::uuid), 0)
          FROM basic_player player WHERE player.tag = ${change.playerTag} RETURNING tag
        `
        if (inserted.length !== 1) return yield* new RosterConflict({ message: "Approved add account snapshot is unavailable" })
      } else if (change.action === "move") {
        const inserted = yield* sql<{ readonly tag: string }>`
          INSERT INTO roster_members (roster_id, tag, name, townhall, trophies, current_clan_name, current_clan_tag,
            war_preference, discord_user_id, discord_username, discord_avatar_url, last_online, position,
            is_in_family, member_status, signup_answers, league_id, league_name, hero_level_sum, max_percent, refreshed_at)
          SELECT ${change.toRosterId}::uuid, tag, name, townhall, trophies, current_clan_name, current_clan_tag,
            war_preference, discord_user_id, discord_username, discord_avatar_url, last_online,
            COALESCE((SELECT max(position) + 1 FROM roster_members WHERE roster_id = ${change.toRosterId}::uuid), 0),
            is_in_family, member_status, signup_answers, league_id, league_name, hero_level_sum, max_percent, refreshed_at
          FROM roster_members WHERE roster_id = ${change.fromRosterId}::uuid AND tag = ${change.playerTag} RETURNING tag
        `
        if (inserted.length !== 1) return yield* new RosterConflict({ message: "Approved move no longer matches roster state" })
      }
      if (change.action !== "add") {
        const removed = yield* sql<{ readonly tag: string }>`DELETE FROM roster_members WHERE roster_id = ${change.fromRosterId}::uuid AND tag = ${change.playerTag} RETURNING tag`
        if (removed.length !== 1) return yield* new RosterConflict({ message: "Approved remove no longer matches roster state" })
      }
    }
    for (const destination of new Set(admissions.map((change) => change.toRosterId))) {
      const affectedOwners = admissions.flatMap((change) => {
        const owner = owners.get(change.playerTag)
        return change.toRosterId === destination && owner !== undefined ? [owner] : []
      })
      yield* assertRosterMembershipLimits(sql, [destination], affectedOwners)
    }
    const revised = yield* sql<{ readonly id: string; readonly revision: number | string }>`
      UPDATE rosters SET revision = revision + 1, updated_at = now()
      WHERE id = ANY(${rosterIds}::uuid[]) RETURNING id::text, revision
    `
    return json({ applied: true, changeCount: changes.length, revisions: Object.fromEntries(revised.map((row) => [row.id, Number(row.revision)])) })
  })).pipe(
    Effect.catchTag("RosterConflict", (conflict) => Effect.succeed(json({ code: "conflict", message: conflict.message }, 409))),
    Effect.catchTag("Conflict", (conflict) => Effect.succeed(json({ code: "conflict", message: conflict.message }, 409))),
    Effect.mapError((cause) => cause instanceof NotFound || cause instanceof InvalidRequest || cause instanceof DatabaseFailure
      ? cause : new DatabaseFailure({ cause, message: "Unable to apply roster membership changes" })),
  )
})



const DiscordMember = Schema.Struct({
  avatar: Schema.optionalKey(Schema.NullOr(Schema.String)),
  user: Schema.Struct({ id: Schema.String, username: Schema.String, avatar: Schema.NullOr(Schema.String) }),
})

export const loadDiscordIdentity = (serverId: string, userId: string) => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const raw = yield* discord.request(`/guilds/${serverId}/members/${userId}`)
  const member = yield* Schema.decodeUnknownEffect(DiscordMember)(raw).pipe(
    Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Discord member response failed validation" })),
  )
  if (member.user.id !== userId) return yield* new UpstreamUnavailable({ cause: "Discord identity mismatch", message: "Discord member response did not match the requested user" })
  const hash = member.avatar ?? member.user.avatar
  const avatarUrl = hash === null
    ? `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(userId) >> 22n) % 6n)}.png`
    : member.avatar !== undefined && member.avatar !== null
      ? `https://cdn.discordapp.com/guilds/${serverId}/users/${userId}/avatars/${hash}.png`
      : `https://cdn.discordapp.com/avatars/${userId}/${hash}.png`
  return { username: member.user.username, avatarUrl }
})

const refreshDiscordIdentity = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const body = yield* decodeJson(input.request)
  const serverId = yield* requireServerId(input)
  const rosterId = input.params.rosterId ?? ""
  const playerTag = normalizeTag(yield* requireString(body.playerTag, "playerTag"))
  const link = (yield* database("Unable to resolve roster Discord identity", sql<{ readonly user_id: string }>`
    SELECT links.user_id FROM roster_members member
    JOIN rosters roster ON roster.id = member.roster_id
    JOIN player_links links ON links.tag = member.tag
    WHERE member.roster_id = ${rosterId}::uuid AND roster.server_id = ${serverId} AND member.tag = ${playerTag}
  `))[0]
  if (link === undefined) return yield* new NotFound({ message: "Roster member has no linked Discord user" })
  const { username, avatarUrl } = yield* loadDiscordIdentity(serverId, link.user_id)
  yield* database("Unable to save roster Discord identity", sql`
    UPDATE roster_members SET discord_user_id = ${link.user_id}, discord_username = ${username},
      discord_avatar_url = ${avatarUrl} WHERE roster_id = ${rosterId}::uuid AND tag = ${playerTag}
  `)
  return json({ playerTag, discordUserId: link.user_id, discordUsername: username, discordAvatarUrl: avatarUrl })
})

const ClanSnapshot = Schema.Struct({
  tag: Schema.String, name: Schema.String,
  memberList: Schema.Array(Schema.Struct({
    tag: Schema.String, name: Schema.String, townHallLevel: Schema.Number, role: Schema.String, trophies: Schema.Number,
  })),
})

const loadClanSnapshot = (bindings: WorkerBindings, tag: string) => Effect.tryPromise({
  try: () => bindings.CLASH_PROXY.fetch(new Request(`http://clash-proxy.internal/v1/clans/${encodeURIComponent(tag)}`, { signal: AbortSignal.timeout(15_000) })),
  catch: (cause) => new UpstreamUnavailable({ cause, message: "Clash clan lookup failed" }),
}).pipe(Effect.flatMap((response) => response.ok
  ? Effect.tryPromise({ try: () => response.json() as Promise<unknown>, catch: (cause) => new UpstreamUnavailable({ cause, message: "Clash clan response is invalid" }) })
  : Effect.fail(new UpstreamUnavailable({ cause: new Error(`Clash returned ${response.status}`), message: "Clash clan lookup failed" }))),
Effect.flatMap(Schema.decodeUnknownEffect(ClanSnapshot)),
Effect.mapError((cause) => cause instanceof UpstreamUnavailable ? cause : new UpstreamUnavailable({ cause, message: "Clash clan response failed validation" })))

const serverClanMembers = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const clans = yield* database("Unable to load server clans", sql<{ readonly clan_tag: string }>`SELECT tag AS clan_tag FROM server_clans WHERE server_id = ${serverId}`)
  const members: Array<{ tag: string; name: string; clan_tag: string; clan_name: string; townhall: number; role: string; trophies: number }> = []
  for (const clan of clans) {
    const snapshot = yield* loadClanSnapshot(input.bindings, clan.clan_tag)
    members.push(...snapshot.memberList.map((member) => ({
      tag: member.tag, name: member.name, clan_tag: snapshot.tag, clan_name: snapshot.name,
      townhall: member.townHallLevel, role: member.role, trophies: member.trophies,
    })))
  }
  members.sort((left, right) => left.name.toLowerCase().localeCompare(right.name.toLowerCase()))
  return json({ members, count: members.length })
})

const missingMembers = (sql: SqlClient.SqlClient, input: DashboardRosterOperationInput) => Effect.gen(function* () {
  const serverId = yield* requireServerId(input)
  const rosterId = input.url.searchParams.get("roster_id") ?? ""
  const groupId = input.url.searchParams.get("group_id") ?? ""
  if (rosterId.length === 0 && groupId.length === 0) return yield* new InvalidRequest({ message: "Must provide roster_id or group_id" })
  const rosters = yield* loadRosters(sql, { serverId, ...(rosterId.length > 0 ? { rosterId } : { groupId }) })
  if (rosters.length === 0) return yield* new NotFound({ message: "No rosters found" })
  const results: Array<Record<string, unknown>> = []
  for (const roster of rosters) {
    if (roster.clan_tag === null) {
      results.push({ state: "error", missing_members: [], error_message: "Roster clan is not configured" })
      continue
    }
    const clan = yield* loadClanSnapshot(input.bindings, roster.clan_tag)
    const registered = new Set((yield* loadMembers(sql, roster.id)).map((member) => member.tag))
    const missing = clan.memberList.filter((member) => !registered.has(member.tag)).map((member) => ({
      tag: member.tag, name: member.name, townhall: member.townHallLevel, role: member.role, trophies: member.trophies,
    }))
    results.push({
      state: "ok", roster_info: { roster_id: roster.id, alias: roster.alias, clan_tag: clan.tag, clan_name: clan.name, registered_count: registered.size },
      missing_members: missing, summary: { total_missing: missing.length, total_clan_members: clan.memberList.length,
        coverage_percentage: clan.memberList.length === 0 ? 0 : (clan.memberList.length - missing.length) / clan.memberList.length * 100 },
    })
  }
  return json({ query_type: rosterId.length > 0 ? "roster" : "group", query_value: rosterId || groupId, results, total_rosters_checked: results.length })
})

const matchRoute = (request: Request): RouteMatch | undefined => {
  const pathParts = new URL(request.url).pathname.split("/").filter(Boolean)
  for (const route of routes) {
    if (route.method !== request.method) continue
    const routeParts = route.path.split("/").filter(Boolean)
    if (routeParts.length !== pathParts.length) continue
    const params: Record<string, string> = {}
    let matched = true
    for (let index = 0; index < routeParts.length; index += 1) {
      const expected = routeParts[index] ?? ""
      const actual = pathParts[index] ?? ""
      if (expected.startsWith(":")) params[expected.slice(1)] = decodeURIComponent(actual)
      else if (expected !== actual) {
        matched = false
        break
      }
    }
    if (matched) return { route, params }
  }
  return undefined
}

const BatchRequest = Schema.Struct({
  serverId: Schema.String,
  rosterIds: Schema.Array(Schema.String),
  fields: Schema.optionalKey(Schema.Array(Schema.String)),
})

const MembershipProposalRequest = Schema.Struct({
  serverId: Schema.String,
  rosterIds: Schema.Array(Schema.String),
  changes: Schema.Array(Schema.Struct({
    action: Schema.Literals(["add", "remove", "move"]), playerTag: Schema.String,
    fromRosterId: Schema.optionalKey(Schema.String), toRosterId: Schema.optionalKey(Schema.String),
    reason: Schema.optionalKey(Schema.String),
  })),
})

const QuestionnaireRequest = Schema.Struct({
  questions: Schema.Array(Schema.Struct({
    id: Schema.String, label: Schema.String, type: Schema.Literals(["text", "boolean", "single_select"]),
    required: Schema.Boolean, options: Schema.Array(Schema.String), order: Schema.Number,
  })),
})

const SignupRequest = Schema.Struct({
  playerTag: Schema.String, answers: Schema.Record(Schema.String, Schema.Json),
  discordUserId: Schema.optionalKey(Schema.String), discordUsername: Schema.optionalKey(Schema.String),
  discordAvatarUrl: Schema.optionalKey(Schema.String),
})

const additionalBodies: Readonly<Record<string, Schema.Codec<unknown, unknown, never, never>>> = {
  membersQuery: BatchRequest,
  accountGroupsQuery: BatchRequest,
  validateMembershipChanges: MembershipProposalRequest,
  putQuestionnaire: QuestionnaireRequest,
  submitSignup: SignupRequest,
}

export const dispatchDashboardRoster = (
  request: Request,
  bindings: WorkerBindings,
): Effect.Effect<
  Response | undefined,
  ApiFailure,
  AuthIdentity | DashboardRosterOperations | ServerAuthorization | SqlClient.SqlClient
> => {
  let match: RouteMatch | undefined
  try {
    match = matchRoute(request)
  } catch (cause) {
    if (!(cause instanceof URIError)) throw cause
    return Effect.fail(new InvalidRequest({ message: "Path contains malformed percent encoding" }))
  }
  if (match === undefined) return Effect.succeed(undefined)
  return Effect.gen(function* () {
    const url = new URL(request.url)
    const descriptor: AnyEndpoint | undefined = Object.values({ ...botEndpoints, ...dashboardEndpoints })
      .find((endpoint) => endpoint.method === match.route.method && endpoint.path === match.route.path)
    const hasBody = descriptor === undefined
      ? request.method === "POST" || request.method === "PUT" || request.method === "PATCH"
      : descriptor.bodyMode === "json"
    const body = hasBody ? yield* decodeJson(request.clone()) : undefined
    const bodySchema = descriptor?.bodyMode === "json" ? descriptor.body : additionalBodies[match.route.operation]
    if (bodySchema !== undefined) {
      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
        return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
      }
      yield* Schema.decodeUnknownEffect(bodySchema)(body).pipe(
        Effect.mapError(() => new InvalidRequest({ message: "Request body failed schema validation" })),
      )
    }
    let principal: ApiPrincipal | undefined
    if (match.route.auth !== "public") {
      if (match.route.operation === "signupForm" || match.route.operation === "submitSignup") {
        const auth = yield* AuthIdentity
        principal = yield* auth.requireUserOrBot(request)
      } else {
        const authorization = yield* ServerAuthorization
        let serverId = match.params.serverId ?? url.searchParams.get("server_id") ?? stringValue(body?.serverId)
        if (match.route.operation === "sharedView") {
          const sql = yield* SqlClient.SqlClient
          const view = (yield* loadViews(sql, undefined, undefined, match.params.viewId))[0]
          if (view === undefined) return yield* new NotFound({ message: "Roster view not found" })
          serverId = view.server_id
        }
        if (serverId === undefined || !discordSnowflakePattern.test(serverId)) {
          return yield* new InvalidRequest({ message: "server_id must be a decimal Discord ID" })
        }
        if (body?.serverId !== undefined && body.serverId !== serverId) {
          return yield* new InvalidRequest({ message: "serverId must match the authorized server_id" })
        }
        const readOnlyPost = (match.route.operation === "queryMetric" || match.route.operation === "previewView"
          || match.route.operation === "membersQuery" || match.route.operation === "accountGroupsQuery"
          || match.route.operation === "validateMembershipChanges")
          && descriptor?.auth === "server-read"
        const access = yield* authorization.require(request, serverId, {
          section: "rosters", write: !readOnlyPost && request.method !== "GET",
        })
        principal = access.principal
        if (match.route.operation === "cloneRoster") {
          const sql = yield* SqlClient.SqlClient
          const source = (yield* loadRosters(sql, { rosterId: match.params.rosterId ?? "" }))[0]
          if (source === undefined) return yield* new NotFound({ message: "Source roster not found" })
          yield* authorization.require(request, source.server_id, { managerOnly: true, write: true })
        }
      }
    }
    const operations = yield* DashboardRosterOperations
    const response = yield* operations.execute(match.route.operation, {
      request,
      bindings,
      params: match.params,
      url,
      ...(principal === undefined ? {} : { principal }),
    })
    if (!response.ok || descriptor === undefined || descriptor.responseMode !== "json") return response
    const value = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: (cause) => new UpstreamUnavailable({ cause, message: "Roster response serialization failed" }),
    })
    const encoded = yield* Schema.encodeUnknownEffect(descriptor.response)(value).pipe(
      Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: `Roster response failed contract encoding for ${descriptor.operationId}` })),
    )
    return Response.json(encoded, { status: response.status, headers: response.headers })
  }).pipe(Effect.withSpan(`DashboardRoster.${match.route.operation}`))
}
