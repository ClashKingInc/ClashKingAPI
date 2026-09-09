import { dashboardEndpoints, DecimalSnowflake } from "@clashking/api-contracts"
import { Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"

import type { DashboardServerOperationInput } from "./dashboard-server-runtime.js"
import { DiscordApi } from "./discord-api.js"
import { dashboardThreadParentNames } from "./dashboard-discord-cache.js"
import { readDashboardGatewayCollection } from "./dashboard-gateway-cache.js"
import { discordBotProfile } from "./discord-bot-profile.js"
import { DiscordCredentials } from "./discord-credentials.js"
import { discordWebhookAvatar, validateDiscordProfileImage } from "./discord-profile-image.js"
import { discordDestinationId, validateDiscordDestination } from "./discord-destination.js"
import { compensateCreatedDiscordResource, createCountdownChannel, createLogWebhook, lockServerDiscordResources } from "./discord-managed-resources.js"
import { dashboardTicketOperationIds, executeDashboardTickets } from "./dashboard-server-tickets.js"
import { dashboardAutoboardOperationIds, executeDashboardAutoboards } from "./dashboard-server-autoboards.js"
import { dashboardReminderOperationIds, executeDashboardReminders } from "./dashboard-server-reminders.js"
import { dashboardGiveawayOperationIds, executeDashboardGiveaways } from "./dashboard-server-giveaways.js"
import { dashboardServerBaseOperationIds, executeDashboardServerBases } from "./dashboard-server-bases.js"
import { dashboardServerActivityOperationIds, executeDashboardServerActivity } from "./dashboard-server-activity.js"
import { dashboardServerReadOperationIds, executeDashboardServerReads } from "./dashboard-server-reads.js"
import { ServerAuthorization, discordGuildManager, gatewayHeartbeatFreshnessSeconds, resolveListedGuildAccess } from "./server-authorization.js"
import { notifyTracking } from "./tracking-wake.js"
import { Conflict, DatabaseFailure, Forbidden, InvalidRequest, NotFound, PayloadTooLarge, RateLimited, Unauthenticated, UnprocessableEntity, UpstreamUnavailable, type ApiFailure } from "./errors.js"

export const dashboardServerCoreOperationIds = [
  "dashboardCapabilities", "dashboardAccess", "updateDashboardAccess", "dashboardGuilds", "dashboardGuild",
  "reactivateServer", "serverDiscordTest", "serverChannels", "serverThreads", "discordRoles",
  "botGuildProfile", "updateBotGuildProfile", "serverPanel", "updateServerPanel",
  "clanCategories", "createClanCategory", "renameClanCategory", "reorderClanCategories",
  "previewClanCategoryDelete", "deleteClanCategory", "serverRoles", "createServerRole",
  "updateServerRole", "deleteServerRole", "serverSettings", "updateServerSettings",
  "roleSettings", "updateRoleSettings", "updateServerEmbedColor", "serverClansBasic",
  "serverClans", "serverClanSettings", "updateServerClanSettings", "removeServerClan", "addServerClan",
  "serverLogs", "updateServerLogsState", "serverCountdowns", "clanCountdowns",
  "serverEmbeds", "createServerEmbed", "updateServerEmbed", "deleteServerEmbed",
  "searchBannedPlayers",
  "enableCountdown", "disableCountdown", "saveServerLogs", "deleteServerLogs",
  ...dashboardTicketOperationIds,
  ...dashboardAutoboardOperationIds,
  ...dashboardReminderOperationIds,
  ...dashboardGiveawayOperationIds,
  ...dashboardServerBaseOperationIds,
  ...dashboardServerActivityOperationIds,
  ...dashboardServerReadOperationIds,
] as const

type CoreEnvironment = SqlClient.SqlClient | DiscordApi | DiscordCredentials | ServerAuthorization
type JsonRecord = Readonly<Record<string, unknown>>

const sections = ["settings", "family_settings", "logs", "clans", "rosters", "links", "moderation", "roles", "reminders", "autoboards", "giveaways", "panels", "tickets", "embeds", "wars", "leaderboards"] as const
const optionalText = Schema.optionalKey(Schema.NullOr(Schema.String))
const RawGuild = Schema.Struct({
  id: DecimalSnowflake, name: Schema.String, icon: optionalText,
  owner: Schema.optionalKey(Schema.Boolean), permissions: Schema.optionalKey(DecimalSnowflake),
  features: Schema.optionalKey(Schema.Array(Schema.String)), approximate_member_count: Schema.optionalKey(Schema.Number),
})
const RawRole = Schema.Struct({
  id: DecimalSnowflake, name: Schema.String, color: Schema.Number, position: Schema.Number,
  managed: Schema.Boolean, mentionable: Schema.Boolean,
})
const RawChannel = Schema.Struct({
  id: DecimalSnowflake, name: Schema.String, type: Schema.Number, parent_id: optionalText,
  thread_metadata: Schema.optionalKey(Schema.Struct({ archived: Schema.Boolean })),
})
const RawBotUser = Schema.Struct({
  id: DecimalSnowflake, username: Schema.optionalKey(Schema.String), global_name: optionalText,
  avatar: optionalText, banner: optionalText,
})
const decodeDiscord = <A>(schema: Schema.Codec<A, unknown, never, never>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Discord response failed schema validation" })))

const database = <A, R>(message: string, effect: Effect.Effect<A, unknown, R>): Effect.Effect<A, ApiFailure, R> =>
  effect.pipe(Effect.mapError((cause) => isApiFailure(cause) ? cause : new DatabaseFailure({ cause, message })))

const isApiFailure = (cause: unknown): cause is ApiFailure =>
  cause instanceof Conflict || cause instanceof DatabaseFailure || cause instanceof Forbidden || cause instanceof InvalidRequest ||
  cause instanceof NotFound || cause instanceof UpstreamUnavailable || cause instanceof RateLimited || cause instanceof Unauthenticated || cause instanceof PayloadTooLarge || cause instanceof UnprocessableEntity

const record = (value: unknown): JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : {}
const text = (value: unknown): string => typeof value === "string" ? value : ""
const optional = (key: string, value: unknown): JsonRecord => value === null || value === undefined ? {} : { [key]: value }
const iso = (value: Date | string): string => new Date(value).toISOString()
const serverIdFor = (input: DashboardServerOperationInput): string => text(input.path.serverId ?? input.path.guildId)
const normalizeTag = (value: unknown): string => `#${text(value).trim().toUpperCase().replace(/^#/u, "").replaceAll("O", "0")}`

const validateUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  ? Effect.void : Effect.fail(new InvalidRequest({ message: "ID must be a UUID" }))
const requireRow = <A>(rows: ReadonlyArray<A>, message: string): Effect.Effect<A, NotFound> =>
  rows[0] === undefined ? Effect.fail(new NotFound({ message })) : Effect.succeed(rows[0])

interface CategoryRow { readonly id: string; readonly server_id: string; readonly name: string; readonly position: number; readonly clan_count: number }
const categoryValue = (row: CategoryRow) => ({ id: row.id, serverId: row.server_id, name: row.name, position: row.position, clanCount: row.clan_count })
const categoryColumns = `category.id::text, category.server_id, category.name, category.position,
  (SELECT count(*)::int FROM server_clans clan WHERE clan.server_id = category.server_id AND clan.category_id = category.id) AS clan_count`

const categoryName = (value: unknown): Effect.Effect<string, InvalidRequest> => {
  const name = text(value).trim().replace(/\s+/gu, " ")
  return name.length === 0 || [...name].length > 64
    ? Effect.fail(new InvalidRequest({ message: "Category name must contain 1 to 64 characters" }))
    : Effect.succeed(name)
}

const queryCategories = (serverId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<CategoryRow>(`SELECT ${categoryColumns} FROM server_clan_categories category WHERE category.server_id = $1 ORDER BY category.position, category.name, category.id`, [serverId])
  return rows.map(categoryValue)
})

const categoryOperation = (input: DashboardServerOperationInput) => database("Clan category operation failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const serverId = serverIdFor(input)
  const id = text(input.path.categoryId)
  const body = record(input.body)
  const operation = input.endpoint.operationId
  if (operation === "clanCategories") {
    const items = yield* queryCategories(serverId)
    return { items, total: items.length }
  }
  if (operation === "createClanCategory") {
    const name = yield* categoryName(body.name)
    const rows = yield* sql<CategoryRow>`INSERT INTO server_clan_categories (server_id, name, position)
      SELECT ${serverId}, ${name}, COALESCE(max(position) + 1, 0) FROM server_clan_categories WHERE server_id = ${serverId}
      RETURNING id::text, server_id, name, position, 0::int AS clan_count`
    return { category: categoryValue(yield* requireRow(rows, "Category was not created")) }
  }
  if (operation === "reorderClanCategories") {
    const decoded = yield* Schema.decodeUnknownEffect(dashboardEndpoints.reorderClanCategories.body)(body).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid category order" })))
    if (new Set(decoded.categoryIds).size !== decoded.categoryIds.length) return yield* new InvalidRequest({ message: "Category order contains duplicates" })
    yield* sql.withTransaction(Effect.gen(function* () {
      const existing = yield* sql<{ id: string }>`SELECT id::text FROM server_clan_categories WHERE server_id = ${serverId} FOR UPDATE`
      if (existing.length !== decoded.categoryIds.length || existing.some((row) => !decoded.categoryIds.includes(row.id))) {
        return yield* new InvalidRequest({ message: "Category order must contain every server category exactly once" })
      }
      for (const [position, categoryId] of decoded.categoryIds.entries()) {
        yield* sql`UPDATE server_clan_categories SET position = ${position} WHERE server_id = ${serverId} AND id = ${categoryId}::uuid`
      }
    }))
    const items = yield* queryCategories(serverId)
    return { items, total: items.length }
  }
  yield* validateUuid(id)
  if (operation === "renameClanCategory") {
    const name = yield* categoryName(body.name)
    const rows = yield* sql.unsafe<CategoryRow>(`UPDATE server_clan_categories category SET name = $3 WHERE server_id = $1 AND id = $2::uuid RETURNING ${categoryColumns}`, [serverId, id, name])
    return { category: categoryValue(yield* requireRow(rows, "Category not found")) }
  }
  return yield* sql.withTransaction(Effect.gen(function* () {
    const rows = yield* sql.unsafe<CategoryRow>(`SELECT ${categoryColumns} FROM server_clan_categories category WHERE category.server_id = $1 AND category.id = $2::uuid FOR UPDATE`, [serverId, id])
    const row = yield* requireRow(rows, "Category not found")
    if (operation === "previewClanCategoryDelete") return { category: categoryValue(row), affectedClanCount: row.clan_count }
    yield* sql`DELETE FROM server_clan_categories WHERE server_id = ${serverId} AND id = ${id}::uuid`
    yield* sql`UPDATE server_clan_categories SET position = position - 1 WHERE server_id = ${serverId} AND position > ${row.position}`
    return { categoryId: row.id, name: row.name, deleted: true, uncategorizedClanCount: row.clan_count }
  }))
}))

const rolesFromDiscord = (serverId: string, applicationId: string, live = false) => Effect.gen(function* () {
  const raw = live ? yield* (yield* DiscordApi).request(`/guilds/${serverId}/roles`)
    : yield* readDashboardGatewayCollection(applicationId, serverId, "roles")
  const roles = yield* decodeDiscord(Schema.Array(RawRole), raw)
  return roles.filter((role) => !role.managed && role.id !== serverId).sort((left, right) => right.position - left.position)
})

const accessOperation = (input: DashboardServerOperationInput) => database("Dashboard access operation failed", Effect.gen(function* () {
  const serverId = serverIdFor(input)
  const authorization = yield* ServerAuthorization
  if (input.endpoint.operationId === "dashboardCapabilities") {
    const access = yield* authorization.resolve(input.request, serverId)
    if (!access.manager && Object.keys(access.sections).length === 0) return yield* new Forbidden({ message: "You do not have dashboard access" })
    return { server_id: serverId, full_access: access.manager, sections: access.manager ? Object.fromEntries(sections.map((section) => [section, "manage"])) : access.sections }
  }
  const sql = yield* SqlClient.SqlClient
  const roles = yield* rolesFromDiscord(serverId, input.bindings.DISCORD_CLIENT_ID, input.endpoint.operationId === "updateDashboardAccess")
  const available = roles.map(({ id, name, color, position }) => ({ id, name, color, position }))
  const before = yield* sql<{ role_id: string; section: string; access_level: "view" | "manage" }>`SELECT role_id, section, access_level FROM dashboard_role_grants WHERE server_id = ${serverId} ORDER BY role_id, section`
  if (input.endpoint.operationId === "dashboardAccess") return { server_id: serverId, roles: available, grants: before, sections }
  const body = yield* Schema.decodeUnknownEffect(dashboardEndpoints.updateDashboardAccess.body)(input.body).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid Dashboard grants" })))
  const assignable = new Set(roles.map((role) => role.id))
  const seen = new Set<string>()
  for (const grant of body.grants) {
    if (!assignable.has(grant.role_id)) return yield* new InvalidRequest({ message: "A selected role is managed, missing, or @everyone" })
    if (!sections.some((section) => section === grant.section)) return yield* new InvalidRequest({ message: "Invalid dashboard section" })
    const key = `${grant.role_id}:${grant.section}`
    if (seen.has(key)) return yield* new InvalidRequest({ message: "Duplicate role and section grant" })
    seen.add(key)
  }
  const actor = input.principal.kind === "user" ? input.principal.userId : null
  yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql`DELETE FROM dashboard_role_grants WHERE server_id = ${serverId}`
    for (const grant of body.grants) yield* sql`INSERT INTO dashboard_role_grants (server_id, role_id, section, access_level, created_by_user_id) VALUES (${serverId}, ${grant.role_id}, ${grant.section}, ${grant.access_level}, ${actor})`
    yield* sql`INSERT INTO dashboard_access_audit (server_id, actor_user_id, before_grants, after_grants) VALUES (${serverId}, ${actor}, ${JSON.stringify(before)}::jsonb, ${JSON.stringify(body.grants)}::jsonb)`
  }))
  return { server_id: serverId, roles: available, grants: body.grants, sections }
}))

const channelOperation = (input: DashboardServerOperationInput) => Effect.gen(function* () {
  const serverId = serverIdFor(input)
  const discord = yield* DiscordApi
  if (input.endpoint.operationId === "serverDiscordTest") {
    if (input.bindings.DISCORD_BOT_TOKEN.trim() === "") return { status: "error", message: "Bot token not configured", bot_token_present: false }
    const raw = yield* discord.request(`/guilds/${serverId}`).pipe(Effect.result)
    if (raw._tag === "Failure") return { status: "error", message: `Discord API error: ${raw.failure.message}`, bot_token_present: true }
    const guild = yield* decodeDiscord(RawGuild, raw.success)
    return { status: "success", message: "Discord API access working", bot_token_present: true, guild_name: guild.name, status_code: "200" }
  }
  if (input.endpoint.operationId === "discordRoles") {
    const roles = yield* rolesFromDiscord(serverId, input.bindings.DISCORD_CLIENT_ID)
    return { server_id: serverId, roles, count: roles.length }
  }
  if (input.endpoint.operationId === "serverThreads") {
    const result = yield* decodeDiscord(Schema.Struct({ threads: Schema.Array(RawChannel) }), yield* discord.request(`/guilds/${serverId}/threads/active`))
    const parentIds = result.threads.flatMap((thread) => thread.parent_id ? [thread.parent_id] : [])
    const names = yield* dashboardThreadParentNames(input.bindings, serverId, parentIds,
      () => discord.request(`/guilds/${serverId}/channels`).pipe(Effect.flatMap((raw) => decodeDiscord(Schema.Array(RawChannel), raw)),
        Effect.map((channels) => new Map(channels.map((channel) => [channel.id, channel.name])))))
    return result.threads.map((thread) => ({ id: thread.id, name: thread.name, parent_channel_id: thread.parent_id ?? "", parent_channel_name: names.get(thread.parent_id ?? "") ?? "", archived: thread.thread_metadata?.archived ?? false }))
      .sort((left, right) => left.parent_channel_name.localeCompare(right.parent_channel_name) || left.name.localeCompare(right.name))
  }
  const channels = yield* decodeDiscord(Schema.Array(RawChannel), yield* readDashboardGatewayCollection(input.bindings.DISCORD_CLIENT_ID, serverId, "channels"))
  const names = new Map(channels.map((channel) => [channel.id, channel.name]))
  const typeNames: Readonly<Record<number, string>> = { 0: "text", 4: "category", 5: "news", 15: "forum" }
  return channels.filter((channel) => typeNames[channel.type] !== undefined).map((channel) => ({
    id: channel.id, name: channel.name, type: typeNames[channel.type],
    ...(channel.parent_id === null || channel.parent_id === undefined ? {} : { parent_id: channel.parent_id, parent_name: names.get(channel.parent_id) ?? "" }),
  })).sort((left, right) => (left.parent_name ?? "").localeCompare(right.parent_name ?? "") || left.name.localeCompare(right.name))
})

const guildOperation = (input: DashboardServerOperationInput) => database("Guild information could not be loaded", Effect.gen(function* () {
  const discord = yield* DiscordApi
  const sql = yield* SqlClient.SqlClient
  const credentials = yield* DiscordCredentials
  const wanted = serverIdFor(input)
  if (wanted !== "") {
    const cached = yield* sql<{ data: unknown }>`SELECT guild.data
      FROM discord_cache.guilds guild
      JOIN discord_cache.gateway_shards shard
        ON (shard.application_id, shard.shard_id) = (guild.application_id, guild.shard_id)
      WHERE guild.id = ${wanted} AND guild.application_id = ${input.bindings.DISCORD_CLIENT_ID}
        AND guild.generation = shard.generation AND guild.available AND guild.metadata_complete AND shard.healthy
        AND shard.heartbeat_at > clock_timestamp() - ${gatewayHeartbeatFreshnessSeconds} * interval '1 second'`
    if (cached[0] === undefined) return yield* new UpstreamUnavailable({ cause: "Gateway metadata is not ready", message: "Discord guild cache is temporarily unavailable" })
    const guild = yield* decodeDiscord(Schema.Struct({
      id: DecimalSnowflake, name: Schema.String, icon: optionalText, owner_id: optionalText,
      features: Schema.Array(Schema.String), approximate_member_count: Schema.optionalKey(Schema.Number),
      description: optionalText, banner: optionalText, premium_tier: Schema.Number,
      premium_subscription_count: Schema.optionalKey(Schema.Number),
    }), cached[0].data)
    if (guild.id !== wanted) return yield* new UpstreamUnavailable({ cause: "Guild mismatch", message: "Discord guild identity is invalid" })
    const asset = (kind: string, hash: string | null | undefined) => hash
      ? `https://cdn.discordapp.com/${kind}/${guild.id}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}` : null
    return { id: guild.id, name: guild.name, icon: asset("icons", guild.icon), owner_id: guild.owner_id ?? null,
      features: guild.features, member_count: guild.approximate_member_count ?? null, description: guild.description ?? null,
      banner: asset("banners", guild.banner), premium_tier: guild.premium_tier, boost_count: guild.premium_subscription_count ?? 0 }
  }
  if (input.principal.kind !== "user") return yield* new Forbidden({ message: "A user identity is required to list Discord guilds" })
  const token = yield* credentials.accessToken(input.principal.userId, input.principal.deviceId)
  const guilds = yield* decodeDiscord(Schema.Array(RawGuild), yield* discord.request("/users/@me/guilds?limit=200&with_counts=true", { oauthAccessToken: token }))
  if (guilds.length === 0) return []
  const cached = yield* sql.unsafe<{ id: string; last_command_at: Date | string | null }>(`
    SELECT cache.id, stored.last_command_at
    FROM discord_cache.guilds cache
    LEFT JOIN servers stored ON stored.id = cache.id
    WHERE cache.id = ANY($1::text[])
  `, [guilds.map((guild) => guild.id)])
  const activityByGuild = new Map(cached.map((row) => [row.id, row.last_command_at]))
  const selected = guilds.filter((guild) => activityByGuild.has(guild.id))
  const accessByGuild = yield* resolveListedGuildAccess(input.principal, input.bindings.DISCORD_CLIENT_ID, selected.map((guild) => ({
    id: guild.id, owner: guild.owner ?? false, permissions: guild.permissions ?? "0",
  })))
  const visible = selected.flatMap((guild) => {
    const access = accessByGuild.get(guild.id)!
    if (!access.manager && Object.keys(access.sections).length === 0) return []
    const permissions = guild.permissions ?? "0"
    const manager = discordGuildManager({ owner: guild.owner ?? false, permissions })
    const role = guild.owner === true ? "Owner" : (BigInt(permissions) & 8n) !== 0n ? "Administrator" : manager ? "Manager" : "Member"
    return [{ guild, manager, permissions, role }]
  })
  return visible.map(({ guild, manager, permissions, role }) => {
    const last = activityByGuild.get(guild.id) ?? null
    return { id: guild.id, name: guild.name, icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
      owner: guild.owner ?? false, permissions, role, features: guild.features ?? [], has_bot: true,
      ...optional("member_count", guild.approximate_member_count), delegated: !manager,
      ...optional("last_command_at", last === null ? null : iso(last)), inactive: last === null || new Date(last).getTime() < Date.now() - 90 * 86_400_000 }
  })
}))

const profileOperation = (input: DashboardServerOperationInput) => database("Bot profile operation failed", Effect.gen(function* () {
  const serverId = serverIdFor(input)
  const body = record(input.body)
  const payload: Record<string, unknown> = {}
  if (input.endpoint.operationId === "updateBotGuildProfile") {
    const paidChange = ["avatar", "banner", "bio", "clear_avatar", "clear_banner", "clear_bio"].some((key) => body[key] !== undefined && body[key] !== false)
    if (paidChange && input.principal.kind === "user") {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{ active: boolean }>`SELECT EXISTS(SELECT 1 FROM subscription_entitlements WHERE user_id = ${input.principal.userId} AND active = true) AS active`
      if (rows[0]?.active !== true) return yield* new Forbidden({ message: "An active ClashKing subscription is required to change the bot avatar, banner, or bio" })
    }
    if (body.clear_name === true) payload.nick = null
    else if (typeof body.name === "string") {
      const name = body.name.trim()
      if ([...name].length > 32) return yield* new InvalidRequest({ message: "Name must be 32 characters or fewer" })
      payload.nick = name || null
    }
    if (body.clear_bio === true) payload.bio = null
    else if (typeof body.bio === "string") {
      if (new TextEncoder().encode(body.bio).length > 190) return yield* new InvalidRequest({ message: "Bio must be 190 characters or fewer" })
      payload.bio = body.bio
    }
    for (const field of ["avatar", "banner"] as const) {
      if (body[`clear_${field}`] === true) payload[field] = null
      else if (typeof body[field] === "string") {
        const value = body[field]
        payload[field] = yield* validateDiscordProfileImage(value, field)
      }
    }
    if (Object.keys(payload).length === 0) return yield* new InvalidRequest({ message: "At least one profile field is required" })
  }
  return yield* discordBotProfile(input.bindings, serverId, payload)
}))

const panelOperation = (input: DashboardServerOperationInput) => database("Welcome panel operation failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const serverId = serverIdFor(input)
  if (input.endpoint.operationId === "updateServerPanel") {
    const body = yield* Schema.decodeUnknownEffect(dashboardEndpoints.updateServerPanel.body)(input.body).pipe(Effect.mapError(() => new InvalidRequest({ message: "Invalid panel body" })))
    const welcomeChannel = body.welcome_channel ?? null
    if (welcomeChannel !== null) yield* discordDestinationId(welcomeChannel, "welcome_channel")
    const color = body.button_color || "Grey"
    yield* sql.withTransaction(Effect.gen(function* () {
      yield* lockServerDiscordResources(serverId)
      yield* sql`INSERT INTO server_welcome_panels (server_id, embed_name, button_color, welcome_channel_id, updated_at)
        VALUES (${serverId}, ${body.embed_name ?? null}, ${color}, ${welcomeChannel}, now())
        ON CONFLICT (server_id) DO UPDATE SET embed_name = EXCLUDED.embed_name, button_color = EXCLUDED.button_color, welcome_channel_id = EXCLUDED.welcome_channel_id, updated_at = now()`
      yield* sql`DELETE FROM server_welcome_panel_buttons WHERE server_id = ${serverId}`
      for (const [position, button] of body.buttons.entries()) yield* sql`INSERT INTO server_welcome_panel_buttons (server_id, button_name, position) VALUES (${serverId}, ${button}, ${position})`
    }))
    return { ...optional("embed_name", body.embed_name), buttons: body.buttons, button_color: color, welcome_channel: welcomeChannel }
  }
  const rows = yield* sql<{ embed_name: string | null; button_color: string; welcome_channel_id: string | null }>`SELECT embed_name, button_color, welcome_channel_id FROM server_welcome_panels WHERE server_id = ${serverId}`
  const buttons = yield* sql<{ button_name: string }>`SELECT button_name FROM server_welcome_panel_buttons WHERE server_id = ${serverId} ORDER BY position, button_name`
  const row = rows[0]
  return { ...optional("embed_name", row?.embed_name), buttons: buttons.map((button) => button.button_name), button_color: row?.button_color ?? "Grey", welcome_channel: row?.welcome_channel_id ?? null }
}))

interface RoleRow { readonly id: string; readonly server_id: string; readonly clan_tag: string | null; readonly type: string; readonly option: string; readonly role_id: string; readonly mode: string; readonly created_at: Date | string; readonly updated_at: Date | string }
const roleValue = (row: RoleRow) => ({ id: row.id, server_id: row.server_id, ...optional("clan_tag", row.clan_tag), type: row.type, option: row.option, role_id: row.role_id, mode: row.mode, created_at: iso(row.created_at), updated_at: iso(row.updated_at) })
const roleColumns = "id::text, server_id, clan_tag, type, option, role_id, mode, created_at, updated_at"
const roleOperation = (input: DashboardServerOperationInput) => database("Server role operation failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const serverId = serverIdFor(input)
  const operation = input.endpoint.operationId
  if (operation === "serverRoles") {
    const rows = yield* sql.unsafe<RoleRow>(`SELECT ${roleColumns} FROM server_roles WHERE server_id = $1 AND ($2 = '' OR type = $2) AND ($3 = '' OR clan_tag = $3) ORDER BY type, option, clan_tag NULLS FIRST, role_id`, [serverId, text(input.query.type), text(input.query.clan_tag)])
    const roles = rows.map(roleValue)
    return { server_id: serverId, roles, count: roles.length }
  }
  const id = text(input.path.roleId)
  if (operation !== "createServerRole") yield* validateUuid(id)
  if (operation === "deleteServerRole") {
    const rows = yield* sql.unsafe<RoleRow>(`DELETE FROM server_roles WHERE server_id = $1 AND id = $2::uuid RETURNING ${roleColumns}`, [serverId, id])
    return { message: "Server role deleted.", role: roleValue(yield* requireRow(rows, "Server role not found")) }
  }
  let values: JsonRecord = record(input.body)
  if (operation === "updateServerRole") {
    const rows = yield* sql.unsafe<RoleRow>(`SELECT ${roleColumns} FROM server_roles WHERE server_id = $1 AND id = $2::uuid`, [serverId, id])
    values = { ...(yield* requireRow(rows, "Server role not found")), ...values }
  }
  const type = text(values.type).trim(), option = text(values.option).trim(), roleId = text(values.role_id).trim(), mode = text(values.mode).trim() || "both"
  const clanTag = text(values.clan_tag).trim() ? normalizeTag(values.clan_tag) : null
  if (!option || !/^\d+$/u.test(roleId)) return yield* new InvalidRequest({ message: "option and a decimal-string role_id are required" })
  if (clanTag !== null && type !== "clan_role") return yield* new InvalidRequest({ message: "Only clan_role can use clan_tag" })
  if (type === "family" && !["family", "not_family"].includes(option)) return yield* new InvalidRequest({ message: "Family roles only support family and not_family options" })
  if (type === "clan_role" && (!["member", "elder", "co_leader", "leader"].includes(option) || clanTag === null && option === "member")) return yield* new InvalidRequest({ message: "Invalid clan role option or scope" })
  const rows = operation === "createServerRole"
    ? yield* sql.unsafe<RoleRow>(`INSERT INTO server_roles (server_id, clan_tag, type, option, role_id, mode) SELECT id, $2, $3, $4, $5, $6 FROM servers WHERE id = $1 RETURNING ${roleColumns}`, [serverId, clanTag, type, option, roleId, mode])
    : yield* sql.unsafe<RoleRow>(`UPDATE server_roles SET clan_tag = $3, type = $4, option = $5, role_id = $6, mode = $7, updated_at = now() WHERE server_id = $1 AND id = $2::uuid RETURNING ${roleColumns}`, [serverId, id, clanTag, type, option, roleId, mode])
  return { message: operation === "createServerRole" ? "Server role created." : "Server role updated.", role: roleValue(yield* requireRow(rows, "Server or role not found")) }
}))

const settingsFields: Readonly<Record<string, string>> = { require_api_token_when_linking: "require_api_token_when_linking", embed_color: "embed_color", nickname_rule: "nickname_rule", non_family_nickname_rule: "non_family_nickname_rule", change_nickname: "change_nickname", flair_non_family: "flair_non_family", auto_eval_nickname: "auto_eval_nickname", autoeval_log: "autoeval_log_channel_id", autoeval: "autoeval_enabled", full_whitelist_role: "full_whitelist_role_id", autoboard_limit: "autoboard_limit", tied: "tied_stats_only", family_label: "family_label" }
const loadSettings = (serverId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<JsonRecord>`SELECT id AS server_id, id AS server, name, embed_color, nickname_rule, non_family_nickname_rule, change_nickname, flair_non_family, auto_eval_nickname, autoeval_log_channel_id AS autoeval_log, autoeval_enabled AS autoeval, full_whitelist_role_id AS full_whitelist_role, autoboard_limit, tied_stats_only AS tied, family_label,
    require_api_token_when_linking,
    jsonb_build_object('clan', link_parse_clan, 'army', link_parse_army, 'player', link_parse_player, 'base', link_parse_base, 'show', link_parse_show) AS link_parse FROM servers WHERE id = ${serverId}`
  const row = yield* requireRow(rows, "Server not found")
  const triggers = yield* sql<{ trigger: string }>`SELECT trigger FROM server_autoeval_triggers WHERE server_id = ${serverId} ORDER BY position, trigger`
  const countdowns = yield* sql<{ type: string; channel_id: string }>`SELECT type, channel_id FROM server_countdowns WHERE server_id = ${serverId} AND clan_tag IS NULL ORDER BY type`
  const roles = yield* sql.unsafe<RoleRow>(`SELECT ${roleColumns} FROM server_roles WHERE server_id = $1 ORDER BY type, option, clan_tag NULLS FIRST, role_id`, [serverId])
  const fields: JsonRecord = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null))
  return { ...fields, autoeval: row.autoeval, auto_eval_nickname: row.auto_eval_nickname, ...optional("autoeval_log", row.autoeval_log), autoeval_triggers: triggers.map((item) => item.trigger), countdowns: Object.fromEntries(countdowns.map((item) => [item.type, item.channel_id])), server_roles: roles.map(roleValue) }
})

const updateSettings = (serverId: string, body: JsonRecord) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  if (Object.keys(body).length === 0) return yield* new InvalidRequest({ message: "No fields to update" })
  if (body.require_api_token_when_linking !== undefined && typeof body.require_api_token_when_linking !== "boolean") {
    return yield* new InvalidRequest({ message: "require_api_token_when_linking must be a boolean" })
  }
  for (const field of ["autoeval_log", "full_whitelist_role"]) if (body[field] !== undefined && body[field] !== null) yield* discordDestinationId(body[field], field)
  yield* sql.withTransaction(Effect.gen(function* () {
    const existing = yield* sql<{ id: string }>`SELECT id FROM servers WHERE id = ${serverId} FOR UPDATE`
    yield* requireRow(existing, "Server not found")
    for (const [field, column] of Object.entries(settingsFields)) if (body[field] !== undefined) {
      const value = field === "embed_color" ? String(body[field]) : body[field]
      yield* sql.unsafe(`UPDATE servers SET ${column} = $2, updated_at = now() WHERE id = $1`, [serverId, value])
    }
    const linkParse = record(body.link_parse)
    for (const field of ["clan", "army", "player", "base", "show"]) if (linkParse[field] !== undefined) yield* sql.unsafe(`UPDATE servers SET link_parse_${field} = $2, updated_at = now() WHERE id = $1`, [serverId, linkParse[field]])
    if (Array.isArray(body.autoeval_triggers)) {
      yield* sql`DELETE FROM server_autoeval_triggers WHERE server_id = ${serverId}`
      for (const [position, trigger] of body.autoeval_triggers.entries()) yield* sql`INSERT INTO server_autoeval_triggers (server_id, trigger, position) VALUES (${serverId}, ${trigger}, ${position})`
    }
  }))
})

const settingsOperation = (input: DashboardServerOperationInput) => database("Server settings operation failed", Effect.gen(function* () {
  const serverId = serverIdFor(input), operation = input.endpoint.operationId
  const sql = yield* SqlClient.SqlClient
  if (operation === "reactivateServer") {
    yield* sql.withTransaction(Effect.gen(function* () {
      const activated = yield* sql<{ id: string }>`INSERT INTO servers (id, name, last_command_at)
        SELECT guild.id, guild.data->>'name', now()
        FROM discord_cache.guilds guild
        JOIN discord_cache.gateway_shards shard
          ON (shard.application_id, shard.shard_id) = (guild.application_id, guild.shard_id)
        WHERE guild.id = ${serverId} AND guild.application_id = ${input.bindings.DISCORD_CLIENT_ID}
          AND guild.generation = shard.generation AND guild.available AND guild.metadata_complete AND shard.healthy
          AND shard.heartbeat_at > clock_timestamp() - ${gatewayHeartbeatFreshnessSeconds} * interval '1 second'
          AND COALESCE(guild.data->>'name', '') <> ''
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, last_command_at = now(), left_at = NULL, updated_at = now()
        RETURNING id`
      if (activated.length === 0) return yield* new UpstreamUnavailable({ cause: "Gateway metadata is not ready", message: "Discord authorization cache is temporarily unavailable" })
      yield* notifyTracking(sql, { kind: "guild_reactivated", serverId })
    }))
    return { message: "Server tracking re-enabled" }
  }
  if (operation === "updateServerEmbedColor") {
    const raw = text(input.path.hexCode).replace(/^#/u, "")
    if (!/^[0-9a-f]{6}$/iu.test(raw)) return yield* new InvalidRequest({ message: "hexCode must contain six hexadecimal digits" })
    const color = Number.parseInt(raw, 16)
    yield* updateSettings(serverId, { embed_color: color })
    return { message: "Embed color updated", server_id: serverId, embed_color: color }
  }
  if (operation === "updateServerSettings" || operation === "updateRoleSettings") {
    const body = record(input.body)
    const values = operation === "updateRoleSettings" ? { ...body, ...(body.auto_eval_status === undefined ? {} : { autoeval: body.auto_eval_status }) } : body
    yield* updateSettings(serverId, values)
    return operation === "updateRoleSettings" ? { message: "Role settings updated.", server_id: serverId } : { message: "Server settings updated successfully", server_id: serverId, updated_fields: Object.keys(body).length }
  }
  const settings = yield* loadSettings(serverId)
  if (operation === "roleSettings") return { server_id: serverId, auto_eval_status: settings.autoeval, auto_eval_nickname: settings.auto_eval_nickname, autoeval_triggers: settings.autoeval_triggers, ...optional("autoeval_log", record(settings).autoeval_log) }
  if (input.query.clan_settings === true) return { ...settings, clans: yield* clanSettingsRows(serverId) }
  return settings
}))

interface ClanRow { readonly tag: string; readonly name: string; readonly abbreviation: string; readonly category: string | null; readonly badge_token: string; readonly clan_level: number; readonly member_count: number; readonly added_at: Date | string }
const clanSelect = `SELECT sc.tag, clan.name, sc.abbreviation, category.name AS category, clan.badge_token, clan.clan_level, clan.member_count, sc.added_at FROM server_clans sc JOIN basic_clan clan ON clan.tag = sc.tag LEFT JOIN server_clan_categories category ON category.id = sc.category_id WHERE sc.server_id = $1`
const clanSettingsRows = (serverId: string) => Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<ClanRow>(`${clanSelect} ORDER BY clan.name, sc.tag`, [serverId])
  return rows.map((row) => ({ tag: row.tag, name: row.name, server_id: serverId, abbreviation: row.abbreviation, ...optional("category", row.category) }))
})
const clanOperation = (input: DashboardServerOperationInput) => database("Server clan operation failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const serverId = serverIdFor(input), operation = input.endpoint.operationId
  const tag = normalizeTag(input.path.clanTag)
  if (input.path.clanTag !== undefined && !/^#[0289PYLQGRJCUV]{3,15}$/u.test(tag)) return yield* new InvalidRequest({ message: "The clan tag is invalid" })
  if (operation === "removeServerClan") {
    const rows = yield* sql<{ tag: string }>`DELETE FROM server_clans WHERE server_id = ${serverId} AND tag = ${tag} RETURNING tag`
    return { message: "Clan removed successfully", server_id: serverId, clan_tag: tag, deleted_count: rows.length }
  }
  if (operation === "serverClansBasic") return (yield* clanSettingsRows(serverId)).map(({ tag, name }) => ({ tag, name }))
  if (operation === "serverClans") {
    yield* requireRow(yield* sql<{ id: string }>`SELECT id FROM servers WHERE id = ${serverId}`, "Server not found")
    const rows = yield* sql.unsafe<ClanRow>(`${clanSelect} ORDER BY clan.name, sc.tag`, [serverId])
    return rows.map((row) => ({ tag: row.tag, name: row.name, ...(row.badge_token ? { badge_url: `https://api-assets.clashofclans.com/badges/200/${row.badge_token.replace(/\.png$/u, "")}.png` } : {}), level: row.clan_level, member_count: row.member_count, added_at: iso(row.added_at), settings: { abbreviation: row.abbreviation, ...optional("category", row.category) } }))
  }
  if (operation === "serverClanSettings") {
    const rows = yield* clanSettingsRows(serverId)
    return yield* requireRow(rows.filter((row) => row.tag === tag), "Server or clan not found")
  }
  const body = record(input.body)
  if (Object.keys(body).length === 0) return yield* new InvalidRequest({ message: "No fields to update" })
  let category: ReturnType<typeof categoryValue> | null = null
  yield* sql.withTransaction(Effect.gen(function* () {
    const rows = yield* sql<{ tag: string }>`UPDATE server_clans SET updated_at = now() WHERE server_id = ${serverId} AND tag = ${tag} RETURNING tag`
    yield* requireRow(rows, "Server or clan not found")
    if (body.abbreviation !== undefined) yield* sql`UPDATE server_clans SET abbreviation = ${body.abbreviation} WHERE server_id = ${serverId} AND tag = ${tag}`
    if (body.category !== undefined) {
      if (body.category === null || text(body.category).trim() === "") yield* sql`UPDATE server_clans SET category_id = NULL WHERE server_id = ${serverId} AND tag = ${tag}`
      else {
        const name = yield* categoryName(body.category)
        const categories = yield* sql<CategoryRow>`INSERT INTO server_clan_categories (server_id, name, position)
          SELECT ${serverId}, ${name}, COALESCE(max(position) + 1, 0) FROM server_clan_categories WHERE server_id = ${serverId}
          ON CONFLICT (server_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id::text, server_id, name, position, 0::int AS clan_count`
        const row = yield* requireRow(categories, "Category could not be assigned")
        yield* sql`UPDATE server_clans SET category_id = ${row.id}::uuid WHERE server_id = ${serverId} AND tag = ${tag}`
        const refreshed = yield* sql.unsafe<CategoryRow>(`SELECT ${categoryColumns} FROM server_clan_categories category WHERE category.id = $1::uuid`, [row.id])
        category = categoryValue(yield* requireRow(refreshed, "Category not found"))
      }
    }
  }))
  return { message: "Clan settings updated successfully", server_id: serverId, clan_tag: tag, updated_fields: Object.keys(body).length, category }
}))

const ClashClan = Schema.Struct({
  tag: Schema.String, name: Schema.String, description: Schema.String, clanLevel: Schema.Number,
  location: Schema.optionalKey(Schema.Struct({ id: Schema.Number })), warLeague: Schema.optionalKey(Schema.Struct({ id: Schema.Number })),
  capitalLeague: Schema.optionalKey(Schema.Struct({ id: Schema.Number })), isWarLogPublic: Schema.Boolean,
  warWins: Schema.Number, warWinStreak: Schema.Number, clanPoints: Schema.Number, members: Schema.Number,
  badgeUrls: Schema.Struct({ large: Schema.optionalKey(Schema.String), medium: Schema.optionalKey(Schema.String), small: Schema.optionalKey(Schema.String) }),
  memberList: Schema.Array(Schema.Struct({ tag: Schema.String, name: Schema.String, donations: Schema.Number, donationsReceived: Schema.Number })),
})

const addClanOperation = (input: DashboardServerOperationInput) => database("Clan could not be added", Effect.gen(function* () {
  const tag = normalizeTag(record(input.body).tag), serverId = serverIdFor(input)
  if (!/^#[0289PYLQGRJCUV]{3,15}$/u.test(tag)) return yield* new InvalidRequest({ message: "The clan tag is invalid. Check the tag and try again." })
  const response = yield* Effect.tryPromise({
    try: () => input.bindings.CLASH_PROXY.fetch(new Request(`http://clash-proxy.internal/v1/clans/${encodeURIComponent(tag)}`, { signal: AbortSignal.timeout(15_000) })),
    catch: (cause) => new UpstreamUnavailable({ cause, message: "Clash of Clans API is unavailable" }),
  })
  if (!response.ok) {
    yield* Effect.tryPromise({ try: () => response.body?.cancel() ?? Promise.resolve(), catch: (cause) => new UpstreamUnavailable({ cause, message: "Clash response could not be closed" }) })
    return yield* response.status === 404 ? new NotFound({ message: "Clan not found. The tag is invalid, or the clan was deleted." }) : new UpstreamUnavailable({ cause: response.status, message: "Clash of Clans API is unavailable" })
  }
  const raw = yield* Effect.tryPromise({ try: () => response.json() as Promise<unknown>, catch: (cause) => new UpstreamUnavailable({ cause, message: "Clash returned invalid JSON" }) })
  const clan = yield* Schema.decodeUnknownEffect(ClashClan)(raw).pipe(Effect.mapError((cause) => new UpstreamUnavailable({ cause, message: "Clash clan response failed schema validation" })))
  if (clan.members === 0) return yield* new InvalidRequest({ message: "The clan is empty and cannot be added." })
  const members = clan.memberList.filter((member) => member.tag !== "").map(({ tag, name }) => ({ tag, name })).sort((a, b) => a.tag.localeCompare(b.tag))
  const donated = clan.memberList.reduce((sum, member) => sum + member.donations, 0)
  const received = clan.memberList.reduce((sum, member) => sum + member.donationsReceived, 0)
  const badge = (clan.badgeUrls.large ?? clan.badgeUrls.medium ?? clan.badgeUrls.small ?? "").split("/").at(-1)?.replace(/\.png$/u, "") ?? ""
  const sql = yield* SqlClient.SqlClient
  yield* sql.withTransaction(Effect.gen(function* () {
    yield* sql`INSERT INTO basic_clan (tag, name, description, clan_level, location_id, cwl_league_id, capital_league_id, public_war_log, war_wins, war_win_streak, clan_points, member_count, badge_token, troops_donated, troops_received, members, last_active)
      VALUES (${clan.tag}, ${clan.name}, ${clan.description}, ${clan.clanLevel}, ${clan.location?.id ?? null}, ${clan.warLeague?.id || 48000000}, ${clan.capitalLeague?.id ?? null}, ${clan.isWarLogPublic}, ${clan.warWins}, ${clan.warWinStreak}, ${clan.clanPoints}, ${clan.members}, ${badge}, ${donated}, ${received}, ${JSON.stringify(members)}::jsonb, now())
      ON CONFLICT (tag) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, clan_level = EXCLUDED.clan_level, location_id = EXCLUDED.location_id, cwl_league_id = EXCLUDED.cwl_league_id, capital_league_id = EXCLUDED.capital_league_id, public_war_log = EXCLUDED.public_war_log, war_wins = EXCLUDED.war_wins, war_win_streak = EXCLUDED.war_win_streak, clan_points = EXCLUDED.clan_points, member_count = EXCLUDED.member_count, badge_token = EXCLUDED.badge_token, troops_donated = EXCLUDED.troops_donated, troops_received = EXCLUDED.troops_received, members = EXCLUDED.members, last_active = now()`
    yield* sql`INSERT INTO server_clans (tag, server_id, updated_at) VALUES (${clan.tag}, ${serverId}, now()) ON CONFLICT (tag, server_id) DO UPDATE SET updated_at = now()`
  }))
  return { message: "Clan added successfully", server_id: serverId, clan_tag: clan.tag, clan_name: clan.name }
}))

const countdownDefinitions = [
  ["clan_games_timer", "Show the Clan Games time.", "server"], ["cwl_timer", "Show the Clan War League time.", "server"],
  ["raid_weekend_timer", "Show the Raid Weekend time.", "server"], ["season_end_timer", "Show the season end time.", "server"],
  ["season_day_timer", "Show the current season day.", "server"], ["war_score", "Show the current clan war score.", "clan"], ["war_timer", "Show the current clan war time.", "clan"],
] as const
const countdownReadOperation = (input: DashboardServerOperationInput) => database("Countdowns could not be loaded", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, serverId = serverIdFor(input)
  const clanScoped = input.endpoint.operationId === "clanCountdowns", tag = clanScoped ? normalizeTag(input.path.clanTag) : null
  const scoped = tag === null ? yield* sql<{ id: string }>`SELECT id FROM servers WHERE id = ${serverId}` : yield* sql<{ id: string }>`SELECT tag AS id FROM server_clans WHERE server_id = ${serverId} AND tag = ${tag}`
  yield* requireRow(scoped, tag === null ? "Server not found" : "Clan not found on this server")
  const rows = yield* sql<{ type: string; channel_id: string }>`SELECT type, channel_id FROM server_countdowns WHERE server_id = ${serverId} AND clan_tag IS NOT DISTINCT FROM ${tag}`
  return { server_id: serverId, ...optional("clan_tag", tag), countdowns: countdownDefinitions.filter(([, , scope]) => scope === (clanScoped ? "clan" : "server")).map(([type, name]) => {
    const channel = rows.find((row) => row.type === type)
    return { type, name, enabled: channel !== undefined, ...optional("channel_id", channel?.channel_id) }
  }) }
}))

const countdownMutationOperation = (input: DashboardServerOperationInput) => database("Countdown operation failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, serverId = serverIdFor(input), body = record(input.body)
  const definition = countdownDefinitions.find(([type]) => type === body.countdown_type)
  if (definition === undefined) return yield* new InvalidRequest({ message: "Unknown countdown type" })
  const [type, , scope] = definition
  if (scope === "clan" && text(body.clan_tag).trim() === "") return yield* new InvalidRequest({ message: `clan_tag is required for ${type}` })
  const tag = scope === "clan" ? normalizeTag(body.clan_tag) : null
  let created: Effect.Success<ReturnType<typeof createCountdownChannel>> | undefined
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* lockServerDiscordResources(serverId)
    let clanName = "Clan"
    if (tag !== null) {
      const rows = yield* sql<{ name: string }>`SELECT clan.name FROM server_clans sc JOIN basic_clan clan ON clan.tag = sc.tag WHERE sc.server_id = ${serverId} AND sc.tag = ${tag}`
      clanName = (yield* requireRow(rows, "Clan not found on this server")).name
    }
    const rows = yield* sql<{ channel_id: string }>`SELECT channel_id FROM server_countdowns WHERE server_id = ${serverId} AND clan_tag IS NOT DISTINCT FROM ${tag} AND type = ${type} FOR UPDATE`
    const prior = rows[0]
    if (input.endpoint.operationId === "disableCountdown") {
      if (prior === undefined) return yield* new NotFound({ message: "Countdown not found" })
      yield* sql`DELETE FROM server_countdowns WHERE server_id = ${serverId} AND clan_tag IS NOT DISTINCT FROM ${tag} AND type = ${type}`
      return { message: `${type} disabled`, countdown_type: type }
    }
    const names: Readonly<Record<string, string>> = { clan_games_timer: "CG Loading...", cwl_timer: "CWL Loading...", raid_weekend_timer: "Raids Loading...", season_end_timer: "EOS Loading...", season_day_timer: "Day 0" }
    const name = scope === "clan" ? `${clanName}: Loading...` : names[type] ?? ""
    if (prior !== undefined) return { message: `${type} already enabled`, countdown_type: type, channel_id: prior.channel_id, channel_name: name }
    created = yield* createCountdownChannel(serverId, name)
    yield* sql`INSERT INTO server_countdowns (server_id, clan_tag, type, channel_id) VALUES (${serverId}, ${tag}, ${type}, ${created.id})`
    return { message: `${type} enabled`, countdown_type: type, channel_id: created.id, channel_name: name }
  })).pipe(Effect.catch((failure) => created === undefined ? Effect.fail(failure) : compensateCreatedDiscordResource(created).pipe(Effect.andThen(Effect.fail(failure)))))
}))

const logTypes = new Set(["join_log", "leave_log", "donation_log", "clan_achievement_log", "clan_requirements_log", "clan_description_log", "war_log", "war_panel", "cwl_lineup_change_log", "capital_donations", "capital_attacks", "raid_panel", "capital_weekly_summary", "role_change", "troop_upgrade", "super_troop_boost", "th_upgrade", "league_change", "spell_upgrade", "hero_upgrade", "hero_equipment_upgrade", "name_change", "legend_log_attacks", "legend_log_defenses", "ban_alert", "reddit_feed"])
const Webhook = Schema.Struct({ id: DecimalSnowflake, channel_id: Schema.optionalKey(Schema.NullOr(DecimalSnowflake)) })
interface LogRow { readonly clan_tag: string | null; readonly type: string; readonly webhook_id: string; readonly thread_id: string | null; readonly disabled: boolean; readonly disabled_reason: string | null }
const logsReadStateOperation = (input: DashboardServerOperationInput) => database("Server logs could not be loaded or updated", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, discord = yield* DiscordApi, serverId = serverIdFor(input)
  const hooks = yield* decodeDiscord(Schema.Array(Webhook), yield* discord.request(`/guilds/${serverId}/webhooks`))
  const enrich = (items: ReadonlyArray<LogRow>) => items.map((row) => ({ type: row.type, webhook_id: row.webhook_id, thread_id: row.thread_id, disabled: row.disabled, disabled_reason: row.disabled_reason, ...optional("clan_tag", row.clan_tag), ...optional("channel_id", hooks.find((hook) => hook.id === row.webhook_id)?.channel_id) }))
  if (input.endpoint.operationId === "serverLogs") {
    const rows = yield* sql<LogRow>`SELECT clan_tag, type, webhook_id, thread_id, disabled, disabled_reason FROM server_logs WHERE server_id = ${serverId} ORDER BY clan_tag NULLS FIRST, type`
    return { logs: enrich(rows), count: rows.length }
  }
  const body = record(input.body)
  const selected = [...new Set((Array.isArray(body.log_types) ? body.log_types : []).map((value) => text(value).trim()).filter(Boolean))]
  if (selected.length === 0) return yield* new InvalidRequest({ message: "No log types provided" })
  const tag = text(body.clan_tag).trim() === "" ? null : normalizeTag(body.clan_tag)
  for (const type of selected) {
    if (!logTypes.has(type)) return yield* new InvalidRequest({ message: `Unknown log type: ${type}` })
    if (type !== "reddit_feed" && tag === null) return yield* new InvalidRequest({ message: `clan_tag is required for log type: ${type}` })
    if (type === "reddit_feed" && tag !== null) return yield* new InvalidRequest({ message: `clan_tag is not allowed for log type: ${type}` })
  }
  if (tag !== null) yield* requireRow(yield* sql<{ tag: string }>`SELECT tag FROM server_clans WHERE server_id = ${serverId} AND tag = ${tag}`, "Clan not found on this server")
  const rows = yield* sql<LogRow>`UPDATE server_logs SET disabled = ${body.disabled}, disabled_reason = NULL, updated_at = now() WHERE server_id = ${serverId} AND clan_tag IS NOT DISTINCT FROM ${tag} AND type = ANY(${selected}) RETURNING clan_tag, type, webhook_id, thread_id, disabled, disabled_reason`
  yield* requireRow(rows, "Server log setup not found")
  return { message: "Server log state updated successfully", server_id: serverId, ...optional("clan_tag", tag), updated_log_types: selected, logs: enrich(rows) }
}))

const OwnedWebhook = Schema.Struct({ id: DecimalSnowflake, type: Schema.Number, channel_id: Schema.optionalKey(Schema.NullOr(DecimalSnowflake)), application_id: Schema.optionalKey(Schema.NullOr(DecimalSnowflake)), user: Schema.optionalKey(Schema.Struct({ id: DecimalSnowflake })) })
const logsMutationOperation = (input: DashboardServerOperationInput) => database("Server log configuration operation failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, discord = yield* DiscordApi, serverId = serverIdFor(input)
  const operation = input.endpoint.operationId, body = record(operation === "deleteServerLogs" ? input.query : input.body)
  const raw = operation === "deleteServerLogs" ? text(body.log_types).split(",") : Array.isArray(body.log_types) ? body.log_types : []
  const selected = [...new Set(raw.map((value) => text(value).trim()).filter(Boolean))]
  if (selected.length === 0) return yield* new InvalidRequest({ message: "No log types provided" })
  const tag = text(body.clan_tag).trim() === "" ? null : normalizeTag(body.clan_tag)
  for (const type of selected) {
    if (!logTypes.has(type)) return yield* new InvalidRequest({ message: `Unknown log type: ${type}` })
    if (type !== "reddit_feed" && tag === null) return yield* new InvalidRequest({ message: `clan_tag is required for log type: ${type}` })
    if (type === "reddit_feed" && tag !== null) return yield* new InvalidRequest({ message: `clan_tag is not allowed for log type: ${type}` })
  }
  let created: Effect.Success<ReturnType<typeof createLogWebhook>> | undefined
  const prepared = operation === "deleteServerLogs" ? undefined : yield* Effect.gen(function* () {
    const channelId = yield* discordDestinationId(body.channel_id, "channel_id")
    const threadId = body.thread_id === null || body.thread_id === undefined || body.thread_id === "" ? null : yield* discordDestinationId(body.thread_id, "thread_id")
    yield* validateDiscordDestination(serverId, channelId, threadId)
    const user = yield* decodeDiscord(RawBotUser, yield* discord.request("/users/@me"))
    const hooks = yield* decodeDiscord(Schema.Array(OwnedWebhook), yield* discord.request(`/guilds/${serverId}/webhooks`))
    const reusable = hooks.find((hook) => hook.type === 1 && hook.channel_id === channelId && (hook.user?.id === user.id || hook.application_id === user.id))
    const profile = reusable === undefined ? record(yield* profileOperation({ ...input, endpoint: dashboardEndpoints.botGuildProfile, body: {} })) : {}
    const avatar = reusable === undefined ? yield* discordWebhookAvatar(typeof profile.avatar_url === "string" ? profile.avatar_url : null) : undefined
    return { channelId, threadId, user, webhookId: reusable?.id, name: text(profile.name) || "ClashKing", avatar }
  })
  return yield* sql.withTransaction(Effect.gen(function* () {
    yield* lockServerDiscordResources(serverId)
    if (tag !== null) yield* requireRow(yield* sql<{ tag: string }>`SELECT tag FROM server_clans WHERE server_id = ${serverId} AND tag = ${tag}`, "Clan not found on this server")
    if (operation === "deleteServerLogs") {
      yield* sql`DELETE FROM server_logs WHERE server_id = ${serverId} AND clan_tag IS NOT DISTINCT FROM ${tag} AND type = ANY(${selected})`
      return { message: "Server logs deleted successfully", server_id: serverId, ...optional("clan_tag", tag), deleted_log_types: selected }
    }
    if (prepared === undefined) return yield* Effect.die("Missing log preparation")
    const { channelId, threadId, user } = prepared
    let webhookId = prepared.webhookId
    if (webhookId === undefined) {
      // Recheck only the creation race while serialized. All profile/avatar and
      // destination reads above happened without holding the server row lock.
      const hooks = yield* decodeDiscord(Schema.Array(OwnedWebhook), yield* discord.request(`/guilds/${serverId}/webhooks`))
      webhookId = hooks.find((hook) => hook.type === 1 && hook.channel_id === channelId && (hook.user?.id === user.id || hook.application_id === user.id))?.id
    }
    if (webhookId === undefined) {
      created = yield* createLogWebhook(serverId, channelId, prepared.name, prepared.avatar)
      webhookId = created.id
    }
    const logs: Array<LogRow & { readonly channel_id: string }> = []
    for (const type of selected) {
      const rows = yield* sql<LogRow>`INSERT INTO server_logs (server_id, clan_tag, type, webhook_id, thread_id) VALUES (${serverId}, ${tag}, ${type}, ${webhookId}, ${threadId})
        ON CONFLICT (server_id, clan_tag, type) DO UPDATE SET webhook_id = EXCLUDED.webhook_id, thread_id = EXCLUDED.thread_id, disabled = false, disabled_reason = NULL, updated_at = now() RETURNING clan_tag, type, webhook_id, thread_id, disabled, disabled_reason`
      logs.push({ ...(yield* requireRow(rows, "Server log could not be saved")), channel_id: channelId })
    }
    return { message: "Server logs updated successfully", server_id: serverId, ...optional("clan_tag", tag), updated_log_types: selected, logs: logs.map(({ clan_tag, ...row }) => ({ ...row, ...optional("clan_tag", clan_tag) })) }
  })).pipe(Effect.catch((failure) => created === undefined ? Effect.fail(failure) : compensateCreatedDiscordResource(created).pipe(Effect.andThen(Effect.fail(failure)))))
}))

const embedOperation = (input: DashboardServerOperationInput) => database("Server embed operation failed", Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient, serverId = serverIdFor(input), operation = input.endpoint.operationId
  if (operation === "serverEmbeds") {
    const items = yield* sql<{ name: string; data: unknown }>`SELECT name, data FROM server_custom_embeds WHERE server_id = ${serverId} ORDER BY name`
    return { items, total: items.length }
  }
  const body = record(input.body), name = operation === "createServerEmbed" ? text(body.name) : text(input.path.embedName)
  if (operation === "deleteServerEmbed") {
    const deleted = yield* sql<{ name: string }>`DELETE FROM server_custom_embeds WHERE server_id = ${serverId} AND name = ${name} RETURNING name`
    yield* requireRow(deleted, "Embed not found")
    return { message: "Embed deleted successfully" }
  }
  if (operation === "createServerEmbed") {
    const created = yield* sql<{ name: string }>`INSERT INTO server_custom_embeds (server_id, name, data, created_at, updated_at)
      VALUES (${serverId}, ${name}, ${JSON.stringify(body.data)}::jsonb, now(), now()) ON CONFLICT (server_id, name) DO NOTHING RETURNING name`
    if (created.length === 0) return yield* new Conflict({ message: "An embed with this name already exists" })
    return { message: "Embed created successfully" }
  }
  yield* sql`INSERT INTO server_custom_embeds (server_id, name, data, created_at, updated_at) VALUES (${serverId}, ${name}, ${JSON.stringify(body.data)}::jsonb, now(), now())
    ON CONFLICT (server_id, name) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`
  return { message: "Embed updated successfully" }
}))

/** Returns undefined only when this core module does not own the operation. */
export const executeDashboardServerCore = (
  input: DashboardServerOperationInput,
): Effect.Effect<unknown | undefined, ApiFailure, CoreEnvironment> => {
  const operation = input.endpoint.operationId
  if (dashboardServerActivityOperationIds.some((id) => id === operation)) return executeDashboardServerActivity(input)
  if (dashboardServerBaseOperationIds.some((id) => id === operation)) return executeDashboardServerBases(input)
  if (dashboardGiveawayOperationIds.some((id) => id === operation)) return executeDashboardGiveaways(input)
  if (dashboardReminderOperationIds.some((id) => id === operation)) return executeDashboardReminders(input)
  if (dashboardServerReadOperationIds.some((id) => id === operation)) return executeDashboardServerReads(input)
  if (dashboardAutoboardOperationIds.some((id) => id === operation)) return executeDashboardAutoboards(input, profileOperation({ ...input, endpoint: dashboardEndpoints.botGuildProfile, body: {} }))
  if (dashboardTicketOperationIds.some((id) => id === operation)) return executeDashboardTickets(input)
  if (["enableCountdown", "disableCountdown"].includes(operation)) return countdownMutationOperation(input)
  if (["saveServerLogs", "deleteServerLogs"].includes(operation)) return logsMutationOperation(input)
  if (operation === "searchBannedPlayers") return database("Banned player search failed", Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient, serverId = serverIdFor(input), query = text(input.query.query).trim()
    const rows = yield* sql<{ tag: string; name: string }>`SELECT player_tag AS tag, player_name AS name FROM server_bans WHERE server_id = ${serverId} AND (${query} = '' OR player_name ILIKE ${`%${query}%`}) ORDER BY player_name ASC LIMIT 25`
    return { items: rows.map((row) => ({ tag: row.tag, name: row.name || "Missing" })) }
  }))
  if (["serverEmbeds", "createServerEmbed", "updateServerEmbed", "deleteServerEmbed"].includes(operation)) return embedOperation(input)
  if (["serverLogs", "updateServerLogsState"].includes(operation)) return logsReadStateOperation(input)
  if (["serverCountdowns", "clanCountdowns"].includes(operation)) return countdownReadOperation(input)
  if (operation === "addServerClan") return addClanOperation(input)
  if (["dashboardCapabilities", "dashboardAccess", "updateDashboardAccess"].includes(operation)) return accessOperation(input)
  if (["dashboardGuilds", "dashboardGuild"].includes(operation)) return guildOperation(input)
  if (["serverDiscordTest", "serverChannels", "serverThreads", "discordRoles"].includes(operation)) return channelOperation(input)
  if (["botGuildProfile", "updateBotGuildProfile"].includes(operation)) return profileOperation(input)
  if (["serverPanel", "updateServerPanel"].includes(operation)) return panelOperation(input)
  if (["clanCategories", "createClanCategory", "renameClanCategory", "reorderClanCategories", "previewClanCategoryDelete", "deleteClanCategory"].includes(operation)) return categoryOperation(input)
  if (["serverRoles", "createServerRole", "updateServerRole", "deleteServerRole"].includes(operation)) return roleOperation(input)
  if (["serverSettings", "updateServerSettings", "roleSettings", "updateRoleSettings", "updateServerEmbedColor", "reactivateServer"].includes(operation)) return settingsOperation(input)
  if (["serverClansBasic", "serverClans", "serverClanSettings", "updateServerClanSettings", "removeServerClan"].includes(operation)) return clanOperation(input)
  return Effect.succeed(undefined)
}

export const dashboardServerCoreInternals = { categoryName, normalizeTag, roleValue }
