import { CreateReminderRequest, Reminder, RemindersResponse, UpdateReminderRequest } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { DiscordApi } from "./discord-api.js"
import { validateDiscordDestination } from "./discord-destination.js"
import { lockServerDiscordResources } from "./discord-managed-resources.js"
import { DatabaseFailure, InvalidRequest, NotFound, RateLimited, Unauthenticated, Forbidden, UpstreamUnavailable, type ApiFailure } from "./errors.js"

export const dashboardReminderOperationIds = ["serverReminders", "createServerReminder", "updateServerReminder", "deleteServerReminder"] as const
const groups = { War: "war_reminders", "Clan Capital": "capital_reminders", "Clan Games": "clan_games_reminders", Inactivity: "inactivity_reminders", roster: "roster_reminders" } as const
type ReminderValue = Schema.Schema.Type<typeof Reminder>
interface Row { readonly id: string; readonly type_name: string; readonly clan_tag: string; readonly channel_id: string | null; readonly thread_id: string | null; readonly trigger_time: string | null; readonly custom_text: string; readonly townhalls: ReadonlyArray<number> | null; readonly roles: ReadonlyArray<string>; readonly war_type_names: ReadonlyArray<string>; readonly point_threshold: unknown; readonly attack_threshold: unknown; readonly roster_id: string | null; readonly ping_type: string | null }
const columns = "id::text,type_name,clan_tag,channel_id,thread_id,trigger_time,custom_text,townhalls,roles,war_type_names,point_threshold,attack_threshold,roster_id,ping_type"
const decode = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid reminder request" })))
const tag = (value: string) => value.trim() === "" ? "" : `#${value.toUpperCase().replace(/[^A-Z0-9]/gu, "").replaceAll("O", "0")}`
export const reminderMinutes = (value: string) => {
  const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(hr|h|min|m)?\s*$/iu.exec(value)
  if (match === null) return 0
  const minutes = Number(match[1]) * (match[2]?.toLowerCase().startsWith("h") ? 60 : 1)
  return Number.isFinite(minutes) && minutes >= -2147483648 && minutes <= 2147483647 ? Math.trunc(minutes) : 0
}
const rowValue = (row: Row) => Schema.decodeUnknownEffect(Reminder)(Object.fromEntries(Object.entries({
  id: row.id, type: row.type_name, clan_tag: row.clan_tag, channel_id: row.channel_id ?? undefined,
  thread_id: row.thread_id, time: row.trigger_time ?? "", custom_text: row.custom_text,
  townhall_filter: row.townhalls ?? [], roles: row.roles, war_types: row.war_type_names,
  point_threshold: row.point_threshold ?? undefined, attack_threshold: row.attack_threshold ?? undefined,
  roster_id: row.roster_id ?? undefined, ping_type: row.ping_type ?? undefined,
}).filter(([, value]) => value !== undefined))).pipe(Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Stored reminder failed schema validation" })))
const validateFields = (body: Schema.Schema.Type<typeof UpdateReminderRequest>) => Effect.gen(function* () {
  // These filter Clash clan roles, not Discord role snowflakes.
  for (const value of [...body.townhall_filter ?? [], ...body.point_threshold === undefined ? [] : [body.point_threshold], ...body.attack_threshold === undefined ? [] : [body.attack_threshold]]) {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) return yield* new InvalidRequest({ message: "Reminder filters and thresholds must be integers" })
  }
})

export interface ReminderChange { readonly clan_tag: string; readonly type: string; readonly action: "created" | "updated" | "deleted"; readonly reminder_id: string }
export const publishReminderChange = (bindings: DashboardServerOperationInput["bindings"], change: ReminderChange) => Effect.tryPromise({
  try: async () => {
    if (!bindings.API_BOT_TOKEN?.trim()) throw new Error("Tracking token is not configured")
    const response = await bindings.TRACKING.fetch(new Request("https://tracking.internal/internal/reminder-config/publish", {
      method: "POST", headers: { authorization: `Bearer ${bindings.API_BOT_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ clan_tag: change.clan_tag, type: change.type === "roster" ? "Roster" : change.type, action: change.action, reminder_id: change.reminder_id }), signal: AbortSignal.timeout(3_000),
    }))
    if (response.status !== 200) throw new Error(`Tracking returned ${response.status}`)
    const value: unknown = await response.json()
    Schema.decodeUnknownSync(Schema.Struct({ published: Schema.Literal(true) }))(value)
  },
  catch: (cause) => new UpstreamUnavailable({ cause, message: "Reminder was saved, but Tracking notification failed" }),
})

export const executeDashboardReminders = (input: DashboardServerOperationInput): Effect.Effect<unknown, ApiFailure, SqlClient.SqlClient | DiscordApi> => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const serverId = typeof input.path.serverId === "string" ? input.path.serverId : ""
  const id = typeof input.path.reminderId === "string" ? input.path.reminderId : ""
  if (input.endpoint.operationId === "serverReminders") {
    const result: Record<keyof Schema.Schema.Type<typeof RemindersResponse>, ReminderValue[]> = { war_reminders: [], capital_reminders: [], clan_games_reminders: [], inactivity_reminders: [], roster_reminders: [] }
    for (const row of yield* sql.unsafe<Row>(`SELECT ${columns} FROM reminders WHERE server_id=$1 ORDER BY created_at ASC`, [serverId])) {
      if (Object.hasOwn(groups, row.type_name)) result[groups[row.type_name as keyof typeof groups]].push(yield* rowValue(row))
    }
    return result
  }
  let change: ReminderChange | undefined
  const result = yield* sql.withTransaction(Effect.gen(function* () {
    yield* lockServerDiscordResources(serverId)
    const operation = input.endpoint.operationId
    if (operation === "createServerReminder") {
      const body = yield* decode(CreateReminderRequest, input.body)
      yield* validateFields(body)
      if (!Object.hasOwn(groups, body.type)) return yield* new InvalidRequest({ message: "Unsupported reminder type" })
      yield* validateDiscordDestination(serverId, body.channel_id, body.thread_id || null)
      const data = { type: body.type, server: serverId, channel: body.channel_id, time: body.time, clan: tag(body.clan_tag ?? ""), custom_text: body.custom_text ?? "", [body.type === "Clan Capital" || body.type === "Clan Games" ? "townhalls" : "townhall_filter"]: body.townhall_filter ?? [], roles: body.roles ?? [], types: body.war_types ?? [], point_threshold: body.point_threshold, attack_threshold: body.attack_threshold, roster: body.roster_id, ping_type: body.ping_type }
      const rows = yield* sql.unsafe<{ id: string }>(`INSERT INTO reminders (server_id,type,type_name,clan_tag,webhook_token,channel_id,thread_id,minutes_remaining,trigger_time,custom_text,townhalls,roles,war_type_names,trigger_threshold,point_threshold,attack_threshold,roster_id,ping_type,data) VALUES ($1,$2,$3,$4,'',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,NULLIF($16,''),NULLIF($17,''),$18::jsonb) RETURNING id::text`, [serverId, Object.keys(groups).indexOf(body.type) + 1, body.type, tag(body.clan_tag ?? ""), body.channel_id, body.thread_id || null, reminderMinutes(body.time), body.time, body.custom_text ?? "", body.townhall_filter ?? null, body.roles ?? [], body.war_types ?? [], body.point_threshold ?? body.attack_threshold ?? null, body.point_threshold === undefined ? null : JSON.stringify(body.point_threshold), body.attack_threshold === undefined ? null : JSON.stringify(body.attack_threshold), body.roster_id ?? "", body.ping_type ?? "", JSON.stringify(data)])
      if (rows[0] === undefined) return yield* new DatabaseFailure({ cause: undefined, message: "Reminder insertion returned no identifier" })
      change = { clan_tag: tag(body.clan_tag ?? ""), type: body.type, action: "created", reminder_id: rows[0].id }
      return { message: "Reminder created successfully", reminder_id: rows[0].id, server_id: serverId }
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) return yield* new NotFound({ message: "Reminder not found" })
    const existing = (yield* sql.unsafe<Row>(`SELECT ${columns} FROM reminders WHERE server_id=$1 AND id=$2::uuid FOR UPDATE`, [serverId, id]))[0]
    if (existing === undefined) return yield* new NotFound({ message: "Reminder not found" })
    if (operation === "deleteServerReminder") {
      yield* sql`DELETE FROM reminders WHERE server_id=${serverId} AND id=${id}::uuid`
      change = { clan_tag: existing.clan_tag, type: existing.type_name, action: "deleted", reminder_id: id }
      return { message: "Reminder deleted successfully", reminder_id: id, server_id: serverId }
    }
    const body = yield* decode(UpdateReminderRequest, input.body)
    yield* validateFields(body)
    const destinationChanged = body.channel_id !== undefined || body.thread_id !== undefined
    const channel = body.channel_id ?? existing.channel_id
    if (destinationChanged) yield* validateDiscordDestination(serverId, channel ?? "", body.thread_id || null)
    const data = { channel: body.channel_id, time: body.time, custom_text: body.custom_text, [existing.type_name === "Clan Capital" || existing.type_name === "Clan Games" ? "townhalls" : "townhall_filter"]: body.townhall_filter, roles: body.roles, types: body.war_types, point_threshold: body.point_threshold, attack_threshold: body.attack_threshold, ping_type: body.ping_type }
    yield* sql.unsafe(`UPDATE reminders SET channel_id=COALESCE($3,channel_id),trigger_time=COALESCE($4,trigger_time),minutes_remaining=COALESCE($5,minutes_remaining),custom_text=COALESCE($6,custom_text),townhalls=COALESCE($7,townhalls),roles=COALESCE($8,roles),war_type_names=COALESCE($9,war_type_names),point_threshold=COALESCE($10::jsonb,point_threshold),attack_threshold=COALESCE($11::jsonb,attack_threshold),ping_type=COALESCE($12,ping_type),trigger_threshold=COALESCE($13,trigger_threshold),data=data||$14::jsonb,thread_id=CASE WHEN $15 THEN $16 ELSE thread_id END,updated_at=now() WHERE server_id=$1 AND id=$2::uuid`, [serverId,id,body.channel_id ?? null,body.time ?? null,body.time === undefined ? null : reminderMinutes(body.time),body.custom_text ?? null,body.townhall_filter ?? null,body.roles ?? null,body.war_types ?? null,body.point_threshold === undefined ? null : JSON.stringify(body.point_threshold),body.attack_threshold === undefined ? null : JSON.stringify(body.attack_threshold),body.ping_type ?? null,body.point_threshold ?? body.attack_threshold ?? null,JSON.stringify(data),destinationChanged,body.thread_id || null])
    change = { clan_tag: existing.clan_tag, type: existing.type_name, action: "updated", reminder_id: id }
    return { message: "Reminder updated successfully", reminder_id: id, server_id: serverId }
  }))
  if (change !== undefined) yield* publishReminderChange(input.bindings, change)
  return result
}).pipe(Effect.mapError((cause) => cause instanceof InvalidRequest || cause instanceof NotFound || cause instanceof RateLimited || cause instanceof Unauthenticated || cause instanceof Forbidden || cause instanceof UpstreamUnavailable || cause instanceof DatabaseFailure ? cause : new DatabaseFailure({ cause, message: "Reminder database operation failed" })))
