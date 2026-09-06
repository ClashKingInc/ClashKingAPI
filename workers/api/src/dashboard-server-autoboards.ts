import { AutoBoardCapability, AutoBoardWrite, DecimalSnowflake } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { DiscordApi } from "./discord-api.js"
import { validateDiscordDestination } from "./discord-destination.js"
import { compensateCreatedDiscordResource, createLogWebhook, lockServerDiscordResources, recordCreatedDiscordResource } from "./discord-managed-resources.js"
import { discordWebhookAvatar } from "./discord-profile-image.js"
import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, NotFound, RateLimited, UpstreamUnavailable, type ApiFailure } from "./errors.js"

export const dashboardAutoboardOperationIds = ["autoboardCapabilities", "serverAutoboards", "createAutoboard", "replaceAutoboard", "deleteAutoboard"] as const
type Capability = Schema.Schema.Type<typeof AutoBoardCapability>
type Write = Schema.Schema.Type<typeof AutoBoardWrite>
// Canonical Go registry explicitly publishes sample boards; no executor/product
// catalog is inferred from arbitrary stored rows.
export const autoboardCapabilities: ReadonlyArray<Capability> = [
  { boardType: "sample-clan-activity", label: "Sample · Clan activity", targetKind: "clan", minTargets: 1, maxTargets: 5, allowedScopes: ["custom"], allowedModes: ["refresh"], refreshInterval: { minMinutes: 15, maxMinutes: 360, defaultMinutes: 30 }, uiCapabilities: [] },
  { boardType: "sample-family-overview", label: "Sample · Family overview", targetKind: "clan", minTargets: 0, maxTargets: 0, allowedScopes: ["family"], allowedModes: ["refresh", "send"], refreshInterval: { minMinutes: 15, maxMinutes: 1440, defaultMinutes: 60 }, uiCapabilities: [] },
  { boardType: "sample-location-rankings", label: "Sample · Location rankings", targetKind: "location", minTargets: 1, maxTargets: 1, allowedScopes: ["custom"], allowedModes: ["refresh", "send"], refreshInterval: { minMinutes: 30, maxMinutes: 1440, defaultMinutes: 120 }, uiCapabilities: [] },
  { boardType: "sample-player-leaderboard", label: "Sample · Player leaderboard", targetKind: "player", minTargets: 1, maxTargets: 25, allowedScopes: ["custom"], allowedModes: ["send"], refreshInterval: null, uiCapabilities: [] },
  { boardType: "sample-war-summary", label: "Sample · War summary", targetKind: "war", minTargets: 1, maxTargets: 1, allowedScopes: ["custom"], allowedModes: ["send"], refreshInterval: null, uiCapabilities: [] },
]
const invalid = (field: string, message: string) => new InvalidRequest({ message: "Invalid autoboard configuration", details: [{ field, message }] })
const decodeDiscord = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Discord webhook response failed schema validation" })))
const uuid = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(value)
const text = (value: unknown) => typeof value === "string" ? value : ""
const iso = (value: string | Date | null) => value === null ? null : new Date(value).toISOString()

export const nextAutoboardRun = (now: Date, schedule: NonNullable<Write["schedule"]>): Date => {
  const [hour, minute] = schedule.timeOfDay.split(":").map(Number)
  if (schedule.kind === "day_of_month") {
    for (let offset = 0; offset < 24; offset++) {
      const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
      const next = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), schedule.dayOfMonth ?? 1, hour, minute))
      if (next.getUTCMonth() === month.getUTCMonth() && next > now) return next
    }
  } else {
    for (let offset = 0; offset <= 7; offset++) {
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, hour, minute))
      if (next > now && (schedule.kind === "daily" || schedule.weekdays?.includes(next.getUTCDay() || 7))) return next
    }
  }
  throw new Error("Validated autoboard schedule did not produce a next run")
}

export const validateAutoboardWrite = (body: unknown, now = new Date()) => Effect.gen(function* () {
  const input = yield* Schema.decodeUnknownEffect(AutoBoardWrite)(body).pipe(Effect.mapError(() => invalid("body", "failed schema validation")))
  const capability = autoboardCapabilities.find((item) => item.boardType === input.boardType.trim())
  if (capability === undefined) return yield* invalid("boardType", "is not a supported board type")
  if (!capability.allowedScopes.includes(input.targetScope)) return yield* invalid("targetScope", "is not allowed for this board type")
  if (!capability.allowedModes.includes(input.deliveryMode)) return yield* invalid("deliveryMode", "is not allowed for this board type")
  const targets = [...new Set(input.targets.map((value) => value.trim()))]
  if (targets.some((value) => value === "")) return yield* invalid("targets", "must not contain blank values")
  if (targets.length < capability.minTargets || targets.length > capability.maxTargets) return yield* invalid("targets", `must contain between ${capability.minTargets} and ${capability.maxTargets} unique values for this board type`)
  const schedule = input.schedule ?? null, interval = input.intervalMinutes ?? null
  let normalizedSchedule = schedule
  if (input.deliveryMode === "refresh") {
    if (schedule !== null) return yield* invalid("schedule", "must be null for refresh delivery")
    const range = capability.refreshInterval
    if (range === null || interval === null || !Number.isInteger(interval) || interval < range.minMinutes || interval > range.maxMinutes) return yield* invalid("intervalMinutes", "must be an integer within this board type's refresh range")
  } else {
    if (interval !== null) return yield* invalid("intervalMinutes", "must be null for send delivery")
    if (schedule === null) return yield* invalid("schedule", "is required for send delivery")
    const timeOfDay = schedule.timeOfDay.trim()
    if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(timeOfDay)) return yield* invalid("schedule.timeOfDay", "must use 24-hour HH:MM format")
    const weekdays = schedule.weekdays ?? [], day = schedule.dayOfMonth ?? null
    if (schedule.kind === "daily" && (weekdays.length !== 0 || day !== null)) return yield* invalid("schedule", "daily schedules cannot include weekdays or dayOfMonth")
    if (schedule.kind === "weekdays" && (day !== null || weekdays.length === 0 || weekdays.length > 7 || new Set(weekdays).size !== weekdays.length || weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7))) return yield* invalid("schedule.weekdays", "must contain unique ISO weekdays 1 through 7 and no dayOfMonth")
    if (schedule.kind === "day_of_month" && (weekdays.length !== 0 || day === null || !Number.isInteger(day) || day < 1 || day > 31)) return yield* invalid("schedule.dayOfMonth", "must be between 1 and 31 and cannot be combined with weekdays")
    normalizedSchedule = { ...schedule, timeOfDay, weekdays: [...weekdays].sort((a, b) => a - b), dayOfMonth: day }
  }
  const next = !input.enabled ? null : input.deliveryMode === "refresh" ? new Date(now.getTime() + (interval ?? 0) * 60000) : nextAutoboardRun(now, normalizedSchedule!)
  return { ...input, boardType: capability.boardType, targets, intervalMinutes: interval, schedule: normalizedSchedule, threadId: input.threadId?.trim() || null, nextRunAt: next }
})

interface BoardRow { readonly id: string; readonly board_type: string; readonly target_scope: "family" | "custom"; readonly targets: ReadonlyArray<string>; readonly delivery_mode: "refresh" | "send"; readonly webhook_id: string; readonly thread_id: string | null; readonly message_id: string | null; readonly enabled: boolean; readonly interval_minutes: number | null; readonly schedule_kind: string | null; readonly schedule_time: string | null; readonly schedule_weekdays: ReadonlyArray<number> | null; readonly schedule_day_of_month: number | null; readonly next_run_at: Date | string | null; readonly last_run_at: Date | string | null; readonly created_at: Date | string; readonly updated_at: Date | string }
const select = `SELECT a.id::text, a.board_type, a.target_scope, COALESCE(array_agg(t.target ORDER BY t.position) FILTER (WHERE t.target IS NOT NULL), ARRAY[]::text[]) AS targets,
 a.delivery_mode, a.webhook_id, a.thread_id, a.message_id, a.enabled, a.interval_minutes, a.schedule_kind, to_char(a.schedule_time, 'HH24:MI') AS schedule_time, a.schedule_weekdays, a.schedule_day_of_month, a.next_run_at, a.last_run_at, a.created_at, a.updated_at
 FROM autoboards a LEFT JOIN autoboard_targets t ON t.autoboard_id = a.id WHERE a.server_id = $1`
const readBoards = (serverId: string, id?: string) => Effect.gen(function* () { const sql = yield* SqlClient.SqlClient; return yield* sql.unsafe<BoardRow>(`${select}${id === undefined ? "" : " AND a.id = $2::uuid"} GROUP BY a.id ORDER BY a.created_at, a.id`, id === undefined ? [serverId] : [serverId, id]) })
const Hook = Schema.Struct({ id: DecimalSnowflake, type: Schema.Number, channel_id: Schema.optionalKey(Schema.NullOr(DecimalSnowflake)), user: Schema.optionalKey(Schema.Struct({ id: DecimalSnowflake })), application_id: Schema.optionalKey(Schema.NullOr(DecimalSnowflake)) })
const boardValue = (row: BoardRow, knownChannelId?: string) => Effect.gen(function* () {
  const discord = yield* DiscordApi
  const hook = knownChannelId === undefined ? yield* discord.request(`/webhooks/${row.webhook_id}`).pipe(Effect.flatMap((raw) => decodeDiscord(Hook, raw)), Effect.catch((failure) => failure instanceof NotFound ? Effect.succeed(undefined) : Effect.fail(failure)))
    : { id: row.webhook_id, type: 1, channel_id: knownChannelId }
  const channelId = hook !== undefined && [1, 2].includes(hook.type) ? hook.channel_id ?? null : null
  return { id: row.id, boardType: row.board_type, targetKind: autoboardCapabilities.find((item) => item.boardType === row.board_type)?.targetKind ?? "", targetScope: row.target_scope, targets: row.targets, deliveryMode: row.delivery_mode, channelId, channelDeleted: channelId === null,
    threadId: row.thread_id, messageId: row.message_id, enabled: row.enabled, intervalMinutes: row.interval_minutes,
    schedule: row.schedule_kind === null || row.schedule_time === null ? null : { kind: row.schedule_kind, timeOfDay: row.schedule_time, weekdays: row.schedule_weekdays ?? [], ...(row.schedule_day_of_month === null ? {} : { dayOfMonth: row.schedule_day_of_month }) },
    nextRunAt: iso(row.next_run_at), lastRunAt: iso(row.last_run_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) }
})

export const executeDashboardAutoboards = <R>(input: DashboardServerOperationInput, profile: Effect.Effect<{ readonly name: string }, ApiFailure, R>): Effect.Effect<unknown, ApiFailure, SqlClient.SqlClient | DiscordApi | R> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, discord = yield* DiscordApi, serverId = text(input.path.serverId), operation = input.endpoint.operationId
  const servers = yield* sql<{ autoboard_limit: number }>`SELECT autoboard_limit FROM servers WHERE id = ${serverId}`
  if (servers[0] === undefined) return yield* new NotFound({ message: "Server not found" })
  if (operation === "autoboardCapabilities") return { boardTypes: autoboardCapabilities }
  if (operation === "serverAutoboards") {
    const rows = yield* readBoards(serverId)
    return { items: yield* Effect.forEach(rows, (row) => boardValue(row)), total: rows.length, refreshCount: rows.filter((row) => row.delivery_mode === "refresh").length, sendCount: rows.filter((row) => row.delivery_mode === "send").length, limit: servers[0].autoboard_limit }
  }
  const requestedId = text(input.path.autoboardId)
  if (operation !== "createAutoboard" && !uuid(requestedId)) return yield* invalid("autoboardId", "must be a valid UUID")
  let created: Effect.Success<ReturnType<typeof createLogWebhook>> | undefined
  const prepared = operation === "deleteAutoboard" ? undefined : yield* Effect.gen(function* () {
    const write = yield* validateAutoboardWrite(input.body)
    yield* validateDiscordDestination(serverId, write.channelId, write.threadId)
    const user = yield* decodeDiscord(Schema.Struct({ id: DecimalSnowflake }), yield* discord.request("/users/@me"))
    const hooks = yield* decodeDiscord(Schema.Array(Hook), yield* discord.request(`/guilds/${serverId}/webhooks`))
    const webhookId = hooks.find((hook) => hook.type === 1 && hook.channel_id === write.channelId && (hook.user?.id === user.id || hook.application_id === user.id))?.id
    const botProfile = webhookId === undefined ? yield* profile : { name: "ClashKing" }
    const avatar = webhookId === undefined ? yield* discordWebhookAvatar("avatar_url" in botProfile && typeof botProfile.avatar_url === "string" ? botProfile.avatar_url : null) : undefined
    return { write, user, webhookId, botProfile, avatar }
  })
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* lockServerDiscordResources(serverId)
    if (operation === "deleteAutoboard") {
      const deleted = yield* sql<{ id: string }>`DELETE FROM autoboards WHERE server_id = ${serverId} AND id = ${requestedId}::uuid RETURNING id::text`
      if (deleted.length === 0) return yield* new NotFound({ message: "Autoboard not found" })
      return { id: requestedId, deleted: true }
    }
    if (operation === "replaceAutoboard" && (yield* readBoards(serverId, requestedId)).length === 0) return yield* new NotFound({ message: "Autoboard not found" })
    if (prepared === undefined) return yield* Effect.die("Missing autoboard preparation")
    const { write, user } = prepared
    if (operation === "createAutoboard") {
      const count = yield* sql<{ count: number; limit: number }>`SELECT (SELECT count(*)::int FROM autoboards WHERE server_id = ${serverId}) AS count, autoboard_limit AS limit FROM servers WHERE id = ${serverId}`
      if (count[0] === undefined || count[0].count >= count[0].limit) return yield* invalid("autoboards", "server autoboard limit reached")
    }
    let webhookId = prepared.webhookId
    if (webhookId === undefined) {
      const hooks = yield* decodeDiscord(Schema.Array(Hook), yield* discord.request(`/guilds/${serverId}/webhooks`))
      webhookId = hooks.find((hook) => hook.type === 1 && hook.channel_id === write.channelId && (hook.user?.id === user.id || hook.application_id === user.id))?.id
    }
    if (webhookId === undefined) {
      created = yield* createLogWebhook(serverId, write.channelId, prepared.botProfile.name, prepared.avatar)
      yield* recordCreatedDiscordResource(created)
      webhookId = created.id
    }
    const schedule = write.schedule, weekdays = schedule?.kind === "weekdays" ? schedule.weekdays : null
    const fields = [write.boardType, write.targetScope, write.deliveryMode, webhookId, write.threadId, write.enabled, write.intervalMinutes, schedule?.kind ?? null, schedule?.timeOfDay ?? null, weekdays, schedule?.dayOfMonth ?? null, write.nextRunAt]
    let id = requestedId
    if (operation === "createAutoboard") {
      const saved = yield* sql.unsafe<{ id: string }>(`INSERT INTO autoboards (server_id, board_type, target_scope, delivery_mode, webhook_id, thread_id, enabled, interval_minutes, schedule_kind, schedule_time, schedule_weekdays, schedule_day_of_month, next_run_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::time,$11,$12,$13) RETURNING id::text`, [serverId, ...fields])
      if (saved[0] === undefined) return yield* new DatabaseFailure({ cause: null, message: "Autoboard was not created" })
      id = saved[0].id
    } else {
      yield* sql.unsafe(`UPDATE autoboards SET board_type=$3,target_scope=$4,delivery_mode=$5,webhook_id=$6,thread_id=$7,enabled=$8,interval_minutes=$9,schedule_kind=$10,schedule_time=$11::time,schedule_weekdays=$12,schedule_day_of_month=$13,next_run_at=$14,message_id=NULL,last_run_at=NULL,updated_at=now() WHERE server_id=$1 AND id=$2::uuid`, [serverId, id, ...fields])
      yield* sql`DELETE FROM autoboard_targets WHERE autoboard_id = ${id}::uuid`
    }
    for (const [position, target] of write.targets.entries()) yield* sql`INSERT INTO autoboard_targets (autoboard_id, position, target) VALUES (${id}::uuid, ${position}, ${target})`
    const row = (yield* readBoards(serverId, id))[0]
    if (row === undefined) return yield* new NotFound({ message: "Autoboard not found" })
    return { item: yield* boardValue(row, write.channelId) }
  })).pipe(Effect.catch((failure) => created === undefined ? Effect.fail(failure) : compensateCreatedDiscordResource(created).pipe(Effect.andThen(Effect.fail(failure)))))
}).pipe(Effect.mapError((cause) => cause instanceof Conflict || cause instanceof DatabaseFailure || cause instanceof Forbidden || cause instanceof InvalidRequest || cause instanceof NotFound || cause instanceof RateLimited || cause instanceof UpstreamUnavailable ? cause : new DatabaseFailure({ cause, message: "Autoboard operation failed" })))
