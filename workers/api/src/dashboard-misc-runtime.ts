import {
  ManagedAppAnnouncement as Announcement,
  AppAnnouncementsResponse as AnnouncementList,
  dashboardEndpoints,
  DecimalSnowflake,
  type AnyEndpoint,
  type EndpointResponse,
} from "@clashking/api-contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { AuthIdentity } from "./auth.js"
import { DatabaseFailure, Forbidden, InvalidRequest, NotFound, UpstreamUnavailable, type ApiFailure } from "./errors.js"
import type { WorkerBindings } from "./environment.js"
import { ServerAuthorization } from "./server-authorization.js"

const endpoints = {
  dashboardBillingSubscription: dashboardEndpoints.dashboardBillingSubscription,
  dashboardBillingUsage: dashboardEndpoints.dashboardBillingUsage,
  dashboardLinksList: dashboardEndpoints.dashboardLinksList,
  dashboardClanSearch: dashboardEndpoints.dashboardClanSearch,
  dashboardCwlBonusRecipients: dashboardEndpoints.dashboardCwlBonusRecipients,
  dashboardSeasonDates: dashboardEndpoints.dashboardSeasonDates,
  dashboardRaidWeekendDates: dashboardEndpoints.dashboardRaidWeekendDates,
  dashboardCurrentDates: dashboardEndpoints.dashboardCurrentDates,
  dashboardSeasonBounds: dashboardEndpoints.dashboardSeasonBounds,
  dashboardSeasonRaidDates: dashboardEndpoints.dashboardSeasonRaidDates,
  dashboardStaticCategoryNames: dashboardEndpoints.dashboardStaticCategoryNames,
  dashboardStaticMaxLevel: dashboardEndpoints.dashboardStaticMaxLevel,
  dashboardDiscohookResolve: dashboardEndpoints.dashboardDiscohookResolve,
} as const

// Literal dispatcher inventory, not a production-readiness claim.
// Approval-blocked account/billing/admin mutations are deliberately absent.
export const dashboardMiscRuntimeRoutes = [
  { method: "GET", path: "/v2/billing/subscription" },
  { method: "GET", path: "/v2/billing/usage" },
  { method: "GET", path: "/v2/links/:userId" },
  { method: "GET", path: "/v2/clan/search" },
  { method: "GET", path: "/v2/server/:serverId/cwl/:clanTag/bonus-recipients" },
  { method: "GET", path: "/v2/dates/seasons" },
  { method: "GET", path: "/v2/dates/raid-weekends" },
  { method: "GET", path: "/v2/dates/current" },
  { method: "GET", path: "/v2/dates/season-start-end" },
  { method: "GET", path: "/v2/dates/season-raid-dates" },
  { method: "GET", path: "/v2/static/:category/names" },
  { method: "GET", path: "/v2/static/:category/:itemIdOrName/max-level" },
  { method: "GET", path: "/v2/app/discohook-resolve" },
  { method: "GET", path: "/v2/app/announcements" },
] as const

type ResponseOf<K extends keyof typeof endpoints> = EndpointResponse<(typeof endpoints)[K]>
type LinkedAccount = ResponseOf<"dashboardLinksList">["items"][number]
type Recipient = ResponseOf<"dashboardCwlBonusRecipients">["items"][number]

/**
 * Production adapters are supplied by dashboard-misc-external.ts.
 * Search must retain Elasticsearch PIT/cursor semantics. Static names need the
 * category-aware filters and localized TID lookup. Discohook must bound its
 * response to 1 MiB, time out after 8 seconds, restrict every redirect to HTTPS
 * on the two allowlisted hosts, and unwrap a non-null JSON data envelope.
 * Discord API requests, if required, must use the canonical DiscordApi service.
 */
export class DashboardMiscExternal extends Context.Service<DashboardMiscExternal, {
  readonly searchClans: (query: typeof endpoints.dashboardClanSearch.query.Type) => Effect.Effect<ResponseOf<"dashboardClanSearch">, ApiFailure>
  readonly staticNames: (category: string, query: typeof endpoints.dashboardStaticCategoryNames.query.Type) => Effect.Effect<ResponseOf<"dashboardStaticCategoryNames">, ApiFailure>
  readonly staticMaxLevel: (category: string, item: string) => Effect.Effect<ResponseOf<"dashboardStaticMaxLevel">, ApiFailure>
  readonly discohook: (url: string) => Effect.Effect<ResponseOf<"dashboardDiscohookResolve">, ApiFailure>
}>()("clashking/DashboardMiscExternal") {}

interface LinkRow {
  readonly user_id: string
  readonly tag: string
  readonly order_index: number
  readonly is_verified: boolean
  readonly hidden: boolean
  readonly added_at: Date | string
  readonly verified_at: Date | string | null
  readonly last_login: Date | string | null
}

export class DashboardPersonalLinks extends Context.Service<DashboardPersonalLinks, {
  readonly list: (userId: string) => Effect.Effect<ReadonlyArray<LinkedAccount>, ApiFailure>
}>()("clashking/DashboardPersonalLinks") {
  static readonly layer = Layer.effect(DashboardPersonalLinks, Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const list = (userId: string) => database(sql<LinkRow>`
      SELECT user_id, tag, order_index, is_verified, hidden, added_at, verified_at, last_login
      FROM player_links WHERE user_id = ${userId} ORDER BY order_index, added_at
    `).pipe(Effect.map((rows) => rows.map(linkJson)))
    return { list }
  }))
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } })
const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : value
const linkJson = (row: LinkRow): LinkedAccount => ({
  user_id: row.user_id, player_tag: row.tag, order_index: row.order_index,
  is_verified: row.is_verified, hidden: row.hidden, added_at: iso(row.added_at),
  ...(row.verified_at === null ? {} : { verified_at: iso(row.verified_at) }),
  ...(row.last_login === null ? {} : { last_login: iso(row.last_login) }),
})
const database = <A>(effect: Effect.Effect<A, unknown>) => effect.pipe(
  Effect.mapError((cause) => new DatabaseFailure({ cause, message: "Dashboard miscellaneous database operation failed" })),
)
type AnnouncementItem = typeof Announcement.Type
interface AnnouncementRow extends Omit<AnnouncementItem, "starts_at" | "ends_at" | "created_at" | "updated_at" | "banner_image_url" | "html_object_key" | "html_url" | "min_app_version"> {
  readonly starts_at: Date | string
  readonly ends_at: Date | string | null
  readonly created_at: Date | string
  readonly updated_at: Date | string
  readonly banner_image_url: string | null
  readonly html_object_key: string | null
  readonly html_url: string | null
  readonly min_app_version: string | null
}
interface SubscriptionRow {
  readonly status: string
  readonly active: boolean
  readonly bookmark_limit: number
  readonly credit: number
  readonly server_id: string | null
  readonly spent: number
}
interface CheckoutFlag {
  readonly enabled: boolean
  readonly rollout_percentage: number
  readonly platforms: ReadonlyArray<string>
  readonly starts_at: Date | string | null
  readonly ends_at: Date | string | null
}

export class DashboardMiscReads extends Context.Service<DashboardMiscReads, {
  readonly subscription: (userId: string) => Effect.Effect<ResponseOf<"dashboardBillingSubscription">, ApiFailure>
  readonly usage: (userId: string, serverId: string) => Effect.Effect<ResponseOf<"dashboardBillingUsage">, ApiFailure>
  readonly recipients: (serverId: string, clanTag: string, season: string) => Effect.Effect<ReadonlyArray<Recipient>, ApiFailure>
  readonly announcements: (status: string) => Effect.Effect<ReadonlyArray<AnnouncementItem>, ApiFailure>
}>()("clashking/DashboardMiscReads") {
  static readonly layer = Layer.effect(DashboardMiscReads, Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const subscription = (userId: string) => Effect.gen(function* () {
      const flags = yield* database(sql<CheckoutFlag>`
        SELECT enabled, rollout_percentage, platforms, starts_at, ends_at FROM admin_feature_flags
        WHERE flag_key = 'subscription_support' AND public_exposure = 'safe'
      `)
      const checkoutEnabled = yield* resolveCheckoutFlag(flags[0], userId, new Date())
      const rows = yield* database(sql<SubscriptionRow>`
        SELECT COALESCE(subscription.status, 'none') AS status, entitlement.active,
          entitlement.bookmark_notifications_limit AS bookmark_limit,
          entitlement.roster_assistant_monthly_credit_usd::float8 AS credit, assignment.server_id,
          COALESCE(usage.spent, 0)::float8 AS spent
        FROM subscription_entitlements entitlement
        LEFT JOIN billing_subscriptions subscription ON subscription.user_id = entitlement.user_id
        LEFT JOIN subscription_roster_assignments assignment ON assignment.user_id = entitlement.user_id
        LEFT JOIN LATERAL (
          SELECT sum(amount_usd) AS spent FROM roster_ai_usage_credits WHERE user_id = entitlement.user_id
            AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        ) usage ON true WHERE entitlement.user_id = ${userId}
      `)
      const row = rows[0]
      return {
        provider: "stripe" as const, status: row?.status ?? "none", active: row?.active ?? false,
        checkoutEnabled, bookmarkNotificationsLimit: row?.bookmark_limit ?? 0,
        rosterAssistantMonthlyCreditUsd: row?.credit ?? 0, assignedServerId: row?.server_id ?? null,
        rosterAssistantSpentUsd: row?.spent ?? 0,
        rosterAssistantRemainingUsd: Math.max(0, (row?.credit ?? 0) - (row?.spent ?? 0)),
      }
    })
    const usage = (userId: string, serverId: string) => Effect.gen(function* () {
      const identities = yield* database(sql<{ user_id: string }>`SELECT user_id FROM auth_users WHERE user_id = ${userId} AND provider = 'discord'`)
      const discordId = identities[0]?.user_id
      if (discordId === undefined || discordId.trim() === "") return yield* new Forbidden({ message: "A Discord identity is required for roster management" })
      const spent = yield* database(sql<{ server: number; global: number; user: number }>`
        WITH monthly AS (
          SELECT usage.*, COALESCE((SELECT sum(amount_usd) FROM roster_ai_usage_credits credit WHERE credit.usage_id = usage.id), 0) AS credited
          FROM roster_ai_usage usage
          WHERE usage.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        ) SELECT COALESCE(sum(total_cost_usd) FILTER (WHERE server_id = ${serverId}), 0)::float8 AS server,
          COALESCE(sum(GREATEST(total_cost_usd - credited, 0)), 0)::float8 AS global,
          COALESCE(sum(total_cost_usd) FILTER (WHERE discord_user_id = ${discordId}), 0)::float8 AS user FROM monthly
      `)
      const entitlements = yield* database(sql<{ active: boolean; credit: number }>`
        SELECT active, roster_assistant_monthly_credit_usd::float8 AS credit FROM subscription_entitlements WHERE user_id = ${userId}
      `)
      const assigned = yield* database(sql<{ count: number; credit: number; spent: number }>`
        SELECT count(*)::integer AS count, COALESCE(sum(entitlement.roster_assistant_monthly_credit_usd), 0)::float8 AS credit,
          COALESCE(sum(LEAST(entitlement.roster_assistant_monthly_credit_usd, COALESCE(spend.spent, 0))), 0)::float8 AS spent
        FROM subscription_roster_assignments assignment
        JOIN subscription_entitlements entitlement ON entitlement.user_id = assignment.user_id AND entitlement.active = true
        LEFT JOIN LATERAL (
          SELECT sum(amount_usd) AS spent FROM roster_ai_usage_credits WHERE user_id = assignment.user_id
            AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        ) spend ON true WHERE assignment.server_id = ${serverId}
      `)
      const now = new Date()
      const paidLimitUsd = assigned[0]?.credit ?? 0
      const paidSpentUsd = assigned[0]?.spent ?? 0
      return {
        serverId, serverSpentUsd: spent[0]?.server ?? 0, serverLimitUsd: 0.05,
        userSpentUsd: spent[0]?.user ?? 0, userLimitUsd: entitlements[0]?.credit ?? 0,
        globalFreeAvailable: (spent[0]?.global ?? 0) < 10, subscriptionActive: entitlements[0]?.active ?? false,
        assignedSubscriberCount: assigned[0]?.count ?? 0, paidLimitUsd, paidSpentUsd,
        paidRemainingUsd: Math.max(0, paidLimitUsd - paidSpentUsd),
        resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
      }
    })
    const recipients = (serverId: string, clanTag: string, season: string) => Effect.gen(function* () {
      const clans = yield* database(sql<{ exists: boolean }>`SELECT EXISTS (SELECT 1 FROM server_clans WHERE server_id = ${serverId} AND tag = ${clanTag}) AS exists`)
      if (clans[0]?.exists !== true) return yield* new NotFound({ message: "clan is not configured for this server" })
      const rows = yield* database(sql<{ player_tag: string; medal_count: number }>`
        SELECT player_tag, medal_count FROM cwl_bonus_recipients WHERE season = ${season} AND clan_tag = ${clanTag} ORDER BY player_tag
      `)
      return rows.map((row) => ({ playerTag: row.player_tag, medalCount: row.medal_count }))
    })
    const announcements = (status: string) => database(sql<AnnouncementRow>`
      SELECT id::text, title, subtitle, body, status, target, banner_image_url, html_object_key,
        html_url, starts_at, ends_at, min_app_version, created_at, updated_at
      FROM app_announcements WHERE (${status} = '' OR status = ${status}) ORDER BY created_at DESC LIMIT 100
    `).pipe(Effect.map((rows) => rows.map((row): AnnouncementItem => ({
      id: row.id, title: row.title, subtitle: row.subtitle, status: row.status, target: row.target,
      ...(row.body ? { body: row.body } : {}),
      ...(row.banner_image_url ? { banner_image_url: row.banner_image_url } : {}),
      ...(row.html_object_key ? { html_object_key: row.html_object_key } : {}),
      ...(row.html_url ? { html_url: row.html_url } : {}),
      ...(row.min_app_version ? { min_app_version: row.min_app_version } : {}),
      starts_at: iso(row.starts_at), ...(row.ends_at === null ? {} : { ends_at: iso(row.ends_at) }),
      created_at: iso(row.created_at), updated_at: iso(row.updated_at),
    }))))
    return { subscription, usage, recipients, announcements }
  }))
}

export const resolveCheckoutFlag = (flag: CheckoutFlag | undefined, userId: string, now: Date) => Effect.gen(function* () {
  if (flag === undefined || !flag.enabled || flag.rollout_percentage <= 0 || userId.trim() === "" ||
    flag.starts_at !== null && now < new Date(flag.starts_at) || flag.ends_at !== null && now >= new Date(flag.ends_at) ||
    !flag.platforms.some((platform) => platform.trim().toLowerCase() === "web")) return false
  if (flag.rollout_percentage >= 100) return true
  const hash = yield* Effect.tryPromise({
    try: () => crypto.subtle.digest("SHA-256", new TextEncoder().encode(`subscription_support:${userId}`)),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Subscription rollout hashing failed" }),
  })
  return Number(new DataView(hash).getBigUint64(0, false) % 100n) < flag.rollout_percentage
})

const input = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) => Schema.decodeUnknownEffect(schema)(value).pipe(
  Effect.mapError((cause) => new InvalidRequest({ message: `Invalid request: ${String(cause)}` })),
)
const output = <A>(schema: Schema.Codec<A, unknown, never, never>, value: A) => Schema.encodeEffect(schema)(value).pipe(
  Effect.map((encoded) => json(encoded)),
  Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Dashboard response failed its contract" })),
)
const queryInput = (url: URL) => {
  const result: Record<string, unknown> = {}
  const numbers = new Set(["number_of_seasons", "number_of_weeks", "clanLevel[min]", "clanLevel[max]", "members[min]", "members[max]", "limit"])
  const arrays = new Set(["locationIds", "warLeagueIds"])
  for (const [key, value] of url.searchParams) {
    if (arrays.has(key)) result[key] = url.searchParams.getAll(key).flatMap((item) => item.split(",")).map((item) => /^\d+$/u.test(item) ? Number(item) : NaN)
    else if (numbers.has(key)) result[key] = /^\d+$/u.test(value) ? Number(value) : NaN
    else if (key === "as_text" || key === "gold_pass_season") result[key] = value === "true" || value === "1" ? true : value === "false" || value === "0" ? false : value
    else result[key] = value
  }
  return result
}
const matchedPath = (pattern: string, pathname: string) => {
  const expected = pattern.split("/")
  const actual = pathname.split("/")
  if (expected.length !== actual.length) return undefined
  const params: Record<string, string> = {}
  for (let index = 0; index < expected.length; index++) {
    const part = expected[index]!
    const value = actual[index]!
    if (part.startsWith(":")) {
      if (value === "") return undefined
      params[part.slice(1)] = value
    } else if (part !== value) return undefined
  }
  return params
}
const decodedPath = (raw: Readonly<Record<string, string>>) => Effect.try({
  try: () => Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, decodeURIComponent(value)])),
  catch: () => new InvalidRequest({ message: "Invalid percent encoding in path" }),
})
const monthId = (date: Date) => date.toISOString().slice(0, 7)
const dayId = (date: Date) => date.toISOString().slice(0, 10)
const oneDay = 86_400_000
const raidStart = (now: Date) => {
  const friday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (now.getUTCDay() + 2) % 7, 7))
  return friday > now ? new Date(friday.getTime() - 7 * oneDay) : friday
}
const validSeason = (season: string, allowDay: boolean) => {
  if (!(allowDay ? /^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/u : /^\d{4}-(0[1-9]|1[0-2])$/u).test(season)) return false
  const date = new Date(`${season.length === 7 ? `${season}-01` : season}T00:00:00Z`)
  return date.getUTCFullYear() >= 2000 && dayId(date).startsWith(season)
}
const boundedCount = (count: number) => Number.isSafeInteger(count) && count >= 0 && count <= 1000
const seasonBounds = (season: string, gold: boolean) => {
  const year = Number(season.slice(0, 4))
  const month = Number(season.slice(5, 7)) - 1
  return [new Date(Date.UTC(year, month - (gold ? 0 : 1), 1, gold ? 0 : 5)), new Date(Date.UTC(year, month + (gold ? 1 : 0), 1, gold ? 0 : 5))] as const
}

/** Read-only routes only. Approval-blocked mutations are deliberately absent. */
export const dispatchDashboardMisc = (request: Request, _bindings: WorkerBindings): Effect.Effect<
  Response | undefined, ApiFailure,
  SqlClient.SqlClient | AuthIdentity | ServerAuthorization | DashboardMiscReads | DashboardPersonalLinks | DashboardMiscExternal
> => Effect.gen(function* () {
  const url = new URL(request.url)
  const route = dashboardMiscRuntimeRoutes.find((candidate) => candidate.method === request.method && matchedPath(candidate.path, url.pathname) !== undefined)
  if (route === undefined) return undefined
  const path = yield* decodedPath(matchedPath(route.path, url.pathname)!)
  if (route.path === "/v2/app/announcements") {
    yield* (yield* AuthIdentity).requireBot(request)
    const status = (url.searchParams.get("status") ?? "").trim().toLowerCase()
    if (status !== "" && !["draft", "scheduled", "published", "archived"].includes(status)) return yield* new InvalidRequest({ message: "Invalid announcement status" })
    return yield* output(AnnouncementList, { items: yield* (yield* DashboardMiscReads).announcements(status) })
  }
  const endpoint: AnyEndpoint | undefined = Object.values(endpoints).find((candidate) => candidate.method === request.method && candidate.path === route.path)
  if (endpoint === undefined) return yield* new UpstreamUnavailable({ cause: route.path, message: "Dashboard route has no contract" })
  yield* input(endpoint.pathParams, path)
  const rawQuery = queryInput(url)
  yield* input(endpoint.query, rawQuery)
  if (endpoint.auth === "user-or-bot") {
    const principal = yield* (yield* AuthIdentity).requireUserOrBot(request)
    const userId = path.userId!.trim()
    if (userId === "") return yield* new InvalidRequest({ message: "User ID is required" })
    if (principal.kind === "user" && principal.userId !== userId) return yield* new Forbidden({ message: "Cannot access another user's linked accounts" })
    return yield* output(endpoints.dashboardLinksList.response, { items: yield* (yield* DashboardPersonalLinks).list(userId) })
  }
  switch (endpoint.operationId) {
    case "dashboardBillingSubscription": {
      const principal = yield* (yield* AuthIdentity).requireUser(request)
      return yield* output(endpoints.dashboardBillingSubscription.response, yield* (yield* DashboardMiscReads).subscription(principal.userId))
    }
    case "dashboardBillingUsage": {
      const principal = yield* (yield* AuthIdentity).requireUser(request)
      const query = yield* input(endpoints.dashboardBillingUsage.query, rawQuery)
      const serverId = yield* input(DecimalSnowflake, query.serverId.trim())
      yield* (yield* ServerAuthorization).require(request, serverId, {})
      return yield* output(endpoints.dashboardBillingUsage.response, yield* (yield* DashboardMiscReads).usage(principal.userId, serverId))
    }
    case "dashboardCwlBonusRecipients": {
      const serverId = yield* input(DecimalSnowflake, path.serverId)
      const query = yield* input(endpoints.dashboardCwlBonusRecipients.query, rawQuery)
      const clanTag = `#${path.clanTag!.trim().toUpperCase().replace(/^#/u, "").replaceAll("O", "0")}`
      if (clanTag === "#" || !validSeason(query.season, true)) return yield* new InvalidRequest({ message: "A clan tag and valid CWL season are required" })
      // Go dashboardSectionForPath falls back to settings for this /cwl/ path.
      yield* (yield* ServerAuthorization).require(request, serverId, { section: "settings" })
      return yield* output(endpoints.dashboardCwlBonusRecipients.response, { items: yield* (yield* DashboardMiscReads).recipients(serverId, clanTag, query.season) })
    }
    case "dashboardSeasonDates": {
      const query = yield* input(endpoints.dashboardSeasonDates.query, rawQuery)
      const count = query.number_of_seasons ?? 0
      if (!boundedCount(count)) return yield* new InvalidRequest({ message: "number_of_seasons must be an integer from 0 to 1000" })
      const now = new Date()
      const items = Array.from({ length: count || 1 }, (_, index) => {
        // Match Go AddDate's overflow normalization on e.g. March 31 minus one month.
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, now.getUTCDate()))
        return query.as_text ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date) : monthId(date)
      })
      return yield* output(endpoints.dashboardSeasonDates.response, { items })
    }
    case "dashboardRaidWeekendDates": {
      const query = yield* input(endpoints.dashboardRaidWeekendDates.query, rawQuery)
      const count = query.number_of_weeks ?? 0
      if (!boundedCount(count)) return yield* new InvalidRequest({ message: "number_of_weeks must be an integer from 0 to 1000" })
      const start = raidStart(new Date())
      return yield* output(endpoints.dashboardRaidWeekendDates.response, { items: Array.from({ length: count + 1 }, (_, index) => dayId(new Date(start.getTime() - index * 7 * oneDay))) })
    }
    case "dashboardCurrentDates": {
      const now = new Date()
      return yield* output(endpoints.dashboardCurrentDates.response, {
        season: monthId(now), raid: dayId(raidStart(now)), legend: dayId(new Date(now.getTime() - (now.getUTCHours() < 5 ? oneDay : 0))), "clan-games": monthId(now),
      })
    }
    case "dashboardSeasonBounds": {
      const query = yield* input(endpoints.dashboardSeasonBounds.query, rawQuery)
      const season = query.season || monthId(new Date())
      if (!validSeason(season, false)) return yield* new InvalidRequest({ message: "Invalid season" })
      const [start, end] = seasonBounds(season, query.gold_pass_season ?? false)
      return yield* output(endpoints.dashboardSeasonBounds.response, { season_start: start.toISOString().replace(".000Z", "Z"), season_end: end.toISOString().replace(".000Z", "Z") })
    }
    case "dashboardSeasonRaidDates": {
      const query = yield* input(endpoints.dashboardSeasonRaidDates.query, rawQuery)
      const season = query.season || monthId(new Date())
      if (!validSeason(season, false)) return yield* new InvalidRequest({ message: "Invalid season" })
      const [start, end] = seasonBounds(season, false)
      const items = Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + (index * 7 + 4) * oneDay)).filter((date) => date <= end).map(dayId)
      return yield* output(endpoints.dashboardSeasonRaidDates.response, { items })
    }
    case "dashboardClanSearch": {
      const query = yield* input(endpoints.dashboardClanSearch.query, rawQuery)
      const search = query.query.trim()
      if (search.length < 2 || search.length > 100) return yield* new InvalidRequest({ message: "query must contain 2 to 100 characters" })
      const limit = query.limit ?? 25
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) return yield* new InvalidRequest({ message: "limit must be from 1 to 200" })
      for (const ids of [query.locationIds, query.warLeagueIds]) {
        if (ids !== undefined && (ids.length > 5 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0))) return yield* new InvalidRequest({ message: "Search ID lists require at most five positive integers" })
      }
      for (const [minimum, maximum, lower, upper] of [[query["clanLevel[min]"], query["clanLevel[max]"], 1, Number.MAX_SAFE_INTEGER], [query["members[min]"], query["members[max]"], 0, 50]] as const) {
        if ([minimum, maximum].some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < lower || value > upper)) || minimum !== undefined && maximum !== undefined && minimum > maximum) return yield* new InvalidRequest({ message: "Invalid search filter range" })
      }
      return yield* output(endpoints.dashboardClanSearch.response, yield* (yield* DashboardMiscExternal).searchClans({ ...query, query: search, limit,
        ...(query.locationIds === undefined ? {} : { locationIds: [...new Set(query.locationIds)].sort((a, b) => a - b) }),
        ...(query.warLeagueIds === undefined ? {} : { warLeagueIds: [...new Set(query.warLeagueIds)].sort((a, b) => a - b) }),
      }))
    }
    case "dashboardStaticCategoryNames": {
      const query = yield* input(endpoints.dashboardStaticCategoryNames.query, rawQuery)
      if (!staticCategories.has(path.category!)) return yield* new NotFound({ message: "Static category not found" })
      if (query.locale && !staticLocales.has(query.locale.toUpperCase())) return yield* new InvalidRequest({ message: "Invalid static-data locale" })
      return yield* output(endpoints.dashboardStaticCategoryNames.response, yield* (yield* DashboardMiscExternal).staticNames(path.category!, query))
    }
    case "dashboardStaticMaxLevel": {
      if (!levelCategories.has(path.category!)) return yield* new InvalidRequest({ message: "Category does not support levels" })
      return yield* output(endpoints.dashboardStaticMaxLevel.response, yield* (yield* DashboardMiscExternal).staticMaxLevel(path.category!, path.itemIdOrName!))
    }
    case "dashboardDiscohookResolve": {
      yield* (yield* AuthIdentity).requireUser(request)
      const query = yield* input(endpoints.dashboardDiscohookResolve.query, rawQuery)
      const target = yield* Effect.try({ try: () => new URL(query.url), catch: () => new InvalidRequest({ message: "Invalid Discohook URL" }) })
      if (target.protocol !== "https:" || target.username !== "" || target.password !== "" || !["discohook.app", "share.discohook.app"].includes(target.hostname)) return yield* new InvalidRequest({ message: "Only HTTPS Discohook share URLs are allowed" })
      let normalized = target.toString()
      if (target.hostname === "discohook.app") {
        const share = target.searchParams.get("share") ?? ""
        if (!/^[A-Za-z0-9_-]{1,128}$/u.test(share)) return yield* new InvalidRequest({ message: "Invalid Discohook share ID" })
        normalized = `https://discohook.app/api/v1/share/${share}`
      }
      return yield* output(endpoints.dashboardDiscohookResolve.response, yield* (yield* DashboardMiscExternal).discohook(normalized))
    }
    default: return yield* new UpstreamUnavailable({ cause: endpoint.operationId, message: "Dashboard route has no implementation" })
  }
})

const levelCategories = new Set(["buildings", "traps", "troops", "guardians", "spells", "heroes", "pets", "equipment", "helpers", "achievements"])
const staticCategories = new Set([...levelCategories, "decorations", "obstacles", "sceneries", "skins", "capital_house_parts", "capital_leagues", "war_leagues", "league_tiers"])
const staticLocales = new Set(["EN", "AR", "CN", "CNT", "DE", "ES", "FA", "FI", "FR", "ID", "IT", "JP", "KR", "MS", "NL", "NO", "PL", "PT", "RU", "TH", "TR", "VI"])
