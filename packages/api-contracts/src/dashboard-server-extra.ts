import { Schema } from "effect"

import { DashboardServerPath, Giveaway } from "./dashboard-server.js"
import { DecimalSnowflake } from "./discord.js"
import { defineEndpoint, NoBody, NoQuery } from "./endpoint.js"

const OptionalString = Schema.optionalKey(Schema.String)
const OptionalNumber = Schema.optionalKey(Schema.Number)
const NullableString = Schema.NullOr(Schema.String)
const OptionalNullableNumber = Schema.optionalKey(Schema.NullOr(Schema.Number))
const OptionalNullableString = Schema.optionalKey(NullableString)

export const ServerGiveawayEndpoint = defineEndpoint({
  auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
  operationId: "serverGiveaway", path: "/v2/server/:serverId/giveaways/:giveawayId",
  pathParams: Schema.Struct({ serverId: DecimalSnowflake, giveawayId: Schema.String }),
  query: NoQuery, response: Giveaway, responseMode: "json", successStatus: 200,
  summary: "Get one server giveaway",
})

export const AutoBoardSchedule = Schema.Struct({
  kind: Schema.Literals(["daily", "weekdays", "day_of_month"]),
  timeOfDay: Schema.String,
  weekdays: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.Number))),
  dayOfMonth: OptionalNullableNumber,
})
export const AutoBoardWrite = Schema.Struct({
  boardType: Schema.String,
  targetScope: Schema.Literals(["family", "custom"]),
  targets: Schema.Array(Schema.String),
  deliveryMode: Schema.Literals(["refresh", "send"]),
  channelId: Schema.String,
  threadId: Schema.optionalKey(NullableString),
  enabled: Schema.Boolean,
  intervalMinutes: OptionalNullableNumber,
  schedule: Schema.optionalKey(Schema.NullOr(AutoBoardSchedule)),
})
export const AutoBoardConfig = Schema.Struct({
  id: Schema.String,
  boardType: Schema.String,
  targetKind: Schema.String,
  targetScope: Schema.Literals(["family", "custom"]),
  targets: Schema.Array(Schema.String),
  deliveryMode: Schema.Literals(["refresh", "send"]),
  channelId: NullableString,
  channelDeleted: Schema.Boolean,
  threadId: NullableString,
  messageId: NullableString,
  enabled: Schema.Boolean,
  intervalMinutes: Schema.NullOr(Schema.Number),
  schedule: Schema.NullOr(AutoBoardSchedule),
  nextRunAt: NullableString,
  lastRunAt: NullableString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export const AutoBoardCapability = Schema.Struct({
  boardType: Schema.String,
  label: Schema.String,
  targetKind: Schema.String,
  minTargets: Schema.Number,
  maxTargets: Schema.Number,
  allowedScopes: Schema.Array(Schema.Literals(["family", "custom"])),
  allowedModes: Schema.Array(Schema.Literals(["refresh", "send"])),
  refreshInterval: Schema.NullOr(Schema.Struct({
    minMinutes: Schema.Number,
    maxMinutes: Schema.Number,
    defaultMinutes: Schema.Number,
  })),
  uiCapabilities: Schema.Array(Schema.String),
})

export const DiscordStatus = Schema.Struct({
  status: Schema.Literals(["success", "error"]),
  message: Schema.String,
  bot_token_present: Schema.Boolean,
  guild_name: OptionalString,
  status_code: OptionalString,
})
export const ServerPlayerRanking = Schema.Struct({
  player_tag: Schema.String,
  player_name: Schema.String,
  townhall_level: OptionalNullableNumber,
  clan_tag: Schema.String,
  clan_name: Schema.String,
  trophies: OptionalNullableNumber,
  global_rank: OptionalNullableNumber,
  local_rank: OptionalNullableNumber,
  location_id: OptionalNullableString,
  country_code: OptionalNullableString,
  country_name: OptionalNullableString,
  legend_trophies: OptionalNullableNumber,
})
export const ServerClanRanking = Schema.Struct({
  clan_tag: Schema.String,
  clan_name: Schema.String,
  global_rank: OptionalNullableNumber,
  local_rank: OptionalNullableNumber,
  country_code: OptionalNullableString,
  country_name: OptionalNullableString,
  clan_level: OptionalNullableNumber,
  clan_points: OptionalNullableNumber,
  member_count: OptionalNullableNumber,
  capital_points: OptionalNullableNumber,
})

export const ServerDiscordTestEndpoint = defineEndpoint({
    auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
    operationId: "serverDiscordTest", path: "/v2/server/:serverId/discord-test",
    pathParams: DashboardServerPath, query: NoQuery, response: DiscordStatus,
    responseMode: "json", successStatus: 200, summary: "Test Discord API access",
})
export const AutoboardCapabilitiesEndpoint = defineEndpoint({
    auth: "server-manager-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
    operationId: "autoboardCapabilities", path: "/v2/server/:serverId/autoboards/capabilities",
    pathParams: DashboardServerPath, query: NoQuery,
    response: Schema.Struct({ boardTypes: Schema.Array(AutoBoardCapability) }),
    responseMode: "json", successStatus: 200, summary: "Get autoboard capabilities",
})
export const ServerAutoboardsEndpoint = defineEndpoint({
    auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
    operationId: "serverAutoboards", path: "/v2/server/:serverId/autoboards",
    pathParams: DashboardServerPath, query: NoQuery,
    response: Schema.Struct({ items: Schema.Array(AutoBoardConfig), total: Schema.Number,
      refreshCount: Schema.Number, sendCount: Schema.Number, limit: Schema.Number }),
    responseMode: "json", successStatus: 200, summary: "Get server autoboards",
})
export const CreateAutoboardEndpoint = defineEndpoint({
    auth: "server-write", errors: [], body: AutoBoardWrite, bodyMode: "json", method: "POST",
    operationId: "createAutoboard", path: "/v2/server/:serverId/autoboards",
    pathParams: DashboardServerPath, query: NoQuery,
    response: Schema.Struct({ item: AutoBoardConfig }), responseMode: "json", successStatus: 201,
    summary: "Create an autoboard",
})
export const ReplaceAutoboardEndpoint = defineEndpoint({
    auth: "server-write", errors: [], body: AutoBoardWrite, bodyMode: "json", method: "PUT",
    operationId: "replaceAutoboard", path: "/v2/server/:serverId/autoboards/:autoboardId",
    pathParams: Schema.Struct({ serverId: Schema.String, autoboardId: Schema.String }), query: NoQuery,
    response: Schema.Struct({ item: AutoBoardConfig }), responseMode: "json", successStatus: 200,
    summary: "Replace an autoboard",
})
export const DeleteAutoboardEndpoint = defineEndpoint({
    auth: "server-write", errors: [], body: NoBody, bodyMode: "none", method: "DELETE",
    operationId: "deleteAutoboard", path: "/v2/server/:serverId/autoboards/:autoboardId",
    pathParams: Schema.Struct({ serverId: Schema.String, autoboardId: Schema.String }), query: NoQuery,
    response: Schema.Struct({ id: Schema.String, deleted: Schema.Literal(true) }),
    responseMode: "json", successStatus: 200, summary: "Delete an autoboard",
})
export const ServerLeaderboardsEndpoint = defineEndpoint({
    auth: "server-read", errors: [], body: NoBody, bodyMode: "none", method: "GET",
    operationId: "serverLeaderboards", path: "/v2/server/:serverId/leaderboards",
    pathParams: DashboardServerPath,
    query: Schema.Struct({ limit_players: OptionalNumber, limit_clans: OptionalNumber, sort_by: OptionalString }),
    response: Schema.Struct({ server_id: DecimalSnowflake, total_players: Schema.Number,
      total_clans: Schema.Number, players: Schema.Array(ServerPlayerRanking), clans: Schema.Array(ServerClanRanking) }),
    responseMode: "json", successStatus: 200, summary: "Get server leaderboards",
})
