import { Schema } from "effect"

import { defineEndpoint, NoBody, NoContent, NoPathParams, NoQuery } from "./endpoint.js"

const NonEmptyString = Schema.String.check(Schema.isMinLength(1))
const IntBetween = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isBetween({ minimum, maximum }))
const UUID = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
)
const StringMap = Schema.Record(Schema.String, Schema.String)
const UnknownMap = Schema.Record(Schema.String, Schema.Unknown)

export const AdminRole = Schema.Literals(["owner", "admin"])
export const AdminUser = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  username: Schema.String,
  display_name: Schema.String,
  avatar_url: Schema.optionalKey(Schema.String),
  role: AdminRole,
  active: Schema.Boolean,
  last_login_at: Schema.optionalKey(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
})

export const Platform = Schema.Literals(["ios", "android", "web"])
export const FeatureFlag = Schema.Struct({
  key: Schema.String,
  name: Schema.String,
  description: Schema.String,
  enabled: Schema.Boolean,
  rolloutPercentage: IntBetween(0, 100),
  minAppVersion: Schema.optionalKey(Schema.String),
  platforms: Schema.Array(Platform),
  owner: Schema.String,
  lastUpdated: Schema.String,
  publicExposure: Schema.Literals(["safe", "sensitive"]),
  startsAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
  endsAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export const CreateFeatureFlagInput = Schema.Struct({
  key: NonEmptyString,
  name: NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  enabled: Schema.optionalKey(Schema.Boolean),
  rolloutPercentage: Schema.optionalKey(IntBetween(0, 100)),
  minAppVersion: Schema.optionalKey(Schema.String),
  platforms: Schema.optionalKey(Schema.Array(Platform).check(Schema.isMaxLength(3))),
  owner: Schema.optionalKey(NonEmptyString),
  publicExposure: Schema.optionalKey(Schema.Literals(["safe", "sensitive"])),
  startsAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
  endsAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export const UpdateFeatureFlagInput = Schema.Struct({
  name: Schema.optionalKey(NonEmptyString),
  description: Schema.optionalKey(Schema.String),
  enabled: Schema.optionalKey(Schema.Boolean),
  rolloutPercentage: Schema.optionalKey(IntBetween(0, 100)),
  minAppVersion: Schema.optionalKey(Schema.String),
  platforms: Schema.optionalKey(Schema.Array(Platform).check(Schema.isMaxLength(3))),
  owner: Schema.optionalKey(NonEmptyString),
  publicExposure: Schema.optionalKey(Schema.Literals(["safe", "sensitive"])),
  startsAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
  endsAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
})

export const DeveloperApplication = Schema.Struct({
  application_id: UUID,
  developer_name: Schema.String,
  api_request_count: Schema.String.check(Schema.isPattern(/^\d+$/u)),
  links_lookup_count: Schema.String.check(Schema.isPattern(/^\d+$/u)),
  token_prefix: Schema.String,
  token_last_used_at: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  revoked_at: Schema.NullOr(Schema.String),
})
export const CreateDeveloperApplicationInput = Schema.Struct({
  developer_name: NonEmptyString.check(Schema.isMaxLength(120)),
})
export const UpdateDeveloperApplicationInput = Schema.Struct({
  developer_name: NonEmptyString.check(Schema.isMaxLength(120)),
})
export const CreatedDeveloperApplication = Schema.Struct({
  ...DeveloperApplication.fields,
  api_token: Schema.String.check(Schema.isPattern(/^ck_dev_/u)),
})

export const PostStatus = Schema.Literals(["draft", "scheduled", "live", "expired", "archived"])
export const PostPresentationType = Schema.Literals(["article", "story"])
export const PostBlock = Schema.Union([
  Schema.Struct({ type: Schema.Literal("heading"), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("paragraph"), text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("bullet_list"), items: Schema.Array(Schema.String) }),
  Schema.Struct({
    type: Schema.Literal("image"),
    url: Schema.String,
    caption: Schema.optionalKey(Schema.String),
  }),
])
export const PostTranslation = Schema.Struct({
  title: Schema.String,
  summary: Schema.String,
  body_blocks: Schema.optionalKey(Schema.Array(PostBlock)),
  push_title: Schema.optionalKey(Schema.String),
  push_body: Schema.optionalKey(Schema.String),
})
const Translations = Schema.Record(Schema.String, PostTranslation)
export const Post = Schema.Struct({
  id: UUID,
  slug: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  hero_image_url: Schema.optionalKey(Schema.String),
  body_blocks: Schema.Array(PostBlock),
  translations: Translations,
  presentation_type: PostPresentationType,
  story_url: Schema.optionalKey(Schema.String),
  story_version: Schema.Number,
  story_history: Schema.Array(Schema.String),
  revision_number: Schema.Number,
  show_on_home: Schema.Boolean,
  pinned_on_home: Schema.Boolean,
  target_route: Schema.optionalKey(Schema.String),
  platforms: Schema.Array(Platform),
  dismissible: Schema.Boolean,
  priority: IntBetween(0, 10_000),
  status: PostStatus,
  starts_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ends_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  also_push_on_publish: Schema.Boolean,
  push_title: Schema.optionalKey(Schema.String),
  push_body: Schema.optionalKey(Schema.String),
  published_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  push_sent_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  created_by: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
})
const PostInputFields = {
  title: Schema.optionalKey(NonEmptyString.check(Schema.isMaxLength(240))),
  summary: Schema.optionalKey(NonEmptyString.check(Schema.isMaxLength(2_000))),
  hero_image_url: Schema.optionalKey(Schema.NullOr(Schema.String)),
  body_blocks: Schema.optionalKey(Schema.Array(PostBlock).check(Schema.isMaxLength(200))),
  translations: Schema.optionalKey(Translations),
  presentation_type: Schema.optionalKey(PostPresentationType),
  story_url: Schema.optionalKey(Schema.NullOr(Schema.String)),
  show_on_home: Schema.optionalKey(Schema.Boolean),
  pinned_on_home: Schema.optionalKey(Schema.Boolean),
  target_route: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isMaxLength(500)))),
  platforms: Schema.optionalKey(Schema.Array(Platform).check(Schema.isMaxLength(3))),
  dismissible: Schema.optionalKey(Schema.Boolean),
  priority: Schema.optionalKey(IntBetween(0, 10_000)),
  starts_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  ends_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  also_push_on_publish: Schema.optionalKey(Schema.Boolean),
  push_title: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isMaxLength(240)))),
  push_body: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isMaxLength(2_000)))),
} as const
export const CreatePostInput = Schema.Struct({
  ...PostInputFields,
  title: NonEmptyString.check(Schema.isMaxLength(240)),
  summary: NonEmptyString.check(Schema.isMaxLength(2_000)),
})
export const UpdatePostInput = Schema.Struct(PostInputFields)
export const PostRevision = Schema.Struct({
  id: UUID,
  post_id: UUID,
  revision_number: Schema.Number,
  snapshot: Post,
  created_by: Schema.String,
  created_at: Schema.String,
})
export const PostDeliveryAttempt = Schema.Struct({
  id: UUID,
  post_id: UUID,
  attempt_number: Schema.Number,
  trigger: Schema.Literals(["publish", "retry", "manual"]),
  eligible_count: Schema.Number,
  sent_count: Schema.Number,
  skipped_count: Schema.Number,
  status: Schema.Literals(["queued", "processing", "sent", "partial", "failed", "no_audience"]),
  error_summary: Schema.optionalKey(Schema.String),
  attempted_at: Schema.String,
})

export const CampaignTranslation = Schema.Struct({ title: Schema.String, body: Schema.String })
const CampaignTranslations = Schema.Record(Schema.String, CampaignTranslation)
export const CampaignStatus = Schema.Literals(["draft", "scheduled", "sent", "paused"])
export const CampaignTriggerType = Schema.Literals(["manual", "monthly"])
export const Campaign = Schema.Struct({
  id: UUID,
  key: Schema.String,
  title: Schema.String,
  body: Schema.String,
  target_route: Schema.optionalKey(Schema.NullOr(Schema.String)),
  platforms: Schema.Array(Platform),
  target_locales: Schema.Array(Schema.String),
  translations: CampaignTranslations,
  status: CampaignStatus,
  trigger_type: CampaignTriggerType,
  day_of_month: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  send_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  send_time: Schema.optionalKey(Schema.NullOr(Schema.String)),
  last_sent_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  created_by: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
})
const CampaignInputFields = {
  title: Schema.optionalKey(NonEmptyString.check(Schema.isMaxLength(240))),
  body: Schema.optionalKey(NonEmptyString.check(Schema.isMaxLength(2_000))),
  target_route: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isMaxLength(500)))),
  platforms: Schema.optionalKey(Schema.Array(Platform).check(Schema.isMaxLength(3))),
  target_locales: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(100))),
  translations: Schema.optionalKey(CampaignTranslations),
  status: Schema.optionalKey(CampaignStatus),
  trigger_type: Schema.optionalKey(CampaignTriggerType),
  day_of_month: Schema.optionalKey(Schema.NullOr(IntBetween(1, 28))),
  send_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
  send_time: Schema.optionalKey(Schema.NullOr(Schema.String.check(Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/u)))),
} as const
export const CreateCampaignInput = Schema.Struct({
  ...CampaignInputFields,
  title: NonEmptyString.check(Schema.isMaxLength(240)),
  body: NonEmptyString.check(Schema.isMaxLength(2_000)),
})
export const UpdateCampaignInput = Schema.Struct(CampaignInputFields)

export const TestPushInput = Schema.Struct({
  title: NonEmptyString.check(Schema.isMaxLength(240)),
  body: NonEmptyString.check(Schema.isMaxLength(2_000)),
  campaign_id: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(100))),
  target_route: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(500))),
  platforms: Schema.optionalKey(Schema.Array(Platform).check(Schema.isMaxLength(3))),
  target_locales: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(100))),
  translations: Schema.optionalKey(CampaignTranslations),
})
export const PushResult = Schema.Struct({
  push_sent: Schema.Number,
  push_skipped: Schema.Number,
  eligible_devices: Schema.Number,
})

export const NotificationPreset = Schema.Struct({
  id: Schema.String,
  category: Schema.String,
  label: Schema.String,
  description: Schema.String,
  title: Schema.String,
  body: Schema.String,
  data: StringMap,
})
export const LabDevice = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  user_label: Schema.String,
  device_id: Schema.String,
  platform: Schema.Literals(["ios", "android"]),
  provider: Schema.String,
  environment: Schema.Literals(["sandbox", "production"]),
  app_version: Schema.String,
  build_number: Schema.String,
  os_version: Schema.String,
  device_model: Schema.String,
  enabled: Schema.Boolean,
  authorization_status: Schema.String,
  locale: Schema.String,
  last_seen_at: Schema.String,
  war_attacks_enabled: Schema.Boolean,
  war_state_enabled: Schema.Boolean,
  war_reminders_enabled: Schema.Boolean,
  events_enabled: Schema.Boolean,
  announcements_enabled: Schema.Boolean,
  monthly_support_enabled: Schema.Boolean,
  reminder_timings: Schema.Array(Schema.Number),
})
export const LabStatus = Schema.Struct({ ready: Schema.Boolean })
export const LabSendInput = Schema.Struct({
  device_ids: Schema.Array(Schema.String.check(Schema.isPattern(/^[a-f0-9]{32}$/u))).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(25),
  ),
  title: NonEmptyString.check(Schema.isMaxLength(240)),
  body: NonEmptyString.check(Schema.isMaxLength(2_000)),
  data: StringMap,
})
export const LabResult = Schema.Struct({
  device_id: Schema.String,
  device_name: Schema.optionalKey(Schema.String),
  platform: Schema.optionalKey(Schema.String),
  environment: Schema.optionalKey(Schema.String),
  status: Schema.Literals(["sent", "failed", "not_found"]),
  detail: Schema.optionalKey(Schema.String),
  provider_message_id: Schema.optionalKey(Schema.String),
})
export const LabSendResponse = Schema.Struct({
  selected: Schema.Number,
  sent: Schema.Number,
  failed: Schema.Number,
  results: Schema.Array(LabResult),
})

const Count = Schema.Number
export const AdminDashboardSnapshot = Schema.Struct({
  generated_at: Schema.String,
  devices: Schema.Struct({
    total: Count, production: Count, sandbox: Count, android: Count, ios: Count,
    authorized: Count, opted_in: Count, active_24h: Count, active_7d: Count,
  }),
  content: Schema.Struct({
    live_posts: Count, scheduled_posts: Count, draft_posts: Count,
    scheduled_campaigns: Count, recurring_campaigns: Count,
  }),
  delivery: Schema.Struct({
    attempts: Count, eligible: Count, sent: Count, skipped: Count, failed: Count,
    success_rate: Schema.Number,
    last_attempt: Schema.optionalKey(Schema.String),
    next_send_at: Schema.optionalKey(Schema.String),
  }),
  daily: Schema.Array(Schema.Struct({ date: Schema.String, attempts: Count, eligible: Count, sent: Count, skipped: Count, failed: Count })),
  audience_daily: Schema.Array(Schema.Struct({ date: Schema.String, total: Count, production: Count, sandbox: Count, opted_in: Count })),
  app_versions: Schema.Array(Schema.Struct({ value: Schema.String, count: Count })),
  locales: Schema.Array(Schema.Struct({ value: Schema.String, count: Count })),
})
export const AdminAuditEvent = Schema.Struct({
  id: Schema.String, actor: Schema.String, action: Schema.String, resource_type: Schema.String,
  resource_id: Schema.String, summary: Schema.String, metadata: UnknownMap, ip_address: Schema.String,
  user_agent: Schema.String, created_at: Schema.String,
})

export const ProxyStatusCounts = Schema.Struct({ "2xx": Count, "3xx": Count, "4xx": Count, "5xx": Count })
export const ProxyStatsWindow = Schema.Struct({
  requests: Count, avg_rps: Schema.Number, avg_latency_ms: Schema.NullOr(Schema.Number),
  status_counts: ProxyStatusCounts, proxy_failures: Count,
})
export const ProxySeriesPoint = Schema.Struct({ ...ProxyStatsWindow.fields, start: Schema.String, end: Schema.String })
export const ProxyStatsResponse = Schema.Struct({
  now: Schema.String,
  windows: Schema.Record(Schema.String, ProxyStatsWindow),
  series_data: Schema.optionalKey(Schema.Struct({
    interval: Schema.Literals(["1m", "5m", "15m", "30m", "1h"]),
    lookback: Schema.Literals(["1h", "6h", "12h", "24h", "48h"]),
    points: Schema.Array(ProxySeriesPoint),
  })),
  endpoint_breakdown: Schema.optionalKey(Schema.Struct({
    window: Schema.Literals(["24h", "7d"]), limit: Schema.Number,
    endpoints: Schema.Array(Schema.Struct({ endpoint: Schema.String, requests: Count })),
  })),
})

const TrackingHealth = Schema.Struct({ healthy: Schema.Boolean, reported_healthy: Schema.Boolean, stale: Schema.Boolean, observed_at: Schema.String, age_seconds: Count, stale_after_seconds: Count })
const TrackingDatabaseMetrics = Schema.Struct({ batch_count: Count, rows_requested: Count, rows_affected: Count, average_store_duration_ms: Schema.Number })
const TrackingTargetProgress = Schema.Struct({ target_count: Count, current_cycle: Count, processed_targets: Count, targets_per_second: Schema.Number, completion_percentage: Schema.Number, estimated_seconds_remaining: Schema.optionalKey(Schema.Number), estimated_loop_completion: Schema.optionalKey(Schema.String) })
const TrackingProcessState = Schema.Struct({ script: Schema.String, run_id: Count, interval_start: Schema.String, interval_end: Schema.String, process_started_at: Schema.String, ram_bytes: Count, uptime_seconds: Count, goroutines: Count, heap_objects: Count, gc_cycles: Count, health: TrackingHealth })
const TrackingDomainState = Schema.Struct({ script: Schema.String, domain: Schema.String, run_id: Count, interval_start: Schema.String, interval_end: Schema.String, interval_duration_seconds: Count, last_success: Schema.optionalKey(Schema.String), latest_error: Schema.optionalKey(Schema.String), request_count: Count, requests_per_second: Schema.Number, error_count: Count, error_rate: Schema.Number, average_request_latency_ms: Schema.Number, write_count: Count, writes_per_second: Schema.Number, processing_count: Count, average_processing_duration_ms: Schema.Number, queue_depth: Count, database: TrackingDatabaseMetrics, targets: TrackingTargetProgress, health: TrackingHealth })
export const TrackingSummaryResponse = Schema.Struct({ generated_at: Schema.String, stale_after_seconds: Count, processes: Schema.Array(TrackingProcessState), domains: Schema.Array(TrackingDomainState), globalclans: Schema.optionalKey(Schema.Struct({ priority: Schema.optionalKey(TrackingTargetProgress), non_priority: Schema.optionalKey(TrackingTargetProgress) })) })
const TrackingProcessPoint = Schema.Struct({ timestamp: Schema.String, observed_at: Schema.String, ram_bytes: Count, uptime_seconds: Count, goroutines: Count, heap_objects: Count, gc_cycles: Count })
const TrackingDomainPoint = Schema.Struct({ timestamp: Schema.String, observed_at: Schema.String, interval_duration_seconds: Count, request_count: Count, requests_per_second: Schema.Number, error_count: Count, error_rate: Schema.Number, average_request_latency_ms: Schema.Number, write_count: Count, writes_per_second: Schema.Number, processing_count: Count, average_processing_duration_ms: Schema.Number, queue_depth: Count, database: TrackingDatabaseMetrics, targets: TrackingTargetProgress, reported_healthy: Schema.Boolean })
export const TrackingTimeSeriesResponse = Schema.Struct({ generated_at: Schema.String, window: Schema.Literals(["15m", "1h", "6h", "24h"]), start: Schema.String, end: Schema.String, bucket_seconds: Count, max_points_per_series: Count, processes: Schema.Array(Schema.Struct({ script: Schema.String, points: Schema.Array(TrackingProcessPoint) })), domains: Schema.Array(Schema.Struct({ script: Schema.String, domain: Schema.String, points: Schema.Array(TrackingDomainPoint) })) })

export const AppReleaseTrack = Schema.Literals(["beta", "production"])
export const AppReleasePlatform = Schema.Literals(["ios", "android"])
const ReleasePlatformInfo = Schema.Struct({ runtimeVersion: Schema.String, fingerprint: Schema.optionalKey(Schema.String), manifest: Schema.optionalKey(Schema.Struct({ id: Schema.optionalKey(Schema.String) })) })
const ReleasePlatforms = Schema.Struct({
  ios: Schema.optionalKey(ReleasePlatformInfo),
  android: Schema.optionalKey(ReleasePlatformInfo),
})
const RollbackPlatformInfo = Schema.Struct({ runtimeVersion: Schema.String, key: Schema.String })
const RollbackPlatforms = Schema.Struct({
  ios: Schema.optionalKey(RollbackPlatformInfo),
  android: Schema.optionalKey(RollbackPlatformInfo),
})
export const AppReleaseMarker = Schema.Struct({ schemaVersion: Schema.Literal(1), version: Schema.String, appVersion: Schema.String, track: AppReleaseTrack, type: Schema.Literals(["native", "ota"]), gitSha: Schema.String, createdAt: Schema.String, releaseNotes: Schema.optionalKey(Schema.String), platforms: ReleasePlatforms, rollbackTargets: Schema.optionalKey(Schema.Record(Schema.String, Schema.Struct({ type: Schema.Literals(["native", "ota"]), gitSha: Schema.optionalKey(Schema.String), platforms: RollbackPlatforms }))) })
const AppUpdateSchedule = Schema.Struct({ fromBasisPoints: IntBetween(0, 10_000), toBasisPoints: IntBetween(0, 10_000), startsAt: Schema.String, endsAt: Schema.String })
export const AppUpdateChannel = Schema.Struct({ channel: AppReleaseTrack, platform: AppReleasePlatform, runtimeVersion: Schema.String, activeVersion: Schema.NullOr(Schema.String), rollbackTargetVersion: Schema.NullOr(Schema.String), rolloutBasisPoints: IntBetween(0, 10_000), paused: Schema.Boolean, schedule: Schema.NullOr(AppUpdateSchedule), updatedAt: Schema.String })
export const AppUpdateChannelInput = Schema.Struct({ activeVersion: Schema.NullOr(Schema.String), rollbackTargetVersion: Schema.NullOr(Schema.String), rolloutBasisPoints: IntBetween(0, 10_000), paused: Schema.Boolean, schedule: Schema.NullOr(AppUpdateSchedule) })
export const AppReleasesResponse = Schema.Struct({ releases: Schema.Array(AppReleaseMarker), channels: Schema.Array(AppUpdateChannel) })

const adminRead = { auth: "admin" as const, body: NoBody, bodyMode: "none" as const, responseMode: "json" as const, successStatus: 200 }
const adminJson = { auth: "admin" as const, bodyMode: "json" as const, responseMode: "json" as const, successStatus: 200 }
const IdPath = Schema.Struct({ id: UUID })
const ApplicationIdPath = Schema.Struct({ applicationId: UUID })

export const AdminMeEndpoint = defineEndpoint({ ...adminRead, operationId: "adminMe", method: "GET", path: "/v2/admin/me", summary: "Get the verified admin principal", pathParams: NoPathParams, query: NoQuery, response: AdminUser })
export const AdminDashboardEndpoint = defineEndpoint({ ...adminRead, operationId: "adminDashboard", method: "GET", path: "/v2/admin/dashboard", summary: "Get the admin dashboard snapshot", pathParams: NoPathParams, query: Schema.Struct({ days: Schema.optionalKey(IntBetween(1, 365)) }), response: AdminDashboardSnapshot })
export const AdminAuditEndpoint = defineEndpoint({ ...adminRead, operationId: "adminAudit", method: "GET", path: "/v2/admin/audit", summary: "List admin audit events", pathParams: NoPathParams, query: Schema.Struct({ actor: Schema.optionalKey(Schema.String), action: Schema.optionalKey(Schema.String), resource_type: Schema.optionalKey(Schema.String), limit: Schema.optionalKey(IntBetween(1, 500)) }), response: Schema.Array(AdminAuditEvent) })
export const AdminProxyStatsEndpoint = defineEndpoint({ ...adminRead, operationId: "adminProxyStats", method: "GET", path: "/v2/admin/proxy/stats", summary: "Get proxy statistics", pathParams: NoPathParams, query: Schema.Struct({ series: Schema.optionalKey(Schema.Literals(["1m", "5m", "15m", "30m", "1h"])), lookback: Schema.optionalKey(Schema.Literals(["1h", "6h", "12h", "24h", "48h"])), endpoints: Schema.optionalKey(Schema.Literals(["24h", "7d"])), limit: Schema.optionalKey(IntBetween(1, 100)) }), response: ProxyStatsResponse })
export const AdminTrackingSummaryEndpoint = defineEndpoint({ ...adminRead, operationId: "adminTrackingSummary", method: "GET", path: "/v2/admin/tracking/summary", summary: "Get tracking health summary", pathParams: NoPathParams, query: NoQuery, response: TrackingSummaryResponse })
export const AdminTrackingTimeseriesEndpoint = defineEndpoint({ ...adminRead, operationId: "adminTrackingTimeseries", method: "GET", path: "/v2/admin/tracking/timeseries", summary: "Get tracking timeseries", pathParams: NoPathParams, query: Schema.Struct({ window: Schema.Literals(["15m", "1h", "6h", "24h"]), script: Schema.optionalKey(Schema.String) }), response: TrackingTimeSeriesResponse })

export const AdminListDeveloperApplicationsEndpoint = defineEndpoint({ ...adminRead, operationId: "adminListDeveloperApplications", method: "GET", path: "/v2/admin/developer-applications", summary: "List developer applications", pathParams: NoPathParams, query: NoQuery, response: Schema.Array(DeveloperApplication) })
export const AdminCreateDeveloperApplicationEndpoint = defineEndpoint({ ...adminJson, successStatus: 201, operationId: "adminCreateDeveloperApplication", method: "POST", path: "/v2/admin/developer-applications", summary: "Create a developer application", pathParams: NoPathParams, query: NoQuery, body: CreateDeveloperApplicationInput, response: CreatedDeveloperApplication })
export const AdminGetDeveloperApplicationEndpoint = defineEndpoint({ ...adminRead, operationId: "adminGetDeveloperApplication", method: "GET", path: "/v2/admin/developer-applications/:applicationId", summary: "Get a developer application", pathParams: ApplicationIdPath, query: NoQuery, response: DeveloperApplication })
export const AdminUpdateDeveloperApplicationEndpoint = defineEndpoint({ ...adminJson, operationId: "adminUpdateDeveloperApplication", method: "PATCH", path: "/v2/admin/developer-applications/:applicationId", summary: "Update a developer application", pathParams: ApplicationIdPath, query: NoQuery, body: UpdateDeveloperApplicationInput, response: DeveloperApplication })
export const AdminDeleteDeveloperApplicationEndpoint = defineEndpoint({ auth: "admin", operationId: "adminDeleteDeveloperApplication", method: "DELETE", path: "/v2/admin/developer-applications/:applicationId", summary: "Revoke and delete a developer application", pathParams: ApplicationIdPath, query: NoQuery, body: NoBody, bodyMode: "none", response: NoContent, responseMode: "none", successStatus: 204 })

export const AdminListFeatureFlagsEndpoint = defineEndpoint({ ...adminRead, operationId: "adminListFeatureFlags", method: "GET", path: "/v2/admin/feature-flags", summary: "List feature flags", pathParams: NoPathParams, query: NoQuery, response: Schema.Array(FeatureFlag) })
export const AdminCreateFeatureFlagEndpoint = defineEndpoint({ ...adminJson, successStatus: 201, operationId: "adminCreateFeatureFlag", method: "POST", path: "/v2/admin/feature-flags", summary: "Create a feature flag", pathParams: NoPathParams, query: NoQuery, body: CreateFeatureFlagInput, response: FeatureFlag })
export const AdminUpdateFeatureFlagEndpoint = defineEndpoint({ ...adminJson, operationId: "adminUpdateFeatureFlag", method: "PATCH", path: "/v2/admin/feature-flags/:key", summary: "Update a feature flag", pathParams: Schema.Struct({ key: Schema.String }), query: NoQuery, body: UpdateFeatureFlagInput, response: FeatureFlag })

export const AdminListAppReleasesEndpoint = defineEndpoint({ ...adminRead, operationId: "adminListAppReleases", method: "GET", path: "/v2/admin/app-releases", summary: "List app releases and channels", pathParams: NoPathParams, query: NoQuery, response: AppReleasesResponse })
export const AdminUpdateAppReleaseChannelEndpoint = defineEndpoint({ ...adminJson, operationId: "adminUpdateAppReleaseChannel", method: "PUT", path: "/v2/admin/app-releases/channels/:track/:platform/:runtimeVersion", summary: "Update an app release channel", pathParams: Schema.Struct({ track: AppReleaseTrack, platform: AppReleasePlatform, runtimeVersion: Schema.String }), query: NoQuery, body: AppUpdateChannelInput, response: AppUpdateChannel })

export const AdminListPostsEndpoint = defineEndpoint({ ...adminRead, operationId: "adminListPosts", method: "GET", path: "/v2/admin/posts", summary: "List posts", pathParams: NoPathParams, query: Schema.Struct({ status: Schema.optionalKey(PostStatus) }), response: Schema.Array(Post) })
export const AdminCreatePostEndpoint = defineEndpoint({ ...adminJson, successStatus: 201, operationId: "adminCreatePost", method: "POST", path: "/v2/admin/posts", summary: "Create a post", pathParams: NoPathParams, query: NoQuery, body: CreatePostInput, response: Post })
export const AdminGetPostEndpoint = defineEndpoint({ ...adminRead, operationId: "adminGetPost", method: "GET", path: "/v2/admin/posts/:id", summary: "Get a post", pathParams: IdPath, query: NoQuery, response: Post })
export const AdminUpdatePostEndpoint = defineEndpoint({ ...adminJson, operationId: "adminUpdatePost", method: "PATCH", path: "/v2/admin/posts/:id", summary: "Update a post and create a revision", pathParams: IdPath, query: NoQuery, body: UpdatePostInput, response: Post })
export const AdminArchivePostEndpoint = defineEndpoint({ auth: "admin", operationId: "adminArchivePost", method: "DELETE", path: "/v2/admin/posts/:id", summary: "Archive a post", pathParams: IdPath, query: NoQuery, body: NoBody, bodyMode: "none", response: NoContent, responseMode: "none", successStatus: 204 })
export const AdminPostAudienceEndpoint = defineEndpoint({ ...adminRead, operationId: "adminPostAudience", method: "GET", path: "/v2/admin/posts/:id/audience", summary: "Estimate a post audience", pathParams: IdPath, query: NoQuery, response: Schema.Struct({ estimated_recipients: Schema.Number }) })
export const AdminPostDeliveriesEndpoint = defineEndpoint({ ...adminRead, operationId: "adminPostDeliveries", method: "GET", path: "/v2/admin/posts/:id/deliveries", summary: "List post delivery attempts", pathParams: IdPath, query: NoQuery, response: Schema.Array(PostDeliveryAttempt) })
export const AdminPostRevisionsEndpoint = defineEndpoint({ ...adminRead, operationId: "adminPostRevisions", method: "GET", path: "/v2/admin/posts/:id/revisions", summary: "List post revisions", pathParams: IdPath, query: NoQuery, response: Schema.Array(PostRevision) })
export const AdminRestorePostRevisionEndpoint = defineEndpoint({ ...adminJson, operationId: "adminRestorePostRevision", method: "POST", path: "/v2/admin/posts/:id/revisions/:revision/restore", summary: "Restore a post revision", pathParams: Schema.Struct({ id: UUID, revision: Schema.Int.check(Schema.isGreaterThan(0)) }), query: NoQuery, body: NoBody, bodyMode: "none", response: Post })
export const AdminPublishPostEndpoint = defineEndpoint({ ...adminJson, operationId: "adminPublishPost", method: "POST", path: "/v2/admin/posts/:id/publish", summary: "Publish a post", pathParams: IdPath, query: NoQuery, body: NoBody, bodyMode: "none", response: Schema.Struct({ ...Post.fields, push_queued: Schema.Boolean }) })
export const AdminPushPostEndpoint = defineEndpoint({ ...adminJson, successStatus: 202, operationId: "adminPushPost", method: "POST", path: "/v2/admin/posts/:id/push", summary: "Queue a post push", pathParams: IdPath, query: NoQuery, body: NoBody, bodyMode: "none", response: Schema.Struct({ queued: Schema.Boolean }) })
export const AdminDuplicatePostEndpoint = defineEndpoint({ ...adminJson, successStatus: 201, operationId: "adminDuplicatePost", method: "POST", path: "/v2/admin/posts/:id/duplicate", summary: "Duplicate a post", pathParams: IdPath, query: NoQuery, body: NoBody, bodyMode: "none", response: Post })

export const AdminListCampaignsEndpoint = defineEndpoint({ ...adminRead, operationId: "adminListCampaigns", method: "GET", path: "/v2/admin/campaigns", summary: "List campaigns", pathParams: NoPathParams, query: NoQuery, response: Schema.Array(Campaign) })
export const AdminCreateCampaignEndpoint = defineEndpoint({ ...adminJson, successStatus: 201, operationId: "adminCreateCampaign", method: "POST", path: "/v2/admin/campaigns", summary: "Create a campaign", pathParams: NoPathParams, query: NoQuery, body: CreateCampaignInput, response: Campaign })
export const AdminUpdateCampaignEndpoint = defineEndpoint({ ...adminJson, operationId: "adminUpdateCampaign", method: "PATCH", path: "/v2/admin/campaigns/:id", summary: "Update a campaign", pathParams: IdPath, query: NoQuery, body: UpdateCampaignInput, response: Campaign })
export const AdminPushAudienceEndpoint = defineEndpoint({ ...adminRead, operationId: "adminPushAudience", method: "GET", path: "/v2/admin/push/audience", summary: "Estimate push audience", pathParams: NoPathParams, query: Schema.Struct({ platforms: Schema.optionalKey(Schema.String), locales: Schema.optionalKey(Schema.String) }), response: Schema.Struct({ estimated_recipients: Schema.Number }) })
export const AdminTestPushEndpoint = defineEndpoint({ ...adminJson, operationId: "adminTestPush", method: "POST", path: "/v2/admin/push/test", summary: "Send a sandbox test push", pathParams: NoPathParams, query: NoQuery, body: TestPushInput, response: PushResult })

export const AdminLabTypesEndpoint = defineEndpoint({ ...adminRead, operationId: "adminLabTypes", method: "GET", path: "/v2/admin/push/lab/types", summary: "List notification lab presets", pathParams: NoPathParams, query: NoQuery, response: Schema.Array(NotificationPreset) })
export const AdminLabStatusEndpoint = defineEndpoint({ ...adminRead, operationId: "adminLabStatus", method: "GET", path: "/v2/admin/push/lab/status", summary: "Get notification lab readiness", pathParams: NoPathParams, query: NoQuery, response: LabStatus })
export const AdminLabDevicesEndpoint = defineEndpoint({ ...adminRead, operationId: "adminLabDevices", method: "GET", path: "/v2/admin/push/lab/devices", summary: "List notification lab devices", pathParams: NoPathParams, query: NoQuery, response: Schema.Array(LabDevice) })
export const AdminLabSendEndpoint = defineEndpoint({ ...adminJson, operationId: "adminLabSend", method: "POST", path: "/v2/admin/push/lab/send", summary: "Send a notification lab message", pathParams: NoPathParams, query: NoQuery, body: LabSendInput, response: LabSendResponse })

export const AdminMediaUploadEndpoint = defineEndpoint({ auth: "admin", operationId: "adminMediaUpload", method: "POST", path: "/v2/admin/media/upload", summary: "Upload post media", pathParams: NoPathParams, query: NoQuery, body: Schema.FormData, bodyMode: "multipart", response: Schema.Struct({ url: Schema.String }), responseMode: "json", successStatus: 200 })
export const AdminStoryUploadEndpoint = defineEndpoint({ auth: "admin", operationId: "adminStoryUpload", method: "POST", path: "/v2/admin/stories/upload", summary: "Upload an interactive story", pathParams: NoPathParams, query: NoQuery, body: Schema.FormData, bodyMode: "multipart", response: Schema.Struct({ url: Schema.String, version: Schema.Literal(1), storage_provider: Schema.Literal("r2"), key: Schema.String, size_bytes: Schema.Number, checksum: Schema.String }), responseMode: "json", successStatus: 200 })

export const adminEndpoints = {
  me: AdminMeEndpoint, dashboard: AdminDashboardEndpoint, audit: AdminAuditEndpoint,
  proxyStats: AdminProxyStatsEndpoint, trackingSummary: AdminTrackingSummaryEndpoint,
  trackingTimeseries: AdminTrackingTimeseriesEndpoint,
  listDeveloperApplications: AdminListDeveloperApplicationsEndpoint,
  createDeveloperApplication: AdminCreateDeveloperApplicationEndpoint,
  getDeveloperApplication: AdminGetDeveloperApplicationEndpoint,
  updateDeveloperApplication: AdminUpdateDeveloperApplicationEndpoint,
  deleteDeveloperApplication: AdminDeleteDeveloperApplicationEndpoint,
  listFeatureFlags: AdminListFeatureFlagsEndpoint, createFeatureFlag: AdminCreateFeatureFlagEndpoint,
  updateFeatureFlag: AdminUpdateFeatureFlagEndpoint, listAppReleases: AdminListAppReleasesEndpoint,
  updateAppReleaseChannel: AdminUpdateAppReleaseChannelEndpoint, listPosts: AdminListPostsEndpoint,
  createPost: AdminCreatePostEndpoint, getPost: AdminGetPostEndpoint, updatePost: AdminUpdatePostEndpoint,
  archivePost: AdminArchivePostEndpoint, postAudience: AdminPostAudienceEndpoint,
  postDeliveries: AdminPostDeliveriesEndpoint, postRevisions: AdminPostRevisionsEndpoint,
  restorePostRevision: AdminRestorePostRevisionEndpoint, publishPost: AdminPublishPostEndpoint,
  pushPost: AdminPushPostEndpoint, duplicatePost: AdminDuplicatePostEndpoint,
  listCampaigns: AdminListCampaignsEndpoint, createCampaign: AdminCreateCampaignEndpoint,
  updateCampaign: AdminUpdateCampaignEndpoint, pushAudience: AdminPushAudienceEndpoint,
  testPush: AdminTestPushEndpoint, labTypes: AdminLabTypesEndpoint, labStatus: AdminLabStatusEndpoint,
  labDevices: AdminLabDevicesEndpoint, labSend: AdminLabSendEndpoint,
  mediaUpload: AdminMediaUploadEndpoint, storyUpload: AdminStoryUploadEndpoint,
} as const

export type AdminUser = typeof AdminUser.Type
export type DeveloperApplication = typeof DeveloperApplication.Type
export type FeatureFlag = typeof FeatureFlag.Type
export type Post = typeof Post.Type
export type Campaign = typeof Campaign.Type
