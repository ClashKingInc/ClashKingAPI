import {
  AppReleaseMarker as AppReleaseMarkerSchema,
  AppUpdateChannel as AppUpdateChannelSchema,
  type Campaign,
  type DeveloperApplication,
  type FeatureFlag,
  type Post,
} from "@clashking/api-contracts"
import { importPKCS8, SignJWT } from "jose"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import type { AdminPrincipal } from "./access.js"
import { appUpdateInternals } from "./app-updates.js"
import { DatabaseFailure, InvalidRequest, NotFound, PayloadTooLarge, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { decryptPushToken } from "./push-secrets.js"
import { executeTrackingRead } from "./tracking-operations.js"

export type AdminWorkerBindings = WorkerBindings & {
  readonly ADMIN_NOTIFICATION_LAB_ENABLED?: string
  readonly DATA_ENCRYPTION_KEY?: string
  readonly MOBILE_PUSH_FCM_PROJECT_ID?: string
  readonly MOBILE_PUSH_FCM_SERVICE_ACCOUNT_JSON?: string
}

export interface AdminOperationInput {
  readonly bindings: AdminWorkerBindings
  readonly body: unknown
  readonly path: unknown
  readonly principal: AdminPrincipal
  readonly query: unknown
  readonly request: Request
}

type UnknownRecord = Readonly<Record<string, unknown>>
type AppReleaseMarkerValue = typeof AppReleaseMarkerSchema.Type
type AppUpdateChannelValue = typeof AppUpdateChannelSchema.Type

interface FeatureFlagRow {
  readonly description: string
  readonly enabled: boolean
  readonly ends_at: Date | string | null
  readonly flag_key: string
  readonly min_app_version: string
  readonly name: string
  readonly owner_name: string
  readonly platforms: ReadonlyArray<"android" | "ios" | "web">
  readonly public_exposure: "safe" | "sensitive"
  readonly rollout_percentage: number
  readonly starts_at: Date | string | null
  readonly updated_at: Date | string
}

interface DeveloperApplicationRow {
  readonly application_id: string
  readonly created_at: Date | string
  readonly developer_name: string
  readonly api_request_count: string
  readonly links_lookup_count: string
  readonly revoked_at: Date | string | null
  readonly token_last_used_at: Date | string | null
  readonly token_prefix: string
  readonly updated_at: Date | string
}

interface PostRow {
  readonly also_push_on_publish: boolean
  readonly body_blocks: Post["body_blocks"] | string
  readonly created_at: Date | string
  readonly created_by: string
  readonly dismissible: boolean
  readonly ends_at: Date | string | null
  readonly hero_image_url: string | null
  readonly id: string
  readonly pinned_on_home: boolean
  readonly platforms: Post["platforms"]
  readonly presentation_type: Post["presentation_type"]
  readonly priority: number
  readonly published_at: Date | string | null
  readonly push_body: string | null
  readonly push_sent_at: Date | string | null
  readonly push_title: string | null
  readonly revision_number: number
  readonly show_on_home: boolean
  readonly slug: string
  readonly starts_at: Date | string | null
  readonly status: Post["status"]
  readonly story_history: Post["story_history"]
  readonly story_url: string | null
  readonly story_version: number
  readonly summary: string
  readonly target_route: string | null
  readonly title: string
  readonly translations: Post["translations"] | string
  readonly updated_at: Date | string
}

interface CampaignRow {
  readonly body: string
  readonly campaign_key: string
  readonly created_at: Date | string
  readonly created_by: string
  readonly day_of_month: number | null
  readonly id: string
  readonly last_sent_at: Date | string | null
  readonly platforms: Campaign["platforms"]
  readonly send_at: Date | string | null
  readonly send_time: string | null
  readonly status: Campaign["status"]
  readonly target_locales: Campaign["target_locales"]
  readonly target_route: string | null
  readonly title: string
  readonly translations: Campaign["translations"] | string
  readonly trigger_type: Campaign["trigger_type"]
  readonly updated_at: Date | string
}

interface DeliveryRow {
  readonly id: string
  readonly post_id: string
  readonly attempt_number: number
  readonly trigger: "publish" | "retry" | "manual"
  readonly eligible_count: number
  readonly sent_count: number
  readonly skipped_count: number
  readonly status: "queued" | "processing" | "sent" | "partial" | "failed" | "no_audience"
  readonly attempted_at: Date | string
  readonly error_summary: string | null
}

interface AuditRow extends UnknownRecord {
  readonly created_at: Date | string
  readonly metadata: UnknownRecord | string | null
}

interface AppUpdateChannelRow {
  readonly active_version: string | null
  readonly channel: "beta" | "production"
  readonly paused: boolean
  readonly platform: "android" | "ios"
  readonly rollback_target_version: string | null
  readonly rollout_basis_points: number
  readonly rollout_ends_at: Date | string | null
  readonly rollout_from_basis_points: number | null
  readonly rollout_starts_at: Date | string | null
  readonly rollout_to_basis_points: number | null
  readonly runtime_version: string
  readonly updated_at: Date | string
}

interface PushDeviceRow {
  readonly device_id: string
  readonly environment: "production" | "sandbox"
  readonly id?: string
  readonly locale: string
  readonly platform: "android" | "ios"
  readonly provider: string
  readonly token_ciphertext: string
  readonly user_id: string
}

const featureFlagColumns = `flag_key, name, description, enabled, rollout_percentage,
  min_app_version, platforms, owner_name, public_exposure, starts_at, ends_at, updated_at`
const developerApplicationColumns = `application_id, developer_name,
  api_request_count::text, links_lookup_count::text, token_prefix, token_last_used_at, created_at, updated_at, revoked_at`
const postColumns = `id, slug, title, summary, hero_image_url, body_blocks, translations,
  presentation_type, story_url, story_version, story_history, revision_number, show_on_home,
  pinned_on_home, target_route, platforms, dismissible, priority, status, starts_at, ends_at,
  also_push_on_publish, push_title, push_body, published_at, push_sent_at, created_by, created_at, updated_at`
const campaignColumns = `id, campaign_key, title, body, target_route, platforms, target_locales,
  translations, status, trigger_type, day_of_month, send_at, send_time, last_sent_at,
  created_by, created_at, updated_at`

const asRecord = (value: unknown): UnknownRecord =>
  typeof value === "object" && value !== null ? value as UnknownRecord : {}

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

const optionalIso = (value: Date | string | null): string | null => value === null ? null : iso(value)

const parseJson = <A>(value: A | string): A => typeof value === "string" ? JSON.parse(value) as A : value

const isApiFailure = (cause: unknown): cause is ApiFailure => {
  if (typeof cause !== "object" || cause === null || !("_tag" in cause)) return false
  return ["DatabaseFailure", "Forbidden", "InvalidRequest", "NotFound", "Unauthenticated", "UpstreamUnavailable"]
    .includes(String(cause._tag))
}

const database = <A>(message: string, effect: Effect.Effect<A, unknown, SqlClient.SqlClient>) =>
  effect.pipe(Effect.mapError((cause) => isApiFailure(cause)
    ? cause
    : new DatabaseFailure({ cause, message })))

const mapFeatureFlag = (row: FeatureFlagRow): FeatureFlag => ({
  key: row.flag_key,
  name: row.name,
  description: row.description,
  enabled: row.enabled,
  rolloutPercentage: Number(row.rollout_percentage),
  ...(row.min_app_version.length === 0 ? {} : { minAppVersion: row.min_app_version }),
  platforms: [...row.platforms],
  owner: row.owner_name,
  lastUpdated: iso(row.updated_at),
  publicExposure: row.public_exposure,
  startsAt: optionalIso(row.starts_at),
  endsAt: optionalIso(row.ends_at),
})

const mapDeveloperApplication = (
  row: DeveloperApplicationRow,
): DeveloperApplication => ({
  application_id: row.application_id,
  developer_name: row.developer_name,
  api_request_count: row.api_request_count,
  links_lookup_count: row.links_lookup_count,
  token_prefix: row.token_prefix,
  token_last_used_at: optionalIso(row.token_last_used_at),
  created_at: iso(row.created_at),
  updated_at: iso(row.updated_at),
  revoked_at: optionalIso(row.revoked_at),
})

const mapPost = (row: PostRow): Post => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    ...(row.hero_image_url === null ? {} : { hero_image_url: row.hero_image_url }),
    body_blocks: parseJson(row.body_blocks),
    translations: parseJson(row.translations),
    presentation_type: row.presentation_type,
    ...(row.story_url === null ? {} : { story_url: row.story_url }),
    story_version: row.story_version,
    story_history: row.story_history,
    revision_number: row.revision_number,
    show_on_home: row.show_on_home,
    pinned_on_home: row.pinned_on_home,
    ...(row.target_route === null ? {} : { target_route: row.target_route }),
    platforms: row.platforms,
    dismissible: row.dismissible,
    priority: row.priority,
    status: row.status,
    starts_at: optionalIso(row.starts_at),
    ends_at: optionalIso(row.ends_at),
    also_push_on_publish: row.also_push_on_publish,
    ...(row.push_title === null ? {} : { push_title: row.push_title }),
    ...(row.push_body === null ? {} : { push_body: row.push_body }),
    published_at: optionalIso(row.published_at),
    push_sent_at: optionalIso(row.push_sent_at),
    created_by: row.created_by,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
})

const mapCampaign = (row: CampaignRow): Campaign => ({
  id: row.id,
  key: row.campaign_key,
  title: row.title,
  body: row.body,
  platforms: row.platforms,
  target_locales: row.target_locales,
  translations: parseJson(row.translations),
  status: row.status,
  trigger_type: row.trigger_type,
  target_route: row.target_route,
  day_of_month: row.day_of_month,
  send_at: optionalIso(row.send_at),
  send_time: row.send_time,
  last_sent_at: optionalIso(row.last_sent_at),
  created_by: row.created_by,
  created_at: iso(row.created_at),
  updated_at: iso(row.updated_at),
})

const mapChannel = (row: AppUpdateChannelRow): AppUpdateChannelValue => ({
  channel: row.channel,
  platform: row.platform,
  runtimeVersion: row.runtime_version,
  activeVersion: row.active_version,
  rollbackTargetVersion: row.rollback_target_version,
  rolloutBasisPoints: Number(row.rollout_basis_points),
  paused: row.paused,
  schedule: row.rollout_from_basis_points === null || row.rollout_to_basis_points === null ||
      row.rollout_starts_at === null || row.rollout_ends_at === null
    ? null
    : {
        fromBasisPoints: Number(row.rollout_from_basis_points),
        toBasisPoints: Number(row.rollout_to_basis_points),
        startsAt: iso(row.rollout_starts_at),
        endsAt: iso(row.rollout_ends_at),
      },
  updatedAt: iso(row.updated_at),
})

const requestIp = (request: Request): string =>
  request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""

const audit = (
  input: AdminOperationInput,
  action: string,
  resourceType: string,
  resourceId: string,
  summary: string,
  metadata: unknown = {},
) => database("Admin audit write failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    INSERT INTO admin_audit_events
      (actor, action, resource_type, resource_id, summary, metadata, ip_address, user_agent)
    VALUES (${input.principal.id}, ${action}, ${resourceType}, ${resourceId}, ${summary},
      ${JSON.stringify(metadata)}::jsonb, ${requestIp(input.request)}, ${input.request.headers.get("user-agent") ?? ""})
  `
}))

const randomToken = async (): Promise<{ readonly apiToken: string; readonly hash: Uint8Array; readonly prefix: string }> => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const apiToken = `ck_dev_${bytesToBase64Url(bytes)}`
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiToken)))
  return { apiToken, hash, prefix: apiToken.slice(0, 15) }
}

const bytesToBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "")

const uniqueSlug = (title: string): string => {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "item"
  const suffix = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(6))).toLowerCase()
  return `${base}-${suffix}`
}

const listFeatureFlags = () => database("Feature flag list failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<FeatureFlagRow>(
    `SELECT ${featureFlagColumns} FROM admin_feature_flags ORDER BY name`,
  )
  return rows.map(mapFeatureFlag)
}))

const createFeatureFlag = (input: AdminOperationInput) => database("Feature flag create failed", Effect.gen(function* () {
  const body = asRecord(input.body)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<FeatureFlagRow>(`INSERT INTO admin_feature_flags
    (flag_key, name, description, enabled, rollout_percentage, min_app_version, platforms,
      owner_name, public_exposure, starts_at, ends_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${featureFlagColumns}`, [
    String(body.key).trim(), String(body.name).trim(), String(body.description ?? "").trim(),
    body.enabled === true, Number(body.rolloutPercentage ?? 0), String(body.minAppVersion ?? "").trim(),
    body.platforms ?? ["ios", "android"], String(body.owner ?? "Product").trim(),
    body.publicExposure ?? "safe", body.startsAt ?? null, body.endsAt ?? null,
  ])
  const row = rows[0]
  if (row === undefined) throw new Error("Feature flag insert returned no row")
  yield* audit(input, "feature_flag.create", "feature_flag", row.flag_key, `Created feature flag ${row.name}`, {
    enabled: row.enabled, rollout_percentage: row.rollout_percentage,
  })
  return mapFeatureFlag(row)
}))

const updateFeatureFlag = (input: AdminOperationInput) => database("Feature flag update failed", Effect.gen(function* () {
  const body = asRecord(input.body)
  if (Object.keys(body).length === 0) return yield* new InvalidRequest({ message: "At least one field is required" })
  const key = String(asRecord(input.path).key)
  const sql = yield* SqlClient.SqlClient
  const current = (yield* sql.unsafe<FeatureFlagRow>(
    `SELECT ${featureFlagColumns} FROM admin_feature_flags WHERE flag_key=$1 FOR UPDATE`, [key],
  ))[0]
  if (current === undefined) return yield* new NotFound({ message: "Feature flag not found" })
  const pick = (name: string, fallback: unknown) => Object.hasOwn(body, name) ? body[name] : fallback
  const rows = yield* sql.unsafe<FeatureFlagRow>(`UPDATE admin_feature_flags SET
    name=$2, description=$3, enabled=$4, rollout_percentage=$5, min_app_version=$6,
    platforms=$7, owner_name=$8, public_exposure=$9, starts_at=$10, ends_at=$11, updated_at=now()
    WHERE flag_key=$1 RETURNING ${featureFlagColumns}`, [
    key, pick("name", current.name), pick("description", current.description), pick("enabled", current.enabled),
    pick("rolloutPercentage", current.rollout_percentage), pick("minAppVersion", current.min_app_version),
    pick("platforms", current.platforms), pick("owner", current.owner_name),
    pick("publicExposure", current.public_exposure), pick("startsAt", current.starts_at),
    pick("endsAt", current.ends_at),
  ])
  const row = rows[0]
  if (row === undefined) return yield* new NotFound({ message: "Feature flag not found" })
  yield* audit(input, "feature_flag.update", "feature_flag", key, `Updated feature flag ${row.name}`, {
    enabled: row.enabled, rollout_percentage: row.rollout_percentage,
  })
  return mapFeatureFlag(row)
}))

const listDeveloperApplications = () => database("Developer application list failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<DeveloperApplicationRow>(
    `SELECT ${developerApplicationColumns} FROM developer_applications
     ORDER BY revoked_at NULLS FIRST, developer_name, created_at DESC`,
  )
  return rows.map(mapDeveloperApplication)
}))

const getDeveloperApplication = (input: AdminOperationInput) => database("Developer application lookup failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).applicationId)
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql.unsafe<DeveloperApplicationRow>(
    `SELECT ${developerApplicationColumns} FROM developer_applications WHERE application_id=$1`, [id],
  ))[0]
  if (row === undefined) return yield* new NotFound({ message: "Developer application not found" })
  return mapDeveloperApplication(row)
}))

const createDeveloperApplication = (input: AdminOperationInput) => database("Developer application create failed", Effect.gen(function* () {
  const body = asRecord(input.body)
  const credential = yield* Effect.promise(randomToken)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<DeveloperApplicationRow>(`INSERT INTO developer_applications
    (developer_name, token_hash, token_prefix)
    VALUES ($1,$2,$3) RETURNING ${developerApplicationColumns}`, [
    String(body.developer_name).trim(), credential.hash, credential.prefix,
  ])
  const row = rows[0]
  if (row === undefined) throw new Error("Developer application insert returned no row")
  const application = mapDeveloperApplication(row)
  yield* audit(input, "developer_application.create", "developer_application", application.application_id,
    `Created developer application ${application.developer_name}`)
  return { ...application, api_token: credential.apiToken }
}))

const updateDeveloperApplication = (input: AdminOperationInput) => database("Developer application update failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).applicationId)
  const body = asRecord(input.body)
  if (Object.keys(body).length === 0) return yield* new InvalidRequest({ message: "At least one editable field is required" })
  const sql = yield* SqlClient.SqlClient
  const current = (yield* sql.unsafe<DeveloperApplicationRow>(
    `SELECT ${developerApplicationColumns} FROM developer_applications WHERE application_id=$1 FOR UPDATE`, [id],
  ))[0]
  if (current === undefined) return yield* new NotFound({ message: "Developer application not found" })
  if (current.revoked_at !== null) return new Response(
    JSON.stringify({ code: "conflict", message: "Revoked applications cannot be edited" }),
    { status: 409, headers: { "content-type": "application/json", "cache-control": "no-store" } },
  )
  const rows = yield* sql.unsafe<DeveloperApplicationRow>(`UPDATE developer_applications SET
    developer_name=$2, updated_at=now()
    WHERE application_id=$1 AND revoked_at IS NULL RETURNING ${developerApplicationColumns}`, [
    id, String(body.developer_name).trim(),
  ])
  const row = rows[0]
  if (row === undefined) return yield* new NotFound({ message: "Developer application not found" })
  const application = mapDeveloperApplication(row)
  yield* audit(input, "developer_application.update", "developer_application", id,
    `Updated developer application ${application.developer_name}`, { fields: Object.keys(body).sort() })
  return application
}))

const deleteDeveloperApplication = (input: AdminOperationInput) => database("Developer application revoke failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).applicationId)
  const sql = yield* SqlClient.SqlClient
  const application = (yield* sql.unsafe<{ readonly developer_name: string }>(
    "SELECT developer_name FROM developer_applications WHERE application_id=$1 FOR UPDATE", [id],
  ))[0]
  if (application === undefined) return yield* new NotFound({ message: "Developer application not found" })
  yield* sql.unsafe(`UPDATE developer_applications
    SET revoked_at=COALESCE(revoked_at, now()), updated_at=CASE WHEN revoked_at IS NULL THEN now() ELSE updated_at END
    WHERE application_id=$1`, [id])
  yield* audit(input, "developer_application.revoke", "developer_application", id,
    `Revoked developer application ${application.developer_name}`)
  return undefined
}))

const listPosts = (input: AdminOperationInput) => database("Post list failed", Effect.gen(function* () {
  const status = asRecord(input.query).status
  const sql = yield* SqlClient.SqlClient
  const rows = status === undefined
    ? yield* sql.unsafe<PostRow>(`SELECT ${postColumns} FROM admin_posts
        WHERE status <> 'archived' ORDER BY created_at DESC`)
    : yield* sql.unsafe<PostRow>(`SELECT ${postColumns} FROM admin_posts
        WHERE status=$1 ORDER BY created_at DESC`, [status])
  return rows.map(mapPost)
}))

const getPost = (input: AdminOperationInput) => database("Post lookup failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).id)
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql.unsafe<PostRow>(`SELECT ${postColumns} FROM admin_posts WHERE id=$1`, [id]))[0]
  if (row === undefined) return yield* new NotFound({ message: "Post not found" })
  return mapPost(row)
}))

const createPostFrom = (
  input: AdminOperationInput,
  body: UnknownRecord,
  titleSuffix = "",
) => database("Post create failed", Effect.gen(function* () {
  const title = `${String(body.title).trim()}${titleSuffix}`
  const startsAt = body.starts_at ?? null
  const status = typeof startsAt === "string" && new Date(startsAt) > new Date() ? "scheduled" : "draft"
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<PostRow>(`INSERT INTO admin_posts
    (slug, title, summary, hero_image_url, body_blocks, translations, presentation_type,
      story_url, show_on_home, pinned_on_home, target_route, platforms, dismissible,
      priority, status, starts_at, ends_at, also_push_on_publish, push_title, push_body, created_by)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    RETURNING ${postColumns}`, [
    uniqueSlug(title), title, String(body.summary).trim(), body.hero_image_url ?? null,
    JSON.stringify(body.body_blocks ?? []), JSON.stringify(body.translations ?? {}),
    body.presentation_type ?? "article", body.story_url ?? null, body.show_on_home ?? true,
    body.pinned_on_home ?? false, body.target_route ?? null, body.platforms ?? ["ios", "android", "web"],
    body.dismissible ?? true, body.priority ?? 10, status, startsAt, body.ends_at ?? null,
    body.also_push_on_publish ?? false, body.push_title ?? null, body.push_body ?? null, input.principal.id,
  ])
  const row = rows[0]
  if (row === undefined) throw new Error("Post insert returned no row")
  yield* audit(input, "post.create", "post", row.id, `Created post ${title}`, {
    status: row.status, presentation_type: row.presentation_type,
  })
  return mapPost(row)
}))

const updatePostWith = (
  input: AdminOperationInput,
  id: string,
  body: UnknownRecord,
) => database("Post update failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const current = (yield* sql.unsafe<PostRow>(`SELECT ${postColumns} FROM admin_posts WHERE id=$1 FOR UPDATE`, [id]))[0]
  if (current === undefined) return yield* new NotFound({ message: "Post not found" })
  const currentPost = mapPost(current)
  yield* sql.unsafe(`INSERT INTO admin_post_revisions (post_id, revision_number, snapshot, created_by)
    VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT (post_id, revision_number) DO NOTHING`, [
    id, currentPost.revision_number, JSON.stringify(currentPost), input.principal.id,
  ])
  const merged = { ...currentPost, ...body }
  const status = typeof merged.starts_at === "string" && new Date(merged.starts_at) > new Date()
    ? "scheduled"
    : currentPost.status === "scheduled" && merged.starts_at === null ? "draft" : currentPost.status
  const rows = yield* sql.unsafe<PostRow>(`UPDATE admin_posts SET
    title=$2, summary=$3, hero_image_url=$4, body_blocks=$5::jsonb, translations=$6::jsonb,
    presentation_type=$7, story_url=$8, revision_number=revision_number+1, show_on_home=$9,
    pinned_on_home=$10, target_route=$11, platforms=$12, dismissible=$13, priority=$14,
    starts_at=$15, ends_at=$16, also_push_on_publish=$17, push_title=$18, push_body=$19,
    status=$20, updated_at=now() WHERE id=$1 RETURNING ${postColumns}`, [
    id, merged.title, merged.summary, merged.hero_image_url ?? null, JSON.stringify(merged.body_blocks ?? []),
    JSON.stringify(merged.translations ?? {}), merged.presentation_type, merged.story_url ?? null,
    merged.show_on_home, merged.pinned_on_home, merged.target_route ?? null, merged.platforms,
    merged.dismissible, merged.priority, merged.starts_at ?? null, merged.ends_at ?? null,
    merged.also_push_on_publish, merged.push_title ?? null, merged.push_body ?? null, status,
  ])
  const row = rows[0]
  if (row === undefined) return yield* new NotFound({ message: "Post not found" })
  yield* audit(input, "post.update", "post", id, `Updated post ${row.title}`, {
    status: row.status, revision: row.revision_number,
  })
  return mapPost(row)
}))

const archivePost = (input: AdminOperationInput) => database("Post archive failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).id)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<{ readonly id: string }>(
    "UPDATE admin_posts SET status='archived', updated_at=now() WHERE id=$1 RETURNING id", [id],
  )
  if (rows.length === 0) return yield* new NotFound({ message: "Post not found" })
  yield* audit(input, "post.archive", "post", id, "Archived post")
  return undefined
}))

const audienceCount = (
  platforms: ReadonlyArray<string>,
  locales: ReadonlyArray<string>,
  environment: "production" | "sandbox" = "production",
) => database("Push audience lookup failed", Effect.gen(function* () {
  const normalized = normalizeLocales(locales)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<{ readonly count: number | string }>(`SELECT count(*)::int AS count
    FROM mobile_push_devices d WHERE d.enabled=true AND d.environment=$3
      AND d.authorization_status IN ('authorized','provisional') AND d.platform=ANY($1)
      AND d.announcements_enabled=true
      AND (cardinality($2::text[])=0 OR
        lower(split_part(replace(coalesce(nullif(d.locale,''),''),'_','-'),'-',1))=ANY($2))`,
  [[...platforms], normalized, environment])
  return Number(rows[0]?.count ?? 0)
}))

const postAudience = (input: AdminOperationInput) => database("Post audience lookup failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).id)
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql.unsafe<{ readonly platforms: ReadonlyArray<string> }>(
    "SELECT platforms FROM admin_posts WHERE id=$1", [id],
  ))[0]
  if (row === undefined) return yield* new NotFound({ message: "Post not found" })
  return { estimated_recipients: yield* audienceCount(row.platforms, []) }
}))

const postDeliveries = (input: AdminOperationInput) => database("Post delivery list failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).id)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<DeliveryRow>(`SELECT id, post_id, attempt_number, trigger,
    eligible_count, sent_count, skipped_count, status, error_summary, attempted_at
    FROM admin_post_delivery_attempts WHERE post_id=$1 ORDER BY attempt_number DESC`, [id])
  return rows.map(mapDelivery)
}))

const mapDelivery = ({ error_summary, ...row }: DeliveryRow) => ({
    ...row,
    ...(error_summary === null || error_summary.length === 0 ? {} : { error_summary }),
    attempted_at: iso(row.attempted_at),
})

const postRevisions = (input: AdminOperationInput) => database("Post revision list failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).id)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<{
    readonly created_at: Date | string
    readonly created_by: string
    readonly id: string
    readonly post_id: string
    readonly revision_number: number
    readonly snapshot: Post | string
  }>(`SELECT id, post_id, revision_number, snapshot, created_by, created_at
      FROM admin_post_revisions WHERE post_id=$1 ORDER BY revision_number DESC`, [id])
  return rows.map((row) => ({ ...row, snapshot: parseJson(row.snapshot), created_at: iso(row.created_at) }))
}))

const restorePostRevision = (input: AdminOperationInput) => database("Post revision restore failed", Effect.gen(function* () {
  const path = asRecord(input.path)
  const id = String(path.id)
  const revision = Number(path.revision)
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql.unsafe<{ readonly snapshot: Post | string }>(
    "SELECT snapshot FROM admin_post_revisions WHERE post_id=$1 AND revision_number=$2", [id, revision],
  ))[0]
  if (row === undefined) return yield* new NotFound({ message: "Post revision not found" })
  const restored = yield* updatePostWith(input, id, asRecord(parseJson(row.snapshot)))
  yield* audit(input, "post.revision.restore", "post", id, `Restored post revision ${revision}`)
  return restored
}))

const queuePostPush = (postId: string, trigger: "manual" | "publish") => database("Post push queue failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<{ readonly id: string }>(`INSERT INTO admin_post_delivery_attempts
    (post_id, attempt_number, trigger, eligible_count, sent_count, skipped_count, status)
    SELECT $1, COALESCE(max(attempt_number),0)+1, $2, 0, 0, 0, 'queued'
    FROM admin_post_delivery_attempts WHERE post_id=$1
    HAVING count(*) FILTER (WHERE status IN ('queued','processing'))=0
    ON CONFLICT (post_id, attempt_number) DO NOTHING RETURNING id`, [postId, trigger])
  return rows.length === 1
}))

const publishPost = (input: AdminOperationInput) => database("Post publish failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).id)
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql.unsafe<PostRow>(`UPDATE admin_posts SET status='live', published_at=now(), updated_at=now()
    WHERE id=$1 AND status IN ('draft','scheduled') RETURNING ${postColumns}`, [id]))[0]
  if (row === undefined) {
    return new Response(JSON.stringify({ code: "conflict", message: "Post cannot be published" }), {
      status: 409, headers: { "content-type": "application/json", "cache-control": "no-store" },
    })
  }
  const post = mapPost(row)
  const pushQueued = post.also_push_on_publish ? yield* queuePostPush(id, "publish") : false
  yield* audit(input, "post.publish", "post", id, `Published post ${post.title}`, { push_queued: pushQueued })
  return { ...post, push_queued: pushQueued }
}))

const pushPost = (input: AdminOperationInput) => database("Post push queue failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).id)
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql.unsafe<PostRow>(`SELECT ${postColumns} FROM admin_posts WHERE id=$1`, [id]))[0]
  if (row === undefined) return yield* new NotFound({ message: "Post not found" })
  const post = mapPost(row)
  if (post.status !== "live") {
    return new Response(JSON.stringify({ code: "conflict", message: "Only a live post can send push" }), {
      status: 409, headers: { "content-type": "application/json", "cache-control": "no-store" },
    })
  }
  const queued = yield* queuePostPush(id, "manual")
  yield* audit(input, "post.push.queue", "post", id, `Queued post notification ${post.title}`, { queued })
  return { queued }
}))

const duplicatePost = (input: AdminOperationInput) => database("Post duplicate failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).id)
  const sql = yield* SqlClient.SqlClient
  const row = (yield* sql.unsafe<PostRow>(`SELECT ${postColumns} FROM admin_posts WHERE id=$1`, [id]))[0]
  if (row === undefined) return yield* new NotFound({ message: "Post not found" })
  const source = mapPost(row)
  const body = { ...source, starts_at: null, ends_at: null, also_push_on_publish: false }
  return yield* createPostFrom(input, body, " (copy)")
}))

const listCampaigns = () => database("Campaign list failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<CampaignRow>(
    `SELECT ${campaignColumns} FROM admin_notification_campaigns ORDER BY created_at DESC`,
  )
  return rows.map(mapCampaign)
}))

const mergeCampaign = (base: UnknownRecord, body: UnknownRecord): UnknownRecord => {
  const merged: Record<string, unknown> = { ...base, ...body }
  if (merged.trigger_type === "monthly") {
    merged.send_at = null
    merged.day_of_month ??= 1
    merged.send_time ||= "09:00"
  } else {
    merged.day_of_month = null
    merged.send_time = null
  }
  return merged
}

const createCampaign = (input: AdminOperationInput) => database("Campaign create failed", Effect.gen(function* () {
  const body = asRecord(input.body)
  const campaign = mergeCampaign({
    campaign_key: uniqueSlug(String(body.title)), status: "draft", trigger_type: "manual",
    platforms: ["ios", "android", "web"], target_locales: [], translations: {}, created_by: input.principal.id,
  }, body)
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<CampaignRow>(`INSERT INTO admin_notification_campaigns
    (campaign_key,title,body,target_route,platforms,target_locales,translations,status,
      trigger_type,day_of_month,send_at,send_time,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13) RETURNING ${campaignColumns}`, [
    campaign.campaign_key, campaign.title, campaign.body, campaign.target_route ?? null,
    campaign.platforms, campaign.target_locales, JSON.stringify(campaign.translations), campaign.status,
    campaign.trigger_type, campaign.day_of_month ?? null, campaign.send_at ?? null,
    campaign.send_time ?? null, campaign.created_by,
  ])
  const row = rows[0]
  if (row === undefined) throw new Error("Campaign insert returned no row")
  yield* audit(input, "campaign.create", "campaign", row.id, `Created campaign ${row.title}`)
  return mapCampaign(row)
}))

const updateCampaign = (input: AdminOperationInput) => database("Campaign update failed", Effect.gen(function* () {
  const id = String(asRecord(input.path).id)
  const body = asRecord(input.body)
  if (Object.keys(body).length === 0) return yield* new InvalidRequest({ message: "At least one field is required" })
  const sql = yield* SqlClient.SqlClient
  const current = (yield* sql.unsafe<CampaignRow>(
    `SELECT ${campaignColumns} FROM admin_notification_campaigns WHERE id=$1 FOR UPDATE`, [id],
  ))[0]
  if (current === undefined) return yield* new NotFound({ message: "Campaign not found" })
  const campaign = mergeCampaign(asRecord(mapCampaign(current)), body)
  const rows = yield* sql.unsafe<CampaignRow>(`UPDATE admin_notification_campaigns SET
    title=$2,body=$3,target_route=$4,platforms=$5,target_locales=$6,translations=$7::jsonb,
    status=$8,trigger_type=$9,day_of_month=$10,send_at=$11,send_time=$12,updated_at=now()
    WHERE id=$1 RETURNING ${campaignColumns}`, [
    id, campaign.title, campaign.body, campaign.target_route ?? null, campaign.platforms,
    campaign.target_locales, JSON.stringify(campaign.translations), campaign.status,
    campaign.trigger_type, campaign.day_of_month ?? null, campaign.send_at ?? null, campaign.send_time ?? null,
  ])
  const row = rows[0]
  if (row === undefined) return yield* new NotFound({ message: "Campaign not found" })
  yield* audit(input, "campaign.update", "campaign", id, `Updated campaign ${row.title}`)
  return mapCampaign(row)
}))

const normalizeLocale = (value: string): string => {
  const locale = value.trim().toLowerCase().replace("_", "-").split("-")[0] ?? ""
  return locale.length === 2 ? locale : ""
}

const normalizeLocales = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...new Set(values.map(normalizeLocale).filter((value) => value.length > 0))]

const dashboard = (input: AdminOperationInput) => database("Admin dashboard lookup failed", Effect.gen(function* () {
  const days = Number(asRecord(input.query).days ?? 30)
  const sql = yield* SqlClient.SqlClient
  const device = (yield* sql.unsafe<Record<string, number | string>>(`SELECT
    count(*) FILTER (WHERE enabled)::int total,
    count(*) FILTER (WHERE enabled AND environment='production')::int production,
    count(*) FILTER (WHERE enabled AND environment='sandbox')::int sandbox,
    count(*) FILTER (WHERE enabled AND platform='android')::int android,
    count(*) FILTER (WHERE enabled AND platform='ios')::int ios,
    count(*) FILTER (WHERE enabled AND authorization_status IN ('authorized','provisional'))::int authorized,
    count(*) FILTER (WHERE enabled AND announcements_enabled)::int opted_in,
    count(*) FILTER (WHERE enabled AND last_seen_at >= now() - interval '24 hours')::int active_24h,
    count(*) FILTER (WHERE enabled AND last_seen_at >= now() - interval '7 days')::int active_7d
    FROM mobile_push_devices`))[0] ?? {}
  const content = (yield* sql.unsafe<Record<string, number | string>>(`SELECT
    (SELECT count(*) FROM admin_posts WHERE status='live')::int live_posts,
    (SELECT count(*) FROM admin_posts WHERE status='scheduled')::int scheduled_posts,
    (SELECT count(*) FROM admin_posts WHERE status='draft')::int draft_posts,
    (SELECT count(*) FROM admin_notification_campaigns WHERE status='scheduled')::int scheduled_campaigns,
    (SELECT count(*) FROM admin_notification_campaigns WHERE trigger_type <> 'manual')::int recurring_campaigns`))[0] ?? {}
  const delivery = (yield* sql.unsafe<Record<string, Date | number | string | null>>(`WITH attempts AS (
    SELECT eligible_count, sent_count, skipped_count, status, attempted_at
      FROM admin_post_delivery_attempts WHERE attempted_at >= now() - ($1::int * interval '1 day')
    UNION ALL
    SELECT eligible_count, sent_count, skipped_count, status, attempted_at
      FROM admin_campaign_delivery_attempts WHERE attempted_at >= now() - ($1::int * interval '1 day'))
    SELECT count(*)::int attempts, COALESCE(sum(eligible_count),0)::int eligible,
      COALESCE(sum(sent_count),0)::int sent, COALESCE(sum(skipped_count),0)::int skipped,
      count(*) FILTER (WHERE status IN ('failed','partial'))::int failed, max(attempted_at) last_attempt
    FROM attempts`, [days]))[0] ?? {}
  const daily = yield* sql.unsafe<Record<string, number | string>>(`WITH dates AS (
      SELECT generate_series((now()::date - ($1::int - 1)), now()::date, interval '1 day')::date day),
    attempts AS (
      SELECT attempted_at::date day, eligible_count, sent_count, skipped_count, status FROM admin_post_delivery_attempts
        WHERE attempted_at >= now() - ($1::int * interval '1 day')
      UNION ALL
      SELECT attempted_at::date day, eligible_count, sent_count, skipped_count, status FROM admin_campaign_delivery_attempts
        WHERE attempted_at >= now() - ($1::int * interval '1 day'))
    SELECT to_char(d.day,'YYYY-MM-DD') date, count(a.day)::int attempts,
      COALESCE(sum(a.eligible_count),0)::int eligible, COALESCE(sum(a.sent_count),0)::int sent,
      COALESCE(sum(a.skipped_count),0)::int skipped,
      count(a.day) FILTER (WHERE a.status IN ('failed','partial'))::int failed
    FROM dates d LEFT JOIN attempts a ON a.day=d.day GROUP BY d.day ORDER BY d.day`, [days])
  const audienceDaily = yield* sql.unsafe<Record<string, number | string>>(`WITH dates AS (
      SELECT generate_series((now()::date - ($1::int - 1)), now()::date, interval '1 day')::date day)
    SELECT to_char(d.day,'YYYY-MM-DD') date, COALESCE(k.devices_total,0)::int total,
      COALESCE(k.devices_production,0)::int production, COALESCE(k.devices_sandbox,0)::int sandbox,
      COALESCE(k.devices_opted_in,0)::int opted_in
    FROM dates d LEFT JOIN admin_kpi_daily k ON k.snapshot_date=d.day ORDER BY d.day`, [days])
  const appVersions = yield* sql.unsafe<{ readonly count: number | string; readonly value: string }>(`SELECT
    COALESCE(NULLIF(app_version,''),'unknown') value, count(*)::int count FROM mobile_push_devices
    WHERE enabled GROUP BY 1 ORDER BY 2 DESC LIMIT 8`)
  const locales = yield* sql.unsafe<{ readonly count: number | string; readonly value: string }>(`SELECT
    lower(split_part(replace(COALESCE(NULLIF(locale,''),'unknown'),'_','-'),'-',1)) value,
    count(*)::int count FROM mobile_push_devices WHERE enabled GROUP BY 1 ORDER BY 2 DESC LIMIT 12`)
  const nextSend = (yield* sql.unsafe<{ readonly value: Date | string | null }>(`SELECT min(value) value FROM (
    SELECT send_at value FROM admin_notification_campaigns WHERE status='scheduled' AND send_at > now()
    UNION ALL SELECT starts_at value FROM admin_posts WHERE status='scheduled' AND starts_at > now()) future`))[0]?.value ?? null
  const numberRecord = (row: Record<string, unknown>) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)]),
  )
  const eligible = Number(delivery.eligible ?? 0)
  return {
    generated_at: new Date().toISOString(),
    devices: numberRecord(device),
    content: numberRecord(content),
    delivery: {
      attempts: Number(delivery.attempts ?? 0), eligible, sent: Number(delivery.sent ?? 0),
      skipped: Number(delivery.skipped ?? 0), failed: Number(delivery.failed ?? 0),
      success_rate: eligible === 0 ? 0 : Number(delivery.sent ?? 0) / eligible * 100,
      ...(delivery.last_attempt === null || delivery.last_attempt === undefined
        ? {} : { last_attempt: iso(delivery.last_attempt as Date | string) }),
      ...(nextSend === null ? {} : { next_send_at: iso(nextSend) }),
    },
    daily: daily.map(numberExceptDate),
    audience_daily: audienceDaily.map(numberExceptDate),
    app_versions: appVersions.map((row) => ({ value: row.value, count: Number(row.count) })),
    locales: locales.map((row) => ({ value: row.value, count: Number(row.count) })),
  }
}))

const numberExceptDate = (row: Record<string, number | string>): Record<string, number | string> =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === "date" ? String(value) : Number(value)]))

const listAudit = (input: AdminOperationInput) => database("Admin audit lookup failed", Effect.gen(function* () {
  const query = asRecord(input.query)
  const args: ReadonlyArray<unknown> = [Number(query.limit ?? 100), query.actor ?? null, query.action ?? null,
    query.resource_type ?? null]
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<AuditRow>(`SELECT id, actor, action, resource_type, resource_id,
    summary, metadata, ip_address, user_agent, created_at FROM admin_audit_events
    WHERE ($2::text IS NULL OR actor ILIKE ('%' || $2 || '%'))
      AND ($3::text IS NULL OR action=$3) AND ($4::text IS NULL OR resource_type=$4)
    ORDER BY created_at DESC LIMIT $1`, args)
  return rows.map((row) => ({
    ...row,
    metadata: row.metadata === null ? {} : parseJson(row.metadata),
    created_at: iso(row.created_at),
  }))
}))

const fetchJson = (message: string, request: Request, fetcher?: Fetcher) => Effect.tryPromise({
  try: async () => {
    const response = fetcher === undefined ? await fetch(request) : await fetcher.fetch(request)
    if (!response.ok) throw new Error(`${message}: upstream returned ${response.status}`)
    return await response.json() as unknown
  },
  catch: (cause) => new UpstreamUnavailable({ cause, message }),
})

const proxyStats = (input: AdminOperationInput) => {
  const upstream = new URL("http://clash-proxy.internal/stats")
  for (const [key, value] of Object.entries(asRecord(input.query))) {
    if (value !== undefined) upstream.searchParams.set(key, String(value))
  }
  return fetchJson("Proxy statistics request failed", new Request(upstream, {
    headers: { accept: "application/json" },
  }), input.bindings.CLASH_PROXY)
}

const releaseMarkerKey = (track: string, version: string): string => `releases/${track}/${version}/release.json`

const validReleaseMarker = (marker: AppReleaseMarkerValue): boolean =>
  appUpdateInternals.validVersion(marker.version, marker.track, marker.type) &&
  marker.appVersion === marker.version.replace(/-beta$/u, "") &&
  Number.isFinite(Date.parse(marker.createdAt)) &&
  Object.entries(marker.rollbackTargets ?? {}).every(([version, target]) =>
    appUpdateInternals.validVersion(version, marker.track, target.type) &&
    Object.entries(target.platforms).every(([platform, reference]) =>
      reference.runtimeVersion.length > 0 &&
      reference.key.startsWith(`rollbacks/${marker.track}/${marker.version}/${version}/${platform}-`) &&
      /^rollbacks\/(beta|production)\/[^/]+\/[^/]+\/(ios|android)-[0-9a-f-]{36}\.json$/u.test(reference.key),
    ),
  )

const decodeReleaseMarker = (value: unknown) => Schema.decodeUnknownEffect(AppReleaseMarkerSchema)(value).pipe(
  Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Release marker violates the shared contract" })),
  Effect.flatMap((marker) => validReleaseMarker(marker)
    ? Effect.succeed(marker)
    : Effect.fail(new UpstreamUnavailable({ cause: undefined, message: "Release marker has invalid version or rollback metadata" }))),
)

const readReleaseMarker = (bindings: AdminWorkerBindings, track: string, version: string) => Effect.gen(function* () {
  const object = yield* Effect.tryPromise({
    try: () => bindings.APP_UPDATES.get(releaseMarkerKey(track, version)),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Release marker lookup failed" }),
  })
  if (object === null) return yield* new NotFound({ message: `Release marker ${track}/${version} was not found` })
  const value = yield* Effect.tryPromise({
    try: () => object.json<unknown>(),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Release marker is not valid JSON" }),
  })
  return yield* decodeReleaseMarker(value)
})

const listReleaseObjects = (bindings: AdminWorkerBindings) => Effect.gen(function* () {
  const releases: Array<AppReleaseMarkerValue> = []
  let cursor: string | undefined
  do {
    const page = yield* Effect.tryPromise({
      try: () => bindings.APP_UPDATES.list({ prefix: "releases/", ...(cursor === undefined ? {} : { cursor }) }),
      catch: (cause) => new UpstreamUnavailable({ cause, message: "App release listing failed" }),
    })
    for (const object of page.objects) {
      if (!/^releases\/(beta|production)\/[^/]+\/release\.json$/u.test(object.key)) continue
      const value = yield* Effect.tryPromise({
        try: async () => {
          const stored = await bindings.APP_UPDATES.get(object.key)
          if (stored === null || stored.size > 2 * 1024 * 1024) throw new Error("Missing or oversized release marker")
          return await stored.json<unknown>()
        },
        catch: (cause) => new UpstreamUnavailable({ cause, message: "App release marker lookup failed" }),
      })
      releases.push(yield* decodeReleaseMarker(value))
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor !== undefined)
  return releases.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
})

const listAppReleases = (input: AdminOperationInput) => database("App update channel list failed", Effect.gen(function* () {
  const releases = yield* listReleaseObjects(input.bindings)
  const sql = yield* SqlClient.SqlClient
  const channels = yield* sql.unsafe<AppUpdateChannelRow>(`SELECT channel, platform, runtime_version,
    active_version, rollback_target_version, rollout_basis_points, paused, rollout_from_basis_points,
    rollout_to_basis_points, rollout_starts_at, rollout_ends_at, updated_at
    FROM app_update_channels ORDER BY channel, platform, runtime_version`)
  return { releases, channels: channels.map(mapChannel) }
}))

const semverParts = (value: string): ReadonlyArray<number> | null => {
  const parts = value.replace(/-beta$/u, "").split(".").map(Number)
  return parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0) ? null : parts
}

const compareVersions = (left: string, right: string): number => {
  const a = semverParts(left)
  const b = semverParts(right)
  if (a === null || b === null) throw new Error("cannot compare invalid app release versions")
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0)
  }
  return 0
}

const updateAppReleaseChannel = (input: AdminOperationInput) => database("App update channel update failed", Effect.gen(function* () {
  const path = asRecord(input.path)
  const body = asRecord(input.body)
  const track = String(path.track)
  const platform = String(path.platform) as "android" | "ios"
  const runtimeVersion = String(path.runtimeVersion)
  const schedule = body.schedule === null ? null : asRecord(body.schedule)
  const releaseError = (status: 400 | 409, detail: string) => Response.json({ detail }, {
    status, headers: { "cache-control": "no-store" },
  })
  if (schedule !== null && new Date(String(schedule.endsAt)) <= new Date(String(schedule.startsAt))) {
    return releaseError(400, "schedule.endsAt must be after schedule.startsAt")
  }
  const sql = yield* SqlClient.SqlClient
  // A SELECT lock cannot lock a missing row. Claim the unique channel key first;
  // a concurrent initializer waits here and then validates the committed state.
  const claimed = yield* sql.unsafe(`INSERT INTO app_update_channels (channel,platform,runtime_version)
    VALUES ($1,$2,$3) ON CONFLICT (channel,platform,runtime_version) DO NOTHING RETURNING channel`,
  [track, platform, runtimeVersion])
  const current = (yield* sql.unsafe<AppUpdateChannelRow>(`SELECT channel, platform, runtime_version,
    active_version, rollback_target_version, rollout_basis_points, paused, rollout_from_basis_points,
    rollout_to_basis_points, rollout_starts_at, rollout_ends_at, updated_at FROM app_update_channels
    WHERE channel=$1 AND platform=$2 AND runtime_version=$3 FOR UPDATE`, [track, platform, runtimeVersion]))[0]
  if (current === undefined || (body.expectedUpdatedAt === null ? claimed.length !== 1
    : claimed.length === 1 || new Date(String(body.expectedUpdatedAt)).getTime() !== new Date(current.updated_at).getTime())) {
    return releaseError(409, "This release channel changed since you loaded it. Reload before saving.")
  }
  const activeVersion = body.activeVersion === null ? null : String(body.activeVersion)
  const rollbackVersion = body.rollbackTargetVersion === null ? null : String(body.rollbackTargetVersion)
  if (current?.rollback_target_version && activeVersion === null) {
    return releaseError(409, "pause this rollback or select a newer OTA release")
  }
  if (current?.rollback_target_version !== null && current?.rollback_target_version !== undefined &&
      activeVersion === current.active_version && rollbackVersion !== current.rollback_target_version) {
    return releaseError(409, "an activated rollback is final for this release; select a newer OTA release")
  }
  if (current?.active_version && activeVersion !== null && activeVersion !== current.active_version &&
      compareVersions(activeVersion, current.active_version) <= 0) {
    return releaseError(409, "select a newer OTA release, or use the pre-signed rollback control")
  }
  if (activeVersion !== null) {
    const marker = yield* readReleaseMarker(input.bindings, track, activeVersion)
    if (marker.track !== track || marker.version !== activeVersion || marker.type !== "ota" ||
        marker.platforms[platform]?.runtimeVersion !== runtimeVersion || marker.platforms[platform]?.manifest === undefined) {
      return releaseError(409, "selected release is not an OTA update for this channel, platform, and runtime")
    }
    if (rollbackVersion !== null) {
      const rollback = marker.rollbackTargets?.[rollbackVersion]?.platforms[platform]
      if (rollbackVersion === activeVersion || rollback?.runtimeVersion !== runtimeVersion || !rollback.key) {
        return releaseError(409, "selected rollback was not pre-signed for this release, platform, and runtime")
      }
    }
  } else if (rollbackVersion !== null) {
    return releaseError(400, "rollbackTargetVersion requires activeVersion")
  }
  const rows = yield* sql.unsafe<AppUpdateChannelRow>(`INSERT INTO app_update_channels
    (channel,platform,runtime_version,active_version,rollback_target_version,rollout_basis_points,
      paused,rollout_from_basis_points,rollout_to_basis_points,rollout_starts_at,rollout_ends_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
    ON CONFLICT (channel,platform,runtime_version) DO UPDATE SET active_version=excluded.active_version,
      rollback_target_version=excluded.rollback_target_version,rollout_basis_points=excluded.rollout_basis_points,
      paused=excluded.paused,rollout_from_basis_points=excluded.rollout_from_basis_points,
      rollout_to_basis_points=excluded.rollout_to_basis_points,rollout_starts_at=excluded.rollout_starts_at,
      rollout_ends_at=excluded.rollout_ends_at,updated_at=GREATEST(clock_timestamp(),app_update_channels.updated_at + interval '1 millisecond')
    RETURNING channel, platform, runtime_version, active_version, rollback_target_version,
      rollout_basis_points, paused, rollout_from_basis_points, rollout_to_basis_points,
      rollout_starts_at, rollout_ends_at, updated_at`, [track, platform, runtimeVersion, activeVersion,
    rollbackVersion, body.rolloutBasisPoints, body.paused, schedule?.fromBasisPoints ?? null,
    schedule?.toBasisPoints ?? null, schedule?.startsAt ?? null, schedule?.endsAt ?? null])
  const row = rows[0]
  if (row === undefined) throw new Error("App update channel upsert returned no row")
  yield* audit(input, "app_release.channel.update", "app_release_channel", `${track}/${platform}/${runtimeVersion}`,
    `Updated ${track} ${platform} app release channel`, { active_version: activeVersion, rollback_target_version: rollbackVersion })
  return mapChannel(row)
}))

const devicesForPush = (
  platforms: ReadonlyArray<string>,
  locales: ReadonlyArray<string>,
  environment: "production" | "sandbox",
) => database("Push device lookup failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql.unsafe<PushDeviceRow>(`SELECT user_id, device_id, platform, provider,
    environment, token_ciphertext, coalesce(nullif(locale,''),'en') locale
    FROM mobile_push_devices WHERE enabled=true AND environment=$3
      AND authorization_status IN ('authorized','provisional') AND platform=ANY($1)
      AND announcements_enabled=true AND (cardinality($2::text[])=0 OR
        lower(split_part(replace(coalesce(nullif(locale,''),''),'_','-'),'-',1))=ANY($2))`,
  [[...platforms], normalizeLocales(locales), environment])
}))

const pushAudience = (input: AdminOperationInput) => {
  const query = asRecord(input.query)
  const split = (value: unknown, fallback: ReadonlyArray<string>) => typeof value === "string" && value.length > 0
    ? value.split(",").map((item) => item.trim()).filter((item) => item.length > 0)
    : fallback
  return audienceCount(split(query.platforms, ["ios", "android"]), split(query.locales, []))
    .pipe(Effect.map((estimated_recipients) => ({ estimated_recipients })))
}

interface FcmServiceAccount {
  readonly client_email: string
  readonly private_key: string
  readonly token_uri?: string
}

const parseFcmAccount = (bindings: AdminWorkerBindings): Effect.Effect<FcmServiceAccount, UpstreamUnavailable> =>
  Effect.try({
    try: () => {
      const account = JSON.parse(bindings.MOBILE_PUSH_FCM_SERVICE_ACCOUNT_JSON ?? "") as Partial<FcmServiceAccount>
      if (typeof account.client_email !== "string" || typeof account.private_key !== "string") {
        throw new Error("service account is incomplete")
      }
      return account as FcmServiceAccount
    },
    catch: (cause) => new UpstreamUnavailable({ cause, message: "FCM service account is not configured" }),
  })

const fcmAccessToken = (bindings: AdminWorkerBindings) => Effect.gen(function* () {
  const account = yield* parseFcmAccount(bindings)
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token"
  const now = Math.floor(Date.now() / 1000)
  const privateKey = yield* Effect.tryPromise({
    try: () => importPKCS8(account.private_key, "RS256"),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "FCM private key import failed" }),
  })
  const assertion = yield* Effect.tryPromise({
    try: () => new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(account.client_email).setSubject(account.client_email).setAudience(tokenUri)
      .setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "FCM assertion signing failed" }),
  })
  const response = yield* Effect.tryPromise({
    try: () => fetch(tokenUri, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion,
      }),
    }),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "FCM OAuth request failed" }),
  })
  const payload = yield* Effect.tryPromise({
    try: () => response.json() as Promise<{ readonly access_token?: string; readonly error_description?: string }>,
    catch: (cause) => new UpstreamUnavailable({ cause, message: "FCM OAuth response was not JSON" }),
  })
  if (!response.ok || typeof payload.access_token !== "string") {
    return yield* new UpstreamUnavailable({ cause: undefined, message: payload.error_description ?? `FCM OAuth returned ${response.status}` })
  }
  return payload.access_token
})

interface PushMessage {
  readonly body: string
  readonly data: Readonly<Record<string, string>>
  readonly title: string
}

const sendFcm = (bindings: AdminWorkerBindings, token: string, message: PushMessage) => Effect.gen(function* () {
  const project = bindings.MOBILE_PUSH_FCM_PROJECT_ID?.trim() ?? ""
  if (project.length === 0) return yield* new UpstreamUnavailable({ cause: undefined, message: "FCM project is not configured" })
  const accessToken = yield* fcmAccessToken(bindings)
  const response = yield* Effect.tryPromise({
    try: () => fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { token, notification: { title: message.title, body: message.body }, data: message.data } }),
    }),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "FCM send failed" }),
  })
  const payload = yield* Effect.tryPromise({
    try: () => response.json() as Promise<{ readonly error?: { readonly message?: string }; readonly name?: string }>,
    catch: (cause) => new UpstreamUnavailable({ cause, message: "FCM response was not JSON" }),
  })
  if (!response.ok) return yield* new UpstreamUnavailable({ cause: undefined, message: payload.error?.message ?? `FCM returned ${response.status}` })
  return payload.name ?? ""
})

const requirePushConfiguration = (bindings: AdminWorkerBindings) => {
  if ((bindings.DATA_ENCRYPTION_KEY?.trim() ?? "").length === 0 ||
      (bindings.MOBILE_PUSH_FCM_PROJECT_ID?.trim() ?? "").length === 0 ||
      (bindings.MOBILE_PUSH_FCM_SERVICE_ACCOUNT_JSON?.trim() ?? "").length === 0) {
    return Effect.fail(new UpstreamUnavailable({ cause: undefined, message: "FCM sending is not configured" }))
  }
  return Effect.void
}

const sendLocalizedPush = (
  bindings: AdminWorkerBindings,
  devices: ReadonlyArray<PushDeviceRow>,
  messageForLocale: (locale: string) => PushMessage,
) => Effect.gen(function* () {
  yield* requirePushConfiguration(bindings)
  let sent = 0
  let skipped = 0
  for (const device of devices) {
    const outcome = yield* Effect.result(Effect.gen(function* () {
      if (device.provider !== "fcm") return yield* new UpstreamUnavailable({ cause: undefined, message: `Unsupported push provider ${device.provider}` })
      const token = yield* decryptPushToken(device.token_ciphertext, bindings.DATA_ENCRYPTION_KEY ?? "")
      yield* sendFcm(bindings, token, messageForLocale(normalizeLocale(device.locale) || "en"))
    }))
    if (outcome._tag === "Success") sent += 1
    else skipped += 1
  }
  return { sent, skipped }
})

const testPush = (input: AdminOperationInput) => Effect.gen(function* () {
  const body = asRecord(input.body)
  const platforms = Array.isArray(body.platforms) && body.platforms.length > 0
    ? body.platforms.map(String) : ["ios", "android"]
  const targetLocales = Array.isArray(body.target_locales) ? body.target_locales.map(String) : []
  const devices = yield* devicesForPush(platforms, targetLocales, "sandbox")
  const translations = asRecord(body.translations)
  const result = yield* sendLocalizedPush(input.bindings, devices, (locale) => {
    const translation = asRecord(translations[locale])
    return {
      title: typeof translation.title === "string" ? translation.title : String(body.title),
      body: typeof translation.body === "string" ? translation.body : String(body.body),
      data: {
        type: "campaign_test", campaign_id: String(body.campaign_id ?? ""),
        ...(typeof body.target_route === "string" ? { route: body.target_route } : {}),
      },
    }
  })
  yield* audit(input, "push.test", "campaign", String(body.campaign_id ?? ""),
    "Sent sandbox test notification", { eligible: devices.length, sent: result.sent, skipped: result.skipped })
  return { push_sent: result.sent, push_skipped: result.skipped, eligible_devices: devices.length }
})

const notificationLabTypes = [
  { id: "legend-attack", category: "Legend League", label: "Legend attack", description: "An attack by a notification-enabled bookmarked account.", title: "Legend attack", body: "Barbarian King attacked Archer Queen: 3 stars, 100%.", data: { type: "legend_battle", target_tag: "#PLAYER", battle_id: "00000000-0000-7000-8000-000000000001" } },
  { id: "legend-defense", category: "Legend League", label: "Legend defense", description: "A defense received by any notification-enabled account.", title: "Legend defense", body: "Archer Queen attacked Barbarian King: 2 stars, 86%.", data: { type: "legend_battle", target_tag: "#PLAYER", battle_id: "00000000-0000-7000-8000-000000000002" } },
  { id: "war-start", category: "War state", label: "Clan war started", description: "The tracking service found a new regular war.", title: "Clan war started", body: "A new war is available for your selected clan.", data: { type: "new_war", target_tag: "#CLAN" } },
  { id: "war-score", category: "War attacks", label: "War score updated", description: "A regular-war attack changed the score.", title: "War score updated", body: "A new attack changed the clan war score.", data: { type: "new_attacks", target_tag: "#CLAN" } },
  { id: "cwl-attack", category: "War attacks", label: "CWL score updated", description: "A CWL attack changed the score.", title: "War score updated", body: "A new attack changed the clan war score.", data: { type: "cwl_new_attacks", target_tag: "#CLAN" } },
  { id: "war-state", category: "War state", label: "War status changed", description: "Preparation, battle day, or war end state changed.", title: "War status changed", body: "Your clan war status changed.", data: { type: "war_state", target_tag: "#CLAN" } },
  { id: "cwl-state", category: "War state", label: "CWL updated", description: "A CWL round has new state information.", title: "CWL updated", body: "Your Clan War League round has new information.", data: { type: "cwl_war_update", target_tag: "#CLAN" } },
  { id: "war-reminder", category: "War reminders", label: "War attacks remaining", description: "A selected account still has attacks at a configured reminder time.", title: "War attacks remaining", body: "Barbarian King still has 1 attack left with 5 hours remaining.", data: { type: "war_reminder", target_tag: "#PLAYER" } },
  { id: "event-cwl", category: "Events", label: "CWL started", description: "The monthly Clan War League start alert.", title: "Clan War League has started", body: "Clan War League is now live in game.", data: { type: "admin_campaign", campaign_id: "game-event-cwl-test" } },
  { id: "event-clan-games", category: "Events", label: "Clan Games started", description: "The monthly Clan Games start alert.", title: "Clan Games have started", body: "Clan Games are now live in game.", data: { type: "admin_campaign", campaign_id: "game-event-clan-games-test" } },
  { id: "event-raid-weekend", category: "Events", label: "Raid Weekend started", description: "The weekly Raid Weekend start alert.", title: "Raid Weekend has started", body: "Raid Weekend is now live in game.", data: { type: "admin_campaign", campaign_id: "game-event-raid-weekend-test" } },
  { id: "event-season", category: "Events", label: "Season started", description: "The Clash of Clans season start alert.", title: "A new season has started", body: "The new Clash of Clans season is now live.", data: { type: "admin_campaign", campaign_id: "game-event-season-start-test" } },
  { id: "announcement", category: "Announcements", label: "App announcement", description: "A general campaign with an optional supported app route.", title: "ClashKing announcement", body: "This is a test app announcement.", data: { type: "admin_campaign", campaign_id: "notification-lab-announcement", route: "/posts" } },
  { id: "admin-post", category: "Announcements", label: "Published post", description: "A published admin post; replace post_id with a real post to test opening it.", title: "New from ClashKing", body: "Open this notification to read the post.", data: { type: "admin_post", post_id: "REPLACE_WITH_POST_ID", route: "/posts/REPLACE_WITH_POST_ID" } },
  { id: "monthly-support", category: "Monthly support", label: "Creator support reminder", description: "The monthly creator-code support reminder.", title: "New Season is Live", body: "A new season has started. If you're getting the Gold Pass, consider using creator code ClashKing.", data: { type: "admin_campaign", campaign_id: "monthly-support", route: "/settings/support" } },
] as const

const requireNotificationLab = (bindings: AdminWorkerBindings) =>
  bindings.ADMIN_NOTIFICATION_LAB_ENABLED === "true"
    ? Effect.void
    : Effect.fail(new NotFound({ message: "Notification lab is not enabled" }))

const labStatus = (input: AdminOperationInput) => Effect.gen(function* () {
  yield* requireNotificationLab(input.bindings)
  return { ready: Boolean(input.bindings.DATA_ENCRYPTION_KEY?.trim()) &&
    Boolean(input.bindings.MOBILE_PUSH_FCM_PROJECT_ID?.trim()) &&
    Boolean(input.bindings.MOBILE_PUSH_FCM_SERVICE_ACCOUNT_JSON?.trim()) }
})

const labDevices = (input: AdminOperationInput) => Effect.gen(function* () {
  yield* requireNotificationLab(input.bindings)
  return yield* database("Notification lab device lookup failed", Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql.unsafe<Record<string, unknown> & { readonly last_seen_at: Date | string }>(`SELECT
      md5(user_id || chr(31) || device_id || chr(31) || environment) id, user_id,
      user_id user_label, device_id, platform, provider, environment, app_version,
      ''::text build_number, ''::text os_version, ''::text device_model, enabled,
      authorization_status, locale, last_seen_at, war_attacks_enabled, war_state_enabled,
      war_reminders_enabled, events_enabled, announcements_enabled, monthly_support_enabled,
      reminder_timings FROM mobile_push_devices ORDER BY last_seen_at DESC, device_id`)
    return rows.map((row) => ({ ...row, last_seen_at: iso(row.last_seen_at) }))
  }))
})

const labSend = (input: AdminOperationInput) => Effect.gen(function* () {
  yield* requireNotificationLab(input.bindings)
  yield* requirePushConfiguration(input.bindings)
  const body = asRecord(input.body)
  const ids = Array.isArray(body.device_ids) ? body.device_ids.map(String) : []
  const sql = yield* SqlClient.SqlClient
  const devices = yield* database("Notification lab device lookup failed", sql.unsafe<PushDeviceRow>(`SELECT
    md5(user_id || chr(31) || device_id || chr(31) || environment) id, user_id, device_id,
    platform, provider, environment, token_ciphertext, coalesce(nullif(locale,''),'en') locale
    FROM mobile_push_devices WHERE md5(user_id || chr(31) || device_id || chr(31) || environment)=ANY($1::text[])`, [ids]))
  const byId = new Map(devices.map((device) => [device.id, device]))
  const results: Array<Record<string, unknown>> = []
  for (const id of ids) {
    const device = byId.get(id)
    if (device === undefined) {
      results.push({ device_id: id, status: "not_found" })
      continue
    }
    const result = yield* Effect.result(Effect.gen(function* () {
      if (device.provider !== "fcm") return yield* new UpstreamUnavailable({ cause: undefined, message: `Unsupported push provider ${device.provider}` })
      const token = yield* decryptPushToken(device.token_ciphertext, input.bindings.DATA_ENCRYPTION_KEY ?? "")
      return yield* sendFcm(input.bindings, token, {
        title: String(body.title), body: String(body.body), data: asRecord(body.data) as Readonly<Record<string, string>>,
      })
    }))
    const common = { device_id: id, device_name: device.device_id, platform: device.platform, environment: device.environment }
    results.push(result._tag === "Success"
      ? { ...common, status: "sent", provider_message_id: result.success }
      : { ...common, status: "failed", detail: result.failure.message })
  }
  const sent = results.filter((result) => result.status === "sent").length
  yield* audit(input, "push.lab_test", "device", ids.join(","),
    `Sent notification lab test to ${sent} of ${ids.length} devices`, { selected: ids.length, sent })
  return { selected: ids.length, sent, failed: ids.length - sent, results }
})

const publicObjectUrl = (bindings: AdminWorkerBindings, key: string): Effect.Effect<string, InvalidRequest> => {
  try {
    const origin = new URL(bindings.POSTS_PUBLIC_ORIGIN)
    if (origin.protocol !== "https:") throw new Error("not https")
    return Effect.succeed(`${origin.toString().replace(/\/$/u, "")}/${key.split("/").map(encodeURIComponent).join("/")}`)
  } catch {
    return Effect.fail(new InvalidRequest({ message: "POSTS_PUBLIC_ORIGIN must be an HTTPS URL" }))
  }
}

const sha256Hex = (bytes: ArrayBuffer): Effect.Effect<string, UpstreamUnavailable> => Effect.tryPromise({
  try: async () => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((value) => value.toString(16).padStart(2, "0")).join(""),
  catch: (cause) => new UpstreamUnavailable({ cause, message: "Upload checksum failed" }),
})

const uploadMedia = (input: AdminOperationInput) => Effect.gen(function* () {
  const form = input.body
  if (!(form instanceof FormData)) return yield* new InvalidRequest({ message: "Multipart form data is required" })
  const file = form.get("file")
  if (!(file instanceof File)) return yield* new InvalidRequest({ message: "A file field is required" })
  if (file.size > 25 * 1024 * 1024) return yield* new PayloadTooLarge({ message: "File exceeds the 25 MB limit" })
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  const contentTypes: Readonly<Record<string, string>> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  }
  const contentType = contentTypes[extension]
  if (contentType === undefined) return yield* new InvalidRequest({ message: `Unsupported media extension .${extension}`, status: 415 })
  const key = `admin-posts/${crypto.randomUUID()}.${extension}`
  const url = yield* publicObjectUrl(input.bindings, key)
  yield* Effect.tryPromise({
    try: () => input.bindings.POSTS.put(key, file.stream(), {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    }),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Media upload failed" }),
  })
  return { url }
})

const uploadStory = (input: AdminOperationInput) => Effect.gen(function* () {
  const form = input.body
  if (!(form instanceof FormData)) return yield* new InvalidRequest({ message: "Multipart form data is required" })
  const file = form.get("file")
  if (!(file instanceof File)) return yield* new InvalidRequest({ message: "A file field is required" })
  if (!file.name.toLowerCase().endsWith(".html")) {
    return yield* new InvalidRequest({ message: "Story file must use the .html extension", status: 415 })
  }
  if (file.size > 25 * 1024 * 1024) return yield* new PayloadTooLarge({ message: "File exceeds the 25 MB limit" })
  const rawSlug = String(form.get("slug") ?? "story")
  const slug = rawSlug.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "story"
  const key = `admin-stories/${slug}/v1-${crypto.randomUUID()}.html`
  const url = yield* publicObjectUrl(input.bindings, key)
  const bytes = yield* awaitArrayBuffer(file)
  const checksum = yield* sha256Hex(bytes)
  yield* Effect.tryPromise({
    try: () => input.bindings.POSTS.put(key, bytes, {
      httpMetadata: { contentType: "text/html; charset=utf-8", cacheControl: "public, max-age=31536000, immutable" },
    }),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Story upload failed" }),
  })
  return {
    url, version: 1 as const, storage_provider: "r2" as const,
    key, size_bytes: bytes.byteLength, checksum,
  }
})

const awaitArrayBuffer = (file: File): Effect.Effect<ArrayBuffer, UpstreamUnavailable> => Effect.tryPromise({
  try: () => file.arrayBuffer(),
  catch: (cause) => new UpstreamUnavailable({ cause, message: "Upload could not be read" }),
})

const operationFor = (
  operationId: string,
  input: AdminOperationInput,
): Effect.Effect<unknown, ApiFailure, SqlClient.SqlClient> => {
  switch (operationId) {
    case "adminMe": return Effect.succeed(input.principal)
    case "adminDashboard": return dashboard(input)
    case "adminAudit": return listAudit(input)
    case "adminProxyStats": return proxyStats(input)
    case "adminTrackingSummary": return executeTrackingRead("summary", input.query)
    case "adminTrackingTimeseries": return executeTrackingRead("timeseries", input.query)
    case "adminListDeveloperApplications": return listDeveloperApplications()
    case "adminCreateDeveloperApplication": return createDeveloperApplication(input)
    case "adminGetDeveloperApplication": return getDeveloperApplication(input)
    case "adminUpdateDeveloperApplication": return updateDeveloperApplication(input)
    case "adminDeleteDeveloperApplication": return deleteDeveloperApplication(input)
    case "adminListFeatureFlags": return listFeatureFlags()
    case "adminCreateFeatureFlag": return createFeatureFlag(input)
    case "adminUpdateFeatureFlag": return updateFeatureFlag(input)
    case "adminListAppReleases": return listAppReleases(input)
    case "adminUpdateAppReleaseChannel": return updateAppReleaseChannel(input)
    case "adminListPosts": return listPosts(input)
    case "adminCreatePost": return createPostFrom(input, asRecord(input.body))
    case "adminGetPost": return getPost(input)
    case "adminUpdatePost": return updatePostWith(input, String(asRecord(input.path).id), asRecord(input.body))
    case "adminArchivePost": return archivePost(input)
    case "adminPostAudience": return postAudience(input)
    case "adminPostDeliveries": return postDeliveries(input)
    case "adminPostRevisions": return postRevisions(input)
    case "adminRestorePostRevision": return restorePostRevision(input)
    case "adminPublishPost": return publishPost(input)
    case "adminPushPost": return pushPost(input)
    case "adminDuplicatePost": return duplicatePost(input)
    case "adminListCampaigns": return listCampaigns()
    case "adminCreateCampaign": return createCampaign(input)
    case "adminUpdateCampaign": return updateCampaign(input)
    case "adminPushAudience": return pushAudience(input)
    case "adminTestPush": return testPush(input)
    case "adminLabTypes": return requireNotificationLab(input.bindings).pipe(Effect.as(notificationLabTypes))
    case "adminLabStatus": return labStatus(input)
    case "adminLabDevices": return labDevices(input)
    case "adminLabSend": return labSend(input)
    case "adminMediaUpload": return uploadMedia(input)
    case "adminStoryUpload": return uploadStory(input)
    default: return Effect.fail(new NotFound({ message: `Unknown admin operation ${operationId}` }))
  }
}

const databaseMutations = new Set([
  "adminCreateDeveloperApplication", "adminUpdateDeveloperApplication", "adminDeleteDeveloperApplication",
  "adminCreateFeatureFlag", "adminUpdateFeatureFlag", "adminUpdateAppReleaseChannel",
  "adminCreatePost", "adminUpdatePost", "adminArchivePost", "adminRestorePostRevision",
  "adminPublishPost", "adminPushPost", "adminDuplicatePost", "adminCreateCampaign", "adminUpdateCampaign",
])

const validateOperationInput = (operationId: string, input: AdminOperationInput): Effect.Effect<void, InvalidRequest> => {
  const body = asRecord(input.body)
  const dates = ["startsAt", "endsAt", "starts_at", "ends_at", "send_at"]
  const schedule = asRecord(body.schedule)
  const dateValues = [...dates.map((key) => body[key]), schedule.startsAt, schedule.endsAt]
  if (dateValues.some((value) => value !== undefined && value !== null &&
      (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))))) {
    return Effect.fail(new InvalidRequest({ message: "Dates must be valid ISO datetimes with an explicit timezone" }))
  }
  for (const key of ["title", "body", "summary", "name", "key", "developer_name", "owner"]) {
    const value = body[key]
    if (typeof value === "string" && value.trim().length === 0) {
      return Effect.fail(new InvalidRequest({ message: `${key} must not be blank` }))
    }
  }
  if (Array.isArray(body.platforms) && new Set(body.platforms).size !== body.platforms.length) {
    return Effect.fail(new InvalidRequest({ message: "Platforms must be unique" }))
  }
  if (operationId === "adminLabSend") {
    const entries = Object.entries(asRecord(body.data))
    if (entries.length > 25 || entries.some(([key, value]) => key.trim().length === 0 || key.length > 100 ||
        typeof value !== "string" || value.length > 2000)) {
      return Effect.fail(new InvalidRequest({ message: "Notification data exceeds the allowed key or value limits" }))
    }
  }
  if (operationId === "adminUpdateAppReleaseChannel") {
    const runtimeVersion = asRecord(input.path).runtimeVersion
    if (typeof runtimeVersion !== "string" || runtimeVersion.trim() !== runtimeVersion ||
        runtimeVersion.length === 0 || runtimeVersion.length > 200) {
      return Effect.fail(new InvalidRequest({ message: "Invalid app runtime version" }))
    }
  }
  return Effect.void
}

export const executeAdminOperation = (
  operationId: string,
  input: AdminOperationInput,
): Effect.Effect<unknown, ApiFailure, SqlClient.SqlClient> => validateOperationInput(operationId, input).pipe(
  Effect.flatMap(() => databaseMutations.has(operationId)
    ? database("Admin transaction failed", Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const operation = operationFor(operationId, input)
        if (operationId === "adminUpdateAppReleaseChannel") {
          // Selection rejections retain the original status/detail response, but
          // must fail the transaction so a first-time key claim is not committed.
          return yield* sql.withTransaction(operation.pipe(Effect.flatMap((value) =>
            value instanceof Response && value.status >= 400 ? Effect.fail(value) : Effect.succeed(value),
          ))).pipe(Effect.catch((cause) => cause instanceof Response ? Effect.succeed(cause) : Effect.fail(cause)))
        }
        return yield* sql.withTransaction(operation)
      }))
    : operationFor(operationId, input)),
)

export const adminOperationInternals = { compareVersions, mapCampaign, mapDelivery, mapPost, normalizeLocale, normalizeLocales, validReleaseMarker }
