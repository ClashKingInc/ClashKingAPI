/**
 * @internal Reference-only schemas for deferred Discord bot/configuration work.
 *
 * These descriptors do not describe supported API routes. They remain available
 * solely to type-check preserved source/tests while a separate bot plan replaces
 * the former API-owned orchestration design. Do not add them to active endpoint
 * maps, consumer clients, generated OpenAPI, or deployment readiness checks.
 */
export * from "./persistent-runtime.js"
export * from "./roster-interaction.js"
export * from "./deferred-roster-board.js"
export {
  DashboardRosterMemberGroupsEndpoint,
  DashboardCreateRosterMemberGroupEndpoint,
  DashboardUpdateRosterMemberGroupEndpoint,
  DashboardDeleteRosterMemberGroupEndpoint,
  DashboardReplaceRosterMemberGroupsEndpoint,
  RosterMemberGroup,
  RosterMemberGroupSettingsRequest,
  rosterConfigurationEndpoints,
} from "./roster-configuration.js"

import { Schema } from "effect"
import { DecimalSnowflake } from "./discord.js"
import { defineEndpoint, NoPathParams, NoQuery } from "./endpoint.js"
import { ErrorResponse } from "./errors.js"
import { RuntimeUUID } from "./persistent-runtime.js"

/** @internal Deferred ticket notification orchestration, not an active API route. */
export const TicketMessageEventEndpoint = defineEndpoint({
  operationId: "ticketMessageEvent", method: "POST", path: "/v2/runtime/tickets/message-events", auth: "bot",
  pathParams: NoPathParams, query: NoQuery, body: Schema.Struct({
    id: DecimalSnowflake, guild_id: DecimalSnowflake, channel_id: DecimalSnowflake, author_id: DecimalSnowflake, application_id: DecimalSnowflake,
  }), bodyMode: "json", response: Schema.Union([
    Schema.Struct({ outcome: Schema.Literal("ignored") }),
    Schema.Struct({ outcome: Schema.Literal("accepted"), operationId: RuntimeUUID }),
  ]), responseMode: "json", successStatus: 200,
  summary: "Validate an ID-only gateway ticket message event and journal staff notification effects",
  errors: [400, 401, 403, 409, 413, 415, 429, 503].map((status) => ({ status, body: ErrorResponse })),
})
