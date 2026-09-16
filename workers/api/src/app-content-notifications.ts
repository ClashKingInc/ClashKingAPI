import {
  AppAnnouncement,
  NotificationDeviceRequest,
  NotificationPreferencesRequest,
  NotificationPreferencesResponse,
  expoEndpoints,
  requireEndpointSuccessStatus,
  type AnyEndpoint,
} from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity, type UserPrincipal } from "./auth.js"
import type { WorkerBindings } from "./environment.js"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound, Unauthenticated, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import { encryptPushToken, hashPushToken } from "./push-secrets.js"
import { readBoundedJson } from "./request-body.js"
import { notifyTracking } from "./tracking-wake.js"

export type AppContentNotificationBindings = WorkerBindings & { readonly DATA_ENCRYPTION_KEY?: string }
type Announcement = typeof AppAnnouncement.Type
type DeviceRequest = typeof NotificationDeviceRequest.Type
type PreferencesRequest = typeof NotificationPreferencesRequest.Type
type PreferencesResponse = typeof NotificationPreferencesResponse.Type
export const appContentNotificationRuntimeRoutes = [
  { method: "GET", path: "/v2/app/posts" },
  { method: "GET", path: "/v2/app/announcements/active" },
  { method: "GET", path: "/v2/app/announcements/:announcementId" },
  { method: "POST", path: "/v2/notifications/devices" },
  { method: "DELETE", path: "/v2/notifications/devices" },
  { method: "GET", path: "/v2/notifications/preferences" },
  { method: "PUT", path: "/v2/notifications/preferences" },
  { method: "PUT", path: "/v2/notifications/accounts/:tag" },
] as const

const descriptors: ReadonlyArray<AnyEndpoint> = [
  expoEndpoints.posts,
  expoEndpoints.activeAnnouncements,
  expoEndpoints.announcement,
  expoEndpoints.notificationDeviceRegister,
  expoEndpoints.notificationDeviceDelete,
  expoEndpoints.notificationPreferencesGet,
  expoEndpoints.notificationPreferencesPut,
  expoEndpoints.notificationAccountPut,
]

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null ? value as Readonly<Record<string, unknown>> : {}

const sqlEffect = <A, E, R>(message: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, ApiFailure, R> =>
  effect.pipe(Effect.mapError((cause) =>
    cause instanceof DatabaseFailure || cause instanceof Forbidden || cause instanceof InvalidRequest ||
    cause instanceof NotFound || cause instanceof Unauthenticated || cause instanceof UpstreamUnavailable
      ? cause : new DatabaseFailure({ cause, message })))

const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : new Date(value).toISOString()

const localeFor = (value: unknown): string => {
  const locale = typeof value === "string" ? value.trim().toLowerCase().replaceAll("_", "-").split("-")[0] ?? "" : ""
  return locale.length === 2 ? locale : "en"
}

interface AnnouncementRow {
  readonly id: string
  readonly version: Date | string
  readonly title: string
  readonly subtitle: string
  readonly banner_image_url: string | null
  readonly body_blocks: Announcement["body_blocks"] | string
  readonly presentation_type: "article" | "story"
  readonly story_url: string | null
  readonly show_on_home: boolean
  readonly pinned_on_home: boolean
  readonly target_route: string | null
  readonly status: "live" | "expired"
  readonly published_at: Date | string | null
  readonly starts_at: Date | string | null
  readonly ends_at: Date | string | null
}

const announcementColumns = (localeParameter: string) => `id::text, updated_at AS version,
  COALESCE(NULLIF(translations -> ${localeParameter} ->> 'title',''),title) AS title,
  COALESCE(NULLIF(translations -> ${localeParameter} ->> 'summary',''),summary) AS subtitle,
  hero_image_url AS banner_image_url,
  COALESCE(translations -> ${localeParameter} -> 'body_blocks',body_blocks) AS body_blocks,
  presentation_type, story_url, show_on_home, pinned_on_home, target_route,
  status, published_at, starts_at, ends_at`

const mapAnnouncement = (row: AnnouncementRow): Announcement => ({
  id: row.id,
  version: iso(row.version),
  title: row.title,
  subtitle: row.subtitle,
  ...(row.banner_image_url === null ? {} : { banner_image_url: row.banner_image_url }),
  body_blocks: typeof row.body_blocks === "string" ? JSON.parse(row.body_blocks) as Announcement["body_blocks"] : row.body_blocks,
  presentation_type: row.presentation_type,
  ...(row.story_url === null ? {} : { story_url: row.story_url }),
  show_on_home: row.show_on_home,
  pinned_on_home: row.pinned_on_home,
  ...(row.target_route === null ? {} : { target_route: row.target_route }),
  status: row.status,
  ...(row.published_at === null ? {} : { published_at: iso(row.published_at) }),
  ...(row.starts_at === null ? {} : { starts_at: iso(row.starts_at) }),
  ...(row.ends_at === null ? {} : { ends_at: iso(row.ends_at) }),
})

const activeAnnouncements = (query: Readonly<Record<string, unknown>>) => sqlEffect("Active announcements lookup failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<AnnouncementRow>(`SELECT ${announcementColumns("$2")} FROM admin_posts
    WHERE status='live' AND published_at IS NOT NULL
      AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
      AND ($1='all' OR $1=ANY(platforms)) AND show_on_home=true
    ORDER BY pinned_on_home DESC, priority DESC, published_at DESC, id DESC LIMIT 10`,
  [query.target, localeFor(query.locale)])
  const items = rows.map(mapAnnouncement)
  return { item: items[0] ?? null, items }
}))

const publishedPosts = (query: Readonly<Record<string, unknown>>) => sqlEffect("Published posts lookup failed", Effect.gen(function* () {
  const limit = Number(query.limit)
  const offset = Number(query.offset)
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
    return yield* new InvalidRequest({ message: "Post pagination requires a limit from 1 to 50 and a nonnegative integer offset" })
  }
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<AnnouncementRow>(`SELECT ${announcementColumns("$4")} FROM admin_posts
    WHERE status IN ('live','expired') AND published_at IS NOT NULL
      AND ($1='all' OR $1=ANY(platforms))
    ORDER BY published_at DESC, id DESC LIMIT $2 OFFSET $3`,
  [query.target, limit + 1, offset, localeFor(query.locale)])
  const items = rows.slice(0, limit).map(mapAnnouncement)
  return { items, has_more: rows.length > limit, next_offset: offset + items.length }
}))

const announcementById = (id: string, query: Readonly<Record<string, unknown>>) => sqlEffect("Announcement lookup failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql.unsafe<AnnouncementRow>(`SELECT ${announcementColumns("$2")} FROM admin_posts
    WHERE id::text=$1 AND status IN ('live','expired') AND published_at IS NOT NULL`,
  [id, localeFor(query.locale)]))[0]
  if (row === undefined) return yield* new NotFound({ message: "Announcement not found" })
  return { item: mapAnnouncement(row) }
}))

const resolveDeviceId = (principal: UserPrincipal, requested: unknown): Effect.Effect<string, InvalidRequest | Forbidden> => {
  const sessionDevice = principal.deviceId?.trim() ?? ""
  const inputDevice = typeof requested === "string" ? requested.trim() : ""
  if (sessionDevice.length > 0 && inputDevice.length > 0 && sessionDevice !== inputDevice) {
    return Effect.fail(new Forbidden({ message: "Device does not match the authenticated session" }))
  }
  const deviceId = sessionDevice || inputDevice
  return deviceId.length === 0 || deviceId.length > 200
    ? Effect.fail(new InvalidRequest({ message: "Device id must contain between 1 and 200 characters" }))
    : Effect.succeed(deviceId)
}

const normalizeTimings = (values: ReadonlyArray<number>, maximum: number, granularity: number) => {
  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > maximum || value % granularity !== 0)) {
    return Effect.fail(new InvalidRequest({ message: "Reminder timing is outside the allowed range or granularity" }))
  }
  const unique = [...new Set(values)]
  return unique.length > 3
    ? Effect.fail(new InvalidRequest({ message: "At most 3 reminder timings are allowed" }))
    : Effect.succeed(unique)
}

interface DeviceRow {
  readonly device_id: string
  readonly provider: string
  readonly platform: string
  readonly environment: string
  readonly authorization_status: string
  readonly enabled: boolean
  readonly last_seen_at: Date | string
}

interface PreferencesRow {
  readonly war_attacks_enabled: boolean
  readonly war_state_enabled: boolean
  readonly war_reminders_enabled: boolean
  readonly raid_reminders_enabled: boolean
  readonly events_enabled: boolean
  readonly announcements_enabled: boolean
  readonly monthly_support_enabled: boolean
  readonly legend_defenses_enabled: boolean
  readonly reminder_timings: ReadonlyArray<number>
  readonly raid_reminder_timings: ReadonlyArray<number>
}

interface AccountRow {
  readonly tag: string
  readonly enabled: boolean
}

const accountRows = (userId: string) => sqlEffect("Notification accounts lookup failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<AccountRow>(`SELECT link.tag,COALESCE(account.enabled,false) enabled
    FROM player_links link LEFT JOIN mobile_notification_accounts account
      ON account.user_id=link.user_id AND account.player_tag=link.tag
    WHERE link.user_id=$1 AND link.is_verified=true ORDER BY link.tag`, [userId])
  return rows.map((row) => ({ tag: row.tag, enabled: row.enabled }))
}))

const mapPreferences = (
  row: PreferencesRow,
  accounts: PreferencesResponse["accounts"],
): PreferencesResponse => ({
  warAttacksEnabled: row.war_attacks_enabled,
  warStateEnabled: row.war_state_enabled,
  warRemindersEnabled: row.war_reminders_enabled,
  raidRemindersEnabled: row.raid_reminders_enabled,
  eventsEnabled: row.events_enabled,
  announcementsEnabled: row.announcements_enabled,
  monthlySupportEnabled: row.monthly_support_enabled,
  legendDefensesEnabled: row.legend_defenses_enabled,
  reminderTimings: [...row.reminder_timings],
  raidReminderTimings: [...row.raid_reminder_timings],
  accounts,
})

const registerDevice = (principal: UserPrincipal, body: DeviceRequest, bindings: AppContentNotificationBindings) =>
  sqlEffect("Notification device registration failed", Effect.gen(function* () {
    const deviceId = yield* resolveDeviceId(principal, body.device_id)
    if (body.token.trim().length < 20 || body.token.length > 8192) {
      return yield* new InvalidRequest({ message: "Push token is invalid" })
    }
    const ciphertext = yield* encryptPushToken(body.token, bindings.DATA_ENCRYPTION_KEY ?? "")
    const hash = yield* hashPushToken(body.token)
    const provider = body.provider ?? "fcm"
    const environment = body.environment ?? "production"
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(Effect.gen(function* () {
      yield* sql.unsafe(`DELETE FROM mobile_push_devices WHERE token_hash=$1
        AND (user_id,device_id,provider,environment) <> ($2,$3,$4,$5)`,
      [hash, principal.userId, deviceId, provider, environment])
      const row = (yield* sql.unsafe<DeviceRow>(`INSERT INTO mobile_push_devices
        (user_id,device_id,platform,provider,environment,token_ciphertext,token_hash,app_version,
          locale,authorization_status,enabled,last_seen_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
        ON CONFLICT (user_id,device_id,provider,environment) DO UPDATE SET platform=excluded.platform,
          token_ciphertext=excluded.token_ciphertext,token_hash=excluded.token_hash,
          app_version=excluded.app_version,locale=excluded.locale,
          authorization_status=excluded.authorization_status,enabled=excluded.enabled,last_seen_at=now()
        RETURNING device_id,provider,platform,environment,authorization_status,enabled,last_seen_at`,
      [principal.userId, deviceId, body.platform, provider, environment, ciphertext, hash,
        body.app_version ?? "", body.locale ?? "", body.authorization_status ?? "not_determined", body.enabled]))[0]
      if (row === undefined) return yield* new DatabaseFailure({ cause: undefined, message: "Notification registration returned no device" })
      return { ...row, last_seen_at: iso(row.last_seen_at) }
    }))
  }))

const deleteDevice = (principal: UserPrincipal, query: Readonly<Record<string, unknown>>) =>
  sqlEffect("Notification device removal failed", Effect.gen(function* () {
    const deviceId = yield* resolveDeviceId(principal, query.device_id)
    const sql = yield* SqlClient.SqlClient
    yield* sql.unsafe("DELETE FROM mobile_push_devices WHERE user_id=$1 AND device_id=$2 AND environment=$3",
      [principal.userId, deviceId, query.environment])
    return { message: "Notification device unregistered" }
  }))

const emptyPreferences = (): PreferencesRow => ({
  war_attacks_enabled: false, war_state_enabled: false, war_reminders_enabled: false,
  raid_reminders_enabled: false, events_enabled: false, announcements_enabled: false,
  monthly_support_enabled: false, legend_defenses_enabled: false,
  reminder_timings: [], raid_reminder_timings: [],
})

const getPreferences = (principal: UserPrincipal) =>
  sqlEffect("Notification preferences lookup failed", Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const row = (yield* sql.unsafe<PreferencesRow>(`SELECT war_attacks_enabled,war_state_enabled,
      war_reminders_enabled,raid_reminders_enabled,events_enabled,announcements_enabled,
      monthly_support_enabled,legend_defenses_enabled,reminder_timings,raid_reminder_timings
      FROM mobile_notification_preferences WHERE user_id=$1`, [principal.userId]))[0] ?? emptyPreferences()
    return mapPreferences(row, yield* accountRows(principal.userId))
  }))

const putPreferences = (principal: UserPrincipal, body: PreferencesRequest) =>
  sqlEffect("Notification preferences update failed", Effect.gen(function* () {
    const reminders = yield* normalizeTimings(body.reminderTimings, 2820, 1)
    const raidReminders = yield* normalizeTimings(body.raidReminderTimings, 4320, 15)
    const sql = yield* SqlClient.SqlClient
    const preferences = yield* sql.withTransaction(Effect.gen(function* () {
      yield* sql.unsafe(`INSERT INTO mobile_notification_preferences
        (user_id,war_attacks_enabled,war_state_enabled,war_reminders_enabled,raid_reminders_enabled,
          events_enabled,announcements_enabled,monthly_support_enabled,legend_defenses_enabled,
          reminder_timings,raid_reminder_timings,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
        ON CONFLICT (user_id) DO UPDATE SET war_attacks_enabled=excluded.war_attacks_enabled,
          war_state_enabled=excluded.war_state_enabled,war_reminders_enabled=excluded.war_reminders_enabled,
          raid_reminders_enabled=excluded.raid_reminders_enabled,events_enabled=excluded.events_enabled,
          announcements_enabled=excluded.announcements_enabled,monthly_support_enabled=excluded.monthly_support_enabled,
          legend_defenses_enabled=excluded.legend_defenses_enabled,reminder_timings=excluded.reminder_timings,
          raid_reminder_timings=excluded.raid_reminder_timings,updated_at=now()`,
      [principal.userId, body.warAttacksEnabled, body.warStateEnabled, body.warRemindersEnabled,
        body.raidRemindersEnabled, body.eventsEnabled, body.announcementsEnabled,
        body.monthlySupportEnabled, body.legendDefensesEnabled, reminders, raidReminders])
      yield* notifyTracking(sql, { kind: "mobile_reminder_config", userId: principal.userId })
      return {
        ...body, reminderTimings: reminders, raidReminderTimings: raidReminders,
        accounts: yield* accountRows(principal.userId),
      }
    }))
    return preferences
  }))

const correctTag = (value: string): string => {
  const raw = value.trim().toUpperCase().replaceAll("O", "0").replace(/^#+/u, "")
  return raw.length === 0 ? "" : `#${raw}`
}

const putAccount = (principal: UserPrincipal, playerTag: string, enabled: boolean) =>
  sqlEffect("Notification account update failed", Effect.gen(function* () {
    const tag = correctTag(playerTag)
    if (!/^#[0289PYLQGRJCUV]+$/u.test(tag)) return yield* new InvalidRequest({ message: "Invalid player tag" })
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(Effect.gen(function* () {
      const verified = (yield* sql.unsafe<{ readonly exists: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM player_links WHERE user_id=$1 AND tag=$2 AND is_verified=true) AS exists`,
      [principal.userId, tag]))[0]?.exists === true
      if (!verified) return yield* new Forbidden({ message: "Player must be a verified account owned by the authenticated user" })
      yield* sql.unsafe(`INSERT INTO mobile_notification_accounts
        (user_id,player_tag,enabled,created_at,updated_at) VALUES ($1,$2,$3,now(),now())
        ON CONFLICT (user_id,player_tag) DO UPDATE SET enabled=excluded.enabled,updated_at=now()`,
      [principal.userId, tag, enabled])
      return { tag, enabled }
    }))
  }))

const matchDescriptor = (request: Request): { readonly endpoint: AnyEndpoint; readonly path: Record<string, unknown> } | undefined => {
  const pathname = new URL(request.url).pathname.split("/")
  for (const endpoint of descriptors) {
    if (request.method !== endpoint.method) continue
    const template = endpoint.path.split("/")
    if (template.length !== pathname.length) continue
    const path: Record<string, unknown> = {}
    let matched = true
    for (let index = 0; index < template.length; index += 1) {
      const expected = template[index] ?? ""
      const actual = pathname[index] ?? ""
      if (expected.startsWith(":")) {
        try { path[expected.slice(1)] = decodeURIComponent(actual) } catch { matched = false; break }
      } else if (expected !== actual) { matched = false; break }
    }
    if (matched) return { endpoint, path }
  }
  return undefined
}

const decodeContract = (schema: AnyEndpoint["body"], value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(() => new InvalidRequest({ message: "Request failed schema validation" })))

export const dispatchAppContentNotifications = (
  request: Request,
  bindings: AppContentNotificationBindings,
): Effect.Effect<Response | undefined, ApiFailure, AuthIdentity | SqlClient.SqlClient> => {
  const match = matchDescriptor(request)
  if (match === undefined) return Effect.succeed(undefined)
  return Effect.gen(function* () {
    let principal: UserPrincipal | undefined
    if (match.endpoint.auth !== "public") {
      const auth = yield* AuthIdentity
      principal = yield* auth.requireUser(request)
      if (principal.userId.trim().length === 0 || principal.userId.startsWith("server:")) {
        return yield* new Unauthenticated({ message: "Authenticated user required" })
      }
    }
    const url = new URL(request.url)
    const queryInput: Record<string, unknown> = Object.fromEntries(url.searchParams)
    if (match.endpoint.operationId === "listExpoPosts") {
      queryInput.limit = Number(queryInput.limit ?? 20)
      queryInput.offset = Number(queryInput.offset ?? 0)
    }
    if (match.endpoint.auth === "public") {
      queryInput.locale ??= "en"
      if (match.endpoint.operationId !== "getExpoAnnouncement") queryInput.target ??= "all"
    }
    const query = asRecord(yield* decodeContract(match.endpoint.query, queryInput))
    const path = asRecord(yield* decodeContract(match.endpoint.pathParams, match.path))
    let body: unknown = {}
    if (match.endpoint.bodyMode === "json") {
      if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
        return yield* new InvalidRequest({ message: "Content-Type must be application/json", status: 415 })
      }
      const parsed = yield* readBoundedJson(request)
      body = yield* decodeContract(match.endpoint.body, parsed)
    }
    let value: unknown
    if (match.endpoint.auth === "public") {
      switch (match.endpoint.operationId) {
        case "listExpoPosts": value = yield* publishedPosts(query); break
        case "listExpoActiveAnnouncements": value = yield* activeAnnouncements(query); break
        case "getExpoAnnouncement": value = yield* announcementById(String(path.announcementId), query); break
        default: return yield* new NotFound({ message: "Unknown app content operation" })
      }
    } else {
      if (principal === undefined) return yield* new Unauthenticated({ message: "Authenticated user required" })
      switch (match.endpoint.operationId) {
        case "registerExpoNotificationDevice": value = yield* registerDevice(principal, body as DeviceRequest, bindings); break
        case "deleteExpoNotificationDevice": value = yield* deleteDevice(principal, query); break
        case "getExpoNotificationPreferences": value = yield* getPreferences(principal); break
        case "putExpoNotificationPreferences": value = yield* putPreferences(principal, body as PreferencesRequest); break
        case "putExpoNotificationAccount": value = yield* putAccount(principal, String(path.tag), asRecord(body).enabled === true); break
        default: return yield* new NotFound({ message: "Unknown notification operation" })
      }
    }
    const encoded = yield* Schema.encodeUnknownEffect(match.endpoint.response)(value).pipe(
      Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "App content or notification response violated its contract" })),
    )
    return Response.json(encoded, { status: requireEndpointSuccessStatus(match.endpoint), headers: { "cache-control": "no-store" } })
  }).pipe(Effect.withSpan(`AppContentNotifications.${match.endpoint.operationId}`))
}

export const appContentNotificationInternals = {
  correctTag, localeFor, mapAnnouncement, mapPreferences, normalizeTimings, resolveDeviceId,
}
